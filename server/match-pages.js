// Authenticated keyset pages. The cursor describes a position and never grants access.
import {fail} from './http.js';
import {MATCHES_SQL,matchCard,MATCH_ORDER} from './routes/matches.js';
export const MATCH_COUNTS_SQL=`SELECT status,COUNT(*) AS n FROM matches WHERE applicant_id=? GROUP BY status`;
export const matchCounts=rows=>Object.fromEntries(['found','shortlisted','rejected'].map(s=>[s,rows.find(r=>r.status===s)?.n??0]));
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
export async function pageMatches(env,applicantId,{status,after=null}){
 if(!['found','shortlisted','rejected'].includes(status))fail(400,'Choose Found, Shortlisted or Rejected.');
 const c=after===null?null:decode(after,applicantId,status);
 // Reading metadata, counts and rows in a single batch prevents a revision from being mixed with another snapshot.
 const [meta,totals,page]=await env.DB.batch([
  env.DB.prepare('SELECT matches_revision,match_ranking_version FROM applicants WHERE id=?').bind(applicantId),
  env.DB.prepare(MATCH_COUNTS_SQL).bind(applicantId),
  env.DB.prepare(`${MATCHES_SQL} WHERE m.applicant_id=? AND m.status=? ${c?`AND
   (m.requirements_rank>? OR (m.requirements_rank=? AND m.score<?) OR
    (m.requirements_rank=? AND m.score=? AND m.area_preference_rank>?) OR
    (m.requirements_rank=? AND m.score=? AND m.area_preference_rank=? AND m.listing_id COLLATE BINARY>?) OR
    (m.requirements_rank=? AND m.score=? AND m.area_preference_rank=? AND m.listing_id COLLATE BINARY=? AND m.id>?))`:''}
   ${MATCH_ORDER} LIMIT 26`).bind(applicantId,status,...(c?[c.rank,c.rank,c.score,c.rank,c.score,c.areaRank,c.rank,c.score,c.areaRank,c.listingId,c.rank,c.score,c.areaRank,c.listingId,c.id]:[])),
 ]);
 const a=meta.results[0];if(!a)fail(404,'Search not found');
 if(c&&c.revision!==a.matches_revision)fail(409,'Matches changed. Start again from the first page.');
 const rows=page.results.slice(0,25),last=rows.at(-1);
 return {matches:rows.map(matchCard),counts:matchCounts(totals.results),revision:a.matches_revision,rankingVersion:a.match_ranking_version,
  next:page.results.length>25?encode({v:2,applicantId,status,revision:a.matches_revision,rank:last.requirements_rank,score:last.score,
   areaRank:last.area_preference_rank,listingId:JSON.parse(last.listing).id,id:last.id}):null};
}
