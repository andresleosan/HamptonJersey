import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeEnv, seedListing, T0 } from './helpers.mjs';
import { createPropertyQrCode, isPropertyQrCode, propertyQrUrl, resolvePropertyQr,
  recordPropertyQrRedirect, readPropertyQrStats } from '../../server/property-qr.js';
import { onRequestGet, onRequestHead } from '../../functions/r/[code].js';

const A = 'A'.repeat(22), B = 'B'.repeat(21)+'Q';
const schema = new URL('../../docs/roadmap/work/ANA-10/property-qr.proposed.sql', import.meta.url);
const row = (env,query,...args) => env.DB.raw.prepare(query).get(...args);
const run = (env,query,...args) => env.DB.raw.prepare(query).run(...args);

function fixture() {
  const env=makeEnv();
  env.DB.raw.exec(readFileSync(schema,'utf8'));
  for (const id of ['HE-R100','HE-R101']) seedListing(env,{id});
  run(env,'INSERT INTO property_qr_codes(listing_id,code,created_at,created_by) VALUES(?,?,?,?)','HE-R100',A,T0,'staff@example.test');
  run(env,'INSERT INTO property_qr_codes(listing_id,code,created_at,created_by) VALUES(?,?,?,?)','HE-R101',B,T0,'staff@example.test');
  return env;
}
const context = (env,code,extra={}) => {
  const pending=[];
  return {pending, env:{...env,ANA10_PROPERTY_QR_READY:'1'},params:{code},
    request:new Request('https://untrusted.example/r/ignored?next=https://attacker.example/'),
    waitUntil:promise=>pending.push(promise),...extra};
};

test('128-bit tokens are canonical base64url and URLs are fixed to the approved host',()=>{
  const generated=new Set(Array.from({length:128},()=>createPropertyQrCode()));
  assert.equal(generated.size,128);
  for(const code of generated) {
    assert.equal(isPropertyQrCode(code),true);
    assert.match(propertyQrUrl(code),/^https:\/\/www\.hamptonestatesjersey\.com\/r\/[A-Za-z0-9_-]{22}$/);
  }
  for(const code of [null,42,'',A.slice(1),A+'A',A+'\n',A+'\u2028','A'.repeat(21)+'B','../'+A,A+'?x=1','a'.repeat(10000)]) {
    assert.equal(isPropertyQrCode(code),false);
    assert.throws(()=>propertyQrUrl(code));
  }
});

test('corrupt stored listing identifiers never become redirect locations',async()=>{
  for(const listing_id of ['HE-R100\n','HE-R100\u2028','https://attacker.example/','HE-R100?next=attacker']) {
    const DB={prepare:()=>({bind:()=>({first:async()=>({id:1,listing_id})})})};
    const response=await onRequestGet(context({DB},A));
    assert.equal(response.status,503);
    assert.equal(response.headers.get('location'),null);
  }
});

test('a QR association cannot be reassigned or replaced, including with SQLite REPLACE',async()=>{
  const env=fixture(),a=await resolvePropertyQr(env.DB,A);
  await recordPropertyQrRedirect(env.DB,a,new Date('2026-11-13T12:00:00Z'));
  seedListing(env,{id:'HE-R102'});
  const C='C'.repeat(21)+'Q';
  for(const values of [
    ['HE-R100',C], // different code for an existing listing
    ['HE-R102',A], // existing code for a different listing
  ]) assert.throws(()=>run(env,'INSERT OR REPLACE INTO property_qr_codes(listing_id,code,created_at,created_by) VALUES(?,?,?,?)',...values,T0,'staff@example.test'));
  assert.throws(()=>run(env,'INSERT OR REPLACE INTO property_qr_codes(id,listing_id,code,created_at,created_by) VALUES(?,?,?,?,?)',a.id,'HE-R102',C,T0,'staff@example.test'));
  assert.throws(()=>run(env,'UPDATE property_qr_codes SET listing_id=? WHERE id=?','HE-R102',a.id));
  assert.deepEqual(await resolvePropertyQr(env.DB,A),a);
  assert.equal(row(env,'SELECT SUM(redirects) n FROM property_qr_redirect_days').n,1);
});

test('the deployed route is inert unless the exact private gate is enabled',async()=>{
  const db={prepare(){throw Error('unexpected database access');}};
  for(const value of [undefined,null,'0',1,true,'true']) {
    const env={DB:db,ANA10_PROPERTY_QR_READY:value};
    for(const handler of [onRequestGet,onRequestHead]) {
      const pending=[];
      const response=await handler({env,params:{code:A},waitUntil:p=>pending.push(p)});
      assert.equal(response.status,404);
      assert.equal(response.headers.get('cache-control'),'no-store');
      assert.equal(pending.length,0);
    }
  }
});

