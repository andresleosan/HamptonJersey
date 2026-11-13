// This projection is internal until the proposed schema and its consumers are reviewed.
const iso=value=>typeof value==='string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(value).toISOString()===value;
const nonnegative=value=>Number.isSafeInteger(value) && value>=0;
const positive=value=>Number.isSafeInteger(value) && value>0;
export const searchProgressEnabled=env=>env?.EST01_PROGRESS_READY==='1';
const DB_NOW="strftime('%Y-%m-%dT%H:%M:%fZ','now')";

const ticketValid=t=>t && positive(t.applicantId) && positive(t.seq) && typeof t.token==='string'
  && t.token.length===36 && typeof t.inputUpdatedAt==='string' && t.inputUpdatedAt.length>0
  && nonnegative(t.inputRevision) && iso(t.startedAt);
const requireTicket=t=>{if(!ticketValid(t))throw new TypeError('Invalid search check ticket');};
const finishTime=(ticket,value)=>{
  requireTicket(ticket);
  if(value!==undefined && (!iso(value) || value<ticket.startedAt))throw new TypeError('Invalid search check finish time');
};

// UPDATE/INSERT ... RETURNING obtains this invocation's own ticket, never a later read of current state.
export async function beginFullCheck(env,applicant,{nowIso}={}) {
  if(!positive(applicant?.id) || typeof applicant.updated_at!=='string' || !applicant.updated_at.length
    || !nonnegative(applicant.match_inputs_revision) || !iso(nowIso))throw new TypeError('Invalid search check start');
  const token=crypto.randomUUID();
  const returning='RETURNING applicant_id,attempt_seq,attempt_token,last_attempt_at,last_attempt_updated_at,last_attempt_inputs_revision';
  const active=`id=? AND updated_at=? AND match_inputs_revision=? AND archived_at IS NULL
    AND search_state='active' AND search_category='residential'`;
  const update=()=>env.DB.prepare(`UPDATE applicant_search_progress SET attempt_seq=attempt_seq+1,attempt_token=?,
      last_attempt_at=?,last_attempt_updated_at=?,last_attempt_inputs_revision=?,attempt_state='running',
      attempt_finished_at=NULL,error_code=NULL WHERE applicant_id=? AND attempt_seq<9007199254740991
      AND last_attempt_at<=? AND (last_success_at IS NULL OR last_success_at<=?) AND EXISTS(SELECT 1 FROM applicants WHERE ${active})
    ${returning}`).bind(token,nowIso,applicant.updated_at,applicant.match_inputs_revision,applicant.id,nowIso,nowIso,
      applicant.id,applicant.updated_at,applicant.match_inputs_revision).first();
  let result=await update();
  if(!result)result=await env.DB.prepare(`INSERT INTO applicant_search_progress(applicant_id,attempt_seq,attempt_token,
      last_attempt_at,last_attempt_updated_at,last_attempt_inputs_revision,attempt_state)
    SELECT id,1,?,?,updated_at,match_inputs_revision,'running' FROM applicants WHERE ${active}
      AND NOT EXISTS(SELECT 1 FROM applicant_search_progress p WHERE p.applicant_id=applicants.id) ${returning}`)
    .bind(token,nowIso,applicant.id,applicant.updated_at,applicant.match_inputs_revision).first();
  // Another begin may have inserted between our UPDATE and INSERT. Compete again atomically.
  if(!result)result=await update();
  if(!result)return null;
  const ticket={applicantId:result.applicant_id,seq:result.attempt_seq,token:result.attempt_token,
    startedAt:result.last_attempt_at,inputUpdatedAt:result.last_attempt_updated_at,inputRevision:result.last_attempt_inputs_revision};
  requireTicket(ticket);return Object.freeze(ticket);
}

// The same fence must be in the transaction that mutates matches/notices and finishes success.
export function fullCheckGuard(ticket) {
  requireTicket(ticket);
  return {sql:`EXISTS (SELECT 1 FROM applicant_search_progress p JOIN applicants a ON a.id=p.applicant_id
    WHERE p.applicant_id=? AND p.attempt_seq=? AND p.attempt_token=? AND p.attempt_state='running'
      AND p.last_attempt_at=? AND p.last_attempt_updated_at=? AND p.last_attempt_inputs_revision=?
      AND a.updated_at=p.last_attempt_updated_at AND a.match_inputs_revision=p.last_attempt_inputs_revision
      AND a.search_state='active' AND a.search_category='residential' AND a.archived_at IS NULL)`,
    args:[ticket.applicantId,ticket.seq,ticket.token,ticket.startedAt,ticket.inputUpdatedAt,ticket.inputRevision]};
}

