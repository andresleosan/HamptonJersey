import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { makeDb } from './helpers.mjs';

let capabilities;
try { capabilities = await import('../../server/case-capabilities.js'); }
catch (error) { if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error; }
const needCapabilities = () => assert.ok(capabilities, 'ADM-18 case capabilities are not implemented yet');
const actor = 'admin@example.test';
const other = 'colleague@example.test';
const caseRef = {kind:'tenancy',id:1};
const request = (overrides = {}) => ({caseRef,capability:'sensitive_finance',purpose:'arrears_management',...overrides});
const run = (db,sql,...args) => db.prepare(sql).bind(...args).run();
const count = async (db,table) => (await db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first()).n;

async function seedCases(db) {
  const at='2000-01-01T00:00:00.000Z';
  await run(db, "INSERT INTO landlords(id,name,created_at,updated_at) VALUES (1,'Fixture landlord',?,?)",at,at);
  for (const id of [1,2]) {
    await run(db, "INSERT INTO rentals(id,landlord_id,address,parish,service,created_at,updated_at) VALUES (?,1,'Fixture address','St Helier','let_only',?,?)",id,at,at);
    await run(db, `INSERT INTO tenancies(id,rental_id,tenant_name,kind,regime,start_on,rent,due_day,created_at,updated_at)
      VALUES (?,?,'Fixture tenant','periodic','2025','2025-01-01',1000,1,?,?)`,id,id,at,at);
  }
}
async function seedAuthority(db,{policyExpiry='2999-01-01T00:00:00.000Z',grantExpiry='2999-01-01T00:00:00.000Z'}={}) {
  await run(db, `INSERT INTO case_purpose_policies(purpose,revision,status,retention_ref,privacy_ref,approval_ref,approved_by,valid_from,expires_at)
    VALUES ('arrears_management',1,'approved','fixture-retention','fixture-privacy','fixture-policy-approval','fixture-operator','2000-01-01T00:00:00.000Z',?)`,policyExpiry);
  await run(db, `INSERT INTO case_capability_memberships(case_kind,case_id,staff_email,status,version,approval_ref,approved_by,approved_at)
    VALUES ('tenancy',1,?,'active',1,'fixture-member-approval','fixture-operator','2000-01-01T00:00:00.000Z')`,actor);
  await run(db, `INSERT INTO case_capability_grants(id,case_kind,case_id,staff_email,capability,purpose,status,version,
    membership_version,policy_revision,approval_ref,approved_by,valid_from,expires_at)
    VALUES ('fixture-grant','tenancy',1,?,'sensitive_finance','arrears_management','active',1,1,1,
      'fixture-grant-approval','fixture-operator','2000-01-01T00:00:00.000Z',?)`,actor,grantExpiry);
}
const denied = error => error?.status === 403;

test('staff receive no capabilities by default, including for a real case', async () => {
  needCapabilities();
  const db=makeDb(); await seedCases(db);
  assert.equal(await count(db,'case_capability_memberships'),0);
  assert.equal(await count(db,'case_capability_grants'),0);
  assert.equal(await count(db,'case_purpose_policies'),0);
  await assert.rejects(capabilities.requireCaseCapability({DB:db},request(),actor),denied);
  await assert.rejects(capabilities.requireCaseCapability({DB:db},request({caseRef:{kind:'rental_application',id:1}}),actor),denied);
});

test('a missing migration or unavailable database fails closed without granting access', async () => {
  needCapabilities();
  const db=makeDb(); await seedCases(db);
  await run(db,'DROP TABLE case_capability_grants');
  await assert.rejects(capabilities.requireCaseCapability({DB:db},request(),actor),denied);
  await assert.rejects(capabilities.requireCaseCapability({},request(),actor),denied);
});

