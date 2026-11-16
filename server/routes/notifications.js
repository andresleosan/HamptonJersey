import { ownerStorageAvailable } from '../owner-requests.js';
import { json, fail, readJson, now } from "../http.js";
import { notificationSelect, noticeDto, TASK_CATEGORIES, inboxActionsReady, categorySql, snoozedSql, missingSnooze } from "../notification-query.js";
import { getTask, mutateTask } from "../notification-tasks.js";
import { salesCount } from "./sales.js";
import { refreshRentalsCount } from "./rent.js";
import { jerseyToday } from "../viewings.js";
import { retentionPass, expiringSql, RETENTION_REVIEW } from "../retention.js";
import { TO_CONFIRM } from "../listing.js";
import { stoppedFlags } from "./automations.js";
import { readLegal } from "../legal-terms.js";
import { privacyRequestsReady, openPrivacyCount } from "../privacy-requests.js";

// NOT-09 (switched on): a snoozed task waits in the Feed until its time.
const OPEN = on => `n.action_required = 1 AND n.resolved_at IS NULL${on ? ` AND NOT ${snoozedSql()}` : ""}`;
const BOXES = {
  action: on => `${OPEN(on)} ORDER BY n.created_at, n.id LIMIT 200`,
  feed: on => `NOT (${OPEN(on)}) ORDER BY n.created_at DESC, n.id DESC LIMIT 200`,
};
const CATEGORIES = TASK_CATEGORIES;

// The entity comes from the notice's event. A duplicate points to its contact: its search is the active one
// (not archived, lost or completed) with the submitted operation, else the most recent (§3.3).

// sales (V10), rentals (R16, cached: P16), expiring contacts (E8) and listings to confirm (ADM-04) are their screens'
// own counts, not part of action. outbound: {at, by} while sending is paused (AUT-13, H11), else null. stalled: how many
// automations are stopped, the clock or Hermes (AUT-01, A3). chats: the website's chats waiting (MSG-02).
// legal (ADM-17, with its switch): whether the legal periods behind the compliance dates are estimated or validated.
// privacy (PRE-12, with its switch): the privacy requests still open.
// snooze: leave snoozed tasks out (NOT-09). The clock's summary asks for it whatever the switch; without migration 0088
// it is as if no task were snoozed.
export async function openCounts(env, legal, snooze = inboxActionsReady(env)) {
  legal ??= await readLegal(env);
  try { return await counted(env, legal, snooze); }
  catch (e) { if (!snooze || !missingSnooze(e)) throw e; return counted(env, legal, false); }
}
async function counted(env, legal, snooze) {
  const on = inboxActionsReady(env);
  const [{ results }, { results: [sales] }, , , { results: [rentals] }, { results: [expiring] }, { results: [toConfirm] },
    { results: [outbound] }, { results: seen }, { results: [chats] }, { results: [retentionReview] }] = await env.DB.batch([env.DB.prepare(
    `SELECT ${categorySql(on)} AS category, COUNT(*) AS n FROM notifications n WHERE ${OPEN(snooze)} GROUP BY 1`),
  salesCount(env), ...refreshRentalsCount(env, legal.periods),
  env.DB.prepare("SELECT json_extract(value, '$.n') AS n FROM app_settings WHERE key = 'rentals_count'"),
  // ponytail: rows read per poll ≈ 1 + 3 × the contacts in the band (each one's search, sale and open-offer lookups);
  // past ~100 contacts in it, cache the count like rentals_count.
  env.DB.prepare(`SELECT COUNT(*) AS n FROM contacts c WHERE ${expiringSql(env)}`).bind(jerseyToday()),
  // Reads the listings_live index only (migration 0017).
  env.DB.prepare(`SELECT COUNT(*) AS n FROM listings l WHERE ${TO_CONFIRM}`).bind(now()),
  env.DB.prepare(`SELECT json_extract(value, '$.at') AS at, json_extract(value, '$.by') AS by FROM app_settings
    WHERE key = 'outbound' AND json_extract(value, '$.paused') = 1`),
  env.DB.prepare("SELECT key, json_extract(value, '$.at') AS at FROM app_settings WHERE key IN ('clock', 'hermes')"),
  // MSG-02 (C8): the website's chats waiting for the team, on the chats_waiting partial index.
  env.DB.prepare("SELECT COUNT(*) AS n FROM chats WHERE status = 'waiting'"),
  env.DB.prepare(`SELECT COUNT(*) AS n FROM contacts c WHERE ${RETENTION_REVIEW}`).bind(jerseyToday())]);
  const by = Object.fromEntries(CATEGORIES.map(c => [c, results.find(r => r.category === c)?.n ?? 0]));
  const at = Object.fromEntries(seen.map(r => [r.key, r.at])), stopped = stoppedFlags(at.clock, at.hermes, Date.now());
  return { action: CATEGORIES.reduce((sum, c) => sum + by[c], 0), ...by, sales: sales.n, rentals: rentals.n,
    expiring: expiring.n, retention_review: retentionReview.n, to_confirm: toConfirm.n, chats: chats.n,
    outbound: outbound ?? null, stalled: stopped.clock + stopped.hermes, ...(legal.terms ? { legal: legal.terms.status } : {}),
    ...(privacyRequestsReady(env) ? { privacy: await openPrivacyCount(env) } : {}) };
}

