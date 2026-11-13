import test from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv,call,adminCookie } from './helpers.mjs';
test('public gate is unavailable with no database access and ignores no arbitrary filters',async()=>{
 const env=makeEnv(); env.DB={prepare(){throw new Error('unexpected DB access')}};
 const r=await call(env,'GET','/demand/current'); assert.equal(r.status,200); assert.deepEqual(r.data,{status:'not_available'}); assert.equal(r.headers.get('cache-control'),'no-store');
 const bad=await call(env,'GET','/demand/current?operation=rent'); assert.equal(bad.status,400);
});

test('staff availability remains false without feature gate or complete proposed schema',async()=>{
 const env=makeEnv(),cookie=await adminCookie();
 const closed=await call(env,'GET','/admin/demand-snapshots/status',{cookie});assert.deepEqual(closed.data,{available:false});
 env.DEMAND_INTERNAL_READY='1';const missing=await call(env,'GET','/admin/demand-snapshots/status',{cookie});assert.deepEqual(missing.data,{available:false});
});
