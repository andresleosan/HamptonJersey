const assert=require('node:assert/strict');
const {chromium,webkit}=require(process.env.PW||'playwright-core');
(async()=>{
 assert.equal(process.env.HAMPTON_E2E_ISOLATED,'1');assert.equal(process.env.E2E_PRODUCTION_READONLY,'0');
 const browser=await(process.env.HAMPTON_E2E_BROWSER==='webkit'?webkit:chromium).launch({executablePath:process.env.CHROME});
 try{for(const width of [1280,390]){
  const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'}),page=await context.newPage();let enabled=false,sent=[];
  await page.route('https://challenges.cloudflare.com/turnstile/v0/api.js*',route=>route.fulfill({contentType:'text/javascript',body:`window.turnstile={render(){return 'fixture'},getResponse(){return 'fixture'},reset(){}};setTimeout(()=>window.onTurnstile&&window.onTurnstile(),200);`}));
  await page.route('**/api/config',route=>route.fulfill({json:{turnstileSiteKey:'fixture',chat:false}}));
  await page.route('**/api/owner-requests/availability',route=>route.fulfill({json:enabled?{available:true,privacy_version:'notice-v1'}:{available:false}}));
  await page.route('**/api/owner-requests',async route=>{sent.push(route.request().postDataJSON());await route.fulfill(sent.length===1?{status:503,json:{error:'Temporarily unavailable'}}:{status:201,json:{ok:true}});});
  await page.goto(new URL('/#/owners',process.env.BASE).href);await page.getByText('Online requests are not available yet. Please contact the office.').waitFor();assert.equal(await page.locator('form.owner-form').count(),0);
  enabled=true;await page.reload();const form=page.locator('form.owner-form');await form.waitFor();
  await form.locator('[name=name]').fill('Synthetic Owner');await form.locator('[name=phone]').fill('07700123456');await form.locator('[name=email]').fill('owner@example.test');await form.locator('[name=address]').fill('12 Example Street');await form.locator('[name=operation]').selectOption('sale');
  const notice=form.getByRole('link',{name:'privacy notice (opens in a new tab)'});await notice.focus();assert.equal(await notice.evaluate(e=>document.activeElement===e),true);
  assert.equal(await notice.getAttribute('rel'),'noopener noreferrer');
  if(width===390)await page.evaluate(()=>{document.body.style.zoom='200%'});
  await form.getByRole('button',{name:'Send request'}).click();await form.getByRole('alert').getByText('Temporarily unavailable').waitFor();
  await form.getByRole('button',{name:'Send request'}).click();await page.getByText('Thank you. Hampton Estates will contact you.').waitFor();
  assert.equal(sent.length,2);assert.equal(sent[0].request_id,sent[1].request_id);assert.equal(sent[0].valuation_requested,false);
  const stored=await page.evaluate(()=>JSON.stringify(localStorage));assert.equal(stored.includes('Synthetic Owner'),false);assert.equal(stored.includes('owner@example.test'),false);
  await context.close();
 }}finally{await browser.close()}
 console.log('PUB-10 synthetic owner form: gate, retry, no persisted PII, 390/1280 PASS');
})().catch(e=>{console.error(e);process.exitCode=1});
