import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {makeDb} from './helpers.mjs';

function fixture() {
  const db=makeDb().raw;
  db.exec(readFileSync(new URL('../../docs/roadmap/work/ADM-13/inspection-schema-proposal.sql',import.meta.url),'utf8'));
  db.exec(`INSERT INTO landlords(id,name,created_at,updated_at) VALUES(1,'Synthetic','2026-01-01','2026-01-01');
    INSERT INTO rentals(id,landlord_id,address,parish,service,created_at,updated_at) VALUES
      (1,1,'Synthetic 1','St Helier','let_only','2026-01-01','2026-01-01'),
      (2,1,'Synthetic 2','St Helier','let_only','2026-01-01','2026-01-01');
    INSERT INTO tenancies(id,rental_id,tenant_name,kind,regime,start_on,rent,due_day,created_at,updated_at)
      VALUES(1,1,'Synthetic','periodic','2011','2026-01-01',1000,1,'2026-01-01','2026-01-01');
    INSERT INTO rental_inspections(id,rental_id,tenancy_id,due_on,template_version,created_at,created_by,updated_at,updated_by)
      VALUES('inspection-1',1,1,'2026-06-30',1,'2026-01-01','synthetic','2026-01-01','synthetic');`);
  return db;
}

test('linked tenancy cannot be moved, deleted or replaced even with foreign keys disabled',()=>{
  const db=fixture(); db.exec('PRAGMA foreign_keys = OFF');
  for(const sql of ["UPDATE tenancies SET rental_id=2 WHERE id=1", "UPDATE tenancies SET id=3 WHERE id=1",
    "DELETE FROM tenancies WHERE id=1", `INSERT OR REPLACE INTO tenancies(id,rental_id,tenant_name,kind,regime,start_on,rent,due_day,created_at,updated_at)
      VALUES(1,2,'Replacement','periodic','2011','2026-01-01',1000,1,'2026-01-01','2026-01-01')`])
    assert.throws(()=>db.exec(sql));
  assert.deepEqual({...db.prepare('SELECT id,rental_id FROM tenancies WHERE id=1').get()},{id:1,rental_id:1});
});

test('linked rental identity cannot be changed, removed or replaced even with foreign keys disabled',()=>{
  const db=fixture(); db.exec('PRAGMA foreign_keys = OFF');
  for(const sql of ["UPDATE rentals SET id=3 WHERE id=1", "DELETE FROM rentals WHERE id=1",
    `INSERT OR REPLACE INTO rentals(id,landlord_id,address,parish,service,created_at,updated_at)
      VALUES(1,1,'Replacement','St Helier','let_only','2026-01-01','2026-01-01')`])
    assert.throws(()=>db.exec(sql));
  assert.equal(db.prepare('SELECT address FROM rentals WHERE id=1').get().address,'Synthetic 1');
  assert.equal(db.prepare('UPDATE rentals SET address=? WHERE id=2').run('Synthetic changed').changes,1);
});

test('inspection cannot be deleted or replaced before a retention and purge policy exists',()=>{
  const db=fixture(); db.exec('PRAGMA foreign_keys = OFF');
  assert.throws(()=>db.exec("DELETE FROM rental_inspections WHERE id='inspection-1'"));
  assert.throws(()=>db.exec(`INSERT OR REPLACE INTO rental_inspections(id,rental_id,tenancy_id,due_on,template_version,created_at,created_by,updated_at,updated_by)
    VALUES('inspection-1',2,NULL,'2026-06-30',1,'2026-01-01','synthetic','2026-01-01','synthetic')`));
  assert.throws(()=>db.exec(`INSERT OR REPLACE INTO rental_inspections(id,rental_id,tenancy_id,due_on,template_version,created_at,created_by,updated_at,updated_by)
    VALUES('inspection-2',1,NULL,'2026-06-30',1,'2026-01-01','synthetic','2026-01-01','synthetic')`));
  assert.equal(db.prepare("SELECT rental_id FROM rental_inspections WHERE id='inspection-1'").get().rental_id,1);
});

