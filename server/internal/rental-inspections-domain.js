import { HttpError } from '../http.js';
import { jerseyToday, realDate } from '../viewings.js';

// INTERNAL PURE MODEL. It provides neither persistence nor authentication,
// authorization, proof of external evidence, or a route to real case data.
const bad=()=>{throw new HttpError(400,'Invalid inspection input');};
const conflict=()=>{throw new HttpError(409,'Inspection changed or unavailable');};
const object=v=>v!==null && typeof v==='object' && !Array.isArray(v);
const keys=(v,allowed)=>object(v) && Object.keys(v).every(k=>allowed.includes(k));
const id=v=>typeof v==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const pos=v=>Number.isSafeInteger(v) && v>0;
const date=v=>typeof v==='string' && v.slice(0,4)!=='0000' && realDate(v);
const dateOrNull=v=>v===null || date(v);
const actorOk=v=>typeof v==='string' && v.length<=254 && v===v.trim().toLowerCase() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const stamp=v=>typeof v==='string' && Number.isFinite(Date.parse(v)) && new Date(v).toISOString()===v;
const text=(v,max)=>typeof v==='string' && v.trim().length>0 && v.length<=max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v);
const optionalText=(v,max)=>v===null || (typeof v==='string' && v.length<=max &&
  !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v));
const opaqueRef=v=>typeof v==='string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/.test(v) &&
  !/^(?:https?|file|data|javascript|r2):/i.test(v);