export function fullCheckSuccessStatement(env,ticket,{finishedAt,checkedCount}) {
  finishTime(ticket,finishedAt);
  if(!nonnegative(checkedCount))throw new TypeError('Invalid checked count');
  const guard=fullCheckGuard(ticket),clock=finishedAt===undefined?DB_NOW:'?';
  return env.DB.prepare(`UPDATE applicant_search_progress SET attempt_state='succeeded',attempt_finished_at=${clock},error_code=NULL,
    last_success_at=${clock},last_success_updated_at=last_attempt_updated_at,last_success_inputs_revision=last_attempt_inputs_revision,
    last_success_seq=attempt_seq,last_success_checked_count=? WHERE applicant_id=? AND ${guard.sql}`)
    .bind(...(finishedAt===undefined?[]:[finishedAt,finishedAt]),checkedCount,ticket.applicantId,...guard.args);
}

export async function finishFullCheckFailure(env,ticket,{finishedAt}={}) {
  finishTime(ticket,finishedAt);const guard=fullCheckGuard(ticket),clock=finishedAt===undefined?DB_NOW:'?';
  const result=await env.DB.prepare(`UPDATE applicant_search_progress SET attempt_state='failed',attempt_finished_at=${clock},error_code='check_failed'
    WHERE applicant_id=? AND ${guard.sql} RETURNING attempt_seq`)
    .bind(...(finishedAt===undefined?[]:[finishedAt]),ticket.applicantId,...guard.args).first();
  return result!==null;
}

// Internal reader only. Callers must authorize the search before exposing this projection.
// The search and progress are one SQL snapshot; the projection clock is captured after that read.
export async function getSearchProgress(env,applicantId) {
  if(!positive(applicantId))throw new TypeError('Invalid applicant ID');
  if(!searchProgressEnabled(env))return null;
  const db=typeof env.DB.withSession==='function'?env.DB.withSession('first-primary'):env.DB;
  const s=await db.prepare(`SELECT a.id AS applicant_id,a.updated_at,a.match_inputs_revision,a.search_category,a.search_state,a.archived_at,
    p.applicant_id AS progress_applicant_id,p.attempt_seq,p.last_attempt_at,p.last_attempt_updated_at,p.last_attempt_inputs_revision,
    p.attempt_state,p.attempt_finished_at,p.error_code,p.last_success_at,p.last_success_updated_at,p.last_success_inputs_revision,
    p.last_success_seq,p.last_success_checked_count FROM applicants a LEFT JOIN applicant_search_progress p ON p.applicant_id=a.id
    WHERE a.id=?`).bind(applicantId).first();
  if(!s)return null;
  const applicant={id:s.applicant_id,updated_at:s.updated_at,match_inputs_revision:s.match_inputs_revision,
    search_category:s.search_category,search_state:s.search_state,archived_at:s.archived_at};
  return projectSearchProgress(applicant,s.progress_applicant_id==null?null:{...s,applicant_id:s.progress_applicant_id},new Date().toISOString());
}

// Internal only: the caller must authorize the search before exposing this snapshot.
// A single SQL statement binds counts and progress to the same applicant snapshot.
// The readiness flag is not schema attestation; never expose this without the deployment guard.
export async function getSearchProgressSnapshot(env,applicantId) {
  if(!positive(applicantId))throw new TypeError('Invalid applicant ID');
  if(!searchProgressEnabled(env))return null;
  const db=typeof env.DB.withSession==='function'?env.DB.withSession('first-primary'):env.DB;
  const row=await db.prepare(`SELECT a.id AS applicant_id,a.updated_at,a.match_inputs_revision,a.search_category,a.search_state,a.archived_at,
    p.applicant_id AS progress_applicant_id,p.attempt_seq,p.last_attempt_at,p.last_attempt_updated_at,p.last_attempt_inputs_revision,
    p.attempt_state,p.attempt_finished_at,p.error_code,p.last_success_at,p.last_success_updated_at,p.last_success_inputs_revision,
    p.last_success_seq,p.last_success_checked_count,
    (SELECT COUNT(*) FROM matches m WHERE m.applicant_id=a.id AND m.status='found') AS found,
    (SELECT COUNT(*) FROM matches m WHERE m.applicant_id=a.id AND m.status='shortlisted') AS shortlisted,
    (SELECT COUNT(*) FROM matches m WHERE m.applicant_id=a.id AND m.status='rejected') AS rejected
    FROM applicants a LEFT JOIN applicant_search_progress p ON p.applicant_id=a.id WHERE a.id=?`).bind(applicantId).first();
  if(!row)return null;
  const server_time=new Date().toISOString();
  const applicant={id:row.applicant_id,updated_at:row.updated_at,match_inputs_revision:row.match_inputs_revision,
    search_category:row.search_category,search_state:row.search_state,archived_at:row.archived_at};
  return {applicant_id:row.applicant_id,search_progress:projectSearchProgress(applicant,
    row.progress_applicant_id==null?null:{...row,applicant_id:row.progress_applicant_id},server_time),
    match_counts:{found:row.found,shortlisted:row.shortlisted,rejected:row.rejected},server_time};
}

