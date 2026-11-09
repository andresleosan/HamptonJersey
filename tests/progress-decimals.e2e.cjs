// Local read-only board fixture. PW/CHROME use the installed browser, as tests/e2e.cjs.
const {chromium}=require(process.env.PW||'playwright-core');
const assert=require('node:assert/strict');
const http=require('node:http');
const {readFileSync,mkdirSync}=require('node:fs');
const path=require('node:path');

(async()=>{
 const {default:worker}=await import('../coordination/src/public-worker.mjs');
 const catalog=JSON.parse(readFileSync(path.join(__dirname,'../docs/roadmap/catalog.json'),'utf8'));
 const files={'/':'tablero-publico.html','/index.html':'tablero-publico.html','/tablero-publico.js':'tablero-publico.js','/equipo.css':'equipo.css','/tablero-publico.css':'tablero-publico.css','/paquetes.json':'paquetes.json'};
 const types={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json'};
 let state,unavailable=false;
 const env={BOARD_SOURCE:{getByName:()=>({getWorkBoard:async()=>{if(unavailable)throw Error('Fixture unavailable');return state;}})},ASSETS:{fetch:async request=>{
  const file=files[new URL(request.url).pathname];
  return file?new Response(readFileSync(path.join(__dirname,'../docs/roadmap',file)),{headers:{'Content-Type':types[path.extname(file)]}}):new Response('Not found',{status:404});
 }}};
 let base,browser;
 const server=http.createServer(async(req,res)=>{
  try{
   const response=await worker.fetch(new Request(base+req.url,{method:req.method}),env);
   res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
  }catch{res.writeHead(500);res.end('Fixture error');}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base=`http://127.0.0.1:${server.address().port}`;
 try{
  browser=await chromium.launch({executablePath:process.env.CHROME});
  for(const width of [1280,390]){
   state={...structuredClone(catalog),claims:[],work:[],revision:1,serverTime:new Date().toISOString()};
   state.tasks.forEach((t,i)=>{t.estado=i<52?'hecho':i<221?'pendiente':'replanteado';});
   unavailable=false;
   const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage(),errors=[];
   page.on('pageerror',error=>errors.push(error.message));
   await page.goto(base+'/');
   const label=page.locator('#progress-label');await label.getByText('52 de 221 tareas hechas · 23,53%',{exact:true}).waitFor();
   assert.equal(await page.locator('#overall-progress').getAttribute('aria-valuetext'),await label.textContent());
   for(const text of await page.locator('.package-count,.column-head progress + .muted').allTextContents())assert.match(text,/^(?:\d+ de \d+ tareas hechas · \d+,\d{2}%|Sin tareas de alcance vigente)$/);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   if(process.env.SHOTS){mkdirSync(process.env.SHOTS,{recursive:true});await page.screenshot({path:path.join(process.env.SHOTS,`progress-${width}.png`)});}
   await page.locator('#view').selectOption('lists');await page.locator('#search').fill('BUS-14');await page.locator('#search').focus();
   state.tasks[52].estado='hecho';state.revision++;await page.evaluate(()=>window.HamptonPublicBoard.refresh());
   assert.equal(await label.textContent(),'53 de 221 tareas hechas · 23,98%');
   assert.equal(await page.locator('#search').inputValue(),'BUS-14');assert.equal(await page.evaluate(()=>document.activeElement.id),'search');
   await page.evaluate(()=>document.documentElement.style.zoom='200%');
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   await page.evaluate(()=>document.documentElement.style.zoom='');
   unavailable=true;await page.evaluate(()=>window.HamptonPublicBoard.refresh());
   await page.locator('#connection').getByText(/No se pudo actualizar/).waitFor();
   assert.equal(await label.textContent(),'53 de 221 tareas hechas · 23,98%');
   unavailable=false;await page.getByRole('button',{name:'Actualizar ahora',exact:true}).click();
   await page.locator('#connection').getByText(/En vivo/).waitFor();
   assert.deepEqual(errors,[]);await context.close();
  }
  console.log('Progress decimals PASS: 1280/390, global/list/package decimals, accessible bars, refresh, filters/focus, CSS zoom200,503 recovery.');
 }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error.message);process.exitCode=1;});
