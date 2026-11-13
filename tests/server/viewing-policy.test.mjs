import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveViewingPolicy, canReserveViewing } from '../../server/viewing-policy.js';

const policy = () => resolveViewingPolicy(null, null);
const entry = (id, time, end_time, parish = 'St Helier', overrides = {}) => ({
  id, negotiator_id:1, date:'2026-11-13', time, end_time, status:'confirmed', parish,
  buffer_minutes:15, parish_extra_minutes:15, policy_revision:1, ...overrides,
});
const candidate = (time, parish = 'St Helier', overrides = {}) => ({
  negotiator_id:1, date:'2026-11-13', time, parish, ...overrides,
});
const decide = (bookings, time, parish, options = {}, selectedPolicy = policy()) =>
  canReserveViewing({policy:selectedPolicy, bookings}, candidate(time, parish), options);

test('defaults and configured policy validate all limits without inventing zero as unlimited', () => {
  assert.deepEqual(policy(), { duration_minutes:30, buffer_minutes:15, parish_extra_minutes:15, max_daily:8, revision:0 });
  const configured = { duration_minutes:45, buffer_minutes:0, parish_extra_minutes:0, max_daily:1, revision:2 };
  assert.deepEqual(resolveViewingPolicy({viewing_policy:configured}), configured);
  for (const invalid of [
    {...configured,duration_minutes:0}, {...configured,duration_minutes:12}, {...configured,duration_minutes:185},
    {...configured,buffer_minutes:-1}, {...configured,parish_extra_minutes:121}, {...configured,max_daily:0},
    {...configured,max_daily:1.5}, {...configured,revision:-1}, {...configured,duration_minutes:'30'},
  ]) assert.throws(() => resolveViewingPolicy({viewing_policy:invalid}), /policy/i);
  assert.throws(() => resolveViewingPolicy({viewing_policy:{duration_minutes:30}}), /policy/i);
});

test('same parish uses one 15 minute margin between the previous appointment and the candidate', () => {
  const old = entry(1,'10:00','10:30');
  assert.equal(decide([old],'10:45','St Helier').allowed,true);
  assert.equal(decide([old],'10:30','St Helier').allowed,false);
});

test('different or unknown parish uses 30 minutes and remains visibly unconfirmed', () => {
  const old = entry(1,'10:00','10:30');
  assert.equal(decide([old],'10:45','Trinity').allowed,false);
  assert.equal(decide([old],'11:00','Trinity').allowed,true);
  const unknown = decide([old],'11:00',null);
  assert.equal(unknown.allowed,true);
  assert.ok(unknown.warnings.includes('parish_unconfirmed'));
  assert.equal(decide([entry(1,'10:00','10:30',null)],'10:45',null).allowed,false);
  assert.equal(decide([entry(1,'10:00','10:30','not-a-parish')],'10:45','not-a-parish').allowed,false);
});

test('checks both the next and previous appointments and uses the larger recorded buffer', () => {
  const old = entry(1,'11:00','11:30','St Helier',{buffer_minutes:20});
  assert.equal(decide([old],'10:10','St Helier').allowed,true);
  assert.equal(decide([old],'10:15','St Helier').allowed,false);
  assert.equal(decide([old],'09:55','Trinity').allowed,true);
  assert.equal(decide([old],'10:00','Trinity').allowed,false);
  assert.equal(decide([entry(2,'10:00','10:30'),'ignored'].filter(x=>typeof x==='object'),'10:45','St Helier').allowed,true);
});

test('ninth booking is refused, cancelled appointments do not count and other days or staff are separate', () => {
  const existing = Array.from({length:8},(_,i)=>entry(i+1,`${String(i+8).padStart(2,'0')}:00`,`${String(i+8).padStart(2,'0')}:30`));
  assert.ok(decide(existing,'23:00','St Helier').reasons.includes('daily_limit'));
  assert.equal(decide(existing.map((x,i)=>i===0?{...x,status:'cancelled'}:x),'23:00','St Helier').allowed,true);
  assert.equal(decide(existing.map((x,i)=>i===0?{...x,date:'2026-11-12'}:x),'23:00','St Helier').allowed,true);
  assert.equal(decide(existing.map((x,i)=>i===0?{...x,negotiator_id:2}:x),'23:00','St Helier').allowed,true);
});

