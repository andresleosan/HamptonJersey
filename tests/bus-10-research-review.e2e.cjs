// Run only with E2E_PRODUCTION_READONLY=0 npm run test:e2e:isolated.
const {chromium}=require(process.env.PW||'playwright-core');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {parseEnv}=require('node:util');
const {execFileSync}=require('node:child_process');
const {join,dirname}=require('node:path');
const BASE=process.env.BASE,vars=parseEnv(readFileSync(process.env.E2E_VARS,'utf8'));
const wrangler=join(dirname(require.resolve('wrangler')),'..','bin','wrangler.js');
const sql=s=>execFileSync(process.execPath,[wrangler,'d1','execute','hampton','--local','--persist-to',process.env.E2E_PERSIST,
  '--json','--command',s],{encoding:'utf8'});

(async()=>{
  assert.ok(BASE&&process.env.E2E_PERSIST,'isolated fixture required');
  const {signSession,COOKIE}=await import('../server/auth.js');
  sql(`INSERT INTO listings(id,use,title,operation,availability,country,created_at,updated_at) VALUES
      ('HE-R99001','residential','Synthetic First','sale','for_sale','Jersey','2026-11-13T00:00:00.000Z','2026-11-13T00:00:00.000Z'),
      ('HE-R99002','residential','Synthetic Second','rent','to_let','Jersey','2026-11-13T00:00:00.000Z','2026-11-13T00:00:00.000Z');
    INSERT INTO research_properties(property_id,duplicate_group) VALUES
      ('HE-R99001','BUS10-FIXTURE'),('HE-R99002','BUS10-FIXTURE'),('HE-R99003','BUS10-FIXTURE');
    INSERT INTO contacts(name,email,last_activity_at,created_at,updated_at) VALUES
      ('Synthetic contact','bus10-ui@example.test','2026-11-13T00:00:00.000Z','2026-11-13T00:00:00.000Z','2026-11-13T00:00:00.000Z');
    INSERT INTO applicants(contact_id,operation,source,created_at,updated_at)
      SELECT id,'buy','phone','2026-11-13T00:00:00.000Z','2026-11-13T00:00:00.000Z' FROM contacts WHERE email='bus10-ui@example.test';
    INSERT INTO matches(applicant_id,listing_id,score,checks,status,reject_reason,created_at,updated_at)
      SELECT a.id,'HE-R99001',50,'[]','shortlisted',NULL,'2026-11-13T00:00:00.000Z','2026-11-13T00:00:00.000Z'
      FROM applicants a JOIN contacts c ON c.id=a.contact_id WHERE c.email='bus10-ui@example.test';
    INSERT INTO matches(applicant_id,listing_id,score,checks,status,reject_reason,created_at,updated_at)
      SELECT a.id,'HE-R99002',50,'[]','rejected','other','2026-11-13T00:00:00.000Z','2026-11-13T00:00:00.000Z'
      FROM applicants a JOIN contacts c ON c.id=a.contact_id WHERE c.email='bus10-ui@example.test';`);
  const browser=await chromium.launch({executablePath:process.env.CHROME});
  try {for(const width of [1280,390]){
    const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'});
    await context.addCookies([{name:COOKIE,value:await signSession('admin@example.test',vars.SESSION_SECRET),
      domain:new URL(BASE).hostname,path:'/',secure:true,httpOnly:true,sameSite:'Strict'}]);
    const page=await context.newPage(),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    page.on('console',message=>message.type()==='error'&&!/Failed to load resource|turnstile|challenges/i.test(message.text())&&errors.push(message.text()));
    await page.goto(BASE+'admin/#/p/HE-R99001');
    const note=page.locator('section[aria-label="Possible duplicate listings"]');
    await note.getByText(/does not confirm/).waitFor();
    await note.getByText(/different reviews/).waitFor();
    await note.getByText(/unavailable/).waitFor();
    const candidate=note.getByRole('link',{name:'HE-R99002',exact:true});
    assert.equal(await candidate.getAttribute('href'),'#/p/HE-R99002');
    assert.equal(await note.getByRole('link',{name:'HE-R99003',exact:true}).count(),0);
    assert.doesNotMatch(await note.textContent(),/bus10-ui@example\.test|Synthetic contact/);
    await candidate.focus();await page.keyboard.press('Enter');
    await page.locator('.side h1').getByText('Synthetic Second',{exact:true}).waitFor();
    await page.goto(BASE+'admin/#/p/HE-R99001');
    await note.getByText(/does not confirm/).waitFor();
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no horizontal overflow');
    await page.evaluate(()=>document.documentElement.style.zoom='2');
    await note.scrollIntoViewIfNeeded();
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no horizontal overflow at 200%');
    assert.deepEqual(errors,[]);
    console.log(`BUS-10 ${width}: historical warning, conflict, safe link, keyboard and zoom PASS`);
    await context.close();
  }} finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
