// SPR-03 (migration 0084, SPR03_CAPTURE_READY): the shared record of a property captured when a person confirms it
// is available (EST-16, directly or through an enquiry's answer, AGE-06). One capture per such confirmation, shared by
// every client of the property: its own data as it stood, the confirmation's evidence, its adverts (the imported
// research and the market advert linked by BUS-07), and one row per photo and floor plan with its own state. Staff only.
// Its files are the ones the property already has in storage: a photo that was only a link to its source stays blocked
// (downloading from a source needs that source's permission, BUS-06/BUS-19), and which photos may be shown to a client
// is AGE-10's. Nothing here sends a message or touches the website; the data names the property, never a client.
// Off, or before the migration, a confirmation captures nothing and the routes answer as switched off.
import { json, fail, now } from "./http.js";
import { futureTaskStatements } from "./notification-events.js";
import { streamZip } from "./private-zip.js";
import { PRIVATE_DOCS } from "./listing-documents.js";

export const capturesReady = env => env?.SPR03_CAPTURE_READY === "1" && env?.EST16_AVAILABILITY_READY === "1";
const missingTable = e => /no such table/.test(e?.message ?? "");
const ZIP_FILES = 25, ZIP_BYTES = 50 * 1024 * 1024;
// The property's own fields kept in the capture; the ones still empty are shown as data to complete.
const FIELDS = ["title", "use", "property_type", "operation", "availability", "country", "location", "road_name", "bedrooms",
  "bathrooms", "tenure", "sale_price", "rent", "rent_period", "premium", "currency", "price_text", "summary", "description", "tour_url"];
const NEEDED = ["property_type", "location", "road_name", "bedrooms", "bathrooms", "summary", "description"];
const EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "image/avif": "avif" };

// The capture of the latest confirmation recorded for the property, if it says available and has none yet, and a row
// per photo and floor plan the property has now. Once per confirmation: the same click again adds nothing.
// A private document of PUB-11 is never one of them.
const captureStatements = (env, id, admin, ts) => [env.DB.prepare(`INSERT INTO property_captures (listing_id, confirmation_id, operation,
    data, created_at, created_by) SELECT l.id, c.id, l.operation, json_object(
      'property', json_object('id', l.id, ${FIELDS.map(f => `'${f}', l.${f}`).join(", ")}, 'updated_at', l.updated_at),
      'confirmation', json_object('status', c.status, 'confirmed_at', c.confirmed_at, 'source', c.source, 'channel', c.channel,
        'evidence_ref', c.evidence_ref, 'recorded_by', c.recorded_by, 'scope', CASE WHEN c.operation IS NULL THEN 'property' ELSE 'operation' END),
      'adverts', json((SELECT json_group_array(json_object('url', r.url, 'site', r.agent_or_site, 'seen_on', r.accessed_on,
        'price_text', r.price_text, 'status_seen', r.observed_status)) FROM (SELECT * FROM research_sources WHERE property_id = l.id
        ORDER BY accessed_on DESC, source_id LIMIT 10) r)),
      'market_adverts', json((SELECT json_group_array(json_object('url', json_extract(o.raw_json, '$.listing_url'), 'source', o.source_ref,
        'seen_at', o.source_at)) FROM listing_market_links k JOIN market_observations o ON o.id = k.evidence_observation_id
        WHERE k.listing_id = l.id AND k.action = 'link' AND NOT EXISTS (SELECT 1 FROM listing_market_links u WHERE u.undoes = k.id))),
      'captured_at', ?), ?, ?
    FROM availability_confirmations c JOIN listings l ON l.id = c.listing_id
    WHERE c.id = (SELECT MAX(id) FROM availability_confirmations WHERE listing_id = ?) AND c.status = 'available'
      AND NOT EXISTS (SELECT 1 FROM property_captures p WHERE p.confirmation_id = c.id)`).bind(ts, ts, admin, id),
    env.DB.prepare(`INSERT INTO property_capture_assets (capture_id, media_id, role, position, label, blob_key, source_url)
    SELECT p.id, m.id, CASE WHEN m.kind = 'floorplan' THEN 'floorplan' ELSE 'photo' END, m.position, m.label,
      CASE WHEN m.origin <> 'external' AND m.r2_key <> '' THEN m.r2_key END, m.source_url
    FROM property_captures p JOIN media m ON m.listing_id = p.listing_id
    WHERE p.listing_id = ? AND p.created_at = ? AND p.state = 'queued' AND changes() = 1 AND m.kind IN ('photo', 'floorplan', 'aerial')
      AND COALESCE(substr(m.r2_key, 1, ?), '') <> ?
      AND NOT EXISTS (SELECT 1 FROM property_capture_assets a WHERE a.capture_id = p.id)`).bind(id, ts, PRIVATE_DOCS.length, PRIVATE_DOCS)];