test('access is limited to the exact staff member, case, capability and purpose', async () => {
  needCapabilities();
  const db=makeDb(); await seedCases(db); await seedAuthority(db);
  const permitted=await capabilities.requireCaseCapability({DB:db},request(),actor);
  assert.equal(permitted.grantVersion,1);
  for(const [input,who] of [
    [request({caseRef:{kind:'tenancy',id:2}}),actor],
    [request({caseRef:{kind:'rental',id:1}}),actor],
    [request({caseRef:{kind:'tenancy',id:999}}),actor],
    [request({capability:'case_data_write'}),actor],
    [request({purpose:'rental_application'}),actor],
    [request(),other],
  ]) await assert.rejects(capabilities.requireCaseCapability({DB:db},input,who),denied);
});

test('a single rental capability cannot authorize an owner-wide financial statement', async () => {
  needCapabilities();
  const db=makeDb(); await seedCases(db);
  await run(db, `INSERT INTO case_purpose_policies(purpose,revision,status,retention_ref,privacy_ref,approval_ref,approved_by,valid_from)
    VALUES ('landlord_statement',1,'approved','fixture-retention','fixture-privacy','fixture-policy','fixture-operator','2000-01-01T00:00:00.000Z')`);
  await run(db, `INSERT INTO case_capability_memberships(case_kind,case_id,staff_email,status,version,approval_ref,approved_by,approved_at)
    VALUES ('rental',1,?,'active',1,'fixture-member','fixture-operator','2000-01-01T00:00:00.000Z')`,actor);
  await run(db, `INSERT INTO case_capability_grants(id,case_kind,case_id,staff_email,capability,purpose,status,version,
    membership_version,policy_revision,approval_ref,approved_by,valid_from)
    VALUES ('fixture-statement','rental',1,?,'sensitive_finance','landlord_statement','active',1,1,1,
      'fixture-grant','fixture-operator','2000-01-01T00:00:00.000Z')`,actor);
  await assert.rejects(capabilities.requireCaseCapability({DB:db},
    request({caseRef:{kind:'rental',id:1},purpose:'landlord_statement'}),actor),denied);
});

test('revocation or a new policy revision blocks reads immediately', async () => {
  needCapabilities();
  for(const change of [
    "UPDATE case_capability_grants SET status='revoked',version=version+1 WHERE id='fixture-grant'",
    "UPDATE case_capability_memberships SET status='revoked',version=version+1 WHERE case_id=1",
    "UPDATE case_purpose_policies SET status='revoked',revision=revision+1 WHERE purpose='arrears_management'",
  ]) {
    const db=makeDb(); await seedCases(db); await seedAuthority(db);
    await capabilities.requireCaseCapability({DB:db},request(),actor);
    await run(db,change);
    await assert.rejects(capabilities.requireCaseCapability({DB:db},request(),actor),denied);
  }
});

test('an expired policy or grant cannot authorize access even when versions match', async () => {
  needCapabilities();
  for(const expired of [{policyExpiry:'2001-01-01T00:00:00.000Z'},{grantExpiry:'2001-01-01T00:00:00.000Z'}]) {
    const db=makeDb(); await seedCases(db); await seedAuthority(db,expired);
    await assert.rejects(capabilities.requireCaseCapability({DB:db},request(),actor),denied);
  }
});

test('an approved purpose cannot silently lose retention evidence', async () => {
  needCapabilities();
  const db=makeDb(); await seedCases(db); await seedAuthority(db);
  await assert.rejects(run(db,"UPDATE case_purpose_policies SET retention_ref=NULL,revision=revision+1 WHERE purpose='arrears_management'"));
  await run(db,"UPDATE case_purpose_policies SET status='revoked',retention_ref=NULL,revision=revision+1 WHERE purpose='arrears_management'");
  await assert.rejects(capabilities.requireCaseCapability({DB:db},request(),actor),denied);
});

