import { fail, json, readJson } from '../http.js';
import { generateDemandDraft, getDemandRecoveryScope, getActiveDemandDraft, readDemandDraft, markDemandPageReviewed, approveDemandDraft, publishDemandDraft, revokeDemandDraft, currentPublicDemand } from '../public-demand.js';
const id='([0-9a-fA-F-]{36})';
const exact=(body,keys)=>body && typeof body==='object' && !Array.isArray(body) && Object.keys(body).length===keys.length && keys.every(k=>Object.hasOwn(body,k));
const noQuery=request=>{ if(new URL(request.url).search) fail(400,'Filters are not available'); };
async function status({request,env}) { noQuery(request); if(env.DEMAND_INTERNAL_READY!=='1') return json({available:false}); try { await env.DB.batch([env.DB.prepare('SELECT id FROM public_demand_snapshots LIMIT 0'),env.DB.prepare('SELECT id FROM demand_release_authorizations LIMIT 0'),env.DB.prepare('SELECT actor FROM demand_recovery_scopes LIMIT 0'),env.DB.prepare('SELECT snapshot_id FROM public_demand_page_reviews LIMIT 0'),env.DB.prepare('SELECT snapshot_id FROM public_demand_contributions LIMIT 0'),env.DB.prepare('SELECT operation FROM public_demand_pointer LIMIT 0'),env.DB.prepare('SELECT ledger_sequence FROM public_demand_releases LIMIT 0'),env.DB.prepare('SELECT id FROM public_demand_release_state LIMIT 0'),env.DB.prepare('SELECT ok FROM public_demand_assert LIMIT 0')]); return json({available:true}); } catch { return json({available:false}); } }
async function current({request,env}) { noQuery(request); return json(await currentPublicDemand(env),200,{'cache-control':'no-store'}); }
async function generate({request,env,admin}) { noQuery(request); const body=await readJson(request,1024); if(!exact(body,['operation','operation_id'])) fail(400,'Invalid request'); return json(await generateDemandDraft(env,body,admin),201); }
async function recoveryScope({request,env,admin}) { noQuery(request); const body=await readJson(request,128); if(!exact(body,[])) fail(400,'Invalid request'); return json(await getDemandRecoveryScope(env,admin)); }
async function active({request,env,admin}) { const q=new URL(request.url).searchParams; if([...q.keys()].some(k=>k!=='operation')||q.getAll('operation').length!==1) fail(400,'Invalid request'); return json(await getActiveDemandDraft(env,q.get('operation'),admin)); }
async function detail({request,env,params,admin}) { const q=new URL(request.url).searchParams; if([...q.keys()].some(k=>k!=='after') || q.getAll('after').length>1 || (q.has('after') && !/^(0|[1-9][0-9]*)$/.test(q.get('after')))) fail(400,'Invalid cursor'); return json(await readDemandDraft(env,params[0],Number(q.get('after') ?? 0),admin)); }
async function reviewPage({request,env,params,admin}) { noQuery(request); const body=await readJson(request,1024); if(!exact(body,['version','after'])) fail(400,'Invalid request'); return json(await markDemandPageReviewed(env,{...body,id:params[0]},admin)); }
async function approve({request,env,params,admin}) { noQuery(request); const body=await readJson(request,1024); if(!exact(body,['version','authorization_id'])) fail(400,'Invalid request'); return json(await approveDemandDraft(env,{...body,id:params[0]},admin)); }
async function publish({request,env,params,admin}) { noQuery(request); const body=await readJson(request,1024); if(!exact(body,['version'])) fail(400,'Invalid request'); return json(await publishDemandDraft(env,{...body,id:params[0]},admin)); }
async function revoke({request,env,params,admin}) { noQuery(request); const body=await readJson(request,1024); if(!exact(body,['version'])) fail(400,'Invalid request'); return json(await revokeDemandDraft(env,{...body,id:params[0]},admin)); }
export default [
 ['GET',/^\/demand\/current$/,current,false],
 ['GET',/^\/admin\/demand-snapshots\/status$/,status,true],
 ['POST',/^\/admin\/demand-snapshots$/,generate,true],
 ['POST',/^\/admin\/demand-snapshots\/recovery-scope$/,recoveryScope,true],
 ['GET',/^\/admin\/demand-snapshots\/active$/,active,true],
 ['GET',new RegExp(`^/admin/demand-snapshots/${id}$`),detail,true],
 ['POST',new RegExp(`^/admin/demand-snapshots/${id}/review-page$`),reviewPage,true],
 ['POST',new RegExp(`^/admin/demand-snapshots/${id}/approve$`),approve,true],
 ['POST',new RegExp(`^/admin/demand-snapshots/${id}/publish$`),publish,true],
 ['POST',new RegExp(`^/admin/demand-snapshots/${id}/revoke$`),revoke,true],
];
