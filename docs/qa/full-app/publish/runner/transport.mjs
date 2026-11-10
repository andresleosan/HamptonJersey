export const ORIGIN='https://hamptonjersey-qa.pages.dev';
export function qaUrl(path) {
  if(typeof path!=='string'||!path.startsWith('/')||path.startsWith('//'))throw Error('QA path rejected');
  const url=new URL(path,ORIGIN);
  if(url.origin!==ORIGIN||url.protocol!=='https:'||url.username||url.password)throw Error('QA origin rejected');
  return url;
}
export function qaHeaders(path,credentials,{runId,csrf=true,baseHeaders={}}={}) {
  qaUrl(path); // Destination validation must precede reading any credential value.
  if(!/^run-[A-Za-z0-9_-]{1,64}$/.test(runId||''))throw Error('QA run rejected');
  const headers=new Headers(baseHeaders);
  for(const name of ['cf-access-client-id','cf-access-client-secret','origin','x-qa-run'])headers.delete(name);
  headers.set('cf-access-client-id',credentials.accessClientId);
  headers.set('cf-access-client-secret',credentials.accessClientSecret);
  headers.set('x-qa-run',runId);
  if(csrf)headers.set('origin',ORIGIN);
  return headers;
}
export function requireNoRedirect(status) {
  if(status>=300&&status<400)throw Error('QA redirect blocked');
}

export async function wireBrowser(context,{credentials,runId}) {
  const counters={off_origin_attempts:0,redirects:0,transport_failures:0};
  await context.route('**/*',async route=>{
    try {
      const url=new URL(route.request().url());
      if(url.origin!==ORIGIN){counters.off_origin_attempts++;await route.abort('blockedbyclient');return;}
      const path=url.pathname+url.search;
      const headers=Object.fromEntries(qaHeaders(path,credentials,{runId,baseHeaders:route.request().headers()}));
      const response=await route.fetch({headers,maxRedirects:0,timeout:20000});
      if(response.status()>=300&&response.status()<400)counters.redirects++;
      requireNoRedirect(response.status());
      await route.fulfill({response});
    }catch{counters.transport_failures++;await route.abort('failed').catch(()=>{});}
  });
  return counters;
}

export function liveClient(context,anonymousContext,{credentials,runId}) {
  return {async request(path,options={}) {
    const url=qaUrl(path);
    const headers=Object.fromEntries(qaHeaders(path,credentials,{runId,csrf:options.csrf!==false}));
    const ctx=options.anonymous?anonymousContext:context;
    const params={method:options.method||'GET',headers,maxRedirects:0,timeout:20000};
    if(options.json!==undefined){params.data=options.json;headers['content-type']='application/json';}
    if(options.multipart)params.multipart=options.multipart;
    const response=await ctx.request.fetch(url.href,params);
    requireNoRedirect(response.status());
    const body=await response.body();if(body.length>8*1024*1024)throw Error('QA response exceeds limit');
    const responseHeaders=response.headers();
    let data;
    if((responseHeaders['content-type']||'').includes('application/json')){
      try{data=JSON.parse(body.toString('utf8'));}catch{throw Error('QA JSON rejected');}
    }
    return {status:response.status(),headers:responseHeaders,body,data};
  }};
}