test('grant identifiers and approval references cannot contain emails or URLs', async () => {
  needCapabilities();
  const db=makeDb(); await seedCases(db); await seedAuthority(db);
  await assert.rejects(run(db, `INSERT INTO case_capability_grants(id,case_kind,case_id,staff_email,capability,purpose,status,version,
    membership_version,policy_revision,approval_ref,approved_by,valid_from)
    VALUES ('fixture-person@example.test','tenancy',1,?,'case_data_read','arrears_management','active',1,1,1,
      'fixture-approval','fixture-operator','2000-01-01T00:00:00.000Z')`,actor));
  await assert.rejects(run(db, "UPDATE case_purpose_policies SET approval_ref='https://fixture.invalid/approval',revision=revision+1 WHERE purpose='arrears_management'"));
});

test('re-enrolling a member cannot revive a grant approved under an older membership', async () => {
  needCapabilities();
  const db=makeDb(); await seedCases(db); await seedAuthority(db);
  await run(db,"UPDATE case_capability_memberships SET status='revoked',version=version+1 WHERE case_id=1");
  await run(db,"UPDATE case_capability_memberships SET status='active',version=version+1,approval_ref='fixture-new-approval' WHERE case_id=1");
  await assert.rejects(capabilities.requireCaseCapability({DB:db},request(),actor),denied);
});

test('a grant cannot be rebound to a different membership, policy or approval', async () => {
  needCapabilities();
  for (const change of [
    "UPDATE case_capability_grants SET membership_version=2,version=version+1 WHERE id='fixture-grant'",
    "UPDATE case_capability_grants SET policy_revision=2,version=version+1 WHERE id='fixture-grant'",
    "UPDATE case_capability_grants SET approval_ref='fixture-new-approval',version=version+1 WHERE id='fixture-grant'",
    "UPDATE case_capability_grants SET expires_at=NULL,version=version+1 WHERE id='fixture-grant'",
  ]) {
    const db=makeDb(); await seedCases(db); await seedAuthority(db);
    await assert.rejects(run(db,change));
    assert.equal((await capabilities.requireCaseCapability({DB:db},request(),actor)).grantVersion,1);
  }
});

test('an authorized batch commits exactly its guarded write and removes the assertion', async () => {
  needCapabilities();
  const db=makeDb(); await seedCases(db); await seedAuthority(db);
  await run(db,'CREATE TABLE fixture_private_write (value TEXT NOT NULL)');
  const snapshot=await capabilities.requireCaseCapability({DB:db},request(),actor);
  const guard=await capabilities.prepareCaseCapabilityGuard({DB:db},request(),actor,snapshot);
  await db.batch([guard.assertion,db.prepare("INSERT INTO fixture_private_write VALUES ('fixture')"),guard.release]);
  assert.equal(await count(db,'fixture_private_write'),1);
  assert.equal(await count(db,'case_capability_batch_assertions'),0);
});

test('a revoked member cannot read another sensitive result using a preflight snapshot', async () => {
  needCapabilities();
  const db=makeDb(); await seedCases(db); await seedAuthority(db);
  await run(db,'CREATE TABLE fixture_private_read (value TEXT NOT NULL)');
  await run(db,"INSERT INTO fixture_private_read VALUES ('fixture-sensitive')");
  const snapshot=await capabilities.requireCaseCapability({DB:db},request(),actor);
  const guard=await capabilities.prepareCaseCapabilityGuard({DB:db},request(),actor,snapshot);
  await run(db,"UPDATE case_capability_memberships SET status='revoked',version=version+1 WHERE case_id=1");
  await assert.rejects(db.batch([guard.assertion,db.prepare('SELECT value FROM fixture_private_read'),guard.release]));
  assert.equal(await count(db,'case_capability_batch_assertions'),0);
});

test('removing an admin invalidates an in-flight capability before a private write', async () => {
  needCapabilities();
  const db=makeDb(); await seedCases(db); await seedAuthority(db);
  await run(db,'CREATE TABLE fixture_private_write (value TEXT NOT NULL)');
  const snapshot=await capabilities.requireCaseCapability({DB:db},request(),actor);
  const guard=await capabilities.prepareCaseCapabilityGuard({DB:db},request(),actor,snapshot);
  await run(db,'DELETE FROM admins WHERE email=?',actor);
  await assert.rejects(capabilities.requireCaseCapability({DB:db},request(),actor),denied);
  await assert.rejects(db.batch([guard.assertion,db.prepare("INSERT INTO fixture_private_write VALUES ('fixture')"),guard.release]));
  assert.equal(await count(db,'fixture_private_write'),0);
});

