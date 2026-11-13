import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';

const dir=new URL('../../migrations/',import.meta.url), proposal=new URL('../../server/proposed-schema/owner-requests-rebuild.sql',import.meta.url);
const at='2026-11-13T00:00:00.000Z';
function dbAtBaseline(){
 const db=new DatabaseSync(':memory:'); db.exec('PRAGMA foreign_keys=ON');
 for(const n of readdirSync(dir).filter(n=>/^[0-9].*\.sql$/.test(n)).sort())db.exec(readFileSync(new URL(n,dir),'utf8'));
 db.exec(readFileSync(new URL('../fixtures/seed.sql',import.meta.url),'utf8'));
 db.exec(`INSERT INTO events(id,at,actor,entity_type,entity_id,type) VALUES(9001,'${at}','system','admin','fixture','fixture');
   INSERT INTO notifications(id,event_id,category,title,action_required,created_at,task_key) VALUES(9001,9001,'task','Fixture',1,'${at}','fixture:owner-migration');
   INSERT INTO notification_reads VALUES('admin@example.test',9001,1);
   INSERT INTO notification_task_operations VALUES('admin@example.test','fixture-operation',9001,'fixture-hash',1);
   INSERT INTO notification_observations VALUES('fixture:owner-migration','check','1:gas','fixture','fixture',1,'rental','1',9001);`);
 return db;
}
test('proposed rebuild preserves historical tables, indexes, triggers and children',()=>{
 const db=dbAtBaseline(); const tables=db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(x=>x.name);
 const before=Object.fromEntries(tables.map(n=>[n,db.prepare(`SELECT * FROM ${n}`).all()]));
 const triggers=db.prepare("SELECT name,sql FROM sqlite_schema WHERE type='trigger' ORDER BY name").all();
 const indexes=db.prepare("SELECT name,sql FROM sqlite_schema WHERE type='index' AND sql IS NOT NULL ORDER BY name").all();
 db.exec('BEGIN');db.exec(readFileSync(proposal,'utf8'));db.exec('COMMIT');
 for(const n of tables)assert.deepEqual(db.prepare(`SELECT * FROM ${n}`).all(),before[n],n);
 assert.deepEqual(db.prepare("SELECT name,sql FROM sqlite_schema WHERE type='trigger' ORDER BY name").all(),triggers);
 assert.deepEqual(db.prepare("SELECT name,sql FROM sqlite_schema WHERE type='index' AND sql IS NOT NULL ORDER BY name").all(),indexes);
 assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
 db.prepare("INSERT INTO events(at,actor,entity_type,entity_id,type) VALUES(?,?,?,?,?)").run(at,'system','owner_request','synthetic-owner','owner.requested');
 db.close();
});

test('schema drift aborts rebuild without changing existing historical data',()=>{
 const db=dbAtBaseline();
 db.exec("CREATE TRIGGER synthetic_extra AFTER INSERT ON events BEGIN SELECT 1; END");
 const before=db.prepare('SELECT * FROM notifications WHERE id=9001').get();
 db.exec('BEGIN');
 assert.throws(()=>db.exec(readFileSync(proposal,'utf8')),/CHECK constraint failed/);
 db.exec('ROLLBACK');
 assert.deepEqual(db.prepare('SELECT * FROM notifications WHERE id=9001').get(),before);
 assert.ok(db.prepare("SELECT 1 FROM sqlite_schema WHERE type='trigger' AND name='synthetic_extra'").get());
 assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
 db.close();
});
