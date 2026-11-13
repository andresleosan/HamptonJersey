import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {makeDb} from './helpers.mjs';
let domain={},facade={};
try { domain=await import('../../server/internal/rental-inspections-domain.js'); }
catch(e) { if(e.code!=='ERR_MODULE_NOT_FOUND')throw e; }
try { facade=await import('../../server/rental-inspections.js'); }
catch(e) { if(e.code!=='ERR_MODULE_NOT_FOUND')throw e; }
const actor='admin@example.test', clock=()=>new Date('2026-07-01T23:30:00.000Z');
const uid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const haveDomain=()=>{for(const name of ['nextInspectionDueCore','createInspectionDraftCore','rescheduleInspectionCore',
  'saveInspectionDraftCore','reviewInspectionEvidenceCore','revokeInspectionEvidenceCore','completeInspectionCore',
  'inspectionEvidenceStatusCore']) assert.equal(typeof domain[name],'function',`${name} is missing`);};
const createInput=(extra={})=>({id:uid(1),rental_id:1,tenancy_id:null,last_completed_on:null,initial_due_on:'2026-06-30',
  scheduled_on:null,template_version:1,items:[{id:uid(2),room:'Kitchen',check:'Condition'},{id:uid(3),room:'Hall',check:'Alarm'}],...extra});
const create=(extra={})=>{haveDomain();return domain.createInspectionDraftCore(createInput(extra),actor,clock);};
const req=(state,extra={})=>({inspection_id:state.id,rental_id:state.rental_id,expected_revision:state.revision,...extra});
const conflict=e=>e.status===409;

test('inspection core exists while its public service stays unavailable',async()=>{
  haveDomain();
  for(const name of ['scheduleInspection','saveInspection','completeInspection','reviewInspectionEvidence','revokeInspectionEvidence'])
    await assert.rejects(facade[name]({}, {}, actor),e=>e.status===503);
  assert.equal(Object.keys(facade).some(k=>/owner|report|send|upload|download/i.test(k)),false);
});

test('first date is explicit and six calendar months clamp at month end',()=>{
  haveDomain();
  assert.deepEqual(domain.nextInspectionDueCore({last_completed_on:null,initial_due_on:null}),{status:'baseline_required',due_on:null});
  assert.deepEqual(domain.nextInspectionDueCore({last_completed_on:null,initial_due_on:'2026-02-28'}),{status:'ready',due_on:'2026-02-28'});
  assert.deepEqual(domain.nextInspectionDueCore({last_completed_on:'2027-08-31',initial_due_on:'2020-01-01'}),{status:'ready',due_on:'2028-02-29'});
  assert.deepEqual(domain.nextInspectionDueCore({last_completed_on:'2028-02-29',initial_due_on:null}),{status:'ready',due_on:'2028-08-29'});
  for(const bad of ['2026-02-30','0000-01-01','9999-08-31','abc'])
    assert.throws(()=>domain.nextInspectionDueCore({last_completed_on:bad,initial_due_on:null}),e=>e.status===400);
});

test('missing first due date requests a baseline and never invents completed history',()=>{
  const out=create({initial_due_on:null});
  assert.deepEqual(out,{status:'baseline_required',due_on:null});
  const draft=create();assert.equal(draft.due_on,'2026-06-30');assert.equal(draft.last_completed_on,null);
  assert.equal(draft.completed_on,null);assert.equal(draft.status,'open');
  assert.deepEqual(draft.items.map(x=>x.result),['not_checked','not_checked']);
});

test('rescheduling does not change due date or record completion',()=>{
  const before=create(),after=domain.rescheduleInspectionCore(before,req(before,{scheduled_on:'2026-07-05'}),actor,clock);
  assert.equal(after.scheduled_on,'2026-07-05');assert.equal(after.due_on,before.due_on);assert.equal(after.completed_on,null);
  assert.equal(after.revision,2);assert.equal(before.scheduled_on,null);assert.equal(before.revision,1);
});

test('draft saves are versioned, case-scoped and never silently mark missing checks OK',()=>{
  const before=create(),save=req(before,{template_version:1,items:[{id:uid(2),result:'issue',note:'Synthetic crack'}],
    meter_readings:[{name:'Electricity',value:'123.45',unit:'kWh'}]});
  const after=domain.saveInspectionDraftCore(before,save,actor,clock);
  assert.equal(after.items[0].result,'issue');assert.equal(after.items[1].result,'not_checked');
  assert.equal(after.meter_readings[0].value,'123.45');assert.equal(before.items[0].result,'not_checked');
  assert.throws(()=>domain.saveInspectionDraftCore(after,save,actor,clock),conflict);
  assert.throws(()=>domain.saveInspectionDraftCore(after,req(after,{rental_id:2,template_version:1,items:[]}),actor,clock),conflict);
  assert.throws(()=>domain.saveInspectionDraftCore(after,req(after,{template_version:2,items:[]}),actor,clock),conflict);
});