test('deleting and re-adding the same admin cannot revive grants or an earlier snapshot', async () => {
  needCapabilities();
  const db=makeDb(); await seedCases(db); await seedAuthority(db);
  await run(db,'CREATE TABLE fixture_private_write (value TEXT NOT NULL)');
  const snapshot=await capabilities.requireCaseCapability({DB:db},request(),actor);
  const guard=await capabilities.prepareCaseCapabilityGuard({DB:db},request(),actor,snapshot);
  await run(db,'DELETE FROM admins WHERE email=? COLLATE NOCASE',actor.toUpperCase());
  await run(db,"INSERT INTO admins(email,added_by,added_at) VALUES (?,'fixture','2000-01-01T00:00:00.000Z')",actor);
  await assert.rejects(capabilities.requireCaseCapability({DB:db},request(),actor),denied);
  await assert.rejects(db.batch([guard.assertion,db.prepare("INSERT INTO fixture_private_write VALUES ('fixture')"),guard.release]));
  assert.equal(await count(db,'fixture_private_write'),0);
  const member=await db.prepare('SELECT status,version FROM case_capability_memberships WHERE staff_email=?').bind(actor).first();
  const grant=await db.prepare('SELECT status,version FROM case_capability_grants WHERE id=?').bind('fixture-grant').first();
  assert.equal(member.status,'revoked');assert.equal(member.version,2);
  assert.equal(grant.status,'revoked');assert.equal(grant.version,2);
  await assert.rejects(capabilities.requireCaseCapability({DB:db},request(),actor.toUpperCase()),denied);
  await assert.rejects(run(db,"UPDATE case_capability_memberships SET status='active',version=version+1 WHERE staff_email=?",actor));
  await run(db,"UPDATE case_capability_memberships SET status='active',version=version+1,approval_ref='fixture-new-member' WHERE staff_email=?",actor);
  await assert.rejects(capabilities.requireCaseCapability({DB:db},request(),actor),denied);
  await run(db, `INSERT INTO case_capability_grants(id,case_kind,case_id,staff_email,capability,purpose,status,version,
    membership_version,policy_revision,approval_ref,approved_by,valid_from,expires_at)
    VALUES ('fixture-new-grant','tenancy',1,?,'sensitive_finance','arrears_management','active',1,3,1,
      'fixture-new-approval','fixture-operator','2000-01-01T00:00:00.000Z','2999-01-01T00:00:00.000Z')`,actor);
  assert.equal((await capabilities.requireCaseCapability({DB:db},request(),actor)).grantId,'fixture-new-grant');
  await assert.rejects(db.batch([guard.assertion,db.prepare("INSERT INTO fixture_private_write VALUES ('fixture')"),guard.release]));
  assert.equal(await count(db,'fixture_private_write'),0);
});

