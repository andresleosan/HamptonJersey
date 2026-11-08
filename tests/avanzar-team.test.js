const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { execFileSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const load = () => import('../scripts/avanzar-team.mjs');
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
async function fixture(t, {initialList} = {}) {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'team-client-'));
  t.after(() => fs.rm(cwd, { recursive: true, force: true }));
  git(cwd, 'init', '-b', 'main'); git(cwd, 'config', 'user.email', 'test@example.invalid'); git(cwd, 'config', 'user.name', 'Test');
  await fs.mkdir(path.join(cwd, 'docs')); await fs.writeFile(path.join(cwd, 'docs/plan.md'), 'base\n');
  await fs.mkdir(path.join(cwd, 'src')); await fs.writeFile(path.join(cwd, 'src/app.js'), 'base\n');
  git(cwd, 'add', '.'); git(cwd, 'commit', '-m', 'fixture'); git(cwd, 'remote', 'add', 'origin', 'https://github.com/andresleosan/HamptonJersey.git');
  const baseSha = git(cwd, 'rev-parse', 'HEAD');
  const requests = []; let handler;
  const server = http.createServer(async (req, res) => { let raw = ''; for await (const c of req) raw += c; const body = raw ? JSON.parse(raw) : null; requests.push({ url: req.url, body, headers: req.headers }); await handler(req, res, body); });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  t.after(() => new Promise(r => { server.closeAllConnections(); server.close(r); }));
  const endpoint = `http://127.0.0.1:${server.address().port}`;
  const board = { protocolVersion: 1, revision: 1, serverTime: new Date().toISOString(), catalogSha: baseSha, slots: [], tasks: [], units: [], claims: [], evidence: [], release: null, blockers: [] };
  handler = (req, res, body) => { res.setHeader('content-type', 'application/json'); if (req.method === 'GET') res.end(JSON.stringify(board)); else if (req.url === '/v1/claims') { board.claims = [{ id: 'claim-1', unitId: 'UNIT-1', ...body, actorId: 'actor', generation: 1, status: 'active', resources: [{key: 'path:docs/',mode:'write'}], expiresAt: new Date(Date.now()+900000).toISOString() }]; board.revision++; res.end(JSON.stringify({claim:board.claims[0],revision:board.revision})); } else if (req.url.startsWith('/v1/release/')) { const action=req.url.split('/').pop(); if(action==='acquire')board.release={status:'held',claimId:body.claimId,generation:body.generation,sha:body.sha}; if(action==='renew'&&body.sha&&board.release)board.release.sha=body.sha; if(action==='finish')board.release=body.outcome==='uncertain'?{...board.release,status:'uncertain'}:null; res.end(JSON.stringify({release:board.release,revision:++board.revision})); } else res.end(JSON.stringify({claim:board.claims[0],revision:++board.revision})); };
  const check = () => ({exitCode: 0, head: git(cwd, 'rev-parse', 'HEAD'), root: cwd, branch:'main', main:git(cwd,'rev-parse','HEAD'), remoteHead:baseSha, relation:'equal', dirty:false});
  const env = { CF_ACCESS_CLIENT_ID: 'client-secret-id', CF_ACCESS_CLIENT_SECRET: 'super-secret-value' };
  const { runCommand } = await load();
  const run = args => runCommand(args, {cwd, env, check});
  await run(['init','--endpoint',endpoint,...(initialList===undefined?['--slot','vps']:['--list',String(initialList)])]);
  return { cwd, endpoint, board, requests, run, env, check, baseSha, setHandler: fn => { handler = fn; } };
}

test('endpoint and scope normalization reject credential destinations and traversal', async () => {
  const { validateEndpoint, normalizeResource } = await load();
  for (const url of ['http://example.org', 'https://user:password@example.org', 'https://example.org/path', 'https://example.org?key=value']) assert.throws(() => validateEndpoint(url));
  assert.equal(validateEndpoint('https://team.example.org/'), 'https://team.example.org');
  assert.deepEqual(normalizeResource('./docs\\plans/', 'write'), {key:'path:docs/plans/',mode:'write'});
  for (const p of ['../src', '/etc/passwd', 'C:\\secrets', 'docs/../src']) assert.throws(() => normalizeResource(p));
});

test('init stores only private stable identifiers and rejects replacing a shared checkout', async t => {
  const f = await fixture(t);
  const configFile = path.join(f.cwd,'.git/avanzar-team.json');
  const config = JSON.parse(await fs.readFile(configFile));
  assert.equal(config.slot, 'vps'); assert.ok(config.sessionId); assert.ok(config.checkoutId); assert.ok(config.hostId);
  assert.equal((await fs.stat(configFile)).mode & 0o777, 0o600);
  assert.ok(!JSON.stringify(config).includes('secret'));
  await f.run(['init','--endpoint',f.endpoint,'--slot','vps']);
  assert.deepEqual(JSON.parse(await fs.readFile(configFile)),config);
  await assert.rejects(f.run(['init','--endpoint',f.endpoint,'--slot','hermes']), /config|checkout|slot/i);
  assert.equal(git(f.cwd,'status','--porcelain'),'');
});

test('unknown mutation retries the original operation even after board revision changes', async t => {
  const f = await fixture(t); let first = true;
  f.setHandler((req,res,body) => { res.setHeader('content-type','application/json'); if(req.method==='GET') return res.end(JSON.stringify(f.board)); if(first) {first=false;f.board.revision=2;req.socket.destroy();return;} res.end(JSON.stringify({claim:{id:'c', unitId:'U', generation:1, sessionId:body.sessionId,checkoutId:body.checkoutId,slot:body.slot,mode:'plan',status:'active',baseSha:f.baseSha,resources:[]},revision:2})); });
  await assert.rejects(f.run(['claim','--mode','plan']), /network|unknown/i);
  const result = await f.run(['claim','--mode','plan']);
  const posts = f.requests.filter(r=>r.body);
  assert.equal(posts.length,2); assert.deepEqual(posts[0].body,posts[1].body); assert.ok(result.claim);
});

test('redirects never forward access credentials to another server and output redacts service echoes', async t => {
  const f = await fixture(t); let hits=0;
  const other = http.createServer((req,res)=>{hits++;res.end('{}');}); await new Promise(r=>other.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>other.close(r)));
  f.setHandler((req,res)=>{res.writeHead(302,{location:`http://127.0.0.1:${other.address().port}`});res.end();});
  await assert.rejects(f.run(['status']),/redirect/i);assert.equal(hits,0);
  f.setHandler((req,res)=>{res.end(JSON.stringify({...f.board,blockers:[f.env.CF_ACCESS_CLIENT_SECRET],secret:f.env.CF_ACCESS_CLIENT_ID}));});
  const output=JSON.stringify(await f.run(['status'])); assert.ok(!output.includes('super-secret-value'));assert.ok(!output.includes('client-secret-id'));
});

test('renew rejects a generation replaced by recovery without adopting its authority', async t => {
  const f = await fixture(t); await f.run(['claim','--mode','plan']);f.board.claims[0].generation=2;
  await assert.rejects(f.run(['renew']),/generation|revoked/i);
  assert.equal(f.requests.filter(r=>r.url.endsWith('/renew')).length,0);
});

test('offline status cannot return cached success or grant a claim', async t => {
  const f = await fixture(t); f.setHandler((req)=>req.socket.destroy());
  await assert.rejects(f.run(['status']),/network|unknown/i); await assert.rejects(f.run(['claim','--mode','plan']),/network|unknown/i);
  assert.equal(f.requests.filter(r=>r.body).length,0);
});

test('fresh claims reject dirty files and submit checks committed staged unstaged and untracked scope', async t => {
  const f = await fixture(t);
  await fs.writeFile(path.join(f.cwd,'src/app.js'),'dirty');
  await assert.rejects(f.run(['claim','--mode','build']),/dirty|clean/i);
  await fs.writeFile(path.join(f.cwd,'src/app.js'),'base\n');await f.run(['claim','--mode','plan']);
  await fs.writeFile(path.join(f.cwd,'docs/plan.md'),'plan');git(f.cwd,'add','.');git(f.cwd,'commit','-m','plan');
  await fs.writeFile(path.join(f.cwd,'src/untracked.js'),'unsafe');
  await assert.rejects(f.run(['submit','--summary','review plan']),/scope|plan/i);
  await fs.rm(path.join(f.cwd,'src/untracked.js'));
  await f.run(['submit','--summary','review plan']);
  const submit=f.requests.find(r=>r.url.endsWith('/submit'));assert.deepEqual(submit.body.changedPaths,['docs/plan.md']);assert.equal(submit.body.headSha,git(f.cwd,'rev-parse','HEAD'));
});

