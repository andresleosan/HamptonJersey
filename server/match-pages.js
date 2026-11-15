// Authenticated keyset pages. The cursor describes a position and never grants access.
import {fail} from './http.js';
import {MATCHES_SQL,matchCards,MATCH_ORDER,APPROVED,CLARIFICATION_APPROVED} from './routes/matches.js';
import {availabilityReady} from './availability-confirmations.js';
import {enquiriesReady} from './consultations.js';
export const MATCH_COUNTS_SQL=`SELECT status,COUNT(*) AS n FROM matches WHERE applicant_id=? GROUP BY status`;
export const matchCounts=rows=>Object.fromEntries(['found','shortlisted','rejected'].map(s=>[s,rows.find(r=>r.status===s)?.n??0]));

// SAP-02 / SAP-03 / EST-04: what a search's matches add up to beyond their review, each rule the card's own
// (server/candidate-state.js), in SQL over matches m JOIN listings l JOIN applicants a so a whole list is one read.
// Off (SAP02_COUNTS_READY) nothing here is read and the list, the record and the queue answer as before.
export const countsReady=env=>env?.SAP02_COUNTS_READY==='1';
const missing=e=>/no such table/.test(e?.message??'');
// The confirmation in force for the listing, as inForce() of server/availability-confirmations.js resolves it for a
// card: what the latest moment says among those about the whole property or the operation it offers now. NULL: none,
// or they disagree at that moment (neither stands until a person records a new one).
const IN_FORCE=`(SELECT CASE WHEN COUNT(DISTINCT c.status)=1 THEN MIN(c.status) END FROM availability_confirmations c
  WHERE c.listing_id=l.id AND (c.operation IS NULL OR c.operation=l.operation) AND c.confirmed_at=(SELECT MAX(n.confirmed_at)
   FROM availability_confirmations n WHERE n.listing_id=l.id AND (n.operation IS NULL OR n.operation=l.operation)))`;
// Still proposable: approved on the search and the property as they are now, of an active search, and still offered.
// The gate a first enquiry starts from (BUS-15, AGE-03), so a shortlist alone is never read as available.
const PROPOSABLE=`${APPROVED} AND l.archived_at IS NULL AND l.availability IN ('for_sale','to_let','lease')`;
// EST-04, waiting for the agency: the match still counts for an enquiry that is open (prepared or recorded as sent,
// no answer recorded). AGE-06 writes the answers. "Waiting for the applicant" gets its own rule here once AGE-12
// records what a client was sent and answered: In process is either.
const WAITING=`EXISTS (SELECT 1 FROM consultation_matches cm JOIN consultations c ON c.id=cm.consultation_id WHERE cm.match_id=m.id
  AND c.status NOT IN ('answered','cancelled') AND CASE c.kind WHEN 'general' THEN (${PROPOSABLE}) ELSE (${CLARIFICATION_APPROVED}) END)`;
const OPEN_ENQUIRY_MATCHES=`SELECT cm.match_id FROM consultation_matches cm JOIN consultations c ON c.id=cm.consultation_id
  WHERE c.status NOT IN ('answered','cancelled')`;
