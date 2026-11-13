import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import {makeEnv,seedListing,call,adminCookie,T0} from './listing-client.mjs';

function setup() {
  const env=makeEnv();
  seedListing(env,{id:'HE-R001',title:'Synthetic first home'});
  seedListing(env,{id:'HE-R002',title:'Synthetic second home',operation:'rent',availability:'to_let'});
  seedListing(env,{id:'HE-R004',title:'Synthetic unrelated home'});
  const add=env.DB.raw.prepare('INSERT INTO research_properties(property_id,duplicate_group) VALUES(?,?)');
  for(const [id,group] of [['HE-R001','fixture-group'],['HE-R002','fixture-group'],
    ['HE-R003','fixture-group'],['HE-R004','other-group'],['unsafe/url','fixture-group']]) add.run(id,group);
  return env;
}

function applicant(env,n) {
  const db=env.DB.raw;
  const contact=db.prepare(`INSERT INTO contacts(name,email,last_activity_at,created_at,updated_at)
    VALUES('Synthetic contact',?,?,?,?)`).run(`fixture-${n}@example.test`,T0,T0,T0).lastInsertRowid;
  return Number(db.prepare(`INSERT INTO applicants(contact_id,operation,source,created_at,updated_at)
    VALUES(?,'buy','phone',?,?)`).run(contact,T0,T0).lastInsertRowid);
}
function match(env,applicantId,id,status) {
  env.DB.raw.prepare(`INSERT INTO matches(applicant_id,listing_id,score,checks,status,reject_reason,created_at,updated_at)
    VALUES(?,?,50,'[]',?,?,?,?)`).run(applicantId,id,status,status==='rejected'?'other':null,T0,T0);
}
const detail=async(env,cookie)=>call(env,'GET','/admin/listings/HE-R001',{cookie});

test('BUS-10: staff sees only existing candidates from the same research group, never confirmed identities',async()=>{
  const env=setup(),cookie=await adminCookie(),before=env.DB.raw.prepare('SELECT count(*) AS n FROM matches').get().n;
  const r=await detail(env,cookie);
  assert.equal(r.status,200);
  assert.equal(r.headers.get('cache-control'),'no-store');
  assert.deepEqual(r.data.duplicate_review,{source:'historical_research_group',candidates:[
    {listing_id:'HE-R002',operation:'rent',match_conflict:'not_found'}],unavailable:true,truncated:false});
  assert.deepEqual(r.data.duplicates,['HE-R002']);
  assert.equal(env.DB.raw.prepare('SELECT count(*) AS n FROM matches').get().n,before);
  assert.equal((await call(env,'GET','/admin/listings/HE-R002',{cookie})).status,200);
});

test('BUS-10: opposing reviews for one search are signalled without disclosing that search or changing either decision',async()=>{
  const env=setup(),cookie=await adminCookie(),person=applicant(env,1),other=applicant(env,2);
  match(env,person,'HE-R001','shortlisted');match(env,person,'HE-R002','rejected');
  match(env,other,'HE-R004','rejected');
  const before=env.DB.raw.prepare('SELECT applicant_id,listing_id,status FROM matches ORDER BY id').all();
  const {data}=await detail(env,cookie),review=data.duplicate_review;
  assert.equal(review.candidates[0].match_conflict,'present');
  assert.doesNotMatch(JSON.stringify(review),/applicant|contact|fixture-1|reject_reason/i);
  assert.deepEqual(env.DB.raw.prepare('SELECT applicant_id,listing_id,status FROM matches ORDER BY id').all(),before);
});

test('BUS-10: unrelated searches are not called conflicting, and missing/changed groups are not linked',async()=>{
  const env=setup(),cookie=await adminCookie(),a=applicant(env,3),b=applicant(env,4);
  match(env,a,'HE-R001','shortlisted');match(env,b,'HE-R002','rejected');
  assert.equal((await detail(env,cookie)).data.duplicate_review.candidates[0].match_conflict,'not_found');
  env.DB.raw.prepare('UPDATE research_properties SET duplicate_group=? WHERE property_id=?').run('different','HE-R002');
  assert.deepEqual((await detail(env,cookie)).data.duplicate_review.candidates,[]);
  env.DB.raw.prepare('UPDATE research_properties SET duplicate_group=? WHERE property_id=?').run('   ','HE-R001');
  const blank=(await detail(env,cookie)).data.duplicate_review;
  assert.deepEqual(blank.candidates,[]);assert.equal(blank.unavailable,false);
});

