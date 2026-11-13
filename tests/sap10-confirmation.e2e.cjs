// Synthetic staff fixture; run only through test:e2e:isolated.
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {parseEnv} = require('node:util');
const {chromium} = require(process.env.PW || 'playwright-core');
(async () => {
  const vars = parseEnv(readFileSync(process.env.E2E_VARS,'utf8'));
  const {signSession,COOKIE} = await import('../server/auth.js');
  const base = process.env.BASE.replace('127.0.0.1','localhost');
  const browser = await chromium.launch({executablePath:process.env.CHROME});
  try {
    const ctx = await browser.newContext();
    await ctx.addCookies([{name:COOKIE,value:await signSession('admin@example.test',vars.SESSION_SECRET),domain:new URL(base).hostname,path:'/',httpOnly:true,secure:true,sameSite:'Strict'}]);
    const made = await ctx.request.post(base+'api/admin/applicants',{headers:{origin:new URL(base).origin},data:{name:'SAP10 fixture',email:'sap10@example.test',operation:'buy',source:'phone',budget_max:900000}});
    assert.equal(made.status(),201); const {id} = await made.json();
    for (const width of [1280,390]) {
      const page = await ctx.newPage(); await page.setViewportSize({width,height:900});
      await page.goto(base+`admin/#/applicants/${id}`); await page.locator('#a-budget_max').waitFor();
      let writes=0; page.on('request', r => { if (r.method()==='PUT' && r.url().includes(`/admin/applicants/${id}`)) writes++; });
      const input=page.locator('#a-budget_max'), checkbox=page.getByRole('checkbox',{name:'I confirm the applicant agreed to these changes.'});
      await input.fill(String(width*1000)); await page.getByRole('button',{name:'Save',exact:true}).click();
      await page.getByText('Confirm the applicant agreed to these changes',{exact:true}).waitFor(); assert.equal(writes,0);
      await checkbox.check(); await input.fill(String(width*1000+1)); assert.equal(await checkbox.isChecked(),false);
      await checkbox.check(); await page.getByRole('button',{name:'Save',exact:true}).click(); await page.getByText('Changes saved.',{exact:true}).waitFor(); assert.equal(writes,1);
      await page.close();
    }
    const madeUnknown = await ctx.request.post(base+'api/admin/applicants',{headers:{origin:new URL(base).origin},data:{name:'SAP10 unknown fixture',email:'sap10-unknown@example.test',operation:'buy',source:'phone',budget_max:900000,requirement_priorities:{version:1,values:{parking:'must'},unknown:['parking']}}});
    assert.equal(madeUnknown.status(),201); const unknownId=(await madeUnknown.json()).id;
    for (const width of [1280,390]) {
      const page=await ctx.newPage(); await page.setViewportSize({width,height:900});
      await page.goto(base+`admin/#/applicants/${unknownId}`);
      const parking=page.locator('#a-parking_spaces'); await parking.waitFor(); await parking.selectOption('1');
      const review=page.getByRole('region',{name:'Confirm changes to search criteria'});
      const text=await review.innerText();
      assert.match(text,/Answers not yet known: Parking/); assert.match(text,/Answers not yet known: None/);
      const checkbox=review.getByRole('checkbox',{name:'I confirm the applicant agreed to these changes.'});
      await checkbox.focus(); await page.keyboard.press('Space'); assert.equal(await checkbox.isChecked(),true);
      await parking.selectOption('2'); assert.equal(await checkbox.isChecked(),false);
      await page.close();
    }
    // A real legacy record can contain a negotiable pets priority. Only edits to pets should infer it.
    const madeLegacy=await ctx.request.post(base+'api/admin/applicants',{headers:{origin:new URL(base).origin},data:{name:'SAP10 legacy fixture',email:'sap10-legacy@example.test',operation:'buy',source:'phone',budget_max:900000}});
    assert.equal(madeLegacy.status(),201); const legacyId=(await madeLegacy.json()).id;
    const {execFileSync}=require('node:child_process'), path=require('node:path');
    const wrangler=path.join(path.dirname(require.resolve('wrangler')),'..','bin','wrangler.js');
    const sql=`UPDATE applicants SET pets='[{"kind":"dog","count":1}]', requirement_priorities='{"version":1,"values":{"pets":"preferred"},"unknown":[]}', household_adults=2, household_children=1, household_total=NULL, household_children_status=NULL WHERE id=${legacyId}`;
    execFileSync(process.execPath,[wrangler,'d1','execute','hampton','--local','--persist-to',process.env.E2E_PERSIST,'--command',sql],{stdio:'pipe'});
    const legacyPage=await ctx.newPage(); await legacyPage.goto(base+`admin/#/applicants/${legacyId}`);
    await legacyPage.locator('#a-budget_max').fill('950000');
    const review=legacyPage.getByRole('region',{name:'Confirm changes to search criteria'});
    assert.equal(await review.getByText('Requirement priorities',{exact:true}).count(),0);
    await review.getByRole('checkbox',{name:'I confirm the applicant agreed to these changes.'}).check();
    await legacyPage.getByRole('button',{name:'Save',exact:true}).click();await legacyPage.getByText('Changes saved.',{exact:true}).waitFor();
    const detail=await (await ctx.request.get(base+`api/admin/applicants/${legacyId}`)).json();
    assert.equal(detail.applicant.requirement_priorities.values.pets,'preferred'); assert.equal(detail.applicant.household_total,null);
    await legacyPage.getByLabel('How many: Dog').fill('2');
    const summary=await review.innerText();
    assert.match(summary,/Requirement priorities/); assert.match(summary,/Pets: Preferred/);assert.match(summary,/Pets: Must-have/);
    await legacyPage.close();
    console.log('SAP-10 confirmation: 1280/390 passed');
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
