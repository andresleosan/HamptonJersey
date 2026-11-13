import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { propertyRulesReservationPrecondition } from '../../server/property-viewing-rules.js';

const require=createRequire(import.meta.url);
const {Miniflare,convertV4MiniflareOptions}=require('miniflare');
const {unstable_splitSqlQuery}=require('wrangler');
const ruleId='00000000-0000-4000-8000-000000000001';
const scope={listing_id:'HE-R901',operation:'rent'};
const start=()=>new Date(Date.now()+25*60*60*1000).toISOString();
const candidate=(overrides={})=>({scope,negotiator_id:1,starts_at:start(),...overrides});
async function revision(DB){return (await DB.prepare('SELECT revision FROM property_viewing_rules WHERE id=?').bind(ruleId).first()).revision;}
function attempt(DB,proposal,rev,id,broken=false){
  const p=propertyRulesReservationPrecondition(proposal,{id:ruleId,revision:rev});
  const write=DB.prepare(`INSERT INTO synthetic_reservations(id) SELECT ? WHERE ${p.sql}`).bind(id,...p.binds);
  const event=broken
    ? DB.prepare('INSERT INTO synthetic_events(id) VALUES (NULL)')
    : DB.prepare('INSERT INTO synthetic_events(id) SELECT ? WHERE changes()=1').bind(id);
  return DB.batch([write,event]);
}

