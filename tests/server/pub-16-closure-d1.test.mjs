import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync,readdirSync} from 'node:fs';
import {recordRentalMarketingState} from '../../server/listing-editorial.js';
import {processExpiredRentalClosures} from '../../server/rental-closure-job.js';
import {readLive} from '../../server/routes/public.js';

const require=createRequire(import.meta.url);
const {Miniflare,convertV4MiniflareOptions}=require('miniflare');
const {unstable_splitSqlQuery}=require('wrangler');
const T0='2026-10-07T10:00:00.000Z',id='HE-R001',actor='admin@example.test';
const proposal=new URL('../../docs/roadmap/work/PUB-16/rental-closure.proposed.sql',import.meta.url);
const originalClock="strftime('%Y-%m-%dT%H:%M:%fZ','now')";

test('disposable D1: gated close, replay, correction, rollback, deadline and recovery',async()=>{
  const mf=new Miniflare(convertV4MiniflareOptions({modules:true,host:'127.0.0.1',port:0,
    compatibilityDate:'2025-10-01',script:"export default {fetch(){return new Response('fixture')}}",
    d1Databases:{DB:'pub16-local-fixture'}}));
  try {
    const DB=await mf.getD1Database('DB'),dir=new URL('../../migrations/',import.meta.url);
    const install=async file=>DB.batch(unstable_splitSqlQuery(readFileSync(file,'utf8')).map(sql=>DB.prepare(sql)));
    for(const file of readdirSync(dir).filter(name=>name.endsWith('.sql')).sort())await install(new URL(file,dir));
    // The proposal is installed only in this disposable database, never in the migrations queue.
    await install(proposal);
    await DB.prepare(`INSERT INTO listings(id,use,title,operation,availability,country,location,viewings_enabled,
      published,specs,created_at,updated_at,updated_by) VALUES(?,'residential','Synthetic rental','rent','to_let',
      'Jersey','St Saviour',1,1,'[]',?,?,'fixture')`).bind(id,T0,T0).run();
    await DB.prepare(`INSERT INTO media(id,listing_id,r2_key,origin,kind,label,public,position,content_type,created_at)
      VALUES('A00001',?,'synthetic/document.pdf','hampton','document','Synthetic',0,0,'application/pdf',?)`).bind(id,T0).run();
    const env={DB,PUB16_TIMED_CLOSURE_READY:'1',SITE_URL:'https://hampton.test'};
    const row=()=>DB.prepare('SELECT * FROM listings WHERE id=?').bind(id).first();
    const currentWindow=()=>DB.prepare("SELECT * FROM rental_closure_windows WHERE listing_id=? AND state='open'").bind(id).first();
    const command=(request_id,updated_at,action='let')=>({request_id,updated_at,action,
      reason_code:action==='let'?'completed':'correction',occurred_at:T0,evidence_refs:['media:A00001']});
    const execute=command=>recordRentalMarketingState(env,{id,actor,command});
    const close=command('first',T0),saved=await execute(close),first=await currentWindow();
    assert.equal(saved.replayed,false);assert.equal((await row()).availability,'let_agreed');
    assert.equal(Date.parse(first.due_at)-Date.parse(first.opened_at),86400000);
    assert.equal((await execute(close)).replayed,true);assert.equal((await currentWindow()).opened_at,first.opened_at);
    await assert.rejects(execute(command('second',(await row()).updated_at)),error=>error.status===409);
    assert.equal((await execute(command('correction',(await row()).updated_at,'return_to_market'))).changed,true);
    assert.equal((await row()).availability,'to_let');assert.equal(await currentWindow(),null);

    const before=await row(),eventCount=(await DB.prepare('SELECT COUNT(*) AS n FROM events').first()).n;
    await DB.prepare("CREATE TRIGGER fixture_fail_event BEFORE INSERT ON events WHEN NEW.type='listing.availability_changed' BEGIN SELECT RAISE(ABORT,'synthetic event failure'); END").run();
    await assert.rejects(execute(command('failed',before.updated_at)));
    assert.equal((await row()).availability,before.availability);assert.equal((await row()).updated_at,before.updated_at);
    assert.equal((await DB.prepare('SELECT COUNT(*) AS n FROM events').first()).n,eventCount);
    assert.equal(await currentWindow(),null);
    await DB.prepare('DROP TRIGGER fixture_fail_event').run();

    await execute(command('final',before.updated_at));const final=await currentWindow();
    let clock=new Date(Date.parse(final.due_at)-1).toISOString();
    env.DB={prepare:sql=>DB.prepare(sql.replaceAll(originalClock,`'${clock}'`)),batch:statements=>DB.batch(statements)};
    assert.equal((await readLive(env,id)).length,1);assert.equal((await processExpiredRentalClosures(env)).processed,0);
    clock=final.due_at;assert.equal((await readLive(env,id)).length,0);
    assert.equal((await row()).published,1,'read-time protection does not require the job');
    await DB.prepare("CREATE TRIGGER fixture_fail_withdraw BEFORE UPDATE OF published ON listings WHEN NEW.published=0 BEGIN SELECT RAISE(ABORT,'synthetic failure'); END").run();
    assert.equal((await processExpiredRentalClosures(env)).failed,1);
    assert.equal((await row()).published,1);
    assert.equal((await DB.prepare("SELECT COUNT(*) AS n FROM notifications WHERE task_key=? AND urgency='urgent' AND resolved_at IS NULL").bind(`pub16:withdrawal:${final.closure_id}`).first()).n,1);
    await DB.prepare('DROP TRIGGER fixture_fail_withdraw').run();
    assert.equal((await processExpiredRentalClosures(env)).withdrawn,1);
    assert.equal((await row()).published,0);
    assert.equal((await DB.prepare("SELECT COUNT(*) AS n FROM events WHERE type='listing.unpublished'").first()).n,1);
    await assert.rejects(execute(command('reopen',(await row()).updated_at,'return_to_market')),error=>error.status===409);
    await DB.prepare("UPDATE listings SET published=1,availability='to_let' WHERE id=?").bind(id).run();
    assert.equal((await readLive(env,id)).length,0,'an unrelated republication must not defeat withdrawal');
    assert.deepEqual((await DB.prepare('PRAGMA foreign_key_check').all()).results,[]);
  } finally {await mf.dispose();}
});
