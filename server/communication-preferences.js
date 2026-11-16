import { json, fail, readJson, now } from "./http.js";
import { logEvent } from "./events.js";
import { CONTACT_NEXT_VERSION } from "./contact-version.js";

// PRE-10 (art. 36): marketing permission per contact, purpose and channel, and the check every promotional sender
// runs right before it sends (migration 0096). Switched off, nothing here is mounted or read, and no promotional email
// (template "marketing.<purpose>") is ever dispatched. Nothing here sends a message.
export const purposeReady = env => env?.PRE10_PURPOSE_READY === "1";
export const PURPOSES = ["news", "property_alerts", "valuation_offer"];
export const CHANNELS = ["email", "phone", "sms"];
const SOURCES = ["web", "phone", "email", "in_person", "letter"];
const PAIRS = PURPOSES.flatMap(purpose => CHANNELS.map(channel => [purpose, channel]));
// Promotional email templates are named after their purpose; the pipeline checks consent for every one of them.
export const MARKETING_TEMPLATE = "marketing.";

// One rule, in SQL, for the panel, canSendForPurpose and the email pipeline. News by email: the website's opt-in
// (contacts.marketing_opt_in_at) unless an objection was recorded since. Anything else: only a row 'granted'.
export const ALLOWED = (contact, purpose, channel) => `EXISTS (SELECT 1 FROM contacts mc
  LEFT JOIN marketing_preferences mp ON mp.contact_id = mc.id AND mp.purpose = ${purpose} AND mp.channel = ${channel}
  WHERE mc.id = ${contact} AND CASE WHEN ${purpose} = 'news' AND ${channel} = 'email'
    THEN mc.marketing_opt_in_at IS NOT NULL AND (mp.value IS NOT 'objected' OR mp.updated_at < mc.marketing_opt_in_at)
    ELSE mp.value IS 'granted' END)`;

// Each pair's state for the panel: granted (may be sent), objected, or none (no consent recorded).
export async function readPreferences(env, contactId) {
  const p = "json_extract(p.value,'$[0]')", ch = "json_extract(p.value,'$[1]')";
  const { results } = await env.DB.prepare(`SELECT ${p} AS purpose, ${ch} AS channel,
    (SELECT value FROM marketing_preferences WHERE contact_id = ?1 AND purpose = ${p} AND channel = ${ch}) AS recorded,
    ${ALLOWED("?1", p, ch)} AS allowed FROM json_each(?2) p ORDER BY p.key`).bind(Number(contactId), JSON.stringify(PAIRS)).all();
  return results.map(r => ({ purpose: r.purpose, channel: r.channel,
    state: r.allowed ? "granted" : r.recorded === "objected" ? "objected" : "none" }));
}

// What a promotional sender asks immediately before sending. Off, unknown or missing: never allowed.
export async function canSendForPurpose(env, { contact_id, purpose, channel }) {
  if (!purposeReady(env)) return { allowed: false, reason: "switch_off", revision: 0 };
  if (!PURPOSES.includes(purpose) || !CHANNELS.includes(channel)) return { allowed: false, reason: "unknown_scope", revision: 0 };
  const row = await env.DB.prepare(`SELECT ${ALLOWED("?1", "?2", "?3")} AS allowed,
    EXISTS (SELECT 1 FROM contacts WHERE id = ?1) AS found, mp.value, mp.revision
    FROM (SELECT 1) LEFT JOIN marketing_preferences mp ON mp.contact_id = ?1 AND mp.purpose = ?2 AND mp.channel = ?3`)
    .bind(Number(contact_id), purpose, channel).first();
  const revision = row.revision ?? 0;
  if (!row.found) return { allowed: false, reason: "no_contact", revision };
  if (row.allowed) return { allowed: true, reason: "granted", revision };
  return { allowed: false, reason: row.value === "objected" ? "objected" : "no_consent", revision };
}

