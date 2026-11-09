// Isolated local fixture only: E2E_SCRIPT=tests/listing-history.e2e.cjs npm run test:e2e.
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
  const browser=await chromium.launch({executablePath:process.env.CHROME});
  try{for(const width of [1280,390]){
    sql(`DELETE FROM listing_marketing_evidence; DELETE FROM notifications; DELETE FROM listing_event_operations; DELETE FROM events;
      UPDATE listings SET published=1,availability='for_sale',archived_at=NULL,confirmed_at='2020-01-01T00:00:00.000Z',updated_at='2026-10-07T10:00:00.000Z' WHERE id='HE-R003';`);
    const ctx=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'});
    await ctx.addCookies([{name:COOKIE,value:await signSession('admin@example.test',vars.SESSION_SECRET),domain:new URL(BASE).hostname,path:'/',secure:true,httpOnly:true,sameSite:'Strict'}]);
    const page=await ctx.newPage(),errors=[];page.setDefaultTimeout(12000);
    page.on('pageerror',e=>errors.push(e.message));await page.route(/matterport\.com/,r=>r.abort());
    const api=(path,method='GET',body)=>page.evaluate(async({path,method,body})=>{const r=await fetch('/api'+path,{method,headers:body?{'content-type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()};},{path,method,body});
    await page.goto(BASE+'admin/#/p/HE-R003');
    const history=page.getByRole('region',{name:'History',exact:true});
    await page.getByRole('navigation',{name:'Listing sections'}).getByRole('button',{name:'History',exact:true}).focus();await page.keyboard.press('Enter');
    await page.waitForFunction(()=>document.activeElement?.id==='h-history');
    await history.getByText('No property events recorded yet. Earlier activity was not reconstructed.',{exact:true}).waitFor();
    // P2-1: invalid legacy TEXT dates keep pagination and never invent an age.
    sql(`WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<51)
      INSERT INTO events(at,actor,entity_type,entity_id,type,data) SELECT 'legacy-date','system','listing','HE-R003','listing.updated',NULL FROM n;
      INSERT INTO events(at,actor,entity_type,entity_id,type,data) VALUES
        ('2026-02-30T00:00:00.000Z','system','listing','HE-R003','listing.updated',NULL),
        ('1','system','listing','HE-R003','listing.updated',NULL);`);
    await history.getByRole('button',{name:'Refresh history',exact:true}).click();
    await history.getByRole('button',{name:'Load older events',exact:true}).waitFor();
    assert.equal(await history.getByText('Date unavailable',{exact:true}).count(),50,'invalid dates have an explicit fallback');
    assert.equal(await history.locator('time').count(),0,'invalid dates have no relative or machine-readable time');
    assert.doesNotMatch(await history.innerText(),/Invalid Date|\bnow\b/);
    await history.getByRole('button',{name:'Load older events',exact:true}).click();
    await page.waitForFunction(()=>document.querySelectorAll('#s-history ol > li').length===53);
    assert.equal(await history.getByText('Date unavailable',{exact:true}).count(),53,'normalised impossible dates and numeric text must not invent timestamps');
    assert.equal(await history.locator('time').count(),0);
    sql("DELETE FROM notifications; DELETE FROM events WHERE entity_type='listing' AND entity_id='HE-R003'");
    await history.getByRole('button',{name:'Refresh history',exact:true}).click();
    await history.getByText('No property events recorded yet. Earlier activity was not reconstructed.',{exact:true}).waitFor();
    await page.getByLabel('Sale price',{exact:true}).fill('845000');
    await page.getByLabel('Full description (one paragraph per line)').fill('PRIVATE synthetic history note');
    await page.getByRole('button',{name:'Save',exact:true}).click();await page.getByRole('status').filter({hasText:'Changes saved.'}).waitFor();
    await history.getByText('Property updated',{exact:true}).waitFor();await history.getByText('Event details',{exact:true}).click();
    await history.getByText('Description changed',{exact:true}).waitFor();assert.ok(!(await history.innerText()).includes('PRIVATE'));
    await history.getByText('No evidence reference recorded',{exact:true}).waitFor();
    sql("UPDATE listings SET confirmed_at='2020-01-01T00:00:00.000Z' WHERE id='HE-R003'");
    await page.reload();await history.getByText('Property updated',{exact:true}).waitFor();
    await page.getByLabel('Title',{exact:true}).fill(`Unsaved draft ${width}`);
    const caption=page.getByLabel('Caption for photo 1');await caption.fill('Unsaved photo caption');
    await history.getByRole('button',{name:'Refresh history',exact:true}).click();
    await history.getByText('Property updated',{exact:true}).waitFor();
    assert.equal(await page.getByLabel('Title',{exact:true}).inputValue(),`Unsaved draft ${width}`);assert.equal(await caption.inputValue(),'Unsaved photo caption');
    await page.getByRole('button',{name:'Still available',exact:true}).click();await history.getByText('Availability confirmed by staff',{exact:true}).waitFor();
    assert.equal(await page.getByLabel('Title',{exact:true}).inputValue(),`Unsaved draft ${width}`);
    // Same-date fixtures exercise keyset pagination and a failed continuation without losing rows or draft.
    sql(`WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<120)
      INSERT INTO events(at,actor,entity_type,entity_id,type,data) SELECT '2026-11-01T12:00:00.000Z','system','listing','HE-R003','listing.updated',NULL FROM n;`);
    await history.getByRole('button',{name:'Refresh history',exact:true}).click();await history.getByRole('button',{name:'Load older events',exact:true}).waitFor();
    assert.equal(await history.locator('ol > li').count(),50);
    await page.route('**/api/admin/listings/HE-R003/history?cursor=*',r=>r.fulfill({status:500,contentType:'application/json',body:'{"error":"Fixture failure"}'}),{times:1});
    await history.getByRole('button',{name:'Load older events',exact:true}).click();await history.getByRole('alert').waitFor();
    assert.equal(await history.locator('ol > li').count(),50);
    await history.getByRole('button',{name:'Try again',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('#s-history ol > li').length===100);
    await page.waitForFunction(()=>document.activeElement===document.querySelector('#s-history ol > li:nth-child(51) h3'));
    await history.getByRole('button',{name:'Load older events',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('#s-history ol > li').length===122);
    await page.waitForFunction(()=>document.activeElement===document.querySelector('#s-history ol > li:nth-child(101) h3'));
    assert.equal(await page.getByLabel('Title',{exact:true}).inputValue(),`Unsaved draft ${width}`);assert.equal(await caption.inputValue(),'Unsaved photo caption');
    // Network failure on refresh retains loaded rows and supports retry.
    await page.route('**/api/admin/listings/HE-R003/history',r=>r.abort(),{times:1});await history.getByRole('button',{name:'Refresh history',exact:true}).click();await history.getByRole('alert').waitFor();
    assert.equal(await history.locator('ol > li').count(),122);await history.getByRole('button',{name:'Try again',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('#s-history ol > li').length===50);
    const before=(await api('/admin/listings/HE-R003/history')).data;
    assert.ok(!JSON.stringify(before).includes('PRIVATE'));assert.equal(await history.locator('time[datetime]').count()>0,true);
    assert.equal(await history.locator('img,a[href*="media"]').count(),0);
    await history.locator('summary').first().focus();await page.keyboard.press('Enter');
    assert.equal(await history.locator('details').first().getAttribute('open'),'');
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no overflow');
    await history.getByRole('button',{name:'Refresh history',exact:true}).focus();
    assert.notEqual(await page.evaluate(()=>getComputedStyle(document.activeElement).outlineStyle),'none');
    if(process.env.HISTORY_SHOTS){mkdirSync(process.env.HISTORY_SHOTS,{recursive:true});await history.scrollIntoViewIfNeeded();await page.screenshot({path:join(process.env.HISTORY_SHOTS,`history-${width}.png`)});}
    await page.evaluate(()=>document.documentElement.style.zoom='2');await history.scrollIntoViewIfNeeded();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no overflow at zoom 200%');
    if(process.env.HISTORY_SHOTS)await page.screenshot({path:join(process.env.HISTORY_SHOTS,`history-${width}-zoom.png`)});
    await page.evaluate(()=>document.documentElement.style.zoom='1');
    await page.getByRole('button',{name:'Discard',exact:true}).click();
    // Evidence is text only, with Jersey DST and separate record/declared dates.
    sql(`INSERT INTO listing_marketing_evidence(listing_id,event_id,evidence_ref,source_id,action,reason_code,occurred_at,evidence_snapshot)
      VALUES('HE-R003',(SELECT MAX(id) FROM events),'source:HISTORY-EVIDENCE','HISTORY-EVIDENCE','let_agreed','agreement','2026-03-29T01:30:00.000Z','{"url":"https://private.example.test","label":"PRIVATE"}');`);
    await history.getByRole('button',{name:'Refresh history',exact:true}).click();
    const evidence=history.locator('details').filter({hasText:'Recorded reference: source:HISTORY-EVIDENCE'});
    await evidence.locator('summary').click();
    await history.getByText('Recorded reference: source:HISTORY-EVIDENCE',{exact:true}).waitFor();await history.getByText(/29 Mar 2026, 02:30/).waitFor();
    assert.ok(!(await history.innerText()).includes('private.example.test'));
    // P2-3: same editor instance, dirty fields/photos, externally deleted, then explicit Reload.
    await page.route('**/api/admin/listings/HE-R003/unpublish',r=>r.fulfill({status:409,contentType:'application/json',body:'{"error":"Fixture version changed"}'}),{times:1});
    await page.getByRole('button',{name:'Unpublish',exact:true}).click();
    await page.getByRole('button',{name:'Reload listing',exact:true}).waitFor();
    await page.getByLabel('Title',{exact:true}).fill('Stale deleted draft');await caption.fill('Stale deleted photo');
    await page.getByText('Unsaved changes',{exact:true}).waitFor();
    const current=(await api('/admin/listings/HE-R003')).data.listing;
    assert.equal((await api('/admin/listings/HE-R003/archive','POST',{updated_at:current.updated_at})).status,200);
    assert.equal((await api('/admin/listings/HE-R003','DELETE',{confirm:'HE-R003'})).status,200);
    await page.getByRole('button',{name:'Reload listing',exact:true}).click();
    await page.getByText('Property deleted. Its recorded history is kept.',{exact:true}).waitFor();
    assert.equal(await page.getByRole('region',{name:'Actions',exact:true}).count(),0);assert.equal(await page.getByLabel('Title',{exact:true}).count(),0);
    assert.equal(await page.getByText('Unsaved changes',{exact:true}).count(),0);
    assert.ok(!(await page.locator('body').innerText()).includes('Stale deleted draft'));
    assert.equal(await page.evaluate(()=>{const e=new Event('beforeunload',{cancelable:true});window.dispatchEvent(e);return e.defaultPrevented;}),false,'deleted editor clears the global unsaved guard');
    const leaveDialogs=[],leaveDialog=async d=>{leaveDialogs.push(d.message());await d.dismiss();};page.on('dialog',leaveDialog);
    await page.getByRole('link',{name:'Back to listings',exact:true}).click();
    assert.deepEqual(leaveDialogs,[],'leaving the tombstone must not ask about discarded drafts');
    await page.waitForURL('**/admin/#/listings');page.off('dialog',leaveDialog);
    await page.goto(BASE+'admin/#/p/HE-R999');await page.getByRole('alert').filter({hasText:'Listing not found'}).waitFor();
    await page.route('**/api/admin/listings/HE-R002',r=>r.fulfill({status:500,contentType:'application/json',body:'{"error":"Fixture server error"}'}),{times:1});
    await page.goto(BASE+'admin/#/p/HE-R002');await page.getByRole('alert').filter({hasText:'Fixture server error'}).waitFor();assert.equal(await page.getByText('Property deleted. Its recorded history is kept.').count(),0);
    assert.deepEqual(errors,[]);console.log(`History ${width}: flow, draft/photos, errors/retry, pagination, evidence, deleted, focus, zoom PASS`);
    await ctx.close();
    // Restore only fixture data for the next width.
    if(width===1280)sql(`INSERT INTO listings(id,use,title,operation,availability,country,sale_price,currency,specs,published,created_at,updated_at,updated_by) VALUES('HE-R003','residential','History fixture','sale','for_sale','Jersey',800000,'GBP','[]',1,'2026-10-07T10:00:00.000Z','2026-10-07T10:00:00.000Z','system'); DELETE FROM deleted_listings WHERE id='HE-R003'; INSERT INTO media(id,listing_id,r2_key,origin,kind,public,position,created_at) VALUES('HISTORY-PHOTO','HE-R003','fixture.jpg','hampton','photo',1,0,'2026-10-07T10:00:00.000Z');`);
  }}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
