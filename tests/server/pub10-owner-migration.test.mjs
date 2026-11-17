import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';

const dir=new URL('../../migrations/',import.meta.url), at='2026-11-13T00:00:00.000Z';
const file=readdirSync(dir).find(n=>n.startsWith('0118_'));
// PUB-10: 0118 only adds; it neither rebuilds events/notifications nor installs the settings row that opens intake.
test('0118 is additive and leaves every existing table, row and schema object unchanged',()=>{
 assert.ok(file,'migration 0118 exists');
 const sql=readFileSync(new URL(file,dir),'utf8'),outside=sql.replace(/--.*$/gm,'').replace(/BEGIN[\s\S]*?END;/g,'');
 for(const s of outside.split(';').map(x=>x.trim()).filter(Boolean))assert.match(s,/^CREATE (TABLE|INDEX|TRIGGER) /,s);
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');
 for(const n of readdirSync(dir).filter(n=>/^[0-9].*\.sql$/.test(n)&&n<file).sort())db.exec(readFileSync(new URL(n,dir),'utf8'));
 db.exec(readFileSync(new URL('../fixtures/seed.sql',import.meta.url),'utf8'));
 db.exec(`INSERT INTO events(id,at,actor,entity_type,entity_id,type) VALUES(9001,'${at}','system','admin','fixture','fixture');
   INSERT INTO notifications(id,event_id,category,title,action_required,created_at,task_key) VALUES(9001,9001,'task','Fixture',1,'${at}','fixture:owner-migration');`);
 const tables=db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(x=>x.name);
 const rows=()=>Object.fromEntries(tables.map(n=>[n,db.prepare(`SELECT * FROM ${n}`).all()]));
 const before=rows(),schema=db.prepare('SELECT type,name,sql FROM sqlite_schema ORDER BY type,name').all();
 db.exec(sql);
 assert.deepEqual(rows(),before);
 const after=db.prepare('SELECT type,name,sql FROM sqlite_schema ORDER BY type,name').all();
 assert.deepEqual(after.filter(o=>schema.some(s=>s.name===o.name)),schema);
 assert.deepEqual(after.filter(o=>!schema.some(s=>s.name===o.name)).map(o=>o.name).sort(),
  ['owner_request_receipts','owner_requests','owner_requests_created','owner_requests_erased','owner_requests_policy','owner_requests_status','sqlite_autoindex_owner_request_receipts_1','sqlite_autoindex_owner_request_receipts_2','sqlite_autoindex_owner_requests_1','sqlite_autoindex_owner_requests_2']);
 assert.equal(db.prepare("SELECT COUNT(*) n FROM app_settings WHERE key='owner_enquiries'").get().n,0);
 assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
 db.close();
});
