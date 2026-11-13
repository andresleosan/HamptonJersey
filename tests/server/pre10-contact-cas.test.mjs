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


test('a later public objection fences an earlier pending opt-in even when consent was already absent', async () => {
  const env=makeEnv(),stamp=new Date().toISOString(),id=fixture(env,stamp,null),cookie=await adminCookie();
  await withClock(stamp,()=>withTurnstile(async()=>{
    assert.equal((await call(env,'POST','/applicants',{body:{...form,marketing:true}})).status,201);
    assert.equal(contact(env,id).updated_at,stamp);
    assert.equal((await call(env,'POST','/applicants',{body:form})).status,201);
    const after=contact(env,id),events=consentEvents(env,id);
    assert.equal(after.marketing_opt_in_at,null);assert.notEqual(after.updated_at,stamp);
    assert.equal(events.length,1);assert.deepEqual(JSON.parse(events[0].data),
      {before:{marketing_opt_in_at:null},after:{marketing_opt_in_at:null},objection_to_pending:true});
    assert.equal((await call(env,'PUT',`/admin/contacts/${id}`,{cookie,body:{updated_at:stamp,marketing:true}})).status,409);
    assert.equal((await call(env,'POST','/applicants',{body:form})).status,201);
    assert.equal(contact(env,id).updated_at,after.updated_at,'a repeated objection with no new proposal is a true no-op');
    assert.equal(consentEvents(env,id).length,1);
    assert.equal((await call(env,'POST','/applicants',{body:{...form,marketing:true}})).status,201);
    assert.equal((await call(env,'POST','/applicants',{body:form})).status,201);
    assert.notEqual(contact(env,id).updated_at,after.updated_at);
    assert.equal(consentEvents(env,id).length,2);
  }));
});

test('two concurrent objections to one pending request create one fence and one event', async () => {
  const env=makeEnv(),stamp=new Date().toISOString(),id=fixture(env,stamp,null);
  await withTurnstile(async()=>{
    assert.equal((await call(env,'POST','/applicants',{body:{...form,marketing:true}})).status,201);
    const batch=env.DB.batch.bind(env.DB);let arrived=0,release;const gate=new Promise(r=>{release=r;});
    env.DB.batch=async stmts=>{if(++arrived===2)release();if(arrived<=2)await gate;return batch(stmts);};
    const results=await Promise.all([call(env,'POST','/applicants',{body:form}),call(env,'POST','/applicants',{body:form})]);
    assert.deepEqual(results.map(r=>r.status),[201,201]);assert.equal(consentEvents(env,id).length,1);
  });
});

test('a failed batch rolls back a fence for an outstanding opt-in request', async () => {
  const env=makeEnv(),stamp=new Date().toISOString(),id=fixture(env,stamp,null);
  await withTurnstile(async()=>{
    assert.equal((await call(env,'POST','/applicants',{body:{...form,marketing:true}})).status,201);
    const batch=env.DB.batch.bind(env.DB);
    env.DB.batch=stmts=>batch([...stmts.slice(0,2),env.DB.prepare('INSERT INTO contacts(name) VALUES(NULL)'),...stmts.slice(2)]);
    const original=console.error;console.error=()=>{};
    try {assert.equal((await call(env,'POST','/applicants',{body:form})).status,500);} finally {console.error=original;}
    assert.equal(contact(env,id).updated_at,stamp);assert.equal(consentEvents(env,id).length,0);
  });
});

test('a public refusal without consent or an earlier request leaves the contact version unchanged', async () => {
  const env=makeEnv(),stamp=new Date().toISOString(),id=fixture(env,stamp,null);
  await withTurnstile(async()=>{
    assert.equal((await call(env,'POST','/applicants',{body:form})).status,201);
    assert.equal((await call(env,'POST','/applicants',{body:form})).status,201);
    assert.equal(contact(env,id).updated_at,stamp);assert.equal(consentEvents(env,id).length,0);
  });
});

test('an unreadable earlier submission is conservatively fenced without breaking the public request', async () => {
  const env=makeEnv(),stamp=new Date().toISOString(),id=fixture(env,stamp,null);
  env.DB.raw.prepare(`INSERT INTO events(at,actor,entity_type,entity_id,type,data)
    VALUES(?,'public','contact',?,'applicant.duplicate_submitted',?)`).run(stamp,String(id),'not-json');
  await withClock(stamp,()=>withTurnstile(async()=>{
    assert.equal((await call(env,'POST','/applicants',{body:form})).status,201);
    assert.notEqual(contact(env,id).updated_at,stamp);assert.equal(consentEvents(env,id).length,1);
  }));
});

