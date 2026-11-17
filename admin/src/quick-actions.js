// SAP-09: the applicant record's quick actions, Send shortlist and Book viewing. Both only open flows that already
// exist (AGE-12/AGE-11's private presentation, Viewings' New viewing and VIS-17's proposal); neither sends anything.

// Viewings' New viewing for this search, with the house when there is one. Ids only: the contact is read there.
export const bookViewingHref = (applicantId, listingId) =>
  `#/viewings?applicant=${encodeURIComponent(applicantId)}${listingId ? `&listing=${encodeURIComponent(listingId)}` : ""}`;

// What Send shortlist opens on the private presentation card (GET /admin/applicants/<id>/presentations): a link not
// sent yet, to review and send; else the homes it can present now (approved, offered, confirmed available), ticked up
// to its limit. null while the card is off or not read yet.
export function shortlistStart(data) {
  if (!data?.enabled) return null;
  const pending = data.grants.find(g => !g.sent_at && !g.revoked_at);
  if (pending) return { review: pending.id };
  return { picked: data.presentable.slice(0, data.max_homes).map(h => h.match_id) };
}

// How New viewing books for a search. No house, or Hampton's own: book (confirmed at once, as by phone). A house
// another agency advertises (BUS-07's co-listed): propose, which only VIS-17 can do (coordination: undefined while the
// list is read); with it off, blocked. A local slot is never the agency's acceptance, so while who advertises it is
// unknown (checking, or a failed read) nothing books.
export function bookingMode({ listingId, provenance, coordination }) {
  if (!listingId) return "book";
  if (provenance === undefined) return "checking";
  if (provenance === null) return "unknown";
  if (provenance.kind !== "co_listed") return "book";
  return coordination === undefined ? "checking" : coordination ? "propose" : "blocked";
}