// After a confirmation is recorded (server/availability-confirmations.js, listingId and admin), or for one capture
// checked again (captureId): captures the property if its latest confirmation says available, checks the files still
// pending and closes each capture whose files were all checked: complete when every one is stored, partial otherwise
// (none at all is partial too). A change writes one event to the property's history and opens or updates its one
// Inbox task. Running it again changes nothing. Before migration 0084 it does nothing.
export async function settleCaptures(env, { listingId, captureId, admin }) {
  if (!capturesReady(env)) return;
  const where = captureId ? "p.id = ?" : "p.listing_id = ?", arg = captureId ?? listingId, ts = now();
  if (!captureId) {
    try { await env.DB.batch(captureStatements(env, listingId, admin, ts)); }
    catch (e) { if (missingTable(e)) return; throw e; }
  }
  const pending = (await env.DB.prepare(`SELECT a.id, a.blob_key, a.source_url FROM property_capture_assets a
    JOIN property_captures p ON p.id = a.capture_id WHERE ${where} AND a.state = 'pending' ORDER BY a.id LIMIT 50`).bind(arg).all()).results;
  const checked = await Promise.all(pending.map(async a => {
    const head = a.blob_key ? await env.MEDIA.head(a.blob_key) : null;
    return head ? { id: a.id, state: "stored", bytes: head.size, type: head.httpMetadata?.contentType ?? null }
      : { id: a.id, state: a.blob_key || !a.source_url ? "failed" : "blocked", bytes: null, type: null };
  }));
  if (checked.length) await env.DB.batch(checked.map(c => env.DB.prepare(`UPDATE property_capture_assets SET state = ?, bytes = ?,
    content_type = ?, attempts = attempts + 1, checked_at = ? WHERE id = ? AND state = 'pending'`).bind(c.state, c.bytes, c.type, ts, c.id)));
  const captures = (await env.DB.prepare(`SELECT p.id, p.listing_id, p.state, p.files_stored, COUNT(a.id) AS files,
      COUNT(CASE WHEN a.state = 'stored' THEN 1 END) AS stored, COUNT(CASE WHEN a.state = 'pending' THEN 1 END) AS waiting
    FROM property_captures p LEFT JOIN property_capture_assets a ON a.capture_id = p.id WHERE ${where} GROUP BY p.id`).bind(arg).all()).results;
  for (const p of captures.filter(p => !p.waiting)) {
    const state = p.files && p.stored === p.files ? "complete" : "partial";
    if (state === p.state && p.stored === p.files_stored) continue;
    const title = state === "complete" ? `Open property record: capture complete (${p.files} files)`
      : `Open property record: capture partial (${p.files ? `${p.stored} of ${p.files} files` : "no photos"})`;
    await env.DB.batch([
      env.DB.prepare("UPDATE property_captures SET state = ?, files_stored = ?, checked_at = ? WHERE id = ? AND state = ? AND files_stored IS ?")
        .bind(state, p.stored, ts, p.id, p.state, p.files_stored),
      env.DB.prepare(`INSERT INTO events (at, actor, entity_type, entity_id, type, data) SELECT ?, 'system', 'listing', ?, 'listing.captured',
        json_object('version', 1, 'fields', json('[]'), 'capture_id', ?, 'state', ?, 'stored', ?, 'files', ?) WHERE changes() = 1`)
        .bind(ts, p.listing_id, p.id, state, p.stored, p.files),
      ...futureTaskStatements(env, { work: "capture", phase: "pending", episode: `capture-${p.id}`, eventId: null,
        target: { kind: "listing", id: p.listing_id }, title,
        reason: "Review the captured record, correct the property where it is wrong and download its files." }, { ifInserted: true }),
    ]);
  }
}

