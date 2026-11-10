// Copied/bundled exclusively into the separate full-app QA artifact.
export const QA_ORIGIN = 'https://hamptonjersey-qa.pages.dev';
export const QA_DB_ID = '53bc4af9-7250-44fe-8f90-6e415fda1034';
export const SOURCE_SHA = '80ad03df7e095750f455aa4aa668573e9aac5db4';
const answer=(status,message)=>new Response(JSON.stringify({error:message}),{
  status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
const CSP="default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; worker-src 'none'";

function protect(response) {
  const headers=new Headers(response.headers);
  headers.set('x-robots-tag','noindex, nofollow, nosnippet');
  headers.set('cache-control','private, no-store');
  headers.set('referrer-policy','no-referrer');
  headers.set('x-content-type-options','nosniff');
  headers.set('content-security-policy',CSP);
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}

async function validTarget(request,env) {
  const url=new URL(request.url);
  if(url.origin!==QA_ORIGIN || url.username || url.password ||
      typeof env.DB?.prepare!=='function' || typeof env.MEDIA?.get!=='function' ||
      typeof env.MEDIA?.put!=='function' || typeof env.MEDIA?.delete!=='function' ||
      typeof env.ASSETS?.fetch!=='function' ||
      typeof env.SESSION_SECRET!=='string' || env.SESSION_SECRET.length<32 ||
      env.QA_DB || env.GOOGLE_SERVICE_ACCOUNT || env.EMAIL || env.HERMES_KEY) return false;
  try {
    const row=await env.DB.prepare('SELECT marker,database_id,fixture_version FROM qa_app_guard WHERE id=1').first();
    return row?.marker==='hampton-app-qa-v1' && row.database_id===QA_DB_ID && row.fixture_version===1;
  } catch {return false;}
}

export function createQaWorker({app,qaEnvironment,qaSimulation,currentAdmin,buildId='local-unpublished'}) {
  return {async fetch(request,env,context) {
    try {
      if(!await validTarget(request,env))return protect(answer(503,'QA environment unavailable'));
      const url=new URL(request.url);
      let path;try{path=decodeURIComponent(url.pathname);}catch{return protect(answer(400,'Invalid URL'));}
      if(path.startsWith('/.')||['/_worker.js','/_routes.json','/wrangler.toml'].includes(path))return protect(answer(404,'Not found'));
      const mutation=!['GET','HEAD'].includes(request.method);
      if(mutation && request.headers.get('origin')!==QA_ORIGIN)return protect(answer(403,'Cross-origin request blocked'));
      if(path==='/api/session' && request.method==='POST')return protect(answer(403,'Provider sign-in is disabled in QA'));
      if(/^\/api\/(qa|hermes)(\/|$)/.test(path))return protect(answer(404,'Not found'));
      const derived=qaEnvironment(env);
      if(path.startsWith('/api/qa-app/')) {
        const admin=await currentAdmin(request,derived);
        if(!admin)return protect(answer(401,'Please sign in to continue'));
        if(path==='/api/qa-app/state' && request.method==='GET')return protect(new Response(JSON.stringify({
          project:'hamptonjersey-qa',source_sha:SOURCE_SHA,build_id:buildId,origin:QA_ORIGIN,guard:'verified',email:admin,
          providers:{google:'disabled',drive:'simulated',email:'simulated-only',hermes:'simulated',turnstile:'simulated'},
        }),{headers:{'content-type':'application/json'}}));
        if(path==='/api/qa-app/simulate' && request.method==='POST') {
          const runId=request.headers.get('x-qa-run')||'';
          if(!/^run-[A-Za-z0-9_-]{1,64}$/.test(runId))return protect(answer(400,'Valid QA run ID required'));
          const listingId=url.searchParams.get('listing')||null;
          if(listingId) {
            if(!/^HE-[A-Z]\d{3,}$/.test(listingId))return protect(answer(400,'Invalid QA listing'));
            const listing=await derived.DB.prepare('SELECT title FROM listings WHERE id=?').bind(listingId).first();
            if(!listing?.title?.includes('QA '+runId))return protect(answer(403,'Use a listing created by this QA run'));
          }
          return protect(await qaSimulation({request,env:derived,runId,listingId}));
        }
        return protect(answer(404,'Not found'));
      }
      const response=await app.fetch(request,derived,context);
      const location=response.headers.get('location');
      if(location && new URL(location,url).origin!==QA_ORIGIN)return protect(answer(403,'External redirect blocked'));
      return protect(response);
    } catch(error) {
      const status=Number.isInteger(error?.status)&&error.status>=400&&error.status<=599?error.status:500;
      return protect(answer(status,status===500?'QA request failed':'QA request rejected'));
    }
  }};
}
