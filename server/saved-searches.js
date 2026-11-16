import { json, fail, readJson, now, sha256 } from "./http.js";
import { logEvent } from "./events.js";
import { verifyTurnstile } from "./turnstile.js";
import { OPTIONS, BUDGET } from "./applicants.js";
import { evaluate } from "./matching.js";
import { CANDIDATES_SQL } from "./match-store.js";
import { notConfirmedUnavailable } from "./property-facts.js";
import { emailAddress, emailDay, SITE } from "./email.js";
import { ALLOWED, MARKETING_TEMPLATE, purposeReady, setCommunicationPreference } from "./communication-preferences.js";

// REG-15: «Save this search» for website visitors (docs/roadmap/work/REG-15/plan.md). A visitor leaves an email and
// criteria; a confirmed search becomes a contact with the PRE-10 permission property_alerts by email, and the clock
// queues one daily email of new or changed homes, through the existing pipeline (server/email.js), which sends nothing
// until AUT-17. Off (or PRE-10 off), nothing here is mounted, run or read, and the table of migration 0107 is untouched.
export const savedSearchesReady = env => env?.REG15_ALERTS_READY === "1" && purposeReady(env);
export const CONFIRM_TEMPLATE = "saved_search_confirm";
export const ALERT_TEMPLATE = `${MARKETING_TEMPLATE}property_alerts`;
export const PENDING_DAYS = 7, DAILY_NEW = 40, PER_ADDRESS = 3, HOMES_PER_EMAIL = 10, SEARCHES_PER_TICK = 50;
const KEYS = ["email", "operation", "budget_max", "bedrooms_min", "parishes", "property_types", "consent",
  "privacy_version", "turnstile"];
const values = list => list.map(([v]) => v);
const PARISHES = values(OPTIONS.parishes), TYPES = values(OPTIONS.property_types);
const label = (list, v) => list.find(([k]) => k === v)?.[1] ?? v;
const token = () => [...crypto.getRandomValues(new Uint8Array(32))].map(b => b.toString(16).padStart(2, "0")).join("");
const ago = (ts, days) => new Date(Date.parse(ts) - days * 864e5).toISOString();

// What the visitor sent, or the fields to fix. Criteria are stored as validated here and nothing else.
export function validateSavedSearch(b) {
  if (!b || typeof b !== "object" || Array.isArray(b) || Object.keys(b).some(k => !KEYS.includes(k)))
    return { errors: { form: "Invalid request" } };
  const errors = {}, email = emailAddress(b.email);
  if (!email) errors.email = "Enter a valid email address";
  if (!["rent", "buy"].includes(b.operation)) errors.operation = "Choose To Let or To Buy";
  const [lo, hi] = BUDGET[b.operation] ?? BUDGET.buy;
  if (b.budget_max != null && !(Number.isInteger(b.budget_max) && b.budget_max >= lo && b.budget_max <= hi))
    errors.budget_max = `Enter a maximum from £${lo.toLocaleString("en-GB")} to £${hi.toLocaleString("en-GB")}`;
  if (b.bedrooms_min != null && !(Number.isInteger(b.bedrooms_min) && b.bedrooms_min >= 0 && b.bedrooms_min <= 10))
    errors.bedrooms_min = "Choose the minimum bedrooms";
  const list = (v, allowed) => v == null ? [] : Array.isArray(v) && v.length <= allowed.length && v.every(x => allowed.includes(x))
    ? [...new Set(v)] : null;
  const parishes = list(b.parishes, PARISHES), property_types = list(b.property_types, TYPES);
  if (!parishes) errors.parishes = "Choose parishes from the list";
  if (!property_types) errors.property_types = "Choose property types from the list";
  if (b.consent !== true) errors.consent = "Tick the box to receive property alerts by email";
  if (!(typeof b.privacy_version === "string" && b.privacy_version.length >= 1 && b.privacy_version.length <= 40))
    errors.privacy_version = "Privacy notice unavailable";
  if (Object.keys(errors).length) return { errors };
  return { value: { email, notice_version: b.privacy_version, turnstile: b.turnstile, criteria: { operation: b.operation,
    budget_max: b.budget_max ?? null, bedrooms_min: b.bedrooms_min ?? null, parishes, property_types } } };
}