test('BUS-10: a large group or review set is explicitly incomplete and bounded',async()=>{
  const env=setup(),cookie=await adminCookie();
  const add=env.DB.raw.prepare('INSERT INTO research_properties(property_id,duplicate_group) VALUES(?,?)');
  for(let n=100;n<155;n++)add.run(`HE-R${n}`,'fixture-group');
  for(let n=10;n<61;n++)match(env,applicant(env,n),'HE-R001','shortlisted');
  const review=(await detail(env,cookie)).data.duplicate_review;
  assert.equal(review.truncated,true);
  assert.ok(review.candidates.length<=50);
  assert.equal(review.candidates[0].match_conflict,'incomplete');
});

test('BUS-10: missing, forged and revoked sessions cannot read candidate details',async()=>{
  const env=setup(),cookie=await adminCookie();
  assert.equal((await detail(env,undefined)).status,401);
  assert.equal((await detail(env,'__Host-hs=forged.signature')).status,401);
  env.DB.raw.prepare('DELETE FROM admins WHERE email=?').run('admin@example.test');
  const denied=await detail(env,cookie);
  assert.equal(denied.status,401);assert.equal(denied.headers.get('cache-control'),'no-store');
  assert.equal(denied.data.duplicate_review,undefined);
});

test('BUS-10: revocation between the session check and the detail batch returns no private detail',async()=>{
  const env=setup(),cookie=await adminCookie(),batch=env.DB.batch.bind(env.DB);
  let revoked=false;
  env.DB.batch=async statements=>{
    if(!revoked){revoked=true;env.DB.raw.prepare('DELETE FROM admins WHERE email=?').run('admin@example.test');}
    return batch(statements);
  };
  const r=await detail(env,cookie);
  assert.equal(r.status,401);assert.equal(r.data.duplicate_review,undefined);
  assert.equal(r.data.listing,undefined);assert.equal(r.headers.get('cache-control'),'no-store');
});

test('BUS-10: the review and research group come from the same batch after a concurrent group change',async()=>{
  const env=setup(),cookie=await adminCookie(),batch=env.DB.batch.bind(env.DB);
  let changed=false;
  env.DB.batch=async statements=>{
    if(!changed){changed=true;env.DB.raw.prepare('UPDATE research_properties SET duplicate_group=? WHERE property_id=?')
      .run('other-group','HE-R001');}
    return batch(statements);
  };
  const r=await detail(env,cookie);
  assert.equal(r.status,200);assert.equal(r.data.research.duplicate_group,'other-group');
  assert.deepEqual(r.data.duplicate_review.candidates.map(x=>x.listing_id),['HE-R004']);
});

test('BUS-10: a review changed before the batch is reflected in the conflict signal',async()=>{
  const env=setup(),cookie=await adminCookie(),person=applicant(env,91),batch=env.DB.batch.bind(env.DB);
  match(env,person,'HE-R001','shortlisted');match(env,person,'HE-R002','found');
  let changed=false;
  env.DB.batch=async statements=>{
    if(!changed){changed=true;env.DB.raw.prepare("UPDATE matches SET status='rejected',reject_reason='other' WHERE applicant_id=? AND listing_id=?")
      .run(person,'HE-R002');}
    return batch(statements);
  };
  const r=await detail(env,cookie);
  assert.equal(r.status,200);assert.equal(r.data.duplicate_review.candidates[0].match_conflict,'present');
  assert.equal(r.data.matched_applicants[0].status,'shortlisted');
});

test('BUS-10: a listing deleted between the initial read and detail batch returns no stale details',async()=>{
  const env=setup(),cookie=await adminCookie(),batch=env.DB.batch.bind(env.DB);
  let removed=false;
  env.DB.batch=async statements=>{
    if(!removed){removed=true;env.DB.raw.prepare('DELETE FROM listings WHERE id=?').run('HE-R001');}
    return batch(statements);
  };
  const r=await detail(env,cookie);
  assert.equal(r.status,404);assert.equal(r.data.listing,undefined);assert.equal(r.data.duplicate_review,undefined);
});

