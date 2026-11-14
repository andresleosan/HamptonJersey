// Executed only by the disposable local fixture; exercises the real listing-health endpoint.
const { chromium } = require(process.env.PW || 'playwright-core');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { parseEnv } = require('node:util');
const { execFileSync } = require('node:child_process');
const { join, dirname } = require('node:path');
const BASE = process.env.BASE, vars = parseEnv(readFileSync(process.env.E2E_VARS,'utf8'));
const wrangler = join(dirname(require.resolve('wrangler')),'..','bin','wrangler.js');
const sql = statement => execFileSync(process.execPath,[wrangler,'d1','execute','hampton','--local',
  '--persist-to',process.env.E2E_PERSIST,'--command',statement],{stdio:'pipe'});
(async()=>{
  assert.ok(BASE && process.env.E2E_PERSIST, 'isolated local fixture required');
  const day = new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Jersey',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const yesterday = new Date(Date.now()-86400000).toISOString().slice(0,10);
  // The shared seed's HE-R001 has 31 opens in 30 days; this check counts only its own 55 listings.
  sql(`DELETE FROM daily_stats WHERE metric='view';
    WITH RECURSIVE seq(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM seq WHERE n<55)
    INSERT INTO listings(id,use,title,operation,availability,published,created_at,updated_at)
    SELECT 'PUB17-'||printf('%03d',n),'residential','Review home '||n,'sale','for_sale',1,
    '2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z' FROM seq;
    INSERT INTO media(id,listing_id,r2_key,origin,kind,public,created_at)
    SELECT 'PUB17M'||replace(id,'-',''),id,'fixture/photo','upload','photo',1,'2026-01-01T00:00:00.000Z'
    FROM listings WHERE id LIKE 'PUB17-%';
    INSERT INTO daily_stats(day,listing_id,metric,n)
    SELECT '${day}',id,'view',30 FROM listings WHERE id LIKE 'PUB17-%';
    INSERT INTO viewing_requests(listing_id,kind,date,time,name,email,status,created_at) VALUES
    ('PUB17-001','In person','${day}','10:00','Synthetic visitor','visitor@example.test','requested','${yesterday}T12:00:00.000Z'),
    ('PUB17-001','In person','${day}','10:00','Synthetic visitor','visitor@example.test','requested','${yesterday}T24:59:59.000Z');`);
  const { signSession, COOKIE } = await import('../server/auth.js');
  const browser = await chromium.launch({executablePath:process.env.CHROME});
  try { for (const width of [1280,390]) {
    const ctx = await browser.newContext({viewport:{width,height:900},timezoneId:'Europe/Jersey'});
    await ctx.addCookies([{name:COOKIE,value:await signSession('admin@example.test',vars.SESSION_SECRET),
      domain:new URL(BASE).hostname,path:'/',httpOnly:true,secure:true,sameSite:'Strict'}]);
    const page=await ctx.newPage(), errors=[]; page.on('pageerror',e=>errors.push(e.message)); page.setDefaultTimeout(10000);
    await page.goto(new URL('admin/#/insights',BASE).href);
    const region=page.getByRole('region',{name:'Listings to review'});
    await region.getByRole('heading',{name:'Listings to review'}).waitFor();
    await region.getByText('Counts may be incomplete',{exact:true}).waitFor();
    await region.getByRole('table').waitFor();
    assert.equal(await region.locator('tbody tr').count(),50);
    const next=region.getByRole('button',{name:'Next page'}); await next.focus();
    assert.equal(await next.evaluate(e=>e===document.activeElement),true);
    if(width===1280){
      sql("UPDATE daily_stats SET n=31 WHERE listing_id='PUB17-055' AND metric='view'");
      await page.keyboard.press('Enter');
      await region.getByText('Results changed; reloaded from the first page.',{exact:true}).waitFor();
      assert.equal(await region.locator('tbody tr').count(),50);
    }
    await region.getByRole('button',{name:'Next page'}).click();
    await region.getByText('Page 2',{exact:true}).waitFor();
    assert.equal(await region.locator('tbody tr').count(),5);
    const previous=region.getByRole('button',{name:'Previous page'}); await previous.focus(); await page.keyboard.press('Enter');
    await region.getByText('Page 1',{exact:true}).waitFor();
    await page.getByRole('button',{name:'7 days',exact:true}).click();
    await region.getByText('Page 1',{exact:true}).waitFor();
    await page.evaluate(()=>{document.documentElement.style.zoom='2';});
    const overflow=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,
      elements:[...document.querySelectorAll('body *')].filter(e=>e.getBoundingClientRect().right>innerWidth+1 &&
        !e.closest('.table-scroll')).slice(0,15).map(e=>({tag:e.tagName,cls:e.className?.baseVal ?? String(e.className),
        right:Math.round(e.getBoundingClientRect().right)}))}));
    assert.ok(overflow.scroll<=overflow.width+1,`no page overflow at 200%: ${JSON.stringify(overflow)}`);
    await page.evaluate(()=>{document.documentElement.style.zoom='1';});
    if(width===390){
      let offline=true;
      const injectFailure=route=>offline ? route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Temporarily unavailable'})}) : route.continue();
      await page.route('**/api/admin/insights/listing-health**',injectFailure);
      await region.getByRole('button',{name:'Next page'}).click();
      await region.getByRole('alert').filter({hasText:'Temporarily unavailable'}).waitFor();
      assert.equal(await region.getByRole('table').count(),0);
      offline=false; await region.getByRole('button',{name:'Retry'}).click();
      await region.getByText('Page 2',{exact:true}).waitFor();
      await page.unroute('**/api/admin/insights/listing-health**',injectFailure);
      sql('DELETE FROM daily_stats');
      await page.reload();
      await page.getByRole('region',{name:'Listings to review'}).getByText('No listings meet this rule in the available records.',{exact:true}).waitFor();
    }
    assert.deepEqual(errors,[]); await ctx.close();
    console.log(`Listing health ${width}px: pagination, keyboard and 200% zoom passed.`);
  }} finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
