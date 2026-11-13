import test from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv } from './helpers.mjs';
import { retentionPass } from '../../server/retention.js';
import { demandRetentionPass } from '../../server/demand-retention.js';

test('demand failure is recorded and retried without changing the existing retention result',async()=>{
 const env=makeEnv();env.DEMAND_INTERNAL_READY='1';
 env.DB.raw.prepare("INSERT INTO contacts(name,email,phone,last_activity_at,created_at,updated_at) VALUES(?,?,?,?,?,?)").run('Synthetic','fixture@example.test','+447700900123','2020-01-01T00:00:00.000Z','2020-01-01T00:00:00.000Z','2020-01-01T00:00:00.000Z');
 const log=console.log,error=console.error; console.log=()=>{};console.error=()=>{};
 try {
  await retentionPass(env,'2028-01-01T00:00:00.000Z');
  const before=env.DB.raw.prepare("SELECT value FROM app_settings WHERE key='retention_run'").get().value;
  assert.equal(JSON.parse(before).contacts,1);assert.equal(JSON.parse(before).ok,true);
  await demandRetentionPass(env,'2028-01-01T00:00:00.000Z');
  const failed=JSON.parse(env.DB.raw.prepare("SELECT value FROM app_settings WHERE key='demand_retention_run'").get().value);
  assert.equal(failed.ok,false);assert.equal(failed.attempts,1);
  assert.equal(env.DB.raw.prepare("SELECT value FROM app_settings WHERE key='retention_run'").get().value,before);
  await demandRetentionPass(env,'2028-01-01T00:00:00.000Z');
  assert.equal(JSON.parse(env.DB.raw.prepare("SELECT value FROM app_settings WHERE key='demand_retention_run'").get().value).attempts,1);
  env.DB.raw.exec("CREATE TABLE public_demand_snapshots (private_payload TEXT,status TEXT,version INTEGER,as_of TEXT)");
  env.DB.raw.exec("INSERT INTO public_demand_snapshots VALUES ('{}','draft',1,'2000-01-01T00:00:00.000Z')");
  env.DB.raw.exec("UPDATE app_settings SET value=json_set(value,'$.lease_until','2000-01-01T00:00:00.000Z') WHERE key='demand_retention_run'");
  await demandRetentionPass(env,'2028-01-01T00:00:00.000Z');
  const done=JSON.parse(env.DB.raw.prepare("SELECT value FROM app_settings WHERE key='demand_retention_run'").get().value);
  assert.equal(done.ok,true);assert.equal(done.attempts,2);assert.equal(done.purged,1);
  assert.equal(env.DB.raw.prepare("SELECT value FROM app_settings WHERE key='retention_run'").get().value,before);
 } finally {console.log=log;console.error=error;}
});
