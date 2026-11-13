import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync,readdirSync} from 'node:fs';
import {makeDb,T0} from './helpers.mjs';
import {requireCaseCapability,prepareCaseCapabilityGuard} from '../../server/case-capabilities.js';

const actor='admin@example.test', at='2000-01-01T00:00:00.000Z';
const run=(db,sql,...args)=>db.prepare(sql).bind(...args).run();
const request=(kind,id=1)=>({caseRef:{kind,id},capability:'case_data_read',purpose:
  kind==='tenancy'?'arrears_management':kind==='rental'?'repair_report':'sale_review'});
const denied=e=>e?.status===403;

async function seed(db){
  await run(db,"INSERT INTO landlords(id,name,created_at,updated_at) VALUES(1,'Fixture',?,?)",T0,T0);
  for(const id of [1,2])await run(db,"INSERT INTO rentals(id,landlord_id,address,parish,service,fee_percent,created_at,updated_at) VALUES(?,1,'Fixture','St Helier','full',10,?,?)",id,T0,T0);
  await run(db,`INSERT INTO tenancies(id,rental_id,tenant_name,kind,regime,start_on,rent,due_day,ended_on,created_at,updated_at)
    VALUES(1,1,'Fixture','periodic','2025','2026-01-01',100,1,'2026-01-31',?,?)`,T0,T0);
  await run(db,"INSERT INTO listings(id,use,title,operation,availability,created_at,updated_at) VALUES('fixture-listing','residential','Fixture','sale','for_sale',?,?)",T0,T0);
  await run(db,"INSERT INTO contacts(id,name,email,last_activity_at,created_at,updated_at) VALUES(1,'Fixture','fixture@example.test',?,?,?)",T0,T0,T0);
  await run(db,"INSERT INTO applicants(id,contact_id,operation,source,created_at,updated_at) VALUES(1,1,'buy','phone',?,?)",T0,T0);
  await run(db,"INSERT INTO offers(id,listing_id,applicant_id,amount,created_at,updated_at) VALUES(1,'fixture-listing',1,100,?,?)",T0,T0);
  await run(db,"INSERT INTO sales(id,listing_id,applicant_id,offer_id,price,created_at,updated_at) VALUES(1,'fixture-listing',1,1,100,?,?)",T0,T0);
  for(const purpose of ['arrears_management','repair_report','sale_review'])await run(db,`INSERT INTO case_purpose_policies
    (purpose,revision,status,retention_ref,privacy_ref,approval_ref,approved_by,valid_from)
    VALUES(?,1,'approved','fixture-retention','fixture-privacy','fixture-policy','fixture',?)`,purpose,at);
  const columns=(await db.prepare('PRAGMA table_info(case_capability_memberships)').all()).results;
  const generation=columns.some(col=>col.name==='lifecycle_generation');
  for(const [kind,id] of [['tenancy',1],['rental',2],['sale',1]]){
    await run(db,`INSERT INTO case_capability_memberships(case_kind,case_id,staff_email,status,version,approval_ref,approved_by,approved_at${generation?',lifecycle_generation':''})
      VALUES(?,?,?,'active',1,'fixture-membership','fixture',?${generation?',1':''})`,kind,id,actor,at);
    await run(db,`INSERT INTO case_capability_grants(id,case_kind,case_id,staff_email,capability,purpose,status,version,
      membership_version,policy_revision,approval_ref,approved_by,valid_from)
      VALUES(?,?,?,?,'case_data_read',?,'active',1,1,1,'fixture-grant','fixture',?)`,
      `fixture-${kind}`,kind,id,actor,request(kind,id).purpose,at);
  }
}
const deletes={tenancy:'DELETE FROM tenancies WHERE id=1',rental:'DELETE FROM rentals WHERE id=2',sale:'DELETE FROM sales WHERE id=1'};
const inserts={
  tenancy:`INSERT INTO tenancies(id,rental_id,tenant_name,kind,regime,start_on,rent,due_day,ended_on,created_at,updated_at)
    VALUES(1,1,'New fixture','periodic','2025','2026-01-01',100,1,'2026-01-31',?,?)`,
  rental:"INSERT INTO rentals(id,landlord_id,address,parish,service,fee_percent,created_at,updated_at) VALUES(2,1,'New fixture','St Helier','full',10,?,?)",
  sale:"INSERT INTO sales(id,listing_id,applicant_id,offer_id,price,created_at,updated_at) VALUES(1,'fixture-listing',1,1,100,?,?)",
};

