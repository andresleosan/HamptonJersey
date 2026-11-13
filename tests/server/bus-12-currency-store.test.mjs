import test from 'node:test';
import assert from 'node:assert/strict';
import { recomputeForApplicant, recomputeForApplicantWithStatus, recomputeForListing } from '../../server/match-store.js';
import { makeEnv, seedListing, call, adminCookie, T0 } from './helpers.mjs';

const priorities = JSON.stringify({ version:1, values:{ budget:'must' }, unknown:[] });
const budget = card => card.checks.find(check => check.key === 'budget');

function setup(ids = ['BUS12-001']) {
  const env = makeEnv();
  env.DB.raw.prepare('INSERT INTO contacts(name,email,last_activity_at,created_at,updated_at) VALUES(?,?,?,?,?)')
    .run('Currency fixture','currency@example.test',T0,T0,T0);
  env.DB.raw.prepare(`INSERT INTO applicants(contact_id,operation,stage,source,budget_max,pets,requirement_priorities,area_answer,created_at,updated_at)
    VALUES(1,?,?,?,?,?,?,?,?,?)`)
    .run('buy','searching','phone',1000000,'[{"kind":"none"}]',priorities,'any',T0,T0);
  for (const id of ids) seedListing(env, { id, matchable:1, sale_price:900000, currency:'GBP', parish:'St Helier' });
  return env;
}

const saved = (env, id = 'BUS12-001') => env.DB.raw.prepare(
  'SELECT id,status,score,checks,requirements_rank,reject_reason,reviewed_by,reviewed_at FROM matches WHERE applicant_id=1 AND listing_id=?').get(id);

async function cards(env) {
  const cookie = await adminCookie();
  const page = await call(env,'GET','/admin/applicants/1/matches?status=found',{cookie});
  const review = await call(env,'GET','/admin/review',{cookie});
  assert.equal(page.status,200);
  assert.equal(review.status,200);
  assert.equal(page.data.matches.length,1);
  assert.ok(review.data.match);
  return [page.data.matches[0],review.data.match];
}

for (const legacy of [false,true]) test(`a fresh over-ceiling price without currency is retained as pending (${legacy ? 'legacy' : 'must-have'})`, async () => {
  const env = setup();
  if (legacy) env.DB.raw.prepare('UPDATE applicants SET requirement_priorities=NULL WHERE id=1').run();
  env.DB.raw.prepare('UPDATE listings SET currency=NULL,sale_price=1200000 WHERE id=?').run('BUS12-001');
  const result = await recomputeForApplicant(env,1,'system');
  assert.equal(result.created,1);
  assert.equal(saved(env).status,'found');
  assert.equal(saved(env).requirements_rank,1);
  assert.equal(JSON.parse(saved(env).checks).find(c => c.key === 'budget').result,'unknown');
  for (const card of await cards(env)) {
    assert.equal(card.requirements_status,'pending');
    assert.equal(card.requirements_rank,1);
    assert.equal(budget(card).result,'unknown');
  }
});

for (const route of ['applicant','listing']) test(`${route} recompute and both card routes preserve unknown currency as pending`, async () => {
  const env = setup();
  const recompute = () => route === 'applicant' ? recomputeForApplicant(env,1,'system') : recomputeForListing(env,'BUS12-001','system');
  await recompute();
  assert.equal(saved(env).requirements_rank,0);
  assert.equal(JSON.parse(saved(env).checks).find(c => c.key === 'budget').result,'meets');
  for (const card of await cards(env)) {
    assert.equal(card.requirements_status,'meets');
    assert.equal(budget(card).result,'meets');
  }

  env.DB.raw.prepare('UPDATE listings SET currency=NULL,sale_price=1200000 WHERE id=?').run('BUS12-001');
  for (const card of await cards(env)) {
    assert.equal(card.requirements_status,'pending');
    assert.equal(card.requirements_rank,1);
    assert.equal(budget(card).result,'unknown');
    assert.equal(card.requirements_refresh_needed,true);
  }
  await recompute();
  assert.equal(saved(env).status,'found');
  assert.equal(saved(env).requirements_rank,1);
  assert.equal(JSON.parse(saved(env).checks).find(c => c.key === 'budget').result,'unknown');
  for (const card of await cards(env)) {
    assert.equal(card.requirements_status,'pending');
    assert.equal(card.requirements_rank,1);
    assert.equal(budget(card).result,'unknown');
    assert.notEqual(card.requirements_refresh_needed,true);
  }

  env.DB.raw.prepare("UPDATE listings SET currency='GBP' WHERE id=?").run('BUS12-001');
  await recompute();
  assert.equal(saved(env).requirements_rank,2);
  for (const card of await cards(env)) {
    assert.equal(card.requirements_status,'alternative');
    assert.equal(budget(card).result,'fails');
  }
});

