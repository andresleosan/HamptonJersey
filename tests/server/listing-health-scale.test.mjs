import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { makeEnv, call, adminCookie } from './helpers.mjs';
import { applyListingHealthProposal } from './listing-health-support.mjs';

// This is a local SQLite measurement, not evidence of a Cloudflare D1 budget or production traffic.
test('10,000 complete candidates are paged and 10,001 fail closed', async t => {
  t.mock.timers.enable({apis:['Date'],now:Date.parse('2026-10-25T12:00:00Z')});
  const env={...applyListingHealthProposal(makeEnv()),LISTING_HEALTH_READY:'1'}, db=env.DB.raw;
  const insertListing=db.prepare(`INSERT INTO listings(id,use,title,operation,availability,published,created_at,updated_at)
    VALUES(?,'residential','Synthetic home','sale','for_sale',1,'2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z')`);
  const insertMedia=db.prepare(`INSERT INTO media(id,listing_id,r2_key,origin,kind,public,created_at)
    VALUES(?,?,?,'upload','photo',1,'2026-01-01T00:00:00.000Z')`);
  const insertStat=db.prepare("INSERT INTO daily_stats(day,listing_id,metric,n) VALUES(?,?,'view',1)");
  const insertRequest=db.prepare(`INSERT INTO viewing_requests(listing_id,kind,date,time,name,email,status,created_at)
    VALUES(?,'In person','2026-10-20','10:00','Synthetic visitor','visitor@example.test','requested','2026-10-01T12:00:00.000Z')`);
  const days=Array.from({length:30},(_,i)=>new Date(Date.UTC(2026,8,26+i)).toISOString().slice(0,10));
  const seed=i=>{const id=`LOAD-${String(i).padStart(5,'0')}`;insertListing.run(id);insertMedia.run(`M${String(i).padStart(5,'0')}`,id,'fixture/photo');
    for(const day of days)insertStat.run(day,id);insertRequest.run(id);};
  db.exec('BEGIN'); for(let i=1;i<=10000;i++)seed(i); db.exec('COMMIT');
  let query, bindValues, sqlMs, bytes, budget;
  const prepare=env.DB.prepare;
  env.DB.prepare=sql=>{
    const stmt=prepare(sql);
    if(!sql.startsWith('WITH views AS'))return stmt;
    query=sql;
    return {...stmt,bind:(...args)=>{bindValues=args;const bound=stmt.bind(...args);return {...bound,all:async()=>{
      const start=performance.now(), result=await bound.all();sqlMs=performance.now()-start;
      bytes=Buffer.byteLength(JSON.stringify(result.results));budget=result.results[0]?.health_bytes;return result;
    }};}};
  };
  const cookie=await adminCookie();
  const start=performance.now(), first=await call(env,'GET','/admin/insights/listing-health',{cookie});
  const wallMs=performance.now()-start;
  console.log(`Synthetic 10,000 budget: ${budget} bytes; returned rows ${bytes} bytes; status ${first.status}.`);
  assert.equal(first.status,200);assert.equal(first.data.rows.length,50);assert.ok(first.data.next_cursor);
  assert.ok(bytes<=budget, `serialized rows ${bytes} exceed bound ${budget}`);
  const plan=db.prepare(`EXPLAIN QUERY PLAN ${query}`).all(...bindValues).map(row=>row.detail);
  assert.ok(plan.some(line=>line.includes('viewing_health_time_listing')),'request time index used');
  assert.ok(plan.some(line=>line.includes('media_listing')),'media index used');
  console.log(`Synthetic 10,000 listings / 300,000 view rows / 10,000 requests: SQL ${Math.round(sqlMs)} ms; total ${Math.round(wallMs)} ms; raw D1-like rows ${bytes} bytes.`);
  console.log(`SQLite query plan: ${plan.join(' | ')}`);
  seed(10001);
  const after=await call(env,'GET','/admin/insights/listing-health',{cookie});
  assert.equal(after.status,503);assert.equal(after.data.error,'Too many listings to display');
});

