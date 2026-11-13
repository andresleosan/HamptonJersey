import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluate } from '../../server/matching.js';
import { matchCard } from '../../server/routes/matches.js';

const applicant = { operation:'buy', budget_max:1000000, area_answer:'any', pets:'[{"kind":"none"}]',
  match_ranking_version:1, requirement_priorities:JSON.stringify({version:1,values:{budget:'must'},unknown:[]}) };
const home = { id:'BUS12-card', operation:'sale', sale_price:900000, currency:'GBP', availability:'for_sale', archived_at:null };

function row(status, currentListing, currentApplicant = applicant) {
  const previous = evaluate(applicant,home);
  return { id:1,status,eval_applicant:JSON.stringify(currentApplicant),eval_listing:JSON.stringify(currentListing),
    listing:JSON.stringify(currentListing),area_preference_rank:1,requirements_rank:previous.requirements_rank,
    checks:JSON.stringify(previous.checks),score:previous.score };
}

test('found and shortlisted cards expose a current pending rank while flagging saved order', () => {
  for (const status of ['found','shortlisted']) for (const currency of [null,'EUR',undefined]) {
    const card = matchCard(row(status,{...home,currency}));
    assert.equal(card.requirements_status,'pending');
    assert.equal(card.requirements_rank,1);
    assert.equal(card.checks.find(check => check.key === 'budget').result,'unknown');
    assert.equal(card.requirements_refresh_needed,true);
  }
  const unchanged = matchCard(row('found',home));
  assert.equal(unchanged.requirements_status,'meets');
  assert.equal(unchanged.requirements_rank,0);
  assert.notEqual(unchanged.requirements_refresh_needed,true);
});

test('rejected cards keep the historical decision snapshot', () => {
  const old = row('rejected',{...home,currency:null});
  const card = matchCard(old);
  assert.equal(card.requirements_status,'meets');
  assert.equal(card.requirements_rank,0);
  assert.deepEqual(card.checks,JSON.parse(old.checks));
});

test('a legacy search does not expose an old complete rank as current', () => {
  for (const currency of [null,'EUR',undefined]) {
    const card = matchCard(row('found',{...home,currency},{...applicant,requirement_priorities:null}));
    assert.equal(card.requirements_status,'pending');
    assert.equal(card.requirements_rank,1);
    assert.equal(card.checks.find(check => check.key === 'budget').result,'unknown');
    assert.doesNotMatch(card.checks.find(check => check.key === 'budget').evidence ?? '',/£/,
      'old GBP evidence must not describe a price whose current currency is unknown');
  }
  const confirmed = matchCard(row('found',home,{...applicant,requirement_priorities:null}));
  assert.match(confirmed.checks.find(check => check.key === 'budget').evidence,/£/);
});
