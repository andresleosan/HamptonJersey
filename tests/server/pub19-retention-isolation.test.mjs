import test from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv } from './helpers.mjs';
import { runRetention } from '../../server/retention.js';
test('demand purge failure does not block prior retention and remains visible to the clock',async()=>{
 const env=makeEnv();env.DEMAND_INTERNAL_READY='1';
 env.DB.raw.prepare("INSERT INTO contacts(name,email,phone,last_activity_at,created_at,updated_at) VALUES(?,?,?,?,?,?)").run('Synthetic','fixture@example.test','+447700900123','2020-01-01T00:00:00.000Z','2020-01-01T00:00:00.000Z','2020-01-01T00:00:00.000Z');
 await assert.rejects(()=>runRetention(env,'2028-01-01T00:00:00.000Z'));
 assert.equal(env.DB.raw.prepare("SELECT COUNT(*) AS n FROM contacts WHERE email='fixture@example.test'").get().n,0);
});
