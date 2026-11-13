// Historical research groups are leads for a person to inspect, never proof of
// physical identity or permission to change a listing or a match.
const validId = id => typeof id === 'string' && id.length <= 100 &&
  /^HE-[A-Z][0-9]{3,}$/u.test(id) && !/[\r\n]/u.test(id);
const OPERATIONS = new Map([['sale','Sale'],['rent','Rent'],['business','Business']]);

export default function ResearchDuplicateReview({review,legacyIds=[]}) {
  if (!review || review.source !== 'historical_research_group' || !Array.isArray(review.candidates)) {
    return ((Array.isArray(legacyIds) && legacyIds.length > 0) || review)
      ? <p className="warn" role="note">Historical suggestions cannot be reviewed. Reload this listing.</p> : null;
  }
  const seen=new Set(), candidates=[];
  const truncated=review.truncated || review.candidates.length>50;
  let invalid=false;
  for (const candidate of review.candidates.slice(0,50)) {
    const id=candidate?.listing_id;
    if (!validId(id) || seen.has(id)) {invalid=true;continue;}
    seen.add(id);candidates.push(candidate);
  }
  if (!candidates.length && !review.unavailable && !truncated && !invalid) return null;
  return <section className="warn" role="note" aria-label="Possible duplicate listings">
    <p>Possible duplicates from historical research. A shared group does not confirm that these are the same home. Review each unit separately.</p>
    {candidates.length > 0 && <ul>{candidates.map(candidate => <li key={candidate.listing_id}>
      <a href={`#/p/${encodeURIComponent(candidate.listing_id)}`}>{candidate.listing_id}</a>
      {' · '}{OPERATIONS.get(candidate.operation) ?? 'Unknown operation'}
      {['present','present_incomplete'].includes(candidate.match_conflict) && <span> · The same search has different reviews on these listings.</span>}
      {!['present','not_found'].includes(candidate.match_conflict) && <span> · Match review check is not complete.</span>}
    </li>)}</ul>}
    {(review.unavailable || invalid) && <p>Some historical records are unavailable to review.</p>}
    {truncated && <p>Not all historical suggestions are shown.</p>}
  </section>;
}