test('a rescheduled appointment does not conflict with or count itself', () => {
  const existing = Array.from({length:8},(_,i)=>entry(i+1,`${String(i+8).padStart(2,'0')}:00`,`${String(i+8).padStart(2,'0')}:30`));
  assert.equal(decide(existing,'08:00','St Helier',{excludeViewingId:1}).allowed,true);
  assert.equal(decide(existing,'08:00','St Helier').allowed,false);
});

test('malformed candidate or legacy appointment fails closed, and cancelled data is ignored', () => {
  assert.throws(()=>canReserveViewing({policy:policy(),bookings:[]},candidate('25:00')),/candidate/i);
  assert.throws(()=>canReserveViewing({policy:policy(),bookings:[]},candidate('23:45')),/candidate/i);
  assert.throws(()=>canReserveViewing({policy:policy(),bookings:[]},candidate('10:00','St Helier',{date:'2026-02-30'})),/candidate/i);
  const corrupt=entry(1,'10:00','bad');
  assert.ok(decide([corrupt],'11:00','St Helier').reasons.includes('invalid_booking'));
  assert.equal(decide([{...corrupt,status:'cancelled'}],'11:00','St Helier').allowed,true);
});

test('completed and no-show appointments still count toward the daily limit', () => {
  const existing = Array.from({length:8},(_,i)=>entry(i+1,`${String(i+8).padStart(2,'0')}:00`,`${String(i+8).padStart(2,'0')}:30`,
    'St Helier',{status:i===0?'completed':i===1?'no_show':'requested'}));
  assert.ok(decide(existing,'23:00','St Helier').reasons.includes('daily_limit'));
});

test('buffers apply across the Jersey calendar boundary without changing daily counts', () => {
  const previous=entry(1,'23:30','24:00','St Helier',{date:'2026-11-12'});
  const after={negotiator_id:1,date:'2026-11-13',time:'00:00',parish:'St Helier'};
  assert.equal(canReserveViewing({policy:policy(),bookings:[previous]},after).allowed,false);
  assert.equal(canReserveViewing({policy:policy(),bookings:[previous]},{...after,time:'00:15'}).allowed,true);
  assert.equal(canReserveViewing({policy:policy(),bookings:[previous]},{...after,time:'00:15',parish:'Trinity'}).allowed,false);
  const next=entry(2,'00:15','00:45','St Helier',{date:'2026-11-13'});
  const before={negotiator_id:1,date:'2026-11-12',time:'23:30',parish:'St Helier'};
  assert.equal(canReserveViewing({policy:policy(),bookings:[next]},before).allowed,true);
  assert.equal(canReserveViewing({policy:policy(),bookings:[next]},{...before,parish:null}).allowed,false);
});


test('unrepresentable daylight-saving intervals fail closed until offset-aware bookings exist', () => {
  for (const date of ['2026-03-29','2026-10-25']) {
    const result=canReserveViewing({policy:policy(),bookings:[]},candidate('01:30','St Helier',{date}));
    assert.equal(result.allowed,false,date);
    assert.ok(result.reasons.includes('timezone_transition_review'),date);
  }
});

test('malformed candidate parish is rejected rather than treated as a known place', () => {
  assert.throws(()=>canReserveViewing({policy:policy(),bookings:[]},candidate('10:00',{})),/candidate/i);
});

test('legacy bookings never infer a parish from a current listing without a policy snapshot', () => {
  const legacy=entry(1,'10:00','10:30','St Helier',{buffer_minutes:null,parish_extra_minutes:null,policy_revision:null});
  const result=decide([legacy],'10:45','St Helier');
  assert.equal(result.allowed,false);
  assert.ok(result.warnings.includes('parish_unconfirmed'));
});