export function projectSearchProgress(applicant,row,nowIso) {
  if(!iso(nowIso))throw new TypeError('Invalid projection time');
  const lifecycle=applicant?.search_category==='commercial'?'unsupported'
    : applicant?.search_category!=='residential'?'unverifiable'
    : applicant.archived_at!=null?'archived'
    : applicant.search_state==='resolved'?'resolved'
    : applicant.search_state==='needs_review'?'needs_review'
    : applicant.search_state==='active'?'active':'unverifiable';
  const out={version:1,scope:'hampton_inventory',lifecycle,
    state:['unsupported','unverifiable'].includes(lifecycle)?lifecycle:'unrecorded',
    coverage_pending:true,last_attempt_at:null,attempt_finished_at:null,last_success_at:null,
    last_success_checked_count:null,last_attempt_current:false,last_success_current:false};
  if(!row || lifecycle==='unsupported')return out;
  const safeDate=value=>iso(value) && value<=nowIso ? value : null;
  out.last_attempt_at=safeDate(row.last_attempt_at);
  out.attempt_finished_at=safeDate(row.attempt_finished_at);
  out.last_success_at=safeDate(row.last_success_at);
  const hasSuccess=row.last_success_at!=null;
  const successFields=['last_success_at','last_success_updated_at','last_success_inputs_revision','last_success_seq','last_success_checked_count'];
  const completeSuccess=successFields.every(key=>Object.hasOwn(row,key) && row[key]!=null);
  const emptySuccess=successFields.every(key=>Object.hasOwn(row,key) && row[key]===null);
  const validSuccess=emptySuccess || (completeSuccess && out.last_success_at!==null
    && typeof row.last_success_updated_at==='string' && row.last_success_updated_at.length>0
    && nonnegative(row.last_success_inputs_revision) && positive(row.last_success_seq)
    && row.last_success_seq<=row.attempt_seq && nonnegative(row.last_success_checked_count));
  const validAttempt=positive(applicant?.id) && row.applicant_id===applicant.id
    && typeof applicant.updated_at==='string' && applicant.updated_at.length>0
    && nonnegative(applicant.match_inputs_revision) && positive(row.attempt_seq)
    && typeof row.last_attempt_updated_at==='string' && row.last_attempt_updated_at.length>0
    && nonnegative(row.last_attempt_inputs_revision) && out.last_attempt_at!==null;
  const running=row.attempt_state==='running' && row.attempt_finished_at===null && row.error_code===null;
  const failed=row.attempt_state==='failed' && out.attempt_finished_at!==null && row.error_code==='check_failed';
  const success=row.attempt_state==='succeeded' && out.attempt_finished_at!==null && row.error_code===null
    && completeSuccess && row.last_success_seq===row.attempt_seq && row.last_success_at===row.attempt_finished_at
    && row.last_success_updated_at===row.last_attempt_updated_at
    && row.last_success_inputs_revision===row.last_attempt_inputs_revision;
  const ordered=(running || failed || success) && (running || row.attempt_finished_at>=row.last_attempt_at)
    && (!hasSuccess || success || (row.last_success_seq<row.attempt_seq && row.last_success_at<=row.last_attempt_at));
  if(!validAttempt || !validSuccess || !ordered || lifecycle==='unverifiable'){
    out.state='unverifiable';return out;
  }
  out.last_success_checked_count=hasSuccess?row.last_success_checked_count:null;
  out.last_attempt_current=applicant.updated_at===row.last_attempt_updated_at
    && applicant.match_inputs_revision===row.last_attempt_inputs_revision;
  out.last_success_current=hasSuccess && applicant.updated_at===row.last_success_updated_at
    && applicant.match_inputs_revision===row.last_success_inputs_revision;
  if(lifecycle!=='active')out.state='historical';
  else if(!out.last_attempt_current)out.state='needs_recheck';
  else if(failed)out.state='failed';
  else if(success)out.state='succeeded';
  else out.state=Date.parse(nowIso)-Date.parse(row.last_attempt_at)>120000?'interrupted':'running';
  return out;
}