test('plan claims reject product code even if an expansive resource is present', async t => {
  const f=await fixture(t);await f.run(['claim','--mode','plan']); f.board.claims[0].resources=[{key:'path:src/',mode:'write'}];
  await fs.writeFile(path.join(f.cwd,'src/app.js'),'code');
  await assert.rejects(f.run(['submit','--summary','unsafe']),/plan|document/i);
  await f.run(['scope','--path','src/app.js']);
  const scope=f.requests.find(r=>r.url.endsWith('/scope'));assert.deepEqual(scope.body.resources,[{key:'path:src/app.js',mode:'write'}]);
  await assert.rejects(f.run(['submit','--summary','Still plan']),/plan|document/i);
});

test('abandon never discards local committed work and release acquire requires a clean submitted claim', async t=>{
  const f=await fixture(t);await f.run(['claim','--mode','plan']);
  await fs.writeFile(path.join(f.cwd,'docs/plan.md'),'pending');git(f.cwd,'add','.');git(f.cwd,'commit','-m','pending');
  await assert.rejects(f.run(['abandon']),/pending|work|clean/i);
  await assert.rejects(f.run(['release','acquire']),/submitted/i);
});

test('proxy environment routes requests through an HTTP CONNECT proxy and NO_PROXY bypasses it', async t=>{
  const f=await fixture(t); const net=require('node:net');let tunnels=0;
  const proxy=http.createServer();proxy.on('connect',(req,socket,head)=>{tunnels++;const [host,port]=req.url.split(':');const upstream=net.connect(Number(port),host,()=>{socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');if(head.length)upstream.write(head);socket.pipe(upstream);upstream.pipe(socket);});upstream.on('error',()=>socket.destroy());socket.on('error',()=>upstream.destroy());});await new Promise(r=>proxy.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>{proxy.closeAllConnections();proxy.close(r);}));
  const {runCommand}=await load();const env={...f.env,HTTP_PROXY:`http://127.0.0.1:${proxy.address().port}`,HTTPS_PROXY:`http://127.0.0.1:${proxy.address().port}`,NO_PROXY:''};
  await runCommand(['status'],{cwd:f.cwd,env,check:f.check});assert.equal(tunnels,1);
  await runCommand(['status'],{cwd:f.cwd,env:{...env,NO_PROXY:'127.0.0.1'},check:f.check});assert.equal(tunnels,1);
});

test('pause records pending work and handoff names the complete explicit target session', async t=>{
  const f=await fixture(t);await f.run(['claim','--mode','plan']);await fs.writeFile(path.join(f.cwd,'docs/plan.md'),'pending');
  await f.run(['pause','--evidence','Paused for review']);
  const pause=f.requests.find(r=>r.url.endsWith('/pause'));assert.equal(pause.body.pendingWork,true);assert.equal(pause.body.evidence,'Paused for review');
  await f.run(['handoff','--target-actor','reviewer','--target-slot','hermes','--target-session-id','new-session','--target-checkout-id','new-checkout','--target-host-id','new-host','--evidence','Reviewed handoff']);
  const handoff=f.requests.find(r=>r.url.endsWith('/handoff'));assert.deepEqual(handoff.body.target,{actorId:'reviewer',slot:'hermes',sessionId:'new-session',checkoutId:'new-checkout',hostId:'new-host'});
});

test('terminal mutation with a lost response can be retried but a changed generation still cannot',async t=>{
  const f=await fixture(t);await f.run(['claim','--mode','plan']);let first=true;
  f.setHandler((req,res,body)=>{if(req.method==='GET')return res.end(JSON.stringify(f.board));if(first){first=false;f.board.claims[0].status='completed';req.socket.destroy();return;}res.end(JSON.stringify({claim:f.board.claims[0],revision:3}));});
  await assert.rejects(f.run(['complete']),/network|unknown/i);
  await f.run(['complete']);const complete=f.requests.filter(r=>r.url.endsWith('/complete'));assert.deepEqual(complete[0].body,complete[1].body);
});

test('submit refuses staged unstaged and committed product changes outside a build scope',async t=>{
  const f=await fixture(t);await f.run(['claim','--mode','build']);
  await fs.writeFile(path.join(f.cwd,'src/app.js'),'code');await assert.rejects(f.run(['submit','--summary','unsafe']),/scope/i);
  git(f.cwd,'add','src/app.js');await assert.rejects(f.run(['submit','--summary','unsafe']),/scope/i);
  git(f.cwd,'commit','-m','code');await assert.rejects(f.run(['submit','--summary','unsafe']),/scope/i);
});

test('config copied to another checkout and a symlinked private config are rejected',async t=>{
  const f=await fixture(t);const config=path.join(f.cwd,'.git/avanzar-team.json');
  const stateFile=path.join(f.cwd,'.git/avanzar-team-session.json');const state=JSON.parse(await fs.readFile(stateFile));state.root='/different-checkout';await fs.writeFile(stateFile,JSON.stringify(state),{mode:0o600});
  await assert.rejects(f.run(['status']),/copied|shared|checkout/i);
  await fs.rename(config,config+'.saved');await fs.symlink(config+'.saved',config);await assert.rejects(f.run(['status']),/private|regular/i);
});

test('HTTP conflict is definitive and an untrusted successful response remains pending',async t=>{
  const f=await fixture(t);f.setHandler((req,res)=>{if(req.method==='GET')return res.end(JSON.stringify(f.board));res.writeHead(409);res.end(JSON.stringify({error:{code:'occupied',message:f.env.CF_ACCESS_CLIENT_SECRET}}));});
  await assert.rejects(f.run(['claim']),e=>e.exitCode===2&&!e.message.includes(f.env.CF_ACCESS_CLIENT_SECRET));
  f.setHandler((req,res)=>{res.end(JSON.stringify(req.method==='GET'?f.board:{}));});
  await assert.rejects(f.run(['claim']),/unknown|invalid/i);
  const state=JSON.parse(await fs.readFile(path.join(f.cwd,'.git/avanzar-team-session.json')));assert.ok(state.pending);
});

test('coordinator handoff may explicitly recover another claim without adopting its generation', async t=>{
  const f=await fixture(t);
  f.board.claims=[{id:'foreign',unitId:'U',slot:'hermes',sessionId:'old-session',checkoutId:'old-checkout',hostId:'old-host',actorId:'old-actor',generation:4,status:'paused',mode:'plan',baseSha:f.baseSha,resources:[]}];
  await f.run(['handoff','--claim','foreign','--generation','4','--target-actor','new-actor','--target-slot','hermes','--target-session-id','new-session','--target-checkout-id','new-checkout','--target-host-id','new-host','--evidence','Explicit stale recovery']);
  const post=f.requests.find(r=>r.url.endsWith('/handoff'));assert.equal(post.url,'/v1/claims/foreign/handoff');assert.equal(post.body.sessionId,'old-session');assert.equal(post.body.generation,4);
  const state=JSON.parse(await fs.readFile(path.join(f.cwd,'.git/avanzar-team-session.json')));assert.equal(state.claim,null);
});

test('a dirty submit never freezes a release SHA and new claim cannot use ahead commits',async t=>{
  const f=await fixture(t);await f.run(['claim','--mode','plan']);f.board.claims[0].status='submitted';await fs.writeFile(path.join(f.cwd,'docs/plan.md'),'dirty');
  await assert.rejects(f.run(['release','acquire']),/clean|dirty/i);assert.equal(f.requests.filter(r=>r.url==='/v1/release/acquire').length,0);
  const {runCommand}=await load();const g=await fixture(t);await fs.writeFile(path.join(g.cwd,'docs/plan.md'),'ahead');git(g.cwd,'add','.');git(g.cwd,'commit','-m','ahead');
  await assert.rejects(runCommand(['claim'],{cwd:g.cwd,env:g.env,check:()=>({...g.check(),exitCode:2,relation:'ahead'})}),/pending|canonical/i);
});

test('unknown mutation blocks a different mutation and a cancelled release uses explicit evidence',async t=>{
  const f=await fixture(t);await f.run(['claim']);let first=true;
  f.setHandler((req,res)=>{if(req.method==='GET')return res.end(JSON.stringify(f.board));if(first){first=false;req.socket.destroy();return;}res.end(JSON.stringify(req.url.startsWith('/v1/release/')?{release:null,revision:2}:{claim:f.board.claims[0],revision:2}));});
  await assert.rejects(f.run(['renew']),/network|unknown/i);await assert.rejects(f.run(['pause','--evidence','waiting']),/unknown|retry|operation/i);
  await f.run(['renew']);await f.run(['release','finish','cancelled','--evidence','No publication attempted']);
  const finish=f.requests.find(r=>r.url==='/v1/release/finish');assert.equal(finish.body.outcome,'cancelled');assert.equal(finish.body.evidence,'No publication attempted');
});

test('a held release turn accepts a checked final SHA after integration and resubmission before approval',async t=>{
  const f=await fixture(t);await f.run(['claim','--mode','build']);f.board.claims[0].status='submitted';
  await f.run(['release','acquire','--sha',f.baseSha]);
  f.board.release={status:'held',claimId:'claim-1',generation:1,sha:f.baseSha};
  await fs.writeFile(path.join(f.cwd,'docs/plan.md'),'integrated final\n');git(f.cwd,'add','.');git(f.cwd,'commit','-m','integrate final');const final=git(f.cwd,'rev-parse','HEAD');
  await f.run(['submit','--summary','Final integration verified']);f.board.claims[0].headSha=final;
  await f.run(['release','renew','--sha',final]);
  assert.equal(f.requests.find(r=>r.url==='/v1/release/renew').body.sha,final);
  const count=f.requests.filter(r=>r.url==='/v1/release/renew').length;
  await fs.writeFile(path.join(f.cwd,'docs/plan.md'),'dirty');await assert.rejects(f.run(['release','renew','--sha',final]),/clean|dirty/i);
  assert.equal(f.requests.filter(r=>r.url==='/v1/release/renew').length,count);
});

test('an uncertain release cannot change SHA and renew requires exact local HEAD',async t=>{
  const f=await fixture(t);await f.run(['claim','--mode','build']);f.board.claims[0].status='submitted';
  f.board.release={status:'uncertain',claimId:'claim-1',generation:1,sha:f.baseSha};
  await fs.writeFile(path.join(f.cwd,'docs/plan.md'),'final\n');git(f.cwd,'add','.');git(f.cwd,'commit','-m','final');const final=git(f.cwd,'rev-parse','HEAD');
  await assert.rejects(f.run(['release','renew','--sha',final]),/uncertain|reconcil|turn/i);
  f.board.release.status='held';
  await assert.rejects(f.run(['release','renew','--sha',f.baseSha]),/sha|head/i);
  assert.equal(f.requests.filter(r=>r.url==='/v1/release/renew').length,0);
});

test('approved SHA freezes a turn across invocations and rejects changed submit or renewal',async t=>{
  const f=await fixture(t);await f.run(['claim','--mode','build']);f.board.claims[0].status='submitted';
  f.board.release={status:'held',claimId:'claim-1',generation:1,sha:f.baseSha};
  await f.run(['release','renew','--sha',f.baseSha,'--approved-sha',f.baseSha]);
  await fs.writeFile(path.join(f.cwd,'docs/plan.md'),'new commit\n');git(f.cwd,'add','.');git(f.cwd,'commit','-m','changed after approval');const changed=git(f.cwd,'rev-parse','HEAD');
  await assert.rejects(f.run(['submit','--summary','Changed after approval']),/approved|frozen/i);
  await assert.rejects(f.run(['release','renew','--sha',changed]),/approved|frozen/i);
  assert.equal(f.requests.filter(r=>r.url.endsWith('/submit')).length,0);
});

test('environment approval rejects a different SHA even if a preflight implementation ignores it',async t=>{
  const f=await fixture(t);await f.run(['claim','--mode','build']);f.board.claims[0].status='submitted';
  f.board.release={status:'held',claimId:'claim-1',generation:1,sha:f.baseSha};
  await fs.writeFile(path.join(f.cwd,'docs/plan.md'),'changed\n');git(f.cwd,'add','.');git(f.cwd,'commit','-m','changed');const changed=git(f.cwd,'rev-parse','HEAD');
  const {runCommand}=await load();
  await assert.rejects(runCommand(['release','renew','--sha',changed],{cwd:f.cwd,env:{...f.env,TALLER_SHA_APROBADO:f.baseSha},check:f.check}),/approved|frozen/i);
  assert.equal(f.requests.filter(r=>r.url==='/v1/release/renew').length,0);
});

test('lost handoff response reconciles the exact new target without adopting its authority',async t=>{
  const f=await fixture(t);await f.run(['claim','--mode','plan']);
  const args=['handoff','--target-actor','next-actor','--target-slot','hermes','--target-session-id','next-session','--target-checkout-id','next-checkout','--target-host-id','next-host','--evidence','Reviewed transfer'];let first=true;
  f.setHandler((req,res,body)=>{if(req.method==='GET')return res.end(JSON.stringify(f.board));if(first){first=false;const c=f.board.claims[0];Object.assign(c,body.target,{actorId:body.target.actorId,generation:2});req.socket.destroy();return;}res.end(JSON.stringify({revision:++f.board.revision}));});
  await assert.rejects(f.run(args),/network|unknown/i);
  const result=await f.run(args);assert.equal(result.status,'handoff_reconciled');
  const state=JSON.parse(await fs.readFile(path.join(f.cwd,'.git/avanzar-team-session.json')));assert.equal(state.claim,null);assert.equal(state.pending,null);
  await f.run(['catalog','--sha',f.baseSha]);assert.ok(f.requests.some(r=>r.url==='/v1/catalog'));
});

test('streamed UTF8 board text survives a multibyte character split across chunks',async t=>{
  const f=await fixture(t);
  f.setHandler((req,res)=>{const raw=Buffer.from(JSON.stringify({...f.board,blockers:['España']}));const split=raw.indexOf(Buffer.from('ñ'))+1;res.write(raw.subarray(0,split));setTimeout(()=>res.end(raw.subarray(split)),10);});
  const result=await f.run(['status']);assert.equal(result.blockers[0],'España');
});

test('remote error code cannot expose environment credentials through CLI stdout',async t=>{
  const f=await fixture(t);f.setHandler((req,res)=>{res.writeHead(409,{'content-type':'application/json'});res.end(JSON.stringify({error:{code:f.env.CF_ACCESS_CLIENT_SECRET,message:'Rejected'}}));});
  const {execFile}=require('node:child_process');
  const result=await new Promise(resolve=>execFile(process.execPath,[path.resolve(__dirname,'../scripts/avanzar-team.mjs'),'status'],{cwd:f.cwd,env:{...process.env,...f.env,HTTP_PROXY:'',HTTPS_PROXY:'',http_proxy:'',https_proxy:''}},(error,stdout)=>resolve({exit:error?.code,stdout})));
  assert.equal(result.exit,2);assert.ok(!result.stdout.includes(f.env.CF_ACCESS_CLIENT_SECRET));assert.ok(!result.stdout.includes(f.env.CF_ACCESS_CLIENT_ID));
});


test('renew without SHA keeps the held turn SHA instead of changing it to local HEAD',async t=>{
  const f=await fixture(t);await f.run(['claim','--mode','build']);f.board.claims[0].status='submitted';f.board.release={status:'held',claimId:'claim-1',generation:1,sha:f.baseSha};
  await fs.writeFile(path.join(f.cwd,'docs/plan.md'),'unsubmitted final\n');git(f.cwd,'add','.');git(f.cwd,'commit','-m','pending final');
  await f.run(['release','renew']);const body=f.requests.find(r=>r.url==='/v1/release/renew').body;assert.equal(Object.hasOwn(body,'sha'),false);
});

test('plan scope can reserve exact product paths before design without authorizing product edits',async t=>{
  const f=await fixture(t);await f.run(['claim','--mode','plan']);await f.run(['scope','--write','src/app.js','--read','docs/']);
  const body=f.requests.find(r=>r.url.endsWith('/scope')).body;assert.deepEqual(body.resources,[{key:'path:src/app.js',mode:'write'},{key:'path:docs/',mode:'read'}]);
  f.board.claims[0].resources.push({key:'path:src/app.js',mode:'write'});await fs.writeFile(path.join(f.cwd,'src/app.js'),'not yet authorized');
  await assert.rejects(f.run(['submit','--summary','Plan only']),/plan|document/i);
});

test('same-machine clones share host identity and can reserve a logical E2E resource',async t=>{
  const f=await fixture(t);const g=await fixture(t);const a=JSON.parse(await fs.readFile(path.join(f.cwd,'.git/avanzar-team.json')));const b=JSON.parse(await fs.readFile(path.join(g.cwd,'.git/avanzar-team.json')));
  assert.equal(a.hostId,b.hostId);assert.notEqual(a.checkoutId,b.checkoutId);assert.notEqual(a.sessionId,b.sessionId);
  await f.run(['claim','--mode','plan']);await f.run(['scope','--resource',`e2e:${a.hostId}`]);
  const body=f.requests.find(r=>r.url.endsWith('/scope')).body;assert.deepEqual(body.resources,[{key:`e2e:${a.hostId}`,mode:'write'}]);
  await assert.rejects(f.run(['scope','--resource','../invalid']),/resource|scope/i);
});

test('an uncertain turn cannot be cancelled or used to clear its frozen approval',async t=>{
  const f=await fixture(t);await f.run(['claim','--mode','build']);f.board.claims[0].status='submitted';f.board.release={status:'held',claimId:'claim-1',generation:1,sha:f.baseSha};
  await f.run(['release','renew','--sha',f.baseSha,'--approved-sha',f.baseSha]);f.board.release.status='uncertain';
  await assert.rejects(f.run(['release','finish','cancelled','--sha',f.baseSha,'--evidence','Still unknown']),/uncertain|reconcil/i);
  const state=JSON.parse(await fs.readFile(path.join(f.cwd,'.git/avanzar-team-session.json')));assert.equal(state.approvedRelease.sha,f.baseSha);
  assert.equal(f.requests.filter(r=>r.url==='/v1/release/finish').length,0);
});

test('verified terminal release clears freeze but synchronization pending preserves it',async t=>{
  const f=await fixture(t);await f.run(['claim','--mode','build']);f.board.claims[0].status='submitted';f.board.release={status:'held',claimId:'claim-1',generation:1,sha:f.baseSha};
  await f.run(['release','renew','--sha',f.baseSha,'--approved-sha',f.baseSha]);let pending=true;
  f.setHandler((req,res)=>{if(req.method==='GET')return res.end(JSON.stringify(f.board));res.end(JSON.stringify(pending?{revision:2,release:{...f.board.release,status:'synchronization_pending'},synchronizationPending:true}:{revision:3,release:null}));});
  await f.run(['release','finish','published','--sha',f.baseSha,'--evidence','Canonical publication']);
  let state=JSON.parse(await fs.readFile(path.join(f.cwd,'.git/avanzar-team-session.json')));assert.equal(state.approvedRelease.sha,f.baseSha);
  pending=false;await f.run(['release','finish','published','--sha',f.baseSha,'--evidence','Canonical publication']);
  state=JSON.parse(await fs.readFile(path.join(f.cwd,'.git/avanzar-team-session.json')));assert.equal(state.approvedRelease,null);
});


test('release response without release state stays unknown and preserves the operation for retry',async t=>{
  const f=await fixture(t);await f.run(['claim','--mode','build']);f.board.claims[0].status='submitted';
  f.setHandler((req,res)=>res.end(JSON.stringify(req.method==='GET'?f.board:{revision:2})));
  await assert.rejects(f.run(['release','acquire','--sha',f.baseSha]),/unknown|invalid/i);
  const state=JSON.parse(await fs.readFile(path.join(f.cwd,'.git/avanzar-team-session.json')));assert.ok(state.pending);
});

function checkedHistory(f, getCanonical) {
  return ({approvedSha}={})=>{
    const head=git(f.cwd,'rev-parse','HEAD');const canonical=getCanonical();
    const [ahead,behind]=git(f.cwd,'rev-list','--left-right','--count',`HEAD...${canonical}`).split(/\s+/).map(Number);
    const relation=!ahead&&!behind?'equal':ahead&&!behind?'ahead':!ahead&&behind?'behind':'diverged';
    const dirty=Boolean(git(f.cwd,'status','--porcelain'));
    return {exitCode:approvedSha && ['equal','ahead'].includes(relation) && !dirty && approvedSha===head?0:relation==='equal'&&!dirty?0:2,head,main:git(f.cwd,'rev-parse','main'),branch:'main',root:f.cwd,remoteHead:canonical,relation,dirty};
  };
}

async function parallelHistories(t,{unsafeMerge=false}={}) {
  const f=await fixture(t);await f.run(['claim','--mode','build']);
  await fs.writeFile(path.join(f.cwd,'docs/plan.md'),'B own delivery\n');git(f.cwd,'add','.');git(f.cwd,'commit','-m','B own work');
  const b=git(f.cwd,'rev-parse','HEAD');git(f.cwd,'checkout','-b','publisher-a',f.baseSha);
  await fs.writeFile(path.join(f.cwd,'src/app.js'),'A published change\n');git(f.cwd,'add','.');git(f.cwd,'commit','-m','A publishes independently');
  let canonical=git(f.cwd,'rev-parse','HEAD');git(f.cwd,'checkout','main');
  const {runCommand}=await load();const check=checkedHistory(f,()=>canonical);const run=args=>runCommand(args,{cwd:f.cwd,env:f.env,check});
  const integrate=async()=>{git(f.cwd,'merge','--no-commit','publisher-a');if(unsafeMerge){await fs.writeFile(path.join(f.cwd,'src/app.js'),'B unauthorized merge edit\n');git(f.cwd,'add','src/app.js');}git(f.cwd,'commit','-m','B integrates canonical A');};
  return {...f,b,run,integrate,setCanonical:sha=>{canonical=sha;}};
}

test('independent delivery can submit and acquire divergent provisional work then integrate main within own scope',async t=>{
  const f=await parallelHistories(t);
  await f.run(['submit','--summary','B provisional before integration']);f.board.claims[0].status='submitted';
  await f.run(['release','acquire','--sha',f.b]);
  await f.integrate();const final=git(f.cwd,'rev-parse','HEAD');
  await f.run(['submit','--summary','B final integrated delivery']);
  const submits=f.requests.filter(r=>r.url.endsWith('/submit'));assert.deepEqual(submits.map(r=>r.body.changedPaths),[['docs/plan.md'],['docs/plan.md']]);
  await f.run(['release','renew','--sha',final]);
  await f.run(['release','renew','--sha',final,'--approved-sha',final]);
  f.setCanonical(final);await f.run(['release','finish','published','--sha',final,'--evidence','Canonical final publication']);
  assert.equal(f.board.release,null);
});

test('own out-of-scope commit remains detected even if reverted before integration',async t=>{
  const f=await parallelHistories(t);await fs.writeFile(path.join(f.cwd,'src/app.js'),'B wrong file\n');git(f.cwd,'add','.');git(f.cwd,'commit','-m','B wrong edit');
  await fs.writeFile(path.join(f.cwd,'src/app.js'),'base\n');git(f.cwd,'add','.');git(f.cwd,'commit','-m','B reverts wrong edit');
  await assert.rejects(f.run(['submit','--summary','Unsafe own history']),/scope/i);
});

test('merge resolution or amended merge edits outside scope cannot hide behind canonical paths',async t=>{
  const f=await parallelHistories(t,{unsafeMerge:true});await f.integrate();
  await assert.rejects(f.run(['submit','--summary','Unsafe merge edit']),/scope/i);
});

test('divergent provisional work cannot be frozen or renewed as a final approved SHA',async t=>{
  const f=await parallelHistories(t);f.board.claims[0].status='submitted';
  await assert.rejects(f.run(['release','acquire','--sha',f.b,'--approved-sha',f.b]),/canonical|approved|integrat/i);
  f.board.release={status:'held',claimId:'claim-1',generation:1,sha:f.b};
  await assert.rejects(f.run(['release','renew','--sha',f.b]),/canonical|approved|integrat/i);
});

function recoveredClaim(f, config, generation=2) {
  const source={actorId:'old-actor',slot:'vps',sessionId:'old-session',checkoutId:'old-checkout',hostId:'old-host'};
  const target={actorId:'actor',slot:config.slot,sessionId:config.sessionId,checkoutId:config.checkoutId,hostId:config.hostId};
  return {id:'claim-1',unitId:'UNIT-1',...target,generation,status:'paused',mode:'build',baseSha:f.baseSha,resources:[{key:'path:docs/',mode:'write'}],handoffs:[{from:source,to:target,evidence:'Explicit authorized recovery',at:new Date().toISOString()}]};
}

for (const command of ['resume', 'accept-handoff']) {
  async function pendingPlan(t) {
    const f=await fixture(t);await f.run(['claim','--mode','plan']);
    const config=JSON.parse(await fs.readFile(path.join(f.cwd,'.git/avanzar-team.json')));
    if(command==='accept-handoff')f.board.claims=[{...recoveredClaim(f,config),mode:'plan'}];
    const args=command==='resume'?['resume','--mode','build']:['accept-handoff','--claim','claim-1','--generation','2','--mode','build'];
    await fs.writeFile(path.join(f.cwd,'docs/sources.json'),'[{"source":"pending"}]\n');
    await fs.writeFile(path.join(f.cwd,'docs/checklist.html'),'<p>Partial</p>\n');
    git(f.cwd,'add','docs/checklist.html');git(f.cwd,'commit','-m','Saved partial checklist');
    return {...f,args};
  }

  test(`${command} can request build with reserved JSON and HTML while preserving saved work`,async t=>{
    const f=await pendingPlan(t);const savedHead=git(f.cwd,'rev-parse','HEAD');
    await assert.rejects(f.run(f.args.filter((_,i)=>i<f.args.length-2)),e=>e.code==='plan_scope');
    f.setHandler((req,res,body)=>{if(req.method==='GET')return res.end(JSON.stringify(f.board));assert.equal(body.mode,'build');f.board.claims[0].mode='build';f.board.claims[0].status='active';res.end(JSON.stringify({claim:f.board.claims[0],revision:++f.board.revision}));});
    const result=await f.run(f.args);assert.equal(result.claim.mode,'build');
    assert.equal(git(f.cwd,'rev-parse','HEAD'),savedHead);
    assert.equal(await fs.readFile(path.join(f.cwd,'docs/sources.json'),'utf8'),'[{"source":"pending"}]\n');
    assert.equal(await fs.readFile(path.join(f.cwd,'docs/checklist.html'),'utf8'),'<p>Partial</p>\n');
    const state=JSON.parse(await fs.readFile(path.join(f.cwd,'.git/avanzar-team-session.json')));assert.equal(state.claim.generation,command==='resume'?1:2);assert.equal(state.pending,null);
  });

  test(`${command} requesting build still refuses saved files outside the reserved write scope`,async t=>{
    const f=await pendingPlan(t);await fs.writeFile(path.join(f.cwd,'src/app.js'),'unreserved\n');
    await assert.rejects(f.run(f.args),e=>e.code==='out_of_scope');
    assert.equal(f.requests.filter(r=>r.url.endsWith('/resume')).length,0);
  });

  test(`${command} requesting build preserves local authority when the server rejects the transition`,async t=>{
    const f=await pendingPlan(t);const file=path.join(f.cwd,'.git/avanzar-team-session.json');const before=JSON.parse(await fs.readFile(file));
    f.setHandler((req,res)=>{if(req.method==='GET')return res.end(JSON.stringify(f.board));res.writeHead(409);res.end(JSON.stringify({error:{code:'UNIT_NOT_REVIEWED'}}));});
    await assert.rejects(f.run(f.args),e=>e.code==='UNIT_NOT_REVIEWED');
    const after=JSON.parse(await fs.readFile(file));assert.deepEqual(after.claim,before.claim);assert.equal(after.pending,null);assert.equal(f.board.claims[0].mode,'plan');
  });

  test(`${command} requesting build reconciles the same operation after a response without the requested mode`,async t=>{
    const f=await pendingPlan(t);const file=path.join(f.cwd,'.git/avanzar-team-session.json');const before=JSON.parse(await fs.readFile(file));
    await assert.rejects(f.run(f.args),e=>e.code==='unknown_result');
    const after=JSON.parse(await fs.readFile(file));assert.deepEqual(after.claim,before.claim);assert.equal(after.pending.body.mode,'build');
    assert.equal(f.board.claims[0].mode,'plan');
    f.setHandler((req,res,body)=>{if(req.method==='GET')return res.end(JSON.stringify(f.board));f.board.claims[0].mode=body.mode;f.board.claims[0].status='active';res.end(JSON.stringify({claim:f.board.claims[0],revision:++f.board.revision}));});
    const result=await f.run(f.args);assert.equal(result.claim.mode,'build');
    const posts=f.requests.filter(r=>r.url.endsWith('/resume'));assert.equal(posts.length,2);assert.deepEqual(posts[0].body,posts[1].body);
    const reconciled=JSON.parse(await fs.readFile(file));assert.equal(reconciled.pending,null);assert.equal(reconciled.claim.generation,command==='resume'?1:2);
  });
}

test('same-checkout explicit handoff acceptance verifies next generation and preserves committed and dirty work',async t=>{
  const f=await fixture(t);await f.run(['claim','--mode','build']);const config=JSON.parse(await fs.readFile(path.join(f.cwd,'.git/avanzar-team.json')));
  await fs.writeFile(path.join(f.cwd,'docs/plan.md'),'saved commit\n');git(f.cwd,'add','.');git(f.cwd,'commit','-m','saved work');
  await fs.writeFile(path.join(f.cwd,'docs/pending.md'),'saved dirty\n');f.board.claims=[recoveredClaim(f,config)];
  await assert.rejects(f.run(['resume']),/generation|revoked/i);
  await f.run(['accept-handoff','--claim','claim-1','--generation','2']);
  const state=JSON.parse(await fs.readFile(path.join(f.cwd,'.git/avanzar-team-session.json')));assert.equal(state.claim.generation,2);
  assert.equal(await fs.readFile(path.join(f.cwd,'docs/pending.md'),'utf8'),'saved dirty\n');
  assert.equal(git(f.cwd,'log','-1','--format=%s'),'saved work');assert.ok(f.requests.some(r=>r.url==='/v1/claims/claim-1/resume'&&r.body.generation===2));
});

test('different initialized handoff destination can explicitly resume saved work without a fresh clean claim',async t=>{
  const f=await fixture(t);const config=JSON.parse(await fs.readFile(path.join(f.cwd,'.git/avanzar-team.json')));
  await fs.writeFile(path.join(f.cwd,'docs/plan.md'),'received pending work\n');f.board.claims=[recoveredClaim(f,config)];
  await f.run(['accept-handoff','--claim','claim-1','--generation','2','--mode','build']);
  const state=JSON.parse(await fs.readFile(path.join(f.cwd,'.git/avanzar-team-session.json')));assert.equal(state.claim.generation,2);assert.equal(state.claim.id,'claim-1');
  assert.equal(await fs.readFile(path.join(f.cwd,'docs/plan.md'),'utf8'),'received pending work\n');
});

test('explicit handoff acceptance refuses mismatched target provenance or unreserved saved work',async t=>{
  const f=await fixture(t);const config=JSON.parse(await fs.readFile(path.join(f.cwd,'.git/avanzar-team.json')));const claim=recoveredClaim(f,config);f.board.claims=[claim];
  claim.handoffs[0].to.hostId='foreign-host';await assert.rejects(f.run(['accept-handoff','--claim','claim-1','--generation','2']),/target|handoff|provenance/i);
  claim.handoffs[0].to.hostId=config.hostId;await fs.writeFile(path.join(f.cwd,'src/app.js'),'wrong saved work');
  await assert.rejects(f.run(['accept-handoff','--claim','claim-1','--generation','2']),/scope/i);
  assert.equal(f.requests.filter(r=>r.url.endsWith('/resume')).length,0);
});

test('lost handoff acceptance response retries same resume operation and records authority only after confirmed response',async t=>{
  const f=await fixture(t);const config=JSON.parse(await fs.readFile(path.join(f.cwd,'.git/avanzar-team.json')));f.board.claims=[recoveredClaim(f,config)];let first=true;
  f.setHandler((req,res)=>{if(req.method==='GET')return res.end(JSON.stringify(f.board));if(first){first=false;f.board.claims[0].status='active';req.socket.destroy();return;}res.end(JSON.stringify({claim:f.board.claims[0],revision:3}));});
  const args=['accept-handoff','--claim','claim-1','--generation','2'];await assert.rejects(f.run(args),/unknown|network/i);
  let state=JSON.parse(await fs.readFile(path.join(f.cwd,'.git/avanzar-team-session.json')));assert.equal(state.claim,null);
  await f.run(args);state=JSON.parse(await fs.readFile(path.join(f.cwd,'.git/avanzar-team-session.json')));assert.equal(state.claim.generation,2);
  const posts=f.requests.filter(r=>r.url.endsWith('/resume'));assert.deepEqual(posts[0].body,posts[1].body);
});

test('submitted handoff acceptance confirms owner by renewal and preserves submitted state and uncertain publication',async t=>{
  const f=await fixture(t);const config=JSON.parse(await fs.readFile(path.join(f.cwd,'.git/avanzar-team.json')));const claim=recoveredClaim(f,config);claim.status='submitted';f.board.claims=[claim];f.board.release={status:'uncertain',claimId:claim.id,generation:2,sha:f.baseSha};
  f.setHandler((req,res)=>{if(req.method==='GET')return res.end(JSON.stringify(f.board));if(req.url.endsWith('/resume')){res.writeHead(409);return res.end(JSON.stringify({error:{code:'CLAIM_SUBMITTED',message:'Submitted claims cannot resume'}}));}res.end(JSON.stringify({claim,revision:3}));});
  await f.run(['accept-handoff','--claim','claim-1','--generation','2','--mode','build']);
  assert.equal(f.requests.filter(r=>r.url.endsWith('/resume')).length,0);assert.equal(f.requests.filter(r=>r.url.endsWith('/renew')).length,1);assert.equal(f.board.claims[0].status,'submitted');assert.equal(f.board.release.status,'uncertain');
});

test('handoff acceptance denied by authenticated owner check cannot save target authority',async t=>{
  const f=await fixture(t);const config=JSON.parse(await fs.readFile(path.join(f.cwd,'.git/avanzar-team.json')));f.board.claims=[recoveredClaim(f,config)];
  f.setHandler((req,res)=>{if(req.method==='GET')return res.end(JSON.stringify(f.board));res.writeHead(403);res.end(JSON.stringify({error:{code:'OWNER_REQUIRED',message:'Different authenticated actor'}}));});
  await assert.rejects(f.run(['accept-handoff','--claim','claim-1','--generation','2']),e=>e.exitCode===1&&e.code==='OWNER_REQUIRED');
  const state=JSON.parse(await fs.readFile(path.join(f.cwd,'.git/avanzar-team-session.json')));assert.equal(state.claim,null);assert.equal(state.pending,null);
});

test('handoff acceptance requires the exact announced generation and refuses a different local claim',async t=>{
  const f=await fixture(t);const config=JSON.parse(await fs.readFile(path.join(f.cwd,'.git/avanzar-team.json')));f.board.claims=[recoveredClaim(f,config)];
  await assert.rejects(f.run(['accept-handoff','--claim','claim-1','--generation','3']),/generation|handoff/i);
  const file=path.join(f.cwd,'.git/avanzar-team-session.json');const state=JSON.parse(await fs.readFile(file));state.claim={id:'different-local-claim',generation:1};await fs.writeFile(file,JSON.stringify(state),{mode:0o600});
  await assert.rejects(f.run(['accept-handoff','--claim','claim-1','--generation','2']),/different|checkout|claim/i);assert.equal(f.requests.filter(r=>r.url.endsWith('/resume')).length,0);
});

test('auditing a merged delivery rejects Git without remerge-diff support clearly',async t=>{
  if(process.platform==='win32')return t.skip('POSIX executable wrapper fixture; production version gate is platform independent');
  const f=await parallelHistories(t);await f.integrate();
  const executable=execFileSync('sh',['-c','command -v git'],{encoding:'utf8'}).trim();const dir=await fs.mkdtemp(path.join(os.tmpdir(),'team-old-git-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  const quoted="'"+executable.replaceAll("'","'\\''")+"'";await fs.writeFile(path.join(dir,'git'),`#!/bin/sh\nif [ "$1" = "--version" ]; then printf 'git version 2.35.0\\n'; exit 0; fi\nexec ${quoted} "$@"\n`,{mode:0o700});
  const {changedPaths}=await load();const report=checkedHistory(f,()=>git(f.cwd,'rev-parse','publisher-a'))();
  assert.throws(()=>changedPaths(f.cwd,f.baseSha,{...f.env,PATH:dir+path.delimiter+process.env.PATH},{upstreamSha:report.remoteHead}),/Git 2\.36.*remerge-diff/i);
});

test('explicit handoff recovery can preserve divergent saved work until acquiring the provisional integration turn',async t=>{
  const f=await parallelHistories(t);const config=JSON.parse(await fs.readFile(path.join(f.cwd,'.git/avanzar-team.json')));f.board.claims=[recoveredClaim(f,config)];
  await f.run(['accept-handoff','--claim','claim-1','--generation','2']);f.board.claims[0].status='active';
  await f.run(['submit','--summary','Recovered provisional delivery']);f.board.claims[0].status='submitted';
  await f.run(['release','acquire','--sha',f.b]);await f.integrate();const final=git(f.cwd,'rev-parse','HEAD');
  await f.run(['submit','--summary','Recovered delivery integrated']);await f.run(['release','renew','--sha',final]);
  assert.equal(f.requests.find(r=>r.url==='/v1/claims/claim-1/resume').body.generation,2);
  assert.deepEqual(f.requests.filter(r=>r.url.endsWith('/submit')).map(r=>r.body.changedPaths),[['docs/plan.md'],['docs/plan.md']]);
  assert.equal(f.requests.find(r=>r.url==='/v1/release/renew').body.sha,final);
});

test('explicit handoff recovery cannot allow divergent work under a declared or privately frozen approval',async t=>{
  const f=await parallelHistories(t);const config=JSON.parse(await fs.readFile(path.join(f.cwd,'.git/avanzar-team.json')));f.board.claims=[recoveredClaim(f,config)];
  await assert.rejects(f.run(['accept-handoff','--claim','claim-1','--generation','2','--approved-sha',f.b]),/canonical|approved|integrat/i);
  const file=path.join(f.cwd,'.git/avanzar-team-session.json');const state=JSON.parse(await fs.readFile(file));state.approvedRelease={claimId:'claim-1',sha:f.b};await fs.writeFile(file,JSON.stringify(state),{mode:0o600});
  await assert.rejects(f.run(['accept-handoff','--claim','claim-1','--generation','2']),/canonical|approved|integrat/i);
  assert.equal(f.requests.filter(r=>r.url.endsWith('/resume')).length,0);
});

for(const oldCommand of ['renew','submit'])test(`explicit handoff acceptance archives revoked unknown ${oldCommand} without replaying its old generation`,async t=>{
  const f=await fixture(t);await f.run(['claim','--mode','build']);const config=JSON.parse(await fs.readFile(path.join(f.cwd,'.git/avanzar-team.json')));
  f.setHandler((req,res)=>{if(req.method==='GET')return res.end(JSON.stringify(f.board));req.socket.destroy();});
  const args=oldCommand==='submit'?['submit','--summary','Outcome remains unknown']:['renew'];await assert.rejects(f.run(args),/unknown|network/i);
  const file=path.join(f.cwd,'.git/avanzar-team-session.json');let state=JSON.parse(await fs.readFile(file));const oldOperationId=state.pending.body.operationId;
  f.board.claims=[recoveredClaim(f,config)];f.board.release={status:'uncertain',claimId:'claim-1',generation:2,sha:f.baseSha};
  f.setHandler((req,res)=>res.end(JSON.stringify(req.method==='GET'?f.board:{claim:f.board.claims[0],revision:3})));
  await f.run(['accept-handoff','--claim','claim-1','--generation','2']);state=JSON.parse(await fs.readFile(file));
  assert.equal(state.claim.generation,2);assert.equal(state.pending,null);assert.equal(state.supersededOperations[0].body.operationId,oldOperationId);assert.equal(state.supersededOperations[0].outcome,'unknown_revoked');
  assert.equal(f.requests.filter(r=>r.url===`/v1/claims/claim-1/${oldCommand}`).length,1);assert.equal(f.board.release.status,'uncertain');
});

test('explicit handoff does not clear global pending operations or unknown work belonging to another claim',async t=>{
  const f=await fixture(t);const config=JSON.parse(await fs.readFile(path.join(f.cwd,'.git/avanzar-team.json')));f.board.claims=[recoveredClaim(f,config)];const file=path.join(f.cwd,'.git/avanzar-team-session.json');
  for(const pending of [{command:'catalog',path:'/v1/catalog',body:{operationId:'global-op',expectedRevision:1,sha:f.baseSha}},{command:'renew',path:'/v1/claims/other-claim/renew',body:{operationId:'other-op',generation:1,sessionId:config.sessionId}}]) {
    const state=JSON.parse(await fs.readFile(file));state.pending=pending;await fs.writeFile(file,JSON.stringify(state),{mode:0o600});
    await assert.rejects(f.run(['accept-handoff','--claim','claim-1','--generation','2']),/unknown|pending|operation/i);
    const saved=JSON.parse(await fs.readFile(file));assert.deepEqual(saved.pending,pending);assert.equal(saved.claim,null);assert.equal(saved.supersededOperations,undefined);
  }
  assert.equal(f.requests.filter(r=>r.url.endsWith('/resume')).length,0);
});

test('approval declared during authenticated handoff acceptance remains frozen for the held turn',async t=>{
  const f=await fixture(t);const config=JSON.parse(await fs.readFile(path.join(f.cwd,'.git/avanzar-team.json')));f.board.claims=[recoveredClaim(f,config)];f.board.release={status:'held',claimId:'claim-1',generation:2,sha:f.baseSha};
  await f.run(['accept-handoff','--claim','claim-1','--generation','2','--approved-sha',f.baseSha]);
  const state=JSON.parse(await fs.readFile(path.join(f.cwd,'.git/avanzar-team-session.json')));assert.equal(state.approvedRelease?.sha,f.baseSha);
  await fs.writeFile(path.join(f.cwd,'docs/plan.md'),'changed after accepted approval');git(f.cwd,'add','.');git(f.cwd,'commit','-m','changed after approval');
  await assert.rejects(f.run(['submit','--summary','Still frozen']),/approved|frozen/i);
});

for(const targetActor of ['vps','hermes-1','hermes-2','operator@hermes/2'])test(`handoff accepts server-compatible semantic actor ${targetActor}`,async t=>{
  const f=await fixture(t);await f.run(['claim','--mode','plan']);
  await f.run(['handoff','--target-actor',targetActor,'--target-slot','hermes','--target-session-id','target-session','--target-checkout-id','target-checkout','--target-host-id','target-host','--evidence','Verified private transfer']);
  const handoff=f.requests.find(request=>request.url.endsWith('/handoff'));assert.equal(handoff.body.target.actorId,targetActor);
});

test('handoff actor validation matches server identifiers and rejects invalid target names before mutation',async t=>{
  const f=await fixture(t);await f.run(['claim','--mode','plan']);
  for(const targetActor of ['', 'bad actor','bad?actor','bad\nactor','x'.repeat(161)]){
    await assert.rejects(f.run(['handoff','--target-actor',targetActor,'--target-slot','hermes','--target-session-id','target-session','--target-checkout-id','target-checkout','--target-host-id','target-host','--evidence','Reviewed transfer']),error=>error.code==='usage');
  }
  assert.equal(f.requests.filter(request=>request.url.endsWith('/handoff')).length,0);
});

test('handoff accepts the server actor length limit without widening session identifiers',async t=>{
  const f=await fixture(t);await f.run(['claim','--mode','plan']);const targetActor='a'.repeat(160);
  await f.run(['handoff','--target-actor',targetActor,'--target-slot','hermes','--target-session-id','target-session','--target-checkout-id','target-checkout','--target-host-id','target-host','--evidence','Explicit transfer at identifier length boundary']);
  assert.equal(f.requests.find(request=>request.url.endsWith('/handoff')).body.target.actorId.length,160);
});

for(const [number,slot] of [[1,'vps'],[2,'hermes'],[3,'vscode'],[4,'codex-desktop']])test(`init list ${number} aliases the legacy slot without storing a second identity`,async t=>{
  const f=await fixture(t,{initialList:number});const configFile=path.join(f.cwd,'.git/avanzar-team.json');const first=JSON.parse(await fs.readFile(configFile));
  assert.equal(first.slot,slot);assert.equal(Object.hasOwn(first,'list'),false);
  await f.run(['init','--endpoint',f.endpoint,'--list',String(number)]);
  assert.deepEqual(JSON.parse(await fs.readFile(configFile)),first);
  assert.equal((await f.run(['status'])).local.list,number);
});

test('init and select-list reject invalid or ambiguous list choices without replacing private IDs',async t=>{
  const f=await fixture(t);const file=path.join(f.cwd,'.git/avanzar-team.json');const before=await fs.readFile(file,'utf8');
  for(const number of ['0','5','01','1.0','-1','word']){
    await assert.rejects(f.run(['init','--endpoint',f.endpoint,'--list',number]),error=>error.code==='usage');
    await assert.rejects(f.run(['select-list','--list',number]),error=>error.code==='usage');
  }
  for(const args of [['init','--endpoint',f.endpoint,'--slot','vps','--list','1'],['select-list','--list','2','--slot','hermes'],['select-list','--slot','hermes'],['select-list'],['select-list','extra','--list','2'],['claim','--list','2']])await assert.rejects(f.run(args),error=>error.code==='usage');
  assert.equal(await fs.readFile(file,'utf8'),before);
});

test('select-list changes only private preference after an online board read and never reserves work',async t=>{
  const f=await fixture(t);const file=path.join(f.cwd,'.git/avanzar-team.json');const stateFile=path.join(f.cwd,'.git/avanzar-team-session.json');const original=JSON.parse(await fs.readFile(file));const originalState=await fs.readFile(stateFile,'utf8');
  for(const [number,slot] of [[2,'hermes'],[3,'vscode'],[4,'codex-desktop'],[1,'vps']]){
    const beforeRequests=f.requests.length;const selected=await f.run(['select-list','--list',String(number)]);
    const changed=JSON.parse(await fs.readFile(file));assert.deepEqual(changed,{...original,slot});assert.equal(await fs.readFile(stateFile,'utf8'),originalState);
    assert.equal(selected.status,'list_selected');assert.equal(selected.list,number);assert.equal(selected.preferenceOnly,true);
    assert.equal(f.requests.length,beforeRequests+1);assert.equal(f.requests.at(-1).url,'/v1/board');assert.equal(f.requests.at(-1).body,null);
    assert.equal((await fs.stat(file)).mode&0o777,0o600);
  }
  assert.equal(f.requests.filter(request=>request.body).length,0);
});

for(const status of ['active','paused','stale','submitted'])test(`select-list rejects ${status} checkout work and preserves all private state`,async t=>{
  const f=await fixture(t);await f.run(['claim','--mode','plan']);f.board.claims[0].status=status;
  const configFile=path.join(f.cwd,'.git/avanzar-team.json'),stateFile=path.join(f.cwd,'.git/avanzar-team-session.json');const config=await fs.readFile(configFile,'utf8'),state=await fs.readFile(stateFile,'utf8');const requests=f.requests.length;
  await assert.rejects(f.run(['select-list','--list','2']),error=>error.code==='list_busy'&&error.exitCode===2);
  assert.equal(await fs.readFile(configFile,'utf8'),config);assert.equal(await fs.readFile(stateFile,'utf8'),state);assert.equal(f.requests.length,requests+1);assert.equal(f.requests.at(-1).body,null);
});

test('select-list detects a server reservation for the local checkout or session before local adoption',async t=>{
  const f=await fixture(t);const file=path.join(f.cwd,'.git/avanzar-team.json');const config=JSON.parse(await fs.readFile(file));
  for(const association of [{checkoutId:config.checkoutId,sessionId:'another-session'},{checkoutId:'another-checkout',sessionId:config.sessionId}]){
    f.board.claims=[{id:'not-locally-adopted',status:'active',slot:'vps',...association}];
    await assert.rejects(f.run(['select-list','--list','2']),error=>error.code==='list_busy');
  }
  assert.deepEqual(JSON.parse(await fs.readFile(file)),config);
});

test('select-list never treats a missing live local claim as confirmed closure',async t=>{
  const f=await fixture(t);await f.run(['claim','--mode','plan']);f.board.claims=[];
  const file=path.join(f.cwd,'.git/avanzar-team.json');const original=await fs.readFile(file,'utf8');
  await assert.rejects(f.run(['select-list','--list','2']),error=>error.code==='list_busy');assert.equal(await fs.readFile(file,'utf8'),original);
});

test('select-list refuses an unknown mutation after reading board and preserves its exact retry record',async t=>{
  const f=await fixture(t);f.setHandler((req,res)=>{if(req.method==='GET')return res.end(JSON.stringify(f.board));req.socket.destroy();});
  await assert.rejects(f.run(['claim','--mode','plan']),/unknown|network/i);
  const configFile=path.join(f.cwd,'.git/avanzar-team.json'),stateFile=path.join(f.cwd,'.git/avanzar-team-session.json');const config=await fs.readFile(configFile,'utf8'),state=await fs.readFile(stateFile,'utf8');const count=f.requests.length;
  await assert.rejects(f.run(['select-list','--list','2']),error=>error.code==='list_busy');
  assert.equal(f.requests.length,count+1);assert.equal(await fs.readFile(configFile,'utf8'),config);assert.equal(await fs.readFile(stateFile,'utf8'),state);
});

test('select-list refuses stored or environment approval and own unresolved publication turn',async t=>{
  const f=await fixture(t);const configFile=path.join(f.cwd,'.git/avanzar-team.json'),stateFile=path.join(f.cwd,'.git/avanzar-team-session.json');const config=JSON.parse(await fs.readFile(configFile));const state=JSON.parse(await fs.readFile(stateFile));
  const approved={...state,approvedRelease:{claimId:'old-delivery',sha:f.baseSha}};await fs.writeFile(stateFile,JSON.stringify(approved),{mode:0o600});
  await assert.rejects(f.run(['select-list','--list','2']),error=>error.code==='list_busy');assert.deepEqual(JSON.parse(await fs.readFile(stateFile)),approved);
  await fs.writeFile(stateFile,JSON.stringify(state),{mode:0o600});const {runCommand}=await load();
  await assert.rejects(runCommand(['select-list','--list','2'],{cwd:f.cwd,env:{...f.env,TALLER_SHA_APROBADO:f.baseSha},check:f.check}),error=>error.code==='list_busy');
  f.board.release={claimId:'old-delivery',sessionId:config.sessionId,status:'uncertain'};
  await assert.rejects(f.run(['select-list','--list','2']),error=>error.code==='list_busy');assert.deepEqual(JSON.parse(await fs.readFile(configFile)),config);
});

test('select-list preserves terminal history and is unaffected by another checkout publication turn',async t=>{
  const f=await fixture(t);await f.run(['claim','--mode','plan']);f.board.claims[0].status='completed';
  const stateFile=path.join(f.cwd,'.git/avanzar-team-session.json');const state=await fs.readFile(stateFile,'utf8');f.board.release={claimId:'other-delivery',sessionId:'other-session',status:'held'};
  const result=await f.run(['select-list','--list','4']);assert.equal(result.list,4);assert.equal(await fs.readFile(stateFile,'utf8'),state);
});

test('select-list fails closed offline or on malformed board without changing preference',async t=>{
  const f=await fixture(t);const file=path.join(f.cwd,'.git/avanzar-team.json');const original=await fs.readFile(file,'utf8');
  f.setHandler(req=>req.socket.destroy());await assert.rejects(f.run(['select-list','--list','2']),/network|unknown/i);assert.equal(await fs.readFile(file,'utf8'),original);
  f.setHandler((req,res)=>res.end(JSON.stringify({protocolVersion:9,revision:1,claims:[],units:[]})));await assert.rejects(f.run(['select-list','--list','2']),error=>error.code==='protocol');assert.equal(await fs.readFile(file,'utf8'),original);
});

test('choosing a list only changes future claim preference and never bypasses server slot permissions',async t=>{
  const f=await fixture(t);await f.run(['select-list','--list','3']);assert.equal(f.requests.filter(request=>request.body).length,0);
  f.setHandler((req,res,body)=>{if(req.method==='GET')return res.end(JSON.stringify(f.board));res.statusCode=403;res.end(JSON.stringify({error:{code:'SLOT_FORBIDDEN'}}));});
  await assert.rejects(f.run(['claim','--mode','plan']),error=>error.code==='SLOT_FORBIDDEN');
  assert.equal(f.requests.find(request=>request.url==='/v1/claims').body.slot,'vscode');
  const state=JSON.parse(await fs.readFile(path.join(f.cwd,'.git/avanzar-team-session.json')));assert.equal(state.claim,null);
});

test('a numbered preference is used by the next normal authenticated claim without changing session identifiers',async t=>{
  const f=await fixture(t);const file=path.join(f.cwd,'.git/avanzar-team.json');const original=JSON.parse(await fs.readFile(file));
  await f.run(['select-list','--list','4']);const result=await f.run(['claim','--mode','plan']);const sent=f.requests.find(request=>request.url==='/v1/claims').body;
  assert.equal(sent.slot,'codex-desktop');for(const key of ['sessionId','checkoutId','hostId'])assert.equal(sent[key],original[key]);
  assert.equal(result.claim.slot,'codex-desktop');assert.equal(f.requests.filter(request=>request.url==='/v1/claims').length,1);
});

test('selection cannot adopt or bypass the authenticated actor work in another checkout',async t=>{
  const f=await fixture(t);const configFile=path.join(f.cwd,'.git/avanzar-team.json');const before=JSON.parse(await fs.readFile(configFile));
  f.board.claims=[{id:'other-checkout-claim',unitId:'OTHER',actorId:'actor',slot:'hermes',status:'active',generation:1,sessionId:'other-session',checkoutId:'other-checkout'}];
  f.setHandler((req,res)=>{if(req.method==='GET')return res.end(JSON.stringify(f.board));res.statusCode=409;res.end(JSON.stringify({error:{code:'CHECKOUT_OCCUPIED'}}));});
  const selected=await f.run(['select-list','--list','3']);assert.equal(selected.preferenceOnly,true);assert.equal(f.requests.filter(request=>request.body).length,0);
  await assert.rejects(f.run(['claim','--mode','plan']),error=>error.code==='CHECKOUT_OCCUPIED');
  const state=JSON.parse(await fs.readFile(path.join(f.cwd,'.git/avanzar-team-session.json')));assert.equal(state.claim,null);assert.equal(f.board.claims.length,1);
  const after=JSON.parse(await fs.readFile(configFile));for(const key of ['sessionId','checkoutId','hostId'])assert.equal(after[key],before[key]);
});
