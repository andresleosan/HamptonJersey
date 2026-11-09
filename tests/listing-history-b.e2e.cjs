// SPR-02 B: isolated fixture, never uses production sessions or data.
const {chromium}=require(process.env.PW||'playwright-core');
const assert=require('node:assert/strict');
const {readFileSync,mkdirSync}=require('node:fs');
const {parseEnv}=require('node:util');
const {execFileSync}=require('node:child_process');
const {join,dirname}=require('node:path');
const BASE=process.env.BASE,vars=parseEnv(readFileSync(process.env.E2E_VARS,'utf8'));
const wrangler=join(dirname(require.resolve('wrangler')),'..','bin','wrangler.js');
const sql=s=>execFileSync(process.execPath,[wrangler,'d1','execute','hampton','--local','--persist-to',process.env.E2E_PERSIST,'--json','--command',s],{encoding:'utf8'});
(async()=>{
  assert.ok(BASE&&process.env.E2E_PERSIST,'isolated fixture required');
  const {signSession,COOKIE}=await import('../server/auth.js');
  sql(`INSERT INTO events(at,actor,entity_type,entity_id,type,data)
    VALUES('2026-11-09T11:00:00.000Z','admin@example.test','applicant','1','match.reviewed',
      json_object('listing_id','HE-R003','from','found','to','shortlisted','reason',NULL));
    INSERT INTO viewing_requests(listing_id,kind,date,time,name,email,status,created_at)
      VALUES('HE-R003','In person','2026-11-12','11:00','PRIVATE visitor','visitor@example.test','requested','2026-11-09T11:01:00.000Z');
    INSERT INTO events(at,actor,entity_type,entity_id,type,data)
      SELECT '2026-11-09T11:01:00.000Z','public','viewing',CAST(MAX(id) AS TEXT),'viewing.requested',
      json_object('listing_id','HE-R003','private','PRIVATE visitor') FROM viewing_requests;
    INSERT INTO offers(listing_id,applicant_id,amount,status,created_at,updated_at)
      VALUES('HE-R003',1,800000,'accepted','2026-11-09T11:02:00.000Z','2026-11-09T11:02:00.000Z');
    INSERT INTO sales(listing_id,applicant_id,offer_id,price,created_at,updated_at)
      VALUES('HE-R003',1,(SELECT MAX(id) FROM offers),800000,'2026-11-09T11:03:00.000Z','2026-11-09T11:03:00.000Z');
    INSERT INTO sale_milestones(sale_id,key) SELECT id,'passing' FROM sales WHERE listing_id='HE-R003';
    INSERT INTO events(at,actor,entity_type,entity_id,type,data)
      SELECT '2026-11-09T11:03:00.000Z','admin@example.test','applicant','1','offer.accepted',
        json_object('listing_id','HE-R003','offer_id',(SELECT MAX(id) FROM offers),'sale_id',(SELECT MAX(id) FROM sales),'private','PRIVATE buyer');`);
  const idOf=table=>Number(JSON.parse(sql(`SELECT MAX(id) AS id FROM ${table} WHERE listing_id='HE-R003'`))[0].results[0].id);
  const saleId=idOf('sales');let viewingId=idOf('viewing_requests');
  const browser=await chromium.launch({executablePath:process.env.CHROME});
  try{for(const width of [1280,390]){
    const ctx=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'});
    await ctx.addCookies([{name:COOKIE,value:await signSession('admin@example.test',vars.SESSION_SECRET),domain:new URL(BASE).hostname,path:'/',secure:true,httpOnly:true,sameSite:'Strict'}]);
    const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(15000);
    await page.goto(BASE+'admin/#/p/HE-R003');
    const history=page.getByRole('region',{name:'History',exact:true});
    if(width===1280){
      const saved=await page.evaluate(async id=>fetch(`/api/admin/sales/${id}/milestones/passing`,{
        method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({planned_on:'2026-11-12'})}).then(r=>r.status),saleId);
      assert.equal(saved,200,'use the real sale milestone route');
      await history.getByRole('button',{name:'Refresh history',exact:true}).click();
    }
    const initial=await page.evaluate(async()=>{
      const path='/api/admin/listings/HE-R003/history';const data=await fetch(path).then(r=>r.json());
      const check=async ids=>fetch(path+'/validate',{method:'POST',headers:{'content-type':'application/json'},
        body:JSON.stringify({ids})}).then(r=>r.status);
      const status=await check(data.items.map(i=>i.id));
      const stale=status===200?[]:(await Promise.all(data.items.map(async i=>({type:i.type,status:await check([i.id])}))))
        .filter(i=>i.status!==200);
      return {status,stale};
    });
    assert.equal(initial.status,200,JSON.stringify(initial.stale));
    await page.getByRole('navigation',{name:'Listing sections'}).getByRole('button',{name:'History',exact:true}).focus();await page.keyboard.press('Enter');
    await history.getByText('Match shortlisted',{exact:true}).waitFor();
    await history.getByText('Viewing requested',{exact:true}).waitFor();
    await history.getByText('Offer accepted',{exact:true}).waitFor();
    await history.getByText('Sale milestone updated',{exact:true}).waitFor();
    if(width===1280){const step=history.locator('ol > li').filter({hasText:'Sale milestone updated'}).first();
      await step.locator('summary').click();await step.getByText('Step state: Planned',{exact:true}).waitFor();}
    assert.equal(await history.locator('ol > li').count(),4);
    assert.ok(!(await history.innerText()).includes('PRIVATE'));
    const match=history.locator('ol > li').filter({hasText:'Match shortlisted'}).first();
    await match.locator('summary').click();await match.getByText('Decision: Found to Shortlisted',{exact:true}).waitFor();
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no horizontal overflow');
    if(process.env.HISTORY_B_SHOTS){mkdirSync(process.env.HISTORY_B_SHOTS,{recursive:true});await history.scrollIntoViewIfNeeded();await page.screenshot({path:join(process.env.HISTORY_B_SHOTS,`related-${width}.png`)});}
    await page.evaluate(()=>document.documentElement.style.zoom='2');await history.scrollIntoViewIfNeeded();
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no overflow at CSS zoom 200%');
    await page.evaluate(()=>document.documentElement.style.zoom='1');
    sql(`WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<55)
      INSERT INTO events(at,actor,entity_type,entity_id,type,data)
      SELECT '2026-11-10T12:00:00.000Z','system','viewing','${viewingId}','viewing.booked',NULL FROM n;`);
    await history.getByRole('button',{name:'Refresh history',exact:true}).click();
    await history.getByRole('button',{name:'Load older events',exact:true}).waitFor();
    const removed=await page.evaluate(async id=>fetch(`/api/admin/viewings/${id}`,{method:'DELETE'}).then(r=>r.status),viewingId);
    assert.equal(removed,200,'delete the viewing through its real route');
    const invalid=page.waitForResponse(r=>r.url().includes('/admin/listings/HE-R003/history?cursor=')&&r.status()===400);
    await history.getByRole('button',{name:'Load older events',exact:true}).click();
    await invalid;
    await history.getByText('History changed. Refresh history to continue.',{exact:true}).waitFor();
    assert.equal(await history.locator('ol > li').count(),0,'deleted viewing must disappear immediately on invalid cursor');
    assert.equal(await history.getByRole('button',{name:'Try again',exact:true}).count(),0);
    assert.equal(await page.evaluate(()=>document.activeElement?.id),'history-refresh');
    await history.getByRole('button',{name:'Refresh history',exact:true}).click();
    await page.waitForFunction(()=>document.querySelectorAll('#s-history ol > li').length===3);
    assert.equal(await history.getByText('Viewing requested',{exact:true}).count(),0);
    sql(`WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<55)
      INSERT INTO events(at,actor,entity_type,entity_id,type,data)
      SELECT '2026-11-13T12:00:00.000Z','system','listing','HE-R003','listing.updated',NULL FROM n;
      INSERT INTO viewing_requests(listing_id,kind,date,time,name,email,status,created_at)
        VALUES('HE-R003','In person','2026-11-15','11:00','PRIVATE nonanchor','visitor2@example.test','requested','2026-11-14T12:00:00.000Z');
      INSERT INTO events(at,actor,entity_type,entity_id,type,data)
        SELECT '2026-11-14T12:00:00.000Z','public','viewing',CAST(MAX(id) AS TEXT),'viewing.requested',
          json_object('listing_id','HE-R003','private','PRIVATE nonanchor') FROM viewing_requests;`);
    const nonanchorId=idOf('viewing_requests');
    await history.getByRole('button',{name:'Refresh history',exact:true}).click();
    await history.getByText('Viewing requested',{exact:true}).waitFor();
    await history.getByRole('button',{name:'Load older events',exact:true}).waitFor();
    const response=await page.evaluate(()=>fetch('/api/admin/listings/HE-R003/history').then(r=>r.json()));
    const anchor=JSON.parse(Buffer.from(response.next_cursor,'base64url'));
    assert.equal(JSON.parse(sql(`SELECT entity_type FROM events WHERE id=${anchor.before_id}`))[0].results[0].entity_type,'listing');
    assert.equal(await page.evaluate(async id=>fetch(`/api/admin/viewings/${id}`,{method:'DELETE'}).then(r=>r.status),nonanchorId),200);
    const stillValid=page.waitForResponse(r=>r.url().includes('/admin/listings/HE-R003/history?cursor=')&&r.status()===200);
    const invalidated=page.waitForResponse(r=>r.url().includes('/admin/listings/HE-R003/history/validate')&&r.status()===409);
    await history.getByRole('button',{name:'Load older events',exact:true}).click();
    await stillValid;await invalidated;
    await history.getByText('History changed. Refresh history to continue.',{exact:true}).waitFor();
    assert.equal(await history.locator('ol > li').count(),0,'nonanchor deletion must not remain in appended DOM');
    assert.equal(await page.evaluate(()=>document.activeElement?.id),'history-refresh');
    assert.deepEqual(errors,[]);console.log(`SPR-02 B ${width}: match, viewing, offer, keyboard, privacy, cursor recovery PASS`);
    await ctx.close();
    if(width===1280){
      sql(`DELETE FROM notifications WHERE event_id IN (SELECT id FROM events WHERE at='2026-11-13T12:00:00.000Z'
        AND entity_type='listing' AND entity_id='HE-R003');
        DELETE FROM events WHERE at='2026-11-13T12:00:00.000Z' AND entity_type='listing' AND entity_id='HE-R003';
        INSERT INTO viewing_requests(listing_id,kind,date,time,name,email,status,created_at)
        VALUES('HE-R003','In person','2026-11-12','11:00','PRIVATE visitor','visitor@example.test','requested','2026-11-09T11:01:00.000Z');
        INSERT INTO events(at,actor,entity_type,entity_id,type,data)
        SELECT '2026-11-09T11:01:00.000Z','public','viewing',CAST(MAX(id) AS TEXT),'viewing.requested',
          json_object('listing_id','HE-R003','private','PRIVATE visitor') FROM viewing_requests;`);
      viewingId=idOf('viewing_requests');
    }
  }
    const live=await browser.newContext({viewport:{width:1280,height:900},reducedMotion:'reduce'});
    await live.addCookies([{name:COOKIE,value:await signSession('admin@example.test',vars.SESSION_SECRET),
      domain:new URL(BASE).hostname,path:'/',secure:true,httpOnly:true,sameSite:'Strict'}]);
    const page=await live.newPage();await page.goto(BASE+'admin/#/p/HE-R001');
    const request=(route,method,body)=>page.evaluate(async({route,method,body})=>{
      const r=await fetch('/api'+route,{method,headers:body?{'content-type':'application/json'}:undefined,
        body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()};
    },{route,method,body});
    const buyer=await request('/admin/applicants','POST',{name:'PRIVATE route buyer',email:'route@example.test',
      source:'phone',operation:'buy',budget_max:900000});assert.equal(buyer.status,201,JSON.stringify(buyer.data));
    let matches=JSON.parse(sql(`SELECT id,status FROM matches WHERE applicant_id=${buyer.data.id} AND listing_id='HE-R001'`))[0].results;
    if(!matches.some(m=>m.status==='found')){
      sql(`INSERT OR IGNORE INTO matches(applicant_id,listing_id,score,checks,status,created_at,updated_at)
        VALUES(${buyer.data.id},'HE-R001',80,'[]','found','2026-11-09T11:00:00.000Z','2026-11-09T11:00:00.000Z')`);
      matches=JSON.parse(sql(`SELECT id,status FROM matches WHERE applicant_id=${buyer.data.id} AND listing_id='HE-R001'`))[0].results;
    }
    const match=matches.find(m=>m.status==='found');assert.ok(match,'review route requires an actual proposed match');
    const reviewed=await request(`/admin/matches/${match.id}`,'PUT',{from:'found',status:'shortlisted'});
    assert.equal(reviewed.status,200,JSON.stringify(reviewed.data));
    const {jerseyToday,plusDays}=await import('../server/viewings.js');
    const date=Array.from({length:7},(_,i)=>plusDays(jerseyToday(),i+1))
      .find(d=>{const day=new Date(d+'T12:00:00Z').getUTCDay();return day>=1&&day<=5;});
    const booked=await request('/admin/viewings','POST',{listing_id:'HE-R001',negotiator_id:1,kind:'In person',
      date,time:'11:00',name:'PRIVATE route visitor',email:'routevisitor@example.test'});
    assert.equal(booked.status,201,JSON.stringify(booked.data));
    const offered=await request('/admin/offers','POST',{listing_id:'HE-R001',applicant_id:buyer.data.id,amount:750000});
    assert.equal(offered.status,201,JSON.stringify(offered.data));
    const accepted=await request(`/admin/offers/${offered.data.offer.id}/accept`,'POST');
    assert.equal(accepted.status,201,JSON.stringify(accepted.data));
    const history=page.getByRole('region',{name:'History',exact:true});
    await page.getByRole('navigation',{name:'Listing sections'}).getByRole('button',{name:'History',exact:true}).click();
    await history.getByRole('button',{name:'Refresh history',exact:true}).click();
    for(const text of ['Match shortlisted','Viewing booked','Offer recorded','Offer accepted'])
      await history.getByText(text,{exact:true}).waitFor();
    const response=await request('/admin/listings/HE-R001/history','GET');assert.equal(response.status,200);
    const types=response.data.items.map(i=>i.type);
    for(const type of ['match.reviewed','viewing.booked','offer.recorded','offer.accepted'])assert.ok(types.includes(type));
    assert.ok(!JSON.stringify(response.data).includes('PRIVATE')&&!JSON.stringify(response.data).includes('750000'));
    assert.ok(!(await history.textContent()).includes('PRIVATE'));
    assert.equal(JSON.parse(sql(`SELECT COUNT(*) AS n FROM history_viewing_events WHERE viewing_id=${booked.data.id}`))[0].results[0].n,1);
    const removed=await request(`/admin/viewings/${booked.data.id}`,'DELETE');assert.equal(removed.status,200);
    await page.route('**/api/admin/listings/HE-R001/history',r=>r.fulfill({status:500,contentType:'application/json',
      body:'{"error":"Synthetic read failure"}'}),{times:1});
    await history.getByRole('button',{name:'Refresh history',exact:true}).click();
    await history.getByText("Couldn't load property history. Try again.",{exact:true}).waitFor();
    assert.ok(!(await history.textContent()).includes('Viewing booked'),
      'a failed refresh after real deletion must not leave linked viewing in any DOM text');
    await history.getByRole('button',{name:'Refresh history',exact:true}).click();
    await page.waitForFunction(()=>!document.querySelector('#s-history')?.textContent?.includes('Viewing booked'));
    assert.equal(JSON.parse(sql(`SELECT COUNT(*) AS n FROM history_viewing_events WHERE viewing_id=${booked.data.id}`))[0].results[0].n,0);
    sql(`INSERT INTO viewing_requests(listing_id,kind,date,time,name,email,status,created_at)
      VALUES('HE-R001','In person','2026-11-15','11:00','Synthetic paging','paging@example.test','requested','2026-11-09T11:00:00.000Z');
      WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<120)
      INSERT INTO events(at,actor,entity_type,entity_id,type,data)
      SELECT '2026-11-14T12:00:00.000Z','system','viewing',CAST((SELECT MAX(id) FROM viewing_requests) AS TEXT),
        'viewing.booked',NULL FROM n;`);
    await history.getByRole('button',{name:'Refresh history',exact:true}).click();
    await history.getByRole('button',{name:'Load older events',exact:true}).click();
    await page.waitForFunction(()=>document.querySelectorAll('#s-history ol > li').length===100);
    const validations=[];page.on('request',r=>{
      if(r.url().includes('/admin/listings/HE-R001/history/validate'))validations.push(r.postDataJSON()?.ids?.length);
    });
    await history.getByRole('button',{name:'Load older events',exact:true}).click();
    await page.waitForFunction(()=>document.querySelectorAll('#s-history ol > li').length>100);
    assert.deepEqual(validations,[await history.locator('ol > li').count()],
      'one snapshot validates old and newly fetched rows together');
    assert.ok(validations[0]>100);
    const pagingId=Number(JSON.parse(sql("SELECT id FROM viewing_requests WHERE email='paging@example.test'"))[0].results[0].id);
    sql(`WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<50)
      INSERT INTO events(at,actor,entity_type,entity_id,type,data)
      SELECT '2026-11-30T12:00:00.000Z','system','listing','HE-R001','listing.updated',NULL FROM n;`);
    await history.getByRole('button',{name:'Refresh history',exact:true}).click();
    await page.waitForFunction(()=>document.querySelectorAll('#s-history ol > li').length===50);
    let gotPage,releasePage;
    const fetched=new Promise(resolve=>{gotPage=resolve;});
    const release=new Promise(resolve=>{releasePage=resolve;});
    await page.route(url=>url.pathname==='/api/admin/listings/HE-R001/history'&&url.searchParams.has('cursor'),
      async route=>{const stale=await route.fetch();gotPage(await stale.json());await release;await route.fulfill({response:stale});},{times:1});
    await history.getByRole('button',{name:'Load older events',exact:true}).click();
    const stalePage=await fetched;
    assert.ok(stalePage.items.some(i=>i.type==='viewing.booked'));
    assert.equal((await request(`/admin/viewings/${pagingId}`,'DELETE')).status,200);
    const staleValidation=page.waitForResponse(r=>r.url().includes('/admin/listings/HE-R001/history/validate'));
    releasePage();const checked=await staleValidation;
    assert.equal(checked.status(),409,'newly fetched deleted row must be part of one validation snapshot');
    await history.getByText('History changed. Refresh history to continue.',{exact:true}).waitFor();
    assert.equal(await history.locator('ol > li').count(),0,
      'a deleted newly fetched row must never be appended after its delayed GET');
    assert.equal(await page.evaluate(()=>document.activeElement?.id),'history-refresh');
    sql(`INSERT INTO viewing_requests(listing_id,kind,date,time,name,email,status,created_at)
      VALUES('HE-R001','In person','2026-12-01','11:00','Synthetic refresh','refresh@example.test','requested','2026-11-09T11:00:00.000Z');
      INSERT INTO events(at,actor,entity_type,entity_id,type,data)
      SELECT '2026-12-01T12:00:00.000Z','public','viewing',CAST(MAX(id) AS TEXT),'viewing.requested',
        json_object('listing_id','HE-R001') FROM viewing_requests;`);
    const refreshId=Number(JSON.parse(sql("SELECT id FROM viewing_requests WHERE email='refresh@example.test'"))[0].results[0].id);
    let gotRefresh,releaseRefresh;
    const fetchedRefresh=new Promise(resolve=>{gotRefresh=resolve;});
    const releaseFresh=new Promise(resolve=>{releaseRefresh=resolve;});
    await page.route(url=>url.pathname==='/api/admin/listings/HE-R001/history'&&!url.search,
      async route=>{const stale=await route.fetch();gotRefresh(await stale.json());await releaseFresh;await route.fulfill({response:stale});},{times:1});
    await history.getByRole('button',{name:'Refresh history',exact:true}).click();
    const oldRefresh=await fetchedRefresh;assert.ok(oldRefresh.items.some(i=>i.type==='viewing.requested'));
    assert.equal((await request(`/admin/viewings/${refreshId}`,'DELETE')).status,200);
    const freshValidation=page.waitForResponse(r=>r.url().includes('/admin/listings/HE-R001/history/validate'));
    releaseRefresh();assert.equal((await freshValidation).status(),409,
      'a successful but outdated Refresh GET must be rechecked before render');
    await history.getByText('History changed. Refresh history to continue.',{exact:true}).waitFor();
    assert.equal(await history.locator('ol > li').count(),0);
    console.log('SPR-02 B real producers: match review, booking, offer, acceptance, deletion, JSON and DOM PASS');
    await live.close();
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
