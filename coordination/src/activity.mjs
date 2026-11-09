import packages from '../../docs/roadmap/paquetes.json' with {type:'json'};
import {allowFields,fail,gitSha,identifier} from './errors.mjs';

export const MILESTONES={plan:'Plan preparado',implementation:'Implementación',tests:'Pruebas',review:'Revisión',release:'Publicación',verification:'Comprobación'};
export const NEXT_STEPS={review:'Revisar la entrega',build:'Construir el plan',validate:'Completar comprobaciones',publish:'Publicar con autorización',dependency:'Resolver dependencia',decision:'Decisión pendiente',access:'Acceso pendiente',resume:'Retomar el trabajo',done:'Tramo terminado'};
const TOOLS={codex:'Codex',hermes1:'Hermes 1',hermes2:'Hermes 2',other:'Equipo'};
const SLOTS=['vps','hermes','vscode','codex-desktop'];
const ACTIVE=new Set(['active','paused','review','built']);
const packageByTask=new Map(packages.packages.flatMap(p=>p.stages.flatMap(s=>s.tasks.map(t=>[t,p.id]))));
const canonical=value=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
export const emptyActivity=()=>({revision:0,records:[],operations:[]});
export function activityReference(value) {
  if(typeof value!=='string'||value.length>300)fail(400,'INVALID_REFERENCE','Use a public project document or commit reference.');
  if(/^https:\/\/github\.com\/andresleosan\/HamptonJersey\/commit\/[a-f0-9]{40}$/.test(value))return value;
  if(!/^docs\/(?:superpowers\/(?:plans|specs)|roadmap\/work\/[A-Z0-9]+-\d+)\/[A-Za-z0-9_/-]+\.md$/.test(value)||value.split('/').some(v=>v==='..'||v==='.'||!v))fail(400,'INVALID_REFERENCE','Use an allowed versioned public document.');
  return value;
}
function team(tool,actorId) {
  // Stable pseudonym distinguishes identities without publishing private actor names.
  let hash=2166136261;for(const c of actorId)hash=Math.imul(hash^c.charCodeAt(0),16777619);
  return `${TOOLS[tool]} · ${(hash>>>0).toString(16).padStart(8,'0')}`;
}
export function publicActivities(records) {
  return records.map(r=>({task:r.task,packageId:r.packageId,mode:r.mode,status:r.status,team:r.team,list:SLOTS.indexOf(r.slot)+1,
    milestone:r.milestone,next:r.next,reference:r.reference,sha:r.sha,updatedAt:r.updatedAt,basedOn:r.basedOn||null}));
}
export function applyActivity(state,actor,action,body,catalog,prepared={},now=Date.now()) {
  if(!actor||!['executor','coordinator'].includes(actor.role))fail(403,'READ_ONLY','An existing executor identity is required.');
  if(!['start','update','offer-handoff','accept-handoff'].includes(action))fail(404,'UNKNOWN_ENDPOINT','Unknown activity command.');
  const fields={start:['task','mode','slot','tool'],update:['id','version','status','milestone','next','reference','sha'],
    'offer-handoff':['id','version','target'],'accept-handoff':['id','version','tool']}[action];
  allowFields(body,['operationId','sessionId',...fields]);identifier(body.operationId,'operationId');identifier(body.sessionId,'sessionId');
  const fingerprint=canonical({action,body}),previous=state.operations.find(o=>o.actorId===actor.actorId&&o.operationId===body.operationId);
  if(previous){
    if(previous.fingerprint!==fingerprint)fail(409,'IDEMPOTENCY_CONFLICT','Operation ID already belongs to another request.');
    const current=state.records.find(r=>r.id===previous.result.record.id);
    if(!current||current.actorId!==actor.actorId||current.sessionId!==body.sessionId||current.version!==previous.result.record.version)fail(409,'OPERATION_SUPERSEDED','Activity changed; inspect it before continuing.');
    return structuredClone(previous.result);
  }
  let record,index=-1;
  if(action==='start'){
    if(state.records.some(r=>r.id===body.operationId))fail(409,'ACTIVITY_ID_CONFLICT','Activity identifier already exists.');
    if(!['plan','build'].includes(body.mode)||!SLOTS.includes(body.slot)||!actor.slots.includes(body.slot)||!Object.hasOwn(TOOLS,body.tool))fail(400,'INVALID_ACTIVITY','Invalid activity mode, tool or authorized list.');
    const task=catalog?.tasks?.find(t=>t.id===body.task);
    if(!task||!packageByTask.has(body.task))fail(400,'UNKNOWN_TASK','Task must belong to the project checklist.');
    if(['descartado','replanteado'].includes(task.estado)||body.mode==='build'&&task.estado==='hecho')fail(409,'TASK_ALREADY_DONE','Reuse the existing delivery or review the task scope first.');
    if(body.mode==='build'&&state.records.some(r=>r.task===body.task&&r.mode==='build'&&ACTIVE.has(r.status)))fail(409,'TASK_IN_PROGRESS','Another construction of this task is already recorded.');
    if(state.records.length>=5000)fail(503,'ACTIVITY_CAPACITY','Preserve work; activity history needs maintenance.');
    const previousDelivery=body.mode==='build'?state.records.filter(r=>r.task===body.task&&r.mode==='build'&&r.status==='published').at(-1):null;
    record={id:body.operationId,task:body.task,packageId:packageByTask.get(body.task),mode:body.mode,status:body.mode==='plan'?'planning':'active',
      actorId:actor.actorId,sessionId:body.sessionId,slot:body.slot,tool:body.tool,team:team(body.tool,actor.actorId),version:1,
      milestone:body.mode==='plan'?'plan':'implementation',next:body.mode==='plan'?'build':'validate',reference:null,sha:null,handoff:null,
      basedOn:previousDelivery?{sha:previousDelivery.sha,reference:previousDelivery.reference,next:previousDelivery.next}:null,
      startedAt:new Date(now).toISOString(),updatedAt:new Date(now).toISOString()};
  }else{
    identifier(body.id,'id');index=state.records.findIndex(r=>r.id===body.id);
    if(index<0)fail(404,'ACTIVITY_NOT_FOUND','Activity was not found.');
    record=structuredClone(state.records[index]);
    if(!Number.isSafeInteger(body.version)||body.version<1||record.version!==body.version)fail(409,'ACTIVITY_VERSION_CHANGED','Activity changed; read its current version.');
    if(record.status==='published'||record.status==='planned')fail(409,'ACTIVITY_CLOSED','Activity is already closed; retain its delivery.');
    if(action==='accept-handoff'){
      if(!record.handoff||record.handoff.actorId!==actor.actorId||!actor.slots.includes(record.handoff.slot))fail(403,'ACTIVITY_NOT_OWNER','No handoff was offered to this identity.');
      if(!Object.hasOwn(TOOLS,body.tool))fail(400,'INVALID_ACTIVITY','Invalid tool.');
      record.actorId=actor.actorId;record.sessionId=body.sessionId;record.slot=record.handoff.slot;record.tool=body.tool;record.team=team(body.tool,actor.actorId);record.handoff=null;
    }else{
      if(record.actorId!==actor.actorId||record.sessionId!==body.sessionId)fail(403,'ACTIVITY_NOT_OWNER','This session does not own the activity.');
      if(action==='offer-handoff'){
        allowFields(body.target,['actorId','slot']);identifier(body.target.actorId,'target actor');
        if(!SLOTS.includes(body.target.slot)||!prepared.authorizedTarget)fail(403,'TARGET_FORBIDDEN','Target must be an existing authorized executor.');
        record.handoff={actorId:body.target.actorId,slot:body.target.slot};
      }else{
        const allowed=record.mode==='plan'?['planning','paused','planned']:['active','paused','review','built','published'];
        if(!allowed.includes(body.status))fail(400,'INVALID_ACTIVITY_STATUS','Status does not belong to this activity mode.');
        if(!Object.hasOwn(MILESTONES,body.milestone)||!Object.hasOwn(NEXT_STEPS,body.next))fail(400,'INVALID_ACTIVITY','Choose a structured milestone and next step.');
        if(body.reference!==undefined)record.reference=activityReference(body.reference);
        if(body.sha!==undefined)record.sha=gitSha(body.sha);
        if(['planned','built','review'].includes(body.status)&&!record.reference)fail(400,'REFERENCE_REQUIRED','A versioned delivery reference is required.');
        if(body.status==='published'&&(!record.sha||prepared.verifiedSha!==record.sha))fail(409,'PUBLICATION_UNVERIFIED','Publication must be verified against canonical main.');
        if(body.status==='published'&&record.reference?.startsWith('https:')&&!record.reference.endsWith('/'+record.sha))fail(400,'REFERENCE_SHA_MISMATCH','The delivery link must name the verified commit.');
        record.status=body.status;record.milestone=body.milestone;record.next=body.next;
      }
    }
    record.version++;record.updatedAt=new Date(now).toISOString();
  }
  const records=state.records.slice();if(index<0)records.push(record);else records[index]=record;
  const result={revision:state.revision+1,record:structuredClone(record)};
  let operations=[...state.operations,{actorId:actor.actorId,operationId:body.operationId,action,fingerprint,body:structuredClone(body),result}].slice(-5000);
  // Keep snapshots below the existing client's 2MiB read ceiling; never discard delivery history.
  const bytes=()=>new TextEncoder().encode(JSON.stringify({revision:result.revision,records,operations})).length;
  while(bytes()>1_500_000&&operations.length>1)operations=operations.slice(-Math.ceil(operations.length/2));
  if(bytes()>1_500_000)fail(503,'ACTIVITY_CAPACITY','Preserve work; activity history needs maintenance.');
  Object.assign(state,{revision:result.revision,records,operations});
  return result;
}
