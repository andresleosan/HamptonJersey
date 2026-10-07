import { json, fail, readJson, now } from "../http.js";

const STATUSES = ["new", "contacted", "closed"];

async function list({ request, env }) {
  const status = new URL(request.url).searchParams.get("status");
  if (status && !STATUSES.includes(status)) fail(400, "Estado no válido");
  const { results: viewings } = await env.DB.prepare(
    `SELECT v.*, l.title AS listing_title FROM viewing_requests v LEFT JOIN listings l ON l.id = v.listing_id
     ${status ? "WHERE v.status = ?" : ""} ORDER BY v.created_at DESC LIMIT 500`).bind(...(status ? [status] : [])).all();
  const { results } = await env.DB.prepare("SELECT status, COUNT(*) AS n FROM viewing_requests GROUP BY status").all();
  const counts = Object.fromEntries(STATUSES.map(s => [s, results.find(r => r.status === s)?.n ?? 0]));
  return json({ viewings, counts });
}

async function setStatus({ request, env, admin, params: [id] }) {
  const { status } = (await readJson(request)) ?? {};
  if (!STATUSES.includes(status)) fail(400, "Estado no válido");
  const r = await env.DB.prepare("UPDATE viewing_requests SET status = ?, updated_at = ?, updated_by = ? WHERE id = ?")
    .bind(status, now(), admin, Number(id)).run();
  if (!r.meta.changes) fail(404, "Solicitud no encontrada");
  return json({ ok: true });
}

async function remove({ env, params: [id] }) {
  const r = await env.DB.prepare("DELETE FROM viewing_requests WHERE id = ?").bind(Number(id)).run();
  if (!r.meta.changes) fail(404, "Solicitud no encontrada");
  return json({ ok: true });
}

export default [
  ["GET", /^\/admin\/viewings$/, list, true],
  ["PUT", /^\/admin\/viewings\/(\d+)$/, setStatus, true],
  ["DELETE", /^\/admin\/viewings\/(\d+)$/, remove, true],
];