test('GET redirects two codes only to their own canonical listing; HEAD never counts',async()=>{
  const env=fixture();
  for(const [code,id] of [[A,'HE-R100'],[B,'HE-R101']]) {
    const ctx=context(env,code),response=await onRequestGet(ctx);
    assert.equal(response.status,302);
    assert.equal(response.headers.get('location'),`https://www.hamptonestatesjersey.com/p/${id}`);
    assert.equal(response.headers.get('cache-control'),'no-store');
    assert.equal(response.headers.get('referrer-policy'),'no-referrer');
    assert.equal(response.headers.get('x-robots-tag'),'noindex');
    assert.equal(await response.text(),'');
    await Promise.all(ctx.pending);
    const head=context(env,code),res=await onRequestHead(head);
    assert.equal(res.status,302);
    assert.equal(res.headers.get('location'),`https://www.hamptonestatesjersey.com/p/${id}`);
    assert.equal(head.pending.length,0);
  }
  assert.equal(row(env,'SELECT SUM(redirects) n FROM property_qr_redirect_days').n,2);
  assert.equal(row(env,'SELECT SUM(n) n FROM property_qr_budget').n,2);
});

test('invalid, absent and deleted codes fail closed without a counter or open redirect',async()=>{
  const env=fixture();
  for(const code of ['bad',A+'?next=https://attacker.example','C'.repeat(21)+'Q','A'.repeat(21)+'B']) {
    const ctx=context(env,code),response=await onRequestGet(ctx);
    assert.equal(response.status,404);
    assert.equal(response.headers.get('location'),null);
    assert.equal(ctx.pending.length,0);
  }
  const old=await resolvePropertyQr(env.DB,A);
  run(env,"DELETE FROM listings WHERE id='HE-R100'");
  await recordPropertyQrRedirect(env.DB,old,new Date('2026-11-13T12:00:00Z'));
  const ctx=context(env,A),response=await onRequestGet(ctx);
  assert.equal(response.status,404);
  assert.equal(row(env,'SELECT COUNT(*) n FROM property_qr_budget').n,0);
  seedListing(env,{id:'HE-R102'});
  assert.throws(()=>run(env,'INSERT INTO property_qr_codes(listing_id,code,created_at,created_by) VALUES(?,?,?,?)','HE-R102',A,T0,'staff@example.test'));
});

test('the counter revalidates code, listing and identity inside its transaction',async()=>{
  const env=fixture(),a=await resolvePropertyQr(env.DB,A);
  for(const invalid of [{...a,code:B},{...a,listing_id:'HE-R101'},{...a,id:a.id+100}])
    await recordPropertyQrRedirect(env.DB,invalid,new Date('2026-11-13T12:00:00Z'));
  assert.equal(row(env,'SELECT COUNT(*) n FROM property_qr_budget').n,0);
  assert.equal(row(env,'SELECT COUNT(*) n FROM property_qr_redirect_days').n,0);
});

test('resolution failure does not redirect; a counter failure cannot break a valid redirect',async()=>{
  const broken=context({DB:{prepare(){throw Error('fixture resolution unavailable');}}},A);
  const unavailable=await onRequestGet(broken);
  assert.equal(unavailable.status,503);
  assert.equal(unavailable.headers.get('location'),null);
  assert.doesNotMatch(await unavailable.text(),/fixture|HE-R|attacker/i);
  const unavailableHead=await onRequestHead(broken);
  assert.equal(unavailableHead.status,503);
  assert.equal(await unavailableHead.text(),'');
  const env=fixture(), db={...env.DB,batch:async()=>{throw Error('fixture counter failure');}};
  const ctx=context({DB:db},A),response=await onRequestGet(ctx);
  assert.equal(response.status,302);
  assert.equal(response.headers.get('location'),'https://www.hamptonestatesjersey.com/p/HE-R100');
  await Promise.all(ctx.pending);
  assert.equal(row(env,'SELECT COUNT(*) n FROM property_qr_budget').n,0);
});

test('budget and per-code counter are atomic and the global 5000 cap holds under contention',async()=>{
  const env=fixture(),a=await resolvePropertyQr(env.DB,A),b=await resolvePropertyQr(env.DB,B),day='2026-11-13';
  run(env,'INSERT INTO property_qr_budget(day,n,capped) VALUES(?,4999,0)',day);
  run(env,'INSERT INTO property_qr_redirect_days(day,qr_id,redirects) VALUES(?,?,4999)',day,a.id);
  await Promise.all(Array.from({length:20},(_,i)=>recordPropertyQrRedirect(env.DB,i%2?a:b,new Date(day+'T12:00:00Z'))));
  assert.deepEqual({...row(env,'SELECT n,capped FROM property_qr_budget WHERE day=?',day)},{n:5000,capped:1});
  assert.equal(row(env,'SELECT SUM(redirects) n FROM property_qr_redirect_days WHERE day=?',day).n,5000);
  const stats=await readPropertyQrStats(env.DB,'HE-R100',day,day);
  assert.equal(stats.capped,true);
  assert.equal(stats.coverage,'unknown');
  assert.ok([4999,5000].includes(stats.total));
  const other=await readPropertyQrStats(env.DB,'HE-R101',day,day);
  assert.equal(stats.total+other.total,5000);
  const later=fixture(),c=await resolvePropertyQr(later.DB,A);
  await recordPropertyQrRedirect(later.DB,c,new Date(day+'T12:00:00Z'));
  later.DB.raw.exec("CREATE TRIGGER test_qr_failure BEFORE INSERT ON property_qr_redirect_days BEGIN SELECT RAISE(ABORT,'fixture'); END;");
  await assert.rejects(()=>recordPropertyQrRedirect(later.DB,c,new Date(day+'T12:00:00Z')));
  assert.equal(row(later,'SELECT n FROM property_qr_budget WHERE day=?',day).n,1,'failed counter rolls its budget increment back');
  assert.equal(row(later,'SELECT redirects FROM property_qr_redirect_days WHERE day=?',day).redirects,1);
});

