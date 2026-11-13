// Synthetic local-only fixture; the isolated launcher supplies the browser and database.
const assert=require('node:assert/strict');
const {chromium}=require(process.env.PW||'playwright-core');
const {mkdtempSync,readFileSync,writeFileSync,rmSync}=require('node:fs');
const {tmpdir}=require('node:os');
const {join,dirname}=require('node:path');
const {parseEnv}=require('node:util');
const {execFileSync}=require('node:child_process');
const {startFixture}=require('./serve-e2e.cjs');

(async()=>{
  assert.ok(process.env.E2E_PERSIST&&process.env.E2E_VARS,'isolated local fixture required');
  const temporary=mkdtempSync(join(tmpdir(),'pub09-browser-'));
  const varsFile=join(temporary,'fixture.vars');
  writeFileSync(varsFile,readFileSync(process.env.E2E_VARS,'utf8')+'\nPUB09_WITHDRAWALS_READY=1\n',{mode:0o600});
  const vars=parseEnv(readFileSync(varsFile,'utf8'));
  const wrangler=join(dirname(require.resolve('wrangler')),'..','bin','wrangler.js');
  const sql=statement=>execFileSync(process.execPath,[wrangler,'d1','execute','hampton','--local',
    '--persist-to',process.env.E2E_PERSIST,'--json','--command',statement],{encoding:'utf8'});
  const {signSession,COOKIE}=await import('../server/auth.js');
  let server,browser;
  try {
    server=await startFixture({persist:process.env.E2E_PERSIST,varsFile,port:0});
    const base=server.url.href;
    browser=await chromium.launch({executablePath:process.env.CHROME});
    for(const width of [1280,390]){
      const at=new Date().toISOString();
      sql(`DELETE FROM listing_withdrawal_receipts WHERE withdrawal_id IN (SELECT id FROM listing_withdrawals WHERE listing_id='HE-R003');
        DELETE FROM listing_withdrawal_revisions WHERE withdrawal_id IN (SELECT id FROM listing_withdrawals WHERE listing_id='HE-R003');
        DELETE FROM listing_withdrawals WHERE listing_id='HE-R003';
        UPDATE listings SET published=1,archived_at=NULL,review_requested_at=NULL,review_requested_by=NULL,
          availability='for_sale',updated_at='${at}' WHERE id='HE-R003';`);
      const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'});
      await context.addCookies([{name:COOKIE,value:await signSession('admin@example.test',vars.SESSION_SECRET),
        domain:new URL(base).hostname,path:'/',secure:true,httpOnly:true,sameSite:'Strict'}]);
      const page=await context.newPage(),errors=[];
      page.on('pageerror',error=>errors.push(error.message));
      page.on('console',message=>{if(message.type()==='error'&&!/Failed to load resource|turnstile|fonts/i.test(message.text()))errors.push(message.text());});
      await page.goto(base+'admin/#/p/HE-R003');
      const opener=page.getByRole('button',{name:'Unpublish',exact:true});
      await opener.focus();await page.keyboard.press('Enter');
      let dialog=page.getByRole('dialog');
      await dialog.waitFor();
      assert.equal(await page.evaluate(()=>document.querySelector('dialog')?.contains(document.activeElement)),true);
      await page.keyboard.press('Escape');
      await dialog.waitFor({state:'hidden'});
      assert.equal(await opener.evaluate(element=>document.activeElement===element),true);
      await opener.click();dialog=page.getByRole('dialog');
      await page.evaluate(()=>{document.documentElement.style.zoom='2';});
      const bounds=await dialog.boundingBox();assert.ok(bounds.width<=width+1,'dialog fits at 200% zoom');
      await page.evaluate(()=>{document.documentElement.style.zoom='';});
      await dialog.getByRole('button',{name:'Remove from website'}).click();
      assert.equal(await dialog.getByLabel('Reason').getAttribute('aria-invalid'),'true');
      await dialog.getByLabel('Reason').selectOption('other');
      await dialog.getByLabel(/Private note/).fill('Private fixture note');
      await dialog.getByRole('button',{name:'Remove from website'}).click();
      await page.getByRole('status').filter({hasText:'Unpublished'}).waitFor();
      await page.getByRole('heading',{name:'Website withdrawal history'}).waitFor();
      await page.getByText('Private fixture note',{exact:true}).waitFor();
      await page.getByRole('button',{name:'Correct reason'}).click();
      dialog=page.getByRole('dialog');
      await dialog.getByLabel('Reason').selectOption('owner_request');
      await dialog.getByRole('button',{name:'Save correction'}).click();
      await page.getByText(/Correction · Owner requested removal/).waitFor();
      const publicText=await page.evaluate(async()=>await (await fetch('/api/listings')).text());
      assert.ok(!publicText.includes('Private fixture note'));
      const trace=await page.evaluate(async()=>await (await fetch('/api/admin/listings/HE-R003/traceability')).json());
      assert.equal(trace.withdrawal_history.length,2);
      assert.equal(trace.metrics.calls.value,null);
      assert.equal(trace.metrics.saved.value,null);
      const at2=new Date(Date.now()+1000).toISOString();
      sql(`UPDATE listings SET published=1,archived_at=NULL,updated_at='${at2}' WHERE id='HE-R003';`);
      await page.goto(base+'admin/#/listings');
      const row=page.locator('tr').filter({hasText:'HE-R003'});
      await row.getByRole('switch',{name:/Visible on the website/}).click();
      dialog=page.getByRole('dialog');
      await dialog.getByLabel('Reason').selectOption('data_correction');
      await dialog.getByRole('button',{name:'Remove from website'}).click();
      await page.getByRole('status').filter({hasText:'hidden from the website'}).waitFor();

      // The first response is lost after the transaction; a second operator republishes
      // before retry. The receipt must not hide it again or claim it is still hidden.
      const replayAfterRepublish=async open=>{
        const before=await page.evaluate(async()=>await (await fetch('/api/admin/listings/HE-R003/traceability')).json());
        await page.route('**/api/admin/listings/HE-R003/unpublish',async route=>{
          assert.equal((await route.fetch()).status(),200);
          sql("UPDATE listings SET published=1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ',updated_at,'+1 second') WHERE id='HE-R003'");
          await route.abort();
        },{times:1});
        await open();
        const retryDialog=page.getByRole('dialog');
        await retryDialog.getByLabel('Reason').selectOption('owner_request');
        await retryDialog.getByRole('button',{name:'Remove from website'}).click();
        await retryDialog.getByRole('alert').waitFor();
        await retryDialog.getByRole('button',{name:'Remove from website'}).click();
        await page.getByRole('status').filter({hasText:'currently visible on the website'}).waitFor();
        const after=await page.evaluate(async()=>await (await fetch('/api/admin/listings/HE-R003/traceability')).json());
        assert.equal(after.current_publication.published,true);
        assert.equal(after.withdrawal_history.length,before.withdrawal_history.length+1);
      };
      sql("UPDATE listings SET published=1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ',updated_at,'+1 second') WHERE id='HE-R003'");
      await page.goto(base+'admin/#/p/HE-R003');
      await replayAfterRepublish(()=>page.getByRole('button',{name:'Unpublish',exact:true}).click());
      await page.goto(base+'admin/#/listings');
      await replayAfterRepublish(()=>page.locator('tr').filter({hasText:'HE-R003'}).getByRole('switch',{name:/Visible on the website/}).click());
      await page.evaluate(()=>{document.documentElement.style.zoom='2';});
      assert.deepEqual(errors,[]);
      console.log(`PUB-09 ${width}: editor/list reason, private history, correction, focus, keyboard and zoom PASS`);
      await context.close();
    }
  } finally {
    if(browser)await browser.close();
    if(server)await server.close();
    rmSync(temporary,{recursive:true,force:true});
  }
})().catch(error=>{console.error(error.message);process.exitCode=1;});
