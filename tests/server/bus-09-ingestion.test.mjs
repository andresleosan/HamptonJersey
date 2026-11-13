import test from 'node:test';
import assert from 'node:assert/strict';
import { makeDb } from './helpers.mjs';
import { createInventoryRun, claimSourcePage, commitObservationPage } from '../../server/market-inventory-store.js';
import { prepareManualObservationPage } from '../../server/market-manual-contract.js';

let ingest;
try { ({ingestManualObservationPage:ingest}=await import('../../server/market-observation-ingest.js')); }
catch (error) { if(error.code!=='ERR_MODULE_NOT_FOUND') throw error; }
const required=()=>assert.equal(typeof ingest,'function','guarded normalized ingestion is required');
const actor='admin@example.test', source='fixture-source', channel='manual', manifest='fixture-directory';
const op=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const sql=(db,query,...args)=>db.prepare(query).bind(...args).run();
const count=async(db,table)=>(await db.prepare(`SELECT COUNT(*) n FROM ${table}`).first()).n;
const clock=()=>new Date();
const stamp=offset=>new Date(Date.now()+offset).toISOString();

async function setup() {
  const db=makeDb();
  await sql(db,`INSERT INTO market_directory_manifests(revision,sha256,accepted_at,reviewer_ref,status)
    VALUES(?,?,?,'fixture-review','accepted')`,manifest,'a'.repeat(64),stamp(-10000));
  await sql(db,`INSERT INTO market_sources(source_ref,channel_id,directory_revision,source_kind,source_class,
    access_status,method,policy_version,evidence_ref,retention_ref,reviewed_at,review_due_at,allowed_hosts,allowed_paths)
    VALUES(?,?,?,'external','general','manual_only','manual',1,'fixture-evidence','fixture-retention',
      '2000-01-01T00:00:00.000Z','2999-01-01T00:00:00.000Z','["source.example.test"]','["/properties"]')`,source,channel,manifest);
  const run=await createInventoryRun({DB:db},{kind:'initial',manifest_revision:manifest,operation_id:op(1)},actor,clock);
  const lease=await claimSourcePage({DB:db},{run_id:run.id,source_ref:source,channel_id:channel},clock);
  return {db,run,lease};
}
const term=(over={})=>({kind:'rent',amount_minor:2400001,currency:'GBP',period:'year',
  raw_text:'Synthetic annual rent',evidence_ref:'fixture:rent',...over});
function page(over={}) {
  const at=stamp(-3000);
  return {page_key:'page-1',cursor:null,next_cursor:'page-2',exhausted:false,observed_at:at,records:[{
    external_key:'listing-1-rent',source_at:at,listing_url:'https://source.example.test/properties/one',
    observation:{country_code:'JE',territory_evidence:'fixture:territory',operation:'rent',observed_at:at,
      title:'Synthetic unit',bedrooms:0,financial_terms:[term()]},
  }],...over};
}
const commit=(db,lease,data,by=actor)=>ingest({DB:db},{lease,page:data},by,clock);
async function nextLease(db,run) {
  await sql(db,"UPDATE market_source_activity SET last_acquired_at='2000-01-01T00:00:00.000Z'");
  await sql(db,"UPDATE market_source_runs SET next_due='2000-01-01T00:00:00.000Z' WHERE run_id=?",run.id);
  return claimSourcePage({DB:db},{run_id:run.id,source_ref:source,channel_id:channel},clock);
}
const noWrites=async db=>{
  for(const table of ['market_pages','market_observations','market_change_outbox']) assert.equal(await count(db,table),0,table);
};