test('admin deletion preserves already revoked membership and leaves other staff access intact', async () => {
  needCapabilities();
  const db=makeDb(); await seedCases(db); await seedAuthority(db);
  await run(db, `INSERT INTO case_capability_memberships(case_kind,case_id,staff_email,status,version,approval_ref,approved_by,approved_at)
    VALUES ('tenancy',2,?,'active',1,'fixture-second-member','fixture-operator','2000-01-01T00:00:00.000Z')`,actor);
  await run(db, `INSERT INTO case_capability_grants(id,case_kind,case_id,staff_email,capability,purpose,status,version,
    membership_version,policy_revision,approval_ref,approved_by,valid_from,expires_at)
    VALUES ('fixture-second-grant','tenancy',2,?,'sensitive_finance','arrears_management','active',1,1,1,
      'fixture-second-approval','fixture-operator','2000-01-01T00:00:00.000Z','2999-01-01T00:00:00.000Z')`,actor);
  await run(db, `INSERT INTO case_capability_memberships(case_kind,case_id,staff_email,status,version,approval_ref,approved_by,approved_at)
    VALUES ('tenancy',2,?,'active',1,'fixture-other-member','fixture-operator','2000-01-01T00:00:00.000Z')`,other);
  await run(db, `INSERT INTO case_capability_grants(id,case_kind,case_id,staff_email,capability,purpose,status,version,
    membership_version,policy_revision,approval_ref,approved_by,valid_from,expires_at)
    VALUES ('fixture-other-grant','tenancy',2,?,'sensitive_finance','arrears_management','active',1,1,1,
      'fixture-other-approval','fixture-operator','2000-01-01T00:00:00.000Z','2999-01-01T00:00:00.000Z')`,other);
  await run(db, `INSERT INTO case_capability_grants(id,case_kind,case_id,staff_email,capability,purpose,status,version,
    membership_version,policy_revision,approval_ref,approved_by,valid_from,expires_at)
    VALUES ('fixture-already-revoked','tenancy',1,?,'sensitive_finance','arrears_management','revoked',7,1,1,
      'fixture-old-approval','fixture-operator','2000-01-01T00:00:00.000Z','2999-01-01T00:00:00.000Z')`,actor);
  await run(db,"UPDATE case_capability_memberships SET status='revoked',version=version+1 WHERE staff_email=? AND case_id=1",actor);
  await run(db,'DELETE FROM admins WHERE email=?',actor);
  const members=(await db.prepare('SELECT case_id,status,version FROM case_capability_memberships WHERE staff_email=? ORDER BY case_id').bind(actor).all()).results;
  const grant=await db.prepare('SELECT status,version FROM case_capability_grants WHERE id=?').bind('fixture-grant').first();
  assert.deepEqual(members.map(row=>({...row})),[{case_id:1,status:'revoked',version:2},{case_id:2,status:'revoked',version:2}]);
  assert.equal(grant.status,'revoked');assert.equal(grant.version,2);
  assert.deepEqual({...await db.prepare('SELECT status,version FROM case_capability_grants WHERE id=?').bind('fixture-second-grant').first()},{status:'revoked',version:2});
  assert.deepEqual({...await db.prepare('SELECT status,version FROM case_capability_grants WHERE id=?').bind('fixture-already-revoked').first()},{status:'revoked',version:7});
  const unrelated=await capabilities.requireCaseCapability({DB:db},request({caseRef:{kind:'tenancy',id:2}}),other);
  assert.equal(unrelated.grantVersion,1);
});

for (const [operation,replacement] of [
  ['replacing an admin',async db => run(db,"INSERT OR REPLACE INTO admins(email,added_by,added_at) VALUES (?,'fixture','2000-01-01T00:00:00.000Z')",actor)],
  ['changing an admin email and restoring it',async db => { await run(db,'UPDATE admins SET email=? WHERE email=?','renamed@example.test',actor); await run(db,'UPDATE admins SET email=? WHERE email=?',actor,'renamed@example.test'); }],
]) test(`${operation} cannot revive capabilities and old snapshots`, async () => {
  needCapabilities();
  const db=makeDb(); await seedCases(db); await seedAuthority(db);
  await run(db,'CREATE TABLE fixture_private_write (value TEXT NOT NULL)');
  const snapshot=await capabilities.requireCaseCapability({DB:db},request(),actor);
  const guard=await capabilities.prepareCaseCapabilityGuard({DB:db},request(),actor,snapshot);
  await replacement(db);
  await assert.rejects(capabilities.requireCaseCapability({DB:db},request(),actor),denied);
  await assert.rejects(db.batch([guard.assertion,db.prepare("INSERT INTO fixture_private_write VALUES ('fixture')"),guard.release]));
  assert.equal(await count(db,'fixture_private_write'),0);
});

