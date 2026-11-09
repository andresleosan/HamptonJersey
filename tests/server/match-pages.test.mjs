import test from 'node:test';
import assert from 'node:assert/strict';
import {makeEnv,seedListing,call,adminCookie,T0,captured,plan} from './helpers.mjs';
import {recomputeForApplicant} from '../../server/match-store.js';
async function setup(){const e=makeEnv();
 e.DB.raw.exec(`INSERT INTO contacts(name,email,last_activity_at,created_at,updated_at) VALUES('Fixture','pages@example.test','${T0}','${T0}','${T0}');
 INSERT INTO applicants(contact_id,operation,stage,source,budget_max,created_at,updated_at) VALUES(1,'buy','searching','phone',1000000,'${T0}','${T0}');`);
 for(let i=59;i>=0;i--)seedListing(e,{id:`PAGE-${String(i).padStart(3,'0')}`,matchable:1,sale_price:900000});
 await recomputeForApplicant(e,1,'system');return e;
}
const page=async(e,q='')=>call(e,'GET','/admin/applicants/1/matches?status=found'+q,{cookie:await adminCookie()});
test('BUS-14 keyset returns 25/25/10 in persisted BINARY order without duplicate pairs or writes',async()=>{
 const e=await setup(),before=e.DB.raw.prepare('SELECT total_changes() n').get().n;
 const seen=captured(e,/LIMIT 26/);let after='',ids=[];
 for(const size of [25,25,10]){const r=await page(e,after);assert.equal(r.status,200,JSON.stringify(r.data));
  assert.equal(r.data.matches.length,size);assert.equal(r.data.counts.found,60);assert.equal(r.data.rankingVersion,1);
  ids.push(...r.data.matches.map(m=>m.listing.id));after=r.data.next?'&after='+encodeURIComponent(r.data.next):'';
 }
 assert.equal(after,'');assert.equal(new Set(ids).size,60);assert.deepEqual(ids,[...ids].sort());
 assert.equal(e.DB.raw.prepare('SELECT total_changes() n').get().n,before);
 assert.match(plan(e,seen[0]),/matches_page/);
 assert.doesNotMatch(plan(e,seen[0]),/SCAN m\b|TEMP B-TREE/);
});
test('BUS-14 page cursor rejects malformed/foreign data, authenticates and invalidates on mutation',async()=>{
 const e=await setup(),first=await page(e);assert.equal(first.status,200);
 const token=first.data.next;assert.ok(token);
 assert.equal((await call(e,'GET','/admin/applicants/1/matches?status=found')).status,401);
 assert.equal((await page(e,'&after=garbage')).status,400);
 assert.equal((await page(e,'&after='+('a'.repeat(1025)))).status,400);
 const c=JSON.parse(Buffer.from(token,'base64url').toString());
 for(const mutate of [x=>({...x,applicantId:2}),x=>({...x,status:'rejected'}),x=>({...x,extra:1}),x=>({...x,score:'90'})]){
  const t=Buffer.from(JSON.stringify(mutate(c))).toString('base64url');assert.equal((await page(e,'&after='+t)).status,400);
 }
 e.DB.raw.exec("UPDATE matches SET status='shortlisted' WHERE listing_id='PAGE-000'");
 assert.equal((await page(e,'&after='+token)).status,409);
 assert.equal((await call(e,'GET','/admin/applicants/999/matches?status=found',{cookie:await adminCookie()})).status,404);
});
test('BUS-14 detail returns summary and Timeline titles without loading all cards',async()=>{
 const e=await setup();e.DB.raw.exec(`INSERT INTO events(at,actor,entity_type,entity_id,type,data)
 VALUES('${T0}','system','applicant','1','match.reviewed','{"listing_id":"PAGE-059","to":"shortlisted"}')`);
 const r=await call(e,'GET','/admin/applicants/1',{cookie:await adminCookie()});assert.equal(r.status,200);
 assert.equal(r.data.matches,undefined);assert.equal(r.data.matchCounts.found,60);
 assert.equal(r.data.events.find(x=>x.type==='match.reviewed').listing_title,'Le Bernage');
});
test('BUS-14 rejected checks and scores remain a historical snapshot after property edits',async()=>{
 const e=await setup(),checks=JSON.stringify([{key:'budget',priority:'must',result:'meets',evidence:'Historical budget'}]);
 e.DB.raw.prepare('UPDATE applicants SET requirement_priorities=? WHERE id=1').run(JSON.stringify({version:1,values:{budget:'must'},unknown:[]}));
 e.DB.raw.prepare("UPDATE matches SET status='rejected',checks=?,score=15,requirements_rank=0 WHERE listing_id='PAGE-059'").run(checks);
 e.DB.raw.exec("UPDATE listings SET sale_price=2000000 WHERE id='PAGE-059'");
 const r=await call(e,'GET','/admin/applicants/1/matches?status=rejected',{cookie:await adminCookie()});
 assert.equal(r.status,200);assert.deepEqual(r.data.matches[0].checks,JSON.parse(checks));assert.equal(r.data.matches[0].score,15);
 assert.equal(r.data.matches[0].requirements_status,'meets');
});
test('BUS-14 Review uses the same persisted order and search changes invalidate page cursors',async()=>{
 const e=await setup(),p=await page(e),first=await call(e,'GET','/admin/review',{cookie:await adminCookie()});
 assert.equal(first.data.listing.id,p.data.matches[0].listing.id);
 const next=await call(e,'GET','/admin/review?after='+first.data.match.id,{cookie:await adminCookie()});
 assert.equal(next.data.listing.id,p.data.matches[1].listing.id);
 e.DB.raw.exec('UPDATE applicants SET budget_max=950000 WHERE id=1');
 assert.equal((await page(e,'&after='+p.data.next)).status,409);
 const empty=await call(e,'GET','/admin/applicants/1/matches?status=shortlisted',{cookie:await adminCookie()});
 assert.deepEqual(empty.data.matches,[]);assert.equal(empty.data.next,null);assert.equal(empty.data.rankingVersion,0);
 assert.equal((await call(e,'GET','/admin/applicants/1/matches?status=found&status=rejected',{cookie:await adminCookie()})).status,400);
});
test('BUS-14 recalculating a legacy order needs authentication and an active residential search',async()=>{
 const e=await setup();e.DB.raw.exec('UPDATE applicants SET match_ranking_version=0 WHERE id=1');
 assert.equal((await call(e,'POST','/admin/applicants/1/matches/recalculate')).status,401);
 const cookie=await adminCookie(),r=await call(e,'POST','/admin/applicants/1/matches/recalculate',{cookie});
 assert.equal(r.status,200);assert.equal((await page(e)).data.rankingVersion,1);
 e.DB.raw.exec("UPDATE applicants SET search_state='needs_review' WHERE id=1");
 assert.equal((await call(e,'POST','/admin/applicants/1/matches/recalculate',{cookie})).status,409);
});
