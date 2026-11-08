// Portable foreground client. Git deliberately resolves through the environment's wrappers.
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { hostname } from 'node:os';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkAvanzar } from './check-avanzar.mjs';
import { normalizeResource as normalizeCanonicalResource } from '../coordination/catalog.mjs';

const SLOTS = ['vps', 'hermes', 'vscode', 'codex-desktop'];
const ACTOR_ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,159}$/;
const SHA = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i;
const UUID = /^[a-zA-Z0-9_-]{1,100}$/;
export class TeamError extends Error {
  constructor(code, message, exitCode = 1) { super(message); this.name = 'TeamError'; this.code = code; this.exitCode = exitCode; }
}
const fail = (code, message, exitCode) => { throw new TeamError(code, message, exitCode); };

export function validateEndpoint(value) {
  let url; try { url = new URL(value); } catch { fail('configuration', 'Invalid endpoint configuration.'); }
  if (url.username || url.password || url.search || url.hash || !['', '/'].includes(url.pathname)
    || !(url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))) {
    fail('configuration', 'Endpoint requires HTTPS without credentials, query or path; HTTP only on loopback fixtures.');
  }
  return url.origin;
}

export function normalizeResource(input, mode = 'write') {
  if (typeof input !== 'string' || !['read', 'write'].includes(mode)) fail('scope', 'Invalid resource scope.');
  let p = input.replace(/^path:/, '').replaceAll('\\', '/').replace(/^(\.\/)+/, '');
  if (!p || p.startsWith('/') || /^[a-z]:/i.test(p) || /[\x00-\x1f\x7f]/.test(p)
    || p.split('/').some((part, i, parts) => part === '..' || part === '.' || (!part && i < parts.length - 1))
    || /[\s%*?\[\]:]/.test(p) || p.length > 295
    || p.split('/').some(part => part.toLowerCase() === '.git')) fail('scope', 'Invalid path scope; paths must stay inside the checkout.');
  return { key: `path:${p}`, mode };
}
function isDocument(p) {
  return /\.md$/i.test(p) && (!p.startsWith('.') || p.startsWith('.agents/skills/') || p.startsWith('.claude/commands/'));
}
export function assertScope(paths, claim) {
  for (const p of paths) {
    normalizeResource(p);
    if (claim.mode === 'plan' && !isDocument(p)) fail('plan_scope', 'Plan mode permits documents only; product code needs a reviewed build unit.', 2);
    const allowed = claim.resources.some(r => r.mode === 'write' && r.key.startsWith('path:')
      && (r.key.slice(5) === p || (r.key.endsWith('/') && p.startsWith(r.key.slice(5)))));
    if (!allowed) fail('out_of_scope', 'Changes are outside the claim write scope; preserve the checkout and resolve scope first.', 2);
  }
}
function git(cwd, args, env) {
  const result = spawnSync('git', args, {cwd, env: {...process.env, ...env, GIT_OPTIONAL_LOCKS:'0'}, encoding:'utf8', windowsHide:true, timeout:30_000, maxBuffer:16*1024*1024, stdio:['ignore','pipe','pipe']});
  if (result.error || result.status !== 0) fail('git', 'Git check failed; preserve the checkout.');
  return result.stdout;
}
async function checkout(cwd, env) {
  const root = await fs.realpath(git(cwd, ['rev-parse','--show-toplevel'], env).trim());
  const gitDir = await fs.realpath(git(root, ['rev-parse','--absolute-git-dir'], env).trim());
  return {root, gitDir, configFile:resolve(gitDir,'avanzar-team.json'), stateFile:resolve(gitDir,'avanzar-team-session.json')};
}
export function changedPaths(cwd, baseSha, env = {}, {upstreamSha} = {}) {
  if (!SHA.test(baseSha || '')) fail('configuration','A full base SHA is required.');
  git(cwd,['merge-base','--is-ancestor',baseSha,'HEAD'],env);
  let committed;
  if(upstreamSha) {
    validSha(upstreamSha);
    git(cwd,['merge-base','--is-ancestor',baseSha,upstreamSha],env);
    const commits=git(cwd,['rev-list','--topo-order','--parents','HEAD',`^${upstreamSha}`,`^${baseSha}`],env).trim().split('\n').filter(Boolean);
    committed=[];
    for(const line of commits) {
      const [sha,...parents]=line.split(' ');
      if(parents.length>2)fail('merge_audit','Octopus merge scope cannot be verified; preserve work and use a reviewed two-parent integration.',2);
      if(parents.length===2) {
        const version=git(cwd,['--version'],env).match(/(\d+)\.(\d+)/);
        if(!version || Number(version[1])<2 || (Number(version[1])===2 && Number(version[2])<36))fail('git_version','Auditing merged work requires Git 2.36 or later with --remerge-diff support.');
        committed.push(git(cwd,['show','--format=','--name-only','--no-renames','--remerge-diff','-z',sha,'--'],env));
      } else committed.push(git(cwd,['diff-tree','--root','--no-commit-id','--name-only','--no-renames','-r','-z',sha,'--'],env));
    }
  } else committed=[git(cwd,['diff','--name-only','--no-renames','-z',`${baseSha}..HEAD`],env)];
  const commands = [
    ['diff','--name-only','--no-renames','-z'],
    ['diff','--cached','--name-only','--no-renames','-z'],
    ['ls-files','--others','--exclude-standard','-z'],
  ];
  return [...new Set([...committed,...commands.map(args=>git(cwd,args,env))].flatMap(value=>value.split('\0').filter(Boolean)))].sort();
}
async function readPrivate(file, optional = false) {
  try {
    const stat = await fs.lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink() || (process.platform !== 'win32' && (stat.mode & 0o077))) fail('configuration','Private team configuration must be a regular file readable only by its owner.');
    return JSON.parse(await fs.readFile(file,'utf8'));
  } catch (e) { if (optional && e.code === 'ENOENT') return null; if(e instanceof TeamError) throw e; fail('configuration','Cannot read private team configuration.'); }
}
async function atomicPrivate(file, value) {
  // Never replace a symlink or follow one while writing private state.
  try { const stat=await fs.lstat(file); if(!stat.isFile() || stat.isSymbolicLink()) fail('configuration','Unsafe private state path.'); } catch(e) { if(e.code !== 'ENOENT') throw e; }
  const temp = `${file}.${randomUUID()}.tmp`;
  try { await fs.writeFile(temp, JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600}); await fs.rename(temp,file); }
  finally { await fs.unlink(temp).catch(()=>{}); }
}
async function lock(gitDir) {
  const file = resolve(gitDir,'avanzar-team.lock');
  for(let attempt=0;attempt<2;attempt++) {
    try { const handle=await fs.open(file,'wx',0o600); await handle.writeFile(JSON.stringify({pid:process.pid,host:hostname()})); await handle.close(); return async()=>{await fs.unlink(file);}; }
    catch(e) {
      if(e.code!=='EEXIST') fail('configuration','Cannot lock private team state.');
      const current=await readPrivate(file);
      if(current.host!==hostname() || !Number.isInteger(current.pid)) fail('checkout_busy','Shared checkout is busy; preserve its lock.',2);
      try {process.kill(current.pid,0);fail('checkout_busy','Another client is using this checkout.',2);} catch(probe) {if(probe.code!=='ESRCH') throw probe;}
      await fs.unlink(file);
    }
  }
  fail('checkout_busy','Private team state is busy.',2);
}
export function sanitize(value, env = {}) {
  const secrets=[env.CF_ACCESS_CLIENT_ID,env.CF_ACCESS_CLIENT_SECRET].filter(Boolean);
  if(typeof value === 'string') return secrets.reduce((s,secret)=>s.replaceAll(secret,'[redacted]'),value);
  if(Array.isArray(value)) return value.map(v=>sanitize(v,env));
  if(value && typeof value==='object') return Object.fromEntries(Object.entries(value).map(([k,v])=>[sanitize(k,env), /secret|password|authorization|cf.access.client|token/i.test(k)?'[redacted]':sanitize(v,env)]));
  return value;
}
async function request(config, path, body, env) {
  const id=env.CF_ACCESS_CLIENT_ID, secret=env.CF_ACCESS_CLIENT_SECRET;
  if(!id || !secret || /[\r\n]/.test(id+secret)) fail('credentials','Set CF_ACCESS_CLIENT_ID and CF_ACCESS_CLIENT_SECRET in the private environment.');
  let dispatcher;
  try {
    if (env.HTTPS_PROXY || env.HTTP_PROXY || env.https_proxy || env.http_proxy) {
      const {EnvHttpProxyAgent}=await import('undici');
      dispatcher=new EnvHttpProxyAgent({httpProxy:env.http_proxy??env.HTTP_PROXY??'',httpsProxy:env.https_proxy??env.HTTPS_PROXY??env.http_proxy??env.HTTP_PROXY??'',noProxy:env.no_proxy??env.NO_PROXY??''});
    }
  } catch {fail('proxy_configuration','Proxy transport unavailable; install project dependencies with npm ci.');}
  try {
    const response=await fetch(`${config.endpoint}${path}`, {method:body?'POST':'GET',headers:{'CF-Access-Client-Id':id,'CF-Access-Client-Secret':secret,'accept':'application/json',...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,redirect:'manual',signal:AbortSignal.timeout(30_000),...(dispatcher?{dispatcher}:{})});
    if(response.status>=300 && response.status<400) {await response.body?.cancel();fail('redirect','Endpoint redirect rejected; credentials were not forwarded.');}
    let raw='';const reader=response.body?.getReader();let bytes=0;const decoder=new TextDecoder();
    if(reader) while(true) {const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>2*1024*1024){await reader.cancel();fail('invalid_response','Coordinator response exceeds the size limit.');}raw+=decoder.decode(value,{stream:true});}
    raw+=decoder.decode();
    let data;try{data=JSON.parse(raw);}catch{fail('unknown_result','Coordinator returned an unknown result; retry the same command.');}
    if(!response.ok) {
      const code=/^[a-zA-Z0-9_-]{1,80}$/.test(data?.error?.code||'')?data.error.code:'remote_error';
      const err=new TeamError(sanitize(code,env),`Coordinator rejected the request (HTTP ${response.status}); inspect status and preserve local work.`,response.status===409?2:1);
      err.definitive=response.status<500;throw err;
    }
    return data;
  }catch(e){if(e instanceof TeamError)throw e;fail('network_unknown','Network failure or unknown result; no offline permission. Retry the same command.');}
  finally{if(dispatcher)await dispatcher.close();}
}
function options(argv) {
  const [command,...rest]=argv;const opts={},positionals=[];
  const permitted=['endpoint','slot','list','mode','task','path','read-path','write','read','resource','summary','claim','generation','target-actor','target-slot','target-session-id','target-checkout-id','target-host-id','evidence','unit','kind','reference','sha','approved-sha'];
  for(let i=0;i<rest.length;i++) {
    if(!rest[i].startsWith('--')) {positionals.push(rest[i]);continue;}
    const key=rest[i].slice(2);
    if(!permitted.includes(key) || !rest[i+1] || rest[i+1].startsWith('--')) fail('usage','Unknown option or missing value. Credentials are environment-only.');
    const value=rest[++i];
    if(['path','read-path','write','read','resource'].includes(key)) (opts[key]??=[]).push(value);
    else {if(key in opts)fail('usage','Duplicate command option.');opts[key]=value;}
  }
  return {command,opts,positionals};
}
const required=(value,label)=>{if(typeof value!=='string'||!value.trim()||value.length>4000)fail('usage',`Missing or invalid ${label}.`);return value;};
function slotFromList(value){if(typeof value!=='string'||! /^[1-4]$/.test(value))fail('usage','List must be exactly 1, 2, 3 or 4.');return SLOTS[Number(value)-1];}
function validSha(value){if(!SHA.test(value||''))fail('usage','A full Git SHA is required.');return value.toLowerCase();}
function inspect(root,env,check,{clean=false,approvedSha,allowDiverged=false}={}) {
  if(approvedSha && env.TALLER_SHA_APROBADO && approvedSha.toLowerCase()!==env.TALLER_SHA_APROBADO.toLowerCase())fail('approved_mismatch','Requested SHA differs from the approved frozen SHA.',2);
  const report=check({cwd:root,env,...(approvedSha?{approvedSha}:{})});
  if(report.exitCode===1)fail('unverified','GitHub synchronization is not verified; preserve local work.');
  const dirty=git(root,['status','--porcelain=v1','-z','--untracked-files=all'],env).length>0;
  if(clean && dirty)fail('dirty_checkout','A clean checkout is required; preserve dirty files.',2);
  if(report.branch!=='main'||!['equal','ahead',...(allowDiverged&&!approvedSha&&!env.TALLER_SHA_APROBADO?['diverged']:[])].includes(report.relation))fail('unverified','Checkout base must include verified canonical main; only an unapproved provisional delivery may await integration.',2);
  if(approvedSha && (git(root,['rev-parse','HEAD'],env).trim().toLowerCase()!==approvedSha.toLowerCase() || git(root,['rev-parse','refs/heads/main'],env).trim().toLowerCase()!==approvedSha.toLowerCase() || dirty))fail('approved_mismatch','HEAD and main must equal the supplied SHA in a clean checkout; an approved SHA remains frozen.',2);
  if(approvedSha && report.exitCode!==0)fail('approved_mismatch','Approved SHA preflight failed; preserve the commit.',2);
  return {...report,dirty};
}
async function safeScope(root, resource) {
  let p=resolve(root,resource.key.slice(5));
  while(true) {
    try {const real=await fs.realpath(p);const rel=relative(root,real);if(rel==='..'||rel.startsWith(`..${sep}`)||isAbsolute(rel))fail('scope','Scope follows a path outside the checkout.',2);return;}
    catch(e){if(e.code!=='ENOENT')throw e;const parent=dirname(p);if(parent===p)throw e;p=parent;}
  }
}

