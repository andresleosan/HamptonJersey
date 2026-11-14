// Disposable local fixture only; run through test:e2e:isolated.
const {chromium}=require(process.env.PW||'playwright-core');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {parseEnv}=require('node:util');
const {execFileSync}=require('node:child_process');
const {join,dirname}=require('node:path');
const BASE=process.env.BASE,vars=parseEnv(readFileSync(process.env.E2E_VARS,'utf8'));
const wrangler=join(dirname(require.resolve('wrangler')),'..','bin','wrangler.js');
const sql=s=>execFileSync(process.execPath,[wrangler,'d1','execute','hampton','--local','--persist-to',process.env.E2E_PERSIST,'--json','--command',s],{encoding:'utf8'});
const quote=s=>`'${s.replaceAll("'","''")}'`;

(async()=>{
  assert.ok(BASE&&process.env.E2E_PERSIST,'isolated fixture required');
  const {signSession,COOKIE}=await import('../server/auth.js');
  // The isolated runner installs canonical migrations, including combined 0052.
  const marker=JSON.parse(sql('SELECT version FROM pub06_structured_costs WHERE singleton=1'));
  assert.equal(marker[0].results[0].version,1,'canonical combined schema required');
  const browser=await chromium.launch({executablePath:process.env.CHROME});
  try{
    for(const [width,timezoneId] of [[1280,'Europe/Jersey'],[390,'America/Los_Angeles'],[390,'Pacific/Kiritimati']]){
      const marker='SYNTHETIC_PRIVATE_AVAILABILITY';
      const records=[
        {type:'listing.created',data:{revision:1,fields:['available_on'],after:{available_on:'2028-02-29'}}},
        {type:'listing.updated',data:{revision:2,fields:['available_on'],before:{available_on:null},after:{available_on:'2028-02-29'}}},
        {type:'listing.updated',data:{revision:3,fields:['available_on'],before:{available_on:'2028-02-29'},after:{available_on:'2029-03-01'}}},
        {type:'listing.updated',data:{revision:4,fields:['available_on'],before:{available_on:'2029-03-01'},after:{available_on:null}}},
        {type:'listing.updated',data:{revision:5,fields:['available_on'],before:{available_on:marker},after:{available_on:null}}},
        {type:'listing.updated',data:{revision:6,fields:['available_on'],before:{},after:{}}},
        {type:'listing.updated',data:{revision:7,fields:['available_on'],before:{available_on:null},after:{available_on:'2028-02-29T00:00:00+14:00'}}},
      ];
      sql(`DELETE FROM listing_marketing_evidence; DELETE FROM notifications; DELETE FROM listing_event_operations; DELETE FROM events;
        UPDATE listings SET available_on=${quote(marker)},parish='St Saviour',published=1,availability='for_sale',archived_at=NULL WHERE id='HE-R003';
        INSERT INTO events(at,actor,entity_type,entity_id,type,data) VALUES ${records.map((r,i)=>
          `('2026-11-01T12:00:0${i}.000Z','system','listing','HE-R003',${quote(r.type)},${quote(JSON.stringify(r.data))})`).join(',')};`);
      const context=await browser.newContext({viewport:{width,height:900},timezoneId,reducedMotion:'reduce'});
      await context.addCookies([{name:COOKIE,value:await signSession('admin@example.test',vars.SESSION_SECRET),
        domain:new URL(BASE).hostname,path:'/',secure:true,httpOnly:true,sameSite:'Strict'}]);
      const page=await context.newPage(),errors=[];page.setDefaultTimeout(12000);page.on('pageerror',error=>errors.push(error.message));
      await page.goto(BASE+'admin/#/p/HE-R003');
      const history=page.getByRole('region',{name:'History',exact:true});
      await page.getByRole('navigation',{name:'Listing sections'}).getByRole('button',{name:'History',exact:true}).focus();
      await page.keyboard.press('Enter');await page.waitForFunction(()=>document.activeElement?.id==='h-history');
      const expectChange=async(revision,label,terms,values)=>{
        const row=history.locator('ol > li').filter({hasText:`Revision ${revision}`});
        const details=row.locator('details'),summary=details.locator('summary');
        await summary.focus();await page.keyboard.press('Enter');assert.equal(await details.getAttribute('open'),'');
        const change=details.locator('.history-changes > li').filter({hasText:'Available from'});
        assert.equal(await change.locator('span').first().innerText(),label);
        assert.deepEqual(await change.locator('dt').allTextContents(),terms);
        assert.deepEqual(await change.locator('dd').allTextContents(),values);
        return change;
      };
      const made=await expectChange(1,'Available from',['After'],['29 Feb 2028']);
      assert.equal(await made.locator('time[datetime="2028-02-29"]').count(),1);
      await expectChange(2,'Available from set',['Before','After'],['Not recorded','29 Feb 2028']);
      await expectChange(3,'Available from changed',['Before','After'],['29 Feb 2028','1 Mar 2029']);
      await expectChange(4,'Available from cleared',['Before','After'],['1 Mar 2029','Not recorded']);
      await expectChange(5,'Available from changed',['Before','After'],['Unknown in this event','Not recorded']);
      await expectChange(6,'Available from changed',['Before','After'],['Unknown in this event','Unknown in this event']);
      await expectChange(7,'Available from changed',['Before','After'],['Not recorded','Unknown in this event']);
      assert.equal((await history.innerText()).includes(marker),false);
      const response=await page.evaluate(async()=>await (await fetch('/api/admin/listings/HE-R003/history')).json());
      assert.equal(JSON.stringify(response).includes(marker),false);
      await page.getByLabel('Available from',{exact:true}).fill('2028-02-29');
      await page.getByRole('button',{name:'Save',exact:true}).click();
      await page.getByRole('status').filter({hasText:'Changes saved.'}).waitFor();
      await expectChange(8,'Available from changed',['Before','After'],['Unknown in this event','29 Feb 2028']);
      const newEvent=JSON.parse(sql("SELECT data FROM events WHERE entity_type='listing' AND entity_id='HE-R003' ORDER BY id DESC LIMIT 1"));
      assert.equal(JSON.stringify(newEvent).includes(marker),false,'the local trigger must not copy the legacy text');
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no horizontal overflow');
      const initialWidth=await page.evaluate(()=>innerWidth);
      if(process.env.HAMPTON_E2E_BROWSER==='webkit'){
        execFileSync('python3',['tests/e2e-x11-zoom.py','in']);
        await page.waitForFunction(w=>innerWidth<=w/2,initialWidth);
      }else await page.setViewportSize({width:Math.floor(width/2),height:900});
      const summary=history.locator('summary').first();await summary.scrollIntoViewIfNeeded();await summary.focus();
      assert.equal(await summary.evaluate(el=>document.activeElement===el),true);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no overflow at 200%');
      if(process.env.HAMPTON_E2E_BROWSER==='webkit')execFileSync('python3',['tests/e2e-x11-zoom.py','reset']);
      assert.deepEqual(errors,[]);
      await context.close();console.log(`SPR-01 History: ${width}px ${timezoneId} passed`);
    }
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
