// Read-only summary of the legacy research group already shown to staff in a
// listing detail. This is not a market identity, a source permission or a merge.
const LIMIT = 50;
const listingId = id => typeof id === 'string' && id.length <= 100 &&
  /^HE-[A-Z][0-9]{3,}$/u.test(id) && !/[\r\n]/u.test(id);

export function researchDuplicateReviewStatement(env, id, actor) {
  return env.DB.prepare(`WITH reviewed AS MATERIALIZED (
      SELECT applicant_id,status FROM matches WHERE listing_id=? AND status IN ('shortlisted','rejected') LIMIT 51
    )
    SELECT candidate.property_id AS candidate_id, l.id AS listing_id, l.operation,
      (SELECT count(*) FROM reviewed) AS checked,
      EXISTS (SELECT 1 FROM reviewed own WHERE EXISTS (
        SELECT 1 FROM matches other INDEXED BY sqlite_autoindex_matches_1
        WHERE other.applicant_id=own.applicant_id AND other.listing_id=l.id
          AND ((own.status='shortlisted' AND other.status='rejected')
            OR (own.status='rejected' AND other.status='shortlisted')))) AS conflict
    FROM research_properties current JOIN listings original ON original.id=current.property_id
    JOIN admins actor ON actor.email=?
    JOIN research_properties candidate ON candidate.duplicate_group=current.duplicate_group
      AND candidate.property_id<>current.property_id
    LEFT JOIN listings l ON l.id=candidate.property_id
    WHERE current.property_id=? AND length(trim(current.duplicate_group))>0
    ORDER BY candidate.property_id LIMIT 51`).bind(id,actor,id);
}

export function researchDuplicateReview(rows) {
  const visible=rows.slice(0,LIMIT),candidates=[];
  let unavailable=false;
  for (const row of visible) {
    if (!listingId(row.listing_id) || row.candidate_id!==row.listing_id) { unavailable=true; continue; }
    const checked = Number.isSafeInteger(row.checked) && row.checked >= 0 && row.checked <= LIMIT + 1;
    const incomplete = !checked || row.checked>LIMIT;
    candidates.push({listing_id:row.listing_id,
      operation:['sale','rent','business'].includes(row.operation)?row.operation:'unknown',
      match_conflict:row.conflict===1?(incomplete?'present_incomplete':'present'):
        row.conflict!==0||incomplete?'incomplete':'not_found'});
  }
  return {source:'historical_research_group',candidates,unavailable,truncated:rows.length>LIMIT};
}
