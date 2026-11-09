// Run with E2E_SCRIPT=tests/notification-tasks.e2e.cjs npm run test:e2e and the project's PW/CHROME paths.
// Uses only the isolated local fixture prepared by run-e2e.cjs.
const {chromium}=require(process.env.PW||'playwright-core');
const assert=require('node:assert/strict');
const {readFileSync,mkdirSync,writeFileSync}=require('node:fs');
const {parseEnv}=require('node:util');
const {execFileSync}=require('node:child_process');
const {join,dirname}=require('node:path');
const {tmpdir}=require('node:os');
const BASE=process.env.BASE,vars=parseEnv(readFileSync(process.env.E2E_VARS,'utf8'));
const SHOTS=process.env.NOT11_SHOTS||join(tmpdir(),'hampton-not11-shots');
const wrangler=join(dirname(require.resolve('wrangler')),'..','bin','wrangler.js');
const sql=statement=>execFileSync(process.execPath,[wrangler,'d1','execute','hampton','--local','--persist-to',process.env.E2E_PERSIST,'--json','--command',statement],{encoding:'utf8'});
const at=new Date().toISOString();
// Chromium treats loopback as trustworthy for Secure cookies; Playwright's separate
// API client does not. Exercise the browser's real cookie/Origin behavior throughout.
const request=(page,path,method='GET',body)=>page.evaluate(async({path,method,body})=>{
  const res=await fetch(path,{method,credentials:'same-origin',headers:body?{'Content-Type':'application/json'}:undefined,
    body:body?JSON.stringify(body):undefined});
  return {status:res.status,body:await res.json()};
},{path,method,body});

