import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

test('deleting one search revokes all affected drafts and purges every contribution',()=>{
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON; CREATE TABLE admins(email TEXT PRIMARY KEY); CREATE TABLE contacts(id INTEGER PRIMARY KEY); CREATE TABLE applicants(id INTEGER PRIMARY KEY,contact_id INTEGER REFERENCES contacts(id));');
 db.exec(readFileSync(new URL('../../server/proposed-schema/public-demand.sql',import.meta.url),'utf8'));
 db.exec("INSERT INTO admins VALUES('fixture'); INSERT INTO contacts VALUES(1); INSERT INTO applicants VALUES(1,1);");
 const insert=db.prepare("INSERT INTO public_demand_snapshots(id,created_by,status,schema_version,as_of,valid_until,definition_version,operation,private_payload,public_payload,public_sha256) VALUES(?, 'fixture','draft',1,'2026-01-01T00:00:00.000Z','2026-02-01T00:00:00.000Z','fixture','rent','{}','{}','hash')");
 for(const id of ['one','two']) {insert.run(id);db.prepare("INSERT INTO public_demand_contributions(snapshot_id,contact_id,search_id,parish,bedroom_band) VALUES(?,1,1,'St Helier','2')").run(id);}
 db.prepare('DELETE FROM applicants WHERE id=1').run();
 assert.deepEqual(db.prepare('SELECT status,private_payload FROM public_demand_snapshots ORDER BY id').all().map(x=>[x.status,x.private_payload]),[['revoked',null],['revoked',null]]);
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM public_demand_contributions').get().n,0);
});
