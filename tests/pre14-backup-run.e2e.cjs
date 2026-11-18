// Isolated local fixtures only: E2E_PRODUCTION_READONLY=0 E2E_SCRIPT=tests/pre14-backup-run.e2e.cjs npm run test:e2e:isolated
// PRE-14 (BACKUP_READY on for this run only): the Inbox task of a failed weekly backup opens the run's read-only summary,
// and a run that no longer exists says so.
const assert=require('node:assert/strict');
const {readFileSync,mkdirSync}=require('node:fs');
const {join,dirname}=require('node:path');
const {parseEnv}=require('node:util');
const {execFileSync}=require('node:child_process');
const {randomUUID}=require('node:crypto');
const {chromium,webkit}=require(process.env.PW||'playwright-core');
(async()=>{
 assert.equal(process.env.HAMPTON_E2E_ISOLATED,'1');assert.equal(process.env.E2E_PRODUCTION_READONLY,'0');
 const vars=parseEnv(readFileSync(process.env.E2E_VARS,'utf8')),{signSession,COOKIE}=await import('../server/auth.js');
 assert.equal(vars.BACKUP_READY,'1');
 const base=process.env.BASE.replace('127.0.0.1','localhost'),ADMIN='admin@example.test';
 const shots=process.env.E2E_SHOTS;if(shots)mkdirSync(shots,{recursive:true});
 const wrangler=join(dirname(require.resolve('wrangler')),'..','bin','wrangler.js');
 const d1=sql=>JSON.parse(execFileSync(process.execPath,[wrangler,'d1','execute','hampton','--local','--persist-to',process.env.E2E_PERSIST,
  '--json','--command',sql],{encoding:'utf8',stdio:['ignore','pipe','pipe']})).at(-1).results;
 const browser=await (process.env.HAMPTON_E2E_BROWSER==='webkit'?webkit:chromium).launch({executablePath:process.env.CHROME});
 try{
  const ctx=await browser.newContext();
  await ctx.addCookies([{name:COOKIE,value:await signSession(ADMIN,vars.SESSION_SECRET),domain:new URL(base).hostname,path:'/',httpOnly:true,secure:true,sameSite:'Strict'}]);
  for(const [width,week] of [[1280,'2026-11-02'],[390,'2026-11-09']]){
   const run=randomUUID(),at=new Date().toISOString(),title='Weekly backup needs review';
   d1(`INSERT INTO backup_runs(id,week_start,policy_hash,status,attempt,started_at,reason_code,created_at,updated_at)
     VALUES('${run}','${week}T00:00:00.000Z','${'a'.repeat(64)}','failed',3,'${at}','export_timeout','${at}','${at}');
    INSERT INTO events(at,actor,entity_type,entity_id,type,data) VALUES('${at}','system','collection','backups:${run}','backup.failed',
     json_object('week_start','${week}T00:00:00.000Z','status','failed','reason','export_timeout','attempt',3));
    INSERT INTO notifications(event_id,category,title,task_reason,action_required,created_at,task_key)
     SELECT MAX(id),'task','${title}','Week of ${week}: backup failed (export_timeout) after 3 attempts. Earlier backups are kept.',1,'${at}','backup:failed:${week}' FROM events;`);

   const errors=[],page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));
   page.on('console',m=>{if(m.type()==='error'&&!/Failed to load resource/.test(m.text()))errors.push(m.text());});
   await page.setViewportSize({width,height:900});
   const fits=async where=>assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1),`no sideways scroll: ${where} at ${width}`);
   const shot=async what=>{if(shots)await page.screenshot({path:join(shots,`pre14-backup-${what}-${width}.png`),fullPage:true});};

   await page.goto(base+'admin/#/');
   await page.getByRole('heading',{name:'Inbox',exact:true}).waitFor();
   await page.locator('.inbox-list').getByRole('button').filter({hasText:title}).click();
   await page.getByRole('link',{name:'Open backup',exact:true}).click();
   await page.getByRole('heading',{name:'Weekly backup',exact:true}).waitFor();
   await page.getByText('export_timeout',{exact:true}).waitFor();
   await page.getByText('3 of 3',{exact:true}).waitFor();
   await fits('summary');await shot('summary');
   d1(`DELETE FROM backup_runs WHERE id='${run}'`);
   await page.reload();
   await page.getByRole('alert').getByText('This backup run no longer exists.').waitFor();
   await page.getByRole('link',{name:'Back to Inbox'}).click();
   await page.getByRole('heading',{name:'Inbox',exact:true}).waitFor();
   d1(`UPDATE notifications SET resolved_at='${at}' WHERE task_key='backup:failed:${week}'`); // only one open task at a time
   assert.deepEqual(errors,[]);
   await page.close();
  }
 } finally { await browser.close(); }
 console.log('PRE-14 backup run: Inbox task, Open backup, summary and missing run at 1280/390 PASS');
})().catch(error=>{console.error(error);process.exitCode=1;});
