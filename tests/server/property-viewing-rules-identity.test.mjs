import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { propertyRulesReservationPrecondition } from '../../server/property-viewing-rules.js';

const require=createRequire(import.meta.url);
const {Miniflare,convertV4MiniflareOptions}=require('miniflare');
const {unstable_splitSqlQuery}=require('wrangler');
const a='00000000-0000-4000-8000-000000000011';
const b='00000000-0000-4000-8000-000000000012';

test('a NULL intermediary cannot resurrect an old rule identity and reservation precondition',async()=>{
  const mf=new Miniflare(convertV4MiniflareOptions({modules:true,
    script:"export default {fetch(){return new Response('fixture')}}",compatibilityDate:'2025-10-01',
    host:'127.0.0.1',port:0,d1Databases:{DB:'vis10-identity-synthetic'}}));
  try {
    const DB=await mf.getD1Database('DB');
    await DB.batch([
      DB.prepare('CREATE TABLE listings(id TEXT PRIMARY KEY,operation TEXT NOT NULL,archived_at TEXT)'),
      DB.prepare('CREATE TABLE negotiators(id INTEGER PRIMARY KEY,active INTEGER NOT NULL)'),
      DB.prepare("INSERT INTO listings VALUES('HE-R901','rent',NULL)"),
      DB.prepare('INSERT INTO negotiators VALUES(1,1)')
    ]);
    const migration=readFileSync(new URL('../../migrations/0051_property_viewing_rules.sql',import.meta.url),'utf8');
    await DB.batch(unstable_splitSqlQuery(migration).map(statement=>DB.prepare(statement)));
    const insertRule=id=>DB.prepare("INSERT INTO property_viewing_rules(id,listing_id,operation,revision,state,notice_hours) VALUES(?,'HE-R901','rent',1,'active',0)").bind(id).run();
    const addMember=id=>DB.prepare('INSERT INTO property_viewing_rule_negotiators(rule_id,negotiator_id) VALUES(?,1)').bind(id).run();
    await insertRule(b);
    await addMember(b);
    await DB.prepare('DELETE FROM property_viewing_rule_negotiators WHERE rule_id=?').bind(b).run();
    await addMember(b); // old identity B, revision 4
    const guard=propertyRulesReservationPrecondition({scope:{listing_id:'HE-R901',operation:'rent'},
      negotiator_id:1,starts_at:new Date(Date.now()+48*3600000).toISOString()},{id:b,revision:4});
    const allowed=async()=>(await DB.prepare(`SELECT (${guard.sql}) AS value`).bind(...guard.binds).first()).value;
    assert.equal(await allowed(),1);
    await DB.prepare('DELETE FROM property_viewing_rules WHERE id=?').bind(b).run();
    await insertRule(a);

    let nullUpdateRejected=false;
    try {
      await DB.prepare('UPDATE property_viewing_rules SET id=NULL,revision=revision+1 WHERE id=?').bind(a).run();
    } catch (error) {
      assert.match(error.message,/Invalid property viewing rule revision|NOT NULL constraint failed/);
      nullUpdateRejected=true;
    }
    if (!nullUpdateRejected) {
      // This is the actual vulnerable A -> NULL -> B sequence; it must not
      // make the previously captured B/revision-4 precondition valid again.
      await DB.prepare('UPDATE property_viewing_rules SET id=?,revision=revision+1 WHERE id IS NULL').bind(b).run();
      await addMember(b);
    }
    assert.equal(await allowed(),0,'a deleted rule identity must never authorize a stale precondition');
    assert.equal(nullUpdateRejected,true,'the first identity change must be rejected');
    const columns=(await DB.prepare('PRAGMA table_info(property_viewing_rules)').all()).results;
    assert.equal(columns.find(column=>column.name==='id').notnull,1);
    assert.equal((await DB.prepare('SELECT id,revision FROM property_viewing_rules WHERE id=?').bind(a).first()).revision,1);
    await assert.rejects(()=>DB.prepare('UPDATE property_viewing_rules SET id=?,revision=revision+1 WHERE id=?').bind(b,a).run());
    assert.equal((await DB.prepare('SELECT COUNT(*) AS n FROM property_viewing_rule_ids WHERE id=?').bind(b).first()).n,1);
  } finally { await mf.dispose(); }
});