test('idempotently adding an existing admin or changing its name preserves case access', async () => {
  needCapabilities();
  const db=makeDb(); await seedCases(db); await seedAuthority(db);
  await run(db,"INSERT INTO admins(email,added_by,added_at) VALUES (?,'fixture','2000-01-01T00:00:00.000Z') ON CONFLICT(email) DO NOTHING",actor);
  await run(db,"UPDATE admins SET name='Fixture name' WHERE email=?",actor);
  const access=await capabilities.requireCaseCapability({DB:db},request(),actor);
  assert.equal(access.grantVersion,1); assert.equal(access.membershipVersion,1);
});

for (const [operation,insertOrChange] of [
  ['inserting a new admin',async (db,email) => run(db,"INSERT INTO admins(email,added_by,added_at) VALUES (?,'fixture','2000-01-01T00:00:00.000Z')",email)],
  ['changing an admin to a new email',async (db,email) => run(db,'UPDATE admins SET email=? WHERE email=?',email,actor)],
]) test(`${operation} does not auto-assign stale case permissions`, async () => {
  needCapabilities();
  const db=makeDb(),future='future@example.test'; await seedCases(db); await seedAuthority(db);
  await run(db, `INSERT INTO case_capability_memberships(case_kind,case_id,staff_email,status,version,approval_ref,approved_by,approved_at)
    VALUES ('tenancy',1,?,'active',1,'fixture-future-member','fixture-operator','2000-01-01T00:00:00.000Z')`,future);
  await run(db, `INSERT INTO case_capability_grants(id,case_kind,case_id,staff_email,capability,purpose,status,version,
    membership_version,policy_revision,approval_ref,approved_by,valid_from,expires_at)
    VALUES ('fixture-future-grant','tenancy',1,?,'sensitive_finance','arrears_management','active',1,1,1,
      'fixture-future-approval','fixture-operator','2000-01-01T00:00:00.000Z','2999-01-01T00:00:00.000Z')`,future);
  await assert.rejects(capabilities.requireCaseCapability({DB:db},request(),future),denied);
  await insertOrChange(db,future);
  await assert.rejects(capabilities.requireCaseCapability({DB:db},request(),future),denied);
  assert.deepEqual({...await db.prepare('SELECT status,version FROM case_capability_memberships WHERE staff_email=?').bind(future).first()},{status:'revoked',version:2});
  assert.deepEqual({...await db.prepare('SELECT status,version FROM case_capability_grants WHERE id=?').bind('fixture-future-grant').first()},{status:'revoked',version:2});
});

