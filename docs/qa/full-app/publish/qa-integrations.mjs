// Copied only into the isolated QA artifact. Auth and same-origin checks remain in its middleware.
import {json, fail, readJson, HttpError} from './http.js';
const ORIGIN='https://hamptonjersey-qa.pages.dev';
const DATABASE='53bc4af9-7250-44fe-8f90-6e415fda1034';
const FOLDER='qa-folder-0001', EDITED='qa-edited-0001', DOC='qa-document-001', PHOTO='qa-photo-00001';
const PNG='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jWZkAAAAASUVORK5CYII=';
const MODIFIED='2026-11-10T00:00:00.000Z';
const document={id:DOC,name:'Synthetic QA details.txt',path:'Synthetic QA details.txt',mimeType:'text/plain',size:84,modifiedTime:MODIFIED};

export function qaEnvironment(env) {
  return {DB:env.DB,MEDIA:env.MEDIA,ASSETS:env.ASSETS,SESSION_SECRET:env.SESSION_SECRET,SITE_URL:ORIGIN,
    FIREBASE_PROJECT_ID:'qa-disabled',EMAIL_SERVICE_READY:'false',
    TURNSTILE_SECRET:'qa-simulation-only',TURNSTILE_SITE_KEY:'qa-simulator'};
}
async function guard(env) {
  let row;
  try {row=await env.DB?.prepare('SELECT marker,database_id,fixture_version FROM qa_app_guard WHERE id=1').first();}
  catch {fail(503,'QA environment unavailable');}
  if(env.SITE_URL!==ORIGIN || row?.marker!=='hampton-app-qa-v1' || row?.database_id!==DATABASE || row?.fixture_version!==1)
    fail(503,'QA environment unavailable');
}
const isRecords=name=>/(^|[^a-z])records?([^a-z]|$)/i.test(name);
const isEdited=name=>/(^|[^a-z])(edited|editadas)([^a-z]|$)/i.test(name)&&!/(^|[^a-z])(not|no|sin)[\s_-]+edit/i.test(name);
function folderIdFrom(text) {
  const value=String(text??'').trim();
  if(/^[A-Za-z0-9_-]{10,100}$/.test(value))return value;
  try {const url=new URL(value),match=/^\/drive\/(?:u\/\d+\/)?folders\/([A-Za-z0-9_-]{10,100})\/?$/.exec(url.pathname);
    return url.protocol==='https:'&&url.hostname==='drive.google.com'&&match?match[1]:null;}catch{return null;}
}
export const qaDrive={
  folderIdFrom,isRecords,isEdited,
  async driveFetch(){fail(503,'QA Drive has no network transport');},
  async folderInfo(env,id){await guard(env);return id===FOLDER?{id,name:'Synthetic QA property',parents:[]}:id===EDITED?{id,name:'Edited',parents:[FOLDER]}:null;},
  async insideRecords(env,folder){await guard(env);return isRecords(folder?.name??'');},
  async walkFolder(env,id){await guard(env);if(id!==FOLDER)fail(404,'Synthetic QA folder not found');
    return {documents:[{...document}],editedFolders:[{id:EDITED,name:'Edited',modifiedTime:MODIFIED}],skipped:['Folders not read: Records']};},
  async photosIn(env,id){await guard(env);if(id!==EDITED)fail(404,'Synthetic QA photo folder not found');
    return {photos:[{id:PHOTO,name:'Synthetic QA.png',mimeType:'image/png',heic:false}],skipped:[]};},
  async fileResponse(env,file){await guard(env);let body,type;
    if(file?.id===DOC){body='Synthetic QA property\nTitle: QA fixture\nParish: St Helier\nSale price: GBP 123456\n';type='text/plain';}
    else if(file?.id===PHOTO){body=Uint8Array.from(atob(PNG),c=>c.charCodeAt(0));type='image/png';}
    else fail(404,'Synthetic QA file not found');
    return new Response(body,{headers:{'content-type':type,'cache-control':'private, no-store','x-content-type-options':'nosniff'}});},
  chooseEdited(folders,wanted){
    if(!folders.length)return {folder:null,warning:'No "Edited" folder: the draft will have no photos.'};
    const named=wanted&&folders.find(f=>f.name.trim().toLowerCase()===wanted.trim().toLowerCase());
    if(named)return {folder:named,warning:null};
    if(folders.length===1)return {folder:folders[0],warning:null};
    const newest=[...folders].sort((a,b)=>b.modifiedTime.localeCompare(a.modifiedTime))[0];
    return {folder:newest,warning:`Several "Edited" folders: used "${newest.name}" (the most recent).`};
  },
};
const testAddress=value=>typeof value==='string'&&/^[a-z0-9][a-z0-9.!#$%&'*+/=?^_`{|}~-]{0,200}@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.test$/i.test(value);
function emailSimulator(env,runId) {
  return {async send(payload){
    if(!testAddress(payload?.to))fail(400,'Use a synthetic .test recipient');
    const messageId=`<qa-${crypto.randomUUID()}@example.test>`,key=`qa:run:${runId}:email:${crypto.randomUUID()}`,at=new Date().toISOString();
    // Receipts record test routing, never raw headers, cookies or application secrets.
    await env.DB.prepare(`INSERT INTO app_settings(key,value,updated_at,updated_by) VALUES(?,?,?,'qa-simulator')`)
      .bind(key,JSON.stringify({simulated:true,recipient:payload.to,messageId}),at).run();
    return {messageId};
  }};
}
async function hermesSimulation(request,env,runId,listingId) {
  if(typeof listingId!=='string'||!/^HE-[A-Z]\d{3,}$/.test(listingId))fail(400,'Send a QA listing id');
  const {hermesDoor}=await import('./routes/hermes.js');
  const key=crypto.randomUUID()+crypto.randomUUID(),internal={...env,HERMES_KEY:key};
  const door=(path,body)=>hermesDoor(new Request(`${ORIGIN}/api/hermes${path}`,{method:'POST',headers:{authorization:`Bearer ${key}`,'content-type':'application/json'},body:JSON.stringify(body)}),internal,path);
  const created=await door('/jobs',{kind:'listing_text',listing:listingId});
  if(created.status!==201)return created;
  const {id}=await created.json(),at=new Date().toISOString();
  // Claim only the job created by this invocation; never consume another test's queue.
  const claimed=await env.DB.prepare("UPDATE jobs SET status='working',attempts=attempts+1,claimed_at=? WHERE id=? AND listing_id=? AND status='queued' AND requested_by='hermes' RETURNING id").bind(at,id,listingId).first();
  if(!claimed)fail(409,'QA draft claim changed');
  const drafted=await door(`/jobs/${id}/draft`,{summary:`Synthetic QA draft ${runId}`});
  if(!drafted.ok)return drafted;
  return json({simulated:true,simulation:'hermes',jobId:id,listingId,...await drafted.json()});
}

export async function qaSimulation({request,env,runId,listingId}) {
  try {
    if(new URL(request.url).origin!==ORIGIN || request.headers.get('origin')!==ORIGIN)fail(503,'QA environment unavailable');
    await guard(env);
    if(request.method!=='POST')fail(405,'Use POST');
    if(typeof runId!=='string'||!/^run-[A-Za-z0-9_-]{1,64}$/.test(runId))fail(400,'Invalid QA run id');
    const body=await readJson(request,8192);
    if(body?.simulation==='drive')return json({simulated:true,simulation:'drive',folderId:FOLDER,editedFolderId:EDITED,documentId:DOC,photoId:PHOTO});
    if(body?.simulation==='email'){
      const recipient=body.recipient??`${runId}@example.test`;
      if(!testAddress(recipient))fail(400,'Use a synthetic .test recipient');
      const EMAIL=emailSimulator(env,runId),active={...env,EMAIL,EMAIL_SERVICE_READY:'true'};
      const receipt=await EMAIL.send({to:recipient,subject:`Synthetic QA ${runId}`,text:'Synthetic QA delivery simulation'});
      const {default:jobs}=await import('./jobs.js');
      const bytes=new TextEncoder().encode(`From: ${recipient}\r\nTo: replies@qa.example.test\r\nSubject: Synthetic QA ${runId}\r\nMessage-ID: <${crypto.randomUUID()}@example.test>\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nSynthetic QA inbound simulation`);
      let rejection=null;
      await jobs.email({from:recipient,to:'replies@qa.example.test',rawSize:bytes.length,raw:new ReadableStream({start(controller){controller.enqueue(bytes);controller.close();}}),setReject(message){rejection=message;}},active);
      if(rejection)fail(400,'Synthetic inbound message rejected');
      return json({simulated:true,simulation:'email',...receipt});
    }
    if(body?.simulation==='jobs'){
      // A separately reviewed fixture prerequisite must restore this migration seed.
      if(!await env.DB.prepare("SELECT 1 FROM notification_cursor WHERE key='queues'").first())
        fail(409,'QA jobs prerequisite missing: notification cursor requires approved initialization');
      const {default:jobs}=await import('./jobs.js');
      await jobs.scheduled({scheduledTime:Date.now()},{...env,EMAIL:emailSimulator(env,runId),EMAIL_SERVICE_READY:'true'});
      return json({simulated:true,simulation:'jobs'});
    }
    if(body?.simulation==='hermes')return await hermesSimulation(request,env,runId,listingId);
    fail(400,'Unknown QA simulation');
  }catch(error){
    if(error instanceof HttpError)return json({error:error.message},error.status);
    return json({error:'QA simulation failed'},500);
  }
}
