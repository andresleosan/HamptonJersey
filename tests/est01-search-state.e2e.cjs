// Isolated local fixtures only: E2E_PRODUCTION_READONLY=0 E2E_SCRIPT=tests/est01-search-state.e2e.cjs npm run test:e2e:isolated
// EST-01 / SAP-01: while a search has no match, the list and the record say what its last search did.
const assert=require('node:assert/strict');
const {readFileSync,mkdirSync}=require('node:fs');
const {join,dirname}=require('node:path');
const {parseEnv}=require('node:util');
const {execFileSync}=require('node:child_process');
const {chromium,webkit}=require(process.env.PW||'playwright-core');
(async()=>{
 assert.equal(process.env.HAMPTON_E2E_ISOLATED,'1');assert.equal(process.env.E2E_PRODUCTION_READONLY,'0');
 const vars=parseEnv(readFileSync(process.env.E2E_VARS,'utf8')),{signSession,COOKIE}=await import('../server/auth.js');
 assert.equal(vars.EST01_SEARCH_STATE_READY,'1');
 const base=process.env.BASE.replace('127.0.0.1','localhost'),origin=new URL(base).origin,ADMIN='admin@example.test';
 const shots=process.env.E2E_SHOTS;if(shots)mkdirSync(shots,{recursive:true});
 const wrangler=join(dirname(require.resolve('wrangler')),'..','bin','wrangler.js');
 const d1=sql=>JSON.parse(execFileSync(process.execPath,[wrangler,'d1','execute','hampton','--local','--persist-to',process.env.E2E_PERSIST,
  '--json','--command',sql],{encoding:'utf8',stdio:['ignore','pipe','pipe']})).at(-1).results;
 const browser=await (process.env.HAMPTON_E2E_BROWSER==='webkit'?webkit:chromium).launch({executablePath:process.env.CHROME});
 try{
  const ctx=await browser.newContext();
  await ctx.addCookies([{name:COOKIE,value:await signSession(ADMIN,vars.SESSION_SECRET),domain:new URL(base).hostname,path:'/',httpOnly:true,secure:true,sameSite:'Strict'}]);
  const errors=[];
  // No listing is on offer: every search registered here ends with no match.
  d1("UPDATE listings SET matchable=0;DELETE FROM matches;");
  for(const width of [1280,390]){
   console.log('EST01 width',width);
   const id={},name=k=>`EST01 ${k} ${width}`;
   for(const k of ['Searched','Queued','Failed','Running','Legacy','Matched']){
    const made=await ctx.request.post(base+'api/admin/applicants',{headers:{origin},data:{name:name(k),email:`est01-${k}-${width}@example.test`,operation:'buy',source:'phone',budget_max:1000000}});
    assert.equal(made.status(),201);id[k]=(await made.json()).id;
   }
   // Registering in the panel ran and recorded each first search.
   assert.deepEqual(d1(`SELECT COUNT(*) AS n FROM applicant_search_runs WHERE applicant_id IN (${Object.values(id)}) AND last_success_at>=last_attempt_at AND last_failure_at IS NULL`),[{n:6}]);
   const ago=minutes=>new Date(Date.now()-minutes*60000).toISOString(),set=(k,sql)=>`UPDATE applicant_search_runs SET ${sql} WHERE applicant_id=${id[k]};`;
   d1([`INSERT INTO listings(id,title,use,operation,availability,matchable,sale_price,currency,published,created_at,updated_at,updated_by) VALUES('EST01-${width}','EST01 ${width} home','residential','sale','for_sale',0,900000,'GBP',0,'2026-11-09T10:00:00.000Z','2026-11-09T10:00:00.000Z','fixture');`,
    `INSERT INTO matches(applicant_id,listing_id,score,checks,requirements_rank,status,created_at,updated_at) VALUES(${id.Matched},'EST01-${width}',90,'[]',1,'found','2026-11-10T10:00:00.000Z','2026-11-10T10:00:00.000Z');`,
    `UPDATE applicants SET match_ranking_version=1 WHERE id=${id.Matched};`,
    set('Matched',`last_attempt_at='${ago(121)}',last_success_at='${ago(121)}'`),
    set('Searched',`last_attempt_at='${ago(121)}',last_success_at='${ago(121)}'`),
    set('Queued',"last_attempt_at=NULL,last_success_at=NULL"),
    set('Failed',`last_attempt_at='${ago(121)}',last_failure_at='${ago(121)}',last_success_at='${ago(3*1440+1)}'`),
    `DELETE FROM applicant_search_runs WHERE applicant_id=${id.Legacy};`,
    set('Running',`last_attempt_at='${ago(0)}',last_success_at=NULL`)].join(''));
   const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));
   await page.setViewportSize({width,height:900});
   const fits=async where=>assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1),`no sideways scroll: ${where} at ${width}`);

   // The list: one line per search with no match; a search with matches keeps its counts.
   await page.goto(base+'admin/#/applicants');
   const row=k=>page.locator('table.applicants tbody tr').filter({has:page.getByRole('link',{name:name(k),exact:true})});
   const cell=k=>row(k).locator('td[data-label="Matches"]');
   await row('Matched').waitFor();
   await cell('Running').getByText('Searching now…',{exact:true}).waitFor();
   await cell('Queued').getByText('Waiting for investigation',{exact:true}).waitFor();
   await cell('Queued').getByText('First search queued',{exact:true}).waitFor();
   await cell('Searched').getByText('No matches yet · last search 2 hours ago',{exact:true}).waitFor();
   await cell('Failed').getByText('Last search failed · 2 hours ago',{exact:true}).waitFor();
   await cell('Failed').getByText('· last completed 3 days ago',{exact:true}).waitFor();
   await cell('Legacy').getByText('No matches yet · last search not recorded',{exact:true}).waitFor();
   await cell('Matched').getByRole('link',{name:`1 found · 0 shortlisted for ${name('Matched')}`,exact:true}).waitFor();
   assert.equal(await cell('Matched').getByText(/last search/i).count(),0);
   await fits('Applicants');
   if(shots)await page.screenshot({path:join(shots,`est01-applicants-${width}.png`),fullPage:true});

   // The record: the same line on the Matches tab, with its scope; a search with matches shows only the date.
   const line=page.locator('.search-run');
   const open=async k=>{await page.goto(base+`admin/#/applicants/${id[k]}/matches`);await page.getByRole('heading',{name:name(k),exact:true}).waitFor();};
   await open('Failed');
   await line.getByText('Last search failed · 2 hours ago',{exact:true}).waitFor();
   await line.getByText("· Hampton's saved listings only",{exact:true}).waitFor();
   await fits('Applicant record');
   if(shots)await page.screenshot({path:join(shots,`est01-record-${width}.png`),fullPage:true});
   await open('Matched');
   await line.getByText('Last search 2 hours ago',{exact:true}).waitFor();
   assert.doesNotMatch(await line.innerText(),/No matches yet/);
   await open('Queued');
   await line.getByText('Waiting for investigation',{exact:true}).waitFor();
   await line.getByText('First search queued',{exact:true}).waitFor();
   // Its search runs: the wait ends with a recorded search.
   const again=await ctx.request.post(base+`api/admin/applicants/${id.Queued}/matches/recalculate`,{headers:{origin}});
   assert.equal(again.status(),200);
   await page.reload();await page.getByRole('heading',{name:name('Queued'),exact:true}).waitFor();
   await line.getByText(/^No matches yet · last search (now|\d+ seconds? ago)$/).waitFor();
   assert.equal(await line.getByText('Waiting for investigation').count(),0);
   assert.deepEqual(d1(`SELECT last_success_at>=last_attempt_at AS done,last_failure_at FROM applicant_search_runs WHERE applicant_id=${id.Queued}`),[{done:1,last_failure_at:null}]);
   await page.close();
  }
  assert.deepEqual(errors,[]);
  console.log('EST-01/SAP-01 E2E passed: 1280/390, list and record show queued, searching, searched, failed and not recorded; matches keep their counts; a queued search is recorded once it runs.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
