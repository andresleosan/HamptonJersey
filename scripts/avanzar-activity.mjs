// Lightweight progress journal. Historical claims and their session files are never mutated.
import {randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
const SLOTS=['vps','hermes','vscode','codex-desktop'];
const TERMINAL=new Set(['planned','published']);
export async function runActivity(argv,deps) {
  const {cwd,env,check,checkout,readPrivate,atomicPrivate,lock,validateEndpoint,TeamError,inspect,request}=deps;
  const fail=(code,message,exitCode=2)=>{throw new TeamError(code,message,exitCode);};
  const [action,...rest]=argv,opts={};
  const allowed={list:[],start:['task','mode','list','tool'],update:['status','milestone','next','reference','sha'],
    'offer-handoff':['target-actor','target-list'],'accept-handoff':['id','tool']}[action];
  if(!allowed)fail('usage','Usage: activity list|start|update|offer-handoff|accept-handoff.');
  for(let i=0;i<rest.length;i+=2){const key=rest[i].replace(/^--/,'');if(!rest[i].startsWith('--')||!allowed.includes(key)||!rest[i+1]||rest[i+1].startsWith('--')||key in opts)fail('usage','Invalid activity options; credentials remain environment-only.');opts[key]=rest[i+1];}
  const repo=await checkout(cwd,env),unlock=await lock(repo.gitDir);
  try{
    const config=await readPrivate(repo.configFile,true);
    const endpoint=env.TEAM_ENDPOINT||config?.endpoint;
    if(!endpoint)fail('activity_unavailable','Shared activity is not configured. Preserve work; construction exclusivity is unverified.');
    const remote={endpoint:validateEndpoint(endpoint)},file=resolve(repo.gitDir,'avanzar-activity-session.json');
    let state=await readPrivate(file,true);
    if(state&&(state.version!==1||state.root!==repo.root||typeof state.sessionId!=='string'))fail('activity_configuration','Activity journal belongs to another checkout; preserve it.');
    state??={version:1,root:repo.root,sessionId:randomUUID(),current:null,pending:null};
    if(action==='list'){
      const result=await request(remote,'/v1/activity'+(state.pending?'?operation='+encodeURIComponent(state.pending.body.operationId):''),null,env);
      if(!Array.isArray(result.records)||!Number.isSafeInteger(result.revision))fail('activity_protocol','Shared activity response is incompatible.');
      if(state.pending&&result.operation?.action===state.pending.action&&JSON.stringify(result.operation.body)===JSON.stringify(state.pending.body)){
        const committed=result.records.find(r=>r.id===result.operation.recordId);
        if(committed){state.current=committed.sessionId===state.sessionId?committed:null;state.pending=null;await atomicPrivate(file,state);}
      }
      if(state.current&&!state.pending){
        const current=result.records.find(r=>r.id===state.current.id);
        if(current){state.current=current.sessionId===state.sessionId?current:null;await atomicPrivate(file,state);}
      }
      return {...result,local:{current:state.current,pending:state.pending?{action:state.pending.action,operationId:state.pending.body.operationId}:null}};
    }
    const semantic=JSON.stringify({action,opts:Object.fromEntries(Object.entries(opts).sort(([a],[b])=>a.localeCompare(b)))});
    if(state.pending&&state.pending.semantic!==semantic)fail('activity_pending','An earlier activity request has an unknown result. Retry the same command before starting other work.');
    const retrying=Boolean(state.pending);let body=state.pending?.body;
    if(!body){
      body={operationId:randomUUID(),sessionId:state.sessionId};
      if(action==='start'){
        if(state.current&&!TERMINAL.has(state.current.status))fail('local_activity_active','This checkout already has unfinished activity. Update it or hand it off before starting another task.');
        if(!opts.task||!['plan','build'].includes(opts.mode))fail('usage','Activity start requires --task CODE and --mode plan|build.');
        const slot=opts.list&&/^[1-4]$/.test(opts.list)?SLOTS[Number(opts.list)-1]:opts.list?null:config?.slot;
        if(!SLOTS.includes(slot))fail('usage','Choose --list 1|2|3|4.');
        inspect(repo.root,env,check);
        Object.assign(body,{task:opts.task,mode:opts.mode,slot,tool:opts.tool||env.AVANZAR_TOOL||'codex'});
      }else if(action==='accept-handoff'){
        if(!opts.id)fail('usage','Accept the offered handoff with --id ID.');
        if(state.current&&!TERMINAL.has(state.current.status))fail('local_activity_active','Preserve this checkout activity before accepting another delivery.');
        inspect(repo.root,env,check);
        const board=await request(remote,'/v1/activity',null,env),record=board.records?.find(r=>r.id===opts.id);
        if(!record)fail('activity_not_found','Offered activity was not found.');
        Object.assign(body,{id:record.id,version:record.version,tool:opts.tool||env.AVANZAR_TOOL||'codex'});
      }else{
        if(!state.current)fail('activity_missing','Start activity or accept an explicit handoff in this checkout.');
        Object.assign(body,{id:state.current.id,version:state.current.version});
        if(action==='update'){
          for(const key of ['status','milestone','next'])if(!opts[key])fail('usage','Update requires --status, --milestone and --next.');
          Object.assign(body,opts);
        }else{
          if(!opts['target-actor']||!/^[1-4]$/.test(opts['target-list']||''))fail('usage','Offer requires --target-actor ID and --target-list 1|2|3|4.');
          body.target={actorId:opts['target-actor'],slot:SLOTS[Number(opts['target-list'])-1]};
        }
      }
      state.pending={semantic,action,body};await atomicPrivate(file,state);
    }
    let result;
    try{result=await request(remote,`/v1/activity/${action}`,body,env);}
    catch(error){if(error.definitive&&!retrying){state.pending=null;await atomicPrivate(file,state);}throw error;}
    if(!result?.record||result.record.sessionId!==state.sessionId||!Number.isSafeInteger(result.record.version))fail('activity_protocol','Unknown activity result. Preserve the journal and retry the same command.');
    state.current=result.record;state.pending=null;await atomicPrivate(file,state);
    return {...result,buildAuthorized:false,exclusiveConstruction:result.record.mode==='build'&&!TERMINAL.has(result.record.status),
      message:result.record.mode==='plan'?'Planning only; no construction reserved.':'Activity recorded; publication and migration still require authorization.'};
  }finally{await unlock();}
}