(async()=>{
  assert.ok(BASE&&process.env.E2E_PERSIST&&process.env.E2E_VARS,'isolated fixture required');
  sql(`DELETE FROM notifications;
    INSERT OR IGNORE INTO admins(email,name,added_by,added_at) VALUES('colleague@example.test','Test colleague','fixture','${at}');
    INSERT INTO contacts(id,name,email,last_activity_at,created_at,updated_at) VALUES(900001,'Task fixture','task-fixture@example.test','${at}','${at}','${at}');
    INSERT INTO applicants(id,contact_id,operation,source,created_at,updated_at) VALUES(900001,900001,'rent','web','${at}','${at}');
    INSERT INTO events(at,actor,entity_type,entity_id,type) VALUES('${at}','system','applicant','900001','fixture.task');
    INSERT INTO notifications(event_id,category,title,action_required,created_at) VALUES(last_insert_rowid(),'new_applicant','Review task fixture',1,'${at}');
    WITH RECURSIVE x(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM x WHERE n<500)
      INSERT INTO viewing_requests(id,kind,date,time,name,email,created_at)
      SELECT 910000+n,'In person','2030-01-10','11:30','Viewing context '||n,'linked-'||n||'@example.test','2026-01-01T00:00:00.000Z' FROM x;
    INSERT INTO viewing_requests(id,kind,date,time,name,email,created_at)
      VALUES(900001,'In person','2030-01-10','11:30','Viewing task target','viewing-target@example.test','${at}');`);
  const {signSession,COOKIE}=await import('../server/auth.js');
  const browser=await chromium.launch({executablePath:process.env.CHROME});
  let debugPage;
  try {
    const ctx=await browser.newContext({viewport:{width:1280,height:900},timezoneId:'Europe/Jersey'});
    const other=await browser.newContext({timezoneId:'Europe/Jersey'});
    for(const [context,email] of [[ctx,'admin@example.test'],[other,'colleague@example.test']])
      await context.addCookies([{name:COOKIE,value:await signSession(email,vars.SESSION_SECRET),domain:new URL(BASE).hostname,path:'/',secure:true,httpOnly:true,sameSite:'Strict'}]);
    const page=await ctx.newPage(),errors=[];debugPage=page;
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto(new URL('admin/#/',BASE).href);
    const colleague=await other.newPage();await colleague.goto(new URL('robots.txt',BASE).href);
    const first=await request(page,'/api/admin/notifications?box=action');assert.equal(first.status,200);
    const notice=first.body.notifications.find(n=>n.title==='Review task fixture');assert.ok(notice);
    await page.getByRole('heading',{name:'Inbox',exact:true}).waitFor();
    await page.locator('.inbox-list button').filter({hasText:'Review task fixture'}).click();
    await page.getByRole('button',{name:'Claim task',exact:true}).click();
    await page.getByText('Task claimed.',{exact:true}).waitFor();
    await page.getByRole('combobox',{name:'Assigned to',exact:true}).selectOption('colleague@example.test');
    await page.getByLabel('Deadline (your time zone)',{exact:true}).fill('2026-12-02T10:30');
    await page.getByRole('button',{name:'Save task details',exact:true}).click();
    await page.getByText('Task details saved.',{exact:true}).waitFor();
    let detail=(await request(page,`/api/admin/notification-tasks/${notice.id}`)).body;
    assert.equal(detail.task.assigned_to,'colleague@example.test');assert.equal(detail.task.due_at,'2026-12-02T10:30:00.000Z');
    const unread=(await request(colleague,'/api/admin/notifications?box=action')).body;
    assert.equal(unread.notifications.find(n=>n.id===notice.id).is_read,0,'reading is personal');

    await page.getByRole('combobox',{name:'Assigned to',exact:true}).selectOption('admin@example.test');
    const changed=await request(colleague,`/api/admin/notification-tasks/${notice.id}`,'PUT',
      {operation_id:crypto.randomUUID(),revision:detail.task.revision,action:'deadline',due_at:'2026-12-02T11:30:00.000Z'});
    assert.equal(changed.status,200);
    await page.getByRole('button',{name:'Save task details',exact:true}).click();
    await page.getByRole('alert').filter({hasText:/changed|Reload/}).first().waitFor();
    assert.equal(await page.getByRole('combobox',{name:'Assigned to',exact:true}).inputValue(),'admin@example.test');
    await page.getByRole('button',{name:'Reload task',exact:true}).click();
    await page.getByText('Latest task loaded. Your draft has been kept.',{exact:true}).waitFor();
    assert.equal(await page.getByLabel('Deadline (your time zone)',{exact:true}).inputValue(),'2026-12-02T11:30');
    await page.getByRole('button',{name:'Save task details',exact:true}).click();
    await page.getByText('Task details saved.',{exact:true}).waitFor();
    await page.getByRole('button',{name:'Done',exact:true}).click();
    await page.getByText("Marked as done. It's in the Feed now.",{exact:true}).waitFor();
    await page.getByRole('group',{name:'Notices',exact:true}).getByRole('button',{name:'Feed',exact:true}).click();
    await page.locator('.inbox-list button').filter({hasText:'Review task fixture'}).click();
    await page.getByRole('button',{name:'Reopen task',exact:true}).click();
    await page.getByText('Task reopened.',{exact:true}).waitFor();
    await page.getByRole('button',{name:'Add follow-up task',exact:true}).click();
    await page.getByRole('button',{name:'Create follow-up task',exact:true}).click();
    assert.equal(await page.getByLabel('Follow-up title',{exact:true}).evaluate(e=>e.validity.valueMissing),true);
    await page.getByLabel('Follow-up title',{exact:true}).fill('<b>Follow-up task fixture</b>');
    await page.getByLabel('Follow-up reason',{exact:true}).fill('Prepare the next conversation');
    const creations=[];
    await page.route('**/api/admin/notification-tasks',async route=>{
      if(route.request().method()!=='POST')return route.continue();
      creations.push(route.request().postDataJSON());const response=await route.fetch();
      if(creations.length===1)await route.fulfill({status:200,contentType:'application/json',body:'{"task":'});
      else await route.fulfill({response});
    });
    await page.getByRole('button',{name:'Create follow-up task',exact:true}).click();
    await page.getByRole('button',{name:'Retry same task',exact:true}).waitFor();
    assert.equal(await page.getByLabel('Follow-up title',{exact:true}).isDisabled(),true);
    await page.getByRole('button',{name:'Retry same task',exact:true}).click();
    await page.getByText('Follow-up task created.',{exact:true}).waitFor();
    assert.equal(creations.length,2);assert.deepEqual(creations[0],creations[1]);
    assert.equal((await request(page,'/api/admin/notifications?box=action&category=task')).body.notifications.length,1);
    await page.unroute('**/api/admin/notification-tasks');
    await page.locator('.inbox-detail').getByRole('heading',{name:'<b>Follow-up task fixture</b>',exact:true}).waitFor();
    assert.equal(await page.locator('.inbox-detail h2 b').count(),0,'task titles render as text');
    await page.getByText('Feed preferences',{exact:true}).click();
    await page.getByRole('checkbox',{name:'Tasks',exact:true}).uncheck();
    await page.getByRole('button',{name:'Save feed preferences',exact:true}).click();
    await page.getByText('Feed preferences saved.',{exact:true}).waitFor();
    await page.getByRole('checkbox',{name:'Tasks',exact:true}).check();
    await page.getByRole('button',{name:'Discard preference changes',exact:true}).click();
    assert.equal(await page.getByRole('checkbox',{name:'Tasks',exact:true}).isChecked(),false);
    await page.locator('.task-history summary').click();
    await page.locator('.task-history li').first().waitFor();
    assert.ok(await page.locator('.inbox-list button').filter({hasText:'Follow-up task fixture'}).isVisible(),'preferences preserve open shared tasks');
    mkdirSync(SHOTS,{recursive:true});await page.evaluate(()=>window.scrollTo(0,0));
    await page.screenshot({path:join(SHOTS,'inbox-desktop.png'),fullPage:true});
    for(const width of [390,1280]) {
      await page.setViewportSize({width,height:900});
      if(width===1280)await page.evaluate(()=>{document.documentElement.style.zoom='2';});
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),'layout does not overflow');
      assert.ok(await page.locator('.task-controls input,.task-controls select,.task-controls button').evaluateAll(elements=>
        elements.filter(e=>e.getClientRects().length).every(e=>{const r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1;})),
        'task controls stay inside the viewport, including at 200% zoom');
      await page.getByRole('button',{name:'Done',exact:true}).focus();await page.keyboard.press('Tab');
      assert.notEqual(await page.evaluate(()=>document.activeElement.tagName),'BODY');
      await page.screenshot({path:join(SHOTS,`inbox-focus-${width}.png`)});
      await page.evaluate(()=>window.scrollTo(0,0));
      await page.screenshot({path:join(SHOTS,width===390?'inbox-mobile.png':'inbox-zoom200.png'),fullPage:true});
      await page.evaluate(()=>{document.documentElement.style.zoom='';});
    }
    // An in-flight detail read must not replace edits started after the poll.
    const followup=(await request(page,'/api/admin/notifications?box=action&category=task')).body.notifications[0];
    let releaseDetail,detailStarted;
    const pendingDetail=new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error('The detail poll did not arrive')),10000);
      detailStarted=()=>{clearTimeout(timer);resolve();};
    });
    const detailGate=new Promise(resolve=>{releaseDetail=resolve;});
    await page.route(`**/api/admin/notification-tasks/${followup.id}`,async route=>{
      if(route.request().method()!=='GET')return route.continue();
      const response=await route.fetch();detailStarted();await detailGate;await route.fulfill({response});
    });
    assert.equal((await request(colleague,`/api/admin/notification-tasks/${followup.id}`,'PUT',
      {operation_id:crypto.randomUUID(),revision:followup.revision,action:'deadline',due_at:'2026-12-04T10:30:00.000Z'})).status,200);
    await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));await pendingDetail;
    await page.getByRole('combobox',{name:'Assigned to',exact:true}).selectOption('colleague@example.test');
    releaseDetail();await page.getByRole('alert').filter({hasText:'newer context'}).waitFor();
    assert.equal(await page.getByRole('combobox',{name:'Assigned to',exact:true}).inputValue(),'colleague@example.test');
    await page.unroute(`**/api/admin/notification-tasks/${followup.id}`);
    await page.getByRole('button',{name:'Reload task',exact:true}).click();
    await page.getByText('Latest task loaded. Your draft has been kept.',{exact:true}).waitFor();
    await page.getByRole('button',{name:'Save task details',exact:true}).click();await page.getByText('Task details saved.',{exact:true}).waitFor();

    // A colleague moving the task out of the box cannot unmount a dirty form.
    await page.getByRole('combobox',{name:'Assigned to',exact:true}).selectOption('admin@example.test');
    detail=(await request(colleague,`/api/admin/notification-tasks/${followup.id}`)).body;
    assert.equal((await request(colleague,`/api/admin/notification-tasks/${followup.id}`,'PUT',
      {operation_id:crypto.randomUUID(),revision:detail.task.revision,action:'done'})).status,200);
    await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
    await page.getByRole('alert').filter({hasText:'newer context'}).waitFor();
    assert.equal(await page.getByRole('combobox',{name:'Assigned to',exact:true}).inputValue(),'admin@example.test');
    await page.getByRole('button',{name:'Reload task',exact:true}).click();
    await page.getByText('Latest task loaded. Your draft has been kept.',{exact:true}).waitFor();
    await page.getByRole('button',{name:'Discard task changes',exact:true}).click();
    await page.getByRole('group',{name:'Notices',exact:true}).getByRole('button',{name:'Feed',exact:true}).click();
    await page.locator('.inbox-list button').filter({hasText:'Follow-up task fixture'}).click();
    await page.getByRole('button',{name:'Reopen task',exact:true}).click();await page.getByText('Task reopened.',{exact:true}).waitFor();

    // The server committed, but its response was lost. Retry exactly the same UUID/body.
    detail=(await request(colleague,`/api/admin/notification-tasks/${followup.id}`)).body;
    const attempts=[];
    await page.route(`**/api/admin/notification-tasks/${followup.id}`,async route=>{
      if(route.request().method()!=='PUT')return route.continue();
      attempts.push(route.request().postDataJSON());const response=await route.fetch();
      if(attempts.length===1)await route.fulfill({status:503,json:{error:'Synthetic response lost'}});
      else if(attempts.length===2)await route.fulfill({status:200,contentType:'application/json',body:'{"task":'});
      else await route.fulfill({response});
    });
    await page.getByRole('combobox',{name:'Assigned to',exact:true}).selectOption('admin@example.test');
    await page.getByRole('button',{name:'Save task details',exact:true}).click();
    await page.getByRole('button',{name:'Retry same change',exact:true}).waitFor();
    assert.equal(await page.getByRole('combobox',{name:'Assigned to',exact:true}).isDisabled(),true);
    await page.getByRole('navigation',{name:'Sections'}).getByRole('link',{name:'Viewings',exact:true}).click();
    await page.getByRole('alert').filter({hasText:'Confirm the pending task result'}).waitFor();
    await page.getByRole('heading',{name:'Inbox',exact:true}).waitFor();
    await page.getByRole('button',{name:'Sign out',exact:true}).click();
    await page.getByRole('heading',{name:'Inbox',exact:true}).waitFor();
    await page.evaluate(()=>{location.hash='#/viewings';});
    await page.waitForFunction(()=>location.hash==='#/');
    await page.getByRole('button',{name:'Retry same change',exact:true}).click();
    await page.getByRole('alert').filter({hasText:'The task response could not be confirmed'}).waitFor();
    await page.getByRole('button',{name:'Retry same change',exact:true}).click();
    await page.getByText('Task details saved.',{exact:true}).waitFor();
    assert.equal(attempts.length,3);assert.deepEqual(attempts[0],attempts[1]);assert.deepEqual(attempts[0],attempts[2]);
    assert.equal((await request(colleague,`/api/admin/notification-tasks/${followup.id}`)).body.task.revision,detail.task.revision+1);
    await page.unroute(`**/api/admin/notification-tasks/${followup.id}`);

    await page.getByRole('group',{name:'Category',exact:true}).getByRole('button',{name:/^Viewings/}).click();
    await page.locator('.empty').filter({hasText:'all caught up'}).waitFor();
    await page.route('**/api/admin/notifications?box=action&category=matched',route=>route.fulfill({status:503,json:{error:'Synthetic list unavailable'}}),{times:1});
    await page.getByRole('group',{name:'Category',exact:true}).getByRole('button',{name:/^Matched/}).click();
    await page.getByRole('alert').filter({hasText:'Synthetic list unavailable'}).waitFor();
    await page.getByRole('button',{name:'Try again',exact:true}).click();await page.locator('.empty').waitFor();
    await page.goto(new URL('admin/#/viewings?viewing=900001',BASE).href);
    await page.locator('.inbox-detail').getByRole('heading',{name:/^Viewing task target/}).waitFor();
    await page.screenshot({path:join(SHOTS,'linked-viewing.png'),fullPage:true});
    await page.locator('.inbox-detail').getByText('More',{exact:true}).click();
    page.once('dialog',dialog=>dialog.accept());
    await page.getByRole('button',{name:'Delete viewing',exact:true}).click();
    await page.getByText('Viewing deleted.',{exact:true}).waitFor();
    assert.equal(await page.locator('.inbox-detail').getByRole('heading',{name:/^Viewing task target/}).count(),0);
    await page.goto(new URL('admin/#/viewings?viewing=999999',BASE).href);
    await page.getByRole('alert').filter({hasText:/not found/i}).waitFor();
    assert.equal(await page.locator('.inbox-detail').count(),0,'an invalid direct link never substitutes another viewing');
    await page.goto(new URL('admin/#/viewings?viewing=',BASE).href);
    await page.getByRole('alert').filter({hasText:'Invalid viewing ID'}).waitFor();
    assert.equal(await page.locator('.inbox-detail').count(),0,'an empty explicit ID never becomes the default viewing');
    assert.deepEqual(errors,[]);
    console.log('NOT-11 e2e: shared edits, conflict draft, personal reads, Done/Reopen, follow-up, preferences, exact viewing, keyboard, 390/1280 and zoom passed.');
    await ctx.close();await other.close();
  } catch(error) {
    if(debugPage){mkdirSync(SHOTS,{recursive:true});await debugPage.screenshot({path:join(SHOTS,'failure.png'),fullPage:true});
      writeFileSync(join(SHOTS,'failure.txt'),await debugPage.locator('body').innerText(),{mode:0o600});}
    throw error;
  } finally {await browser.close();}
})().catch(e=>{console.error(e.stack||e.message);process.exitCode=1;});