test('completion requires nonempty checked items and uses Jersey date for future checks',()=>{
  let x=create();assert.throws(()=>domain.completeInspectionCore(x,req(x,{completed_on:'2026-07-02'}),actor,clock),e=>e.status===400);
  x=domain.saveInspectionDraftCore(x,req(x,{template_version:1,items:[{id:uid(2),result:'ok',note:null},{id:uid(3),result:'issue',note:null}]}),actor,clock);
  assert.throws(()=>domain.completeInspectionCore(x,req(x,{completed_on:'2026-07-03'}),actor,clock),e=>e.status===400);
  const result=domain.completeInspectionCore(x,req(x,{completed_on:'2026-07-02'}),actor,clock);
  assert.equal(result.inspection.status,'completed');assert.equal(result.next_due_on,'2027-01-02');assert.equal(result.inspection.completed_by,actor);
  assert.equal(x.status,'open');
  const empty=create({items:[]});assert.throws(()=>domain.completeInspectionCore(empty,req(empty,{completed_on:'2026-07-02'}),actor,clock),e=>e.status===400);
});

test('external evidence is opaque, server-attributed and cannot be supplied as a URL or foreign case',()=>{
  const x=create();
  for(const bad of ['https://example.test/photo','r2:private-object','x'.repeat(121),'../other'])
    assert.throws(()=>domain.reviewInspectionEvidenceCore(x,req(x,{item_id:uid(2),evidence_ref:bad}),actor,clock),e=>e.status===400);
  assert.throws(()=>domain.reviewInspectionEvidenceCore(x,req(x,{item_id:uid(2),evidence_ref:'external:abc',reviewed_by:'other'}),actor,clock),e=>e.status===400);
  assert.throws(()=>domain.reviewInspectionEvidenceCore(x,req(x,{rental_id:2,item_id:uid(2),evidence_ref:'external:abc'}),actor,clock),conflict);
  const y=domain.reviewInspectionEvidenceCore(x,req(x,{item_id:uid(2),evidence_ref:'external:abc'}),actor,clock);
  const e=y.items[0].evidence[0];assert.equal(e.reviewed_by,actor);assert.equal(e.reviewed_at,clock().toISOString());assert.equal(e.revision,1);
  assert.equal(domain.inspectionEvidenceStatusCore(y),'review_declared');assert.equal(x.items[0].evidence.length,0);
});

test('revoked evidence cannot support completion or be silently re-added',()=>{
  let x=create();x=domain.reviewInspectionEvidenceCore(x,req(x,{item_id:uid(2),evidence_ref:'external:abc'}),actor,clock);
  const evidence=x.items[0].evidence[0];
  x=domain.revokeInspectionEvidenceCore(x,req(x,{item_id:uid(2),evidence_id:evidence.id,expected_evidence_revision:1}),actor,clock);
  assert.equal(domain.inspectionEvidenceStatusCore(x),'review_required');
  assert.throws(()=>domain.reviewInspectionEvidenceCore(x,req(x,{item_id:uid(3),evidence_ref:'external:abc'}),actor,clock),conflict);
  x=domain.saveInspectionDraftCore(x,req(x,{template_version:1,items:[{id:uid(2),result:'ok',note:null},{id:uid(3),result:'ok',note:null}]}),actor,clock);
  assert.throws(()=>domain.completeInspectionCore(x,req(x,{completed_on:'2026-07-02'}),actor,clock),conflict);
});

test('later revocation marks evidence for review without rewriting the historical completion',()=>{
  let x=create();x=domain.reviewInspectionEvidenceCore(x,req(x,{item_id:uid(2),evidence_ref:'external:abc'}),actor,clock);
  x=domain.saveInspectionDraftCore(x,req(x,{template_version:1,items:[{id:uid(2),result:'ok',note:null},{id:uid(3),result:'ok',note:null}]}),actor,clock);
  const done=domain.completeInspectionCore(x,req(x,{completed_on:'2026-07-02'}),actor,clock),e=done.inspection.items[0].evidence[0];
  const revised=domain.revokeInspectionEvidenceCore(done.inspection,req(done.inspection,{item_id:uid(2),evidence_id:e.id,expected_evidence_revision:1}),actor,clock);
  assert.equal(revised.status,'completed');assert.equal(revised.completed_on,'2026-07-02');assert.equal(domain.inspectionEvidenceStatusCore(revised),'review_required');
});

