import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluate } from '../../server/matching.js';
import { areaPreferenceRank } from '../../server/requirements.js';
import { recomputeForApplicant, recomputeForListing } from '../../server/match-store.js';
import { makeEnv, seedListing, call, adminCookie, T0 } from './helpers.mjs';

const priorities=JSON.stringify({version:1,values:{area:'must',budget:'preferred'},unknown:[]});
const a=extra=>({operation:'buy',budget_max:1000000,pets:'[{"kind":"none"}]',requirement_priorities:priorities,...extra});
const l=extra=>({id:'AREA',operation:'sale',sale_price:900000,availability:'for_sale',archived_at:null,...extra});
const area=r=>r.checks.find(c=>c.key==='area');

test('anywhere excludes explicit vetoes and keeps an unknown parish pending',()=>{
  const search=a({area_answer:'any',parishes_excluded:'["St Ouen"]'});
  const yes=evaluate(search,l({parish:'Trinity'}));assert.equal(area(yes).result,'meets');
  const no=evaluate(search,l({parish:'St Ouen'}));assert.equal(no.pass,false);assert.equal(no.requirements_status,'excluded');
  const unknown=evaluate(search,l({parish:null}));assert.equal(area(unknown).result,'unknown');assert.equal(unknown.requirements_status,'pending');
  assert.equal(area(evaluate(a({area_answer:'any'}),l({parish:null}))),undefined);
});

test('unknown and empty legacy area answers do not assert that a known parish is accepted',()=>{
  for(const search of [a({area_answer:'unknown'}),a({area_answer:null})]){
    const r=evaluate(search,l({parish:'Trinity'}));
    assert.equal(area(r).result,'unknown');assert.equal(r.requirements_status,'pending');
  }
  const old=a({area_answer:null,parishes_wanted:'["St Helier","Trinity"]'});
  assert.equal(area(evaluate(old,l({parish:'Trinity'}))).result,'meets');
  assert.equal(area(evaluate(old,l({parish:'St Ouen'}))).result,'fails');
});

test('preference is a tie-break only and does not change the requirement score',()=>{
  const search=a({area_answer:'selected',parishes_wanted:'["St Helier","Trinity"]',preferred_parish:'Trinity'});
  const trinity=l({parish:'Trinity'}),helier=l({parish:'St Helier'});
  assert.equal(areaPreferenceRank(search,trinity),0);assert.equal(areaPreferenceRank(search,helier),1);
  assert.equal(evaluate(search,trinity).score,evaluate(search,helier).score);
  assert.equal(evaluate(search,trinity).requirements_rank,evaluate(search,helier).requirements_rank);
  assert.equal(areaPreferenceRank({...search,area_answer:'unknown'},trinity),1);
});

async function setup(preferred='Trinity'){
  const e=makeEnv();
  e.DB.raw.prepare('INSERT INTO contacts(name,email,last_activity_at,created_at,updated_at) VALUES(?,?,?,?,?)')
    .run('Area pages','area-pages@example.test',T0,T0,T0);
  e.DB.raw.prepare('INSERT INTO applicants(contact_id,operation,stage,source,budget_max,pets,requirement_priorities,area_answer,parishes_wanted,preferred_parish,created_at,updated_at) VALUES(1,?,?,?,?,?,?,?,?,?,?,?)')
    .run('buy','searching','phone',1000000,'[{"kind":"none"}]',priorities,'selected','["St Helier","Trinity"]',preferred,T0,T0);
  for(let i=0;i<60;i++)seedListing(e,{id:`AREA-${String(i).padStart(3,'0')}`,matchable:1,sale_price:900000,
    parish:i%2?'Trinity':'St Helier'});
  await recomputeForApplicant(e,1,'system');return e;
}
const page=async(e,q='')=>call(e,'GET','/admin/applicants/1/matches?status=found'+q,{cookie:await adminCookie()});

test('preferred parish sorts exact ties consistently through pages and Review',async()=>{
  const e=await setup();let after='',ids=[];
  for(const size of [25,25,10]){
    const r=await page(e,after);assert.equal(r.status,200,JSON.stringify(r.data));assert.equal(r.data.matches.length,size);
    ids.push(...r.data.matches.map(m=>m.listing.id));after=r.data.next?'&after='+encodeURIComponent(r.data.next):'';
  }
  assert.equal(after,'');assert.equal(new Set(ids).size,60);
  assert.deepEqual(ids,[...ids.filter((_,i)=>i<30).sort(),...ids.filter((_,i)=>i>=30).sort()]);
  assert.ok(ids.slice(0,30).every(id=>Number(id.slice(-3))%2===1));
  const first=await call(e,'GET','/admin/review',{cookie:await adminCookie()});assert.equal(first.data.listing.id,ids[0]);
  const second=await call(e,'GET','/admin/review?after='+first.data.match.id,{cookie:await adminCookie()});assert.equal(second.data.listing.id,ids[1]);
});