test('real local D1 rolls back deletion if revocation fails and rejects a re-added admin', async () => {
  needCapabilities();
  const require=createRequire(import.meta.url),{Miniflare,convertV4MiniflareOptions}=require('miniflare'),{unstable_splitSqlQuery}=require('wrangler');
  const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:"export default {fetch(){return new Response('fixture')}}",
    compatibilityDate:'2025-10-01',host:'127.0.0.1',port:0,d1Databases:{DB:'case-removal-synthetic'}}));
  try {
    const db=await mf.getD1Database('DB'),dir=new URL('../../migrations/',import.meta.url);
    for(const name of readdirSync(dir).filter(f=>f.endsWith('.sql')).sort())
      await db.batch(unstable_splitSqlQuery(readFileSync(new URL(name,dir),'utf8')).map(sql=>db.prepare(sql)));
    await run(db,"INSERT INTO admins(email,added_by,added_at) VALUES (?,'fixture','2000-01-01T00:00:00.000Z')",actor);
    await seedCases(db); await seedAuthority(db);
    await run(db,'CREATE TABLE fixture_private_write (value TEXT NOT NULL)');
    const snapshot=await capabilities.requireCaseCapability({DB:db},request(),actor);
    const guard=await capabilities.prepareCaseCapabilityGuard({DB:db},request(),actor,snapshot);
    await run(db,"CREATE TRIGGER fixture_block_revoke BEFORE UPDATE ON case_capability_grants BEGIN SELECT RAISE(ABORT,'fixture failure'); END");
    await assert.rejects(run(db,'DELETE FROM admins WHERE email=?',actor));
    assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM admins WHERE email=?').bind(actor).first()).n,1);
    assert.equal((await db.prepare('SELECT status FROM case_capability_memberships WHERE staff_email=?').bind(actor).first()).status,'active');
    await run(db,'DROP TRIGGER fixture_block_revoke');
    await run(db,'DELETE FROM admins WHERE email=? COLLATE NOCASE',actor.toUpperCase());
    await run(db,"INSERT INTO admins(email,added_by,added_at) VALUES (?,'fixture','2000-01-01T00:00:00.000Z')",actor);
    await assert.rejects(capabilities.requireCaseCapability({DB:db},request(),actor),denied);
    await assert.rejects(db.batch([guard.assertion,db.prepare("INSERT INTO fixture_private_write VALUES ('fixture')"),guard.release]));
    assert.equal(await count(db,'fixture_private_write'),0);
    for (const [number,operation] of [
      [1,async () => run(db,"INSERT OR REPLACE INTO admins(email,added_by,added_at) VALUES (?,'fixture','2000-01-01T00:00:00.000Z')",actor)],
      [2,async () => { await run(db,'UPDATE admins SET email=? WHERE email=?','renamed@example.test',actor); await run(db,'UPDATE admins SET email=? WHERE email=?',actor,'renamed@example.test'); }],
    ]) {
      await run(db,"UPDATE case_capability_memberships SET status='active',version=version+1,approval_ref=? WHERE staff_email=?",`fixture-renew-${number}`,actor);
      const member=await db.prepare('SELECT version FROM case_capability_memberships WHERE staff_email=?').bind(actor).first();
      await run(db, `INSERT INTO case_capability_grants(id,case_kind,case_id,staff_email,capability,purpose,status,version,
        membership_version,policy_revision,approval_ref,approved_by,valid_from,expires_at)
        VALUES (?,'tenancy',1,?,'sensitive_finance','arrears_management','active',1,?,1,?,
          'fixture-operator','2000-01-01T00:00:00.000Z','2999-01-01T00:00:00.000Z')`,
        `fixture-renewed-grant-${number}`,actor,member.version,`fixture-renewed-approval-${number}`);
      const renewed=await capabilities.requireCaseCapability({DB:db},request(),actor);
      const renewedGuard=await capabilities.prepareCaseCapabilityGuard({DB:db},request(),actor,renewed);
      await operation();
      await assert.rejects(capabilities.requireCaseCapability({DB:db},request(),actor),denied);
      await assert.rejects(db.batch([renewedGuard.assertion,db.prepare("INSERT INTO fixture_private_write VALUES ('fixture')"),renewedGuard.release]));
    }
    assert.equal(await count(db,'fixture_private_write'),0);
    assert.deepEqual((await db.prepare('PRAGMA foreign_key_check').all()).results,[]);
  } finally { await mf.dispose(); }
});

test('a grant revoked after preflight aborts the entire D1 batch before private writes', async () => {
  needCapabilities();
  const db=makeDb(); await seedCases(db); await seedAuthority(db);
  await run(db,'CREATE TABLE fixture_private_write (value TEXT NOT NULL)');
  const snapshot=await capabilities.requireCaseCapability({DB:db},request(),actor);
  const guard=await capabilities.prepareCaseCapabilityGuard({DB:db},request(),actor,snapshot);
  await run(db,"UPDATE case_capability_grants SET status='revoked',version=version+1 WHERE id='fixture-grant'");
  await assert.rejects(db.batch([guard.assertion,db.prepare("INSERT INTO fixture_private_write VALUES ('fixture')"),guard.release]));
  assert.equal(await count(db,'fixture_private_write'),0);
  assert.equal(await count(db,'case_capability_batch_assertions'),0);
});

