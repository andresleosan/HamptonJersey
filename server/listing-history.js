import {fail} from './http.js';
import {EDITABLE,ENUMS} from './listing.js';
import {validWeeklyWindows} from './viewings.js';

const ACTIONS = ['created','updated','published','unpublished','archived','restored','confirmed',
  'availability_changed','featured_changed','cover_changed','recalculated','deleted','review_requested','review_returned'];
const SOURCES = ['panel','queue','sales','media','recalculate'];
const FREE = ['title','property_type','country','location','road_name','tenure','price_text','summary','description','tour_url','specs','feat_evidence'];
const FIELDS = new Set([...EDITABLE,'published','archived_at','published_at','confirmed_at','cover_media_id',
  'feat_pets','feat_parking','feat_furnished','feat_outdoor','feat_type','feat_evidence','review_requested_at']);
const iso = v => typeof v==='string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v)
  && Number.isFinite(Date.parse(v)) && new Date(v).toISOString()===v;
const positive = v => Number.isSafeInteger(v) && v>0;
const object = v => v!==null && typeof v==='object' && !Array.isArray(v);
// events.at is legacy TEXT, not a validated date. This is a bounded SQL comparison value, never SQL syntax.
const cursorAt = v => typeof v==='string' && /^[\x20-\x7e]{0,128}$/.test(v);
function decodeCursor(cursor,id) {
  if(cursor===undefined || cursor===null)return null;
  try {
    if(typeof cursor!=='string'||cursor.length>512||! /^[A-Za-z0-9_-]+$/.test(cursor))throw Error();
    const c=JSON.parse(atob(cursor.replace(/-/g,'+').replace(/_/g,'/')));
    if(c.v!==1||c.listing_id!==id||!positive(c.snapshot_id)||!positive(c.before_id)||c.before_id>c.snapshot_id
      ||(c.before_at!==null&&!cursorAt(c.before_at)))throw Error();
    return c;
  } catch {fail(400,'Invalid history cursor');}
}
function valueAllowed(field,v) {
  if(v===null)return true;
  if(FREE.includes(field))return false;
  if(Object.hasOwn(ENUMS,field))return ENUMS[field].includes(v);
  if(field.endsWith('_at'))return iso(v);
  if(field==='cover_media_id')return typeof v==='string'&&/^[A-Za-z0-9_.-]{1,128}$/.test(v);
  if(field==='viewing_hours')return validWeeklyWindows(v)&&v.every(w=>Object.keys(w).every(k=>['day','start','end'].includes(k)));
  if(field==='feat_outdoor')return Array.isArray(v)&&v.every(x=>['garden','balcony','terrace'].includes(x));
  if(field==='feat_type')return ['house','flat','cottage','studio'].includes(v);
  if(['feat_pets','feat_furnished'].includes(field))return ['yes','no'].includes(v);
  return typeof v==='boolean'||(typeof v==='number'&&Number.isFinite(v));
}
function project(row) {
  let d;try{d=JSON.parse(row.data);}catch{}
  const valid=object(d)&&Array.isArray(d.fields), known=ACTIONS.some(a=>row.type===`listing.${a}`);
  const changes=valid? [...new Set(d.fields.filter(k=>FIELDS.has(k)))].map(field=>{
    const c={field,derived:Array.isArray(d.derived_fields)&&d.derived_fields.includes(field)};
    if(!FREE.includes(field))for(const side of ['before','after'])
      if(object(d[side])&&Object.hasOwn(d[side],field)&&valueAllowed(field,d[side][field]))c[side]=d[side][field];
    return c;
  }):[];
  return {id:row.id,at:row.at,actor:row.actor,type:known?row.type:'listing.unknown',
    revision:positive(d?.revision)?d.revision:null,source:SOURCES.includes(d?.source)?d.source:null,
    changes,related:Object.fromEntries(['offer_id','sale_id','import_id'].filter(k=>positive(d?.related?.[k])).map(k=>[k,d.related[k]])),
    evidence:[],details_unavailable:!valid||!known};
}

export async function readListingHistory(env,{id,cursor}) {
  if(!/^HE-[A-Z]\d{3,}$/.test(id))fail(404,'Listing not found');
  const c=decodeCursor(cursor,id);
  const listing=await env.DB.prepare(`SELECT 'present' AS state FROM listings WHERE id=?
    UNION ALL SELECT 'deleted' AS state FROM deleted_listings WHERE id=? LIMIT 1`).bind(id,id).first();
  if(!listing)fail(404,'Listing not found');
  // Unbounded/non-ASCII legacy TEXT must not overflow btoa/the 512-character cursor.
  // Its bounded ID anchor resolves at most one row, still scoped to this listing and window.
  if(c?.before_at===null){
    const anchor=await env.DB.prepare("SELECT at FROM events WHERE id=? AND entity_type='listing' AND entity_id=? AND id<=?")
      .bind(c.before_id,id,c.snapshot_id).first();
    if(!anchor)fail(400,'Invalid history cursor');
    c.before_at=anchor.at;
  }
  // Global rowid maximum is a PK lookup; filtering MAX by listing would scan its whole at-ordered history.
  // Fix it in this SQL snapshot. All listing reads remain scoped, and new events stay above this ceiling even with old clocks.
  const {results}=await env.DB.prepare(`WITH window AS MATERIALIZED (
    SELECT COALESCE(?,(SELECT MAX(id) FROM events),0) AS snapshot_id)
    SELECT e.id,e.at,e.actor,e.type,e.data,w.snapshot_id FROM events e CROSS JOIN window w
    WHERE e.entity_type='listing' AND e.entity_id=? AND e.id<=w.snapshot_id
      AND (? IS NULL OR e.at<? OR (e.at=? AND e.id<?))
    ORDER BY e.at DESC,e.id DESC LIMIT 51`)
    .bind(c?.snapshot_id??null,id,c?.before_at??null,c?.before_at??null,c?.before_at??null,c?.before_id??null).all();
  const rows=results.slice(0,50),items=rows.map(project);
  if(items.length){
    const {results:refs}=await env.DB.prepare(`SELECT event_id,evidence_ref,action,reason_code,occurred_at
      FROM listing_marketing_evidence WHERE listing_id=? AND event_id IN (${items.map(()=>'?').join(',')})
      ORDER BY event_id,evidence_ref`).bind(id,...items.map(i=>i.id)).all();
    const byId=new Map(items.map(i=>[i.id,i]));
    for(const r of refs){
      if(!/^(media|source):[A-Za-z0-9_.-]{1,128}$/.test(r.evidence_ref)
        ||!['let_agreed','let','return_to_market'].includes(r.action)
        ||!['agreement','completed','fell_through','correction'].includes(r.reason_code)||!iso(r.occurred_at))continue;
      byId.get(r.event_id)?.evidence.push({evidence_ref:r.evidence_ref,kind:r.evidence_ref.split(':')[0],
        action:r.action,reason_code:r.reason_code,occurred_at:r.occurred_at});
    }
  }
  const last=rows.at(-1);
  const next_cursor=results.length>50?btoa(JSON.stringify({v:1,listing_id:id,snapshot_id:last.snapshot_id,
    before_at:cursorAt(last.at)?last.at:null,before_id:last.id})).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''):null;
  return {listing:{id,state:listing.state},items,next_cursor};
}
