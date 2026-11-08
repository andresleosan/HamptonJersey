import { DurableObject } from 'cloudflare:workers';
import { emptyState, applyCommand, board, assertAuthority, current } from './state.mjs';
import { jsonError, identifier, fail } from './errors.mjs';
import { authorizedTarget } from './auth.mjs';
import { importCanonicalCatalog, verifyIntegrated } from './canonical.mjs';
import { fingerprintOf, pruneHistory } from './retention.mjs';
export class TeamCoordinator extends DurableObject {
  constructor(ctx,env) {
    super(ctx,env);
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS project (id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL)');
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS catalog (id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL)');
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS operations (actor TEXT NOT NULL, endpoint TEXT NOT NULL, operation_id TEXT NOT NULL, fingerprint TEXT NOT NULL, result TEXT, claim_id TEXT, generation INTEGER, session_id TEXT, created_at INTEGER NOT NULL, PRIMARY KEY(actor,endpoint,operation_id))');
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, actor TEXT NOT NULL, endpoint TEXT NOT NULL, operation_id TEXT NOT NULL, revision INTEGER NOT NULL, details TEXT)');
  }
  load() {
    const rows=this.ctx.storage.sql.exec('SELECT data FROM project WHERE id=1').toArray();
    const state=rows.length?JSON.parse(rows[0].data):emptyState();
    const catalog=this.ctx.storage.sql.exec('SELECT data FROM catalog WHERE id=1').toArray();
    state.catalog=catalog.length?JSON.parse(catalog[0].data):null;return state;
  }
  getBoard() {return board(this.load());}
  replay(actor,path,body,fingerprint,now) {
    const row=this.ctx.storage.sql.exec('SELECT * FROM operations WHERE actor=? AND endpoint=? AND operation_id=?',actor.actorId,path,body.operationId).toArray()[0];
    if(!row)return null;
    if(row.fingerprint!==fingerprint)fail(409,'IDEMPOTENCY_CONFLICT','Operation ID was already used for another payload.');
    const state=this.load();assertAuthority(state,actor,path,body,now);
    if(path==='/v1/claims') {
      const claim=state.claims.find(c=>c.id===row.claim_id);
      if(!claim||!current(claim)||claim.generation!==row.generation||claim.actorId!==actor.actorId||claim.sessionId!==row.session_id||claim.expiresAt<=now)fail(409,'GENERATION_REVOKED','Original claim authority is no longer current.');
    }
    if(path==='/v1/release/acquire'&&(!state.release||state.release.claimId!==row.claim_id||state.release.generation!==row.generation))fail(409,'RELEASE_NOT_OWNER','Original publication turn is no longer held.');
    if(row.result===null)fail(409,'OPERATION_EXPIRED','Operation replay window expired; inspect the board before issuing another command.');
    const result=JSON.parse(row.result);
    const priorClaim=result.body?.claim;
    if(priorClaim) {
      const latest=state.claims.find(c=>c.id===priorClaim.id);
      if(!latest||latest.mode!==priorClaim.mode||latest.status!==priorClaim.status||latest.submission?.headSha!==priorClaim.submission?.headSha)fail(409,'OPERATION_SUPERSEDED','Claim authority changed after this operation; inspect the current board.');
    }
    const priorRelease=result.body?.release;
    if(priorRelease&&(!state.release||state.release.id!==priorRelease.id||state.release.sha!==priorRelease.sha||state.release.status!==priorRelease.status))fail(409,'OPERATION_SUPERSEDED','Publication authority changed after this operation; inspect the current board.');
    return result;
  }
  async command(actor,path,body) {
    try {
      identifier(body?.operationId,'operationId');
      if(!actor||!['executor','coordinator'].includes(actor.role))fail(403,'READ_ONLY','Service executor identity required.');
      const fingerprint=await fingerprintOf(body);const prior=this.replay(actor,path,body,fingerprint,Date.now());if(prior)return prior;
      const snapshot=this.load();assertAuthority(snapshot,actor,path,body,Date.now());
      const prepared={};
      if(path==='/v1/catalog'||path==='/v1/evidence') {
        if(actor.role!=='coordinator')fail(403,'COORDINATOR_REQUIRED','Coordinator identity required.');
      }
      if(path==='/v1/catalog')prepared.catalog=await importCanonicalCatalog(this.env,body.sha);
      if(path==='/v1/evidence'&&body.kind==='integrated')prepared.integratedSha=await verifyIntegrated(this.env,body.sha);
      if(path.endsWith('/handoff'))prepared.authorizedTarget=authorizedTarget(this.env,body.target);
      if(path==='/v1/release/finish'&&body.outcome==='published') {
        try {prepared.catalog=await importCanonicalCatalog(this.env,body.sha);prepared.publishedSha=body.sha;}
        catch(error){if(error.status===503)prepared.synchronizationError=true;else throw error;}
      }
      return this.ctx.storage.transactionSync(()=>{
        const retried=this.replay(actor,path,body,fingerprint,Date.now());if(retried)return retried;
        const state=this.load();const previousRelease=state.release;const result=applyCommand(state,actor,path,body,prepared);
        const response={status:200,body:result};
        const {catalog,...runtime}=state;
        this.ctx.storage.sql.exec('INSERT INTO project(id,data) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data',JSON.stringify(runtime));
        if(path==='/v1/catalog'||(path==='/v1/release/finish'&&body.outcome==='published'&&!state.release))this.ctx.storage.sql.exec('INSERT INTO catalog(id,data) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data',JSON.stringify(catalog));
        const claim=result.claim||state.claims.find(c=>c.id===body.claimId||c.id===state.release?.claimId);
        this.ctx.storage.sql.exec('INSERT INTO operations(actor,endpoint,operation_id,fingerprint,result,claim_id,generation,session_id,created_at) VALUES(?,?,?,?,?,?,?,?,?)',actor.actorId,path,body.operationId,fingerprint,JSON.stringify(response),claim?.id||null,claim?.generation||null,claim?.sessionId||null,Date.now());
        this.ctx.storage.sql.exec('INSERT INTO events(at,actor,endpoint,operation_id,revision,details) VALUES(?,?,?,?,?,?)',Date.now(),actor.actorId,path,body.operationId,state.revision,path.startsWith('/v1/release/')?JSON.stringify({claimId:body.claimId||previousRelease?.claimId,releaseId:previousRelease?.id||state.release?.id,sha:body.sha||state.release?.sha,outcome:body.outcome||null,evidence:body.evidence||null}):null);
        pruneHistory(this.ctx.storage.sql,Date.now());
        return response;
      });
    } catch(error) {return jsonError(error);}
  }
}
