// Isolated local fixtures only: E2E_PRODUCTION_READONLY=0 E2E_SCRIPT=tests/spr08-listing-sections.e2e.cjs npm run test:e2e:isolated
const assert=require('node:assert/strict');
const {readFileSync,mkdirSync}=require('node:fs');
const {join,dirname}=require('node:path');
const {parseEnv}=require('node:util');
const {execFileSync}=require('node:child_process');
const {chromium,webkit}=require(process.env.PW||'playwright-core');
(async()=>{
 assert.equal(process.env.HAMPTON_E2E_ISOLATED,'1');assert.equal(process.env.E2E_PRODUCTION_READONLY,'0');
 const vars=parseEnv(readFileSync(process.env.E2E_VARS,'utf8')),{signSession,COOKIE}=await import('../server/auth.js');
 assert.equal(vars.SPR08_SECTIONS_READY,'1');assert.equal(vars.EST16_AVAILABILITY_READY,'1');assert.equal(vars.VIS08_CYCLE_READY,'1');
 const {jerseyToday,plusDays}=await import('../server/viewings.js');
 const base=process.env.BASE.replace('127.0.0.1','localhost'),origin=new URL(base).origin,ADMIN='admin@example.test',OTHER='colleague@example.test';
 const shots=process.env.E2E_SHOTS;if(shots)mkdirSync(shots,{recursive:true});
 const wrangler=join(dirname(require.resolve('wrangler')),'..','bin','wrangler.js');
 const d1=sql=>JSON.parse(execFileSync(process.execPath,[wrangler,'d1','execute','hampton','--local','--persist-to',process.env.E2E_PERSIST,
  '--json','--command',sql],{encoding:'utf8',stdio:['ignore','pipe','pipe']})).at(-1).results;
 const value=v=>v==null?'NULL':typeof v==='number'?String(v):`'${String(v).replaceAll("'","''")}'`;
 const insert=(table,row)=>`INSERT INTO ${table}(${Object.keys(row)}) VALUES(${Object.values(row).map(value)});`;
 const browser=await (process.env.HAMPTON_E2E_BROWSER==='webkit'?webkit:chromium).launch({executablePath:process.env.CHROME});
 try{
  const ctx=await browser.newContext();
  await ctx.addCookies([{name:COOKIE,value:await signSession(ADMIN,vars.SESSION_SECRET),domain:new URL(base).hostname,path:'/',httpOnly:true,secure:true,sameSite:'Strict'}]);
  await ctx.route('https://fonts.googleapis.com/**',route=>route.fulfill({status:200,contentType:'text/css',body:''}));
  const errors=[],today=jerseyToday(),who=d1("SELECT id FROM negotiators WHERE name='Joshua Franco'")[0].id;
  for(const width of [1280,390]){
   console.log('SPR08 width',width);
   // One home for sale with three sources of the imported research, five viewings in every state and none of its notes.
   const lid=`HE-S${width}`,first=width*10,NOTE=`SPR08-NOTE ${width} keys are with the neighbour at number 4`;
   const viewing=(n,name,status,date,extra={})=>insert('viewing_requests',{id:first+n,listing_id:lid,listing_ref:lid,listing_title_snapshot:`SPR08 ${width} home`,
    agent:'Joshua Franco',negotiator_id:who,kind:'In person',date,time:'10:00',end_time:'10:30',name:`SPR08 ${name} ${width}`,
    email:`spr08-${n}-${width}@example.test`,status,created_at:'2026-11-01T10:00:00.000Z',...extra});
   const source=(n,row)=>insert('research_sources',{source_id:`SPR08-${width}-${n}`,property_id:lid,accessed_on:'2026-10-05',...row});
   d1(insert('listings',{id:lid,title:`SPR08 ${width} home`,use:'residential',operation:'sale',availability:'for_sale',sale_price:790000,currency:'GBP',
     country:'Jersey',bedrooms:3,bathrooms:2,published:0,specs:'[]',created_at:'2026-11-09T10:00:00.000Z',updated_at:'2026-11-09T10:00:00.000Z',updated_by:'fixture'})
    +insert('research_properties',{property_id:lid,match_status:'matched',research_date:'2026-10-05'})
    +source('A',{origin:'External',title:`Agency advert ${width}`,url:'https://agency.example.test/advert',source_type:'agent_listing',
      observed_status:'For Sale',price_text:'£795,000',source_date:'Undated',agent_or_site:'Example Agency'})
    +source('B',{origin:'External',title:`Portal advert ${width}`,url:'https://portal.example.test/advert',source_type:'syndicated_listing',
      observed_status:'FOR SALE',price_text:'£779,000',source_date:'2026-08-16T14:34:32.983Z',agent_or_site:'Example Portal'})
    +source('C',{origin:'Hampton',title:`Hampton catalogue ${width}`,source_type:'primary_catalogue'})
    +viewing(0,'Request','requested',plusDays(today,3))
    +viewing(1,'Booked','confirmed',plusDays(today,5),{reminded_at:'2026-11-14T09:00:00.000Z',reminded_by:'fixture',reminded_channel:'phone'})
    +viewing(2,'Held','confirmed',plusDays(today,-1))
    +viewing(3,'Done','completed',plusDays(today,-3),{outcome:'proceed',feedback_at:'2026-11-12T16:00:00.000Z',feedback_by:'fixture'})
    +viewing(4,'Off','cancelled',plusDays(today,-6),{negotiator_id:null,agent:null}));
   const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));
   page.setDefaultTimeout(15000);
   await page.setViewportSize({width,height:900});
   const fits=async where=>assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1),`no sideways scroll: ${where} at ${width}`);
   const text=async where=>(await where.innerText()).replace(/\s+/g,' ').trim();
   // Polled to its final text, because each card loads on its own and reloads after every action.
   const says=async(where,label,expected)=>{
    const ok=async()=>{if(await where.count()!==1)return false;const t=await text(where);return expected.every(part=>t.includes(part));};
    for(let i=0;i<80&&!(await ok());i++)await page.waitForTimeout(100);
    assert.ok(await ok(),`${label}: "${await where.count()===1?await text(where):`${await where.count()} elements`}" should include ${JSON.stringify(expected)}`);
   };
   const lacks=async(where,label,parts)=>{const t=await text(where);for(const part of parts)assert.equal(t.includes(part),false,`${label} must not say "${part}"`);};
   const rowsOf=(section,heading)=>section.locator(`ul[aria-labelledby="${heading}"] > li`);

   await page.goto(base+`admin/#/p/${lid}`);

   // Viewings: read only, upcoming first then past, each with its status, who shows it and VIS-08's dates.
   const viewings=page.locator('#s-property-viewings');
   await viewings.getByRole('heading',{name:'Viewings of this property (read only)'}).waitFor();
   await viewings.getByRole('heading',{name:'Upcoming (2)'}).waitFor();
   await viewings.getByRole('heading',{name:'Past (3)'}).waitFor();
   const upcoming=rowsOf(viewings,'h-viewings-upcoming'),past=rowsOf(viewings,'h-viewings-past');
   assert.equal(await upcoming.count(),2);assert.equal(await past.count(),3);
   await says(upcoming.nth(0),'request',['10:00-10:30','Requested',`SPR08 Request ${width}`,'In person','Shown by Joshua Franco']);
   await says(upcoming.nth(1),'booked',['Reminded',`SPR08 Booked ${width}`,'Reminded 14 Nov 2026']);
   await says(past.nth(0),'held',['Confirmed',`SPR08 Held ${width}`,'Outcome not recorded yet']);
   await says(past.nth(1),'done',['Feedback received',`SPR08 Done ${width}`,'Outcome: Proceed','Feedback received 12 Nov 2026']);
   await says(past.nth(2),'off',['Cancelled',`SPR08 Off ${width}`,'No negotiator']);
   await lacks(viewings,'viewings',['example.test','Le Bernage']); // no contact details, and no other property's viewing
   assert.equal(await upcoming.nth(1).getByRole('link').getAttribute('href'),`#/viewings?listing=${lid}&viewing=${first+1}`);
   assert.equal(await viewings.locator('button,input,select,textarea').count(),0,'the viewings card changes nothing');
   await fits('viewings');
   if(shots)await viewings.screenshot({path:join(shots,`spr08-viewings-${width}.png`)});

   // Notes: nothing yet; an empty note is refused beside its field and nothing is saved.
   const notes=page.locator('#s-notes'),list=rowsOf(notes,'h-notes-list');
   await notes.getByRole('heading',{name:'Notes (internal)'}).waitFor();
   await notes.getByText('No notes yet.',{exact:true}).waitFor();
   const sent=(method,suffix='')=>page.waitForResponse(r=>r.request().method()===method&&new URL(r.url()).pathname===`/api/admin/listings/${lid}/notes${suffix}`);
   const addButton=notes.getByRole('button',{name:'Add note',exact:true});
   let pending=sent('POST');await addButton.focus();await page.keyboard.press('Enter');
   assert.equal((await pending).status(),400);
   await notes.getByRole('alert').filter({hasText:'Please check the highlighted fields.'}).waitFor();
   await notes.getByText('Write the note, in 4000 characters or fewer',{exact:true}).waitFor();
   assert.equal(await notes.getByLabel('New note').getAttribute('aria-invalid'),'true');
   assert.deepEqual(d1(`SELECT COUNT(*) AS n FROM property_notes WHERE listing_id='${lid}'`),[{n:0}]);

   // By keyboard: the note is saved with the signed-in person as its author, and the field starts again.
   await notes.getByLabel('New note').fill(NOTE);
   pending=sent('POST');await addButton.focus();await page.keyboard.press('Enter');
   assert.equal((await pending).status(),201);
   await notes.getByRole('status').filter({hasText:'Note added.'}).waitFor();
   await notes.getByRole('heading',{name:'Notes on this property (1)'}).waitFor();
   await says(list.nth(0),'own note',[NOTE,ADMIN]);
   for(const name of ['Correct','Withdraw'])await list.nth(0).getByRole('button',{name,exact:true}).waitFor();
   assert.equal(await notes.getByLabel('New note').inputValue(),'');
   await fits('notes, one');

   // A colleague's note is read by everyone and changed only by its author.
   d1(insert('property_notes',{listing_id:lid,body:`SPR08-NOTE ${width} colleague's note`,written_at:'2099-01-01T10:00:00.000Z',created_at:'2099-01-01T10:00:00.000Z',created_by:OTHER}));
   await page.reload();
   await notes.getByRole('heading',{name:'Notes on this property (2)'}).waitFor();
   await says(list.nth(0),"colleague's note",["colleague's note",OTHER]);
   assert.equal(await list.nth(0).getByRole('button').count(),0);
   const refused=await ctx.request.put(base+`api/admin/listings/${lid}/notes/${d1(`SELECT MAX(id) AS id FROM property_notes`)[0].id}`,{headers:{origin},data:{text:'Rewritten'}});
   assert.equal(refused.status(),403);

   // The author corrects their note: the correction is a new version and the first stays in the table.
   const mine=list.nth(1);
   await mine.getByRole('button',{name:'Correct',exact:true}).click();
   const box=mine.getByLabel('Correct this note');
   assert.equal(await box.inputValue(),NOTE);
   assert.ok(await mine.getByRole('button',{name:'Save correction',exact:true}).isDisabled(),'nothing to save until the text changes');
   await box.fill(NOTE.replace('number 4','number 6'));
   const own=d1(`SELECT id FROM property_notes WHERE listing_id='${lid}' AND created_by='${ADMIN}'`)[0].id;
   pending=sent('PUT',`/${own}`);await mine.getByRole('button',{name:'Save correction',exact:true}).click();
   assert.equal((await pending).status(),200);
   await notes.getByRole('status').filter({hasText:'Note corrected.'}).waitFor();
   await says(list.nth(1),'corrected note',['number 6',ADMIN,'corrected']);
   await lacks(notes,'notes',['number 4']);
   assert.deepEqual(d1(`SELECT replaces,body FROM property_notes WHERE listing_id='${lid}' AND created_by='${ADMIN}' ORDER BY id`),
    [{replaces:null,body:NOTE},{replaces:own,body:NOTE.replace('number 4','number 6')}]);
   await fits('notes, corrected');
   if(shots)await notes.screenshot({path:join(shots,`spr08-notes-${width}.png`)});

   // A correction from a page that is out of date (the note changed in another tab) is refused and the list reloads.
   await list.nth(1).getByRole('button',{name:'Correct',exact:true}).click();
   await list.nth(1).getByLabel('Correct this note').fill('Typed on the stale page');
   const current=d1(`SELECT MAX(id) AS id FROM property_notes WHERE listing_id='${lid}' AND created_by='${ADMIN}'`)[0].id;
   d1(insert('property_notes',{listing_id:lid,replaces:current,body:`SPR08-NOTE ${width} changed in another tab`,written_at:'2026-11-15T09:00:00.000Z',
    created_at:'2026-11-15T12:00:00.000Z',created_by:ADMIN}));
   pending=sent('PUT',`/${current}`);await list.nth(1).getByRole('button',{name:'Save correction',exact:true}).click();
   assert.equal((await pending).status(),409);
   await notes.getByRole('alert').filter({hasText:'This note was already changed.'}).waitFor();
   await says(list.nth(1),'reloaded note',['changed in another tab']);
   await lacks(notes,'notes',['Typed on the stale page']);

   // The author withdraws it: who and when stay, the text goes.
   page.once('dialog',dialog=>dialog.accept());
   pending=page.waitForResponse(r=>r.request().method()==='DELETE'&&new URL(r.url()).pathname.startsWith(`/api/admin/listings/${lid}/notes/`));
   await list.nth(1).getByRole('button',{name:'Withdraw',exact:true}).click();
   assert.equal((await pending).status(),200);
   await notes.getByRole('status').filter({hasText:'Note withdrawn.'}).waitFor();
   await says(list.nth(1),'withdrawn note',[`Note withdrawn by ${ADMIN}`]);
   await lacks(notes,'notes',['changed in another tab','number 6']);
   assert.equal(await list.nth(1).getByRole('button').count(),0);
   assert.deepEqual(d1(`SELECT COUNT(*) AS n FROM property_notes WHERE listing_id='${lid}'`),[{n:5}],'every version is still a row');
   await fits('notes, withdrawn');
   if(shots)await notes.screenshot({path:join(shots,`spr08-notes-withdrawn-${width}.png`)});

   // Adverts: the research's sources once, here, with the price each showed; Research no longer repeats them.
   const adverts=page.locator('#s-adverts'),advert=adverts.locator('ul[aria-label="Adverts"] > li');
   await adverts.getByRole('heading',{name:'Adverts (3 · read only)'}).waitFor();
   assert.equal(await advert.count(),3);
   await says(adverts,'adverts',['as the imported research saw each advert','They are not refreshed','Different prices seen: £795,000 · £779,000']);
   const agency=advert.filter({hasText:`Agency advert ${width}`}),portal=advert.filter({hasText:`Portal advert ${width}`});
   await says(agency,'agency advert',['Example Agency · External · agent_listing','Price seen: £795,000','Status seen: For Sale','Seen 5 Oct 2026','Source date: Undated']);
   await says(portal,'portal advert',['Example Portal','Price seen: £779,000','Seen 5 Oct 2026','Source date: 16 Aug 2026']);
   await says(advert.filter({hasText:`Hampton catalogue ${width}`}),'catalogue',['Hampton · primary_catalogue','Price seen: Not stated','Status seen: Not stated']);
   assert.equal(await agency.getByRole('link').getAttribute('href'),'https://agency.example.test/advert');
   assert.equal(await agency.getByRole('link').getAttribute('rel'),'noopener noreferrer');
   await lacks(adverts,'adverts',['Property confirmed']);
   assert.equal(await adverts.locator('button,input,select,textarea').count(),0,'the adverts card changes nothing');
   const research=page.locator('#s-research');
   await research.getByText('matched',{exact:true}).waitFor();
   assert.equal(await research.locator('caption',{hasText:'Sources'}).count(),0,'the sources are listed once');
   await lacks(research,'research',[`Agency advert ${width}`]);

   // What the owner confirmed about the property (EST-16) is read beside each advert.
   const confirmed=await ctx.request.post(base+`api/admin/listings/${lid}/availability`,{headers:{origin},data:{status:'available',
    confirmed_at:'2025-03-10T09:30:00.000Z',source:'owner',channel:'phone',scope:'property',evidence_ref:`Call note ${width}`}});
   assert.equal(confirmed.status(),201,await confirmed.text());
   await page.reload();
   await adverts.getByRole('heading',{name:'Adverts (3 · read only)'}).waitFor();
   for(const one of [agency,portal])await says(one,'confirmed advert',['Property confirmed: Available · 10 Mar 2025']);
   await lacks(adverts,'adverts',['Call note']);
   await fits('adverts');
   if(shots)await adverts.screenshot({path:join(shots,`spr08-adverts-${width}.png`)});

   // Nothing a note says leaves the panel: not the website's data, the property's page or an event.
   for(const path of ['api/listings',`p/${lid}`,`api/admin/listings/${lid}`,`api/admin/listings/${lid}/history`]){
    const reply=await ctx.request.get(base+path);
    assert.equal((await reply.text()).includes('SPR08-NOTE'),false,path);
   }
   assert.deepEqual(d1(`SELECT (SELECT COUNT(*) FROM events WHERE data LIKE '%SPR08-NOTE%' OR type LIKE '%note%') AS events,
    (SELECT COUNT(*) FROM notifications WHERE title LIKE '%SPR08-NOTE%') AS notices`),[{events:0,notices:0}]);

   // A viewing's link opens it in Viewings, filtered by this property.
   await viewings.getByRole('heading',{name:'Upcoming (2)'}).waitFor();
   await rowsOf(viewings,'h-viewings-upcoming').nth(1).getByRole('link').click();
   await page.locator('#v-name').filter({hasText:`SPR08 Booked ${width}`}).waitFor();
   await fits('Viewings');
   await page.close();
  }
  assert.deepEqual(errors,[]);
  console.log('SPR-08 E2E passed: 1280/390, the property\'s viewings read only with status, who shows them and VIS-08 dates, linked to Viewings; notes added by keyboard, refused empty, corrected, refused when stale, withdrawn, a colleague\'s read only; adverts from the research once with prices and the confirmation beside each; no note text outside the panel.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
