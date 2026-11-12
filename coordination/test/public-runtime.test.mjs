import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {fileURLToPath} from 'node:url';
import {readFileSync} from 'node:fs';
const catalog=JSON.parse(readFileSync(new URL('../../docs/roadmap/catalog.json',import.meta.url)));
test('public Worker reads GitHub without any coordinator binding and blocks writes',async()=>{
 const bundle=await build({entryPoints:[fileURLToPath(new URL('../src/public-worker.mjs',import.meta.url))],bundle:true,write:false,format:'esm',platform:'browser'});
 let calls=0;
 const mf=new Miniflare(convertV4MiniflareOptions({workers:[{name:'public-view',modules:true,script:bundle.outputFiles[0].text,compatibilityDate:'2026-10-01',serviceBindings:{ASSETS:async()=>new Response('asset')},outboundService:async request=>{calls++;assert.equal(new URL(request.url).hostname,'raw.githubusercontent.com');return Response.json(catalog);}}]}));
 try{
  const response=await mf.dispatchFetch('https://public.example/v1/board');assert.equal(response.status,200);
  const board=await response.json();assert.equal(board.tasks.length,250);assert.equal(board.tasks.find(t=>t.code==='PUB-06').state,'hecho');assert.ok(board.tasks.every(t=>t.activity==='unavailable'));assert.ok(board.lists.every(l=>l.activeCount===null));assert.equal(calls,1);
  assert.equal((await mf.dispatchFetch('https://public.example/v1/catalog',{method:'POST'})).status,405);
  assert.equal((await mf.dispatchFetch('https://public.example/v1/catalog')).status,404);
 }finally{await mf.dispose();}
});
