// SPR-02 B: only existing published QA fixtures; caller owns transport and authentication.
const ORIGIN='https://hamptonjersey-qa.pages.dev';
const SOURCE='80ad03df7e095750f455aa4aa668573e9aac5db4';
const SCOPE='Readonly SPR-02 B fixture projection, pagination and UI. Does not establish remote deletion/revocation behavior, producer writes, SPR-02 C or outbound provider delivery.';
const base='/api/admin/listings/';
const fail=label=>Object.assign(new Error(`QA_CASE_FAILED:${label}`),{qaCase:label});
const requireCase=(condition,label)=>{if(!condition)throw fail(label);};
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const keys=(value,names)=>object(value)&&Object.keys(value).length===names.length&&names.every(name=>Object.hasOwn(value,name));
const positive=value=>Number.isSafeInteger(value)&&value>0;
const iso=value=>typeof value==='string'&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString()===value;
const older=(a,b)=>a.at>b.at||a.at===b.at&&a.id>b.id;

function projection(item,listing) {
  const common=['id','at','actor','type','revision','source','changes','related','evidence','details_unavailable'];
  const extra=item?.type==='match.reviewed'?['decision']:item?.type==='sale.milestone'?['milestone','milestone_state']:[];
  if(!keys(item,[...common,...extra])||!positive(item.id)||!iso(item.at)||item.actor!=='qa-agent@example.test'
    ||item.details_unavailable!==false||!Array.isArray(item.evidence)||item.evidence.length!==0||!Array.isArray(item.changes))return false;
  if(item.type==='listing.created')return item.revision===1&&item.source==='panel'&&item.changes.length===0&&keys(item.related,[]);
  if(item.type==='listing.updated')return listing==='HE-Q001'&&positive(item.revision)&&item.source==='panel'
    &&keys(item.related,[])&&item.changes.length===1&&item.changes.every(c=>keys(c,['field','derived','before','after'])
      &&c.field==='bedrooms'&&c.derived===false&&[2,3].includes(c.before)&&[2,3].includes(c.after)&&c.before!==c.after);
  if(item.revision!==null||item.source!==null||item.changes.length!==0)return false;
  if(item.type==='match.reviewed')return listing==='HE-Q001'&&keys(item.related,[])&&keys(item.decision,['from','to','reason'])
    &&item.decision.from==='found'&&item.decision.to==='shortlisted'&&item.decision.reason===null;
  if(item.type==='viewing.requested')return listing==='HE-Q001'&&keys(item.related,[]);
  if(item.type==='offer.recorded')return listing==='HE-Q001'&&keys(item.related,['offer_id'])&&item.related.offer_id===2;
  return item.type==='sale.milestone'&&listing==='HE-Q006'&&keys(item.related,['sale_id'])&&item.related.sale_id===1
    &&item.milestone==='passing'&&item.milestone_state==='planned';
}

export async function runHistoryB(client,{buildId}={}) {
  const checks=[],record=name=>checks.push({case:name,passed:true,mode:'readonly-history-b'});
  const check=(ok,name)=>{requireCase(ok,name);record(name);};
  const request=async(name,path,options={},status=200)=>{
    let response;try{response=await client.request(path,options);}catch{throw fail(name);}
    requireCase(response?.status===status,name);return response.data;
  };
  const page=async(listing,cursor=null)=>{
    const name=`history-${listing}-page`,data=await request(name,base+listing+'/history'+(cursor?'?cursor='+encodeURIComponent(cursor):''));
    requireCase(keys(data,['listing','items','next_cursor'])&&keys(data.listing,['id','state'])&&data.listing.id===listing
      &&data.listing.state==='present'&&Array.isArray(data.items)&&data.items.length>0&&data.items.length<=50
      &&(data.next_cursor===null||typeof data.next_cursor==='string'&&/^[A-Za-z0-9_-]{1,512}$/.test(data.next_cursor)),name);
    requireCase(data.items.every(item=>projection(item,listing))&&data.items.every((item,i)=>i===0||older(data.items[i-1],item)),name+'-projection');
    record(name);return data;
  };
  try {
    requireCase(typeof buildId==='string'&&/^[a-f0-9]{64}$/.test(buildId),'history-input-build');
    const state=await request('history-state','/api/qa-app/state');
    check(state?.source_sha===SOURCE&&state.build_id===buildId&&state.origin===ORIGIN&&state.project==='hamptonjersey-qa'
      &&state.guard==='verified'&&state.email==='qa-agent@example.test','history-state');
    await request('history-anonymous',base+'HE-Q001/history',{anonymous:true},401);record('history-anonymous');
    const first=await page('HE-Q001');
    check(first.items.length===50&&typeof first.next_cursor==='string','history-first-50');
    const last=await page('HE-Q001',first.next_cursor),all=[...first.items,...last.items];
    check(last.next_cursor===null&&last.items.length===14&&all.length===64&&new Set(all.map(i=>i.id)).size===64
      &&all.every((item,i)=>i===0||older(all[i-1],item)),'history-older-unique-order');
    const counts=type=>all.filter(item=>item.type===type).length;
    check(counts('listing.created')===1&&counts('listing.updated')===60&&counts('match.reviewed')===1
      &&counts('viewing.requested')===1&&counts('offer.recorded')===1,'history-existing-related-fixtures');
    check(all.every(item=>!item.type.startsWith('sale.')&&!Object.hasOwn(item.related,'sale_id')),'history-no-cross-listing-sale');
    const validated=await request('history-visible-validation',base+'HE-Q001/history/validate',{method:'POST',json:{ids:all.map(i=>i.id)}});
    check(keys(validated,['valid'])&&validated.valid===true,'history-visible-validation');
    await request('history-invalid-cursor',base+'HE-Q001/history?cursor=invalid',{},400);record('history-invalid-cursor');
    await request('history-cross-listing-cursor',base+'HE-Q006/history?cursor='+encodeURIComponent(first.next_cursor),{},400);record('history-cross-listing-cursor');
    const sale=await page('HE-Q006');
    check(sale.next_cursor===null&&sale.items.length===2&&sale.items.filter(i=>i.type==='sale.milestone').length===1
      &&sale.items.filter(i=>i.type==='listing.created').length===1,'history-milestone-planned');
    const saleValidated=await request('history-sale-validation',base+'HE-Q006/history/validate',{method:'POST',json:{ids:sale.items.map(i=>i.id)}});
    check(keys(saleValidated,['valid'])&&saleValidated.valid===true,'history-sale-validation');
    return {checks,cleanup:{attempted:false,errors:[]},scope:SCOPE};
  }catch(error){const failure=fail(error?.qaCase??'history-suite');failure.qaReport={checks,cleanup:{attempted:false,errors:[]},scope:SCOPE};throw failure;}
}

