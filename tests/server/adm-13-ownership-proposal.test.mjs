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
