// D1 semantics are exercised only in a disposable local Miniflare database with synthetic rows.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync,readdirSync} from 'node:fs';
import {recordPropertyQrRedirect,resolvePropertyQr,readPropertyQrStats} from '../../server/property-qr.js';

const require=createRequire(import.meta.url);
const {Miniflare,convertV4MiniflareOptions}=require('miniflare');
const {unstable_splitSqlQuery}=require('wrangler');
const migrations=new URL('../../migrations/',import.meta.url);
const proposal=new URL('../../docs/roadmap/work/ANA-10/property-qr.proposed.sql',import.meta.url);
const A='A'.repeat(22),B='B'.repeat(21)+'Q',at='2026-11-13T12:00:00Z';

test('D1 local: QR cap, atomic failure, deletion and aggregate coverage',async()=>{
  const mf=new Miniflare(convertV4MiniflareOptions({modules:true,
    script:'export default { fetch() { return new Response("fixture") } }',compatibilityDate:'2025-10-01',
    host:'127.0.0.1',port:0,d1Databases:{DB:'ana10-qr-synthetic'}}));
  try {
    const DB=await mf.getD1Database('DB');
    for(const file of readdirSync(migrations).filter(name=>name.endsWith('.sql')).sort()) {
      const statements=unstable_splitSqlQuery(readFileSync(new URL(file,migrations),'utf8'));
      if(statements.length)await DB.batch(statements.map(sql=>DB.prepare(sql)));
    }
    const statements=unstable_splitSqlQuery(readFileSync(proposal,'utf8'));
    await DB.batch(statements.map(sql=>DB.prepare(sql)));
    for(const [id,code] of [['HE-R100',A],['HE-R101',B]]) {
      await DB.prepare(`INSERT INTO listings(id,use,title,operation,availability,created_at,updated_at)
        VALUES(?,'residential','Fixture','sale','for_sale',?,?)`).bind(id,at,at).run();
      await DB.prepare('INSERT INTO property_qr_codes(listing_id,code,created_at,created_by) VALUES(?,?,?,?)')
        .bind(id,code,at,'staff@example.test').run();
    }
    const a=await resolvePropertyQr(DB,A),b=await resolvePropertyQr(DB,B);
    await DB.prepare("INSERT INTO property_qr_budget(day,n,capped) VALUES('2026-11-13',4999,0)").run();
    await DB.prepare("INSERT INTO property_qr_redirect_days(day,qr_id,redirects) VALUES('2026-11-13',?,4999)").bind(a.id).run();
    await Promise.all(Array.from({length:20},(_,i)=>recordPropertyQrRedirect(DB,i%2?a:b,new Date(at))));
    assert.deepEqual(await DB.prepare("SELECT n,capped FROM property_qr_budget WHERE day='2026-11-13'").first(),{n:5000,capped:1});
    assert.equal((await DB.prepare("SELECT SUM(redirects) n FROM property_qr_redirect_days WHERE day='2026-11-13'").first()).n,5000);
    const stats=await readPropertyQrStats(DB,'HE-R100','2026-11-13','2026-11-13');
    assert.equal(stats.capped,true);assert.equal(stats.coverage,'unknown');

    await DB.prepare(`CREATE TRIGGER test_qr_abort BEFORE INSERT ON property_qr_redirect_days
      WHEN NEW.day='2026-11-14' BEGIN SELECT RAISE(ABORT,'fixture'); END`).run();
    await assert.rejects(()=>recordPropertyQrRedirect(DB,a,new Date('2026-11-14T12:00:00Z')));
    assert.equal((await DB.prepare("SELECT COUNT(*) n FROM property_qr_budget WHERE day='2026-11-14'").first()).n,0);
    await DB.prepare('DROP TRIGGER test_qr_abort').run();

    await DB.prepare("DELETE FROM listings WHERE id='HE-R100'").run();
    await recordPropertyQrRedirect(DB,a,new Date('2026-11-15T12:00:00Z'));
    assert.equal(await resolvePropertyQr(DB,A),null);
    assert.equal((await DB.prepare("SELECT COUNT(*) n FROM property_qr_budget WHERE day='2026-11-15'").first()).n,0);
    assert.equal((await DB.prepare('SELECT COUNT(*) n FROM property_qr_retired_codes WHERE code=?').bind(A).first()).n,1);
  } finally { await mf.dispose(); }
});