// The saved criteria as the residential applicant evaluate() reads (JSON lists as text, as stored), with no priorities.
export const asApplicant = c => ({ search_category: "residential", operation: c.operation, budget_max: c.budget_max,
  bedrooms_min: c.bedrooms_min, parishes_wanted: JSON.stringify(c.parishes), area_answer: c.parishes.length ? "selected" : "any",
  property_types: JSON.stringify(c.property_types) });

// The same engine as applicants: the hard filters pass and no stated criterion fails. Unknown never excludes a home.
export function alertFits(criteria, listing) {
  const r = evaluate(asApplicant(criteria), listing);
  return r.pass && !r.checks.some(c => c.result === "fails") ? r : null;
}

export function describe(c) {
  const parts = [label(OPTIONS.operation, c.operation)];
  if (c.property_types.length) parts.push(c.property_types.map(t => label(OPTIONS.property_types, t)).join(", "));
  if (c.bedrooms_min) parts.push(`${c.bedrooms_min}+ bedrooms`);
  if (c.budget_max) parts.push(`up to £${c.budget_max.toLocaleString("en-GB")}${c.operation === "rent" ? " a month" : ""}`);
  parts.push(c.parishes.length ? c.parishes.join(", ") : "anywhere in Jersey");
  return parts.join(" · ");
}

// PUB-10's pattern: the form is open only while app_settings.saved_searches is enabled, with the privacy notice version
// shown to the visitor and the person who approved the two fixed email templates. null: closed.
export async function savedSearchPolicy(env) {
  if (!savedSearchesReady(env)) return null;
  const r = await env.DB.prepare(`SELECT json_extract(value,'$.privacy_version') AS version, json_extract(value,'$.approved_by') AS by,
    json_extract(value,'$.approved_at') AS at FROM app_settings WHERE key='saved_searches' AND json_extract(value,'$.enabled')=1`).first();
  return r && typeof r.version === "string" && r.version.length >= 1 && r.version.length <= 40 && typeof r.by === "string" && r.by
    && typeof r.at === "string" && r.at ? { version: r.version, approved_by: r.by, approved_at: r.at } : null;
}
const OPEN = `EXISTS (SELECT 1 FROM app_settings WHERE key='saved_searches' AND json_extract(value,'$.enabled')=1
  AND json_extract(value,'$.privacy_version')=?)`;

const FOOTER = ["", "Hampton Estates", "42 Bath Street, St Helier, Jersey JE2 4ST", `Privacy notice: ${SITE}/#/privacy`];
const confirmText = (criteria, raw) => ["You asked Hampton Estates to email you new homes that match this search:", "",
  describe(criteria), "", `To start the alerts, open this link within ${PENDING_DAYS} days and press Confirm:`,
  `${SITE}/api/saved-searches/confirm?token=${raw}`, "",
  `If you did not ask for this, ignore this email: nothing more is sent and the request is deleted after ${PENDING_DAYS} days.`,
  ...FOOTER].join("\n");