export async function runCommand(argv, {cwd=process.cwd(),env=process.env,check=checkAvanzar}={}) {
  const {command,opts,positionals}=options(argv);
  if(!['init','select-list','status','claim','renew','watch','scope','pause','resume','handoff','accept-handoff','submit','abandon','complete','evidence','catalog','release'].includes(command))fail('usage','Usage: node scripts/avanzar-team.mjs init|select-list|status|claim|renew|watch|scope|pause|resume|handoff|accept-handoff|submit|abandon|complete|evidence|catalog|release');
  if(Object.hasOwn(opts,'slot')&&Object.hasOwn(opts,'list'))fail('usage','Choose either --list or legacy --slot, never both.');
  if(Object.hasOwn(opts,'list')&&!['init','select-list'].includes(command))fail('usage','Choose a list with init or select-list before requesting work.');
  if(command==='select-list'&&(positionals.length||Object.keys(opts).some(key=>key!=='list')))fail('usage','Usage: select-list --list 1|2|3|4.');
  const requestedSlot=command==='init'?(Object.hasOwn(opts,'list')?slotFromList(opts.list):opts.slot):command==='select-list'?slotFromList(opts.list):undefined;
  if(command==='watch') {
    if(positionals.length||Object.keys(opts).length)fail('usage','Usage: watch (foreground; renew every 60 seconds).');
    const abort=new AbortController();const stop=()=>abort.abort();process.once('SIGINT',stop);process.once('SIGTERM',stop);
    try {while(!abort.signal.aborted){const result=await runCommand(['renew'],{cwd,env,check});process.stdout.write(JSON.stringify(result)+'\n');await new Promise(r=>{if(abort.signal.aborted)return r();const timer=setTimeout(done,60_000);function done(){clearTimeout(timer);abort.signal.removeEventListener('abort',done);r();}abort.signal.addEventListener('abort',done,{once:true});});}return {status:'watch_stopped'};}
    finally{process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);}
  }
  const repo=await checkout(cwd,env);const unlock=await lock(repo.gitDir);
  try {
    let config=await readPrivate(repo.configFile,true);let state=await readPrivate(repo.stateFile,true);
    if(command==='init') {
      const endpoint=validateEndpoint(required(opts.endpoint,'endpoint'));if(!SLOTS.includes(requestedSlot))fail('usage','Choose --list 1|2|3|4 or a valid legacy --slot.');
      const initial=inspect(repo.root,env,check,{clean:true});
      if(!config && initial.relation!=='equal')fail('pending_work','Initialize a clean canonical checkout; preserve pending commits first.',2);
      if(config) {
        if(config.endpoint!==endpoint||config.slot!==requestedSlot||state?.root!==repo.root)fail('configuration','Existing checkout configuration differs; preserve its session and slot.',2);
        return sanitize({status:'initialized',list:SLOTS.indexOf(config.slot)+1,config},env);
      }
      const hostId=createHash('sha256').update(`${process.platform}:${hostname().toLowerCase()}`).digest('hex').slice(0,32);
      config={endpoint,slot:requestedSlot,sessionId:randomUUID(),hostId,checkoutId:randomUUID()};
      state={version:1,root:repo.root,claim:null,pending:null};await atomicPrivate(repo.stateFile,state);await atomicPrivate(repo.configFile,config);
      return sanitize({status:'initialized',list:SLOTS.indexOf(config.slot)+1,config},env);
    }
    if(!config||!state||state.root!==repo.root||state.version!==1)fail('configuration','Initialize this checkout; copied or shared configuration cannot be adopted.');
    validateEndpoint(config.endpoint);
    if(!SLOTS.includes(config.slot)||!['sessionId','checkoutId','hostId'].every(k=>UUID.test(config[k]||'')))fail('configuration','Invalid private session configuration.');
    const board=await request(config,'/v1/board',null,env);
    if(board.protocolVersion!==1||!Number.isSafeInteger(board.revision)||!Array.isArray(board.claims)||!Array.isArray(board.units))fail('protocol','Unsupported or malformed coordinator board.');
    if(command==='status')return sanitize({...board,local:{list:SLOTS.indexOf(config.slot)+1,slot:config.slot,sessionId:config.sessionId,checkoutId:config.checkoutId,claim:state.claim,pending:state.pending?{command:state.pending.command,operationId:state.pending.body.operationId}:null}},env);
    if(command==='select-list') {
      if(board.claims.some(claim=>!claim||typeof claim.id!=='string'||typeof claim.status!=='string')||(board.release!==null&&board.release!==undefined&&(typeof board.release!=='object'||Array.isArray(board.release))))fail('protocol','Cannot verify local work from this coordinator board.');
      const terminal=claim=>['completed','abandoned','handed_off'].includes(claim.status);
      const associated=board.claims.filter(claim=>claim.id===state.claim?.id||claim.sessionId===config.sessionId||claim.checkoutId===config.checkoutId);
      const unconfirmedLocal=state.claim&&!terminal(state.claim)&&!board.claims.some(claim=>claim.id===state.claim.id&&terminal(claim));
      const ownRelease=board.release&&(board.release.sessionId===config.sessionId||board.release.checkoutId===config.checkoutId||board.release.claimId===state.claim?.id||associated.some(claim=>claim.id===board.release.claimId));
      if(state.pending||state.approvedRelease||env.TALLER_SHA_APROBADO||env.TALLER_PUSH_APROBADO==='1'||env.TALLER_MIGRACION_APROBADA==='1'||associated.some(claim=>!terminal(claim))||unconfirmedLocal||ownRelease)fail('list_busy','Preserve the current claim, operation, approval or publication turn before selecting another list.',2);
      const selected={...config,slot:requestedSlot};
      if(config.slot!==requestedSlot)await atomicPrivate(repo.configFile,selected);
      return sanitize({status:'list_selected',list:SLOTS.indexOf(requestedSlot)+1,preferenceOnly:true,config:selected,revision:board.revision,catalogSha:board.catalogSha},env);
    }
    const semantic=JSON.stringify({command,opts:Object.fromEntries(Object.entries(opts).sort(([a],[b])=>a.localeCompare(b))),positionals});
    const explicitHandoff=command==='handoff' && opts.claim;
    if(explicitHandoff && (!UUID.test(opts.claim)||!/^\d+$/.test(opts.generation||'')||!Number.isSafeInteger(Number(opts.generation))))fail('usage','Explicit coordinator handoff requires --claim and --generation.');
    const acceptingHandoff=command==='accept-handoff';
    if(acceptingHandoff && (!UUID.test(opts.claim||'')||!/^\d+$/.test(opts.generation||'')||!Number.isSafeInteger(Number(opts.generation))||Number(opts.generation)<2))fail('usage','Explicit handoff acceptance requires --claim and --generation greater than one.');
    const current=explicitHandoff||acceptingHandoff?board.claims.find(c=>c.id===opts.claim):state.claim?board.claims.find(c=>c.id===state.claim.id):null;
    let acceptedApproval=null;
    const pendingHandoff=state.pending;
    if(command==='handoff' && pendingHandoff?.command===semantic && pendingHandoff.path===`/v1/claims/${encodeURIComponent(current?.id)}/handoff`) {
      const target=pendingHandoff.body.target;
      if(target && current.generation===pendingHandoff.body.generation+1 && ['actorId','slot','sessionId','checkoutId','hostId'].every(k=>current[k]===target[k])) {
        if(state.claim?.id===current.id)state.claim=null;
        state.pending=null;await atomicPrivate(repo.stateFile,state);
        return sanitize({status:'handoff_reconciled',claimId:current.id,generation:current.generation,revision:board.revision,catalogRevision:board.revision,catalogSha:board.catalogSha},env);
      }
    }
    const assertCurrent=()=>{
      if(explicitHandoff){if(!current||current.generation!==Number(opts.generation))fail('generation_revoked','Explicit source generation is no longer current.',2);return current;}
      if(!state.claim||!current)fail('no_claim','This checkout has no current claim; use status and claim first.',2);
      if(current.generation!==state.claim.generation||current.sessionId!==config.sessionId||current.checkoutId!==config.checkoutId||current.slot!==config.slot)fail('generation_revoked','Claim generation or ownership was revoked; do not adopt another generation.',2);
      if(['abandoned','completed','handed_off'].includes(current.status) && state.pending?.command!==semantic)fail('claim_closed','Claim is closed.',2);
      return current;
    };
    async function mutate(path,body) {
      if(state.pending && (state.pending.command!==semantic||state.pending.path!==path))fail('pending_operation','An operation has an unknown result. Retry that exact command before starting another mutation.',2);
      if(!state.pending){state.pending={command:semantic,path,body:{...body,operationId:randomUUID()}};await atomicPrivate(repo.stateFile,state);}
      let result;
      try{result=await request(config,path,state.pending.body,env);}catch(e){if(e.definitive){state.pending=null;await atomicPrivate(repo.stateFile,state);}throw e;}
      if(!Number.isSafeInteger(result?.revision) || ((path.startsWith('/v1/claims')) && !result.claim))fail('unknown_result','Invalid coordinator success response; retry the same command.');
      if(path.startsWith('/v1/release/') && (!Object.hasOwn(result,'release') || (result.release!==null && !['held','uncertain','synchronization_pending'].includes(result.release?.status))))fail('unknown_result','Invalid release response; retry the same command.');
      if(result.claim && command!=='handoff') {
        if(!UUID.test(result.claim.id||'')||!Number.isSafeInteger(result.claim.generation)||result.claim.sessionId!==config.sessionId||result.claim.checkoutId!==config.checkoutId||result.claim.slot!==config.slot)fail('unknown_result','Invalid claim response; retry the same command.');
        if(acceptingHandoff && (result.claim.id!==current.id||result.claim.generation!==current.generation||result.claim.actorId!==current.actorId||result.claim.hostId!==config.hostId))fail('generation_revoked','Handoff resume returned a different target; preserve local work.',2);
        if(!acceptingHandoff && state.claim && result.claim.id===state.claim.id && result.claim.generation!==state.claim.generation)fail('generation_revoked','Unexpected claim generation; preserve local work.',2);
        state.claim={id:result.claim.id,generation:result.claim.generation};
      }
      if(['abandon','complete'].includes(command) || (command==='handoff' && state.claim?.id===current?.id))state.claim=null;
      if(command==='release' && positionals[0]==='finish' && ['published','cancelled'].includes(positionals[1]) && result.release===null && !result.synchronizationPending)state.approvedRelease=null;
      if(command==='release' && ['acquire','renew'].includes(positionals[0]) && explicitApproval && result.release?.status==='held' && result.release.claimId===current.id && result.release.sha===explicitApproval.toLowerCase())state.approvedRelease={claimId:current.id,sha:explicitApproval.toLowerCase()};
      if(acceptingHandoff && acceptedApproval && board.release?.claimId===current.id && board.release.status==='held')state.approvedRelease={claimId:current.id,sha:acceptedApproval.toLowerCase()};
      state.pending=null;await atomicPrivate(repo.stateFile,state);return sanitize({...result,catalogRevision:board.revision,catalogSha:board.catalogSha},env);
    }
    if(command==='claim') {
      const mode=opts.mode||'plan';if(!['plan','build'].includes(mode))fail('usage','Mode must be plan or build.');
      const report=inspect(repo.root,env,check,{clean:!state.claim});
      if(state.claim) {assertCurrent();assertScope(changedPaths(repo.root,current.baseSha,env,{upstreamSha:report.remoteHead}),current);}
      if(!state.claim&&report.relation!=='equal')fail('pending_work','Fresh claims require main equal to canonical main; identify pending commits first.',2);
      return await mutate('/v1/claims',{expectedRevision:board.revision,slot:config.slot,sessionId:config.sessionId,checkoutId:config.checkoutId,hostId:config.hostId,...(opts.task?{taskId:opts.task}:{}),mode,baseSha:report.head});
    }
    if(command==='catalog')return await mutate('/v1/catalog',{expectedRevision:board.revision,sha:validSha(opts.sha)});
    if(command==='evidence') {
      if(!['design','integrated','research_accepted','activated','decision'].includes(opts.kind))fail('usage','Invalid evidence kind.');
      return await mutate('/v1/evidence',{expectedRevision:board.revision,unitId:required(opts.unit,'unit'),kind:opts.kind,reference:required(opts.reference,'reference'),...(opts.sha?{sha:validSha(opts.sha)}:{})});
    }
    if(acceptingHandoff) {
      const target=current?.handoffs?.at(-1)?.to;
      if(!current || current.generation!==Number(opts.generation) || !target || !['actorId','slot','sessionId','checkoutId','hostId'].every(k=>current[k]===target[k]) || !['slot','sessionId','checkoutId','hostId'].every(k=>current[k]===config[k]))fail('handoff_target','Handoff target provenance, generation or checkout does not match this destination.',2);
      if(state.claim && state.claim.id!==current.id)fail('checkout_busy','A different local claim must be resolved before accepting this handoff.',2);
      if(!['paused','active','submitted'].includes(current.status))fail('handoff_target','The handoff claim is not resumable.',2);
      const storedApproval=state.approvedRelease?.claimId===current.id?state.approvedRelease.sha:null;
      const declaredApproval=opts['approved-sha']||env.TALLER_SHA_APROBADO;
      if(storedApproval && declaredApproval && storedApproval.toLowerCase()!==declaredApproval.toLowerCase())fail('approved_mismatch','The recovered turn already has a frozen approved SHA.',2);
      const approved=storedApproval||declaredApproval;
      const report=inspect(repo.root,env,check,approved?{approvedSha:validSha(approved)}:{allowDiverged:true});
      acceptedApproval=approved;
      assertScope(changedPaths(repo.root,current.baseSha,env,{upstreamSha:report.remoteHead}),current);
      if(opts.mode && !['plan','build'].includes(opts.mode))fail('usage','Mode must be plan or build.');
      const submitted=current.status==='submitted';
      if(submitted && opts.mode && opts.mode!==current.mode)fail('handoff_target','Submitted handoff mode cannot change; preserve the submitted delivery.',2);
      const pending=state.pending;
      const sameClaimOperation=pending && (pending.path.startsWith(`/v1/claims/${encodeURIComponent(current.id)}/`) || (pending.path.startsWith('/v1/release/') && pending.body.claimId===current.id));
      if(sameClaimOperation && Number.isSafeInteger(pending.body.generation) && pending.body.generation>0 && pending.body.generation<current.generation) {
        state.supersededOperations=[...(state.supersededOperations||[]),{...pending,outcome:'unknown_revoked',supersededByGeneration:current.generation,archivedAt:new Date().toISOString()}];
        state.pending=null;await atomicPrivate(repo.stateFile,state);
      }
      return await mutate(`/v1/claims/${encodeURIComponent(current.id)}/${submitted?'renew':'resume'}`,{generation:current.generation,sessionId:config.sessionId,...(!submitted&&opts.mode?{mode:opts.mode}:{})});
    }
    assertCurrent();
    const base={generation:current.generation,sessionId:explicitHandoff?current.sessionId:config.sessionId};
    const explicitApproval=opts['approved-sha']||env.TALLER_SHA_APROBADO;
    if(opts['approved-sha'] && env.TALLER_SHA_APROBADO && opts['approved-sha'].toLowerCase()!==env.TALLER_SHA_APROBADO.toLowerCase())fail('approved_mismatch','Explicit and environment approved SHA differ.',2);
    if(explicitApproval)validSha(explicitApproval);
    const storedApproval=state.approvedRelease?.claimId===current.id?state.approvedRelease.sha:null;
    if(storedApproval && explicitApproval && storedApproval.toLowerCase()!==explicitApproval.toLowerCase())fail('approved_mismatch','The held turn already has a frozen approved SHA.',2);
    const approvedSha=storedApproval||explicitApproval;
    async function freezeApproval() {
      if(!approvedSha)return;
      inspect(repo.root,env,check,{clean:true,approvedSha});
      if(explicitApproval && board.release?.claimId===current.id && board.release.status==='held') {
        state.approvedRelease={claimId:current.id,sha:approvedSha.toLowerCase()};await atomicPrivate(repo.stateFile,state);
      }
    }
    if(command==='release') {
      const action=positionals[0];if(!['acquire','renew','finish'].includes(action)||positionals.length>2)fail('usage','Usage: release acquire|renew|finish [published|uncertain|cancelled] --sha SHA [--evidence reference]');
      if(action==='finish' && positionals[1]==='cancelled' && ['uncertain','synchronization_pending'].includes(board.release?.status))fail('release_uncertain','An uncertain publication must be reconciled, not cancelled.',2);
      const sha=validSha(opts.sha||(action==='renew'?board.release?.sha:null)||git(repo.root,['rev-parse','HEAD'],env).trim());
      if(approvedSha && sha.toLowerCase()!==approvedSha.toLowerCase())fail('approved_mismatch','Release SHA differs from the approved frozen SHA.',2);
      if(action==='renew' && opts.sha && board.release?.sha && board.release.sha!==sha && board.release.status!=='held')fail('release_uncertain','A release with an uncertain result must be reconciled before changing SHA.',2);
      if(action==='acquire' || (action==='renew' && opts.sha)) {
        if(current.status!=='submitted')fail('not_submitted','Release acquire requires a submitted claim.',2);
        const provisional=action==='acquire'&&!approvedSha;
        const report=inspect(repo.root,env,check,{clean:true,...(provisional?{allowDiverged:true}:{approvedSha:sha})});
        if(provisional && (git(repo.root,['rev-parse','HEAD'],env).trim()!==sha || git(repo.root,['rev-parse','refs/heads/main'],env).trim()!==sha))fail('sha_mismatch','Provisional SHA must equal current HEAD and main.',2);
        assertScope(changedPaths(repo.root,current.baseSha,env,{upstreamSha:report.remoteHead}),current);
      }
      if(approvedSha && (action!=='finish' || positionals[1]==='published'))await freezeApproval();
      const body={...base,claimId:current.id,...(action!=='renew'||opts.sha?{sha}:{})};
      if(action==='finish') {body.outcome=positionals[1];if(!['published','uncertain','cancelled'].includes(body.outcome))fail('usage','Release finish requires published, uncertain or cancelled.');body.evidence=required(opts.evidence,'release evidence');}
      return await mutate(`/v1/release/${action}`,body);
    }
    const body={...base};
    if(command==='scope') {
      const resources=[...[...(opts.path||[]),...(opts.write||[])].map(p=>normalizeResource(p)),...[...(opts['read-path']||[]),...(opts.read||[])].map(p=>normalizeResource(p,'read'))];
      for(const key of opts.resource||[]) {try{resources.push(normalizeCanonicalResource({key,mode:'write'}));}catch{fail('scope','Invalid logical resource scope.');}}
      if(!resources.length)fail('usage','Scope requires --path/--write, --read-path/--read or --resource.');
      for(const r of resources){if(r.key.startsWith('path:'))await safeScope(repo.root,r);}body.resources=resources;
    }
    if(command==='resume') {
      const report=inspect(repo.root,env,check);assertScope(changedPaths(repo.root,current.baseSha,env,{upstreamSha:report.remoteHead}),current);
      if(opts.mode){if(!['plan','build'].includes(opts.mode))fail('usage','Mode must be plan or build.');body.mode=opts.mode;}
      if(!report.head)fail('git','Cannot verify resume state.');
    }
    if(command==='pause') {body.evidence=required(opts.evidence,'pause evidence');body.pendingWork=changedPaths(repo.root,current.baseSha,env).length>0 || git(repo.root,['rev-parse','HEAD'],env).trim()!==current.baseSha;}
    if(command==='handoff'){
      body.target={actorId:required(opts['target-actor'],'target actor'),slot:required(opts['target-slot'],'target slot'),sessionId:required(opts['target-session-id'],'target session'),checkoutId:required(opts['target-checkout-id'],'target checkout'),hostId:required(opts['target-host-id'],'target host')};
      if(!SLOTS.includes(body.target.slot)||!ACTOR_ID.test(body.target.actorId)||!['sessionId','checkoutId','hostId'].every(k=>UUID.test(body.target[k])))fail('usage','Invalid target identity.');
      body.evidence=required(opts.evidence,'handoff evidence');
    }
    if(command==='submit') {
      await freezeApproval();
      const report=inspect(repo.root,env,check,{allowDiverged:!approvedSha});const paths=changedPaths(repo.root,current.baseSha,env,{upstreamSha:report.remoteHead});assertScope(paths,current);
      body.headSha=git(repo.root,['rev-parse','HEAD'],env).trim();body.changedPaths=paths;body.evidence=required(opts.summary,'evidence summary');
    }
    if(command==='abandon') {if(changedPaths(repo.root,current.baseSha,env).length || git(repo.root,['rev-parse','HEAD'],env).trim()!==current.baseSha)fail('pending_work','Cannot abandon pending committed or dirty work; preserve it and submit or hand off.',2);body.clean=true;}
    return await mutate(`/v1/claims/${encodeURIComponent(current.id)}/${command}`,body);
  }finally{await unlock();}
}

async function main() {
  try {const result=await runCommand(process.argv.slice(2));console.log(JSON.stringify(sanitize(result,process.env),null,2));}
  catch(e){console.log(JSON.stringify(sanitize({error:{code:e instanceof TeamError?e.code:'client_error',message:e instanceof TeamError?e.message:'Client failed; preserve local work and inspect configuration.'}},process.env)));process.exitCode=e instanceof TeamError?e.exitCode:1;}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