test('a manual observation is normalized and committed atomically with original evidence and exact rent',async()=>{
  required();const {db,lease}=await setup(),data=page(),before=structuredClone(data);
  data.records[0].observation.financial_terms.push(term({kind:'premium',amount_minor:500000,period:'sale'}));
  before.records[0].observation.financial_terms.push(term({kind:'premium',amount_minor:500000,period:'sale'}));
  await sql(db,"INSERT INTO market_properties(id,created_at,created_by) VALUES('human-property',?,?)",stamp(-10000),actor);
  const human=await db.prepare("SELECT * FROM market_properties WHERE id='human-property'").first();
  assert.deepEqual(await commit(db,lease,data),{accepted:true,replayed:false,next_cursor:'page-2'});
  assert.deepEqual(data,before);
  const observation=await db.prepare('SELECT source_ref,channel_id,external_key,source_at,raw_json,normalized_json FROM market_observations').first();
  const raw=JSON.parse(observation.raw_json),normalized=JSON.parse(observation.normalized_json);
  assert.equal(observation.source_ref,source);assert.equal(observation.channel_id,channel);
  assert.equal(observation.external_key,'listing-1-rent');assert.equal(observation.source_at,data.records[0].source_at);
  assert.equal(raw.listing_url,data.records[0].listing_url);
  assert.deepEqual(raw.observation.financial_terms,data.records[0].observation.financial_terms);
  assert.deepEqual(normalized.financial_terms,data.records[0].observation.financial_terms);
  assert.equal(normalized.fields.bedrooms,0);assert.equal(normalized.fields.pets,null);
  assert.equal(normalized.present_fields.includes('pets'),false);
  assert.equal(normalized.monthly_rent_minor,200000);
  assert.deepEqual(normalized.monthly_rent_exact,{numerator_minor:'2400001',denominator:12,currency:'GBP'});
  assert.equal(await count(db,'market_pages'),1);assert.equal(await count(db,'market_change_outbox'),1);
  assert.deepEqual(await db.prepare("SELECT * FROM market_properties WHERE id='human-property'").first(),human);
  assert.equal(await count(db,'market_identity_observations'),0);
  assert.equal(await count(db,'market_listings'),0);
});

test('unverified actor, forged authority, unsafe URL and unknown scope do not write',async()=>{
  required();const {db,lease}=await setup(),data=page();
  await assert.rejects(commit(db,lease,data,'not-an-admin@example.test'),e=>e.status===409);
  for(const url of ['http://source.example.test/properties/one','https://user:pass@source.example.test/properties/one',
    'https://source.example.test/properties/one?token=fixture','https://source.example.test/properties/one#fragment',
    'https://source.example.test/properties-evil/one','https://other.example.test/properties/one',
    'https://source.example.test/properties/%2e%2e/private','https://127.0.0.1/properties/one']) {
    const altered=structuredClone(data);altered.records[0].listing_url=url;
    await assert.rejects(commit(db,lease,altered),e=>e.status===400||e.status===409,url);
  }
  for(const key of ['normalized','source_authorized','policy_version','contact_email','private_notes']) {
    const altered=structuredClone(data);altered.records[0][key]='fixture';
    await assert.rejects(commit(db,lease,altered),e=>e.status===400,key);
  }
  for(const key of ['contact_email','private_notes','description']) {
    const altered=structuredClone(data);altered.records[0].observation[key]='PRIVATE_SYNTHETIC_MARKER';
    await assert.rejects(commit(db,lease,altered),e=>e.status===400 && !e.message.includes('PRIVATE_SYNTHETIC_MARKER'),key);
  }
  const absent=structuredClone(data);delete absent.records[0].observation.territory_evidence;
  await assert.rejects(commit(db,lease,absent),e=>e.status===400);
  const secret=structuredClone(data);secret.records[0].observation.territory_evidence='https://example.test/?token=fixture';
  await assert.rejects(commit(db,lease,secret),e=>e.status===400);
  await noWrites(db);
});

test('the storage boundary rejects a caller-supplied normalized value that differs from the raw observation',async()=>{
  required();const {db,lease}=await setup(),prepared=structuredClone(prepareManualObservationPage(page()));
  prepared.records[0].normalized.financial_terms[0].amount_minor=1;
  const admin=await db.prepare('SELECT added_at FROM admins WHERE email=?').bind(actor).first();
  const guard={actor_added_at:admin.added_at,allowed_hosts:'["source.example.test"]',allowed_paths:'["/properties"]'};
  await assert.rejects(commitObservationPage({DB:db},{lease,page:prepared,manual_guard:guard},actor,clock),e=>e.status===400);
  await noWrites(db);
});

