// Disposable local D1 and synthetic data only; run via test:e2e:isolated.
const {chromium} = require(process.env.PW || 'playwright-core');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {parseEnv} = require('node:util');
const {execFileSync} = require('node:child_process');
const {join,dirname} = require('node:path');
const BASE=process.env.BASE, vars=parseEnv(readFileSync(process.env.E2E_VARS,'utf8'));
const wrangler=join(dirname(require.resolve('wrangler')),'..','bin','wrangler.js');
const sql=statement=>execFileSync(process.execPath,[wrangler,'d1','execute','hampton','--local',
  '--persist-to',process.env.E2E_PERSIST,'--command',statement],{stdio:'pipe'});
(async()=>{
  assert.ok(BASE && process.env.E2E_PERSIST,'isolated fixture required');
  const at=new Date(Date.now()-60000).toISOString();
  sql(`INSERT INTO contacts(name,email,last_activity_at,created_at,updated_at)
    VALUES('Synthetic contact','ana05-fixture@example.test','${at}','${at}','${at}');
    INSERT INTO applicants(contact_id,operation,source,stage,search_category,search_operation,created_at,updated_at,updated_by)
    VALUES(last_insert_rowid(),'rent','phone','agreed','commercial','transfer','${at}','${at}','import');
    INSERT INTO events(at,actor,entity_type,entity_id,type,data)
    VALUES('${at}','fixture','applicant',last_insert_rowid(),'applicant.stage_changed','{"after":{"stage":"agreed"}}');
    INSERT INTO applicants(contact_id,operation,source,stage,search_category,search_operation,created_at,updated_at,archived_at)
    SELECT id,'rent','phone','new','commercial','transfer','${at}','${at}','${at}' FROM contacts
    WHERE email='ana05-fixture@example.test';`);
  const {signSession,COOKIE}=await import('../server/auth.js');
  const browser=await chromium.launch({executablePath:process.env.CHROME});
  try { for(const width of [1280,390]) {
    const context=await browser.newContext({viewport:{width,height:900},timezoneId:'Europe/Jersey'});
    await context.addCookies([{name:COOKIE,value:await signSession('admin@example.test',vars.SESSION_SECRET),
      domain:new URL(BASE).hostname,path:'/',httpOnly:true,secure:true,sameSite:'Strict'}]);
    const page=await context.newPage(),errors=[],writes=[],queries=[],assets=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('request',r=>{
      if(/SearchMilestones-[^/]+\.js/.test(new URL(r.url()).pathname)) assets.push(1);
      if(new URL(r.url()).pathname.startsWith('/api/') && r.method()!=='GET') writes.push(r.method());
      if(new URL(r.url()).pathname==='/api/admin/insights/milestones') queries.push([...new URL(r.url()).searchParams.keys()]);
    });
    page.setDefaultTimeout(15000);
    await page.goto(new URL('admin/#/applicants',BASE).href);
    await page.getByRole('heading',{name:'Applicants',exact:true}).waitFor();
    assert.equal(assets.length,0,'measurement code stays unloaded outside Insights');
    await page.goto(new URL('admin/#/insights',BASE).href);
    const region=page.getByRole('region',{name:'Search measurement'});
    await region.getByRole('table',{name:'Recorded search stages'}).waitFor();
    assert.ok(assets.length>0,'measurement code loads when Insights is opened');
    assert.equal(await page.getByRole('heading',{name:'Legacy stage progression (includes inferred earlier stages)'}).count(),1);
    const operation=region.getByLabel('Operation'),category=region.getByLabel('Category');
    await operation.focus(); assert.equal(await operation.evaluate(e=>e===document.activeElement),true);
    await page.keyboard.press('End'); await page.keyboard.press('Enter');
    await category.selectOption('commercial');
    await region.getByText('2 search records',{exact:true}).waitFor();
    assert.match(await region.textContent(),/Transfer.*Commercial/s);
    const row=(table,name)=>region.getByRole('table',{name:table}).getByRole('row',{name:new RegExp(`^${name} `)});
    assert.match(await row('Recorded search stages','Agreed').textContent(),/Agreed\s*1/);
    assert.match(await row('Recorded search stages','Viewing').textContent(),/Viewing\s*0/);
    assert.match(await row('Verified milestones','Viewing completed').textContent(),/Not integrated/);
    await page.getByRole('button',{name:'7 days',exact:true}).click();
    await region.getByText('2 search records',{exact:true}).waitFor();
    await operation.selectOption('rent');
    await region.getByText('0 search records',{exact:true}).waitFor();
    await page.evaluate(()=>{document.documentElement.style.zoom='2';});
    const geometry=await page.evaluate(()=>({viewport:innerWidth,document:document.documentElement.scrollWidth}));
    assert.ok(geometry.document<=geometry.viewport+1,'page should reflow at 200% zoom');
    await page.evaluate(()=>{document.documentElement.style.zoom='1';});
    if(width===390){
      let fail=true;
      const offline=route=>fail?route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Measurement unavailable'})}):route.continue();
      await page.route('**/api/admin/insights/milestones?**',offline);
      await operation.selectOption('buy');
      await region.getByRole('alert').filter({hasText:'Measurement unavailable'}).waitFor();
      assert.equal(await region.getByRole('table').count(),0);
      fail=false; await region.getByRole('button',{name:'Retry'}).focus(); await page.keyboard.press('Enter');
      await region.getByRole('table',{name:'Recorded search stages'}).waitFor();
      await page.unroute('**/api/admin/insights/milestones?**',offline);
    }
    assert.deepEqual(writes,[]); assert.ok(queries.length>1);
    assert.ok(queries.every(keys=>keys.every(key=>['days','operation','category'].includes(key))));
    assert.deepEqual(errors,[]); await context.close();
    console.log(`Search measurement ${width}px: filters, keyboard, reflow, errors and privacy passed.`);
  }
    // Exercise the actual query against local D1 on a larger synthetic cohort and event history.
    sql(`WITH RECURSIVE seq(n) AS (VALUES(1) UNION ALL SELECT n+1 FROM seq WHERE n<1000)
      INSERT INTO applicants(contact_id,operation,source,stage,search_category,search_operation,created_at,updated_at,archived_at)
      SELECT c.id,'rent','phone','new','commercial','transfer','${at}','${at}','${at}' FROM seq CROSS JOIN contacts c
      WHERE c.email='ana05-fixture@example.test';
      WITH RECURSIVE seq(n) AS (VALUES(1) UNION ALL SELECT n+1 FROM seq WHERE n<5000)
      INSERT INTO events(at,actor,entity_type,entity_id,type,data)
      SELECT '${at}','fixture','applicant',CAST(a.id AS TEXT),'applicant.updated','{}' FROM seq CROSS JOIN applicants a
      JOIN contacts c ON c.id=a.contact_id WHERE c.email='ana05-fixture@example.test' AND a.archived_at IS NULL;`);
    const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Jersey',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    const {getSearchMilestones}=await import('../server/measurement-funnel.js');
    let query,binds;
    const fake={SEARCH_MILESTONES_READY:'1',DB:{prepare(q){query=q;return {bind(...args){binds=args;return {first:async()=>
      ({search_count:0,candidate_count:0,event_count:0,invalid_count:0})};}};}}};
    await getSearchMilestones(fake,{from:day,to:day,operation:'transfer',category:'commercial'});
    const bound=query.replace(/\?([1-6])/g,(_,number)=>`'${String(binds[Number(number)-1]).replaceAll("'","''")}'`);
    const execute=statement=>JSON.parse(execFileSync(process.execPath,[wrangler,'d1','execute','hampton','--local',
      '--persist-to',process.env.E2E_PERSIST,'--json','--command',statement],{stdio:'pipe'}).toString());
    const explain=execute('EXPLAIN QUERY PLAN '+bound)[0].results.map(row=>row.detail).join(' ');
    assert.match(explain,/SEARCH a USING INDEX applicants_operation/);
    assert.match(explain,/SEARCH e USING INDEX events_entity/);
    const result=execute(bound)[0];
    assert.equal(result.results[0].search_count,1002);
    assert.equal(result.results[0].agreed_count,1);
    assert.ok(result.results[0].event_count>=5001);
    console.log(`Local D1 synthetic query: 1002 searches, ${result.results[0].event_count} events; duration ${result.meta.duration} ms; rows read ${result.meta.rows_read ?? 'not reported'}.`);
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
