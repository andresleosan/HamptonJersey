import { json, fail, readJson, now } from "../http.js";
import { validateListing, checkPrice, idPrefix, nextId } from "../listing.js";

const ID = "(HE-[A-Z]\\d{3,})";
const LIST_SQL = `SELECT l.id, l.title, l.use, l.country, l.location, l.availability, l.operation, l.sale_price, l.rent,
  l.rent_period, l.premium, l.currency, l.price_text, l.published, l.archived_at, l.updated_at, l.updated_by,
  COALESCE(l.cover_media_id, (SELECT m.id FROM media m WHERE m.listing_id = l.id AND m.kind = 'photo'
    AND m.r2_key IS NOT NULL ORDER BY m.position LIMIT 1)) AS cover_id
  FROM listings l ORDER BY l.id`;

export async function loadListing(env, id) {
  const l = await env.DB.prepare("SELECT * FROM listings WHERE id = ?").bind(id).first();
  if (!l) fail(404, "Propiedad no encontrada");
  return { ...l, specs: JSON.parse(l.specs || "[]") };
}

const list = async ({ env }) => json({ listings: (await env.DB.prepare(LIST_SQL).all()).results });

async function detail({ env, params: [id] }) {
  const listing = await loadListing(env, id);
  const q = (sql, ...args) => env.DB.prepare(sql).bind(...args);
  const [media, research, sources, facts, terms, issues, searches] = (await env.DB.batch([
    q("SELECT * FROM media WHERE listing_id = ? ORDER BY position, id", id),
    q("SELECT * FROM research_properties WHERE property_id = ?", id),
    q("SELECT * FROM research_sources WHERE property_id = ? ORDER BY source_id", id),
    q("SELECT * FROM research_facts WHERE property_id = ? ORDER BY field, fact_id", id),
    q("SELECT * FROM research_financial_terms WHERE property_id = ? ORDER BY term_id", id),
    q("SELECT * FROM research_issues WHERE property_ids LIKE ? ORDER BY severity, issue_id", `%${id}%`),
    q("SELECT * FROM research_search_log WHERE property_id = ? ORDER BY date, search_id", id),
  ])).map(r => r.results);
  const group = research[0]?.duplicate_group;
  const duplicates = group ? (await q("SELECT property_id FROM research_properties WHERE duplicate_group = ? AND property_id <> ? ORDER BY property_id", group, id).all())
    .results.map(r => r.property_id) : [];
  return json({ listing, media, research: research[0] ?? null, sources, facts, terms, issues, searches, duplicates });
}

const fieldErrors = errors => json({ error: "Revisa los campos marcados", fields: errors }, 400);

async function create({ request, env, admin }) {
  const r = validateListing(await readJson(request));
  if (r.errors) return fieldErrors(r.errors);
  const priceErrors = checkPrice(r.value);
  if (Object.keys(priceErrors).length) return fieldErrors(priceErrors);
  // Never reuse an id that research rows still point at.
  const { results } = await env.DB.prepare("SELECT id FROM listings UNION SELECT property_id FROM research_properties UNION SELECT id FROM deleted_listings").all();
  const id = nextId(results.map(x => x.id), idPrefix(r.value.use, r.value.country));
  const ts = now();
  const row = { ...r.value, id, published: 0, created_at: ts, updated_at: ts, updated_by: admin };
  const cols = Object.keys(row); // whitelisted by validateListing
  await env.DB.prepare(`INSERT INTO listings (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`)
    .bind(...cols.map(c => row[c])).run();
  return json({ id }, 201);
}

async function update({ request, env, admin, params: [id] }) {
  const body = await readJson(request);
  if (typeof body?.updated_at !== "string") fail(400, "Falta updated_at: recarga la ficha");
  const r = validateListing(body, { partial: true });
  if (r.errors) return fieldErrors(r.errors);
  const cols = Object.keys(r.value);
  if (!cols.length) fail(400, "No hay cambios que guardar");
  const priceErrors = checkPrice({ ...(await loadListing(env, id)), ...r.value });
  if (Object.keys(priceErrors).length) return fieldErrors(priceErrors);
  const res = await env.DB.prepare(
    `UPDATE listings SET ${cols.map(c => `${c} = ?`).join(", ")}, updated_at = ?, updated_by = ? WHERE id = ? AND updated_at = ?`)
    .bind(...cols.map(c => r.value[c]), now(), admin, id, body.updated_at).run();
  if (!res.meta.changes) {
    await loadListing(env, id); // 404 if it no longer exists
    fail(409, "Otra persona guardó cambios en esta ficha. Recarga para verlos (tus cambios no se han guardado).");
  }
  return json({ listing: await loadListing(env, id) });
}

async function setState({ env, admin, params: [id, action] }) {
  const l = await loadListing(env, id);
  if (action === "publish" && l.archived_at) fail(400, "Restaura la ficha antes de publicarla");
  if (action === "archive" && l.archived_at) fail(400, "La ficha ya está archivada");
  if (action === "restore" && !l.archived_at) fail(400, "La ficha no está archivada");
  const ts = now();
  const patch = { publish: { published: 1 }, unpublish: { published: 0 }, archive: { published: 0, archived_at: ts },
    restore: { archived_at: null } }[action];
  const cols = Object.keys(patch);
  await env.DB.prepare(`UPDATE listings SET ${cols.map(c => `${c} = ?`).join(", ")}, updated_at = ?, updated_by = ? WHERE id = ?`)
    .bind(...cols.map(c => patch[c]), ts, admin, id).run();
  return json({ listing: await loadListing(env, id) });
}

async function remove({ request, env, admin, params: [id] }) {
  const l = await loadListing(env, id);
  if (!l.archived_at) fail(400, "Solo se pueden borrar fichas archivadas");
  if ((await readJson(request))?.confirm !== id) fail(400, `Escribe ${id} para confirmar el borrado`);
  const { results } = await env.DB.prepare("SELECT r2_key, thumb_key FROM media WHERE listing_id = ? AND origin = 'upload'").bind(id).all();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM media WHERE listing_id = ?").bind(id),
    env.DB.prepare("DELETE FROM listings WHERE id = ?").bind(id),
    env.DB.prepare("INSERT INTO deleted_listings (id, deleted_at, deleted_by) VALUES (?, ?, ?) ON CONFLICT(id) DO NOTHING").bind(id, now(), admin),
  ]);
  // Imported files stay in R2 (they also live in /root/Hampton_Database); research rows are kept.
  const keys = results.flatMap(m => [m.r2_key, m.thumb_key]).filter(Boolean);
  if (keys.length) await env.MEDIA.delete(keys);
  return json({ ok: true });
}

export default [
  ["GET", /^\/admin\/listings$/, list, true],
  ["POST", /^\/admin\/listings$/, create, true],
  ["GET", new RegExp(`^/admin/listings/${ID}$`), detail, true],
  ["PUT", new RegExp(`^/admin/listings/${ID}$`), update, true],
  ["DELETE", new RegExp(`^/admin/listings/${ID}$`), remove, true],
  ["POST", new RegExp(`^/admin/listings/${ID}/(publish|unpublish|archive|restore)$`), setState, true],
];