test('caller mutations after invocation cannot alter the page that was validated and hashed',async()=>{
  required();const {db,lease}=await setup(),data=page(),original=data.records[0].observation.financial_terms[0].amount_minor;
  const pending=commit(db,lease,data);
  data.records[0].listing_url='https://other.example.test/private';
  data.records[0].observation.financial_terms[0].amount_minor=1;
  await pending;
  const stored=await db.prepare('SELECT raw_json,normalized_json FROM market_observations').first();
  assert.equal(JSON.parse(stored.raw_json).listing_url,'https://source.example.test/properties/one');
  assert.equal(JSON.parse(stored.normalized_json).financial_terms[0].amount_minor,original);
});

test('a policy change or actor removal immediately before commit rejects the entire page',async()=>{
  required();
  for(const change of ['policy','actor']) {
    const {db,lease}=await setup(),batch=db.batch.bind(db);let injected=false;
    db.batch=async statements=>{
      if(!injected && statements.some(s=>s.sql.includes('INSERT INTO market_pages'))) {
        injected=true;
        if(change==='policy')await sql(db,"UPDATE market_sources SET allowed_paths='[\"/elsewhere\"]',policy_version=policy_version+1");
        else await sql(db,'DELETE FROM admins WHERE email=?',actor);
      }
      return batch(statements);
    };
    await assert.rejects(commit(db,lease,page()),e=>e.status===409,change);
    assert.equal(injected,true);await noWrites(db);
    assert.equal((await db.prepare('SELECT cursor FROM market_source_runs WHERE run_id=?').bind(lease.run_id).first()).cursor,null);
  }
});

test('a replay is idempotent but cannot bypass a later source revocation',async()=>{
  required();const {db,lease}=await setup(),data=page();
  assert.equal((await commit(db,lease,data)).replayed,false);
  assert.equal((await commit(db,lease,data)).replayed,true);
  await assert.rejects(commit(db,lease,data,'colleague@example.test'),e=>e.status===409);
  await sql(db,"UPDATE market_sources SET access_status='denied',policy_version=policy_version+1");
  await assert.rejects(commit(db,lease,data),e=>e.status===409);
  assert.equal(await count(db,'market_pages'),1);assert.equal(await count(db,'market_observations'),1);
});

test('revocation between replay preflight and receipt read is checked in the replay transaction',async()=>{
  required();const {db,lease}=await setup(),data=page();await commit(db,lease,data);
  const batch=db.batch.bind(db);let injected=false;
  db.batch=async statements=>{
    if(!injected && statements.some(s=>s.sql.includes('FROM market_pages') && s.sql.includes('content_sha256'))) {
      injected=true;await sql(db,"UPDATE market_sources SET access_status='denied',policy_version=policy_version+1");
    }
    return batch(statements);
  };
  await assert.rejects(commit(db,lease,data),e=>e.status===409);
  assert.equal(injected,true);assert.equal(await count(db,'market_pages'),1);assert.equal(await count(db,'market_observations'),1);
});

test('a lost response after commit is reconciled without a duplicate observation',async()=>{
  required();const {db,lease}=await setup(),data=page(),batch=db.batch.bind(db);let injected=false;
  db.batch=async statements=>{
    const result=await batch(statements);
    if(!injected && statements.some(s=>s.sql.includes('INSERT INTO market_pages'))) {
      injected=true;throw new Error('synthetic lost response');
    }
    return result;
  };
  assert.deepEqual(await commit(db,lease,data),{accepted:true,replayed:true,next_cursor:'page-2'});
  assert.equal(injected,true);assert.equal(await count(db,'market_pages'),1);assert.equal(await count(db,'market_observations'),1);
});

test('a changed URL or operation cannot silently reuse an existing external key',async()=>{
  required();
  for(const change of ['url','operation']) {
    const {db,run,lease}=await setup();await commit(db,lease,page());
    const next=await nextLease(db,run),data=page({page_key:'page-2',cursor:'page-2',next_cursor:'page-3'});
    if(change==='url')data.records[0].listing_url='https://source.example.test/properties/another';
    else data.records[0].observation.operation='sale';
    await assert.rejects(commit(db,next,data),e=>e.status===409,change);
    assert.equal(await count(db,'market_pages'),1);assert.equal(await count(db,'market_observations'),1);
    assert.equal(await count(db,'market_change_outbox'),1);
  }
});

