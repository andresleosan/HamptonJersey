// Suggestions are held only in this page while the uploaded photos are being reviewed.
export default function PhotoQualitySuggestions({ items }) {
  if (!items.length) return null;
  return <div className="warn" role="status">
    <p><b>Photo quality suggestions</b></p>
    <p>These photos were uploaded. Review or replace them if needed; no automatic enhancement was applied.</p>
    <ul>{items.map(item => <li key={item.id}><b>{item.name}:</b> {item.text}</li>)}</ul>
  </div>;
}