const NO_STORE = { "cache-control": "no-store" };
// One answer whether the search was saved, capped or suppressed, so nothing tells whether an address is on file.
async function create({ request, env }) {
  const policy = await savedSearchPolicy(env) ?? fail(503, "Property alerts are not available");
  const r = validateSavedSearch(await readJson(request, 4096));
  if (r.errors) return json({ error: "Please check the highlighted fields.", fields: r.errors }, 400, NO_STORE);
  const v = r.value;
  if (v.notice_version !== policy.version) fail(409, "Privacy notice changed. Please reload and review it.");
  if (!(await verifyTurnstile(v.turnstile, env.TURNSTILE_SECRET, request.headers.get("cf-connecting-ip"), new URL(request.url).hostname)))
    fail(400, "The anti-spam check expired or failed. Please try again.");
  const ts = now(), raw = token(), hash = await sha256(v.email), criteria = JSON.stringify(v.criteria);
  const confirm = await sha256(raw), ref = crypto.randomUUID().replaceAll("-", "");
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO saved_searches (status,email,email_hash,criteria,notice_version,confirm_hash,unsubscribe_token,created_at)
      SELECT 'pending',?,?,?,?,?,?,? WHERE ${OPEN}
        AND (SELECT COUNT(*) FROM saved_searches WHERE created_at >= ?) < ${DAILY_NEW}
        AND (SELECT COUNT(*) FROM saved_searches WHERE email_hash = ?) < ${PER_ADDRESS}`)
      .bind(v.email, hash, criteria, v.notice_version, confirm, token(), ts, v.notice_version, ago(ts, 1), hash),
    // The one row a public route queues (server/email.js): approved in advance by whoever opened the form.
    env.DB.prepare(`INSERT INTO outbound (ref,dedupe_key,template,entity_id,version,recipient,recipient_hash,subject,text,status,
        approved_by,approved_at,created_at,updated_at)
      SELECT ?,?,'${CONFIRM_TEMPLATE}',CAST(last_insert_rowid() AS TEXT),1,?,?,'Confirm your Hampton Estates property alert',?,
        'queued',json_extract(value,'$.approved_by'),json_extract(value,'$.approved_at'),?,? FROM app_settings
      WHERE key='saved_searches' AND changes() = 1 AND NOT EXISTS (SELECT 1 FROM email_suppressions WHERE address_hash = ?)`)
      .bind(ref, confirm, v.email, hash, confirmText(v.criteria, raw), ts, ts, hash),
  ]);
  return json({ ok: true }, 202, NO_STORE);
}

// A link from an email opens this page; only its button (a POST) changes anything, as mail scanners open links.
const page = (title, text, action) => new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · Hampton Estates</title>
<style>body{font:16px/1.6 Arial,sans-serif;color:#141414;max-width:36rem;margin:3rem auto;padding:0 16px}
button{font:inherit;padding:.6rem 1.2rem;cursor:pointer}</style></head><body><h1>${title}</h1><p>${text}</p>${action
  ? `<form method="post"><button type="submit">${action}</button></form>` : ""}<p><a href="/">Hampton Estates</a></p></body></html>`,
{ status: 200, headers: { "content-type": "text/html; charset=utf-8", ...NO_STORE, "referrer-policy": "no-referrer",
  "x-robots-tag": "noindex", "x-frame-options": "DENY",
  "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'" } });
const linkToken = request => {
  const t = new URL(request.url).searchParams.get("token");
  return typeof t === "string" && /^[0-9a-f]{64}$/.test(t) ? t : null;
};
const GONE = () => page("Link no longer valid", "This link has expired or was already used. You can save your search again on our website.");

const confirmPage = ({ request }) => linkToken(request)
  ? page("Confirm your property alert", "Press Confirm to receive new homes that match your search by email.", "Confirm") : GONE();

async function confirm({ request, env }) {
  const raw = linkToken(request), ts = now();
  if (!raw || !(await savedSearchPolicy(env))) return GONE();
  const s = await env.DB.prepare(`SELECT id, email, criteria, notice_version FROM saved_searches
    WHERE confirm_hash = ? AND status = 'pending' AND created_at >= ?`).bind(await sha256(raw), ago(ts, PENDING_DAYS)).first();
  if (!s) return GONE();
  // The same contact as the website's registration finds: by email. Only an address the visitor proved is used.
  const find = () => env.DB.prepare("SELECT id, updated_at FROM contacts WHERE email = ? ORDER BY id LIMIT 1").bind(s.email).first();
  let contact = await find();
  if (!contact) {
    await env.DB.prepare(`INSERT INTO contacts (name,email,privacy_ack_at,last_activity_at,created_at,updated_at,updated_by)
      VALUES ('Website alert',?,?,?,?,?,'public')`).bind(s.email, ts, ts, ts, ts).run();
    contact = await find();
  }
  await setCommunicationPreference(env, { contact_id: contact.id, purpose: "property_alerts", channel: "email", value: "granted",
    source: "web", notice_version: s.notice_version, evidence_ref: `saved_search:${s.id}`, expected_revision: contact.updated_at }, "public");
  const { operation } = JSON.parse(s.criteria);
  await env.DB.batch([
    env.DB.prepare(`UPDATE saved_searches SET status='active', contact_id=?, email=NULL, confirm_hash=NULL, confirmed_at=?,
      alerted_through=? WHERE id=? AND status='pending'`).bind(contact.id, ts, ts, s.id),
    ...logEvent(env, { actor: "public", entity_type: "contact", entity_id: String(contact.id), type: "saved_search.confirmed",
      data: { saved_search_id: s.id, operation } },
    { category: "new_applicant", title: `Property alerts confirmed · ${label(OPTIONS.operation, operation)}`, action_required: false },
    { ifInserted: true }),
  ]);
  return page("Property alerts confirmed", "Thank you. We will email you when a new home matches your search.");
}

