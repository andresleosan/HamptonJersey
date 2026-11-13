import test from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv,call } from './helpers.mjs';
test('public gate is unavailable with no database access and ignores no arbitrary filters',async()=>{
 const env=makeEnv(); env.DB={prepare(){throw new Error('unexpected DB access')}};
 const r=await call(env,'GET','/demand/current'); assert.equal(r.status,200); assert.deepEqual(r.data,{status:'not_available'}); assert.equal(r.headers.get('cache-control'),'no-store');
 const bad=await call(env,'GET','/demand/current?operation=rent'); assert.equal(bad.status,400);
});
