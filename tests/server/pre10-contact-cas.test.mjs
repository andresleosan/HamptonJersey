import test from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, call, adminCookie } from './helpers.mjs';

const form = { operation: 'rent', name: 'Test person', email: 'pre10@example.test', phone: '+447700900321',
  budget_max: 2000, bedrooms_min: 1, privacy: true, marketing: false, turnstile: 'fixture' };

function fixture(env, version, marketing = version) {
  const db = env.DB.raw;
  const id = Number(db.prepare(`INSERT INTO contacts (name,email,phone,marketing_opt_in_at,last_activity_at,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?)`).run(form.name, form.email, form.phone, marketing, version, version, version).lastInsertRowid);
  for (const operation of ['rent','buy']) db.prepare(`INSERT INTO applicants
    (contact_id,operation,source,search_state,created_at,updated_at) VALUES (?,?,'phone','active',?,?)`)
    .run(id, operation, version, version);
  return id;
}
function contact(env, id) { return env.DB.raw.prepare('SELECT * FROM contacts WHERE id=?').get(id); }
function consentEvents(env, id) { return env.DB.raw.prepare("SELECT actor,data FROM events WHERE entity_type='contact' AND entity_id=? AND type='contact.consent_changed' ORDER BY id").all(String(id)); }
async function withClock(stamp, fn) {
  const Original = globalThis.Date;
  class FixedDate extends Original { constructor(...args) { super(...(args.length ? args : [stamp])); } static now() { return Original.parse(stamp); } }
  globalThis.Date = FixedDate;
  try { return await fn(); } finally { globalThis.Date = Original; }
}
async function withTurnstile(fn) {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ success: true, hostname: 'hampton.test' }));
  try { return await fn(); } finally { globalThis.fetch = original; }
}

test('a contact withdrawal advances a same-millisecond version, rejects a stale regrant and preserves both searches', async () => {
  const env=makeEnv(), stamp=new Date().toISOString(), id=fixture(env,stamp), cookie=await adminCookie();
  await withClock(stamp, async () => {
    const off=await call(env,'PUT',`/admin/contacts/${id}`,{cookie,body:{updated_at:stamp,marketing:false}});
    assert.equal(off.status,200);
    assert.notEqual(off.data.contact.updated_at,stamp);
    assert.ok(Date.parse(off.data.contact.updated_at)>Date.parse(stamp));
    const stale=await call(env,'PUT',`/admin/contacts/${id}`,{cookie,body:{updated_at:stamp,marketing:true}});
    assert.equal(stale.status,409);
    assert.equal(contact(env,id).marketing_opt_in_at,null);
    const noop=await call(env,'PUT',`/admin/contacts/${id}`,{cookie,body:{updated_at:off.data.contact.updated_at,marketing:false}});
    assert.equal(noop.status,200);
    assert.equal(noop.data.contact.updated_at,off.data.contact.updated_at);
    assert.equal(consentEvents(env,id).length,1);
    assert.deepEqual(env.DB.raw.prepare('SELECT search_state FROM applicants WHERE contact_id=? ORDER BY id').all(id).map(r=>r.search_state),['active','active']);
  });
});

test('a backward clock cannot move a valid contact version backwards', async () => {
  const env=makeEnv(), stamp=new Date().toISOString(), future=new Date(Date.parse(stamp)+60000).toISOString();
  const id=fixture(env,future), cookie=await adminCookie();
  await withClock(stamp, async () => {
    const off=await call(env,'PUT',`/admin/contacts/${id}`,{cookie,body:{updated_at:future,marketing:false}});
    assert.equal(off.status,200);
    assert.ok(Date.parse(off.data.contact.updated_at)>Date.parse(future));
    assert.equal((await call(env,'PUT',`/admin/contacts/${id}`,{cookie,body:{updated_at:future,marketing:true}})).status,409);
  });
});

test('an ambiguous legacy version changes without inventing a parseable timestamp and still rejects its old token', async () => {
  const env=makeEnv(), stamp=new Date().toISOString(), legacy='legacy-version', id=fixture(env,legacy,stamp), cookie=await adminCookie();
  await withClock(stamp, async () => {
    const off=await call(env,'PUT',`/admin/contacts/${id}`,{cookie,body:{updated_at:legacy,marketing:false}});
    assert.equal(off.status,200);
    assert.notEqual(off.data.contact.updated_at,legacy);
    assert.equal((await call(env,'PUT',`/admin/contacts/${id}`,{cookie,body:{updated_at:legacy,marketing:true}})).status,409);
    const again=await call(env,'PUT',`/admin/contacts/${id}`,{cookie,body:{updated_at:off.data.contact.updated_at,marketing:true}});
    assert.equal(again.status,200);
    assert.notEqual(again.data.contact.updated_at,off.data.contact.updated_at);
    assert.equal((await call(env,'PUT',`/admin/contacts/${id}`,{cookie,body:{updated_at:off.data.contact.updated_at,marketing:false}})).status,409);
  });
});