const FROM=`FROM matches m JOIN listings l ON l.id=m.listing_id JOIN applicants a ON a.id=m.applicant_id`;
// Confirmed: a person's confirmation in force says available. Available: confirmed and still proposable. Confirmed
// not available is neither, and is counted apart. A rejected match counts nowhere. Each with the switch of its facts.
const ONLY={
 confirmed:[availabilityReady,`m.status<>'rejected' AND ${IN_FORCE}='available'`],
 available:[availabilityReady,`${IN_FORCE}='available' AND ${PROPOSABLE}`],
 unavailable:[availabilityReady,`m.status<>'rejected' AND ${IN_FORCE}='unavailable'`],
 waiting_agent:[enquiriesReady,WAITING],
};
// The searches with a home waiting for the agency, for the list's own query: read once, from the open enquiries.
// null: enquiries are switched off.
export const waitingSearches=env=>enquiriesReady(env)?`SELECT m.applicant_id ${FROM} WHERE m.id IN (${OPEN_ENQUIRY_MATCHES}) AND ${WAITING}`:null;
// counts(id) => { confirmed, available, unavailable } and, for one search, waiting_agent while enquiries are on. One
// read of each for every search (or the one given), from the listings with a confirmation and the open enquiries;
// zeros while EST-16 is off or before its migration.
export async function candidateCounts(env,applicantId=null){
 const one=applicantId===null?'':' AND m.applicant_id=?';
 const read=async(ready,sql)=>{
  if(!ready)return null;
  try{return (await env.DB.prepare(`${sql}${one} GROUP BY m.applicant_id`).bind(...(applicantId===null?[]:[applicantId])).all()).results;}
  catch(e){if(missing(e))return null;throw e;}
 };
 const [confirmed,waiting]=await Promise.all([
  read(availabilityReady(env),`SELECT m.applicant_id AS id,${['confirmed','available','unavailable']
   .map(k=>`COUNT(CASE WHEN ${ONLY[k][1]} THEN 1 END) AS ${k}`)} ${FROM} WHERE m.listing_id IN (SELECT listing_id FROM availability_confirmations)`),
  read(applicantId!==null&&enquiriesReady(env),`SELECT m.applicant_id AS id,COUNT(*) AS waiting_agent ${FROM}
   WHERE m.id IN (${OPEN_ENQUIRY_MATCHES}) AND ${WAITING}`)]);
 return id=>{
  const {confirmed:c=0,available=0,unavailable=0}=confirmed?.find(r=>r.id===id)??{};
  return {confirmed:c,available,unavailable,...(waiting&&{waiting_agent:waiting.find(r=>r.id===id)?.waiting_agent??0})};
 };
}
const encode=c=>btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(c)))).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
function decode(token,applicantId,status){
 try{
  if(typeof token!=='string'||token.length>1024||!token.length||!/^[A-Za-z0-9_-]+$/.test(token))throw 0;
  const c=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(atob(token.replaceAll('-','+').replaceAll('_','/')),x=>x.charCodeAt(0))));
  const keys=Object.keys(c||{}).sort().join(',');
  const old=c?.v===1&&keys==='applicantId,id,listingId,rank,revision,score,status,v';
  const current=c?.v===2&&keys==='applicantId,areaRank,id,listingId,rank,revision,score,status,v'
    &&Number.isInteger(c.areaRank)&&[0,1].includes(c.areaRank);
  if(!c||Array.isArray(c)||(!old&&!current)
   ||c.applicantId!==applicantId||c.status!==status||!Number.isSafeInteger(c.revision)||c.revision<0
   ||!Number.isInteger(c.rank)||c.rank<0||c.rank>3||!Number.isInteger(c.score)||c.score<0||c.score>100
   ||!Number.isSafeInteger(c.id)||c.id<1||typeof c.listingId!=='string'||!c.listingId.length||c.listingId.length>160)throw 0;
  return {...c,areaRank:old?1:c.areaRank};
 }catch{fail(400,'Invalid match page. Start again from the first page.');}
}
// only (SAP-03): the group's matches that are confirmed, available, confirmed not available or waiting for the agency:
// the same cards in the same order, fewer of them. counts are then those shown, and summary says how many there are
// of each, whatever the page. A rule whose facts are switched off matches nothing and reads nothing.
export async function pageMatches(env,applicantId,{status,after=null,only=null}){
 if(!['found','shortlisted','rejected'].includes(status))fail(400,'Choose Found, Shortlisted or Rejected.');
 if(only!==null&&!(countsReady(env)&&Object.hasOwn(ONLY,only)))fail(400,'Invalid match page options');
 const c=after===null?null:decode(after,applicantId,status);
 const narrowed=only===null?'':ONLY[only][0](env)?ONLY[only][1]:'0';
 // Reading metadata, counts and rows in a single batch prevents a revision from being mixed with another snapshot.
 const [meta,totals,page]=await env.DB.batch([
  env.DB.prepare('SELECT matches_revision,match_ranking_version FROM applicants WHERE id=?').bind(applicantId),
  env.DB.prepare(narrowed?`SELECT m.status,COUNT(*) AS n ${FROM} WHERE m.applicant_id=? AND (${narrowed}) GROUP BY m.status`:MATCH_COUNTS_SQL).bind(applicantId),
  env.DB.prepare(`${MATCHES_SQL} WHERE m.applicant_id=? AND m.status=? ${narrowed&&`AND (${narrowed}) `}${c?`AND
   (m.requirements_rank>? OR (m.requirements_rank=? AND m.score<?) OR
    (m.requirements_rank=? AND m.score=? AND m.area_preference_rank>?) OR
    (m.requirements_rank=? AND m.score=? AND m.area_preference_rank=? AND m.listing_id COLLATE BINARY>?) OR
    (m.requirements_rank=? AND m.score=? AND m.area_preference_rank=? AND m.listing_id COLLATE BINARY=? AND m.id>?))`:''}
   ${MATCH_ORDER} LIMIT 26`).bind(applicantId,status,...(c?[c.rank,c.rank,c.score,c.rank,c.score,c.areaRank,c.rank,c.score,c.areaRank,c.listingId,c.rank,c.score,c.areaRank,c.listingId,c.id]:[])),
 ]);
 const a=meta.results[0];if(!a)fail(404,'Search not found');
 if(c&&c.revision!==a.matches_revision)fail(409,'Matches changed. Start again from the first page.');
 const rows=page.results.slice(0,25),last=rows.at(-1);
 return {matches:await matchCards(env,rows),counts:matchCounts(totals.results),revision:a.matches_revision,rankingVersion:a.match_ranking_version,
  ...(countsReady(env)&&{summary:(await candidateCounts(env,applicantId))(applicantId)}),
  next:page.results.length>25?encode({v:2,applicantId,status,revision:a.matches_revision,rank:last.requirements_rank,score:last.score,
   areaRank:last.area_preference_rank,listingId:JSON.parse(last.listing).id,id:last.id}):null};
}
