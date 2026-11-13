import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { makeEnv, call, adminCookie } from './helpers.mjs';
const require=createRequire(import.meta.url);
const {Miniflare,convertV4MiniflareOptions}=require('miniflare');
const {unstable_splitSqlQuery}=require('wrangler');
const migrations=new URL('../../migrations/',import.meta.url);
const publicForm={operation:'rent',name:'Test person',email:'pre10-d1@example.test',phone:'+447700900321',
  budget_max:2000,bedrooms_min:1,privacy:true,marketing:false,turnstile:'fixture'};
async function database() {
  const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:"export default { fetch() { return new Response('fixture') } }",
    compatibilityDate:'2025-10-01',host:'127.0.0.1',port:0,d1Databases:{DB:'pre10-cas-synthetic'}}));
  const DB=await mf.getD1Database('DB');
  for(const file of readdirSync(migrations).filter(n=>n.endsWith('.sql')).sort()){
    const statements=unstable_splitSqlQuery(readFileSync(new URL(file,migrations),'utf8')).map(sql=>DB.prepare(sql));
    if(statements.length)await DB.batch(statements);
  }
  return {mf,DB};
}
async function withClock(stamp,fn){
  const Original=globalThis.Date;class FixedDate extends Original{constructor(...a){super(...(a.length?a:[stamp]));}static now(){return Original.parse(stamp);}}
  globalThis.Date=FixedDate;try{return await fn();}finally{globalThis.Date=Original;}
}
async function withTurnstile(fn){const original=globalThis.fetch;globalThis.fetch=async(input,init)=>String(input).startsWith('https://challenges.cloudflare.com/')
  ?new Response(JSON.stringify({success:true,hostname:'hampton.test'})):original(input,init);
  try{return await fn();}finally{globalThis.fetch=original;}}

