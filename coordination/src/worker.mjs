import { authenticate } from './auth.mjs';
import { fail, jsonError } from './errors.mjs';
export { TeamCoordinator } from './coordinator.mjs';
const MAX_BODY=32768;
function secure(response) {
  const headers=new Headers(response.headers);headers.set('Cache-Control','no-store');headers.set('X-Content-Type-Options','nosniff');headers.set('Referrer-Policy','no-referrer');headers.set('X-Frame-Options','DENY');
  return new Response(response.body,{status:response.status,headers});
}
async function readBody(request) {
  if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type')||''))fail(400,'INVALID_INPUT','JSON request required.');
  if(Number(request.headers.get('Content-Length'))>MAX_BODY)fail(400,'PAYLOAD_TOO_LARGE','Request body exceeds the allowed size.');
  const reader=request.body?.getReader();if(!reader)fail(400,'INVALID_INPUT','JSON body required.');
  let length=0;const chunks=[];
  try {while(true){const {value,done}=await reader.read();if(done)break;length+=value.length;if(length>MAX_BODY){await reader.cancel();fail(400,'PAYLOAD_TOO_LARGE','Request body exceeds the allowed size.');}chunks.push(value);}}finally{reader.releaseLock();}
  const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  try {const body=JSON.parse(new TextDecoder().decode(bytes));if(!body||typeof body!=='object'||Array.isArray(body))throw new Error();return body;}catch{fail(400,'INVALID_INPUT','Invalid JSON request body.');}
}
export default {
  async fetch(request,env) {
    try {
      const actor=await authenticate(request,env);const url=new URL(request.url);const path=url.pathname;
      if(path==='/v1/activity'||path.startsWith('/v1/activity/')) {
        if(!env.TEAM_COORDINATOR)fail(503,'COORDINATOR_CONFIGURATION','Activity storage is unavailable.');
        const object=env.TEAM_COORDINATOR.getByName('hampton');
        if(path==='/v1/activity'&&request.method==='GET')return secure(Response.json(await object.getActivity(actor,url.searchParams.get('operation'))));
        const action=path.slice('/v1/activity/'.length);
        if(!['start','update','offer-handoff','accept-handoff'].includes(action))fail(404,'UNKNOWN_ENDPOINT','Unknown activity endpoint.');
        if(request.method!=='POST')fail(405,'METHOD_NOT_ALLOWED','POST required.');
        if(actor.role==='viewer')fail(403,'READ_ONLY','Browser identities are read only.');
        const result=await object.activity(actor,action,await readBody(request));
        return secure(Response.json(result.body,{status:result.status}));
      }
      if(path==='/v1/board') {
        if(request.method!=='GET')fail(405,'METHOD_NOT_ALLOWED','Read-only board endpoint.');
        if(!env.TEAM_COORDINATOR)fail(503,'COORDINATOR_CONFIGURATION','Coordinator binding is unavailable.');
        return secure(Response.json(await env.TEAM_COORDINATOR.getByName('hampton').getBoard()));
      }
      if(path.startsWith('/v1/')||path==='/v1') {
        if(!/^\/v1\/(?:catalog|claims|evidence|claims\/[A-Za-z0-9-]+\/(?:renew|scope|pause|resume|handoff|submit|abandon|complete)|release\/(?:acquire|renew|finish))$/.test(path))fail(404,'UNKNOWN_ENDPOINT','Unknown coordination endpoint.');
        if(request.method!=='POST')fail(405,'METHOD_NOT_ALLOWED','POST required.');
        if(actor.role==='viewer')fail(403,'READ_ONLY','Browser identities are read only.');
        if(!env.TEAM_COORDINATOR)fail(503,'COORDINATOR_CONFIGURATION','Coordinator binding is unavailable.');
        const result=await env.TEAM_COORDINATOR.getByName('hampton').command(actor,path,await readBody(request));
        return secure(Response.json(result.body,{status:result.status}));
      }
      if(!['GET','HEAD'].includes(request.method))fail(405,'METHOD_NOT_ALLOWED','Static assets are read only.');
      if(!env.ASSETS)fail(503,'ASSET_CONFIGURATION','Board assets are not configured.');
      return secure(await env.ASSETS.fetch(request));
    } catch(error) {const result=jsonError(error);return secure(Response.json(result.body,{status:result.status}));}
  }
};