test('REPLACE cannot erase revoked evidence through either unique key',()=>{
  const db=fixture(); db.exec('PRAGMA recursive_triggers=OFF');
  db.exec(`INSERT INTO rental_inspection_items(inspection_id,id,room,check_name) VALUES('inspection-1','item-1','Synthetic','Check');
    INSERT INTO rental_inspection_evidence(id,inspection_id,item_id,evidence_ref,reviewed_at,reviewed_by)
      VALUES('evidence-1','inspection-1','item-1','external:one','2026-01-01','synthetic');
    UPDATE rental_inspection_evidence SET status='revoked',revision=2,revoked_at='2026-01-02',revoked_by='synthetic' WHERE id='evidence-1';`);
  for(const [id,ref] of [['evidence-1','external:two'],['evidence-2','external:one']])
    assert.throws(()=>db.prepare(`INSERT OR REPLACE INTO rental_inspection_evidence(id,inspection_id,item_id,evidence_ref,reviewed_at,reviewed_by)
      VALUES(?,'inspection-1','item-1',?,'2026-01-03','synthetic')`).run(id,ref));
  assert.deepEqual({...db.prepare("SELECT id,evidence_ref,status,revision FROM rental_inspection_evidence WHERE id='evidence-1'").get()},
    {id:'evidence-1',evidence_ref:'external:one',status:'revoked',revision:2});
  db.exec("UPDATE rental_inspection_items SET result='ok',revision=2 WHERE id='item-1'");
  assert.throws(()=>db.exec("UPDATE rental_inspections SET status='completed',completed_on='2026-07-01',completed_at='2026-07-01',completed_by='synthetic',revision=2 WHERE id='inspection-1'"));
});

test('linked tenancy survives replacement through payment reference and active rental uniqueness',()=>{
  const db=fixture(); db.exec('PRAGMA foreign_keys=OFF; PRAGMA recursive_triggers=OFF');
  db.exec("UPDATE tenancies SET payment_ref='SYNTHETIC-1' WHERE id=1");
  for(const [id,rental,ref] of [[2,2,'SYNTHETIC-1'],[3,1,'SYNTHETIC-3']])
    assert.throws(()=>db.prepare(`INSERT OR REPLACE INTO tenancies(id,rental_id,payment_ref,tenant_name,kind,regime,start_on,rent,due_day,created_at,updated_at)
      VALUES(?,?,?,'Synthetic','periodic','2011','2026-01-01',1000,1,'2026-01-01','2026-01-01')`).run(id,rental,ref));
  assert.deepEqual({...db.prepare('SELECT id,rental_id,payment_ref FROM tenancies WHERE id=1').get()},
    {id:1,rental_id:1,payment_ref:'SYNTHETIC-1'});
});

test('rowid aliases cannot change linked tenancy or rental identity',()=>{
  const db=fixture(); db.exec('PRAGMA foreign_keys=OFF; PRAGMA recursive_triggers=OFF; DROP TRIGGER case_tenancy_id_guard; DROP TRIGGER case_rental_id_guard');
  for(const table of ['tenancies','rentals']) for(const alias of ['rowid','_rowid_','oid'])
    assert.throws(()=>db.exec(`UPDATE ${table} SET ${alias}=99 WHERE id=1`));
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM rental_inspections i JOIN tenancies t ON t.id=i.tenancy_id AND t.rental_id=i.rental_id JOIN rentals r ON r.id=i.rental_id').get().n,1);
});


test('tenancy guards remain effective with foreign keys enabled',()=>{
  const db=fixture(); db.exec('PRAGMA foreign_keys=ON; PRAGMA recursive_triggers=OFF');
  assert.equal(db.prepare('PRAGMA foreign_keys').get().foreign_keys,1);
  assert.throws(()=>db.exec('DELETE FROM tenancies WHERE id=1'));
  assert.throws(()=>db.exec('UPDATE tenancies SET rental_id=2 WHERE id=1'));
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
});
