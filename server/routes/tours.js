import { json, fail, readJson, now } from "../http.js";

// Only links we can embed on the home page. Share links from YouTube and Vimeo are turned into their player address.
export function embedTour(u) {
  let x; try { x = new URL(String(u).trim()); } catch { return null; }
  if (x.protocol !== "https:") return null;
  const h = x.hostname.replace(/^www\./, ""), id = s => (/^[\w-]{6,20}$/.test(s ?? "") ? s : null);
  if (h === "my.matterport.com") return id(x.searchParams.get("m")) ? x.href : null;
  if (h === "youtube-nocookie.com" || h === "player.vimeo.com") return x.href;
  if (h === "youtube.com" || h === "m.youtube.com") { const v = id(x.searchParams.get("v")); return v && `https://www.youtube-nocookie.com/embed/${v}`; }
  if (h === "youtu.be") { const v = id(x.pathname.slice(1)); return v && `https://www.youtube-nocookie.com/embed/${v}`; }
  if (h === "vimeo.com") { const v = /^\/(\d+)$/.exec(x.pathname)?.[1]; return v ? `https://player.vimeo.com/video/${v}` : null; }
  return null;
}

function validate(b, partial) {
  if (!b || typeof b !== "object" || Array.isArray(b)) fail(400, "Send the tour as an object");
  const v = {}, has = k => !partial || k in b;
  if (has("title")) { v.title = String(b.title ?? "").trim(); if (!v.title || v.title.length > 120) fail(400, "Title: 1 to 120 characters"); }
  if (has("url")) { v.url = embedTour(b.url); if (!v.url) fail(400, "Link: paste a Matterport, YouTube or Vimeo link"); }
  if ("caption" in b) { v.caption = String(b.caption ?? "").trim().slice(0, 300) || null; }
  if ("published" in b) { if (typeof b.published !== "boolean") fail(400, "published must be true or false"); v.published = b.published ? 1 : 0; }
  if (!Object.keys(v).length) fail(400, "Nothing to save");
  return v;
}

const ALL = "SELECT id, title, url, caption, published, position, updated_at FROM tours ORDER BY position, id";
const list = async ({ env }) => json({ tours: (await env.DB.prepare(ALL).all()).results });
const listPublic = async ({ env }) => json((await env.DB.prepare(
  "SELECT title, url, caption FROM tours WHERE published = 1 ORDER BY position, id").all()).results, 200, { "cache-control": "public, max-age=60" });

async function create({ request, env }) {
  const v = validate(await readJson(request));
  const ts = now();
  const r = await env.DB.prepare(`INSERT INTO tours (title, url, caption, position, created_at, updated_at)
    VALUES (?, ?, ?, (SELECT COALESCE(MAX(position), 0) + 1 FROM tours), ?, ?)`).bind(v.title, v.url, v.caption ?? null, ts, ts).run();
  return json({ id: r.meta.last_row_id }, 201);
}

async function update({ request, env, params: [id] }) {
  const v = validate(await readJson(request), true), cols = Object.keys(v);
  const r = await env.DB.prepare(`UPDATE tours SET ${cols.map(c => `${c} = ?`).join(", ")}, updated_at = ? WHERE id = ?`)
    .bind(...cols.map(c => v[c]), now(), +id).run();
  if (!r.meta.changes) fail(404, "Tour not found");
  return json({ ok: true });
}

async function remove({ env, params: [id] }) {
  const r = await env.DB.prepare("DELETE FROM tours WHERE id = ?").bind(+id).run();
  if (!r.meta.changes) fail(404, "Tour not found");
  return json({ ok: true });
}

async function reorder({ request, env }) {
  const ids = (await readJson(request))?.ids;
  if (!Array.isArray(ids) || !ids.length || ids.length > 200 || new Set(ids).size !== ids.length || !ids.every(Number.isInteger))
    fail(400, "Send the tour ids in their new order");
  await env.DB.batch(ids.map((id, i) => env.DB.prepare("UPDATE tours SET position = ? WHERE id = ?").bind(i + 1, id)));
  return json({ ok: true });
}

export default [
  ["GET", /^\/tours$/, listPublic],
  ["GET", /^\/admin\/tours$/, list, true],
  ["POST", /^\/admin\/tours$/, create, true],
  ["PUT", /^\/admin\/tours\/order$/, reorder, true],
  ["PUT", /^\/admin\/tours\/(\d{1,9})$/, update, true],
  ["DELETE", /^\/admin\/tours\/(\d{1,9})$/, remove, true],
];
