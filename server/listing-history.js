import { ECONOMIC_FIELDS, economicValue } from './listing-economics.js';
import {fail} from './http.js';
import {EDITABLE,ENUMS} from './listing.js';
import {realDate,validWeeklyWindows} from './viewings.js';
import {LISTING_DETAIL_FIELDS,PROPERTY_CONDITION_LABELS} from './listing-details.js';
import { physicalValue, normalizeFeatureOverrides } from './listing-physical.js';

const ACTIONS = ['created','updated','published','unpublished','archived','restored','confirmed',
  'availability_changed','featured_changed','cover_changed','recalculated','deleted','review_requested','review_returned'];
const SOURCES = ['panel','queue','sales','media','recalculate'];
const FREE = ['title','property_type','country','location','road_name','tenure','price_text','summary','description','tour_url','specs','feat_evidence',
  'building_name_or_number','postcode','developer_name','public_address_publication','content_tags','video_url'];
const FIELDS = new Set([...EDITABLE,...ECONOMIC_FIELDS,...LISTING_DETAIL_FIELDS,'published','archived_at','published_at','confirmed_at','cover_media_id',
  'feat_pets','feat_parking','feat_furnished','feat_outdoor','feat_type','feat_evidence','review_requested_at','public_address_publication','content_tags','video_url']);
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
  if(field==='available_on')return realDate(v)&&!v.startsWith('0000');
  if(ECONOMIC_FIELDS.includes(field)) { try { return economicValue(field,v)===v; } catch { return false; } }
  if(field==='property_condition')return Object.hasOwn(PROPERTY_CONDITION_LABELS,v);
  if(['heating_types','amenities'].includes(field)) {
    try { return Array.isArray(v) && JSON.stringify(physicalValue(field,v)) === JSON.stringify(v); } catch { return false; }
  }
  if(field==='feature_overrides') {
    try { return object(v) && JSON.stringify(normalizeFeatureOverrides(v)) === JSON.stringify(v); } catch { return false; }
  }
  if(Object.hasOwn(ENUMS,field))return ENUMS[field].includes(v);
  if(field.endsWith('_at'))return iso(v);
  if(field==='cover_media_id')return typeof v==='string'&&/^[A-Za-z0-9_.-]{1,128}$/.test(v);
  if(field==='viewing_hours')return validWeeklyWindows(v)&&v.every(w=>Object.keys(w).every(k=>['day','start','end'].includes(k)));
  if(field==='feat_outdoor')return Array.isArray(v)&&v.every(x=>['garden','balcony','terrace'].includes(x));
  if(field==='feat_type')return ['house','flat','cottage','studio'].includes(v);
  if(['feat_pets','feat_furnished'].includes(field))return ['yes','no'].includes(v);
  return typeof v==='boolean'||(typeof v==='number'&&Number.isFinite(v));
}
function validDay(v) {
  if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v))return false;
  const parsed=new Date(`${v}T00:00:00Z`);
  return Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,10)===v;
}
function milestoneState(d) {
  const before=object(d?.before)?d.before:{},after=object(d?.after)?d.after:{};
  if(validDay(after.done_on))return 'completed';
  if(after.not_needed===1)return 'not_needed';
  if(after.done_on===null&&validDay(before.done_on))return 'completion_removed';
  if(after.not_needed===0&&before.not_needed===1)return 'needed_again';
  if(validDay(after.planned_on))return 'planned';
  if(after.planned_on===null&&validDay(before.planned_on))return 'plan_removed';
  return null;
}
function project(row) {
  let d;try{d=JSON.parse(row.data);}catch{}
  if(row.type==='match.reviewed'&&row.history_kind==='related'){
    const states=['found','shortlisted','rejected'],reasons=['price','area','size','condition','other'];
    return {id:row.id,at:row.at,actor:row.actor,type:row.type,revision:null,source:null,
      changes:[],related:{},evidence:[],decision:{from:states.includes(d?.from)?d.from:null,
        to:states.includes(d?.to)?d.to:null,reason:reasons.includes(d?.reason)?d.reason:null},details_unavailable:false};
  }
  if(row.history_kind==='viewing')return {id:row.id,at:row.at,actor:row.actor,type:row.type,
    revision:null,source:null,changes:[],related:{},evidence:[],details_unavailable:false};
  if(row.history_kind==='related'){
    const isOffer=row.type.startsWith('offer.'),key=d?.key;
    const milestone=['lawyers','due_diligence','questionnaire','searches','mortgage','contract','funds','passing','settled'].includes(key)?key:null;
    return {id:row.id,at:row.at,actor:row.actor,type:row.type,revision:null,source:null,
      changes:[],related:isOffer?(positive(d?.offer_id)?{offer_id:d.offer_id}:{}):(positive(d?.sale_id)?{sale_id:d.sale_id}:{}),
      evidence:[],...(row.type==='sale.milestone'?{milestone,milestone_state:milestone?milestoneState(d):null}:{}),
      details_unavailable:false};
  }
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

const VIEWING_SQL=`SELECT h.event_id AS id,h.at AS at,e.actor,e.type,e.data,w.snapshot_id,'viewing' AS history_kind
  FROM history_viewing_events h JOIN events e ON e.id=h.event_id CROSS JOIN window w
  WHERE h.listing_id=? AND h.event_id<=w.snapshot_id`;

const RELATED_SQL=`SELECT e.id,e.at,e.actor,e.type,e.data,w.snapshot_id,'related' AS history_kind
  FROM events e CROSS JOIN window w WHERE e.entity_type='applicant'
    AND e.type IN ('match.reviewed','offer.recorded','offer.updated','offer.countered','offer.rejected','offer.withdrawn','offer.accepted',
      'sale.updated','sale.milestone','sale.completed','sale.fallen_through')
    AND CASE WHEN json_valid(e.data) THEN json_extract(e.data,'$.listing_id') END=?
    AND EXISTS(SELECT 1 FROM applicants a WHERE a.id=CAST(e.entity_id AS INTEGER) AND CAST(a.id AS TEXT)=e.entity_id)
    AND (e.type='match.reviewed' OR e.type LIKE 'offer.%' AND EXISTS(SELECT 1 FROM offers o
      WHERE o.id=CASE WHEN json_valid(e.data) THEN json_extract(e.data,'$.offer_id') END
        AND o.listing_id=? AND CAST(o.applicant_id AS TEXT)=e.entity_id)
      OR e.type LIKE 'sale.%' AND EXISTS(SELECT 1 FROM sales s
      WHERE s.id=CASE WHEN json_valid(e.data) THEN json_extract(e.data,'$.sale_id') END
        AND s.listing_id=? AND CAST(s.applicant_id AS TEXT)=e.entity_id))
    AND e.id<=w.snapshot_id`;

export async function validateListingHistoryRows(env,{id,ids}) {
  if(!/^HE-[A-Z]\d{3,}$/.test(id))fail(404,'Listing not found');
  if(!Array.isArray(ids)||!ids.length||ids.length>10000||ids.some(n=>!positive(n))||new Set(ids).size!==ids.length)
    fail(400,'Invalid history rows');
  const {n}=await env.DB.prepare(`SELECT COUNT(*) AS n FROM json_each(?) requested
    CROSS JOIN events e WHERE e.id=CAST(requested.value AS INTEGER) AND (
      e.entity_type='listing' AND e.entity_id=?
      OR e.entity_type='viewing' AND EXISTS(SELECT 1 FROM history_viewing_events h
        WHERE h.event_id=e.id AND h.listing_id=?)
      OR e.entity_type='applicant'
        AND CASE WHEN json_valid(e.data) THEN json_extract(e.data,'$.listing_id') END=?
        AND EXISTS(SELECT 1 FROM applicants a WHERE a.id=CAST(e.entity_id AS INTEGER)
          AND CAST(a.id AS TEXT)=e.entity_id)
        AND (e.type='match.reviewed'
          OR e.type IN ('offer.recorded','offer.updated','offer.countered','offer.rejected','offer.withdrawn','offer.accepted')
            AND EXISTS(SELECT 1 FROM offers o WHERE o.id=json_extract(e.data,'$.offer_id')
              AND o.listing_id=? AND CAST(o.applicant_id AS TEXT)=e.entity_id)
          OR e.type IN ('sale.updated','sale.milestone','sale.completed','sale.fallen_through')
            AND EXISTS(SELECT 1 FROM sales s WHERE s.id=json_extract(e.data,'$.sale_id')
              AND s.listing_id=? AND CAST(s.applicant_id AS TEXT)=e.entity_id)))`)
    .bind(JSON.stringify(ids),id,id,id,id,id).first();
  if(n!==ids.length)fail(409,'History changed. Refresh history to continue.');
  return {valid:true};
}

export async function readListingHistory(env,{id,cursor}) {
  if(!/^HE-[A-Z]\d{3,}$/.test(id))fail(404,'Listing not found');
  const c=decodeCursor(cursor,id);
  const listing=await env.DB.prepare(`SELECT 'present' AS state FROM listings WHERE id=?
    UNION ALL SELECT 'deleted' AS state FROM deleted_listings WHERE id=? LIMIT 1`).bind(id,id).first();
  if(!listing)fail(404,'Listing not found');
  // Resolve a legacy unprintable date through its PK. Every continuation also checks that
  // its anchor is still attributable to this property after a related row is deleted.
  if(c){
    const anchor=await env.DB.prepare('SELECT at,type,entity_type,entity_id,data FROM events WHERE id=? AND id<=?')
      .bind(c.before_id,c.snapshot_id).first();
    if(!anchor)fail(400,'Invalid history cursor');
    let data;try{data=JSON.parse(anchor.data);}catch{}
    let belongs=anchor.entity_type==='listing'&&anchor.entity_id===id;
    if(anchor.entity_type==='applicant'&&data?.listing_id===id&&/^[1-9]\d*$/.test(anchor.entity_id)){
      const applicant=Number(anchor.entity_id);
      if(Number.isSafeInteger(applicant)){
        const alive=await env.DB.prepare('SELECT 1 FROM applicants WHERE id=?').bind(applicant).first();
        if(alive&&anchor.type==='match.reviewed')belongs=true;
        else if(alive&&anchor.type.startsWith('offer.')&&positive(data.offer_id))
          belongs=!!(await env.DB.prepare('SELECT 1 FROM offers WHERE id=? AND listing_id=? AND applicant_id=?')
            .bind(data.offer_id,id,applicant).first());
        else if(alive&&anchor.type.startsWith('sale.')&&positive(data.sale_id))
          belongs=!!(await env.DB.prepare('SELECT 1 FROM sales WHERE id=? AND listing_id=? AND applicant_id=?')
            .bind(data.sale_id,id,applicant).first());
      }
    }
    if(anchor.entity_type==='viewing')belongs=!!(await env.DB.prepare(
      'SELECT 1 FROM history_viewing_events WHERE event_id=? AND listing_id=?').bind(c.before_id,id).first());
    if(!belongs)fail(400,'Invalid history cursor');
    if(c.before_at===null)c.before_at=anchor.at;
  }
  // Global rowid maximum is a PK lookup; filtering MAX by listing would scan its whole at-ordered history.
  // Fix it in this SQL snapshot. All listing reads remain scoped, and new events stay above this ceiling even with old clocks.
  const before=c?'AND (e.at,e.id)<(?,?)':'',beforeArgs=c?[c.before_at,c.before_id]:[];
  const viewingBefore=c?'AND h.at=? AND h.event_id<?':'',viewingOlder=c?`UNION ALL ${VIEWING_SQL} AND h.at<?`:'';
  const viewingArgs=c?[id,c.before_at,c.before_id,id,c.before_at]:[id];
  // On a deep page, an equality seek by (at,id) must not scan every event sharing the date.
  const relatedBefore=c?'AND e.at=? AND e.id<?':'',relatedOlder=c?`UNION ALL ${RELATED_SQL} AND e.at<?`:'';
  const relatedArgs=c?[id,id,id,c.before_at,c.before_id,id,id,id,c.before_at]:[id,id,id];
  const {results}=await env.DB.prepare(`WITH window AS MATERIALIZED (
    SELECT COALESCE(?,(SELECT MAX(id) FROM events),0) AS snapshot_id), history AS (
    SELECT e.id,e.at,e.actor,e.type,e.data,w.snapshot_id,'listing' AS history_kind FROM events e CROSS JOIN window w
    WHERE e.entity_type='listing' AND e.entity_id=? AND e.id<=w.snapshot_id
      ${before}
    UNION ALL
    ${VIEWING_SQL} ${viewingBefore}
    ${viewingOlder}
    UNION ALL
    ${RELATED_SQL} ${relatedBefore}
    ${relatedOlder})
    SELECT * FROM history ORDER BY at DESC,id DESC LIMIT 51`)
    .bind(c?.snapshot_id??null,id,...beforeArgs,...viewingArgs,...relatedArgs).all();
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
