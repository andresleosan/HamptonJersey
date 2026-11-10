import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
const {runApiSmoke}=await import(pathToFileURL(resolve('docs/qa/full-app/publish/runner/cases.mjs')));
const BUILD='a'.repeat(64),RUN='run-test-001',PATTERN=Buffer.from('synthetic PNG bytes');
function fixture({failAt=null,seedCreateId=false,userCollision=false,replaceOwnership=false,replaceOwnershipAfterFailure=false,wrongMedia=false}={}) {
 const calls=[],seed={id:'HE-Q001',title:'QA fixture seed'},users=[{email:'qa-agent@example.test',name:'QA Agent'}];
 if(userCollision)users.push({email:`${RUN}@example.test`,name:'preexisting'});
 let listing=null,media=null,failed=false;
 const response=(status=200,data={},body=Buffer.alloc(0))=>({status,data,body,headers:{'content-type':'application/json'}});
 const client={async request(path,options={}){
  const method=options.method??'GET';calls.push({path,...options,method});
  if(path==='/api/me')return response(options.anonymous?401:200,{email:'qa-agent@example.test'});
  if(path==='/api/qa-app/state')return response(200,{project:'hamptonjersey-qa',origin:'https://hamptonjersey-qa.pages.dev',source_sha:'80ad03df7e095750f455aa4aa668573e9aac5db4',build_id:BUILD,guard:'verified',email:'qa-agent@example.test'});
  if(path==='/api/session')return response(403);
  if(path.startsWith('/api/admin/settings/csv-map'))return response(path==='/api/admin/settings/csv-map?header=f5f01146b6876adf6da560da78823561f9b2707e51567bfdd3f4fe0d08633b2d'?200:400,{map:null});
  if(path.startsWith('/api/qa/')||path.startsWith('/api/hermes/'))return response(404);
  if(options.csrf===false)return response(403);
  if(path==='/api/admin/users'){
   if(method==='GET')return response(200,{users:users.map(u=>({...u}))});
   if(method==='POST'){users.push({...options.json});return response(201,{ok:true});}
  }
  if(path.startsWith('/api/admin/users/')){
   const email=decodeURIComponent(path.split('/').at(-1)),index=users.findIndex(u=>u.email===email);
   if(method==='PUT'){users[index].name=options.json.name;return response();}
   if(method==='DELETE'){users.splice(index,1);return response();}
  }
  if(path==='/api/admin/listings'){
   if(method==='GET')return response(200,{listings:[seed,...(listing?[listing]:[])]});
   if(method==='POST'){
    if(seedCreateId)return response(201,{id:seed.id});
    listing={id:'HE-R100',...options.json,updated_at:'v1',published:0,archived_at:null};return response(201,{id:listing.id});
   }
  }
  if(path==='/api/admin/listings/HE-R100'){
   if(method==='GET'){
    if(!listing)return response(404);
    const value={...listing,title:((replaceOwnership&&failAt)||(replaceOwnershipAfterFailure&&failed))?'Someone else':listing.title};
    return response(200,{listing:value,media:media?[{...media}]:[]});
   }
   if(method==='PUT'){
    if(failAt==='update'){failed=true;return response(500,{error:'must never leak sensitive provider details'});}
    if(options.json.updated_at!==listing.updated_at)return response(409);
    listing={...listing,...options.json,updated_at:'v2'};return response(200,{listing:{...listing}});
   }
   if(method==='DELETE'){assert.equal(options.json.confirm,listing.id);assert.ok(listing.archived_at);listing=null;return response();}
  }
  if(path==='/api/admin/listings/HE-R100/archive'){
   listing.archived_at='now';listing.updated_at='v3';return response(200,{listing:{...listing}});
  }
  if(path==='/api/admin/listings/HE-R100/history')return response(200,{items:[{type:'listing.created'},{type:'listing.updated'}]});
  if(path==='/api/admin/listings/HE-R100/media'&&method==='POST'){
   media={id:'U1234567890abcdef',listing_id:listing.id,label:options.multipart.label,origin:'upload',r2_key:'uploads/U1234567890abcdef.png',thumb_key:'thumbs/uploads/U1234567890abcdef.png'};
   return response(201,{media:{...media}});
  }
  if(path==='/media/U1234567890abcdef'||path==='/media/U1234567890abcdef?thumb')return media?{status:200,data:null,body:wrongMedia?Buffer.from('wrong'):PATTERN,headers:{'content-type':'image/png'}}:response(404);
  if(path==='/api/admin/media/U1234567890abcdef'&&method==='DELETE'){media=null;return response();}
  if(path==='/api/qa-app/simulate')return response(200,{simulated:true,simulation:options.json.simulation,folderId:'qa-folder-0001',messageId:'qa-receipt'});
  if(path==='/api/listings')return response(200,[]);
  return response();
 }};
 return {client,calls,remaining:()=>({listing,media,users})};
}
test('runs selected real API CRUD and removes only its verified listing, media and temporary user',async()=>{
 const f=fixture(),result=await runApiSmoke(f.client,{runId:RUN,buildId:BUILD,pattern:PATTERN});
 assert.ok(result.checks.length>25);assert.ok(result.checks.every(c=>c.passed===true));
 assert.equal(result.cleanup.listing.deleted,true);assert.equal(result.cleanup.media.deleted,true);assert.equal(result.cleanup.user.deleted,true);
 assert.equal(f.remaining().listing,null);assert.equal(f.remaining().media,null);assert.deepEqual(f.remaining().users,[{email:'qa-agent@example.test',name:'QA Agent'}]);
 assert.ok(f.calls.some(c=>c.path==='/api/admin/sales'));
 assert.ok(f.calls.some(c=>c.path==='/api/admin/settings/csv-map?header=f5f01146b6876adf6da560da78823561f9b2707e51567bfdd3f4fe0d08633b2d'));
 assert.ok(f.calls.some(c=>c.path==='/api/admin/settings/csv-map')); 
 assert.ok(f.calls.some(c=>c.csrf===false));
 assert.ok(result.retained.some(r=>r.type==='simulation-email'));
 assert.ok(!f.calls.some(c=>c.path.includes('/hermes')&&c.method==='POST'));
});
test('a mid-run failure still cleans the verified owned listing and returns only a fixed case label',async()=>{
 const f=fixture({failAt:'update'});
 await assert.rejects(runApiSmoke(f.client,{runId:RUN,buildId:BUILD,pattern:PATTERN}),/^Error: QA_CASE_FAILED:listing-update$/);
 assert.equal(f.remaining().listing,null);
 assert.ok(f.calls.some(c=>c.path==='/api/admin/listings/HE-R100'&&c.method==='DELETE'));
 assert.ok(!f.calls.some(c=>c.path.includes('HE-Q001')&&c.method==='DELETE'));
});
test('a colliding synthetic user causes no writes or deletes',async()=>{
 const f=fixture({userCollision:true});
 await assert.rejects(runApiSmoke(f.client,{runId:RUN,buildId:BUILD,pattern:PATTERN}),/QA_CASE_FAILED:run-collision/);
 assert.ok(!f.calls.some(c=>['POST','PUT','DELETE'].includes(c.method)&&c.path!=='/api/session'&&c.csrf!==false));
});
test('a create result naming a preexisting seed never authorizes deletion',async()=>{
 const f=fixture({seedCreateId:true});
 await assert.rejects(runApiSmoke(f.client,{runId:RUN,buildId:BUILD,pattern:PATTERN}),/QA_CASE_FAILED:listing-create-ownership/);
 assert.ok(!f.calls.some(c=>c.method==='DELETE'));
});
test('fresh ownership mismatch prevents cleanup mutations',async()=>{
 const f=fixture({replaceOwnership:true,failAt:'update'});
 await assert.rejects(runApiSmoke(f.client,{runId:RUN,buildId:BUILD,pattern:PATTERN}),/QA_CASE_FAILED:listing-create-ownership/);
 assert.ok(!f.calls.some(c=>c.method==='DELETE'||c.path.endsWith('/archive')));
});
test('a media byte mismatch still deletes only owned upload and listing',async()=>{
 const f=fixture({wrongMedia:true});
 await assert.rejects(runApiSmoke(f.client,{runId:RUN,buildId:BUILD,pattern:PATTERN}),/QA_CASE_FAILED:media-read-hash/);
 assert.equal(f.remaining().media,null);assert.equal(f.remaining().listing,null);
});

test('cleanup rechecks ownership after an earlier verified create before issuing any archive or delete',async()=>{
 const f=fixture({replaceOwnershipAfterFailure:true,failAt:'update'});
 await assert.rejects(runApiSmoke(f.client,{runId:RUN,buildId:BUILD,pattern:PATTERN}),/QA_CASE_FAILED:listing-update\+cleanup-listing/);
 assert.ok(!f.calls.some(c=>c.method==='DELETE'||c.path.endsWith('/archive')));
});
