import { json, fail, readJson, now } from "../http.js";
import { loadListing } from "./listings.js";

const KINDS = ["photo", "floorplan", "aerial", "document"];
const MAX_BYTES = 10 * 1024 * 1024;
const ordered = env => id => env.DB.prepare("SELECT * FROM media WHERE listing_id = ? ORDER BY position, id").bind(id).all();

// Content sniffing: the file must really be JPEG, PNG or WebP, whatever its name says.
export function sniff(buf) {
  const b = new Uint8Array(buf.slice(0, 12));
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return ["image/jpeg", "jpg"];
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return ["image/png", "png"];
  if (String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP") return ["image/webp", "webp"];
  return null;
}

async function save({ request, env, params: [id] }) {
  await loadListing(env, id);
  const { items, cover_media_id = null } = (await readJson(request)) ?? {};
  if (!Array.isArray(items)) fail(400, "Formato no válido");
  const { results } = await env.DB.prepare("SELECT id, origin, kind FROM media WHERE listing_id = ?").bind(id).all();
  const mine = new Map(results.map(m => [m.id, m]));
  const stmts = items.map(it => {
    const m = mine.get(it?.id);
    if (!m) fail(400, "Una de las fotos no pertenece a esta ficha");
    if (!KINDS.includes(it.kind)) fail(400, "Tipo de archivo no válido");
    if (!Number.isInteger(it.position) || it.position < 0) fail(400, "Orden no válido");
    if (typeof it.public !== "boolean") fail(400, "Visibilidad no válida");
    if (m.origin === "external" && it.public) fail(400, "Las fotos externas son solo de referencia y no pueden publicarse");
    const label = typeof it.label === "string" && it.label.trim() ? it.label.trim().slice(0, 200) : null;
    return env.DB.prepare("UPDATE media SET position = ?, public = ?, kind = ?, label = ? WHERE id = ?")
      .bind(it.position, it.public ? 1 : 0, it.kind, label, it.id);
  });
  if (cover_media_id !== null) {
    const c = mine.get(cover_media_id);
    if (!c || c.origin === "external") fail(400, "La portada debe ser una foto propia de esta ficha");
  }
  stmts.push(env.DB.prepare("UPDATE listings SET cover_media_id = ? WHERE id = ?").bind(cover_media_id, id));
  await env.DB.batch(stmts);
  return json({ media: (await ordered(env)(id)).results });
}

async function upload({ request, env, admin, params: [id] }) {
  await loadListing(env, id);
  let form;
  try { form = await request.formData(); } catch { fail(400, "Formulario no válido"); }
  const file = form.get("file"), thumb = form.get("thumb");
  if (!(file instanceof File) || !(thumb instanceof File)) fail(400, "Falta la foto");
  if (file.size > MAX_BYTES || thumb.size > MAX_BYTES) fail(413, "La foto supera 10 MB");
  const [buf, tbuf] = await Promise.all([file.arrayBuffer(), thumb.arrayBuffer()]);
  const type = sniff(buf), ttype = sniff(tbuf);
  if (!type || !ttype) fail(400, "Solo se aceptan fotos JPG, PNG o WebP");
  const kind = ["photo", "floorplan", "aerial"].includes(form.get("kind")) ? form.get("kind") : "photo";
  const mid = "U" + crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  const key = `uploads/${mid}.${type[1]}`, tkey = `thumbs/uploads/${mid}.${ttype[1]}`;
  await env.MEDIA.put(key, buf, { httpMetadata: { contentType: type[0] } });
  await env.MEDIA.put(tkey, tbuf, { httpMetadata: { contentType: ttype[0] } });
  const pos = (await env.DB.prepare("SELECT COALESCE(MAX(position), -1) + 1 AS p FROM media WHERE listing_id = ?").bind(id).first()).p;
  const int = v => (Number.isInteger(Number(v)) && Number(v) > 0 ? Number(v) : null);
  const label = String(form.get("label") || "").trim().slice(0, 200) || null;
  await env.DB.prepare(`INSERT INTO media (id, listing_id, r2_key, thumb_key, origin, kind, label, public, position,
      content_type, width, height, bytes, rights_status, created_at, created_by)
    VALUES (?, ?, ?, ?, 'upload', ?, ?, 1, ?, ?, ?, ?, ?, 'uploaded_by_team', ?, ?)`)
    .bind(mid, id, key, tkey, kind, label, pos, type[0], int(form.get("width")), int(form.get("height")), file.size, now(), admin).run();
  return json({ media: await env.DB.prepare("SELECT * FROM media WHERE id = ?").bind(mid).first() }, 201);
}

async function remove({ env, params: [mid] }) {
  const m = await env.DB.prepare("SELECT * FROM media WHERE id = ?").bind(mid).first();
  if (!m) fail(404, "Foto no encontrada");
  if (m.origin !== "upload") fail(400, "Solo se pueden borrar las fotos subidas desde el panel");
  await env.DB.batch([
    env.DB.prepare("UPDATE listings SET cover_media_id = NULL WHERE cover_media_id = ?").bind(mid),
    env.DB.prepare("DELETE FROM media WHERE id = ?").bind(mid),
  ]);
  await env.MEDIA.delete([m.r2_key, m.thumb_key].filter(Boolean));
  return json({ ok: true });
}

export default [
  ["PUT", /^\/admin\/listings\/(HE-[A-Z]\d{3,})\/media$/, save, true],
  ["POST", /^\/admin\/listings\/(HE-[A-Z]\d{3,})\/media$/, upload, true],
  ["DELETE", /^\/admin\/media\/([A-Za-z0-9]+)$/, remove, true],
];
