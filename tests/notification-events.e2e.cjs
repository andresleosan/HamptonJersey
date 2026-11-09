// Local isolated fixture only: E2E_SCRIPT=tests/notification-events.e2e.cjs npm run test:e2e
const {chromium}=require(process.env.PW||'playwright-core');
const assert=require('node:assert/strict');
const {readFileSync,mkdirSync}=require('node:fs');
const {parseEnv}=require('node:util');
const {execFileSync}=require('node:child_process');
const {join,dirname}=require('node:path');
const BASE=process.env.BASE,vars=parseEnv(readFileSync(process.env.E2E_VARS,'utf8'));
const wrangler=join(dirname(require.resolve('wrangler')),'..','bin','wrangler.js');
const sql=s=>execFileSync(process.execPath,[wrangler,'d1','execute','hampton','--local','--persist-to',process.env.E2E_PERSIST,'--json','--command',s],{encoding:'utf8'});
const at=new Date().toISOString();
const SHOTS=process.env.NOT01_SHOTS;
(async()=>{
  assert.ok(BASE&&process.env.E2E_PERSIST,'isolated fixture required');
  sql(`DELETE FROM notifications;
    INSERT INTO landlords(id,name,created_at,updated_at) VALUES(880001,'Context fixture landlord','${at}','${at}');
    INSERT INTO rentals(id,landlord_id,address,parish,service,fee_percent,created_at,updated_at)
      VALUES(880001,880001,'Context fixture rental','St Helier','full',10,'${at}','${at}');
    INSERT INTO tenancies(id,rental_id,tenant_name,kind,regime,start_on,ended_on,rent,due_day,payment_ref,created_at,updated_at)
      VALUES(880001,880001,'Past context fixture','periodic','2011','2023-01-01','2025-01-01',100,1,'HE-T880001','${at}','${at}'),
      (880002,880001,'Current context fixture','periodic','2025','2026-01-01',NULL,100,1,'HE-T880002','${at}','${at}');
    INSERT INTO payments(id,tenancy_id,received_on,amount,kind,source,created_at) VALUES(880001,880001,'2023-01-01',12345,'rent','manual','${at}');
    INSERT INTO repairs(id,rental_id,tenancy_id,title,urgency,created_at,updated_at)
      VALUES(880001,880001,880001,'Repair context fixture <img onerror=alert(1)>','emergency','${at}','${at}');
    INSERT INTO compliance_items(rental_id,kind) VALUES(880001,'licence');
    INSERT INTO contacts(id,name,email,last_activity_at,created_at,updated_at) VALUES(880001,'Context fixture buyer','context@example.test','${at}','${at}','${at}');
    INSERT INTO applicants(id,contact_id,operation,source,created_at,updated_at) VALUES(880001,880001,'buy','phone','${at}','${at}');
    UPDATE listings SET operation='sale',availability='for_sale' WHERE id='HE-R001';
    INSERT INTO offers(id,listing_id,applicant_id,amount,status,created_at,updated_at)
      VALUES(880001,'HE-R001',880001,1111,'accepted','${at}','${at}'),(880002,'HE-R001',880001,2222,'withdrawn','${at}','${at}');
    INSERT INTO sales(id,listing_id,applicant_id,offer_id,price,created_at,updated_at) VALUES(880001,'HE-R001',880001,880001,1111,'${at}','${at}');
    INSERT INTO sale_milestones(sale_id,key,planned_on) VALUES(880001,'mortgage','2026-01-01');
    INSERT INTO events(at,actor,entity_type,entity_id,type) VALUES('${at}','system','rental','880001','fixture.context');
    INSERT INTO notifications(event_id,task_key,category,title,action_required,created_at,target_kind,target_id,target_context)
      SELECT MAX(id),'fixture:repair','task','Repair task fixture',1,'${at}','rental','880001','{"tenancy_id":880001,"repair_id":880001}' FROM events;`);
  const {signSession,COOKIE}=await import('../server/auth.js');
  const browser=await chromium.launch({executablePath:process.env.CHROME});
  try{for(const width of [1280,390]){
    const context=await browser.newContext({viewport:{width,height:900},timezoneId:'Europe/Jersey'});
    await context.grantPermissions(['notifications']);
    await context.addCookies([{name:COOKIE,value:await signSession('admin@example.test',vars.SESSION_SECRET),domain:new URL(BASE).hostname,path:'/',secure:true,httpOnly:true,sameSite:'Strict'}]);
    const page=await context.newPage(),errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error('Browser error:',e.message);});
    await page.goto(new URL('admin/#/',BASE).href);
    await page.getByRole('heading',{name:'Inbox',exact:true}).waitFor();
    await page.getByRole('link',{name:'Open rental',exact:true}).click();
    await page.locator('#repair-880001:focus').waitFor();
    assert.match(await page.locator('#repair-880001').innerText(),/<img onerror=alert\(1\)>/);assert.equal(await page.locator('#repair-880001 img').count(),0);
    assert.equal(await page.locator('#tenancy-880001').isVisible(),true,'past selection opens its fold');
    await page.goto(new URL('admin/#/rentals/880001?tenancy=999999',BASE).href);
    await page.getByRole('alert').filter({hasText:'The linked tenancy is no longer available on this property.'}).waitFor();
    await page.goto(new URL('admin/#/rentals?payment=880001',BASE).href);
    await page.getByRole('heading',{name:'Payment 880001',exact:true}).waitFor();
    await page.locator('#linked-payment').getByText(/£123\.45/).waitFor();
    assert.match(await page.locator('#linked-payment').innerText(),/£123\.45/);assert.equal(await page.locator('#linked-payment').getByRole('button',{name:/Assign/}).count(),0);
    await page.locator('#linked-payment').getByRole('link',{name:'Open tenancy',exact:true}).click();await page.locator('#tenancy-880001:focus').waitFor();
    await page.goto(new URL('admin/#/rentals?payments=unmatched',BASE).href);await page.locator('#h-unmatched:focus').waitFor();
    await page.goto(new URL('admin/#/sales?offer=880002',BASE).href);await page.getByRole('heading',{name:'Offer 880002',exact:true}).waitFor();
    await page.locator('#linked-offer').getByText(/£2,222/).waitFor();
    assert.match(await page.locator('#linked-offer').innerText(),/£2,222/);assert.match(await page.locator('#linked-offer').innerText(),/Withdrawn/);
    await page.goto(new URL('admin/#/sales/880001?milestone=mortgage',BASE).href);await page.locator('#step-mortgage:focus').waitFor();
    await page.goto(new URL('admin/#/sales/880001?milestone=unknown',BASE).href);await page.getByRole('alert').filter({hasText:'The linked milestone is no longer available.'}).waitFor();
    await page.goto(new URL('admin/#/rentals?payment=999999',BASE).href);await page.getByRole('alert').filter({hasText:'Payment not found'}).waitFor();
    await page.goto(new URL('admin/#/',BASE).href);await page.getByRole('heading',{name:'Inbox',exact:true}).waitFor();
    await page.getByRole('combobox',{name:'Assigned to',exact:true}).selectOption('admin@example.test');
    sql(`WITH RECURSIVE x(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM x WHERE n<205)
      INSERT INTO notifications(event_id,task_key,category,title,action_required,created_at)
      SELECT (SELECT MAX(id) FROM events),'window:${width}:'||n,'task','Older window fixture '||n,1,'2000-01-01T00:00:00.000Z' FROM x;`);
    await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
    await page.getByRole('heading',{name:'Repair task fixture',exact:true}).waitFor();
    assert.equal(await page.getByRole('combobox',{name:'Assigned to',exact:true}).inputValue(),'admin@example.test');
    assert.equal(await page.locator('.inbox-list button[aria-current=true]').textContent().then(t=>t.includes('Repair task fixture')),true);
    await page.getByRole('button',{name:'Discard task changes',exact:true}).click();
    await page.getByText('Urgent browser alerts',{exact:true}).click();
    const baseline=page.waitForResponse(r=>r.url().endsWith('/api/admin/notification-alerts'));
    await page.getByRole('button',{name:'Enable browser alerts',exact:true}).click();assert.equal((await baseline).status(),200);
    await page.getByRole('button',{name:'Turn off browser alerts',exact:true}).click();
    await page.evaluate(()=>document.documentElement.style.zoom='2');
    const layout=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,viewport:innerWidth,
      offenders:[...document.querySelectorAll('main *,header *')].filter(e=>e.getClientRects().length&&e.getBoundingClientRect().right>innerWidth+1).slice(0,8).map(e=>({tag:e.tagName,id:e.id,class:e.className,right:e.getBoundingClientRect().right}))}));
    assert.ok(layout.scroll<=layout.viewport+1,`no whole-page overflow at200%: ${JSON.stringify(layout)}`);
    await page.locator('.task-controls').scrollIntoViewIfNeeded();
    await page.getByRole('combobox',{name:'Assigned to',exact:true}).focus();
    assert.equal(await page.getByRole('combobox',{name:'Assigned to',exact:true}).evaluate(e=>{
      const r=e.getBoundingClientRect(),hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);
      return r.top>=0&&r.bottom<=innerHeight&&(hit===e||e.contains(hit));
    }),true,'a focused task field remains visible above the page, including at200%');
    if(SHOTS){mkdirSync(SHOTS,{recursive:true});await page.screenshot({path:join(SHOTS,`not01-${width}-zoom.png`)});}
    assert.deepEqual(errors,[]);sql(`DELETE FROM notifications WHERE task_key LIKE 'window:${width}:%'`);await context.close();
  }console.log('NOT-01 e2e OK (1280,390,exact targets,empty,error,XSS,draft outside200,zoom)');}
  finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