test('deleting and recreating each supported case revokes old and in-flight authority',async()=>{
  for(const [kind,id] of [['tenancy',1],['rental',2],['sale',1]]){
    const db=makeDb();await seed(db);const req=request(kind,id),env={DB:db};
    const prior=await requireCaseCapability(env,req,actor),guard=await prepareCaseCapabilityGuard(env,req,actor,prior);
    await run(db,deletes[kind]);await run(db,inserts[kind],T0,T0);
    await assert.rejects(requireCaseCapability(env,req,actor),denied);
    await assert.rejects(db.batch([guard.assertion,db.prepare('SELECT 1'),guard.release]));
    assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM case_capability_batch_assertions').first()).n,0);
  }
});

test('REPLACE or primary-key mutation cannot transfer authority to a different case',async()=>{
  for(const [kind,id] of [['tenancy',1],['rental',2],['sale',1]]){
    const db=makeDb();await seed(db);
    await assert.rejects(run(db,inserts[kind].replace('INSERT INTO','INSERT OR REPLACE INTO'),T0,T0));
    await assert.rejects(run(db,`UPDATE ${kind==='tenancy'?'tenancies':kind==='rental'?'rentals':'sales'} SET id=99 WHERE id=?`,id));
    await requireCaseCapability({DB:db},request(kind,id),actor);
  }
});

test('rowid aliases cannot bypass immutable case identity',async()=>{
  for(const [kind,id,table] of [['tenancy',1,'tenancies'],['rental',2,'rentals'],['sale',1,'sales']])
    for(const alias of ['rowid','_rowid_','oid']){
      const db=makeDb();await seed(db);
      await assert.rejects(run(db,`UPDATE ${table} SET ${alias}=99 WHERE id=?`,id));
      await requireCaseCapability({DB:db},request(kind,id),actor);
    }
});

test('sale offer, open-listing and open-buyer conflicts cannot implicitly replace a case',async()=>{
  const db=makeDb();await seed(db);
  await run(db,"INSERT INTO listings(id,use,title,operation,availability,created_at,updated_at) VALUES('fixture-listing-2','residential','Fixture','sale','for_sale',?,?)",T0,T0);
  await run(db,"INSERT INTO contacts(id,name,email,last_activity_at,created_at,updated_at) VALUES(2,'Fixture','fixture2@example.test',?,?,?)",T0,T0,T0);
  await run(db,"INSERT INTO applicants(id,contact_id,operation,source,created_at,updated_at) VALUES(2,2,'buy','phone',?,?)",T0,T0);
  await run(db,"INSERT INTO offers(id,listing_id,applicant_id,amount,created_at,updated_at) VALUES(2,'fixture-listing-2',2,100,?,?)",T0,T0);
  for(const [listing,applicant,offer] of [['fixture-listing',1,1],['fixture-listing',2,2],['fixture-listing-2',1,2]])
    await assert.rejects(run(db,"INSERT OR REPLACE INTO sales(id,listing_id,applicant_id,offer_id,price,created_at,updated_at) VALUES(2,?,?,?,100,?,?)",listing,applicant,offer,T0,T0));
  await run(db,"INSERT INTO sales(id,listing_id,applicant_id,offer_id,price,created_at,updated_at) VALUES(2,'fixture-listing-2',2,2,100,?,?)",T0,T0);
  for(const [column,value] of [['listing_id','fixture-listing'],['applicant_id',1],['offer_id',1]])
    await assert.rejects(run(db,`UPDATE OR REPLACE sales SET ${column}=? WHERE id=2`,value));
  await requireCaseCapability({DB:db},request('sale'),actor);
});

test('a case deletion rolled back by a later error leaves its old authority intact',async()=>{
  for(const [kind,id] of [['tenancy',1],['rental',2],['sale',1]]){
    const db=makeDb();await seed(db);
    await assert.rejects(db.batch([db.prepare(deletes[kind]),db.prepare("INSERT INTO case_capability_batch_assertions(id,permitted) VALUES('fixture-rollback',0)")]));
    await requireCaseCapability({DB:db},request(kind,id),actor);
  }
});

