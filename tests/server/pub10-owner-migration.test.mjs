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

test('unexpected cascading foreign key to events fails closed before data loss',()=>{
 const db=dbAtBaseline();
 db.exec('CREATE TABLE synthetic_cascade(id INTEGER PRIMARY KEY,event_id INTEGER REFERENCES events(id) ON DELETE CASCADE); INSERT INTO synthetic_cascade VALUES(1,9001)');
 db.exec('BEGIN');
 assert.throws(()=>db.exec(readFileSync(proposal,'utf8')),/CHECK constraint failed/);
 db.exec('ROLLBACK');
 assert.deepEqual(db.prepare('SELECT * FROM synthetic_cascade').all().map(x=>({...x})),[{id:1,event_id:9001}]);
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM events WHERE id=9001').get().n,1);
 assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
 db.close();
});

test('unexpected cascading foreign key to notifications fails closed before data loss',()=>{
 const db=dbAtBaseline();
 db.exec('CREATE TABLE synthetic_notice_cascade(id INTEGER PRIMARY KEY,notice_id INTEGER REFERENCES notifications(id) ON DELETE CASCADE); INSERT INTO synthetic_notice_cascade VALUES(1,9001)');
 db.exec('BEGIN');
 assert.throws(()=>db.exec(readFileSync(proposal,'utf8')),/CHECK constraint failed/);
 db.exec('ROLLBACK');
 assert.deepEqual(db.prepare('SELECT * FROM synthetic_notice_cascade').all().map(x=>({...x})),[{id:1,notice_id:9001}]);
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM notifications WHERE id=9001').get().n,1);
 assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
 db.close();
});

test('unrelated new table is rejected conservatively before a rebuild',()=>{
 const db=dbAtBaseline(); db.exec('CREATE TABLE synthetic_unrelated(id INTEGER PRIMARY KEY); INSERT INTO synthetic_unrelated VALUES(1)');
 db.exec('BEGIN'); assert.throws(()=>db.exec(readFileSync(proposal,'utf8')),/CHECK constraint failed/); db.exec('ROLLBACK');
 assert.equal(db.prepare('SELECT COUNT(*) n FROM synthetic_unrelated').get().n,1);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM notifications WHERE id=9001').get().n,1); db.close();
});

test('unexpected metadata definition is rejected before a rebuild',()=>{
 const db=dbAtBaseline(); db.exec('CREATE TABLE _cf_METADATA(key INTEGER PRIMARY KEY,value BLOB,event_id INTEGER REFERENCES events(id) ON DELETE CASCADE); INSERT INTO _cf_METADATA VALUES(1,NULL,9001)');
 db.exec('BEGIN'); assert.throws(()=>db.exec(readFileSync(proposal,'utf8')),/CHECK constraint failed/); db.exec('ROLLBACK');
 assert.equal(db.prepare('SELECT COUNT(*) n FROM _cf_METADATA').get().n,1);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM events WHERE id=9001').get().n,1); db.close();
});