// Long text may be valid public content; neither it nor an incomplete set may exceed the response budget.
test('long descriptions are bounded or fail closed before leaving SQLite', async t => {
  t.mock.timers.enable({apis:['Date'],now:Date.parse('2026-10-25T12:00:00Z')});
  const env={...applyListingHealthProposal(makeEnv()),LISTING_HEALTH_READY:'1'},db=env.DB.raw;
  const listing=db.prepare(`INSERT INTO listings(id,use,title,description,operation,availability,published,created_at,updated_at)
    VALUES(?,'residential','Synthetic home',?,'sale','for_sale',1,'2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z')`);
  const media=db.prepare(`INSERT INTO media(id,listing_id,r2_key,origin,kind,public,created_at)
    VALUES(?,?,?,'upload','photo',1,'2026-01-01T00:00:00.000Z')`);
  const stat=db.prepare("INSERT INTO daily_stats(day,listing_id,metric,n) VALUES('2026-10-01',?,'view',30)");
  db.exec('BEGIN');for(let i=0;i<2500;i++){const id=`LONG-${i}`;listing.run(id,'x'.repeat(20000));media.run(`M${i}`,id,'fixture/photo');stat.run(id);}db.exec('COMMIT');
  let bytes=0;const prepare=env.DB.prepare;env.DB.prepare=sql=>{const stmt=prepare(sql);if(!sql.startsWith('WITH views AS'))return stmt;
    return {...stmt,bind:(...args)=>{const bound=stmt.bind(...args);return {...bound,all:async()=>{const result=await bound.all();bytes=Buffer.byteLength(JSON.stringify(result.results));return result;}};}};};
  const result=await call(env,'GET','/admin/insights/listing-health',{cookie:await adminCookie()});
  assert.ok(bytes<40_000_000,`response exceeded conservative budget: ${bytes}`);
  assert.ok(result.status===200 || (result.status===503 && !result.data.rows));
  console.log(`Synthetic 2,500 long descriptions: ${bytes} bytes; status ${result.status}.`);
});

// JSON can expand controls and quotes; UTF-8 can expand if the transport escapes Unicode.
test('the bound covers multibyte text, control characters, quotes, backslashes and media labels', async t => {
  t.mock.timers.enable({apis:['Date'],now:Date.parse('2026-10-25T12:00:00Z')});
  const env={...applyListingHealthProposal(makeEnv()),LISTING_HEALTH_READY:'1'},db=env.DB.raw;
  const listing=db.prepare(`INSERT INTO listings(id,use,title,description,operation,availability,published,created_at,updated_at)
    VALUES(?,'residential',?,?,'sale','for_sale',1,'2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z')`);
  const media=db.prepare(`INSERT INTO media(id,listing_id,r2_key,origin,kind,public,label,created_at)
    VALUES(?,?,?,'upload','photo',1,?,'2026-01-01T00:00:00.000Z')`);
  const stat=db.prepare("INSERT INTO daily_stats(day,listing_id,metric,n) VALUES('2026-10-01',?,'view',30)");
  const sample='😀é"\\\u0001'.repeat(1600);
  db.exec('BEGIN');for(let i=0;i<100;i++){const id=`ESC-${i}`;listing.run(id,`Synthetic ${i}`,sample);media.run(`M${i}`,id,'fixture/photo',sample.slice(0,100));stat.run(id);}db.exec('COMMIT');
  let bytes=0,bound=0;const prepare=env.DB.prepare;env.DB.prepare=sql=>{const stmt=prepare(sql);if(!sql.startsWith('WITH views AS'))return stmt;
    return {...stmt,bind:(...args)=>{const boundStmt=stmt.bind(...args);return {...boundStmt,all:async()=>{const result=await boundStmt.all();bytes=Buffer.byteLength(JSON.stringify(result.results));bound=result.results[0].health_bytes;return result;}};}};};
  const result=await call(env,'GET','/admin/insights/listing-health',{cookie:await adminCookie()});
  assert.equal(result.status,200);assert.ok(result.data.next_cursor);assert.ok(bytes<=bound,`${bytes} > ${bound}`);
  console.log(`Adversarial UTF-8/JSON sample: ${bytes} bytes, conservative bound ${bound} bytes.`);
});
