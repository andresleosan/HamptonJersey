import { json, fail } from "../http.js";
import { normalizePhone } from "../applicants.js";
import { chatContactReady, linkedChats } from "../chat-contact.js";

// SAP-08: the applicant record's Viewings and Messages tabs. Reads only, for a signed-in admin, of the applicant's own
// contact. Nothing here writes, links or copies.

// G4: a viewing has no link to a contact yet. It matches when its email is the contact's (any case), or when its phone,
// without spaces, dashes or brackets, ends in the last 9 digits of the contact's phone. Catches "07797 123 456" for
// +447797123456; a foreign number sharing those 9 digits would match too, and dots are not stripped. An empty email or
// phone matches nothing. The Timeline uses the same cross.
const PHONE = "replace(replace(replace(replace(v.phone, ' ', ''), '-', ''), '(', ''), ')', '')";
export const BY_EMAIL = "(?1 IS NOT NULL AND lower(v.email) = ?1)", BY_PHONE = `(?2 IS NOT NULL AND ${PHONE} LIKE '%' || ?2)`;
export const viewingArgs = contact => {
  const email = contact.email?.trim().toLowerCase() || null, phone = normalizePhone(contact.phone);
  return [email, phone ? phone.slice(1).slice(-9) : null];
};

// What the Viewings tab and the Timeline read of a matched viewing. Never the requester's name, email, phone or notes:
// a viewing matched this way may be someone else's. feedback_by is the team member who recorded the feedback.
export const VIEWING_COLUMNS = `v.id, v.listing_id, COALESCE(l.title, v.listing_title_snapshot) AS listing_title, v.listing_ref,
  v.kind, v.date, v.time, v.end_time, v.status, v.outcome, v.feedback_at, v.feedback_by, v.created_at`;

const contactOf = async (env, id) => (await env.DB.prepare(`SELECT c.id, c.email, c.phone FROM applicants a
  JOIN contacts c ON c.id = a.contact_id WHERE a.id = ?`).bind(Number(id)).first()) ?? fail(404, "Applicant not found");

// What the tab shows of each viewing, and which of the contact's details it shares.
async function viewings({ env, params: [id] }) {
  const contact = await contactOf(env, id);
  const { results } = await env.DB.prepare(`SELECT ${VIEWING_COLUMNS}, ${BY_EMAIL} AS by_email, ${BY_PHONE} AS by_phone
    FROM viewing_requests v LEFT JOIN listings l ON l.id = v.listing_id
    WHERE ${BY_EMAIL} OR ${BY_PHONE} ORDER BY v.date DESC, v.time DESC, v.id DESC LIMIT 50`).bind(...viewingArgs(contact)).all();
  return json({ match: "email_phone", viewings: results.map(({ by_email, by_phone, ...v }) =>
    ({ ...v, matched_by: [by_email && "email", by_phone && "phone"].filter(Boolean) })) });
}

// The website chats a person linked to this contact (MSG-03), without their text. null: chat links are switched off.
async function messages({ env, params: [id] }) {
  const contact = await contactOf(env, id);
  return json({ chats: chatContactReady(env) ? await linkedChats(env, contact.id) : null });
}

export default [
  ["GET", /^\/admin\/applicants\/(\d+)\/viewings$/, viewings, true],
  ["GET", /^\/admin\/applicants\/(\d+)\/messages$/, messages, true],
];