test('a higher score takes precedence over a preferred parish in pages and Review',async()=>{
  const e=await setup();
  e.DB.raw.prepare('UPDATE listings SET sale_price=? WHERE id=?').run(500000,'AREA-001');
  await recomputeForListing(e,'AREA-001','system');
  let after='',ids=[];
  do{const r=await page(e,after);assert.equal(r.status,200);ids.push(...r.data.matches.map(m=>m.listing.id));after=r.data.next?'&after='+encodeURIComponent(r.data.next):'';}while(after);
  assert.ok(ids.indexOf('AREA-000')<ids.indexOf('AREA-001'));
  const first=await call(e,'GET','/admin/review',{cookie:await adminCookie()});
  assert.notEqual(first.data.listing.id,'AREA-001');
});

test('old cursors work only while revisions are current and preferred changes invalidate them',async()=>{
  const e=await setup(null),first=await page(e),current=JSON.parse(Buffer.from(first.data.next,'base64url').toString());
  const {areaRank,...old}=current;old.v=1;
  const oldToken=Buffer.from(JSON.stringify(old)).toString('base64url');
  assert.equal((await page(e,'&after='+oldToken)).status,200);
  e.DB.raw.prepare('UPDATE applicants SET preferred_parish=? WHERE id=1').run('Trinity');
  assert.equal((await page(e,'&after='+oldToken)).status,409);
});

test('Review rejects stale decisions and navigation after a preference changes',async()=>{
  const e=await setup(),cookie=await adminCookie();
  const first=await call(e,'GET','/admin/review',{cookie});
  const {match,applicant}=first.data;
  assert.equal(applicant.area_answer,'selected');assert.equal(applicant.preferred_parish,'Trinity');
  assert.ok(Number.isSafeInteger(applicant.matches_revision));
  e.DB.raw.prepare('UPDATE applicants SET preferred_parish=? WHERE id=1').run('St Helier');
  const decision=await call(e,'PUT',`/admin/matches/${match.id}`,{cookie,body:{status:'shortlisted',from:'found',matches_revision:applicant.matches_revision}});
  assert.equal(decision.status,409);
  assert.equal(e.DB.raw.prepare('SELECT status FROM matches WHERE id=?').get(match.id).status,'found');
  const next=await call(e,'GET',`/admin/review?after=${match.id}&revision=${applicant.matches_revision}`,{cookie});
  assert.equal(next.status,409);
  const fresh=await call(e,'GET','/admin/review',{cookie});
  const accepted=await call(e,'PUT',`/admin/matches/${fresh.data.match.id}`,{cookie,body:{status:'shortlisted',from:'found',matches_revision:fresh.data.applicant.matches_revision}});
  assert.equal(accepted.status,200);assert.ok(Number.isSafeInteger(accepted.data.revision));
  assert.equal((await call(e,'GET',`/admin/review?after=${fresh.data.match.id}&revision=${accepted.data.revision}`,{cookie})).status,200);
});

test('Undo returns a search summary and revision from the same snapshot after a concurrent preference edit',async()=>{
  const e=await setup(),cookie=await adminCookie();
  const first=await call(e,'GET','/admin/review',{cookie});
  const reviewed=await call(e,'PUT',`/admin/matches/${first.data.match.id}`,{cookie,body:{status:'shortlisted',from:'found',matches_revision:first.data.applicant.matches_revision}});
  assert.equal(reviewed.status,200);
  const prepare=e.DB.prepare.bind(e.DB);let injected=false;
  e.DB.prepare=sql=>{
    if(!injected && sql.includes('AS applicant FROM matches') && sql.includes('WHERE m.id = ?')){
      injected=true;e.DB.raw.prepare('UPDATE applicants SET preferred_parish=? WHERE id=1').run('St Helier');
    }
    return prepare(sql);
  };
  const undo=await call(e,'PUT',`/admin/matches/${first.data.match.id}`,{cookie,body:{status:'found',from:'shortlisted',matches_revision:reviewed.data.revision}});
  assert.equal(undo.status,200);assert.ok(injected);
  assert.equal(undo.data.applicant.preferred_parish,'St Helier');
  assert.equal(undo.data.revision,undo.data.applicant.matches_revision);
  e.DB.raw.prepare('UPDATE applicants SET preferred_parish=? WHERE id=1').run('Trinity');
  const stale=await call(e,'PUT',`/admin/matches/${first.data.match.id}`,{cookie,body:{status:'shortlisted',from:'found',matches_revision:undo.data.revision}});
  assert.equal(stale.status,409);
});

test('recalculation preserves shortlist and rejected snapshots when the preference changes',async()=>{
  const e=await setup();
  e.DB.raw.exec("UPDATE matches SET status='shortlisted' WHERE listing_id='AREA-001'; UPDATE matches SET status='rejected',reject_reason='area' WHERE listing_id='AREA-003'");
  const before={...e.DB.raw.prepare("SELECT id,status,reject_reason,score,checks,requirements_rank,area_preference_rank FROM matches WHERE listing_id='AREA-003'").get()};
  e.DB.raw.prepare('UPDATE applicants SET preferred_parish=? WHERE id=1').run('St Helier');
  await recomputeForApplicant(e,1,'system');await recomputeForListing(e,'AREA-003','system');
  assert.equal(e.DB.raw.prepare("SELECT status FROM matches WHERE listing_id='AREA-001'").get().status,'shortlisted');
  assert.deepEqual({...e.DB.raw.prepare("SELECT id,status,reject_reason,score,checks,requirements_rank,area_preference_rank FROM matches WHERE listing_id='AREA-003'").get()},before);
});