export async function runHistoryBUI(context,{widths=[1280,390]}={}) {
  if(!Array.isArray(widths)||!widths.length||widths.some(n=>!Number.isInteger(n)||n<320||n>2560))throw Error('Invalid QA viewport widths');
  const checks=[];let consoleErrors=0;
  for(const width of widths){
    const page=await context.newPage();let errors=0;
    page.on('console',message=>{if(message.type()==='error')errors++;});page.on('pageerror',()=>{errors++;});
    page.setDefaultTimeout(12000);
    try {
      await page.setViewportSize({width,height:900});
      for(const listing of ['HE-Q001','HE-Q006']){
        const check={case:`history-${listing}-ui-${width}`,passed:false,mode:'readonly-history-b-ui'},before=errors;
        try {
          await page.goto(ORIGIN+'/admin/#/p/'+listing,{waitUntil:'domcontentloaded',timeout:20000});
          const button=page.getByRole('navigation',{name:'Listing sections'}).getByRole('button',{name:'History',exact:true});
          await button.focus();await page.keyboard.press('Enter');
          const history=page.getByRole('region',{name:'History',exact:true});
          const ready=count=>history.getByRole('status').getByText(`${count} recorded events shown.`,{exact:true}).waitFor();
          if(listing==='HE-Q001'){
            await ready(50);
            for(const label of ['Match shortlisted','Viewing requested','Offer recorded'])await history.getByRole('heading',{name:label,exact:true}).waitFor();
            const match=history.locator('ol > li').filter({hasText:'Match shortlisted'}).first();
            await match.locator('summary').click();await match.getByText('Decision: Found to Shortlisted',{exact:true}).waitFor();
            await history.getByRole('button',{name:'Load older events',exact:true}).click();await ready(64);
            requireCase(await history.locator('ol > li').count()===64,'history-ui-older-count');
            requireCase(await history.getByRole('button',{name:'Load older events',exact:true}).count()===0,'history-ui-older-end');
            await history.getByRole('button',{name:'Refresh history',exact:true}).click();await ready(50);
          }else{
            await ready(2);
            const step=history.locator('ol > li').filter({hasText:'Sale milestone updated'}).first();
            await step.locator('summary').click();await step.getByText('Sale step: passing',{exact:true}).waitFor();
            await step.getByText('Step state: Planned',{exact:true}).waitFor();
          }
          requireCase(await history.getByRole('alert').count()===0,'history-ui-alert');
          requireCase(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'history-ui-overflow');
          await page.evaluate(()=>{document.documentElement.style.zoom='2';});await history.scrollIntoViewIfNeeded();
          requireCase(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'history-ui-zoom-overflow');
          await page.evaluate(()=>{document.documentElement.style.zoom='1';});
          requireCase(errors===before,'history-ui-browser-error');check.passed=true;
        }catch{check.failure='history-ui-failed';}
        check.consoleErrors=errors-before;checks.push(check);
      }
    }finally{consoleErrors+=errors;await page.close();}
  }
  return {origin:ORIGIN,checks,consoleErrors,widths:[...widths],scope:SCOPE};
}