const unsubscribePage = ({ request }) => linkToken(request)
  ? page("Stop property alerts", "Press Stop to receive no more property alerts from Hampton Estates.", "Stop alerts") : GONE();

// The objection (PRE-10) also cancels queued alerts; the contact's saved searches are deleted.
async function unsubscribe({ request, env }) {
  const raw = linkToken(request);
  let s;
  try { s = raw && await env.DB.prepare("SELECT id, contact_id FROM saved_searches WHERE unsubscribe_token = ?").bind(raw).first(); }
  catch (e) { if (!/no such table/.test(e?.message ?? "")) throw e; } // 0107 not applied: nothing was ever sent
  if (!s) return page("Property alerts stopped", "You will not receive property alerts from this search.");
  if (s.contact_id != null) {
    const c = await env.DB.prepare("SELECT updated_at FROM contacts WHERE id = ?").bind(s.contact_id).first();
    if (c) await setCommunicationPreference(env, { contact_id: s.contact_id, purpose: "property_alerts", channel: "email",
      value: "objected", source: "web", evidence_ref: `saved_search:${s.id}`, expected_revision: c.updated_at }, "public");
  }
  await env.DB.prepare(`DELETE FROM saved_searches WHERE id = ? OR (contact_id IS NOT NULL AND contact_id = ?)`)
    .bind(s.id, s.contact_id).run();
  return page("Property alerts stopped", "You will not receive property alerts from Hampton Estates any more.");
}

const availability = async ({ env }) => {
  const p = await savedSearchPolicy(env);
  return json({ available: !!p, ...(p ? { privacy_version: p.version, options: { parishes: PARISHES,
    property_types: OPTIONS.property_types, operation: OPTIONS.operation } } : {}) }, 200, NO_STORE);
};

const alertText = (criteria, homes, unsubscribeToken) => ["New homes for your saved search:", describe(criteria), "",
  ...homes.flatMap(({ row, pub, fit }) => [pub.title, [fit.checks.find(c => c.key === "budget")?.evidence,
    row.bedrooms != null && `${row.bedrooms} bedroom${row.bedrooms === 1 ? "" : "s"}`, row.parish].filter(Boolean).join(" · "),
  `${SITE}/p/${row.id}`, ""]),
  "You receive this because you asked Hampton Estates for property alerts by email.",
  `Stop these alerts: ${SITE}/api/saved-searches/unsubscribe?token=${unsubscribeToken}`, ...FOOTER].join("\n");

// The clock: pending searches go after PENDING_DAYS; then each active search whose contact still allows property alerts
// by email gets, at most once a Jersey day, one email with the website's homes published or changed since its last one.
// Runs while PRE-10 is on, even with REG-15 switched off afterwards: expired requests go with their unsent
// confirmation; with the form closed no confirmation waits in the queue, and with the switch off no alert does either.
export async function savedSearchCleanup(env, ts = now()) {
  if (!purposeReady(env)) return;
  const open = !!(await savedSearchPolicy(env)), cut = ago(ts, PENDING_DAYS);
  try {
    await env.DB.batch([
      env.DB.prepare(`UPDATE outbound SET status = 'cancelled', updated_at = ?1 WHERE status = 'queued' AND (template = ?2
        AND (?3 = 0 OR entity_id IN (SELECT CAST(id AS TEXT) FROM saved_searches WHERE status = 'pending' AND created_at < ?4))
        OR template = ?5 AND ?6 = 0)`).bind(ts, CONFIRM_TEMPLATE, open ? 1 : 0, cut, ALERT_TEMPLATE, savedSearchesReady(env) ? 1 : 0),
      env.DB.prepare("DELETE FROM saved_searches WHERE status = 'pending' AND created_at < ?").bind(cut),
    ]);
  } catch (e) { if (!/no such table/.test(e?.message ?? "")) throw e; } // 0107 not applied: nothing was ever saved
}