test('proposal schema enforces one open inspection, tenancy belonging, and a real checklist at completion',()=>{
  haveDomain();const db=makeDb().raw;
  db.exec(readFileSync(new URL('../../docs/roadmap/work/ADM-13/inspection-schema-proposal.sql',import.meta.url),'utf8'));
  db.exec("INSERT INTO landlords(id,name,created_at,updated_at) VALUES(1,'Synthetic','2026-01-01','2026-01-01')");
  db.exec("INSERT INTO rentals(id,landlord_id,address,parish,service,created_at,updated_at) VALUES(1,1,'Synthetic 1','St Helier','let_only','2026-01-01','2026-01-01'),(2,1,'Synthetic 2','St Helier','let_only','2026-01-01','2026-01-01')");
  db.exec("INSERT INTO tenancies(id,rental_id,tenant_name,kind,regime,start_on,rent,due_day,created_at,updated_at) VALUES(1,1,'Synthetic','periodic','2011','2026-01-01',1000,1,'2026-01-01','2026-01-01')");
  const insert=db.prepare("INSERT INTO rental_inspections(id,rental_id,tenancy_id,due_on,template_version,created_at,created_by,updated_at,updated_by) VALUES(?,?,?,?,1,?,?,?,?)");
  insert.run(uid(10),1,1,'2026-06-30',clock().toISOString(),actor,clock().toISOString(),actor);
  assert.throws(()=>insert.run(uid(11),1,null,'2026-07-01',clock().toISOString(),actor,clock().toISOString(),actor),/UNIQUE/i);
  assert.throws(()=>insert.run(uid(12),2,1,'2026-07-01',clock().toISOString(),actor,clock().toISOString(),actor),/tenancy/i);
  const complete=db.prepare("UPDATE rental_inspections SET status='completed',completed_on='2026-07-02',completed_at=?,completed_by=?,revision=revision+1 WHERE id=?");
  assert.throws(()=>complete.run(clock().toISOString(),actor,uid(10)),/checklist/i);
  db.prepare("INSERT INTO rental_inspection_items(inspection_id,id,room,check_name) VALUES(?,?,?,?)").run(uid(10),uid(20),'Kitchen','Condition');
  assert.throws(()=>complete.run(clock().toISOString(),actor,uid(10)),/checklist/i);
  db.prepare("UPDATE rental_inspection_items SET result='ok',revision=revision+1 WHERE inspection_id=? AND id=?").run(uid(10),uid(20));
  assert.equal(complete.run(clock().toISOString(),actor,uid(10)).changes,1);
  insert.run(uid(11),1,null,'2027-01-02',clock().toISOString(),actor,clock().toISOString(),actor);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
});

function proposalFixture() {
  const db=makeDb().raw;
  db.exec(readFileSync(new URL('../../docs/roadmap/work/ADM-13/inspection-schema-proposal.sql',import.meta.url),'utf8'));
  db.exec("INSERT INTO landlords(id,name,created_at,updated_at) VALUES(1,'Synthetic','2026-01-01','2026-01-01')");
  db.exec("INSERT INTO rentals(id,landlord_id,address,parish,service,created_at,updated_at) VALUES(1,1,'Synthetic 1','St Helier','let_only','2026-01-01','2026-01-01'),(2,1,'Synthetic 2','St Helier','let_only','2026-01-01','2026-01-01')");
  const make=db.prepare("INSERT INTO rental_inspections(id,rental_id,due_on,template_version,created_at,created_by,updated_at,updated_by) VALUES(?,?,?,1,?,?,?,?)");
  make.run(uid(10),1,'2026-06-30',clock().toISOString(),actor,clock().toISOString(),actor);
  make.run(uid(11),2,'2026-07-01',clock().toISOString(),actor,clock().toISOString(),actor);
  const addItem=db.prepare("INSERT INTO rental_inspection_items(inspection_id,id,room,check_name) VALUES(?,?,?,?)");
  addItem.run(uid(10),uid(20),'Kitchen','Condition');
  addItem.run(uid(10),uid(21),'Hall','Alarm');
  addItem.run(uid(11),uid(22),'Kitchen','Condition');
  return db;
}

