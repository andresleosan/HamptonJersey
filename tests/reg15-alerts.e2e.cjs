const assert=require('node:assert/strict');
const {chromium,webkit}=require(process.env.PW||'playwright-core');
// REG-15: «Save this search» with synthetic fixtures only. Off: no link and the page says it is not available.
(async()=>{
 assert.equal(process.env.HAMPTON_E2E_ISOLATED,'1');assert.equal(process.env.E2E_PRODUCTION_READONLY,'0');
 const browser=await(process.env.HAMPTON_E2E_BROWSER==='webkit'?webkit:chromium).launch({executablePath:process.env.CHROME});
 try{for(const width of [1280,390]){
  const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'}),page=await context.newPage();let enabled=false;const sent=[];
  await page.route('https://challenges.cloudflare.com/turnstile/v0/api.js*',route=>route.fulfill({contentType:'text/javascript',body:`window.turnstile={render(){window.__alertsWidget=true;return 'fixture'},getResponse(){return 'fixture'},reset(){}};const ready=setInterval(()=>{if(window.onTurnstile){clearInterval(ready);window.onTurnstile()}},20);`}));
  await page.route('**/api/config',route=>route.fulfill({json:{turnstileSiteKey:'fixture',chat:false,...(enabled?{savedSearches:true}:{})}}));
  await page.route('**/api/saved-searches/availability',route=>enabled?route.fulfill({json:{available:true,privacy_version:'notice-v1',options:{parishes:['St Helier','St Ouen'],property_types:[['flat','Flat'],['house','House']],operation:[['rent','To Let'],['buy','To Buy']]}}}):route.fulfill({status:404,json:{error:'Not found'}}));
  await page.route('**/api/saved-searches',async route=>{sent.push(route.request().postDataJSON());await route.fulfill({status:202,json:{ok:true}});});
  await page.goto(new URL('/properties',process.env.BASE).href);await page.locator('.reg-cta').first().waitFor();
  assert.equal(await page.locator('a[href="#/alerts"]').count(),0);
  await page.goto(new URL('/#/alerts',process.env.BASE).href);await page.getByText('Property alerts are not available yet.',{exact:false}).waitFor();
  assert.equal(await page.locator('form.alerts-form').count(),0);
  enabled=true;await page.goto(new URL('/properties',process.env.BASE).href);
  const link=page.locator('.reg-cta a[href="#/alerts"]').first();await link.waitFor();await link.click();
  const form=page.locator('form.alerts-form');await form.waitFor();await page.waitForFunction(()=>window.__alertsWidget===true);
  await form.getByRole('button',{name:'Save this search'}).click();await form.getByRole('alert').filter({hasText:'Choose To Let or To Buy.'}).waitFor();
  await form.locator('[name=operation]').selectOption('rent');await form.locator('[name=budget_max]').fill('2500');await form.locator('[name=bedrooms_min]').selectOption('2');
  await form.getByLabel('St Helier').check();await form.getByLabel('Flat').check();await form.locator('[name=email]').fill('visitor@example.test');
  await form.getByRole('button',{name:'Save this search'}).click();await form.getByRole('alert').filter({hasText:'Tick the box'}).waitFor();assert.equal(sent.length,0);
  await form.locator('[name=consent]').check();
  if(width===390){const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);assert.equal(overflow,false);}
  await form.getByRole('button',{name:'Save this search'}).click();await page.getByText('We sent you a link.',{exact:false}).waitFor();
  assert.deepEqual(sent,[{email:'visitor@example.test',operation:'rent',budget_max:2500,bedrooms_min:2,parishes:['St Helier'],property_types:['flat'],consent:true,privacy_version:'notice-v1',turnstile:'fixture'}]);
  const stored=await page.evaluate(()=>JSON.stringify(localStorage)+JSON.stringify(sessionStorage)+location.href);assert.equal(stored.includes('visitor@example.test'),false);
  await context.close();
 }}finally{await browser.close()}
 console.log('REG-15 synthetic saved search: hidden while off, form, consent, no persisted PII, 390/1280 PASS');
})().catch(e=>{console.error(e);process.exitCode=1});