test('D1 serializes contact versions, public withdrawal, events and rollback on two searches',async()=>{
  const {mf,DB}=await database();
  try {
    const stamp=new Date().toISOString(),cookie=await adminCookie();
    await DB.prepare('INSERT INTO admins(email,added_at) VALUES (?,?)').bind('admin@example.test',stamp).run();
    await DB.prepare(`INSERT INTO contacts(name,email,phone,marketing_opt_in_at,last_activity_at,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?)`).bind(publicForm.name,publicForm.email,publicForm.phone,stamp,stamp,stamp,stamp).run();
    for(const operation of ['rent','buy'])await DB.prepare(`INSERT INTO applicants(contact_id,operation,source,search_state,created_at,updated_at)
      VALUES(1,?,'phone','active',?,?)`).bind(operation,stamp,stamp).run();
    const env={...makeEnv(),DB};
    await withClock(stamp,async()=>{
      const update=marketing=>call(env,'PUT','/admin/contacts/1',{cookie,body:{updated_at:stamp,marketing}});
      const results=await Promise.all([update(false),update(false)]);
      assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
      const after=await DB.prepare('SELECT marketing_opt_in_at,updated_at FROM contacts WHERE id=1').first();
      assert.equal(after.marketing_opt_in_at,null);
      assert.ok(Date.parse(after.updated_at)>Date.parse(stamp));
      assert.equal((await DB.prepare("SELECT COUNT(*) AS n FROM events WHERE type='contact.consent_changed'").first()).n,1);
      assert.deepEqual((await DB.prepare('SELECT search_state FROM applicants ORDER BY id').all()).results.map(x=>x.search_state),['active','active']);
      const regrant=await call(env,'PUT','/admin/contacts/1',{cookie,body:{updated_at:after.updated_at,marketing:true}});
      assert.equal(regrant.status,200);
      const oldVersion=regrant.data.contact.updated_at;
      await withTurnstile(async()=>{
        assert.equal((await call(env,'POST','/applicants',{body:publicForm})).status,201);
      });
      const withdrawn=await DB.prepare('SELECT marketing_opt_in_at,updated_at FROM contacts WHERE id=1').first();
      assert.equal(withdrawn.marketing_opt_in_at,null);
      assert.ok(Date.parse(withdrawn.updated_at)>Date.parse(oldVersion));
      assert.equal((await call(env,'PUT','/admin/contacts/1',{cookie,body:{updated_at:oldVersion,marketing:true}})).status,409);
      assert.equal((await DB.prepare("SELECT COUNT(*) AS n FROM events WHERE type='contact.consent_changed'").first()).n,3);

      // An opt-in arriving after the public lookup still loses to the public
      // objection, and the audit event records the value actually withdrawn.
      let injected=false;
      const lateDB={prepare:DB.prepare.bind(DB),batch:async stmts=>{
        if(!injected){injected=true;
          const current=await DB.prepare('SELECT updated_at FROM contacts WHERE id=1').first();
          assert.equal((await call(env,'PUT','/admin/contacts/1',{cookie,body:{updated_at:current.updated_at,marketing:true}})).status,200);
        }
        return DB.batch(stmts);
      }};
      await withTurnstile(async()=>assert.equal((await call({...env,DB:lateDB},'POST','/applicants',{body:publicForm})).status,201));
      assert.equal((await DB.prepare('SELECT marketing_opt_in_at FROM contacts WHERE id=1').first()).marketing_opt_in_at,null);
      const last=await DB.prepare("SELECT actor,data FROM events WHERE type='contact.consent_changed' ORDER BY id DESC LIMIT 1").first();
      assert.equal(last.actor,'public');assert.ok(JSON.parse(last.data).before.marketing_opt_in_at);
      assert.equal((await DB.prepare("SELECT COUNT(*) AS n FROM events WHERE type='contact.consent_changed'").first()).n,5);

      const current=await DB.prepare('SELECT updated_at FROM contacts WHERE id=1').first();
      assert.equal((await call(env,'PUT','/admin/contacts/1',{cookie,body:{updated_at:current.updated_at,marketing:true}})).status,200);
      let arrived=0,release;const gate=new Promise(resolve=>{release=resolve;});
      const concurrentDB={prepare:DB.prepare.bind(DB),batch:async stmts=>{if(++arrived===2)release();if(arrived<=2)await gate;return DB.batch(stmts);}};
      await withTurnstile(async()=>{
        const results=await Promise.all([call({...env,DB:concurrentDB},'POST','/applicants',{body:publicForm}),
          call({...env,DB:concurrentDB},'POST','/applicants',{body:publicForm})]);
        assert.deepEqual(results.map(r=>r.status),[201,201]);
      });
      assert.equal((await DB.prepare("SELECT COUNT(*) AS n FROM events WHERE type='contact.consent_changed'").first()).n,7);
      const beforeRegrant=await DB.prepare('SELECT updated_at FROM contacts WHERE id=1').first();
      assert.equal((await call(env,'PUT','/admin/contacts/1',{cookie,body:{updated_at:beforeRegrant.updated_at,marketing:true}})).status,200);
    });
    const before=await DB.prepare('SELECT marketing_opt_in_at,updated_at FROM contacts WHERE id=1').first();
    const faultDB={prepare:DB.prepare.bind(DB),batch:stmts=>DB.batch([...stmts.slice(0,2),DB.prepare('INSERT INTO contacts(name) VALUES(NULL)'),...stmts.slice(2)])};
    const original=console.error;console.error=()=>{};
    try { await withTurnstile(async()=>assert.equal((await call({...env,DB:faultDB},'POST','/applicants',{body:publicForm})).status,500)); }
    finally {console.error=original;}
    assert.deepEqual(await DB.prepare('SELECT marketing_opt_in_at,updated_at FROM contacts WHERE id=1').first(),before);
    assert.equal((await DB.prepare("SELECT COUNT(*) AS n FROM events WHERE type='contact.consent_changed'").first()).n,8);

    let changed=false;
    const identityDB={prepare:DB.prepare.bind(DB),batch:async stmts=>{
      if(!changed){changed=true;await DB.prepare('UPDATE contacts SET email=?,phone=? WHERE id=1')
        .bind('changed-pre10-d1@example.test','+447700900322').run();}
      return DB.batch(stmts);
    }};
    const eventsBefore=(await DB.prepare('SELECT COUNT(*) AS n FROM events').first()).n;
    await withTurnstile(async()=>{
      const result=await call({...env,DB:identityDB},'POST','/applicants',{body:publicForm});
      assert.equal(result.status,503);assert.match(result.data.error,/try again/i);
    });
    assert.equal((await DB.prepare('SELECT marketing_opt_in_at FROM contacts WHERE id=1').first()).marketing_opt_in_at,before.marketing_opt_in_at);
    assert.equal((await DB.prepare('SELECT COUNT(*) AS n FROM events').first()).n,eventsBefore);

    // D1 handles valid offsets and malformed legacy tokens without allowing a
    // previously observed token to be reused.
    for(const [i,oldVersion] of ['2030-01-01T13:00:00.123+01:00','legacy-ambiguous'].entries()){
      const inserted=await DB.prepare(`INSERT INTO contacts(name,email,marketing_opt_in_at,last_activity_at,created_at,updated_at)
        VALUES(?,?,?,?,?,?)`).bind('Legacy fixture',`legacy-pre10-${i}@example.test`,stamp,stamp,stamp,oldVersion).run();
      const id=inserted.meta.last_row_id;
      const saved=await call(env,'PUT',`/admin/contacts/${id}`,{cookie,body:{updated_at:oldVersion,marketing:false}});
      assert.equal(saved.status,200);assert.notEqual(saved.data.contact.updated_at,oldVersion);
      if(i===0)assert.ok(Date.parse(saved.data.contact.updated_at)>Date.parse(oldVersion));
      assert.equal((await call(env,'PUT',`/admin/contacts/${id}`,{cookie,body:{updated_at:oldVersion,marketing:true}})).status,409);
    }
  }finally{await mf.dispose();}
});