// Records one answer for a purpose and a channel ("all" for every one: an objection only). expected_revision is the
// contact's version (updated_at), the same compare-and-set token as every contact edit: a stale one is 409 and nothing
// is written. Granting needs the web form's notice version; the database refuses it otherwise. The same answer again
// writes nothing. An objection also cancels the contact's queued promotional emails for those purposes.
export async function setCommunicationPreference(env, { contact_id, purpose, channel, value, source, evidence_ref = null,
  notice_version = null, expected_revision }, actor) {
  const all = (v, list) => v === "all" ? list : list.includes(v) ? [v] : null;
  const purposes = all(purpose, PURPOSES), channels = all(channel, CHANNELS);
  if (!purposes) fail(400, "Choose a marketing purpose");
  if (!channels) fail(400, "Choose a channel");
  if (!["granted", "objected"].includes(value)) fail(400, "Invalid preference");
  if (!SOURCES.includes(source)) fail(400, "Choose how it was received");
  if (evidence_ref !== null && !(typeof evidence_ref === "string" && /^[A-Za-z0-9:._-]{1,64}$/.test(evidence_ref)))
    fail(400, "Invalid reference");
  if (value === "granted" && (purposes.length > 1 || channels.length > 1 || source !== "web"
    || typeof notice_version !== "string" || !notice_version.length || notice_version.length > 40))
    fail(400, "Consent comes only from the website form, one purpose and channel at a time");
  if (typeof expected_revision !== "string") fail(400, "Reload the contact first");
  const id = Number(contact_id);
  const cur = await env.DB.prepare("SELECT id, marketing_opt_in_at, consent_source, updated_at FROM contacts WHERE id = ?")
    .bind(id).first() ?? fail(404, "Contact not found");
  const stale = () => fail(409, "Someone else changed this contact. Reload it before continuing.");
  if (cur.updated_at !== expected_revision) stale();

  const { results: rows } = await env.DB.prepare("SELECT purpose, channel, value FROM marketing_preferences WHERE contact_id = ?")
    .bind(id).all();
  const pairs = purposes.flatMap(p => channels.map(c => [p, c]));
  // News by email lives on the contact too: an objection clears the opt-in, a new web consent sets it. So an opt-in
  // confirmed after an earlier objection makes a new objection a change again.
  const changed = pairs.filter(([p, c]) => rows.find(r => r.purpose === p && r.channel === c)?.value !== value
    || (p === "news" && c === "email" && (value === "objected") === (cur.marketing_opt_in_at != null)));
  const news = changed.some(([p, c]) => p === "news" && c === "email");
  const ts = now();
  const optIn = !news ? cur.marketing_opt_in_at : value === "objected" ? null : cur.marketing_opt_in_at ?? ts;
  if (!changed.length) return { changed, contact: cur };

  const ref = { actor, entity_type: "contact", entity_id: String(id) };
  const stmts = [
    env.DB.prepare(`UPDATE contacts SET marketing_opt_in_at = ?, consent_source = ?, last_activity_at = ?, updated_by = ?,
      updated_at = CASE WHEN updated_at = ? THEN ${CONTACT_NEXT_VERSION} END WHERE id = ?`)
      .bind(optIn, optIn && cur.consent_source == null ? "web" : cur.consent_source, ts, actor, expected_revision, ts, ts, id),
    ...changed.map(([p, c]) => env.DB.prepare(`INSERT INTO marketing_preferences (contact_id, purpose, channel, value, source,
      notice_version, evidence_ref, revision, updated_by, updated_at) VALUES (?,?,?,?,?,?,?,1,?,?)
      ON CONFLICT (contact_id, purpose, channel) DO UPDATE SET value = excluded.value, source = excluded.source,
        notice_version = excluded.notice_version, evidence_ref = excluded.evidence_ref, revision = revision + 1,
        updated_by = excluded.updated_by, updated_at = excluded.updated_at`)
      .bind(id, p, c, value, source, notice_version, evidence_ref, actor, ts)),
    // The ledger keeps what changed, how it came and by whom; never a note or the person's details.
    ...logEvent(env, { ...ref, type: "contact.marketing_preference", data: { value, source, pairs: changed } }),
    // The same history the website's repeated registration and the panel already read (§3.3): an objection with no
    // opt-in on file still fences an earlier opt-in request, so it cannot be confirmed afterwards.
    ...(news && (optIn !== cur.marketing_opt_in_at || value === "objected") ? logEvent(env, { ...ref, type: "contact.consent_changed", data: {
      before: { marketing_opt_in_at: cur.marketing_opt_in_at }, after: { marketing_opt_in_at: optIn },
      ...(optIn === null && cur.marketing_opt_in_at === null && { objection_to_pending: true }) } }) : []),
    ...(value === "objected" && channels.includes("email") ? [env.DB.prepare(`UPDATE outbound SET status = 'cancelled',
      updated_at = ? WHERE status IN ('draft','queued') AND entity_id = ? AND template IN
      (SELECT ? || value FROM json_each(?))`).bind(ts, String(id), MARKETING_TEMPLATE, JSON.stringify(purposes))] : []),
  ];
  try { await env.DB.batch(stmts); }
  catch (e) {
    const row = await env.DB.prepare("SELECT updated_at FROM contacts WHERE id = ?").bind(id).first();
    if (!row) fail(404, "Contact not found");
    if (row.updated_at !== expected_revision) stale();
    throw e;
  }
  return { changed, contact: await env.DB.prepare("SELECT * FROM contacts WHERE id = ?").bind(id).first() };
}

// The panel records an objection received by phone, email, in person or by letter. It never records a consent.
async function recordObjection({ request, env, admin, params: [id] }) {
  const body = await readJson(request);
  if (!body || typeof body !== "object" || Array.isArray(body)) fail(400, "Invalid format");
  if (body.source === "web") fail(400, "Choose how it was received");
  const { contact } = await setCommunicationPreference(env, { contact_id: id, purpose: body.purpose, channel: body.channel,
    value: "objected", source: body.source, evidence_ref: body.evidence_ref ?? null, expected_revision: body.updated_at }, admin);
  return json({ contact, marketing_preferences: await readPreferences(env, contact.id) });
}

export default [
  ["POST", /^\/admin\/contacts\/(\d+)\/marketing-objection$/, recordObjection, true],
];
