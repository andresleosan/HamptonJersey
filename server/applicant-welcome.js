// AUT-25 (AUT25_APPLICANT_WELCOME_READY, in both wrangler.toml): each new applicant who registers on the website gets one
// welcome email, and a check of their data. Luis, 26-nov: "Bienvenida + revisión, el interruptor aprueba, solo los nuevos".
// Only searches registered after the switch was first seen on (app_settings 'applicant_welcome_since'), from the website,
// residential, still New and taken by nobody. The email is one row of the approved queue (outbound, server/email.js) that
// Hermes's carrier sends verbatim from Hampton's Gmail: the switch is the approval, as VIS-13's reminders. Its text is
// fixed: thanks, the applicant's own search as stored, what happens next and the data still missing, to reply with. The
// claim asks again (server/applicant-welcome-check.js) that nothing changed. Gmail accepted it: the search moves from New
// to Searching by 'automation' and its New applicant notice is done, as when a person takes it. Unknown: it waits in
// Settings › Email and is never sent again. Refused or taken back: nothing changes, the team welcomes them as before.
// The check is fixed rules, no AI: an unusual budget or no email address opens one Inbox task naming the issues only,
// never the values (duplicates by email or phone are one contact already, REG-14). ponytail: 20 new searches a tick.
import { now, sha256 } from "./http.js";
import { emailAddress } from "./email.js";
import { activeSql } from "./applicants.js";
import { logEvent, resolveNotices } from "./events.js";
import { taskStatements } from "./notification-tasks.js";
import { welcomeReady, welcomeClaimSql, WELCOME } from "./applicant-welcome-check.js";

const SINCE = "applicant_welcome_since", CHECKED = "applicant.welcome_checked", WATCH = 3 * 86400e3;
const gbp = v => `£${Number(v).toLocaleString("en-GB")}`;
const list = v => { try { const a = JSON.parse(v ?? "[]"); return Array.isArray(a) ? a.filter(x => typeof x === "string") : []; } catch { return []; } };
// Asked in the email (the applicant's own answer) or for the team (a task, by name only).
const ASK = { phone: "a phone number we can call you on", move: "when you would like to move", budget: "your budget",
  housing: "your housing status in Jersey (for example Entitled, Licensed or Entitled for Work)" };
const CHECK = { budget_unusual: "Budget looks unusual",
  no_email: "No email address to welcome them" };

// The review: what to ask the applicant and what the team should look at. Fixed rules, no AI.
export function review(a) {
  const ask = [], check = [];
  if (!a.phone?.trim()) ask.push("phone");
  if (!a.move_in_date) ask.push("move");
  if (a.budget_max == null) ask.push("budget");
  else if (a.operation === "rent" ? a.budget_max < 300 || a.budget_max > 25000 : a.budget_max < 50000) check.push("budget_unusual");
  if (a.operation === "rent" && (!a.housing_status || a.housing_status === "not_sure")) ask.push("housing");
  if (!emailAddress(a.email)) check.push("no_email");
  return { ask, check };
}

// The email: the applicant's own search as stored and what is still missing. Never anyone else's data, never a name.
export function welcomeEmail(a, ask = review(a).ask) {
  const rent = a.operation === "rent", areas = list(a.parishes_wanted);
  const beds = a.bedrooms_min != null && a.bedrooms_max != null && a.bedrooms_max !== a.bedrooms_min ? `${a.bedrooms_min} to ${a.bedrooms_max}`
    : a.bedrooms_min != null ? `${a.bedrooms_min} or more` : a.bedrooms_max != null ? `up to ${a.bedrooms_max}` : null;
  const budget = a.budget_max == null ? null : `${a.budget_min != null ? `${gbp(a.budget_min)} to ` : "up to "}${gbp(a.budget_max)}${rent ? " a month" : ""}`;
  return { subject: "Welcome to Hampton Estates: your property search", text: [
    "Hello,", "", "Thank you for registering with Hampton Estates. This is the search we have for you:", "",
    `- Looking to: ${rent ? "rent" : "buy"}`, `- Areas: ${areas.length ? areas.join(", ") : "anywhere in Jersey"}`,
    ...(beds ? [`- Bedrooms: ${beds}`] : []), ...(budget ? [`- Budget: ${budget}`] : []),
    ...(a.move_in_date ? [`- Move date: ${a.move_in_date}`] : []), "",
    "What happens next: we compare your search with the homes we have and those coming to the market, and we contact you "
      + "when one fits. To change anything, simply reply to this email.",
    ...(ask.length ? ["", "To help us find the right home sooner, please reply with:", ...ask.map(k => `- ${ASK[k]}`)] : []),
    "", "Kind regards,", "Hampton Estates", "42 Bath Street, St Helier, Jersey JE2 4ST"].join("\n") };
}

