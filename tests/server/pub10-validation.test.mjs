import test from 'node:test';
import assert from 'node:assert/strict';
import { validateOwnerRequest, ownerRequestHash } from '../../server/owner-requests.js';
const base={request_id:'deadc0de-0000-4000-8000-000000000000',name:'Example Owner',phone:'07700123456',email:'example@example.test',address:'Example address 12',operation:'sale',valuation_requested:false,privacy_version:'notice-v1',token:'fixture'};
test('owner request requires complete mandatory fields and explicit boolean',async()=>{
 assert.equal(validateOwnerRequest(base).errors,undefined);
 assert.equal(validateOwnerRequest({...base,phone:'727582'}).errors,undefined);
 assert.ok(validateOwnerRequest({...base,phone:'not a number'}).errors);
 for(const change of [{name:''},{phone:''},{email:''},{address:''},{operation:'business'},{valuation_requested:undefined},{valuation_requested:'false'},{privacy_version:''},{unexpected:'x'}])assert.ok(validateOwnerRequest({...base,...change}).errors);
});
test('canonical hash ignores transport token and request id but binds valuation and normalized fields',async()=>{
 const x=validateOwnerRequest(base).value;
 assert.equal(await ownerRequestHash(x),await ownerRequestHash(validateOwnerRequest({...base,request_id:crypto.randomUUID(),token:'another',name:'  Example Owner  ',email:' EXAMPLE@example.test '}).value));
 assert.notEqual(await ownerRequestHash(x),await ownerRequestHash(validateOwnerRequest({...base,valuation_requested:true}).value));
});
