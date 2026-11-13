// Synthetic isolated component harness only; it does not exercise a product route or real data.
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {build}=require('esbuild');
const {chromium,webkit}=require(process.env.PW || 'playwright-core');
(async()=>{
  assert.equal(process.env.HAMPTON_E2E_ISOLATED,'1');
  assert.equal(process.env.E2E_PRODUCTION_READONLY,'0');
  const bundle=await build({entryPoints:['tests/sap01-harness.jsx'],bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic'});
  const css=readFileSync('admin/src/styles.css','utf8');
  const browser=await (process.env.HAMPTON_E2E_BROWSER==='webkit'?webkit:chromium).launch({executablePath:process.env.CHROME});
  try {
    for(const width of [1280,390]) {
      const page=await browser.newPage({viewport:{width,height:900},reducedMotion:'reduce'});
      const errors=[]; page.on('pageerror',e=>errors.push(e.message));
      await page.route('**/*',route=>route.abort());
      await page.setContent('<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div></body></html>');
      await page.addStyleTag({content:css}); await page.addScriptTag({content:bundle.outputFiles[0].text});
      await page.getByText("Couldn't refresh search status.").waitFor();
      assert.equal(await page.getByText('Last recorded status',{exact:true}).count(),1);
      const live=page.locator('[aria-live=polite]'); assert.equal(await live.count(),1);
      assert.match(await live.innerText(),/Couldn't refresh search status/);
      assert.match(await live.innerText(),/No inventory check recorded/);
      assert.equal(await page.getByText('No inventory check recorded',{exact:true}).count(),1);
      assert.equal(await page.getByText(/No matches yet|Inventory check completed|Last successful inventory check/).count(),0);
      await page.keyboard.press('Tab');
      const reload=page.getByRole('button',{name:'Reload status'});
      assert.equal(await reload.evaluate(el=>el===document.activeElement),true,'keyboard reaches retry');
      const target=await reload.boundingBox(); assert.ok(target.height >= (width===390?44:32),'retry target height');
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no horizontal overflow');
      await page.keyboard.press('Enter');
      await reload.waitFor();
      assert.equal(await reload.getAttribute('aria-disabled'),'true');
      assert.equal(await reload.evaluate(el=>el===document.activeElement),true,'focus remains on retry while loading');
      await page.keyboard.press('Enter');
      await page.getByText('Retries: 1',{exact:true}).waitFor();
      await page.getByText("Couldn't refresh search status.").waitFor({state:'detached'});
      assert.equal(await page.evaluate(()=>document.activeElement.textContent),'No inventory check recorded');
      assert.equal(await page.getByText('Retries: 1',{exact:true}).count(),1);
      assert.equal(await page.getByText("Couldn't refresh search status.").count(),0);
      assert.equal(await page.getByText('No inventory check recorded',{exact:true}).count(),1);
      assert.deepEqual(errors,[]); await page.close();
    }
  } finally { await browser.close(); }
  console.log('SAP-01 synthetic component harness: error/retry, keyboard, 1280/390 PASS');
})().catch(e=>{console.error(e);process.exitCode=1;});