// The clock (server/jobs.js), before the email pass: each new search is checked once and, with an address, welcomed once.
export async function welcomePass(env, t = Date.now()) {
  if (!welcomeReady(env)) return;
  const ts = new Date(t).toISOString();
  await env.DB.prepare("INSERT INTO app_settings (key, value, updated_at, updated_by) VALUES (?, ?, ?, 'automation') ON CONFLICT (key) DO NOTHING")
    .bind(SINCE, JSON.stringify({ at: ts }), ts).run();
  const since = JSON.parse((await env.DB.prepare("SELECT value FROM app_settings WHERE key = ?").bind(SINCE).first()).value).at;
  const { results } = await env.DB.prepare(`SELECT a.id, a.operation, a.budget_min, a.budget_max, a.bedrooms_min, a.bedrooms_max,
      a.parishes_wanted, a.move_in_date, a.housing_status, a.match_inputs_revision + 1 AS version, lower(trim(c.email)) AS email, c.phone
    FROM applicants a JOIN contacts c ON c.id = a.contact_id
    WHERE ${activeSql("a")} AND a.stage = 'new' AND a.assigned_to IS NULL AND a.source = 'web' AND a.search_category = 'residential'
      AND a.created_at >= ? AND NOT EXISTS (SELECT 1 FROM events e WHERE e.entity_type = 'applicant'
        AND e.entity_id = CAST(a.id AS TEXT) AND e.type = '${CHECKED}') ORDER BY a.id LIMIT 20`).bind(since).all();
  for (const a of results) {
    const { ask, check } = review(a), to = emailAddress(a.email), id = String(a.id);
    const stmts = [env.DB.prepare(`INSERT INTO events (at, actor, entity_type, entity_id, type, data) SELECT ?, 'automation', 'applicant', ?, ?,
        json_object('version', 1, 'ask', json(?), 'check', json(?)) WHERE NOT EXISTS (SELECT 1 FROM events WHERE entity_type = 'applicant'
          AND entity_id = ? AND type = ?)`).bind(ts, id, CHECKED, JSON.stringify(ask), JSON.stringify(check), id, CHECKED),
      ...(check.length ? taskStatements(env, { taskKey: `applicant-review:${id}`, eventId: null, category: "task",
        title: "Check the new applicant's data", target: { kind: "applicant", id }, preserveDone: true,
        reason: `${check.map(k => CHECK[k]).join(". ")}.` }, { ifInserted: true }) : [])];
    if (to) {
      const { subject, text } = welcomeEmail(a, ask), hash = await sha256(to);
      stmts.push(env.DB.prepare(`INSERT INTO outbound (ref, dedupe_key, template, entity_id, version, recipient, recipient_hash, subject, text,
          status, approved_by, approved_at, created_at, updated_at)
        SELECT ?, ?, '${WELCOME}', ?, ?, ?, ?, ?, ?, 'queued', 'automation', ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM email_suppressions
          WHERE address_hash = ?) ON CONFLICT (dedupe_key) DO NOTHING`).bind(crypto.randomUUID().replaceAll("-", ""),
        await sha256(`${WELCOME}\0${id}`), id, a.version, to, hash, subject, text, ts, ts, ts, hash));
    }
    await env.DB.batch(stmts);
  }
}

// The clock, after the email pass, also switched off: a queued welcome that may no longer go is taken back; one Gmail
// accepted moves its search from New to Searching (if still New) and resolves its New applicant notice. Idempotent.
export async function welcomeSettlePass(env, t = Date.now()) {
  const ts = new Date(t).toISOString(), check = welcomeClaimSql(env, t);
  await env.DB.prepare(`UPDATE outbound SET status = 'cancelled', updated_at = ? WHERE status = 'queued' AND template = '${WELCOME}'
    AND NOT ${check}`).bind(ts).run();
  const { results } = await env.DB.prepare(`SELECT entity_id FROM outbound WHERE template = '${WELCOME}' AND status = 'accepted'
    AND claimed_at >= ? AND EXISTS (SELECT 1 FROM applicants a WHERE a.id = CAST(outbound.entity_id AS INTEGER) AND a.stage = 'new')
    ORDER BY id LIMIT 50`).bind(new Date(t - WATCH).toISOString()).all();
  for (const { entity_id: id } of results) await env.DB.batch([
    env.DB.prepare("UPDATE applicants SET stage = 'searching', updated_at = ?, updated_by = 'automation' WHERE id = ? AND stage = 'new'")
      .bind(now(), Number(id)),
    ...logEvent(env, { actor: "automation", entity_type: "applicant", entity_id: id, type: "applicant.stage_changed",
      data: { before: { stage: "new" }, after: { stage: "searching" }, reason: "welcome_sent" } }, null, { ifInserted: true }),
    resolveNotices(env, { entity_type: "applicant", entity_id: id, category: "new_applicant" }, "automation")]);
}
