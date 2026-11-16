// Isolated local fixtures only: E2E_PRODUCTION_READONLY=0 E2E_SCRIPT=tests/pre12-retention-notice.e2e.cjs npm run test:e2e:isolated
// PRE-12 (Q05): the Inbox task the clock opens when a contact's retention notice failed or was answered (written here as
// server/retention-notices.js writes it), its link to the applicant, and the event's label in the search's history.
const assert=require('node:assert/strict');
const {readFileSync,mkdirSync}=require('node:fs');
const {join,dirname}=require('node:path');
const {parseEnv}=require('node:util');
const {execFileSync}=require('node:child_process');
const {chromium,webkit}=require(process.env.PW||'playwright-core');
const KEEP=' The deletion is on hold and nothing was deleted. Contact the person: log the conversation to keep their record or, if they agree, delete it. Marking this task done deletes nothing.';
const TASKS={1280:['failed','Retention notice failed','The email service could not deliver the notice telling this contact that their details will be deleted after 12 months without activity.'+KEEP],
 390:['replied','Reply to a retention notice','This contact sent an email after their retention notice; read it in Email.'+KEEP]};
(async()=>{
 assert.equal(process.env.HAMPTON_E2E_ISOLATED,'1');assert.equal(process.env.E2E_PRODUCTION_READONLY,'0');
 const vars=parseEnv(readFileSync(process.env.E2E_VARS,'utf8')),{signSession,COOKIE}=await import('../server/auth.js');
 const base=process.env.BASE.replace('127.0.0.1','localhost'),origin=new URL(base).origin,ADMIN='admin@example.test';
 const shots=process.env.E2E_SHOTS;if(shots)mkdirSync(shots,{recursive:true});
 const wrangler=join(dirname(require.resolve('wrangler')),'..','bin','wrangler.js');
 const d1=sql=>JSON.parse(execFileSync(process.execPath,[wrangler,'d1','execute','hampton','--local','--persist-to',process.env.E2E_PERSIST,
  '--json','--command',sql],{encoding:'utf8',stdio:['ignore','pipe','pipe']})).at(-1).results;
 const q=s=>`'${String(s).replaceAll("'","''")}'`;
 const browser=await (process.env.HAMPTON_E2E_BROWSER==='webkit'?webkit:chromium).launch({executablePath:process.env.CHROME});
 try{
  const ctx=await browser.newContext();
  await ctx.addCookies([{name:COOKIE,value:await signSession(ADMIN,vars.SESSION_SECRET),domain:new URL(base).hostname,path:'/',httpOnly:true,secure:true,sameSite:'Strict'}]);
  for(const width of [1280,390]){
   const name=`PRE12 Notice ${width}`,[reason,title,text]=TASKS[width];
   const made=await ctx.request.post(base+'api/admin/applicants',{headers:{origin},data:{name,email:`pre12-notice-${width}@example.test`,
    operation:'rent',source:'phone',budget_max:2000,bedrooms_min:2}});
   assert.equal(made.status(),201);const id=(await made.json()).id;
   const [{contact_id:contact,last_activity_at:activity}]=d1(`SELECT a.contact_id,c.last_activity_at FROM applicants a JOIN contacts c ON c.id=a.contact_id WHERE a.id=${id}`);
   const key=`retention_notice:${contact}:${activity}`,at=new Date().toISOString();
   d1(`INSERT INTO events(at,actor,entity_type,entity_id,type,data) VALUES(${q(at)},'system','contact',${q(contact)},'contact.retention_notice_review',json_object('reason',${q(reason)}));
    INSERT INTO notifications(event_id,category,title,task_reason,action_required,created_at,task_key) SELECT MAX(id),'task',${q(title)},${q(text)},1,${q(at)},${q(key)} FROM events;`);

   const errors=[],page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));
   page.on('console',m=>{if(m.type()==='error'&&!/Failed to load resource.*ERR_INTERNET_DISCONNECTED/.test(m.text()))errors.push(m.text());});
   await page.setViewportSize({width,height:900});
   const fits=async where=>assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1),`no sideways scroll: ${where} at ${width}`);
   const shot=async what=>{if(shots)await page.screenshot({path:join(shots,`pre12-notice-${what}-${width}.png`),fullPage:true});};

   // The task waits in Needs action with what happened and what to do, and opens the applicant.
   await page.goto(base+'admin/#/');
   await page.getByRole('heading',{name:'Inbox',exact:true}).waitFor();
   await page.locator('.inbox-list').getByRole('button').filter({hasText:title}).click();
   const detail=page.locator('.task-reason').filter({hasText:'nothing was deleted'});
   await detail.waitFor();assert.equal(await detail.textContent(),text);
   await fits('Inbox');await shot('inbox');
   await page.getByRole('link',{name:'Open applicant',exact:true}).click();
   await page.getByRole('heading',{name,exact:true}).waitFor();
   // The search's history names the event in words.
   await page.goto(base+`admin/#/applicants/${id}/timeline`);
   await page.locator('ol.timeline').getByText('Retention notice needs review',{exact:true}).waitFor();
   await fits('Timeline');await shot('timeline');
   assert.deepEqual(errors,[]);
   await page.close();
  }
 } finally { await browser.close(); }
 console.log('PRE-12 retention notice task: Inbox task, Open applicant and history label at 1280/390 PASS');
})().catch(error=>{console.error(error);process.exitCode=1;});