test('revoking a reference invalidates all uses in the same inspection without affecting another case',()=>{
  let x=create();
  x=domain.reviewInspectionEvidenceCore(x,req(x,{item_id:uid(2),evidence_ref:'external:shared'}),actor,clock);
  x=domain.reviewInspectionEvidenceCore(x,req(x,{item_id:uid(3),evidence_ref:'external:shared'}),actor,clock);
  const e=x.items[0].evidence[0],before=x;
  x=domain.revokeInspectionEvidenceCore(x,req(x,{item_id:uid(2),evidence_id:e.id,expected_evidence_revision:1}),actor,clock);
  assert.deepEqual(x.items.map(i=>i.evidence[0].status),['revoked','revoked']);
  assert.deepEqual(before.items.map(i=>i.evidence[0].status),['reviewed','reviewed']);
  assert.throws(()=>domain.revokeInspectionEvidenceCore(x,req(x,{item_id:uid(3),evidence_id:x.items[1].evidence[0].id,expected_evidence_revision:1}),actor,clock),conflict);
  let other=create({id:uid(100),rental_id:2});
  other=domain.reviewInspectionEvidenceCore(other,req(other,{item_id:uid(2),evidence_ref:'external:shared'}),actor,clock);
  assert.equal(domain.inspectionEvidenceStatusCore(other),'review_declared');
});

test('draft completion cannot predate or repeat the last actual completion',()=>{
  let x=create({last_completed_on:'2026-01-04'});
  assert.equal(x.due_on,'2026-07-04');
  x=domain.saveInspectionDraftCore(x,req(x,{template_version:1,items:[{id:uid(2),result:'ok',note:null},{id:uid(3),result:'ok',note:null}]}),actor,clock);
  for(const completed_on of ['2026-01-03','2026-01-04'])
    assert.throws(()=>domain.completeInspectionCore(x,req(x,{completed_on}),actor,clock),e=>e.status===400);
  assert.equal(domain.completeInspectionCore(x,req(x,{completed_on:'2026-01-05'}),actor,clock).next_due_on,'2026-07-05');
});

test('proposal rejects prechecked items and preserves completed schedules',()=>{
  const db=proposalFixture();
  assert.throws(()=>db.prepare("INSERT INTO rental_inspection_items(inspection_id,id,room,check_name,result) VALUES(?,?,?,?,'ok')").run(uid(10),uid(23),'Room','Check'),/item/i);
  db.prepare("UPDATE rental_inspection_items SET result='ok',revision=revision+1 WHERE inspection_id=?").run(uid(10));
  db.prepare("UPDATE rental_inspections SET status='completed',completed_on='2026-07-02',completed_at=?,completed_by=?,revision=revision+1 WHERE id=?").run(clock().toISOString(),actor,uid(10));
  assert.throws(()=>db.prepare("UPDATE rental_inspections SET scheduled_on='2026-07-09',revision=revision+1 WHERE id=?").run(uid(10)),/inspection/i);
});

test('proposal preserves reviewed-reference history and confines revocation to the same inspection',()=>{
  const db=proposalFixture();
  const add=db.prepare("INSERT INTO rental_inspection_evidence(id,inspection_id,item_id,evidence_ref,reviewed_at,reviewed_by) VALUES(?,?,?,?,?,?)");
  add.run(uid(30),uid(10),uid(20),'external:shared',clock().toISOString(),actor);
  add.run(uid(31),uid(10),uid(21),'external:shared',clock().toISOString(),actor);
  add.run(uid(32),uid(11),uid(22),'external:shared',clock().toISOString(),actor);
  assert.throws(()=>add.run(uid(33),uid(10),uid(22),'external:foreign',clock().toISOString(),actor),/FOREIGN KEY/i);
  assert.throws(()=>add.run(uid(34),uid(10),uid(20),'.private',clock().toISOString(),actor),/CHECK/i);
  assert.throws(()=>add.run(uid(35),uid(10),uid(20),'https://example.test/photo',clock().toISOString(),actor),/CHECK/i);
  assert.throws(()=>add.run(uid(36),uid(10),uid(20),'x'.repeat(121),clock().toISOString(),actor),/CHECK/i);
  db.prepare("UPDATE rental_inspection_evidence SET status='revoked',revoked_at=?,revoked_by=?,revision=revision+1 WHERE id=?").run(clock().toISOString(),actor,uid(30));
  const status=db.prepare('SELECT id,status FROM rental_inspection_evidence ORDER BY id').all();
  assert.deepEqual(status.map(x=>x.status),['revoked','revoked','reviewed']);
  assert.throws(()=>db.prepare('DELETE FROM rental_inspection_evidence WHERE id=?').run(uid(30)),/evidence/i);
  assert.throws(()=>add.run(uid(37),uid(10),uid(20),'external:shared',clock().toISOString(),actor),/evidence/i);
  db.prepare("UPDATE rental_inspection_items SET result='ok',revision=revision+1 WHERE inspection_id=?").run(uid(10));
  assert.throws(()=>db.prepare("UPDATE rental_inspections SET status='completed',completed_on='2026-07-02',completed_at=?,completed_by=?,revision=revision+1 WHERE id=?").run(clock().toISOString(),actor,uid(10)),/checklist/i);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
});

