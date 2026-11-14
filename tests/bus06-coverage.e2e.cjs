// Synthetic responses to the actual component API; run only in the isolated fixture.
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { build } = require('esbuild');
const { chromium, webkit } = require(process.env.PW || 'playwright-core');
(async () => {
  assert.equal(process.env.HAMPTON_E2E_ISOLATED, '1');
  assert.equal(process.env.E2E_PRODUCTION_READONLY, '0');
  const bundle = await build({entryPoints:['tests/bus06-coverage-harness.jsx'],bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic'});
  const css=readFileSync('admin/src/styles.css','utf8');
  const browser=await (process.env.HAMPTON_E2E_BROWSER==='webkit'?webkit:chromium).launch({executablePath:process.env.CHROME});
  const id='11111111-1111-4111-8111-111111111111', cursor='0123456789abcdef0123456789abcdef';
  const directory=JSON.stringify({schema_version:1,status:'candidate_not_authorized',revision:'bus23-synthetic',channels:[
    {source_ref:'source-fixture',channel_id:'example',source_class:'unclassified'},{source_ref:'source-unread',channel_id:'example',source_class:'unclassified'}]})+'\n';
  const fingerprint=createHash('sha256').update(directory).digest('hex');
  const listing={external_key:'REF-1',source_at:'2026-11-14T10:15:00.000Z',listing_url:'https://source.example.test/properties/one',
    observation:{country_code:'JE',territory_evidence:'fixture',operation:'rent',observed_at:'2026-11-14T10:15:00.000Z'}};
  try {
    for (const width of [1280,390]) {
      const page=await browser.newPage({viewport:{width,height:900},reducedMotion:'reduce'}), errors=[];
      page.on('pageerror', e=>errors.push(e.message)); page.on('dialog', dialog=>dialog.accept());
      let mode='unavailable', coverageCalls=0, manifests=[], run=null, listings=null, refuseUpload=false; const posted=[];
      await page.route('**/api/admin/market/**',async route=>{
        const request=route.request(), u=new URL(request.url()), write=request.method()==='POST', body=write?request.postDataJSON():null;
        if (mode==='unavailable') return route.fulfill({status:404,json:{error:'Not found'}});
        if (mode==='error') return route.fulfill({status:500,json:{error:'fixture'}});
        if (write) posted.push([u.pathname.replace('/api/admin/market/',''),body]);
        if (u.pathname.endsWith('/manifests')) {
          if (write) manifests=[{revision:'bus23-synthetic',sha256:body.sha256,accepted_at:'2026-11-14T09:00:00Z',status:'accepted',channels:2}];
          return route.fulfill({status:write?201:200,json:write?{manifest:manifests[0]}:{manifests}});
        }
        if (u.pathname.endsWith('/manual-pages')) {
          if (refuseUpload) return route.fulfill({status:409,json:{error:'This channel is not open for manual upload'}});
          listings=body.records.length; return route.fulfill({status:201,json:{accepted:true,records:listings}});
        }
        if (u.pathname.endsWith('/coverage')) {
          coverageCalls++;
          const after=u.searchParams.get('after');
          return route.fulfill({json:{run,overall:{scope:'initial',external_coverage:'unknown'},next:after?null:cursor,sources:after?[]:[
            {source_ref:'source-fixture',channel_id:'example',status:'pending',access_status:'manual_only',method:'manual',policy_version:3,next_action:null,
              review_due_at:null,last_capture_at:listings===null?null:'2026-11-14T10:30:00Z',last_full_pass_at:null,listings},
            {source_ref:'source-unread',channel_id:'example',status:'pending',access_status:'pending',method:null,policy_version:1,next_action:'terms_and_method_review',
              review_due_at:null,last_capture_at:null,last_full_pass_at:null,listings:null}]}});
        }
        if (write && u.pathname.endsWith('/runs')) { run={id,kind:'initial',jersey_day:null,status:'open',version:1,created_at:'2026-11-14T10:00:00Z'}; return route.fulfill({status:201,json:{run}}); }
        if (write) { const action=u.pathname.split('/').pop(); run={...run,status:{pause:'paused',resume:'open',close:'partial'}[action],version:run.version+1}; return route.fulfill({json:{run}}); }
        return route.fulfill({json:{runs:u.searchParams.has('after')||!run?[]:[run],next:u.searchParams.has('after')||!run?null:id}});
      });
      await page.route('**/bus06-synthetic', route => route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div></body></html>'}));
      await page.goto(new URL('bus06-synthetic', process.env.BASE).href);
      await page.addStyleTag({content:css}); await page.addScriptTag({content:bundle.outputFiles[0].text});
      await page.getByText('Market inventory is not available yet.').waitFor();
      mode='error'; await page.reload();
      // Reload resets the component harness; mount again using the same isolated origin.
      await page.addStyleTag({content:css}); await page.addScriptTag({content:bundle.outputFiles[0].text});
      await page.getByText("Couldn't load market inventory. Please try again.").waitFor();
      mode='ok'; const retry=page.getByRole('button',{name:'Try again'}); await retry.focus(); await page.keyboard.press('Enter');
      await page.getByText('No directory accepted yet. Without one, no external source can be reviewed or read.').waitFor();
      await page.getByText('No inventory runs recorded on this page. External coverage is unknown.').waitFor();

      // The directory: a wrong file is refused in the browser; the right one shows its fingerprint before it is accepted.
      const file=page.getByLabel('Directory file');
      await file.setInputFiles({name:'notes.json',mimeType:'application/json',buffer:Buffer.from('not a directory')});
      await page.getByText('That file is not a source directory. Choose the directory file prepared for Hampton.').waitFor();
      await file.setInputFiles({name:'directory.local.json',mimeType:'application/json',buffer:Buffer.from(directory)});
      await page.getByText(/Revision bus23-synthetic · 2 channels from 2 sources/).waitFor();
      await page.getByText(fingerprint).waitFor();
      assert.equal(posted.length,0);
      await page.getByRole('button',{name:'Accept directory'}).click();
      await page.getByText('Directory accepted. Its 2 channels are pending review; none can be read yet.').waitFor();
      assert.deepEqual(posted[0],['manifests',{manifest:directory,sha256:fingerprint}]);
      await page.getByText(/Revision bus23-synthetic · 2 channels · Accepted/).waitFor();

      // A batch: the manual channel takes listings, the unread one stays pending and is never shown as empty.
      await page.getByRole('button',{name:'Start a batch'}).click();
      await page.getByText(/Initial · Open/).waitFor();
      assert.deepEqual([posted[1][0],posted[1][1].kind,posted[1][1].manifest_revision],['runs','initial','bus23-synthetic']);
      const show=page.getByRole('button',{name:'Show coverage'}); await show.focus(); await page.keyboard.press('Enter');
      await page.getByText('Unknown',{exact:true}).waitFor();
      const region=page.getByRole('region',{name:'Source coverage'});
      assert.match(await region.innerText(),/Waiting for a manual upload, not read · Access Manual only.*Method: Manual.*Review due: Not recorded.*Last capture: Not recorded.*Last full pass: Not recorded/s);
      assert.match(await region.innerText(),/source-unread · Channel example · Waiting for access review, not read · Access Pending/);
      assert.doesNotMatch(await region.innerText(),/\b0 listings/);
      const box=page.getByLabel('Listings for source-fixture example'), save=page.getByRole('button',{name:'Save listings'});
      assert.equal(await page.getByLabel(/^Listings for/).count(),1,'only the manual channel offers an upload');
      await box.fill('[{}]'); await save.click();
      await page.getByText('Listing 1 is missing external_key.').waitFor();
      assert.equal(posted.length,2);
      await box.fill(JSON.stringify([listing])); await save.click();
      await page.getByText('Saved 1 listing.').waitFor();
      await page.getByText(/1 listing recorded, not a full pass/).waitFor();
      const sent=posted[2][1];
      assert.deepEqual([posted[2][0],sent.schema_version,sent.run_id,sent.source_ref,sent.channel_id,sent.policy_version,sent.observed_at,sent.records.length],
        ['manual-pages',1,id,'source-fixture','example',3,listing.observation.observed_at,1]);
      assert.match(await region.innerText(),/source-unread · Channel example · Waiting for access review, not read/);
      refuseUpload=true; await box.fill(JSON.stringify([listing])); await save.click();
      await page.getByText(/Nothing was saved\. The channel is not open for manual upload/).waitFor();
      assert.equal(await box.inputValue(),JSON.stringify([listing]),'a refused upload keeps what was typed');

      // Exercise reflow with populated runs, source details and pagination controls present.
      await page.evaluate(()=>{document.body.style.zoom='2'});
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1),'populated coverage has no horizontal overflow at 200%');
      await page.evaluate(()=>{document.body.style.zoom='1'});
      const controls=page.getByRole('group',{name:'Source coverage pages'});
      assert.equal(await controls.getByRole('button',{name:'Next page'}).isVisible(),true);
      const before=coverageCalls; await controls.getByRole('button',{name:'Next page'}).click();
      await page.getByText('No sources recorded on this page.').waitFor(); assert.equal(coverageCalls,before+1);
      await controls.getByRole('button',{name:'Previous page'}).click(); await page.getByText('source-fixture',{exact:true}).waitFor();

      // Pause hides the upload; closing ends the batch and keeps its coverage readable.
      await page.getByRole('button',{name:'Pause'}).click(); await page.getByText(/Initial · Paused/).waitFor();
      assert.equal(await page.getByLabel(/^Listings for/).count(),0);
      await page.getByRole('button',{name:'Resume'}).click(); await page.getByText(/Initial · Open/).waitFor();
      await page.getByRole('button',{name:'Close batch'}).click(); await page.getByText(/Initial · Partial/).waitFor();
      assert.equal(await page.getByRole('button',{name:'Close batch'}).count(),0);
      assert.deepEqual(posted.slice(-3).map(([path,body])=>[path.split('/').pop(),body.version]),[['pause',1],['resume',2],['close',3]]);
      await page.getByText(/1 listing recorded, not a full pass/).waitFor();
      const runControls=page.getByRole('group',{name:'Inventory run pages'}); await runControls.getByRole('button',{name:'Next page'}).click();
      await page.getByText('No inventory runs recorded on this page. External coverage is unknown.').waitFor();
      await page.evaluate(()=>{document.body.style.zoom='2'});
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1),'no horizontal overflow at 200%');
      assert.deepEqual(errors,[]); await page.close();
    }
  } finally { await browser.close(); }
  console.log('BUS-06 inventory synthetic harness: gate, error/retry, directory fingerprint and acceptance, batch start/pause/resume/close, manual upload (invalid, saved, refused), unread never empty, keyboard, pagination, 1280/390 and 200% PASS');
})().catch(error=>{console.error(error);process.exitCode=1;});