// E6: the panel polls the counts every 30 s, and the Inbox its list; each poll claims the day's retention pass in case
// the clock has not (a failed one again, up to 3 attempts). It runs after the answer, the claim too, so the poll waits
// for neither.
async function list({ request, env, waitUntil, admin }) {
  const q = new URL(request.url).searchParams, box = q.get("box"), category = q.get("category");
  if (!Object.hasOwn(BOXES, box ?? "")) fail(400, "Invalid box");
  if (category && !CATEGORIES.includes(category)) fail(400, "Invalid category");
  waitUntil(retentionPass(env, now()));
  const on = inboxActionsReady(env), owner = await ownerStorageAvailable(env);
  const read = snooze => env.DB.prepare(`${notificationSelect(owner, on, snooze)} WHERE ${category ? `${categorySql(on)} = ? AND ` : ""}${box === "feed" ? `
    (n.resolved_at IS NOT NULL OR ${snooze ? `${snoozedSql()} OR ` : ""}${categorySql(on)} IN (SELECT value FROM json_each(COALESCE(
      (SELECT feed_categories FROM notification_preferences WHERE admin=?),'${JSON.stringify(CATEGORIES)}')))) AND ` : ""}${BOXES[box](snooze)}`)
    .bind(admin,...(category ? [category] : []),...(box === "feed" ? [admin] : [])).all();
  // Switched on before migration 0088: as if Snooze were off.
  const { results } = await read(on).catch(e => { if (on && missingSnooze(e)) return read(false); throw e; });
  // ADM-17: a check or deadline the system worked out from legal periods no lawyer has validated says so (estimated).
  const legal = await readLegal(env), estimated = legal.terms?.status === "estimated";
  const notifications = results.map(r => (estimated && r.category === "compliance" && r.source_type === "notification.observed"
    ? { ...noticeDto(r), estimated: true } : noticeDto(r)));
  return json({ notifications, counts: await openCounts(env, legal) });
}

async function counts({ env, waitUntil }) {
  waitUntil(retentionPass(env, now()));
  return json(await openCounts(env));
}

async function update({ request, env, admin, params: [id] }) {
  const body = await readJson(request);
  if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length !== 1 || body.resolved !== true)
    fail(400, "Send resolved: true");
  // Old clients have no observed revision. Only an untouched first revision can be closed safely.
  const task = await getTask(env, Number(id), admin);
  if (task.resolved_at != null) return json({ ok: true });
  if (task.revision !== 1) fail(409, "This task changed. Reload before marking it done.");
  await mutateTask(env, Number(id), admin, { operation_id: crypto.randomUUID(), revision: 1, action: "done" });
  return json({ ok: true });
}

export default [
  ["GET", /^\/admin\/notifications$/, list, true],
  ["GET", /^\/admin\/notifications\/counts$/, counts, true],
  ["PUT", /^\/admin\/notifications\/(\d+)$/, update, true],
];
