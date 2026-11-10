// Only these same-origin requests may carry the QA service identity.
function permitted(req,origin){
  const u=new URL(req.url());
  return u.origin===origin&&(
    req.method()==='GET'&&u.pathname==='/api/qa/history'&&
      [...u.searchParams.keys()].every(k=>k==='cursor')&&u.searchParams.getAll('cursor').length<=1||
    req.method()==='POST'&&u.pathname==='/api/qa/history/validate'&&!u.search);
}

async function forwardQa(route,{origin,key,authorised,access={}}){
  const req=route.request();
  if(!permitted(req,origin))return route.abort();
  const headers=req.headers();
  delete headers.authorization;
  delete headers['cf-access-client-id'];
  delete headers['cf-access-client-secret'];
  Object.assign(headers,access);
  if(authorised)headers.authorization=`Bearer ${key}`;
  // A redirect must never be followed with the service identity attached.
  const response=await route.fetch({headers,maxRedirects:0,timeout:15000});
  if(response.status()>=300&&response.status()<400)return route.abort();
  return route.fulfill({response});
}
module.exports={forwardQa};
