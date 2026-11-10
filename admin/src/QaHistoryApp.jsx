import ListingHistory from './ListingHistory.jsx';

export default function QaHistoryApp() {
  return <main className="page">
    <h1>History QA</h1>
    <p className="muted">Fictional property only. This view does not open business records.</p>
    <ListingHistory id="HE-Q999" historyEndpoint="/qa/history" />
  </main>;
}