const now=clock=>{const d=new Date(clock());if(!Number.isFinite(d.getTime()))throw new Error('Invalid inspection clock');return d;};
const leap=y=>y%4===0 && (y%100!==0 || y%400===0);
function sixMonths(s) {
  const [y,m,d]=s.split('-').map(Number),index=y*12+(m-1)+6,year=Math.floor(index/12),month=index%12+1;
  if(year>9999)bad();
  const days=[31,leap(year)?29:28,31,30,31,30,31,31,30,31,30,31];
  return `${String(year).padStart(4,'0')}-${String(month).padStart(2,'0')}-${String(Math.min(d,days[month-1])).padStart(2,'0')}`;
}
export function nextInspectionDueCore(input) {
  if(!keys(input,['last_completed_on','initial_due_on']) || !Object.hasOwn(input,'last_completed_on') ||
      !Object.hasOwn(input,'initial_due_on') || !dateOrNull(input.last_completed_on) || !dateOrNull(input.initial_due_on)) bad();
  if(input.last_completed_on!==null)return {status:'ready',due_on:sixMonths(input.last_completed_on)};
  if(input.initial_due_on!==null)return {status:'ready',due_on:input.initial_due_on};
  return {status:'baseline_required',due_on:null};
}
const initialItem=x=>keys(x,['id','room','check']) && id(x.id) && text(x.room,120) && text(x.check,160);
export function createInspectionDraftCore(input,actor,clock=()=>new Date()) {
  if(!keys(input,['id','rental_id','tenancy_id','last_completed_on','initial_due_on','scheduled_on','template_version','items']) ||
      !id(input.id) || !pos(input.rental_id) || !(input.tenancy_id===null || pos(input.tenancy_id)) ||
      !dateOrNull(input.last_completed_on) || !dateOrNull(input.initial_due_on) || !dateOrNull(input.scheduled_on) ||
      !pos(input.template_version) || !Array.isArray(input.items) || input.items.length>50 ||
      !input.items.every(initialItem) || new Set(input.items.map(x=>x.id)).size!==input.items.length || !actorOk(actor)) bad();
  const at=now(clock).toISOString(),due=nextInspectionDueCore({last_completed_on:input.last_completed_on,initial_due_on:input.initial_due_on});
  if(due.status==='baseline_required')return due;
  return {id:input.id,rental_id:input.rental_id,tenancy_id:input.tenancy_id,due_on:due.due_on,
    last_completed_on:input.last_completed_on,scheduled_on:input.scheduled_on,status:'open',template_version:input.template_version,
    revision:1,items:input.items.map(x=>({id:x.id,room:x.room.trim(),check:x.check.trim(),result:'not_checked',note:null,evidence:[]})),
    meter_readings:[],created_at:at,created_by:actor,updated_at:at,updated_by:actor,
    completed_on:null,completed_at:null,completed_by:null};
}
function validEvidence(e) {
  return object(e) && id(e.id) && opaqueRef(e.evidence_ref) && ['reviewed','revoked'].includes(e.status) && pos(e.revision) &&
    actorOk(e.reviewed_by) && stamp(e.reviewed_at) &&
    (e.status==='reviewed' ? e.revision===1 && e.revoked_at===null && e.revoked_by===null :
      e.revision>=2 && stamp(e.revoked_at) && actorOk(e.revoked_by));
}
function validState(s) {
  if(!object(s)||!id(s.id)||!pos(s.rental_id)||!(s.tenancy_id===null||pos(s.tenancy_id))||!date(s.due_on)||
    !dateOrNull(s.last_completed_on)||!dateOrNull(s.scheduled_on)||!pos(s.template_version)||!pos(s.revision)||
    !['open','completed'].includes(s.status)||!Array.isArray(s.items)||s.items.length>50||!Array.isArray(s.meter_readings)||s.meter_readings.length>20||
    !stamp(s.created_at)||!stamp(s.updated_at)||!actorOk(s.created_by)||!actorOk(s.updated_by))return false;
  if(s.status==='open' ? s.completed_on!==null||s.completed_at!==null||s.completed_by!==null :
    !date(s.completed_on)||!stamp(s.completed_at)||!actorOk(s.completed_by))return false;
  if(new Set(s.items.map(x=>x?.id)).size!==s.items.length)return false;
  let evidenceCount=0;const evidenceIds=new Set();
  for(const x of s.items){
    if(!object(x)||!id(x.id)||!text(x.room,120)||!text(x.check,160)||!['not_checked','ok','issue'].includes(x.result)||
      !optionalText(x.note,500)||!Array.isArray(x.evidence))return false;
    for(const e of x.evidence){if(!validEvidence(e)||evidenceIds.has(e.id))return false;evidenceIds.add(e.id);evidenceCount++;}
  }
  return evidenceCount<=20 && s.meter_readings.every(m=>keys(m,['name','value','unit'])&&text(m.name,80)&&text(m.value,60)&&text(m.unit,20));
}
function changed(state,input,allowed,actor,clock,allowCompleted=false) {
  if(!keys(input,['inspection_id','rental_id','expected_revision',...allowed]) || !id(input.inspection_id) ||
      !pos(input.rental_id) || !pos(input.expected_revision) || !actorOk(actor))bad();
  if(!validState(state) || state.id!==input.inspection_id || state.rental_id!==input.rental_id ||
      state.revision!==input.expected_revision || state.revision===Number.MAX_SAFE_INTEGER || (!allowCompleted&&state.status!=='open'))conflict();
  const d=now(clock),next=structuredClone(state);next.revision++;next.updated_at=d.toISOString();next.updated_by=actor;
  return {next,at:d};
}
export function rescheduleInspectionCore(state,input,actor,clock=()=>new Date()) {
  const {next}=changed(state,input,['scheduled_on'],actor,clock);
  if(!Object.hasOwn(input,'scheduled_on') || !dateOrNull(input.scheduled_on))bad();
  next.scheduled_on=input.scheduled_on;return next;
}
export function saveInspectionDraftCore(state,input,actor,clock=()=>new Date()) {
  const {next}=changed(state,input,['template_version','items','meter_readings'],actor,clock);
  if(!pos(input.template_version) || input.template_version!==state.template_version)conflict();
  if(!Array.isArray(input.items) || input.items.length>50 || new Set(input.items.map(x=>x?.id)).size!==input.items.length)bad();
  for(const change of input.items) {
    if(!keys(change,['id','result','note'])||!id(change.id)||!['not_checked','ok','issue'].includes(change.result)||!optionalText(change.note,500))bad();
    const target=next.items.find(x=>x.id===change.id);if(!target)conflict();
    target.result=change.result;target.note=change.note;
  }
  if(Object.hasOwn(input,'meter_readings')) {
    if(!Array.isArray(input.meter_readings)||input.meter_readings.length>20 ||
      !input.meter_readings.every(m=>keys(m,['name','value','unit'])&&text(m.name,80)&&text(m.value,60)&&text(m.unit,20)))bad();
    next.meter_readings=input.meter_readings.map(m=>({name:m.name.trim(),value:m.value.trim(),unit:m.unit.trim()}));
  }
  return next;
}
export function reviewInspectionEvidenceCore(state,input,actor,clock=()=>new Date()) {
  const {next,at}=changed(state,input,['item_id','evidence_ref'],actor,clock);
  if(!id(input.item_id)||!opaqueRef(input.evidence_ref))bad();
  const target=next.items.find(x=>x.id===input.item_id);if(!target)conflict();
  const all=next.items.flatMap(x=>x.evidence);
  if(all.length>=20)bad();
  if(all.some(x=>x.evidence_ref===input.evidence_ref && x.status==='revoked') ||
      target.evidence.some(x=>x.evidence_ref===input.evidence_ref))conflict();
  target.evidence.push({id:crypto.randomUUID(),evidence_ref:input.evidence_ref,status:'reviewed',revision:1,
    reviewed_at:at.toISOString(),reviewed_by:actor,revoked_at:null,revoked_by:null});
  return next;
}
export function revokeInspectionEvidenceCore(state,input,actor,clock=()=>new Date()) {
  const {next,at}=changed(state,input,['item_id','evidence_id','expected_evidence_revision'],actor,clock,true);
  if(!id(input.item_id)||!id(input.evidence_id)||!pos(input.expected_evidence_revision))bad();
  const target=next.items.find(x=>x.id===input.item_id),e=target?.evidence.find(x=>x.id===input.evidence_id);
  if(!e || e.status!=='reviewed' || e.revision!==input.expected_evidence_revision)conflict();
  for(const x of next.items.flatMap(x=>x.evidence))if(x.evidence_ref===e.evidence_ref && x.status==='reviewed') {
    x.status='revoked';x.revision++;x.revoked_at=at.toISOString();x.revoked_by=actor;
  }
  return next;
}
export function inspectionEvidenceStatusCore(state) {
  if(!validState(state))conflict();
  const evidence=state.items.flatMap(x=>x.evidence);
  return evidence.some(e=>e.status==='revoked')?'review_required':evidence.length?'review_declared':'not_recorded';
}
export function completeInspectionCore(state,input,actor,clock=()=>new Date()) {
  const {next,at}=changed(state,input,['completed_on'],actor,clock);
  if(!date(input.completed_on) || input.completed_on>jerseyToday(at) ||
      (state.last_completed_on!==null && input.completed_on<=state.last_completed_on))bad();
  if(!next.items.length || next.items.some(x=>x.result==='not_checked'))
    throw new HttpError(400,'Complete each inspection check before finishing');
  if(inspectionEvidenceStatusCore(next)==='review_required')conflict();
  next.status='completed';next.completed_on=input.completed_on;next.completed_at=at.toISOString();next.completed_by=actor;
  return {inspection:next,next_due_on:sixMonths(input.completed_on)};
}