const PROBLEM = { failed: "The file was not found in storage.", blocked: "Only a link to the source: the file was never stored here, and downloading it needs that source's permission." };
async function manifest(env, p) {
  const assets = (await env.DB.prepare(`SELECT id, role, position, label, state, content_type, bytes, source_url, checked_at, blob_key
    FROM property_capture_assets WHERE capture_id = ? ORDER BY position, id`).bind(p.id).all()).results;
  const data = JSON.parse(p.data);
  return { id: p.id, state: p.state, created_at: p.created_at, created_by: p.created_by, checked_at: p.checked_at, data,
    missing: NEEDED.filter(f => data.property?.[f] == null || data.property[f] === ""),
    counts: { files: assets.length, stored: assets.filter(a => a.state === "stored").length },
    assets: assets.map((a, i) => ({ ...a, n: i + 1, ...(PROBLEM[a.state] && { problem: PROBLEM[a.state] }) })) };
}
async function capture(env, id) {
  if (!capturesReady(env)) fail(404, "Not found");
  let p;
  try { p = await env.DB.prepare("SELECT * FROM property_captures WHERE id = ?").bind(id).first(); }
  catch (e) { if (missingTable(e)) fail(404, "Not found"); throw e; }
  if (!p) fail(404, "Capture not found");
  return manifest(env, p);
}

// The storage key stays on the server.
const shown = m => ({ ...m, assets: m.assets.map(({ blob_key, ...a }) => a) });

// The property's latest capture in full, and the earlier ones by date.
async function list({ env, params: [id] }) {
  if (!capturesReady(env)) return json({ enabled: false });
  let rows;
  try {
    rows = (await env.DB.prepare(`SELECT * FROM property_captures WHERE listing_id = ? ORDER BY id DESC LIMIT 20`).bind(id).all()).results;
  } catch (e) { if (missingTable(e)) return json({ enabled: false }); throw e; }
  return json({ enabled: true, latest: rows[0] ? shown(await manifest(env, rows[0])) : null,
    earlier: rows.slice(1).map(({ id, state, created_at }) => ({ id, state, created_at })) });
}

// Checks again the files that were not found (a file put back since is stored now); a link-only photo stays blocked.
async function check({ env, params: [id] }) {
  const m = await capture(env, id);
  await env.DB.prepare("UPDATE property_capture_assets SET state = 'pending' WHERE capture_id = ? AND state = 'failed'").bind(m.id).run();
  await settleCaptures(env, { captureId: m.id });
  return json({ enabled: true, latest: shown(await capture(env, id)) });
}

const safeName = s => String(s ?? "").replace(/\.[A-Za-z0-9]{2,5}$/, "").replace(/[^A-Za-z0-9 _-]+/g, " ").trim().replace(/\s+/g, "-").slice(0, 60) || "photo";
const attachment = (name, type) => ({ "content-type": type, "content-disposition": `attachment; filename="${name}"`,
  "cache-control": "no-store", "x-content-type-options": "nosniff" });
const fileName = (m, a) => `${m.data.property.id}-capture-${m.id}-${a.n}.${EXT[a.content_type] ?? "bin"}`;

// One stored file, as an attachment. Only from this capture's own row: the public media route never serves it.
async function file({ env, params: [id, assetId] }) {
  const m = await capture(env, id), a = m.assets.find(x => x.id === Number(assetId) && x.state === "stored");
  const obj = a && await env.MEDIA.get(a.blob_key);
  if (!obj) fail(404, "This file is not stored");
  return new Response(obj.body, { headers: attachment(fileName(m, a), a.content_type ?? "application/octet-stream") });
}