test('an invalid prior consent event is not treated as evidence that an old request was safely closed', async () => {
  const env=makeEnv(),stamp=new Date().toISOString(),id=fixture(env,stamp,null),cookie=await adminCookie();
  const db=env.DB.raw;
  db.prepare(`INSERT INTO events(at,actor,entity_type,entity_id,type,data) VALUES(?,'public','contact',?,'applicant.duplicate_submitted',?)`)
    .run(stamp,String(id),JSON.stringify({marketing:true}));
  db.prepare(`INSERT INTO events(at,actor,entity_type,entity_id,type,data) VALUES(?,'public','contact',?,'contact.consent_changed',?)`)
    .run(stamp,String(id),JSON.stringify({before:{marketing_opt_in_at:'2026-02-30T12:00:00Z'},after:{marketing_opt_in_at:null}}));
  await withClock(stamp,()=>withTurnstile(async()=>{
    assert.equal((await call(env,'POST','/applicants',{body:form})).status,201);
    assert.notEqual(contact(env,id).updated_at,stamp);
    assert.equal((await call(env,'PUT',`/admin/contacts/${id}`,{cookie,body:{updated_at:stamp,marketing:true}})).status,409);
    const last=JSON.parse(consentEvents(env,id).at(-1).data);
    assert.equal(last.objection_with_incomplete_history,true);
  }));
});

test('long histories use the existing index and receive a conservative fence within a fixed row budget', async () => {
  const env=makeEnv(),stamp=new Date().toISOString(),id=fixture(env,stamp,null),cookie=await adminCookie(),db=env.DB.raw;
  const add=db.prepare(`INSERT INTO events(at,actor,entity_type,entity_id,type,data) VALUES(?,'system','contact',?,'contact.updated',NULL)`);
  db.exec('BEGIN');for(let i=0;i<1000;i++)add.run(stamp,String(id));db.exec('COMMIT');
  const plan=db.prepare(`EXPLAIN QUERY PLAN SELECT id,type,data FROM events INDEXED BY events_entity
    WHERE entity_type='contact' AND entity_id=? ORDER BY at DESC,id DESC LIMIT 65`).all(String(id)).map(x=>x.detail).join(' ');
  assert.match(plan,/events_entity/);assert.doesNotMatch(plan,/TEMP B-TREE/i);
  await withClock(stamp,()=>withTurnstile(async()=>{
    assert.equal((await call(env,'POST','/applicants',{body:form})).status,201);
    assert.notEqual(contact(env,id).updated_at,stamp);
    assert.equal(JSON.parse(consentEvents(env,id).at(-1).data).objection_with_incomplete_history,true);
    assert.equal((await call(env,'PUT',`/admin/contacts/${id}`,{cookie,body:{updated_at:stamp,marketing:true}})).status,409);
  }));
});

test('an oversized prior submission is treated as unknown and never grants an old opt-in',async()=>{
  const env=makeEnv(),stamp=new Date().toISOString(),id=fixture(env,stamp,null),cookie=await adminCookie();
  const data=JSON.stringify({marketing:true,extra:'x'.repeat(33000)});
  env.DB.raw.prepare(`INSERT INTO events(at,actor,entity_type,entity_id,type,data)
    VALUES(?,'public','contact',?,'applicant.duplicate_submitted',?)`).run(stamp,String(id),data);
  await withClock(stamp,()=>withTurnstile(async()=>{
    assert.equal((await call(env,'POST','/applicants',{body:form})).status,201);
    assert.equal(JSON.parse(consentEvents(env,id).at(-1).data).objection_with_incomplete_history,true);
    assert.notEqual(contact(env,id).updated_at,stamp);
    assert.equal((await call(env,'PUT',`/admin/contacts/${id}`,{cookie,body:{updated_at:stamp,marketing:true}})).status,409);
  }));
});

test('64 complete records allow a true no-op; the 65th makes the history conservatively unknown', async () => {
  for (const n of [64,65]) {
    const env=makeEnv(),stamp=new Date().toISOString(),id=fixture(env,stamp,null),db=env.DB.raw;
    const add=db.prepare(`INSERT INTO events(at,actor,entity_type,entity_id,type,data) VALUES(?,'system','contact',?,'contact.updated',NULL)`);
    db.exec('BEGIN');for(let i=0;i<n;i++)add.run(stamp,String(id));db.exec('COMMIT');
    await withClock(stamp,()=>withTurnstile(async()=>{
      assert.equal((await call(env,'POST','/applicants',{body:form})).status,201);
      assert.equal(consentEvents(env,id).length,n===64?0:1);
      if(n===64)assert.equal(contact(env,id).updated_at,stamp);
      else assert.equal(JSON.parse(consentEvents(env,id)[0].data).objection_with_incomplete_history,true);
    }));
  }
});