test('recomputing uncertain prices preserves found, shortlisted and rejected human decisions', async () => {
  const env = setup(['BUS12-001','BUS12-002','BUS12-003']);
  await recomputeForApplicant(env,1,'system');
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) n FROM matches').get().n,3);
  env.DB.raw.prepare("UPDATE matches SET status='shortlisted',reviewed_by='human',reviewed_at=? WHERE listing_id='BUS12-002'").run(T0);
  env.DB.raw.prepare("UPDATE matches SET status='rejected',reject_reason='price',reviewed_by='human',reviewed_at=? WHERE listing_id='BUS12-003'").run(T0);
  const rejected = {...saved(env,'BUS12-003')};
  env.DB.raw.prepare("UPDATE listings SET currency=CASE WHEN id='BUS12-002' THEN 'EUR' ELSE NULL END,sale_price=1200000").run();
  await recomputeForApplicant(env,1,'system');
  for (const id of ['BUS12-001','BUS12-002','BUS12-003']) await recomputeForListing(env,id,'system');
  assert.equal(saved(env,'BUS12-001').status,'found');
  assert.equal(saved(env,'BUS12-002').status,'shortlisted');
  for (const id of ['BUS12-001','BUS12-002']) {
    assert.equal(saved(env,id).requirements_rank,1);
    assert.equal(JSON.parse(saved(env,id).checks).find(c => c.key === 'budget').result,'unknown');
  }
  assert.deepEqual({...saved(env,'BUS12-003')},rejected);
  const cookie = await adminCookie();
  const shortlist = await call(env,'GET','/admin/applicants/1/matches?status=shortlisted',{cookie});
  assert.equal(shortlist.status,200);
  assert.equal(shortlist.data.matches[0].requirements_status,'pending');
  assert.equal(budget(shortlist.data.matches[0]).result,'unknown');
  const history = await call(env,'GET','/admin/applicants/1/matches?status=rejected',{cookie});
  assert.equal(history.status,200);
  assert.equal(history.data.matches[0].requirements_rank,rejected.requirements_rank);
  assert.deepEqual(history.data.matches[0].checks,JSON.parse(rejected.checks));
});

test('applicant detail does not count old GBP ranks after currency becomes unknown', async () => {
  const env = setup(['BUS12-001','BUS12-002','BUS12-003']);
  await recomputeForApplicant(env,1,'system');
  const cookie = await adminCookie();
  const detail = () => call(env,'GET','/admin/applicants/1',{cookie});
  assert.equal((await detail()).data.widen,null);
  env.DB.raw.prepare('UPDATE listings SET currency=NULL').run();
  const response = await detail();
  assert.equal(response.status,200);
  assert.ok(Array.isArray(response.data.widen));
  assert.equal(response.data.widen.find(change => change.key === 'budget').added,0);
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) n FROM matches WHERE requirements_rank=0').get().n,3,
    'reading detail must not rewrite saved rankings');
});

test('the page cursor uses stored ordering while cards expose current pending ranks', async () => {
  const ids = Array.from({length:27}, (_,i) => `BUS12-${String(i).padStart(3,'0')}`);
  const env = setup(ids);
  await recomputeForApplicant(env,1,'system');
  env.DB.raw.prepare('UPDATE listings SET currency=NULL WHERE id IN (?,?)').run(ids[0],ids[1]);
  const cookie = await adminCookie();
  const first = await call(env,'GET','/admin/applicants/1/matches?status=found',{cookie});
  assert.equal(first.status,200);
  assert.equal(first.data.matches.length,25);
  assert.ok(first.data.next);
  const decoded = JSON.parse(Buffer.from(first.data.next,'base64url').toString());
  assert.equal(decoded.rank,0,'the cursor retains the stored ordering value');
  const second = await call(env,'GET',`/admin/applicants/1/matches?status=found&after=${encodeURIComponent(first.data.next)}`,{cookie});
  assert.equal(second.status,200);
  assert.equal(second.data.matches.length,2);
  assert.equal(second.data.next,null);
  const all = [...first.data.matches,...second.data.matches];
  assert.deepEqual(all.map(card => card.listing.id),ids);
  assert.equal(new Set(all.map(card => card.listing.id)).size,27);
  for (const card of all) {
    const uncertain = ids.slice(0,2).includes(card.listing.id);
    assert.equal(card.requirements_rank,uncertain ? 1 : 0);
    assert.equal(card.requirements_status,uncertain ? 'pending' : 'meets');
    assert.equal(card.requirements_refresh_needed === true,uncertain);
  }
});

