// Disposable local D1; no remote database, production data or external requests.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { makeEnv, call, adminCookie, T0 } from './helpers.mjs';

const ROOT = new URL('../../',import.meta.url);
const require = createRequire(new URL('package.json',ROOT));
const { Miniflare, convertV4MiniflareOptions } = require('miniflare');
const { unstable_splitSqlQuery: split } = require('wrangler');
const plain = value => JSON.parse(JSON.stringify(value));
const writeBatch = statements => statements.some(s => /\bUPDATE\s+listings\b/i.test(s.sql));

function instrument(DB) {
  const controls = { before:null, overlap:null };
  const wrap = (raw,sql) => ({ raw,sql,bind:(...args)=>wrap(raw.bind(...args),sql),
    first:(...args)=>raw.first(...args),all:(...args)=>raw.all(...args),run:(...args)=>raw.run(...args) });
  const db = { prepare:sql=>wrap(DB.prepare(sql),sql),async batch(statements) {
    if (writeBatch(statements)) {
      if (controls.before) { const effect=controls.before;controls.before=null;await effect(); }
      if (controls.overlap) {
        const group=controls.overlap;
        if (++group.arrived===2) {controls.overlap=null;group.release();}
        await group.ready;
      }
    }
    return DB.batch(statements.map(s=>s.raw));
  } };
  return { db,before:fn=>{controls.before=fn;},overlap() {
    const group={arrived:0};group.ready=new Promise(resolve=>{group.release=resolve;});controls.overlap=group;
  } };
}