test('replacing a policy, membership or grant cannot reset approval or version history',async()=>{
  const db=makeDb();await seed(db);
  for(const [table,where] of [['case_purpose_policies',"purpose='arrears_management'"],
    ['case_capability_memberships',"case_kind='tenancy' AND case_id=1"],['case_capability_grants',"id='fixture-tenancy'"]])
    await assert.rejects(run(db,`INSERT OR REPLACE INTO ${table} SELECT * FROM ${table} WHERE ${where}`));
  await requireCaseCapability({DB:db},request('tenancy'),actor);
});

test('authority rows cannot be deleted and reinserted to revive an earlier snapshot',async()=>{
  for(const [table,where] of [['case_purpose_policies',"purpose='arrears_management'"],
    ['case_capability_memberships',"case_kind='tenancy' AND case_id=1"],['case_capability_grants',"id='fixture-tenancy'"]]){
    const db=makeDb();await seed(db);
    await assert.rejects(run(db,`DELETE FROM ${table} WHERE ${where}`));
    await requireCaseCapability({DB:db},request('tenancy'),actor);
  }
});

test('missing lifecycle protections and a hypothetical rental application fail closed',async()=>{
  const db=makeDb();await seed(db);
  await run(db,'CREATE TABLE rental_applications(id INTEGER PRIMARY KEY)');
  await run(db,'INSERT INTO rental_applications(id) VALUES(1)');
  await run(db,`INSERT INTO case_purpose_policies(purpose,revision,status,retention_ref,privacy_ref,approval_ref,approved_by,valid_from)
    VALUES('rental_application',1,'approved','fixture-retention','fixture-privacy','fixture-policy','fixture',?)`,at);
  await run(db,`INSERT INTO case_capability_memberships(case_kind,case_id,staff_email,status,version,approval_ref,approved_by,approved_at,lifecycle_generation)
    VALUES('rental_application',1,?,'active',1,'fixture-membership','fixture',?,0)`,actor,at);
  await run(db,`INSERT INTO case_capability_grants(id,case_kind,case_id,staff_email,capability,purpose,status,version,
    membership_version,policy_revision,approval_ref,approved_by,valid_from)
    VALUES('fixture-application','rental_application',1,?,'case_data_read','rental_application','active',1,1,1,'fixture-grant','fixture',?)`,actor,at);
  await assert.rejects(requireCaseCapability({DB:db},{caseRef:{kind:'rental_application',id:1},
    capability:'case_data_read',purpose:'rental_application'},actor),denied);
  await run(db,'DROP TRIGGER case_tenancy_delete_guard');
  await assert.rejects(requireCaseCapability({DB:db},request('tenancy'),actor),denied);
});

test('a protection removed after preflight invalidates the in-flight assertion',async()=>{
  const db=makeDb();await seed(db);const req=request('tenancy'),env={DB:db};
  const snapshot=await requireCaseCapability(env,req,actor),guard=await prepareCaseCapabilityGuard(env,req,actor,snapshot);
  await run(db,'DROP TRIGGER case_tenancy_delete_guard');
  await assert.rejects(db.batch([guard.assertion,db.prepare('SELECT 1'),guard.release]));
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM case_capability_batch_assertions').first()).n,0);
});

test('an unreviewed unique case or authority index makes access unavailable',async()=>{
  for(const sql of ['CREATE UNIQUE INDEX fixture_case_unique ON rentals(id)',
    'CREATE UNIQUE INDEX fixture_authority_unique ON case_capability_grants(id)']){
    const db=makeDb();await seed(db);await run(db,sql);
    await assert.rejects(requireCaseCapability({DB:db},request('rental',2),actor),denied);
  }
});

test('unreviewed authority indexes also block writes that could replace history',async()=>{
  const db=makeDb();await seed(db);
  await run(db,'CREATE UNIQUE INDEX fixture_authority_unique ON case_capability_grants(id)');
  await assert.rejects(run(db,`INSERT INTO case_capability_grants(id,case_kind,case_id,staff_email,capability,purpose,status,version,
    membership_version,policy_revision,approval_ref,approved_by,valid_from)
    VALUES('fixture-extra','tenancy',1,?,'case_data_read','arrears_management','revoked',1,1,1,'fixture-extra','fixture',?)`,actor,at));
  await assert.rejects(run(db,"UPDATE case_capability_grants SET version=version+1 WHERE id='fixture-tenancy'"));
  await run(db,'DROP INDEX fixture_authority_unique');
  await requireCaseCapability({DB:db},request('tenancy'),actor);
});

