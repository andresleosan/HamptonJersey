export default function ListingReview({listing,disabled,onTransition}) {
  if(listing.published||listing.archived_at)return null;
  const ready=!!listing.review_requested_at;
  return <section className="card" aria-labelledby="h-review">
    <h2 id="h-review">{ready?'Ready for review':'Review before publishing'}</h2>
    <p className="muted">{ready?'This listing is waiting for the team to review it. It is hidden from the website.':'Ask the team to review this draft. It stays hidden until published.'}</p>
    <button type="button" className="btn ghost" disabled={disabled} onClick={()=>onTransition(ready?'return_draft':'submit_review')}>
      {ready?'Return to draft':'Submit for review'}</button>
  </section>;
}
