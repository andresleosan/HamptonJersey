// Local synthetic board only. Run with PW=/path/to/playwright-core CHROME=/path/to/chrome node tests/activity-board.e2e.cjs.
const assert=require('node:assert/strict');
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require(process.env.PW||'playwright-core');
const {once}=require('node:events');
(async()=>{
 const {emptyActivity,applyActivity}=await import('../coordination/src/activity.mjs');
 const {publicBoard}=await import('../coordination/src/public-board.mjs');
 const catalog=JSON.parse(fs.readFileSync(path.join(__dirname,'../docs/roadmap/catalog.json'))),state=emptyActivity();
 const actors={a:{actorId:'browser-codex',role:'executor',slots:['vps']},b:{actorId:'browser-hermes',role:'executor',slots:['hermes']}};
 let operation=0,broken=false,empty=false;
 const command=(who,action,body,prepared={})=>applyActivity(state,actors[who],action,{operationId:'browser-'+(++operation),sessionId:'browser-session-'+who,...body},catalog,prepared);
 const plan=command('a','start',{task:'REG-08',mode:'plan',slot:'vps',tool:'codex'}).record;
 command('a','update',{id:plan.id,version:plan.version,status:'planned',milestone:'plan',next:'build',reference:'docs/superpowers/plans/browser-test.md'});
 let builder=command('b','start',{task:'REG-08',mode:'build',slot:'hermes',tool:'hermes1'}).record;
 const priorSha='a'.repeat(40);
 command('b','update',{id:builder.id,version:1,status:'published',milestone:'release',next:'validate',sha:priorSha,reference:'https://github.com/andresleosan/HamptonJersey/commit/'+priorSha},{verifiedSha:priorSha});
 builder=command('b','start',{task:'REG-08',mode:'build',slot:'hermes',tool:'hermes1'}).record;
 const lonePlan=command('a','start',{task:'PUB-04',mode:'plan',slot:'vps',tool:'codex'}).record;
 command('a','update',{id:lonePlan.id,version:1,status:'planned',milestone:'plan',next:'build',reference:'docs/superpowers/plans/browser-test.md'});
 const files={'/':'tablero-publico.html','/tablero-publico.js':'tablero-publico.js','/equipo.css':'equipo.css','/tablero-publico.css':'tablero-publico.css','/paquetes.json':'paquetes.json'};
 const server=http.createServer((req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  if(pathname==='/v1/board'){
   if(broken){res.writeHead(503,{'Content-Type':'application/json'});return res.end(JSON.stringify({error:{code:'UNAVAILABLE'}}));}
   const board={...catalog,revision:1,activityRevision:state.revision,serverTime:new Date().toISOString(),claims:[],work:empty?[]:state.records};
   res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});return res.end(JSON.stringify(publicBoard(board)));
  }
  if(!files[pathname]){res.writeHead(404);return res.end();}
  res.writeHead(200,{'Content-Type':pathname.endsWith('.js')?'text/javascript':pathname.endsWith('.css')?'text/css':pathname.endsWith('.json')?'application/json':'text/html'});
  res.end(fs.readFileSync(path.join(__dirname,'../docs/roadmap',files[pathname])));
 });
 server.listen(0,'127.0.0.1');await once(server,'listening');
 const base='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({executablePath:process.env.CHROME});
 const shots='/tmp/hampton-progress-shots';fs.mkdirSync(shots,{recursive:true});
 try{
  for(const width of [1280,390]){
   builder=command('b','update',{id:builder.id,version:builder.version,status:'active',milestone:'implementation',next:'validate'}).record;
   const context=await browser.newContext({viewport:{width,height:1000}}),page=await context.newPage(),errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   // Deterministic local layout: remote font availability is outside this fixture.
   await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({contentType:'text/css',body:''}));
   await page.goto(base);await page.locator('#package-PAQ-02').waitFor();
   const group=page.locator('#package-PAQ-02');await group.locator('summary').click();
   assert.match(await group.locator('.stage-tasks').first().textContent(),/REG-08.*En curso.*Hermes 1/);
   await group.locator('a[data-jump="REG-08"]').click();
   const card=page.locator('#task-REG-08');await page.locator('#search').fill('REG-08');
   assert.match(await card.textContent(),/Plan preparado.*Codex/s);assert.match(await card.textContent(),/construcción sigue pendiente/s);
   assert.match(await card.textContent(),/Continúa la entrega aaaaaaa/);assert.equal(await card.locator('a[href$="'+priorSha+'"]').count(),1);
   const summary=card.locator('summary');await summary.focus();await page.keyboard.press('Space');assert.equal(await card.getAttribute('open'),null);await page.keyboard.press('Space');assert.notEqual(await card.getAttribute('open'),null);
   builder=command('b','update',{id:builder.id,version:builder.version,status:'paused',milestone:'tests',next:'resume'}).record;
   await page.evaluate(()=>window.HamptonPublicBoard.refresh());assert.match(await card.locator('.activity').textContent(),/Pausada/);assert.equal(await summary.evaluate(n=>n===document.activeElement),true);
   await page.screenshot({path:path.join(shots,'work-'+width+'.png'),fullPage:true});
   broken=true;await page.evaluate(()=>window.HamptonPublicBoard.refresh());assert.match(await page.locator('#connection').textContent(),/último dato válido/);assert.match(await card.textContent(),/Plan preparado/);
   broken=false;await page.evaluate(()=>window.HamptonPublicBoard.refresh());
   await page.locator('#search').fill('PUB-04');const planCard=page.locator('#task-PUB-04');await planCard.locator('summary').click();assert.match(await planCard.locator('.activity').textContent(),/Plan preparado/);assert.equal(await planCard.locator('[data-work-key]').count(),0);
   await page.screenshot({path:path.join(shots,'plan-'+width+'.png'),fullPage:true});
   await page.locator('#search').fill('NO-SUCH-TASK');assert.match(await page.locator('#result').textContent(),/^0 de/);
   await page.locator('#search').fill('PUB-04');await page.evaluate(()=>document.documentElement.style.zoom='2');
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:path.join(shots,'zoom-'+width+'.png'),fullPage:true});
   await page.evaluate(()=>document.documentElement.style.zoom='');
   empty=true;await page.evaluate(()=>window.HamptonPublicBoard.refresh());assert.match(await planCard.textContent(),/Sin actividad actual registrada/);empty=false;
   assert.deepEqual(errors,[]);await context.close();
  }
  console.log('Shared activity board1280/390: plan-only, construction, package stages, pause, focus/keyboard, empty/error/retry, CSS zoom200 and console PASS.');
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});