test('recreating a case revokes stale authority even after an unknown REPLACE conflict',async()=>{
  const db=makeDb();await seed(db);
  await run(db,"UPDATE rentals SET address='Original fixture' WHERE id=2");
  await run(db,'CREATE UNIQUE INDEX fixture_rental_address ON rentals(address)');
  await run(db,"INSERT OR REPLACE INTO rentals(id,landlord_id,address,parish,service,fee_percent,created_at,updated_at) VALUES(3,1,'Original fixture','St Helier','full',10,?,?)",T0,T0);
  await run(db,'DROP INDEX fixture_rental_address');
  await run(db,inserts.rental,T0,T0);
  await assert.rejects(requireCaseCapability({DB:db},request('rental',2),actor),denied);
});

test('pre-migration memberships stay denied until explicit renewed membership and a new grant',async()=>{
  const db=makeDb();await seed(db);const legacy='colleague@example.test',req=request('tenancy');
  await run(db,`INSERT INTO case_capability_memberships(case_kind,case_id,staff_email,status,version,approval_ref,approved_by,approved_at)
    VALUES('tenancy',1,?,'active',1,'fixture-old-approval','fixture',?)`,legacy,at);
  await run(db,`INSERT INTO case_capability_grants(id,case_kind,case_id,staff_email,capability,purpose,status,version,
    membership_version,policy_revision,approval_ref,approved_by,valid_from)
    VALUES('fixture-old-grant','tenancy',1,?,'case_data_read','arrears_management','active',1,1,1,'fixture-old-grant','fixture',?)`,legacy,at);
  await assert.rejects(requireCaseCapability({DB:db},req,legacy),denied);
  await assert.rejects(run(db,"UPDATE case_capability_memberships SET lifecycle_generation=1,version=version+1 WHERE case_kind='tenancy' AND case_id=1 AND staff_email=?",legacy));
  await run(db,"UPDATE case_capability_grants SET status='revoked',version=version+1 WHERE id='fixture-old-grant'");
  await run(db,"UPDATE case_capability_memberships SET status='revoked',version=version+1 WHERE case_kind='tenancy' AND case_id=1 AND staff_email=?",legacy);
  await run(db,"UPDATE case_capability_memberships SET status='active',version=version+1,lifecycle_generation=1,approval_ref='fixture-renewed' WHERE case_kind='tenancy' AND case_id=1 AND staff_email=?",legacy);
  await assert.rejects(requireCaseCapability({DB:db},req,legacy),denied);
  await run(db,`INSERT INTO case_capability_grants(id,case_kind,case_id,staff_email,capability,purpose,status,version,
    membership_version,policy_revision,approval_ref,approved_by,valid_from)
    VALUES('fixture-renewed-grant','tenancy',1,?,'case_data_read','arrears_management','active',1,3,1,'fixture-renewed-grant','fixture',?)`,legacy,at);
  await requireCaseCapability({DB:db},req,legacy);
});

test('active lifecycle authority cannot be planted before a case exists',async()=>{
  const db=makeDb();await seed(db);
  await assert.rejects(run(db,`INSERT INTO case_capability_memberships(case_kind,case_id,staff_email,status,version,
    approval_ref,approved_by,approved_at,lifecycle_generation) VALUES('tenancy',99,?,'active',1,'fixture','fixture',?,1)`,actor,at));
  await run(db,'DELETE FROM rentals WHERE id=2');
  await assert.rejects(run(db,"UPDATE case_capability_memberships SET status='active',version=version+1,approval_ref='fixture-reapproval' WHERE case_kind='rental' AND case_id=2 AND staff_email=?",actor));
  await run(db,inserts.rental,T0,T0);
  await assert.rejects(requireCaseCapability({DB:db},request('rental',2),actor),denied);
});