test('BUS-10: a candidate removed before the snapshot is unavailable and never becomes a link',async()=>{
  const env=setup(),cookie=await adminCookie(),batch=env.DB.batch.bind(env.DB);
  let removed=false;
  env.DB.batch=async statements=>{
    if(!removed){removed=true;env.DB.raw.prepare('DELETE FROM listings WHERE id=?').run('HE-R002');}
    return batch(statements);
  };
  const r=await detail(env,cookie);
  assert.equal(r.status,200);assert.deepEqual(r.data.duplicates,[]);
  assert.deepEqual(r.data.duplicate_review.candidates,[]);assert.equal(r.data.duplicate_review.unavailable,true);
});

test('BUS-10: an invalid existing listing ID cannot become a review link',async()=>{
  const env=setup(),cookie=await adminCookie(),id='HE-R123\n';
  seedListing(env,{id,title:'Synthetic invalid ID'});
  env.DB.raw.prepare('INSERT INTO research_properties(property_id,duplicate_group) VALUES(?,?)').run(id,'fixture-group');
  const review=(await detail(env,cookie)).data.duplicate_review;
  assert.deepEqual(review.candidates.map(x=>x.listing_id),['HE-R002']);
  assert.equal(review.unavailable,true);assert.doesNotMatch(JSON.stringify(review),/HE-R123/);
});

test('BUS-10: malformed conflict snapshots are reported as incomplete',async()=>{
  const {researchDuplicateReview}=await import('../../server/research-duplicate-review.js');
  for (const row of [{candidate_id:'HE-R002',listing_id:'HE-R002',operation:'sale',checked:null,conflict:0},
    {candidate_id:'HE-R002',listing_id:'HE-R002',operation:'sale',checked:0,conflict:null}])
    assert.equal(researchDuplicateReview([row]).candidates[0].match_conflict,'incomplete');
});

test('BUS-10: a found conflict does not hide an incomplete review set',async()=>{
  const {researchDuplicateReview}=await import('../../server/research-duplicate-review.js');
  const row={candidate_id:'HE-R002',listing_id:'HE-R002',operation:'sale',checked:51,conflict:1};
  assert.equal(researchDuplicateReview([row]).candidates[0].match_conflict,'present_incomplete');
});

test('BUS-10: matching opposite reviews in either direction is indexed and never mutates matches',async()=>{
  const env=setup(),cookie=await adminCookie(),person=applicant(env,90);
  match(env,person,'HE-R001','rejected');match(env,person,'HE-R002','shortlisted');
  assert.equal((await detail(env,cookie)).data.duplicate_review.candidates[0].match_conflict,'present');
  const {researchDuplicateReviewStatement}=await import('../../server/research-duplicate-review.js');
  const stmt=researchDuplicateReviewStatement(env,'HE-R001','admin@example.test');
  const plan=env.DB.raw.prepare(`EXPLAIN QUERY PLAN ${stmt.sql}`).all('HE-R001','admin@example.test','HE-R001')
    .map(row=>row.detail).join('\n');
  assert.match(plan,/sqlite_autoindex_matches_1.*applicant_id=.*listing_id=/);
});

test('BUS-10: an equivalent named unique index can serve the review query',async()=>{
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(`CREATE TABLE matches(applicant_id INTEGER, listing_id TEXT, status TEXT);
      CREATE UNIQUE INDEX matches_by_search_listing ON matches(applicant_id, listing_id);
      CREATE TABLE research_properties(property_id TEXT PRIMARY KEY, duplicate_group TEXT);
      CREATE TABLE listings(id TEXT PRIMARY KEY, operation TEXT);
      CREATE TABLE admins(email TEXT PRIMARY KEY);
      INSERT INTO listings VALUES('HE-R001','sale'),('HE-R002','rent');
      INSERT INTO admins VALUES('staff@example.test');
      INSERT INTO research_properties VALUES('HE-R001','test-group'),('HE-R002','test-group');
      INSERT INTO matches VALUES(1,'HE-R001','shortlisted'),(1,'HE-R002','rejected');`);
    const env = {DB:{prepare:sql=>({bind:(...args)=>({sql,args})})}};
    const {researchDuplicateReviewStatement}=await import('../../server/research-duplicate-review.js');
    const statement=researchDuplicateReviewStatement(env,'HE-R001','staff@example.test');
    const rows=db.prepare(statement.sql).all(...statement.args);
    assert.equal(rows.length,1);
    assert.equal(rows[0].conflict,1);
    const plan=db.prepare(`EXPLAIN QUERY PLAN ${statement.sql}`).all(...statement.args)
      .map(row=>row.detail).join('\n');
    assert.match(plan,/matches_by_search_listing.*applicant_id=.*listing_id=/);
  } finally { db.close(); }
});