export async function savedSearchPass(env, ts = now()) {
  if (!savedSearchesReady(env)) return;
  const policy = await savedSearchPolicy(env);
  if (!policy) return;
  // Each search at most once in 24 h, never to a suppressed address: neither can hold the 50 a tick for everyone else.
  const { results: searches } = await env.DB.prepare(`SELECT s.id, s.contact_id, s.criteria, s.alerted_through,
      s.unsubscribe_token, s.email_hash, c.email FROM saved_searches s JOIN contacts c ON c.id = s.contact_id
    WHERE s.status = 'active' AND c.email IS NOT NULL AND ${ALLOWED("s.contact_id", "'property_alerts'", "'email'")}
      AND s.alerted_through < ? AND NOT EXISTS (SELECT 1 FROM email_suppressions WHERE address_hash = s.email_hash)
    ORDER BY s.alerted_through, s.id LIMIT ${SEARCHES_PER_TICK}`).bind(ago(ts, 1)).all();
  if (!searches.length) return;
  const { readLive } = await import("./routes/public.js");
  // ts is taken before the listings are read: a home changed while they are read is newer, so the next pass sees it.
  const started = ts;
  const [live, { results: offered }] = await Promise.all([readLive(env),
    env.DB.prepare(`SELECT id FROM listings WHERE ${CANDIDATES_SQL}${notConfirmedUnavailable(env)}`).all()]);
  const ids = new Set(offered.map(r => r.id)), homes = live.filter(x => ids.has(x.row.id));
  const day = emailDay(ts);
  for (const s of searches) {
    const criteria = JSON.parse(s.criteria);
    const fits = homes.filter(x => x.row.updated_at > s.alerted_through).map(x => ({ ...x, fit: alertFits(criteria, x.row) }))
      .filter(x => x.fit).slice(0, HOMES_PER_EMAIL);
    const hash = await sha256(s.email);
    // Only to the address that confirmed: if the team changed the contact's email, no alert until it confirms again.
    const send = fits.length > 0 && hash === s.email_hash;
    // Advancing every search read keeps the 50 a tick moving through all of them (ORDER BY alerted_through).
    const advance = env.DB.prepare(`UPDATE saved_searches SET alerted_through = ? WHERE id = ?${send ? " AND changes() = 1" : ""}`)
      .bind(started, s.id);
    if (!send) { await advance.run(); continue; }
    const ref = crypto.randomUUID().replaceAll("-", "");
    // One per search and day (dedupe_key); a conflict leaves alerted_through as it is, so tomorrow's email has them.
    await env.DB.batch([env.DB.prepare(`INSERT INTO outbound (ref,dedupe_key,template,entity_id,version,recipient,recipient_hash,
        subject,text,status,approved_by,approved_at,created_at,updated_at)
      SELECT ?,?,'${ALERT_TEMPLATE}',?,1,?,?,?,?,'queued',?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM email_suppressions WHERE address_hash = ?)
      ON CONFLICT (dedupe_key) DO NOTHING`).bind(ref, await sha256(`${ALERT_TEMPLATE}\0${s.id}\0${day}`), String(s.contact_id),
      s.email, hash, `${fits.length} new home${fits.length === 1 ? "" : "s"} for your saved search`,
      alertText(criteria, fits, s.unsubscribe_token), policy.approved_by, policy.approved_at, ts, ts, hash), advance]);
  }
}

// Mounted on its own while PRE-10 is on and REG-15 is off: a link in an alert already sent always works.
export const unsubscribeRoutes = [
  ["GET", /^\/saved-searches\/unsubscribe$/, unsubscribePage],
  ["POST", /^\/saved-searches\/unsubscribe$/, unsubscribe],
];
export default [
  ["GET", /^\/saved-searches\/availability$/, availability],
  ["POST", /^\/saved-searches$/, create],
  ["GET", /^\/saved-searches\/confirm$/, confirmPage],
  ["POST", /^\/saved-searches\/confirm$/, confirm],
  ...unsubscribeRoutes,
];
