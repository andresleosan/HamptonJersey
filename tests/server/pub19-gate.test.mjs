import test from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv,call,adminCookie } from './helpers.mjs';
import { readFileSync } from 'node:fs';
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

test('missing privacy trigger prevents demand generation even when tables and flag exist',async()=>{
 const env=makeEnv(),cookie=await adminCookie();env.DB.raw.exec(readFileSync(new URL('../../server/proposed-schema/public-demand.sql',import.meta.url),'utf8'));env.DEMAND_INTERNAL_READY='1';
 assert.deepEqual((await call(env,'GET','/admin/demand-snapshots/status',{cookie})).data,{available:true});
 env.DB.raw.exec('DROP TRIGGER invalidate_demand_on_search_delete');
 assert.deepEqual((await call(env,'GET','/admin/demand-snapshots/status',{cookie})).data,{available:false});
 const result=await call(env,'POST','/admin/demand-snapshots',{cookie,body:{operation:'rent',operation_id:'b0000000-0000-4000-8000-000000000001'}});
 assert.equal(result.status,404);assert.equal(env.DB.raw.prepare('SELECT count(*) AS n FROM public_demand_snapshots').get().n,0);
});
