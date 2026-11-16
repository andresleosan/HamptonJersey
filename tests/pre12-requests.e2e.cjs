// PRE-12: the privacy requests register, only against the disposable networkless fixture with synthetic people.
const {chromium}=require(process.env.PW||'playwright-core');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {parseEnv}=require('node:util');
const {randomUUID}=require('node:crypto');
const BASE=process.env.BASE, vars=parseEnv(readFileSync(process.env.E2E_VARS,'utf8'));
(async()=>{
  const {signSession,COOKIE}=await import('../server/auth.js');
  const browser=await chromium.launch(process.env.CHROME?{executablePath:process.env.CHROME}:{});
  try {for(const width of [1280,390]){
    const ctx=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce',acceptDownloads:true});
    await ctx.addCookies([{name:COOKIE,value:await signSession('admin@example.test',vars.SESSION_SECRET),
      domain:new URL(BASE).hostname,path:'/',secure:true,httpOnly:true,sameSite:'Strict'}]);
    await ctx.route('https://fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:'/* offline fixture */'}));
    const request=async(method,path,data)=>{
      const r=await ctx.request.fetch(BASE+'api'+path,{method,data,headers:{origin:new URL(BASE).origin}});
      assert.ok(r.ok(),`${method} ${path}: ${r.status()} ${await r.text()}`);return r.json();
    };
    const stamp=`${width}-${Date.now()}`,name=`PRE12 Person ${stamp}`,email=`pre12-${stamp}@example.test`;
    const made=await request('POST','/admin/applicants',{name,email,phone:`+447700${String(width).padStart(6,'0')}`,source:'phone',
      operation:'rent',budget_max:2000});
    const contactId=(await request('GET',`/admin/applicants/${made.id}`)).contact.id;
    const errors=[];const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));
    await page.goto(BASE+'admin/#/');

    // Reached from Settings while the switch is on.
    await page.getByRole('button',{name:/^Settings/}).click();
    await page.getByRole('link',{name:/^Privacy requests/}).click();
    await page.getByRole('heading',{name:'Privacy requests',level:1}).waitFor({timeout:10000});

    // Recording: a missing type is said under the field and focused; nothing is saved.
    await page.getByRole('button',{name:'Record a request',exact:true}).click();
    const form=page.locator('form[aria-labelledby="h-new-privacy"]');
    await form.getByLabel('Where it came from').fill(`Email to the office ${stamp}`);
    await form.getByRole('button',{name:'Save request',exact:true}).click();
    await form.getByText('Choose the type of request').waitFor();
    assert.equal(await form.getByLabel('Type of request').getAttribute('aria-invalid'),'true');
    assert.equal(await page.evaluate(()=>document.activeElement.tagName),'SELECT');
    await form.getByLabel('Type of request').selectOption('access');
    await form.getByLabel('Legal deadline (optional)').fill('2099-01-31');
    await form.getByRole('button',{name:'Save request',exact:true}).click();
    await page.getByRole('heading',{name:'Access request',level:1}).waitFor();
    assert.equal(await page.evaluate(()=>document.activeElement.id),'t-request');
    const card=title=>page.locator('.card').filter({has:page.getByRole('heading',{name:title,exact:true})});

    // Contact: chosen by a person from a posted search.
    let posted=null;page.on('request',r=>{if(r.url().includes('contact-search'))posted=r;});
    await card('Contact').getByLabel('Name, email or phone').fill(email);
    await card('Contact').getByRole('button',{name:'Search contacts',exact:true}).click();
    await card('Contact').getByRole('button',{name:`Link ${name}`,exact:true}).click();
    await page.getByRole('status').filter({hasText:'Contact linked.'}).waitFor();
    assert.equal(posted.method(),'POST');assert.equal(posted.url().includes(encodeURIComponent(email)),false);
    await card('Holds').getByText('Has an active search, or one under review: resolve and archive it first.').waitFor();

    // Identity: who and how.
    await card('Identity check').getByLabel('Photo ID seen').check();
    await card('Identity check').getByLabel('Reference (optional)').fill('Passport seen at the office');
    await card('Identity check').getByRole('button',{name:'Record identity check',exact:true}).click();
    await page.getByRole('status').filter({hasText:'Identity check recorded.'}).waitFor();
    await card('Identity check').getByText(/Checked/).waitFor();

    // A viewing request with the same email: checked by a person, and only once confirmed does it go in the copy.
    const {jerseyToday,plusDays}=await import('../server/viewings.js');
    // The first free weekday slot of the fixture's negotiator.
    let booked=null;
    for(const date of Array.from({length:14},(_,i)=>plusDays(jerseyToday(),i+1))
      .filter(d=>{const day=new Date(d+'T12:00:00Z').getUTCDay();return day>=1&&day<=5;}))
      for(const time of ['10:00','11:00','12:00','14:00','15:00']) if(!booked?.ok()){
        booked=await ctx.request.fetch(BASE+'api/admin/viewings',{method:'POST',headers:{origin:new URL(BASE).origin},
          data:{listing_id:'HE-R001',negotiator_id:1,kind:'In person',date,time,name:`Viewer ${stamp}`,email}});
      }
    assert.ok(booked.ok(),`book a viewing: ${booked.status()} ${await booked.text()}`);
    await page.reload();
    await page.getByRole('heading',{name:'Access request',level:1}).waitFor({timeout:10000});
    const viewings=card('Viewing requests to check');
    await viewings.getByText(`Viewer ${stamp}`,{exact:false}).waitFor();
    await viewings.getByRole('button',{name:/^Confirm it is theirs: viewing request of /}).click();
    await page.getByRole('status').filter({hasText:'Viewing request added to the copy.'}).waitFor();
    await viewings.getByText('In the copy',{exact:true}).waitFor();
    await viewings.getByRole('button',{name:/^Take out of the copy: viewing request of /}).waitFor();

    // Copy: read, marked as reviewed, then downloaded as reviewed.
    const copy=card('Copy for the person');
    await copy.getByRole('button',{name:'Show copy',exact:true}).click();
    await copy.getByLabel('Copy to review').waitFor();
    assert.match(await copy.getByLabel('Copy to review').textContent(),new RegExp(email.replace(/[.]/g,'\\.')));
    assert.match(await copy.getByLabel('Copy to review').textContent(),new RegExp(`Viewer ${stamp}`));
    await copy.getByRole('button',{name:'Mark copy as reviewed',exact:true}).click();
    await page.getByRole('status').filter({hasText:'Copy marked as reviewed.'}).waitFor();
    const [download]=await Promise.all([page.waitForEvent('download'),copy.getByRole('button',{name:'Download JSON',exact:true}).click()]);
    assert.match(download.suggestedFilename(),/^hampton-data-copy-[0-9a-f-]{36}\.json$/);
    const file=JSON.parse(readFileSync(await download.path(),'utf8'));
    assert.equal(file.contact.email,email);
    assert.deepEqual(file.viewing_requests.map(v=>v.name),[`Viewer ${stamp}`]);
    // Changed after the review: the download says so on the page instead.
    const contact=(await request('GET',`/admin/applicants/${made.id}`)).contact;
    await request('PUT',`/admin/contacts/${contactId}`,{updated_at:contact.updated_at,best_time:'Mornings'});
    await copy.getByRole('button',{name:'Download CSV',exact:true}).click();
    await copy.getByRole('alert').filter({hasText:'The data changed after the review'}).waitFor();

    // A change made elsewhere meanwhile: the save is refused and offers to reload.
    const id=page.url().split('/').pop(),current=(await request('GET',`/admin/privacy-requests/${id}`)).request;
    await request('PUT',`/admin/privacy-requests/${id}`,{revision:current.revision,assigned_to:'admin@example.test',
      due_on:current.due_on,reference:current.reference});
    const details=card('Assignment and deadline');
    await details.getByLabel('Where it came from').fill(`Email to the office ${stamp} (edited)`);
    await details.getByRole('button',{name:'Save',exact:true}).click();
    await details.getByRole('alert').filter({hasText:'Someone else changed this request'}).waitFor();
    await details.getByRole('button',{name:'Reload',exact:true}).click();
    await page.getByRole('heading',{name:'Access request',level:1}).waitFor();

    // Closing records the result; it deletes and sends nothing.
    const close=card('Close the request');
    await close.getByLabel('Done',{exact:true}).check();
    await close.getByRole('button',{name:'Close request',exact:true}).click();
    await page.getByRole('status').filter({hasText:'Request closed.'}).waitFor();
    await page.getByText('Closed · Done').first().waitFor();

    // Erasure: the list of what a deletion would remove, and the holds; nothing is deleted.
    const erasure=(await request('POST','/admin/privacy-requests',{id:randomUUID(),kind:'erasure',received_on:'2026-11-12',
      received_via:'letter',reference:`Letter ${stamp}`})).request;
    await request('POST',`/admin/privacy-requests/${erasure.id}/contact`,{revision:1,contact_id:contactId});
    await page.goto(BASE+`admin/#/privacy/${erasure.id}`);
    await page.getByRole('heading',{name:'Erasure request',level:1}).waitFor({timeout:10000});
    await card('What a deletion would remove').getByText('Held: the holds above keep this contact.',{exact:false}).waitFor();
    await card('What a deletion would remove').getByText('Contact record: 1').waitFor();
    assert.equal((await request('GET',`/admin/applicants/${made.id}`)).contact.id,contactId);

    if(width===390) assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no sideways scroll at 390');
    assert.deepEqual(errors,[]);
    await ctx.close();
  }}finally{await browser.close();}
  console.log('PRE-12 isolated UI OK: record, field error, contact search, identity, viewing confirmed one by one, reviewed copy and download, 409, close, erasure plan, 1280/390.');
})().catch(e=>{console.error(e.message);process.exitCode=1;});
