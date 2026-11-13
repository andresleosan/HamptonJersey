import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { resolveViewingPolicy, canReserveViewing, reservationPolicyGuard } from '../../server/viewing-policy.js';

const migrations = new URL('../../migrations/0047_viewing_policy.sql',import.meta.url);
const activePolicy = {duration_minutes:30,buffer_minutes:15,parish_extra_minutes:15,max_daily:8,revision:1};
const candidate = (time,overrides={})=>({negotiator_id:1,date:'2026-11-13',time,
  listing_id:'HE-R001',parish:'St Helier',...overrides});
function world() {
  const db=new DatabaseSync(':memory:');
  db.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE negotiators(id INTEGER PRIMARY KEY,active INTEGER NOT NULL);
    CREATE TABLE listings(id TEXT PRIMARY KEY,parish TEXT);
    CREATE TABLE viewing_requests(id INTEGER PRIMARY KEY,negotiator_id INTEGER,date TEXT,time TEXT,end_time TEXT,
      status TEXT CHECK(status IN ('requested','confirmed','completed','no_show','cancelled')));
    INSERT INTO negotiators VALUES(1,1),(2,1);
    INSERT INTO listings VALUES('HE-R001','St Helier'),('HE-R002','Trinity');`);
  db.exec(readFileSync(migrations,'utf8'));
  db.prepare(`INSERT INTO viewing_policy_settings(negotiator_id,duration_minutes,buffer_minutes,parish_extra_minutes,max_daily,revision,updated_at,updated_by)
    VALUES (1,30,15,15,8,1,'2026-11-13T00:00:00.000Z','fixture')`).run();
  return db;
}
function tryInsert(db,v,policy=activePolicy,options={}) {
  const guard=reservationPolicyGuard(v,policy,options);
  return db.prepare(`INSERT INTO viewing_requests(negotiator_id,date,time,end_time,status)
    SELECT ?,?,?,?,'requested' WHERE ${guard.sql}`)
    .run(v.negotiator_id,v.date,v.time,`${String(Math.floor((Number(v.time.slice(0,2))*60+Number(v.time.slice(3))+policy.duration_minutes)/60)).padStart(2,'0')}:${String((Number(v.time.slice(0,2))*60+Number(v.time.slice(3))+policy.duration_minutes)%60).padStart(2,'0')}`,...guard.binds).changes;
}
function tryMove(db,id,v,policy=activePolicy) {
  const guard=reservationPolicyGuard(v,policy,{excludeViewingId:id});
  const total=Number(v.time.slice(0,2))*60+Number(v.time.slice(3))+policy.duration_minutes;
  const end=`${String(Math.floor(total/60)).padStart(2,'0')}:${String(total%60).padStart(2,'0')}`;
  return db.prepare(`UPDATE viewing_requests SET negotiator_id=?,date=?,time=?,end_time=? WHERE id=? AND ${guard.sql}`)
    .run(v.negotiator_id,v.date,v.time,end,id,...guard.binds).changes;
}
function old(db,id,time,end,status='confirmed',negotiator=1,date='2026-11-13') {
  db.prepare('INSERT INTO viewing_requests(id,negotiator_id,date,time,end_time,status) VALUES(?,?,?,?,?,?)')
    .run(id,negotiator,date,time,end,status);
}
function snapshot(db,id,parish,buffer=15,extra=15) {
  db.prepare('INSERT INTO viewing_policy_snapshots(viewing_id,parish,buffer_minutes,parish_extra_minutes,policy_revision) VALUES(?,?,?,?,?)')
    .run(id,parish,buffer,extra,1);
}

test('migration preserves existing bookings, foreign keys and inactive status', () => {
  const db=world();old(db,4,'10:00','10:30');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM viewing_requests').get().n,1);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM viewing_policy_snapshots').get().n,0);
});

test('the guard matches same and different parish margins and treats missing history conservatively', () => {
  const db=world();old(db,1,'10:00','10:30');snapshot(db,1,'St Helier');
  assert.equal(tryInsert(db,candidate('10:30')),0);
  assert.equal(tryInsert(db,candidate('10:45')),1);
  const other=world();old(other,1,'10:00','10:30');snapshot(other,1,'Trinity');
  assert.equal(tryInsert(other,candidate('10:45')),0);
  assert.equal(tryInsert(other,candidate('11:00')),1);
  const legacy=world();old(legacy,1,'10:00','10:30');
  assert.equal(tryInsert(legacy,candidate('10:45')),0);
  assert.equal(tryInsert(legacy,candidate('11:00')),1);
});

test('guard rejects stale policy, changed parish, inactive staff and malformed existing time', () => {
  const db=world();
  db.prepare('UPDATE viewing_policy_settings SET revision=2 WHERE negotiator_id=1').run();
  assert.equal(tryInsert(db,candidate('12:00')),0);
  const next={...activePolicy,revision:2};
  db.prepare("UPDATE listings SET parish='Trinity' WHERE id='HE-R001'").run();
  assert.equal(tryInsert(db,candidate('12:00'),next),0);
  db.prepare('UPDATE negotiators SET active=0 WHERE id=1').run();
  assert.equal(tryInsert(db,candidate('12:00',{parish:'Trinity'}),next),0);
  const corrupt=world();old(corrupt,1,'10:00','invalid');
  assert.equal(tryInsert(corrupt,candidate('12:00')),0);
});

test('guard limits non-cancelled bookings, excludes the moved row and preserves other agents and dates', () => {
  const db=world();for(let i=0;i<8;i++)old(db,i+1,`${String(i+8).padStart(2,'0')}:00`,`${String(i+8).padStart(2,'0')}:30`);
  assert.equal(tryInsert(db,candidate('22:00')),0);
  assert.equal(tryMove(db,1,candidate('22:00')),1);
  const other=world();for(let i=0;i<7;i++)old(other,i+1,`${String(i+8).padStart(2,'0')}:00`,`${String(i+8).padStart(2,'0')}:30`);
  old(other,8,'20:00','20:30','cancelled');old(other,9,'20:00','20:30','confirmed',2);
  assert.equal(tryInsert(other,candidate('22:00')),1);
});

test('policy revisions cannot be reset through delete, replace or negotiator reassignment', () => {
  const db=world();
  assert.throws(()=>db.prepare('DELETE FROM viewing_policy_settings WHERE negotiator_id=1').run());
  assert.throws(()=>db.prepare('UPDATE viewing_policy_settings SET revision=1 WHERE negotiator_id=1').run());
  assert.throws(()=>db.prepare('UPDATE viewing_policy_settings SET negotiator_id=2,revision=2 WHERE negotiator_id=1').run());
  assert.throws(()=>db.prepare(`INSERT OR REPLACE INTO viewing_policy_settings(negotiator_id,duration_minutes,buffer_minutes,parish_extra_minutes,max_daily,revision,updated_at,updated_by)
    VALUES(1,30,15,15,8,1,'2026-11-13T00:00:00.000Z','fixture')`).run());
  assert.equal(db.prepare('SELECT revision FROM viewing_policy_settings WHERE negotiator_id=1').get().revision,1);
  assert.throws(()=>db.prepare(`INSERT INTO viewing_policy_settings(negotiator_id,duration_minutes,buffer_minutes,parish_extra_minutes,max_daily,revision,updated_at,updated_by)
    VALUES(2,30,15,15,8,0,'2026-11-13T00:00:00.000Z','fixture')`).run());
});

test('default policy guard works only while no explicit policy exists', () => {
  const db=world(),v=candidate('12:00',{negotiator_id:2});
  assert.equal(tryInsert(db,v,resolveViewingPolicy()),1);
  db.prepare(`INSERT INTO viewing_policy_settings(negotiator_id,duration_minutes,buffer_minutes,parish_extra_minutes,max_daily,revision,updated_at,updated_by)
    VALUES(2,30,15,15,8,1,'2026-11-13T00:00:00.000Z','fixture')`).run();
  assert.equal(tryInsert(db,candidate('16:00',{negotiator_id:2}),resolveViewingPolicy()),0);
});

test('atomic guard checks previous and next Jersey calendar dates near midnight', () => {
  const db=world();old(db,1,'23:30','24:00','confirmed',1,'2026-11-12');snapshot(db,1,'St Helier');
  assert.equal(tryInsert(db,candidate('00:00')),0);
  assert.equal(tryInsert(db,candidate('00:15')),1);
  const tomorrow=world();old(tomorrow,1,'00:15','00:45','confirmed',1,'2026-11-14');snapshot(tomorrow,1,'Trinity');
  assert.equal(tryInsert(tomorrow,candidate('23:30')),0);
});

test('the pure calculation and SQL predicate agree over mixed dates, parishes, statuses and moves', () => {
  let seed=20261113;
  const rand=n=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n;};
  const pad=n=>String(n).padStart(2,'0');
  const clock=n=>`${pad(Math.floor(n/60))}:${pad(n%60)}`;
  const dates=['2026-11-11','2026-11-12','2026-11-13','2026-11-14'];
  const parishes=[null,'St Helier','Trinity'],statuses=['requested','confirmed','completed','no_show','cancelled'];
  for(let run=0;run<120;run++){
    const db=world(),bookings=[],n=rand(10);
    for(let i=1;i<=n;i++){
      const time=rand(48)*30,end=Math.min(1440,time+30),date=dates[rand(dates.length)],status=statuses[rand(statuses.length)];
      const person=rand(5)===0?2:1,hasSnapshot=rand(2)===0,parish=hasSnapshot?parishes[rand(parishes.length)]:null;
      old(db,i,clock(time),clock(end),status,person,date);
      if(hasSnapshot)snapshot(db,i,parish,15,15);
      bookings.push({id:i,negotiator_id:person,date,time:clock(time),end_time:clock(end),status,parish,
        buffer_minutes:hasSnapshot?15:null,parish_extra_minutes:hasSnapshot?15:null,policy_revision:hasSnapshot?1:null});
    }
    const which=rand(3),v=candidate(clock(rand(48)*30),which===0?{listing_id:null,parish:null}
      :which===1?{}:{listing_id:'HE-R002',parish:'Trinity'});
    const excludeViewingId=n&&rand(3)===0?1+rand(n):null;
    const pure=canReserveViewing({policy:activePolicy,bookings},v,{excludeViewingId}).allowed;
    const guard=reservationPolicyGuard(v,activePolicy,{excludeViewingId});
    const fromSql=db.prepare(`SELECT ${guard.sql} AS allowed`).get(...guard.binds).allowed===1;
    assert.equal(fromSql,pure,`case ${run}`);
    db.close();
  }
});


test('atomic guard refuses an ambiguous daylight-saving date even without other bookings', () => {
  const db=world();
  for(const date of ['2026-03-29','2026-10-25'])
    assert.equal(tryInsert(db,candidate('01:30',{date})),0,date);
});

test('an appointment with unknown state cannot silently free the guard', () => {
  const db=world();old(db,1,'10:00','10:30',null);
  assert.equal(tryInsert(db,candidate('12:00')),0);
});

test('a non-cancelled booking with an invalid local date requires review instead of being skipped', () => {
  const db=world();old(db,1,'10:00','10:30','confirmed',1,'2026-02-30');
  assert.equal(tryInsert(db,candidate('12:00')),0);
});
