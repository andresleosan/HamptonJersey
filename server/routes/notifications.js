import { json, fail, readJson, now } from "../http.js";
import { normalizePhone, activeSql } from "../applicants.js";
import { salesCount } from "./sales.js";
import { rentalsCount } from "./rent.js";

const BOXES = {
  action: "n.action_required = 1 AND n.resolved_at IS NULL ORDER BY n.created_at, n.id",
  feed: "NOT (n.action_required = 1 AND n.resolved_at IS NULL) ORDER BY n.created_at DESC, n.id DESC LIMIT 200",
};
const CATEGORIES = ["new_applicant", "viewing", "matched"];

// The entity comes from the notice's event. A duplicate points to its contact: its search is the active one
// (not archived, lost or completed) with the submitted operation, else the most recent (§3.3).
const LIST_SQL = `
  SELECT n.id, n.category, n.title, n.created_at, n.action_required, n.resolved_at, e.entity_type, e.entity_id,
    COALESCE(c.phone, ac.phone, v.phone) AS raw_phone,
    CASE WHEN e.entity_type = 'contact' THEN (SELECT s.id FROM applicants s WHERE s.contact_id = c.id
      ORDER BY (${activeSql("s")}
        AND s.operation IS json_extract(e.data, '$.operation')) DESC, s.created_at DESC, s.id DESC LIMIT 1) END AS search_id
  FROM notifications n JOIN events e ON e.id = n.event_id
  -- No CAST: comparing with the INTEGER id gives entity_id numeric affinity, so each join is a primary-key lookup.
  LEFT JOIN applicants a ON e.entity_type = 'applicant' AND a.id = e.entity_id
  LEFT JOIN contacts ac ON ac.id = a.contact_id
  LEFT JOIN contacts c ON e.entity_type = 'contact' AND c.id = e.entity_id
  LEFT JOIN viewing_requests v ON e.entity_type = 'viewing' AND v.id = e.entity_id`;

function link({ category, entity_type, entity_id, search_id }) {
  if (entity_type === "viewing") return "#/viewings";
  if (entity_type === "applicant") return `#/applicants/${entity_id}${category === "matched" ? "/matches" : ""}`;
  return search_id != null ? `#/applicants/${search_id}` : `#/applicants/new?contact=${entity_id}`;
}

// sales (V10) and rentals (R16) are their screens' own counts, not part of action.
async function openCounts(env) {
  const [{ results }, { results: [sales] }, { results: [rentals] }] = await env.DB.batch([env.DB.prepare(
    "SELECT category, COUNT(*) AS n FROM notifications WHERE action_required = 1 AND resolved_at IS NULL GROUP BY category"),
  salesCount(env), rentalsCount(env)]);
  const by = Object.fromEntries(CATEGORIES.map(c => [c, results.find(r => r.category === c)?.n ?? 0]));
  return { action: CATEGORIES.reduce((sum, c) => sum + by[c], 0), ...by, sales: sales.n, rentals: rentals.n };
}

async function list({ request, env }) {
  const q = new URL(request.url).searchParams, box = q.get("box"), category = q.get("category");
  if (!Object.hasOwn(BOXES, box ?? "")) fail(400, "Invalid box");
  if (category && !CATEGORIES.includes(category)) fail(400, "Invalid category");
  const { results } = await env.DB.prepare(`${LIST_SQL} WHERE ${category ? "n.category = ? AND " : ""}${BOXES[box]}`)
    .bind(...(category ? [category] : [])).all();
  const notifications = results.map(({ raw_phone, search_id, ...n }) =>
    ({ ...n, phone: normalizePhone(raw_phone), link: link({ ...n, search_id }) }));
  return json({ notifications, counts: await openCounts(env) });
}

const counts = async ({ env }) => json(await openCounts(env));

async function update({ request, env, admin, params: [id] }) {
  const body = await readJson(request);
  if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length !== 1 || body.resolved !== true)
    fail(400, "Send resolved: true");
  // Already resolved: keep who closed it and when.
  const r = await env.DB.prepare(
    `UPDATE notifications SET resolved_at = COALESCE(resolved_at, ?),
     resolved_by = CASE WHEN resolved_at IS NULL THEN ? ELSE resolved_by END WHERE id = ?`)
    .bind(now(), admin, Number(id)).run();
  if (!r.meta.changes) fail(404, "Notice not found");
  return json({ ok: true });
}

export default [
  ["GET", /^\/admin\/notifications$/, list, true],
  ["GET", /^\/admin\/notifications\/counts$/, counts, true],
  ["PUT", /^\/admin\/notifications\/(\d+)$/, update, true],
];