test('Jersey midnight and daylight-saving offsets choose the local aggregate day',async()=>{
  const env=fixture(),a=await resolvePropertyQr(env.DB,A);
  for(const at of ['2026-06-30T22:59:59Z','2026-06-30T23:00:00Z','2026-12-31T23:59:59Z','2027-01-01T00:00:00Z'])
    await recordPropertyQrRedirect(env.DB,a,new Date(at));
  const days=env.DB.raw.prepare('SELECT day,redirects FROM property_qr_redirect_days ORDER BY day').all().map(x=>({...x}));
  assert.deepEqual(days,[{day:'2026-06-30',redirects:1},{day:'2026-07-01',redirects:1},
    {day:'2026-12-31',redirects:1},{day:'2027-01-01',redirects:1}]);
});

test('statistics reject invalid or longer-than-90-day ranges and never invent absent codes',async()=>{
  const env=fixture(),a=await resolvePropertyQr(env.DB,A);
  await recordPropertyQrRedirect(env.DB,a,new Date('2026-11-13T12:00:00Z'));
  const stats=await readPropertyQrStats(env.DB,'HE-R100','2026-11-12','2026-11-14');
  assert.equal(stats.total,1);
  assert.deepEqual(stats.days.map(d=>[d.day,d.redirects]),[['2026-11-12',0],['2026-11-13',1],['2026-11-14',0]]);
  const ninety=await readPropertyQrStats(env.DB,'HE-R100','2026-01-01','2026-03-31');
  assert.equal(ninety.days.length,90);
  assert.equal(await readPropertyQrStats(env.DB,'HE-R999','2026-11-12','2026-11-14'),null);
  for(const [id,from,to] of [['../x','2026-11-12','2026-11-14'],['HE-R100','2026-02-30','2026-03-01'],
    ['HE-R100','2026-11-14','2026-11-12'],['HE-R100','2026-01-01','2026-04-01']])
    await assert.rejects(()=>readPropertyQrStats(env.DB,id,from,to));
  const plan=env.DB.raw.prepare(`EXPLAIN QUERY PLAN SELECT d.day,d.redirects FROM property_qr_redirect_days d
    JOIN property_qr_codes q ON q.id=d.qr_id WHERE q.listing_id=? AND d.day BETWEEN ? AND ?`)
    .all('HE-R100','2026-11-12','2026-11-14').map(x=>x.detail).join(' ');
  assert.match(plan,/property_qr_redirects_by_code/,'one property does not scan every QR count in the period');
});

test('corrupt aggregates fail closed instead of publishing a fabricated total',async()=>{
  const DB={batch:async()=>[
    {results:[{id:1}]},
    {results:[{day:'2026-11-13',redirects:5}]},
    {results:[{day:'2026-11-13',n:4,capped:0}]},
  ]};
  await assert.rejects(()=>readPropertyQrStats(DB,'HE-R100','2026-11-13','2026-11-13'));
});

test('measurement ignores headers, visitor identifiers and query parameters',async()=>{
  const env=fixture(),bound=[],prepare=env.DB.prepare.bind(env.DB);
  env.DB.prepare=sql=>{const statement=prepare(sql),bind=statement.bind;statement.bind=(...args)=>{bound.push(...args);return bind(...args);};return statement;};
  const marker='VISITOR_PRIVATE_FIXTURE_742';
  const ctx=context(env,A,{request:new Request(`https://example.test/r/${A}?visitor=${marker}`,{headers:{
    'x-forwarded-for':marker,'user-agent':marker,'referer':`https://example.test/${marker}`,'cookie':`visit=${marker}`}})});
  const response=await onRequestGet(ctx);
  assert.equal(response.status,302);await Promise.all(ctx.pending);
  assert.ok(bound.length>0);
  assert.ok(bound.every(value=>!String(value).includes(marker)));
  for(const table of ['property_qr_codes','property_qr_redirect_days','property_qr_budget','property_qr_retired_codes']) {
    const names=env.DB.raw.prepare(`PRAGMA table_info(${table})`).all().map(c=>c.name);
    assert.ok(names.every(name=>!/(visitor|address|cookie|referrer|agent|session|contact|ip)/i.test(name)));
  }
});
