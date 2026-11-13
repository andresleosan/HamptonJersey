// Isolated local D1 only; fixtures do not authorize or contact any real source.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync,readdirSync } from 'node:fs';
import { createInventoryRun,claimSourcePage } from '../../server/market-inventory-store.js';
import { ingestManualObservationPage } from '../../server/market-observation-ingest.js';

const require=createRequire(import.meta.url);
const {Miniflare,convertV4MiniflareOptions}=require('miniflare');
const {unstable_splitSqlQuery}=require('wrangler');
const migrations=new URL('../../migrations/',import.meta.url);
const actor='admin@example.test',channel='manual',manifest='fixture-directory';
const clock=()=>new Date(), stamp=()=>new Date(Date.now()-3000).toISOString();

function instrument(DB) {
  let before=null;
  const wrap=(raw,sql)=>({sql,raw,bind:(...args)=>wrap(raw.bind(...args),sql),
    first:(...args)=>raw.first(...args),all:(...args)=>raw.all(...args),run:(...args)=>raw.run(...args)});
  return {db:{prepare:sql=>wrap(DB.prepare(sql),sql),async batch(statements) {
    if(before && statements.some(s=>s.sql.includes('INSERT INTO market_pages'))) {const action=before;before=null;await action();}
    return DB.batch(statements.map(statement=>statement.raw));
  }},before:action=>{before=action;}};
}
function page(source) {
  const at=stamp();
  return {page_key:'page-one',cursor:null,next_cursor:'page-two',exhausted:false,observed_at:at,records:[{
    external_key:`${source}-rent`,source_at:at,listing_url:`https://source.example.test/properties/${source}`,
    observation:{country_code:'JE',territory_evidence:'fixture:territory',operation:'rent',observed_at:at,
      financial_terms:[{kind:'rent',amount_minor:2400001,currency:'GBP',period:'year',raw_text:'Synthetic rent',evidence_ref:'fixture:rent'}]},
  }]};
}

test('D1 local: guarded normalization, policy revocation, actor removal and rollback',async()=>{
  const mf=new Miniflare(convertV4MiniflareOptions({modules:true,
    script:'export default {fetch(){return new Response("fixture")}}',compatibilityDate:'2025-10-01',
    host:'127.0.0.1',port:0,d1Databases:{DB:'bus09-ingest-synthetic'}}));
  try {
    const DB=await mf.getD1Database('DB');
    for(const file of readdirSync(migrations).filter(name=>name.endsWith('.sql')).sort()) {
      const statements=unstable_splitSqlQuery(readFileSync(new URL(file,migrations),'utf8'));
      if(statements.length)await DB.batch(statements.map(sql=>DB.prepare(sql)));
    }
    const now=new Date().toISOString();
    await DB.prepare('INSERT INTO admins(email,added_by,added_at) VALUES(?,?,?)').bind(actor,'fixture',now).run();
    await DB.prepare("INSERT INTO market_directory_manifests(revision,sha256,accepted_at,reviewer_ref,status) VALUES(?,?,?,'fixture','accepted')")
      .bind(manifest,'a'.repeat(64),now).run();
    for(const source of ['good','revoked','actor-removed','rollback']) await DB.prepare(`INSERT INTO market_sources
      (source_ref,channel_id,directory_revision,source_kind,source_class,access_status,method,policy_version,
       evidence_ref,retention_ref,reviewed_at,review_due_at,allowed_hosts,allowed_paths)
      VALUES(?,?,?,'external','general','manual_only','manual',1,'fixture-evidence','fixture-retention',
       '2000-01-01T00:00:00.000Z','2999-01-01T00:00:00.000Z','["source.example.test"]','["/properties"]')`)
      .bind(source,channel,manifest).run();
    const env={DB},run=await createInventoryRun(env,{kind:'initial',manifest_revision:manifest,operation_id:crypto.randomUUID()},actor,clock);
    const lease=async source=>claimSourcePage(env,{run_id:run.id,source_ref:source,channel_id:channel},clock);
    const first=await lease('good'), data=page('good');
    assert.equal((await ingestManualObservationPage(env,{lease:first,page:data},actor,clock)).accepted,true);
    const stored=await DB.prepare("SELECT normalized_json FROM market_observations WHERE source_ref='good'").first();
    assert.deepEqual(JSON.parse(stored.normalized_json).monthly_rent_exact,{numerator_minor:'2400001',denominator:12,currency:'GBP'});
    assert.equal((await ingestManualObservationPage(env,{lease:first,page:data},actor,clock)).replayed,true);

    const revoked=await lease('revoked'),wrapped=instrument(DB);
    wrapped.before(()=>DB.prepare("UPDATE market_sources SET access_status='denied',policy_version=policy_version+1 WHERE source_ref='revoked'").run());
    await assert.rejects(()=>ingestManualObservationPage({DB:wrapped.db},{lease:revoked,page:page('revoked')},actor,clock),e=>e.status===409);
    assert.equal((await DB.prepare("SELECT COUNT(*) n FROM market_pages WHERE source_ref='revoked'").first()).n,0);
    assert.equal((await DB.prepare("SELECT cursor FROM market_source_runs WHERE run_id=? AND source_ref='revoked'").bind(run.id).first()).cursor,null);

    const removed=await lease('actor-removed');
    wrapped.before(()=>DB.prepare('DELETE FROM admins WHERE email=?').bind(actor).run());
    await assert.rejects(()=>ingestManualObservationPage({DB:wrapped.db},{lease:removed,page:page('actor-removed')},actor,clock),e=>e.status===409);
    assert.equal((await DB.prepare("SELECT COUNT(*) n FROM market_pages WHERE source_ref='actor-removed'").first()).n,0);
    await DB.prepare('INSERT INTO admins(email,added_by,added_at) VALUES(?,?,?)').bind(actor,'fixture',new Date().toISOString()).run();

    const rollback=await lease('rollback');
    await DB.prepare("CREATE TRIGGER fixture_outbox_failure BEFORE INSERT ON market_change_outbox BEGIN SELECT RAISE(ABORT,'fixture'); END").run();
    await assert.rejects(()=>ingestManualObservationPage(env,{lease:rollback,page:page('rollback')},actor,clock));
    assert.equal((await DB.prepare("SELECT COUNT(*) n FROM market_pages WHERE source_ref='rollback'").first()).n,0);
    assert.equal((await DB.prepare("SELECT COUNT(*) n FROM market_observations WHERE source_ref='rollback'").first()).n,0);
    assert.equal((await DB.prepare("SELECT cursor FROM market_source_runs WHERE run_id=? AND source_ref='rollback'").bind(run.id).first()).cursor,null);
  } finally { await mf.dispose(); }
});
