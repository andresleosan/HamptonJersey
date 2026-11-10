import {json,fail,readJson,HttpError} from './http.js';
import {readListingHistory,validateListingHistoryRows} from './listing-history.js';

const QA_ID='HE-Q999';
const GUARD='hampton-qa-history-v1';
const enc=new TextEncoder();
const QA_TYPES=new Set(['listing.created','listing.updated','match.reviewed','viewing.requested',
  'offer.recorded','sale.milestone']);

async function authorised(request,env) {
  if(env.QA_HISTORY_ACTIVE!=='true')fail(503,'QA is not configured');
  const key=env.QA_HISTORY_KEY;
  if(!env.QA_DB||env.QA_DB===env.DB||typeof key!=='string'||key.length<32)fail(503,'QA is not configured');
  if(key===env.HERMES_KEY||key===env.SESSION_SECRET)fail(503,'QA is not configured');
  const supplied=/^Bearer ([A-Za-z0-9_-]{32,128})$/.exec(request.headers.get('authorization')??'')?.[1];
  if(!supplied)fail(401,'Unauthorized');
  const [a,b]=await Promise.all([supplied,key].map(s=>crypto.subtle.digest('SHA-256',enc.encode(s))));
  const x=new Uint8Array(a),y=new Uint8Array(b);let diff=0;
  for(let i=0;i<x.length;i++)diff|=x[i]^y[i];
  if(diff)fail(401,'Unauthorized');
  try {
    const marker=await env.QA_DB.prepare('SELECT marker FROM qa_history_guard WHERE id=1').first();
    if(marker?.marker!==GUARD)fail(503,'QA is not configured');
    const inBusiness=await env.DB.prepare(`SELECT 1 AS present FROM sqlite_master
      WHERE type='table' AND name='qa_history_guard' LIMIT 1`).first();
    if(inBusiness)fail(503,'QA is not configured');
  } catch {fail(503,'QA is not configured');}
}

function safeFixture(page) {
  if(page?.listing?.id!==QA_ID||page.listing.state!=='present'||!Array.isArray(page.items)||
    page.next_cursor!==null&&(typeof page.next_cursor!=='string'||page.next_cursor.length>512||
      !/^[A-Za-z0-9_-]+$/.test(page.next_cursor)))fail(503,'QA fixture invalid');
  const items=page.items.map(i=>{
    const related=i.type==='offer.recorded'?{offer_id:1}:i.type==='sale.milestone'?{sale_id:1}:{};
    if(!Number.isSafeInteger(i.id)||i.id<1||typeof i.at!=='string'||
      !/^2026-11-10T\d\d:\d\d:\d\d\.\d{3}Z$/.test(i.at)||
      i.actor!=='system'||!QA_TYPES.has(i.type)||i.revision!==null||i.source!==null||
      !Array.isArray(i.changes)||i.changes.length||!Array.isArray(i.evidence)||i.evidence.length||
      i.details_unavailable!==false||JSON.stringify(i.related)!==JSON.stringify(related)||
      i.type==='match.reviewed'&&JSON.stringify(i.decision)!==JSON.stringify({from:'found',to:'shortlisted',reason:null})||
      i.type==='sale.milestone'&&(i.milestone!=='passing'||i.milestone_state!=='planned'))
      fail(503,'QA fixture invalid');
    return {id:i.id,at:i.at,actor:'system',type:i.type,revision:null,source:null,changes:[],related,
      evidence:[],details_unavailable:false,
      ...(i.type==='match.reviewed'?{decision:{from:'found',to:'shortlisted',reason:null}}:{}),
      ...(i.type==='sale.milestone'?{milestone:'passing',milestone_state:'planned'}:{})};
  });
  return {listing:{id:QA_ID,state:'present'},items,next_cursor:page.next_cursor};
}

async function productionCheck(env) {
  try {
    const hit=await env.DB.prepare(`SELECT h.listing_id AS id FROM history_viewing_events h
      JOIN listings l ON l.id=h.listing_id ORDER BY h.event_id DESC LIMIT 1`).first()
      ??await env.DB.prepare(`SELECT e.entity_id AS id FROM events e
        JOIN listings l ON l.id=e.entity_id WHERE e.entity_type='listing'
        ORDER BY e.id DESC LIMIT 1`).first();
    if(!hit||!/^HE-[A-Z]\d{3,}$/.test(hit.id))throw Error('No valid sample');
    const page=await readListingHistory(env,{id:hit.id,cursor:null});
    if(!page.items.length)throw Error('No related events');
    await validateListingHistoryRows(env,{id:hit.id,ids:[page.items[0].id]});
    return json({ok:true});
  } catch {
    // Never log or serialize a real row, SQL, listing ID or staff identity.
    return json({error:'Production history check unavailable'},503);
  }
}

export async function qaRoute({request,env,path,segments}) {
  if(segments.some(s=>s.includes('%')))fail(404,'Not found');
  await authorised(request,env);
  const qaEnv={...env,DB:env.QA_DB};
  try {
    if(request.method==='GET'&&path==='/qa/history'){
      const params=new URL(request.url).searchParams;
      if([...params.keys()].some(k=>k!=='cursor')||params.getAll('cursor').length>1)fail(400,'Invalid query');
      return json(safeFixture(await readListingHistory(qaEnv,{id:QA_ID,cursor:params.get('cursor')})));
    }
    if(request.method==='POST'&&path==='/qa/history/validate'){
      if(new URL(request.url).search)fail(400,'Invalid query');
      return json(await validateListingHistoryRows(qaEnv,{id:QA_ID,ids:(await readJson(request,262144))?.ids}));
    }
    if(request.method==='GET'&&path==='/qa/production-check'){
      if(new URL(request.url).search)fail(400,'Invalid query');
      return productionCheck(env);
    }
    fail(404,'Not found');
  } catch(e) {
    if(e instanceof HttpError)throw e;
    // The QA DB may be misconfigured; never send/log its SQL or data.
    return json({error:'QA history unavailable'},503);
  }
}