test('D1 precondition is scoped, revisioned and rechecked in the mutation; failures roll back',async()=>{
  const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:"export default {fetch(){return new Response('fixture')}}",
    compatibilityDate:'2025-10-01',host:'127.0.0.1',port:0,d1Databases:{DB:'vis10-synthetic'}}));
  try{
    const DB=await mf.getD1Database('DB');
    await DB.batch([
      DB.prepare('CREATE TABLE listings(id TEXT PRIMARY KEY,operation TEXT NOT NULL,archived_at TEXT)'),
      DB.prepare('CREATE TABLE negotiators(id INTEGER PRIMARY KEY,active INTEGER NOT NULL)'),
      DB.prepare('CREATE TABLE synthetic_reservations(id INTEGER PRIMARY KEY)'),
      DB.prepare('CREATE TABLE synthetic_events(id INTEGER NOT NULL UNIQUE CHECK(id>0))'),
      DB.prepare("INSERT INTO listings VALUES('HE-R901','rent',NULL),('HE-R902','sale',NULL)"),
      DB.prepare('INSERT INTO negotiators VALUES(1,1),(2,1),(3,0)')
    ]);
    const sql=readFileSync(new URL('../../migrations/0051_property_viewing_rules.sql',import.meta.url),'utf8');
    await DB.batch(unstable_splitSqlQuery(sql).map(part=>DB.prepare(part)));
    await DB.prepare("INSERT INTO property_viewing_rules(id,listing_id,operation,revision,state,notice_hours) VALUES(?,?,'rent',1,'active',24)").bind(ruleId,scope.listing_id).run();
    await DB.prepare('INSERT INTO property_viewing_rule_negotiators(rule_id,negotiator_id) VALUES(?,1)').bind(ruleId).run();
    let rev=await revision(DB);
    assert.equal(rev,2);
    assert.equal((await attempt(DB,candidate(),rev,1))[0].meta.changes,1);
    assert.equal((await attempt(DB,candidate({starts_at:new Date(Date.now()+23*60*60*1000).toISOString()}),rev,2))[0].meta.changes,0);
    assert.equal((await attempt(DB,candidate({scope:{listing_id:'HE-R902',operation:'sale'}}),rev,3))[0].meta.changes,0);
    assert.equal((await attempt(DB,candidate({negotiator_id:2}),rev,4))[0].meta.changes,0);
    assert.equal((await attempt(DB,candidate({negotiator_id:3}),rev,5))[0].meta.changes,0);
    assert.equal((await DB.prepare('SELECT COUNT(*) n FROM synthetic_events').first()).n,1);
    await assert.rejects(()=>DB.prepare('INSERT INTO property_viewing_rule_negotiators(rule_id,negotiator_id) VALUES(?,3)').bind(ruleId).run());
    const pending=propertyRulesReservationPrecondition(candidate(),{id:ruleId,revision:rev});
    const revokedInBatch=await DB.batch([
      DB.prepare('DELETE FROM property_viewing_rule_negotiators WHERE rule_id=? AND negotiator_id=1').bind(ruleId),
      DB.prepare(`INSERT INTO synthetic_reservations(id) SELECT 11 WHERE ${pending.sql}`).bind(...pending.binds),
      DB.prepare('INSERT INTO synthetic_events(id) SELECT 11 WHERE changes()=1')
    ]);
    assert.equal(revokedInBatch[1].meta.changes,0);
    assert.equal(revokedInBatch[2].meta.changes,0);
    await DB.prepare('INSERT INTO property_viewing_rule_negotiators(rule_id,negotiator_id) VALUES(?,1)').bind(ruleId).run();
    assert.equal((await attempt(DB,candidate(),rev,12))[0].meta.changes,0);
    rev=await revision(DB);

    const parallel=await Promise.all([24,25].map(hours=>DB.batch([DB.prepare(`UPDATE property_viewing_rules
      SET notice_hours=?,revision=revision+1 WHERE id=? AND revision=? AND state='active'`).bind(hours,ruleId,rev)])));
    assert.deepEqual(parallel.map(result=>result[0].meta.changes).sort(),[0,1]);
    assert.equal((await attempt(DB,candidate(),rev,6))[0].meta.changes,0);
    rev=await revision(DB);
    await DB.prepare('UPDATE negotiators SET active=0 WHERE id=1').run();
    await DB.prepare('UPDATE negotiators SET active=1 WHERE id=1').run();
    assert.equal((await attempt(DB,candidate(),rev,7))[0].meta.changes,0);
    rev=await revision(DB);
    await assert.rejects(()=>attempt(DB,candidate({starts_at:new Date(Date.now()+28*60*60*1000).toISOString()}),rev,9,true));
    assert.equal((await DB.prepare('SELECT COUNT(*) n FROM synthetic_reservations WHERE id=9').first()).n,0);

    await DB.prepare("UPDATE listings SET operation='sale' WHERE id=?").bind(scope.listing_id).run();
    await DB.prepare("UPDATE listings SET operation='rent' WHERE id=?").bind(scope.listing_id).run();
    assert.equal((await attempt(DB,candidate(),await revision(DB),10))[0].meta.changes,0);
    await assert.rejects(()=>DB.prepare("UPDATE property_viewing_rules SET state='active',revision=revision+1 WHERE id=?").bind(ruleId).run());
    await assert.rejects(()=>DB.prepare('DELETE FROM property_viewing_rule_ids WHERE id=?').bind(ruleId).run());
    await assert.rejects(()=>DB.prepare('UPDATE property_viewing_rule_ids SET id=? WHERE id=?').bind('replacement',ruleId).run());
    await DB.prepare('DELETE FROM property_viewing_rules WHERE id=?').bind(ruleId).run();
    await assert.rejects(()=>DB.prepare("INSERT INTO property_viewing_rules(id,listing_id,operation,revision,state,notice_hours) VALUES(?,?,'rent',1,'active',24)").bind(ruleId,scope.listing_id).run());
    const rule2='00000000-0000-4000-8000-000000000002';
    await DB.prepare("INSERT INTO property_viewing_rules(id,listing_id,operation,revision,state,notice_hours) VALUES(?,'HE-R902','sale',1,'active',0)").bind(rule2).run();
    await DB.prepare('INSERT INTO property_viewing_rule_negotiators(rule_id,negotiator_id) VALUES(?,1)').bind(rule2).run();
    await DB.prepare("UPDATE listings SET archived_at='2026-11-13T00:00:00.000Z' WHERE id='HE-R902'").run();
    await DB.prepare("UPDATE listings SET archived_at=NULL WHERE id='HE-R902'").run();
    assert.equal((await DB.prepare('SELECT state FROM property_viewing_rules WHERE id=?').bind(rule2).first()).state,'revoked');
    await DB.prepare("DELETE FROM listings WHERE id='HE-R902'").run();
    assert.equal((await DB.prepare('SELECT COUNT(*) n FROM property_viewing_rules WHERE id=?').bind(rule2).first()).n,0);
    assert.equal((await DB.prepare('SELECT COUNT(*) n FROM property_viewing_rule_negotiators WHERE rule_id=?').bind(rule2).first()).n,0);
    assert.deepEqual((await DB.prepare('PRAGMA foreign_key_check').all()).results,[]);
  } finally {await mf.dispose();}
});
