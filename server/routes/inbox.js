import { json, fail, readJson, now } from "../http.js";
import { resolveNotices } from "../events.js";

const STATUSES = ["requested", "confirmed", "completed", "no_show", "cancelled"];

async function list({ request, env }) {
  const status = new URL(request.url).searchParams.get("status");
  if (status && !STATUSES.includes(status)) fail(400, "Invalid status");
  const { results: viewings } = await env.DB.prepare(
    `SELECT v.*, COALESCE(l.title, v.listing_title_snapshot) AS listing_title FROM viewing_requests v LEFT JOIN listings l ON l.id = v.listing_id
     ${status ? "WHERE v.status = ?" : ""} ORDER BY v.created_at DESC LIMIT 500`).bind(...(status ? [status] : [])).all();
  const { results } = await env.DB.prepare("SELECT status, COUNT(*) AS n FROM viewing_requests GROUP BY status").all();
  const counts = Object.fromEntries(STATUSES.map(s => [s, results.find(r => r.status === s)?.n ?? 0]));
  return json({ viewings, counts });
}

async function update({ request, env, admin, params: [id] }) {
  const body = (await readJson(request)) ?? {}, patch = {};
  if (typeof body !== "object" || Array.isArray(body)) fail(400, "Invalid format");
  if ("status" in body) { if (!STATUSES.includes(body.status)) fail(400, "Invalid status"); patch.status = body.status; }
  if ("notes" in body) {
    if (body.notes !== null && typeof body.notes !== "string") fail(400, "Notes must be text");
    const n = (body.notes ?? "").trim();
    if (n.length > 4000) fail(400, "Notes can be at most 4000 characters");
    patch.notes = n || null;
  }
  const cols = Object.keys(patch);
  if (!cols.length) fail(400, "Nothing to update");
  const [r] = await env.DB.batch([
    env.DB.prepare(`UPDATE viewing_requests SET ${cols.map(c => `${c} = ?`).join(", ")}, updated_at = ?, updated_by = ? WHERE id = ?`)
      .bind(...cols.map(c => patch[c]), now(), admin, Number(id)),
    // Leaving 'requested' means someone has picked it up: its Inbox notice is done.
    ...(patch.status && patch.status !== "requested"
      ? [resolveNotices(env, { entity_type: "viewing", entity_id: String(Number(id)), category: "viewing" }, admin)] : []),
  ]);
  if (!r.meta.changes) fail(404, "Request not found");
  return json({ ok: true });
}

// The request's personal data goes with it: its notices lose the name, its events their data (NULL, never '').
async function remove({ env, admin, params: [id] }) {
  const ref = { entity_type: "viewing", entity_id: String(Number(id)) };
  const [r] = await env.DB.batch([
    env.DB.prepare("DELETE FROM viewing_requests WHERE id = ?").bind(Number(id)),
    resolveNotices(env, ref, admin),
    env.DB.prepare(`UPDATE notifications SET title = 'Deleted viewing request'
      WHERE event_id IN (SELECT id FROM events WHERE entity_type = ? AND entity_id = ?)`).bind(ref.entity_type, ref.entity_id),
    env.DB.prepare("UPDATE events SET data = NULL WHERE entity_type = ? AND entity_id = ?").bind(ref.entity_type, ref.entity_id),
  ]);
  if (!r.meta.changes) fail(404, "Request not found");
  return json({ ok: true });
}

export default [
  ["GET", /^\/admin\/viewings$/, list, true],
  ["PUT", /^\/admin\/viewings\/(\d+)$/, update, true],
  ["DELETE", /^\/admin\/viewings\/(\d+)$/, remove, true],
];