test('real local D1 preserves rollback and rejects old snapshots after case recreation',async()=>{
  const require=createRequire(import.meta.url),{Miniflare,convertV4MiniflareOptions}=require('miniflare'),{unstable_splitSqlQuery}=require('wrangler');
  const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:"export default {fetch(){return new Response('fixture')}}",
    compatibilityDate:'2025-10-01',host:'127.0.0.1',port:0,d1Databases:{DB:'case-lifecycle-synthetic'}}));
  try{
    const db=await mf.getD1Database('DB'),dir=new URL('../../migrations/',import.meta.url);
    for(const name of readdirSync(dir).filter(f=>f.endsWith('.sql')).sort())
      await db.batch(unstable_splitSqlQuery(readFileSync(new URL(name,dir),'utf8')).map(sql=>db.prepare(sql)));
    await run(db,"INSERT INTO admins(email,added_by,added_at) VALUES(?,'fixture',?)",actor,T0);await seed(db);
    for(const [kind,id] of [['tenancy',1],['rental',2],['sale',1]]){
      const env={DB:db},req=request(kind,id),snapshot=await requireCaseCapability(env,req,actor);
      const guard=await prepareCaseCapabilityGuard(env,req,actor,snapshot);
      await assert.rejects(run(db,inserts[kind].replace('INSERT INTO','INSERT OR REPLACE INTO'),T0,T0));
      const table=kind==='tenancy'?'tenancies':kind==='rental'?'rentals':'sales';
      await assert.rejects(run(db,`UPDATE ${table} SET rowid=99 WHERE id=?`,id));
      await assert.rejects(db.batch([db.prepare(deletes[kind]),db.prepare("INSERT INTO case_capability_batch_assertions(id,permitted) VALUES('fixture-rollback',0)")]));
      await requireCaseCapability(env,req,actor);
      await db.batch([db.prepare(deletes[kind]),db.prepare(inserts[kind]).bind(T0,T0)]);
      await assert.rejects(db.batch([guard.assertion,db.prepare('SELECT 1'),guard.release]));
      await assert.rejects(requireCaseCapability(env,req,actor),denied);
      assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM case_capability_batch_assertions').first()).n,0);
    }
    assert.deepEqual((await db.prepare('PRAGMA foreign_key_check').all()).results,[]);
  }finally{await mf.dispose();}
});

test('real local D1 upgrade preserves old rows but denies them until explicit renewed authority',async()=>{
  const require=createRequire(import.meta.url),{Miniflare,convertV4MiniflareOptions}=require('miniflare'),{unstable_splitSqlQuery}=require('wrangler');
  const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:"export default {fetch(){return new Response('fixture')}}",
    compatibilityDate:'2025-10-01',host:'127.0.0.1',port:0,d1Databases:{DB:'case-upgrade-synthetic'}}));
  try{
    const db=await mf.getD1Database('DB'),dir=new URL('../../migrations/',import.meta.url);
    for(const name of readdirSync(dir).filter(f=>f.endsWith('.sql')&&f<'0049').sort())
      await db.batch(unstable_splitSqlQuery(readFileSync(new URL(name,dir),'utf8')).map(sql=>db.prepare(sql)));
    await run(db,"INSERT INTO admins(email,added_by,added_at) VALUES(?,'fixture',?)",actor,T0);await seed(db);
    const migration=readFileSync(new URL('0049_financial_step_revision.sql',dir),'utf8');
    await db.batch(unstable_splitSqlQuery(migration).map(sql=>db.prepare(sql)));
    assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM case_capability_memberships WHERE status='active' AND lifecycle_generation=0").first()).n,3);
    assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM case_capability_grants WHERE status='active'").first()).n,3);
    for(const [kind,id] of [['tenancy',1],['rental',2],['sale',1]])
      await assert.rejects(requireCaseCapability({DB:db},request(kind,id),actor),denied);
    await run(db,"UPDATE case_capability_grants SET status='revoked',version=version+1 WHERE id='fixture-tenancy'");
    await run(db,"UPDATE case_capability_memberships SET status='revoked',version=version+1 WHERE case_kind='tenancy' AND case_id=1 AND staff_email=?",actor);
    await run(db,"UPDATE case_capability_memberships SET status='active',version=version+1,lifecycle_generation=1,approval_ref='fixture-renewed' WHERE case_kind='tenancy' AND case_id=1 AND staff_email=?",actor);
    await assert.rejects(requireCaseCapability({DB:db},request('tenancy'),actor),denied);
    await run(db,`INSERT INTO case_capability_grants(id,case_kind,case_id,staff_email,capability,purpose,status,version,
      membership_version,policy_revision,approval_ref,approved_by,valid_from)
      VALUES('fixture-new','tenancy',1,?,'case_data_read','arrears_management','active',1,3,1,'fixture-new','fixture',?)`,actor,at);
    await requireCaseCapability({DB:db},request('tenancy'),actor);
    assert.deepEqual((await db.prepare('PRAGMA foreign_key_check').all()).results,[]);
  }finally{await mf.dispose();}
});
