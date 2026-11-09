const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
let runActivity,model;
test.before(async()=>{({runActivity}=await import('../scripts/avanzar-activity.mjs'));model=await import('../coordination/src/activity.mjs');});
async function fixture(request){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'hampton-activity-client-')),state=model.emptyActivity();
 let failed=false,calls=[];
 class ClientError extends Error{constructor(code,message,exitCode=1){super(message);this.code=code;this.exitCode=exitCode;}}
 const deps={cwd:dir,env:{TEAM_ENDPOINT:'https://fixture.example'},check:()=>({exitCode:0,branch:'main',relation:'equal'}),
  checkout:async()=>({root:dir,gitDir:dir,configFile:path.join(dir,'legacy.json')}),
  readPrivate:async(file,optional)=>{try{return JSON.parse(await fs.readFile(file,'utf8'));}catch(e){if(optional&&e.code==='ENOENT')return null;throw e;}},
  atomicPrivate:async(file,value)=>fs.writeFile(file,JSON.stringify(value),{mode:0o600}),lock:async()=>async()=>{},
  validateEndpoint:v=>v,TeamError:ClientError,inspect:()=>({head:'a'.repeat(40)}),
  request:async(config,endpoint,body)=>{
   calls.push({endpoint,body:structuredClone(body)});
   if(endpoint.startsWith('/v1/activity?')||endpoint==='/v1/activity'){
    const operationId=new URL(endpoint,'https://fixture.example').searchParams.get('operation');
    const operation=state.operations.find(o=>o.operationId===operationId);
    return {revision:state.revision,records:structuredClone(state.records),operation:operation?{action:operation.action,body:structuredClone(operation.body),recordId:operation.result.record.id}:null};
   }
   if(request==='lose-then-deny'&&failed){const e=new ClientError('forbidden','Synthetic request denial');e.definitive=true;throw e;}
   const result=model.applyActivity(state,{actorId:'fixture-actor',role:'executor',slots:['vps']},endpoint.split('/').at(-1),body,{tasks:[{id:'REG-08',estado:'parcial'}]});
   if(['lose-first-response','lose-then-deny'].includes(request)&&!failed){failed=true;throw new ClientError('network_unknown','Synthetic lost response');}
   return result;
  }};
 return {dir,state,calls,deps,run:argv=>runActivity(argv,deps),close:()=>fs.rm(dir,{recursive:true,force:true})};
}
test('lost response keeps the exact operation; retry does not duplicate and another command is refused',async()=>{
 const f=await fixture('lose-first-response');try{
  const args=['start','--task','REG-08','--mode','build','--list','1'];
  await assert.rejects(f.run(args),{code:'network_unknown'});assert.equal(f.state.records.length,1);
  await assert.rejects(f.run(['start','--task','REG-01','--mode','build','--list','1']),{code:'activity_pending'});
  const result=await f.run(args);assert.equal(result.record.status,'active');assert.equal(f.state.records.length,1);
  assert.deepEqual(f.calls.filter(c=>c.endpoint.endsWith('/start')).map(c=>c.body.operationId),[f.state.records[0].id,f.state.records[0].id]);
 }finally{await f.close();}
});
test('a plan-only session closes prepared and never requests construction or touches legacy files',async()=>{
 const f=await fixture();try{
  const legacy=path.join(f.dir,'legacy.json');await fs.writeFile(legacy,JSON.stringify({endpoint:'https://fixture.example',slot:'vps'}));
  const before=await fs.readFile(legacy,'utf8');
  await f.run(['start','--task','REG-08','--mode','plan','--list','1']);
  const result=await f.run(['update','--status','planned','--milestone','plan','--next','build','--reference','docs/superpowers/plans/test.md']);
  assert.equal(result.record.status,'planned');assert.equal(f.state.records[0].mode,'plan');assert.equal(await fs.readFile(legacy,'utf8'),before);
  assert.ok(f.calls.every(c=>c.endpoint.startsWith('/v1/activity')));
  assert.equal((await f.run(['start','--task','REG-08','--mode','build','--list','1'])).record.mode,'build');
 }finally{await f.close();}
});
test('a denied retry cannot forget an earlier committed write; authoritative lookup recovers ownership',async()=>{
 const f=await fixture('lose-then-deny');try{
  const args=['start','--task','REG-08','--mode','build','--list','1'];
  await assert.rejects(f.run(args),{code:'network_unknown'});
  await assert.rejects(f.run(args),{code:'forbidden'});
  await assert.rejects(f.run(['start','--task','REG-01','--mode','build','--list','1']),{code:'activity_pending'});
  const list=await f.run(['list']);assert.equal(list.local.pending,null);assert.equal(list.local.current.id,f.state.records[0].id);
  await assert.rejects(f.run(['start','--task','REG-01','--mode','build','--list','1']),{code:'local_activity_active'});
 }finally{await f.close();}
});
test('missing shared access fails visibly and cannot grant offline construction',async()=>{
 const f=await fixture();try{f.deps.env={};await assert.rejects(f.run(['start','--task','REG-08','--mode','build','--list','1']),{code:'activity_unavailable'});assert.equal(f.state.records.length,0);}finally{await f.close();}
});
test('local session keeps pending work when GitHub is unverified and does not create another builder',async()=>{
 const f=await fixture();try{
  f.deps.inspect=()=>{throw new f.deps.TeamError('unverified','Synthetic unavailable GitHub');};
  await assert.rejects(f.run(['start','--task','REG-08','--mode','build','--list','1']),{code:'unverified'});assert.equal(f.state.records.length,0);
  f.deps.inspect=()=>({head:'a'.repeat(40)});
  await f.run(['start','--task','REG-08','--mode','build','--list','1']);
  await assert.rejects(f.run(['start','--task','REG-08','--mode','plan','--list','1']),{code:'local_activity_active'});
 }finally{await f.close();}
});