// The stored photos (never floor plans) as one ZIP: all of them, or the ones chosen (?ids=1,2). It says it is
// incomplete, in its name and a header, whenever a photo of the capture is not in it; a file that cannot be put in it
// or a ZIP over the limit is refused, never silently left out.
async function photos({ request, env, params: [id] }) {
  const m = await capture(env, id), all = m.assets.filter(a => a.role === "photo");
  const ids = new URL(request.url).searchParams.get("ids");
  const chosen = ids ? [...new Set(ids.split(",").map(Number))] : all.filter(a => a.state === "stored").map(a => a.id);
  const picked = chosen.map(n => all.find(a => a.id === n && a.state === "stored"));
  if (picked.some(a => !a)) fail(400, "Choose stored photos of this capture only");
  if (!picked.length) fail(404, "No photo of this capture is stored");
  if (picked.length > ZIP_FILES || picked.reduce((s, a) => s + (a.bytes ?? 0), 0) > ZIP_BYTES)
    fail(400, `One ZIP holds ${ZIP_FILES} photos and 50 MB at most: choose fewer`);
  const complete = picked.length === all.length && m.state === "complete";
  const body = streamZip(picked.map(a => ({ name: `${String(a.n).padStart(2, "0")}-${safeName(a.label)}.${EXT[a.content_type] ?? "bin"}`,
    open: async () => (await env.MEDIA.get(a.blob_key))?.body })));
  return new Response(body, { headers: { ...attachment(`${m.data.property.id}-capture-${m.id}-photos${complete ? "" : "-incomplete"}.zip`,
    "application/zip"), "x-capture-complete": complete ? "1" : "0" } });
}

// The captured data, as it was captured, with each file's state; complete says whether every file is stored.
const exported = m => ({ capture_id: m.id, captured_at: m.created_at, state: m.state, complete: m.state === "complete",
  missing_data: m.missing, ...m.data, files: m.assets.map(({ n, role, label, state, content_type, bytes, source_url }) =>
    ({ n, role, label, state, content_type, bytes, source_url })) });
async function dataJson({ env, params: [id] }) {
  const m = await capture(env, id);
  return new Response(JSON.stringify(exported(m), null, 2), { headers: attachment(`${m.data.property.id}-capture-${m.id}.json`, "application/json") });
}

// A CSV text cell that a spreadsheet never reads as a formula: every text gets a leading apostrophe and RFC 4180
// quoting. Numbers only when they are already finite numbers; null is empty.
export function csvTextCell(value) {
  if (value == null) return "";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  const text = `'${value}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
// field,value rows: fixed names from the capture's own structure, never a field a source chose.
async function dataCsv({ env, params: [id] }) {
  const m = await capture(env, id), e = exported(m), lines = [["field", "value"]];
  const add = (field, value) => lines.push([field, value]);
  add("capture_id", m.id); add("captured_at", e.captured_at); add("state", e.state); add("complete", e.complete ? "yes" : "no");
  add("missing_data", e.missing_data.join(" "));
  for (const f of ["id", ...FIELDS, "updated_at"]) add(`property.${f}`, e.property?.[f]);
  for (const [k, v] of Object.entries(e.confirmation ?? {})) add(`confirmation.${k}`, v);
  for (const [i, a] of (e.adverts ?? []).entries()) add(`advert.${i + 1}.url`, a.url);
  for (const [i, a] of (e.market_adverts ?? []).entries()) add(`market_advert.${i + 1}.url`, a.url);
  for (const f of e.files) add(`file.${f.n}`, `${f.role} ${f.state}${f.label ? ` ${f.label}` : ""}`);
  // The names are this file's own; "complete" is yes or no; every other value is a text or number cell.
  const csv = lines.map(([f, v], i) => `${f},${i === 0 || f === "complete" ? v : csvTextCell(v)}`).join("\r\n") + "\r\n";
  return new Response(csv, { headers: attachment(`${m.data.property.id}-capture-${m.id}.csv`, "text/csv; charset=utf-8") });
}

const ID = "(HE-[A-Z]\\d{3,})", CAP = "/admin/property-captures/(\\d+)";
export default [
  ["GET", new RegExp(`^/admin/listings/${ID}/captures$`), list, true],
  ["POST", new RegExp(`^${CAP}/check$`), check, true],
  ["GET", new RegExp(`^${CAP}/files/(\\d+)$`), file, true],
  ["GET", new RegExp(`^${CAP}/photos\\.zip$`), photos, true],
  ["GET", new RegExp(`^${CAP}/data\\.json$`), dataJson, true],
  ["GET", new RegExp(`^${CAP}/data\\.csv$`), dataCsv, true],
];