test('legacy saved ranks are not exposed as current complete requirements', async () => {
  const env = setup();
  await recomputeForApplicant(env,1,'system');
  env.DB.raw.prepare('UPDATE applicants SET requirement_priorities=NULL WHERE id=1').run();
  env.DB.raw.prepare('UPDATE listings SET currency=NULL WHERE id=?').run('BUS12-001');
  for (const card of await cards(env)) {
    assert.equal(card.requirements_status,'pending');
    assert.equal(card.requirements_rank,1);
    assert.equal(budget(card).result,'unknown');
    assert.doesNotMatch(budget(card).evidence ?? '',/£/);
  }
  assert.equal(saved(env).requirements_rank,0,'historical ordering remains stored until recalculation');
});

for (const route of ['applicant','listing']) test(`${route} recompute does not persist a stale GBP evaluation after a currency change`, async () => {
  const env = setup();
  const batch = env.DB.batch.bind(env.DB);
  let injected = false;
  env.DB.batch = async statements => {
    if (!injected && statements.some(s => s.sql.includes("'applicant.matched'"))) {
      injected = true;
      env.DB.raw.prepare('UPDATE listings SET currency=NULL WHERE id=?').run('BUS12-001');
    }
    return batch(statements);
  };
  const first = route === 'applicant' ? await recomputeForApplicantWithStatus(env,1,'system')
    : await recomputeForListing(env,'BUS12-001','system');
  assert.equal(injected,true);
  if (route === 'applicant') assert.equal(first.completed,false);
  assert.equal(env.DB.raw.prepare('SELECT version FROM listing_match_inputs WHERE listing_id=?').get('BUS12-001').version,1);
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) n FROM matches').get().n,0);
  assert.equal(env.DB.raw.prepare("SELECT COUNT(*) n FROM events WHERE type='applicant.matched'").get().n,0);
  if (route === 'applicant') await recomputeForApplicant(env,1,'system');
  else await recomputeForListing(env,'BUS12-001','system');
  assert.equal(saved(env).requirements_rank,1);
  assert.equal(JSON.parse(saved(env).checks).find(c => c.key === 'budget').result,'unknown');
});

test('new EUR candidate is proposed with an unknown budget and contributes to review counts', async () => {
  const env=setup();
  env.DB.raw.prepare("UPDATE listings SET currency='EUR', sale_price=1200000 WHERE id='BUS12-001'").run();
  const cookie=await adminCookie();
  const before=await call(env,'GET','/admin/insights',{cookie});
  const parishBefore=before.data.demand.buy.find(r=>r.parish==='St Helier');
  assert.equal(parishBefore?.listings,1);
  const outcome=await recomputeForApplicant(env,1,'system');
  assert.equal(outcome.created,1);
  assert.equal(saved(env).status,'found');
  assert.equal(saved(env).requirements_rank,1);
  assert.equal(JSON.parse(saved(env).checks).find(c=>c.key==='budget').result,'unknown');
  assert.equal(env.DB.raw.prepare("SELECT COUNT(*) n FROM notifications WHERE category='matched' AND resolved_at IS NULL").get().n,1);
  for (const card of await cards(env)) assert.equal(budget(card).result,'unknown');
  const after=await call(env,'GET','/admin/insights',{cookie});
  assert.equal(after.data.unmet.length,0);
});

test('listing recompute proposes EUR with preferred budget unknown and keeps rejected decisions', async () => {
  const env=setup(['BUS12-001','BUS12-002']);
  env.DB.raw.prepare('UPDATE applicants SET requirement_priorities=? WHERE id=1')
    .run(JSON.stringify({version:1,values:{budget:'preferred'},unknown:[]}));
  await recomputeForApplicant(env,1,'system');
  env.DB.raw.prepare("UPDATE matches SET status='rejected',reject_reason='price',reviewed_by='human',reviewed_at=? WHERE listing_id='BUS12-002'").run(T0);
  const rejected={...saved(env,'BUS12-002')};
  env.DB.raw.prepare("DELETE FROM matches WHERE listing_id='BUS12-001'").run();
  env.DB.raw.prepare("UPDATE listings SET currency='EUR',sale_price=1200000").run();
  await recomputeForListing(env,'BUS12-001','system');
  await recomputeForListing(env,'BUS12-002','system');
  assert.equal(saved(env).status,'found');
  assert.equal(JSON.parse(saved(env).checks).find(c=>c.key==='budget').result,'unknown');
  for (const card of await cards(env)) {
    assert.equal(card.requirements_status,'meets');
    assert.equal(budget(card).result,'unknown');
    assert.equal(budget(card).priority,'preferred');
  }
  assert.deepEqual({...saved(env,'BUS12-002')},rejected);
});
