import {catalogBoard} from './public-catalog.mjs';
const assets=new Set(['/','/index.html','/tablero-publico.js','/equipo.css','/tablero-publico.css','/paquetes.json']);
function secure(response) {
  const headers=new Headers(response.headers);
  headers.set('Cache-Control','no-store');headers.set('X-Content-Type-Options','nosniff');
  headers.set('Referrer-Policy','no-referrer');headers.set('X-Frame-Options','DENY');headers.set('X-Robots-Tag','noindex, nofollow');
  headers.set('Content-Security-Policy',"default-src 'none'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; connect-src 'self'; img-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
  return new Response(response.body,{status:response.status,headers});
}
export default {
  async fetch(request,env) {
    if(!['GET','HEAD'].includes(request.method))return secure(new Response('Solo consulta.',{status:405,headers:{Allow:'GET, HEAD'}}));
    const path=new URL(request.url).pathname;
    if(path==='/v1/board') {
      try {
        // One public cache entry per origin, never keyed by a cookie or arbitrary query.
        const key=new Request(new URL('/v1/board',request.url).href),cache=globalThis.caches?.default;
        let cached;try{cached=await cache?.match(key);}catch{}
        if(cached)return secure(new Response(request.method==='HEAD'?null:cached.body,{headers:cached.headers}));
        const value=await catalogBoard();
        const response=Response.json(value,{headers:{'Cache-Control':'public, max-age=60'}});
        // Only this reduced projection is cached. Failures never enter the cache.
        try{await cache?.put(key,response.clone());}catch{}
        return secure(new Response(request.method==='HEAD'?null:response.body,{headers:response.headers}));
      } catch {return secure(Response.json({error:{code:'BOARD_UNAVAILABLE',message:'No se pudo actualizar el tablero.'}},{status:503}));}
    }
    if(!assets.has(path))return secure(new Response('No encontrado.',{status:404}));
    if(!env.ASSETS)return secure(new Response('Tablero no disponible.',{status:503}));
    return secure(await env.ASSETS.fetch(request));
  }
};