test('a later observation of identical facts does not emit a false material change',async()=>{
  required();const {db,run,lease}=await setup(),first=page();await commit(db,lease,first);
  const next=await nextLease(db,run),second=structuredClone(first),later=stamp(-1000);
  second.page_key='page-2';second.cursor='page-2';second.next_cursor='page-3';second.observed_at=later;
  second.records[0].source_at=later;second.records[0].observation.observed_at=later;
  await commit(db,next,second);
  assert.equal(await count(db,'market_observations'),2);
  assert.equal(await count(db,'market_change_outbox'),1);
  const thirdLease=await nextLease(db,run),third=structuredClone(second);
  third.page_key='page-3';third.cursor='page-3';third.next_cursor='page-4';third.records[0].observation.financial_terms[0].amount_minor++;
  await commit(db,thirdLease,third);
  assert.equal(await count(db,'market_change_outbox'),2);
});

test('only the exact declared manual scope may be used and the page cannot claim a completed census',async()=>{
  required();
  for(const mutation of [
    "UPDATE market_sources SET allowed_hosts='[]',policy_version=policy_version+1",
    "UPDATE market_sources SET method='http',access_status='allowed',policy_version=policy_version+1",
    "UPDATE market_sources SET access_status='denied',policy_version=policy_version+1",
  ]) {
    const {db,lease}=await setup();await sql(db,mutation);
    await assert.rejects(commit(db,lease,page()),e=>e.status===409);
    await noWrites(db);
  }
  const {db,lease}=await setup();
  await assert.rejects(commit(db,lease,page({exhausted:true,next_cursor:null})),e=>e.status===400||e.status===409);
  await noWrites(db);
});

test('a caller cannot forge a new policy version or a revoked manifest into an old lease',async()=>{
  required();
  for(const change of ['version','manifest']) {
    const {db,lease}=await setup();
    if(change==='version') {
      await sql(db,"UPDATE market_sources SET policy_version=policy_version+1");
      lease.policy_version++;
    } else await sql(db,"UPDATE market_directory_manifests SET status='revoked' WHERE revision=?",manifest);
    await assert.rejects(commit(db,lease,page()),e=>e.status===409);
    await noWrites(db);
  }
});

test('unknown currency and period remain unknown while declared amounts and evidence survive',async()=>{
  required();const {db,lease}=await setup(),data=page();
  data.records[0].observation.financial_terms=[term({currency:null,period:'unknown',amount_minor:0})];
  await commit(db,lease,data);
  const value=JSON.parse((await db.prepare('SELECT normalized_json FROM market_observations').first()).normalized_json);
  assert.equal(value.financial_terms[0].amount_minor,0);
  assert.equal(value.financial_terms[0].currency,null);
  assert.equal(value.financial_terms[0].period,'unknown');
  assert.equal(value.monthly_rent_minor,null);
  assert.equal(value.monthly_rent_exact,null);
});

test('contradictory rents remain in the observation and do not gain a monthly value',async()=>{
  required();const {db,lease}=await setup(),data=page();
  data.records[0].observation.financial_terms=[term(),term({amount_minor:3000000,raw_text:'Another synthetic rent'})];
  await commit(db,lease,data);
  const value=JSON.parse((await db.prepare('SELECT normalized_json FROM market_observations').first()).normalized_json);
  assert.deepEqual(value.financial_terms.map(t=>t.amount_minor),[2400001,3000000]);
  assert.equal(value.monthly_rent_minor,null);
  assert.equal(value.monthly_rent_exact,null);
  assert.ok(value.issues.includes('multiple_rents_review'));
});

test('future observations, accessors and invalid source dates fail before any write',async()=>{
  required();const {db,lease}=await setup();
  const future=page(),at=stamp(86400000);
  future.observed_at=at;future.records[0].source_at=at;future.records[0].observation.observed_at=at;
  await assert.rejects(commit(db,lease,future),e=>e.status===409);
  const getter=page();Object.defineProperty(getter.records[0].observation,'title',{enumerable:true,get(){throw Error('must not run');}});
  await assert.rejects(commit(db,lease,getter),e=>e.status===400);
  const outOfOrder=page();outOfOrder.records[0].source_at=stamp(-1000);
  await assert.rejects(commit(db,lease,outOfOrder),e=>e.status===400);
  await noWrites(db);
});
