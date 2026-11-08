const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {execFileSync} = require('node:child_process');

async function fixture(t) {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'hampton-unreserved-plan-'));
  t.after(() => fs.rm(cwd, {recursive:true, force:true}));
  const git = (...args) => execFileSync('git', args, {cwd, encoding:'utf8', stdio:['ignore','pipe','pipe']}).trim();
  git('init', '-b', 'main');
  git('remote', 'add', 'origin', 'https://github.com/andresleosan/HamptonJersey.git');
  await fs.mkdir(path.join(cwd, 'docs/roadmap'), {recursive:true});
  const unit = {id:'NOT-01', title:'Inbox events', parentTaskId:'NOT-01', preferredSlot:'vscode', enabled:true,
    priority:1, dependencies:[{unitId:'NOT-11',requiredEvidence:'integrated'}], resources:[]};
  await fs.writeFile(path.join(cwd, 'docs/roadmap/work-units.json'), JSON.stringify({units:[unit]}));
  const check = () => ({exitCode:0, root:cwd, branch:'main', relation:'equal', head:'a'.repeat(40), remoteHead:'a'.repeat(40)});
  return {cwd, check, unit};
}

for (const argv of [['plan','--task','NOT-01','--list','3'], ['claim','--task','NOT-01','--mode','plan'], ['claim','--task','NOT-01']]) {
  test(`${argv[0]} plans without initialization, credentials, HTTP or private writes`, async t => {
    const f = await fixture(t), before = await fs.readdir(path.join(f.cwd,'.git'));
    const {runCommand} = await import('../scripts/avanzar-team.mjs');
    const fetch = global.fetch; global.fetch = () => {throw new Error('Planning must not contact coordinator');};
    try {
      const result = await runCommand(argv, {cwd:f.cwd, env:{}, check:f.check});
      assert.equal(result.status,'planning'); assert.equal(result.reserved,false); assert.equal(result.buildAuthorized,false);
      assert.equal(result.task.id,'NOT-01'); assert.deepEqual(result.task.dependencies,f.unit.dependencies);
      assert.deepEqual(await fs.readdir(path.join(f.cwd,'.git')),before);
    } finally {global.fetch = fetch;}
  });
}

test('planning ignores other-session leases and unknown operations without modifying their private files', async t => {
  const f=await fixture(t); const {runCommand}=await import('../scripts/avanzar-team.mjs');
  const config=path.join(f.cwd,'.git/avanzar-team.json'),session=path.join(f.cwd,'.git/avanzar-team-session.json');
  await fs.writeFile(config,'preserved configuration'); await fs.writeFile(session,'preserved uncertain operation');
  const results=await Promise.all([1,2].map(()=>runCommand(['plan','--task','NOT-01'],{cwd:f.cwd,env:{},check:f.check})));
  assert.ok(results.every(r=>r.reserved===false));
  assert.equal(await fs.readFile(config,'utf8'),'preserved configuration');
  assert.equal(await fs.readFile(session,'utf8'),'preserved uncertain operation');
});

test('planning checks the base and task but does not enforce build dependencies', async t => {
  const f=await fixture(t); const {runCommand}=await import('../scripts/avanzar-team.mjs');
  await assert.rejects(runCommand(['plan','--task','NOT-99'],{cwd:f.cwd,env:{},check:f.check}),e=>e.code==='unknown_task');
  await assert.rejects(runCommand(['plan','--task','NOT-01'],{cwd:f.cwd,env:{},check:()=>({exitCode:1})}),e=>e.code==='unverified');
  const result=await runCommand(['plan','--list','3'],{cwd:f.cwd,env:{},check:f.check});
  assert.equal(result.reserved,false);assert.equal(result.tasks[0].id,'NOT-01');
});

test('server refuses planning leases without consuming any resource or changing state', async () => {
  const {emptyState,applyCommand}=await import('../coordination/src/state.mjs');
  const state={...emptyState(),catalog:{units:[],slots:[]}},before=structuredClone(state);
  assert.throws(()=>applyCommand(state,{actorId:'vps',slots:['vps'],role:'executor'},'/v1/claims',{
    operationId:'planning-request',expectedRevision:0,slot:'vps',sessionId:'s',checkoutId:'c',hostId:'h',mode:'plan',baseSha:'a'.repeat(40)
  },{},1000),e=>e.code==='PLANNING_IS_UNRESERVED');
  assert.deepEqual(state,before);
});

test('unreserved design evidence still needs coordinator authority, complete scope and real dependencies',async()=>{
  const {emptyState,applyCommand}=await import('../coordination/src/state.mjs');
  const unit={id:'A',parentTaskId:'A',preferredSlot:'vps',enabled:true,reviewRequired:true,kind:'development',
    dependencies:[{unitId:'UPSTREAM',requiredEvidence:'integrated'}],resources:[{key:'domain:a',mode:'write'}],acceptance:['Works']};
  const state={...emptyState(),revision:1,catalog:{units:[unit],slots:[{id:'vps',capacity:2}]}};
  const executor={actorId:'vps',role:'executor',slots:['vps']},coordinator={...executor,role:'coordinator'};
  const body={operationId:'design',expectedRevision:1,unitId:'A',kind:'design',reference:'Actual review',resources:unit.resources};
  assert.throws(()=>applyCommand(state,executor,'/v1/evidence',body,{},1000),e=>e.code==='COORDINATOR_REQUIRED');
  assert.throws(()=>applyCommand(state,coordinator,'/v1/evidence',{...body,resources:[]},{},1000),e=>e.code==='INCOMPLETE_REVIEW');
  assert.throws(()=>applyCommand(state,coordinator,'/v1/evidence',{...body,kind:'activated'},{},1000),e=>e.code==='INVALID_INPUT');
  applyCommand(state,coordinator,'/v1/evidence',body,{},1000);
  assert.equal(state.claims.length,0);
  assert.throws(()=>applyCommand(state,executor,'/v1/claims',{operationId:'build',expectedRevision:state.revision,taskId:'A',slot:'vps',sessionId:'s',checkoutId:'c',hostId:'h',mode:'build',baseSha:'a'.repeat(40)},{},1000),e=>e.code==='NO_AVAILABLE_UNIT');
});