test('stale membership, wrong scope or missing retention cannot authorize a write', async () => {
  needCapabilities();
  const db=makeDb(); await seedCases(db); await seedAuthority(db);
  await run(db,'CREATE TABLE fixture_private_write (value TEXT NOT NULL)');
  const snapshot=await capabilities.requireCaseCapability({DB:db},request(),actor);
  const guard=await capabilities.prepareCaseCapabilityGuard({DB:db},request(),actor,snapshot);
  await run(db,"UPDATE case_purpose_policies SET status='revoked',revision=revision+1 WHERE purpose='arrears_management'");
  await assert.rejects(db.batch([guard.assertion,db.prepare("INSERT INTO fixture_private_write VALUES ('fixture')"),guard.release]));
  assert.equal(await count(db,'fixture_private_write'),0);
  await assert.rejects(capabilities.prepareCaseCapabilityGuard({DB:db},request({caseRef:{kind:'tenancy',id:2}}),actor,snapshot),denied);
});

test('real local D1 rolls back a late write when membership is revoked', async () => {
  needCapabilities();
  const require=createRequire(import.meta.url),{Miniflare,convertV4MiniflareOptions}=require('miniflare'),{unstable_splitSqlQuery}=require('wrangler');
  const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:"export default {fetch(){return new Response('fixture')}}",
    compatibilityDate:'2025-10-01',host:'127.0.0.1',port:0,d1Databases:{DB:'case-capability-synthetic'}}));
  try {
    const db=await mf.getD1Database('DB'),dir=new URL('../../migrations/',import.meta.url);
    for(const name of readdirSync(dir).filter(f=>f.endsWith('.sql')).sort())
      await db.batch(unstable_splitSqlQuery(readFileSync(new URL(name,dir),'utf8')).map(sql=>db.prepare(sql)));
    await run(db,"INSERT INTO admins(email,added_by,added_at) VALUES (?,'fixture','2000-01-01T00:00:00.000Z')",actor);
    await seedCases(db); await seedAuthority(db);
    await run(db,'CREATE TABLE fixture_private_write (value TEXT NOT NULL)');
    const snapshot=await capabilities.requireCaseCapability({DB:db},request(),actor);
    const guard=await capabilities.prepareCaseCapabilityGuard({DB:db},request(),actor,snapshot);
    await run(db,"UPDATE case_capability_memberships SET status='revoked',version=version+1 WHERE case_id=1");
    await assert.rejects(db.batch([guard.assertion,db.prepare("INSERT INTO fixture_private_write VALUES ('fixture')"),guard.release]));
    assert.equal(await count(db,'fixture_private_write'),0);
    assert.equal(await count(db,'case_capability_batch_assertions'),0);
    await run(db,"UPDATE case_capability_grants SET status='revoked',version=version+1 WHERE id='fixture-grant'");
    await run(db,"UPDATE case_capability_memberships SET status='active',version=version+1,approval_ref='fixture-new-approval' WHERE case_id=1");
    await run(db, `INSERT INTO case_capability_grants(id,case_kind,case_id,staff_email,capability,purpose,status,version,
      membership_version,policy_revision,approval_ref,approved_by,valid_from,expires_at)
      VALUES ('fixture-grant-new','tenancy',1,?,'sensitive_finance','arrears_management','active',1,3,1,
        'fixture-new-grant','fixture-operator','2000-01-01T00:00:00.000Z','2999-01-01T00:00:00.000Z')`,actor);
    const next=await capabilities.requireCaseCapability({DB:db},request(),actor);
    const permitted=await capabilities.prepareCaseCapabilityGuard({DB:db},request(),actor,next);
    await db.batch([permitted.assertion,db.prepare("INSERT INTO fixture_private_write VALUES ('fixture')"),permitted.release]);
    assert.equal(await count(db,'fixture_private_write'),1);
    assert.equal(await count(db,'case_capability_batch_assertions'),0);
    assert.deepEqual((await db.prepare('PRAGMA foreign_key_check').all()).results,[]);
  } finally { await mf.dispose(); }
});
