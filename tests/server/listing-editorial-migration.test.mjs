import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';

test('EST-17: populated rebuild preserves all rows, relationships, indexes and trigger identities',()=>{
  const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');
  const dir=new URL('../../migrations/',import.meta.url);
  for(const f of readdirSync(dir).filter(f=>f.endsWith('.sql')&&f<'0034').sort())db.exec(readFileSync(new URL(f,dir),'utf8'));
  db.exec(readFileSync(new URL('../fixtures/seed.sql',import.meta.url),'utf8'));
  db.exec(`INSERT INTO matches(applicant_id,listing_id,score,checks,status,created_at,updated_at) VALUES(1,'HE-R001',50,'[]','found','2026-11-01','2026-11-01');
    INSERT INTO offers(id,listing_id,applicant_id,amount,status,created_at,updated_at) VALUES(991,'HE-R001',1,500000,'accepted','2026-11-01','2026-11-01');
    INSERT INTO sales(listing_id,applicant_id,offer_id,price,created_at,updated_at) VALUES('HE-R001',1,991,500000,'2026-11-01','2026-11-01');
    INSERT INTO jobs(kind,listing_id,requested_by,created_at) VALUES('listing_text','HE-R001','admin@example.test','2026-11-01');
    INSERT INTO drive_imports(folder_id,folder_name,listing_id,requested_by,created_at) VALUES('synthetic','Synthetic','HE-R001','admin@example.test','2026-11-01');
    INSERT INTO chats(key_hash,listing_id,name,email,privacy_ack_at,created_at,last_at) VALUES('synthetic-fixture-hash','HE-R001','Synthetic','fixture@example.test','2026-11-01','2026-11-01','2026-11-01');
    INSERT INTO notifications(event_id,category,title,action_required,created_at,target_kind,target_id) VALUES((SELECT id FROM events LIMIT 1),'task','Synthetic property task',1,'2026-11-01','listing','HE-R001');
    INSERT INTO notifications(event_id,category,title,action_required,created_at,target_kind,target_id) VALUES((SELECT id FROM events LIMIT 1),'task','Synthetic offer task',1,'2026-11-01','offer','991');`);
  const tables=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(r=>r.name);
  const snapshots=Object.fromEntries(tables.map(n=>[n,db.prepare(`SELECT * FROM ${n}`).all()]));
  const triggers=db.prepare("SELECT name FROM sqlite_master WHERE type='trigger' ORDER BY name").all();
  const indexes=db.prepare("SELECT name,sql FROM sqlite_master WHERE type='index' AND sql IS NOT NULL ORDER BY name").all();
  db.exec('BEGIN');db.exec(readFileSync(new URL('0034_listing_editorial.sql',dir),'utf8'));db.exec('COMMIT');
  for(const name of tables){
    const after=db.prepare(`SELECT * FROM ${name}`).all();
    if(name==='listings')for(const row of after){assert.equal(row.review_requested_at,null);assert.equal(row.review_requested_by,null);delete row.review_requested_at;delete row.review_requested_by;}
    assert.deepEqual(after,snapshots[name],`${name} preserved`);
  }
  assert.deepEqual(db.prepare("SELECT name FROM sqlite_master WHERE type='trigger' ORDER BY name").all(),triggers);
  for(const index of indexes)assert.deepEqual(db.prepare('SELECT name,sql FROM sqlite_master WHERE name=?').get(index.name),index);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
  assert.equal(db.prepare('PRAGMA foreign_keys').get().foreign_keys,1);
  db.exec("UPDATE listings SET operation='rent',availability='let_agreed' WHERE id='HE-R002'");
  assert.throws(()=>db.exec("UPDATE listings SET review_requested_at='2026-11-01' WHERE id='HE-R001'"));
});