test('a public withdrawal advances the current version and blocks a stale staff regrant', async () => {
  const env=makeEnv(), stamp=new Date().toISOString(), id=fixture(env,stamp), cookie=await adminCookie();
  await withClock(stamp,()=>withTurnstile(async()=>{
    const response=await call(env,'POST','/applicants',{body:form});
    assert.equal(response.status,201);
    assert.deepEqual(response.data,{ok:true});
    const current=contact(env,id);
    assert.equal(current.marketing_opt_in_at,null);
    assert.ok(Date.parse(current.updated_at)>Date.parse(stamp));
    assert.equal((await call(env,'PUT',`/admin/contacts/${id}`,{cookie,body:{updated_at:stamp,marketing:true}})).status,409);
    assert.equal(consentEvents(env,id).length,1);
  }));
});

test('a public objection observes a late opt-in inside the batch and records its actual prior value', async () => {
  const env=makeEnv(), stamp=new Date().toISOString(), id=fixture(env,stamp,null), actual='2026-01-01T00:00:00.000Z';
  const batch=env.DB.batch.bind(env.DB);let intercepted=false;
  env.DB.batch=stmts=>{ if(!intercepted){intercepted=true;env.DB.raw.prepare('UPDATE contacts SET marketing_opt_in_at=? WHERE id=?').run(actual,id);} return batch(stmts); };
  await withTurnstile(async()=>{
    const response=await call(env,'POST','/applicants',{body:form});
    assert.equal(response.status,201);
    assert.equal(contact(env,id).marketing_opt_in_at,null);
    const events=consentEvents(env,id);
    assert.equal(events.length,1);
    assert.deepEqual(JSON.parse(events[0].data),{before:{marketing_opt_in_at:actual},after:{marketing_opt_in_at:null}});
  });
});

test('two simultaneous public objections write one consent event', async () => {
  const env=makeEnv(), stamp=new Date().toISOString(), id=fixture(env,stamp);const batch=env.DB.batch.bind(env.DB);
  let arrived=0, release;const gate=new Promise(resolve=>{release=resolve;});
  env.DB.batch=async stmts=>{if(++arrived===2)release();if(arrived<=2)await gate;return batch(stmts);};
  await withTurnstile(async()=>{
    const responses=await Promise.all([call(env,'POST','/applicants',{body:form}),call(env,'POST','/applicants',{body:form})]);
    assert.deepEqual(responses.map(r=>r.status),[201,201]);
    assert.equal(contact(env,id).marketing_opt_in_at,null);
    assert.equal(consentEvents(env,id).length,1);
  });
});

test('a failed public batch rolls back the withdrawal and its event', async () => {
  const env=makeEnv(), stamp=new Date().toISOString(), id=fixture(env,stamp), batch=env.DB.batch.bind(env.DB);
  env.DB.batch=stmts=>batch([...stmts.slice(0,2),env.DB.prepare('INSERT INTO contacts(name) VALUES(NULL)'),...stmts.slice(2)]);
  await withTurnstile(async()=>{
    const original=console.error;console.error=()=>{};
    try { assert.equal((await call(env,'POST','/applicants',{body:form})).status,500); }
    finally {console.error=original;}
    assert.equal(contact(env,id).marketing_opt_in_at,stamp);
    assert.equal(consentEvents(env,id).length,0);
  });
});

test('a public objection never withdraws or discloses to a contact whose identifiers changed before the batch', async () => {
  const env=makeEnv(), stamp=new Date().toISOString(), id=fixture(env,stamp), batch=env.DB.batch.bind(env.DB);let intercepted=false;
  env.DB.batch=stmts=>{if(!intercepted){intercepted=true;env.DB.raw.prepare('UPDATE contacts SET email=?,phone=? WHERE id=?')
    .run('changed-pre10@example.test','+447700900322',id);}return batch(stmts);};
  await withTurnstile(async()=>{
    const result=await call(env,'POST','/applicants',{body:form});
    assert.equal(result.status,503);
    assert.match(result.data.error,/try again/i);
    assert.equal(contact(env,id).marketing_opt_in_at,stamp);
    assert.equal(consentEvents(env,id).length,0);
    assert.equal(env.DB.raw.prepare("SELECT COUNT(*) AS n FROM events WHERE type='applicant.duplicate_submitted'").get().n,0);
  });
});

test('contact authorization, missing contact and timezone versions remain fail closed', async () => {
  const env=makeEnv(), stamp=new Date().toISOString(), offset='2030-01-01T13:00:00.123+01:00';
  const id=fixture(env,offset,stamp), cookie=await adminCookie();
  assert.equal((await call(env,'PUT',`/admin/contacts/${id}`,{body:{updated_at:offset,marketing:false}})).status,401);
  assert.equal((await call(env,'PUT','/admin/contacts/999999',{cookie,body:{updated_at:offset,marketing:false}})).status,404);
  await withClock(stamp,async()=>{
    const saved=await call(env,'PUT',`/admin/contacts/${id}`,{cookie,body:{updated_at:offset,marketing:false}});
    assert.equal(saved.status,200);assert.ok(Date.parse(saved.data.contact.updated_at)>Date.parse(offset));
    assert.equal((await call(env,'PUT',`/admin/contacts/${id}`,{cookie,body:{updated_at:offset,marketing:true}})).status,409);
  });
});