test('D1 local: media save rollback, ignored writes, concurrent revisions and preflight drift', async t => {
  const mf = new Miniflare(convertV4MiniflareOptions({modules:true,host:'127.0.0.1',port:0,
    compatibilityDate:'2025-10-01',script:'export default {fetch(){return new Response("fixture")}}',
    d1Databases:{DB:'pub11-media-save-synthetic'}}));
  try {
    const DB=await mf.getD1Database('DB'),dir=new URL('migrations/',ROOT);
    for (const file of readdirSync(dir).filter(name=>name.endsWith('.sql')).sort()) {
      const statements=split(readFileSync(new URL(file,dir),'utf8'));
      if (statements.length) await DB.batch(statements.map(sql=>DB.prepare(sql)));
    }
    await DB.prepare("INSERT INTO admins(email,added_at) VALUES('admin@example.test',?)").bind(T0).run();
    const scoped=instrument(DB),env=makeEnv();env.DB=scoped.db;
    const cookie=await adminCookie();
    const execute=(sql,...args)=>DB.prepare(sql).bind(...args).run();
    const get=(sql,...args)=>DB.prepare(sql).bind(...args).first();
    const clean=async()=>assert.equal((await get('SELECT COUNT(*) AS n FROM listing_event_context')).n,0);
    async function snapshot() {
      return plain(Object.fromEntries(await Promise.all(['listings','media','events','notifications','listing_event_context'].map(async table=>
        [table,(await DB.prepare(`SELECT * FROM ${table} ORDER BY ${table==='listing_event_context'?'listing_id':'id'}`).all()).results]))));
    }
    let next=200;
    async function fixture() {
      const number=next;next+=2;
      const id=`HE-R${number}`,other=`HE-R${number+1}`,a=`D${number}A`,b=`D${number}B`,cover=`D${number}C`;
      await DB.batch([id,other].map(listing=>DB.prepare(`INSERT INTO listings(id,use,title,operation,availability,created_at,updated_at)
        VALUES(?,'residential','Synthetic media fixture','sale','for_sale',?,?)`).bind(listing,T0,T0)));
      await DB.batch([a,b,cover].map((mid,index)=>DB.prepare(`INSERT INTO media(id,listing_id,r2_key,thumb_key,origin,kind,label,public,position,created_at)
        VALUES(?,?,?,?,'upload','photo',?,1,?,?)`).bind(mid,id,`synthetic/${mid}.jpg`,`synthetic/${mid}-thumb.jpg`,`Before ${mid}`,index,T0)));
      const item=(mid,index,label=`Saved ${mid}`)=>({id:mid,position:index,public:true,kind:'photo',label});
      const body={updated_at:T0,cover_media_id:a,items:[item(a,1),item(b,0)]};
      const save=payload=>call(env,'PUT',`/admin/listings/${id}/media`,{cookie,body:payload});
      return {id,other,a,b,cover,body,item,save};
    }

    await t.test('a second media error rolls back cover, version, event and first update',async()=>{
      const f=await fixture();
      await execute(`CREATE TRIGGER fixture_media_save_abort BEFORE UPDATE ON media WHEN NEW.id='${f.b}' BEGIN SELECT RAISE(ABORT,'synthetic media failure'); END`);
      const before=await snapshot();assert.equal((await f.save(f.body)).status,500);
      assert.deepEqual(await snapshot(),before);await clean();await execute('DROP TRIGGER fixture_media_save_abort');
    });

    await t.test('a silently ignored media update fails atomically with 409',async()=>{
      const f=await fixture();
      await execute(`CREATE TRIGGER fixture_media_save_ignore BEFORE UPDATE ON media WHEN NEW.id='${f.b}' BEGIN SELECT RAISE(IGNORE); END`);
      const before=await snapshot();assert.equal((await f.save(f.body)).status,409);
      assert.deepEqual(await snapshot(),before);await clean();await execute('DROP TRIGGER fixture_media_save_ignore');
    });

    await t.test('two writers of the same version leave one entire winning payload',async()=>{
      const f=await fixture();scoped.overlap();
      const bodies=[f.body,{...f.body,cover_media_id:f.b,items:[f.item(f.a,10,'Other A'),f.item(f.b,11,'Other B')]}];
      const responses=await Promise.all(bodies.map(f.save));assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);
      const winner=bodies[responses.findIndex(r=>r.status===200)];
      assert.equal((await get('SELECT cover_media_id FROM listings WHERE id=?',f.id)).cover_media_id,winner.cover_media_id);
      for(const desired of winner.items) {
        const actual=await get('SELECT * FROM media WHERE id=?',desired.id);
        for(const key of ['position','label','kind'])assert.equal(actual[key],desired[key]);
        assert.equal(actual.public,Number(desired.public));
      }
      assert.equal((await get("SELECT COUNT(*) AS n FROM events WHERE entity_type='listing' AND entity_id=?",f.id)).n,1);
      await clean();
    });

    await t.test('requested media moved after preflight are preserved without any partial save',async()=>{
      const f=await fixture();let concurrent;
      scoped.before(async()=>{await execute('UPDATE media SET listing_id=? WHERE id=?',f.other,f.b);concurrent=await snapshot();});
      assert.equal((await f.save(f.body)).status,409);assert.ok(concurrent);assert.deepEqual(await snapshot(),concurrent);await clean();
    });

    await t.test('a cover omitted from items is revalidated in the batch',async()=>{
      const f=await fixture();let concurrent;
      scoped.before(async()=>{await execute("UPDATE media SET origin='external',public=0 WHERE id=?",f.cover);concurrent=await snapshot();});
      assert.equal((await f.save({...f.body,cover_media_id:f.cover})).status,409);
      assert.ok(concurrent);assert.deepEqual(await snapshot(),concurrent);await clean();
    });

    await t.test('a deleted listing returns 404 without restoring media, history or context',async()=>{
      const f=await fixture();let concurrent;
      scoped.before(async()=>{await execute('DELETE FROM listings WHERE id=?',f.id);concurrent=await snapshot();});
      assert.equal((await f.save(f.body)).status,404);assert.ok(concurrent);assert.deepEqual(await snapshot(),concurrent);await clean();
    });
    assert.deepEqual((await DB.prepare('PRAGMA foreign_key_check').all()).results,[]);
  } finally {await mf.dispose();}
});