test('proposal stores private meter readings per inspection and locks them after completion',()=>{
  const db=proposalFixture();
  const add=db.prepare('INSERT INTO rental_inspection_meter_readings(inspection_id,ordinal,name,value,unit) VALUES(?,?,?,?,?)');
  add.run(uid(10),0,'Electricity','123.45','kWh');
  assert.throws(()=>add.run(uid(10),0,'Gas','500','m3'),/UNIQUE/i);
  assert.throws(()=>add.run(uid(99),0,'Gas','500','m3'),/inspection|FOREIGN KEY/i);
  assert.throws(()=>db.prepare("UPDATE rental_inspection_meter_readings SET value='124' WHERE inspection_id=? AND ordinal=0").run(uid(10)),/revision/i);
  db.prepare("UPDATE rental_inspection_items SET result='ok',revision=revision+1 WHERE inspection_id=?").run(uid(10));
  db.prepare("UPDATE rental_inspections SET status='completed',completed_on='2026-07-02',completed_at=?,completed_by=?,revision=revision+1 WHERE id=?").run(clock().toISOString(),actor,uid(10));
  assert.throws(()=>add.run(uid(10),1,'Gas','500','m3'),/inspection/i);
  assert.throws(()=>db.prepare("UPDATE rental_inspection_meter_readings SET value='124',revision=revision+1 WHERE inspection_id=? AND ordinal=0").run(uid(10)),/inspection/i);
  assert.throws(()=>db.prepare('DELETE FROM rental_inspection_meter_readings WHERE inspection_id=? AND ordinal=0').run(uid(10)),/inspection/i);
});

test('proposal rejects year zero, a fabricated starting revision and completion before the baseline',()=>{
  const db=proposalFixture();
  db.exec("INSERT INTO rentals(id,landlord_id,address,parish,service,created_at,updated_at) VALUES(3,1,'Synthetic 3','St Helier','let_only','2026-01-01','2026-01-01')");
  const make=db.prepare("INSERT INTO rental_inspections(id,rental_id,due_on,last_completed_on,template_version,revision,created_at,created_by,updated_at,updated_by) VALUES(?,3,?,?,1,?,?,?,?,?)");
  assert.throws(()=>make.run(uid(40),'0000-06-30',null,1,clock().toISOString(),actor,clock().toISOString(),actor),/CHECK/i);
  assert.throws(()=>make.run(uid(40),'2026-07-04','0000-01-04',1,clock().toISOString(),actor,clock().toISOString(),actor),/CHECK/i);
  assert.throws(()=>make.run(uid(40),'2026-07-04','2026-01-04',2,clock().toISOString(),actor,clock().toISOString(),actor),/inspection/i);
  make.run(uid(40),'2026-07-04','2026-01-04',1,clock().toISOString(),actor,clock().toISOString(),actor);
  db.prepare('INSERT INTO rental_inspection_items(inspection_id,id,room,check_name) VALUES(?,?,?,?)').run(uid(40),uid(41),'Room','Check');
  db.prepare("UPDATE rental_inspection_items SET result='ok',revision=revision+1 WHERE inspection_id=?").run(uid(40));
  const complete=db.prepare("UPDATE rental_inspections SET status='completed',completed_on=?,completed_at=?,completed_by=?,revision=revision+1 WHERE id=?");
  for(const day of ['0000-07-02','2026-01-03','2026-01-04'])
    assert.throws(()=>complete.run(day,clock().toISOString(),actor,uid(40)),/CHECK/i);
  assert.equal(complete.run('2026-01-05',clock().toISOString(),actor,uid(40)).changes,1);
});

test('proposal does not rewrite the labels of a versioned checklist item',()=>{
  const db=proposalFixture();
  assert.throws(()=>db.prepare("UPDATE rental_inspection_items SET check_name='A different check',revision=revision+1 WHERE inspection_id=? AND id=?").run(uid(10),uid(20)),/revision|inspection/i);
  assert.equal(db.prepare('SELECT check_name FROM rental_inspection_items WHERE inspection_id=? AND id=?').get(uid(10),uid(20)).check_name,'Condition');
});
