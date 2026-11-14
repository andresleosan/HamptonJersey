import { hasEconomicInput } from '../listing-economics.js';
import { listingAmount } from "../listing-pricing.js";
import { json, fail, readJson, now } from "../http.js";
import { folderIdFrom, folderInfo, walkFolder, photosIn, fileResponse, chooseEdited, insideRecords } from "../drive.js";
import { setState, deleteListing, createListing } from "./listings.js";
import { MAX_PHOTOS } from "../listing-import.js";

// PUB-21 (spec 2026-11-05): Properties Queue. The panel sends a Drive folder and a note; Hermes reads its documents
// through its door (the three functions exported at the end) and leaves a proposal; a person creates the draft from it
// in the browser, reviews it in the editor and approves it, which publishes it (D11). Everyone in the panel (D10, C11).
// Master plan (10-Nov-2026): the Drive connection is postponed. Only with PUB21_DRIVE_READY=1 does a folder go to
// Hermes (send, retry and Hermes's three routes); the imports already here can still be reviewed and published.
export const driveImportReady = env => env?.PUB21_DRIVE_READY === "1";
const PAUSED = "Sending folders to Hermes is paused. The imports already in the queue can still be reviewed.";
const OPEN = ["queued", "working", "ready", "review"], IN_OPEN = `(${OPEN.map(s => `'${s}'`).join(",")})`;
// MAX_NOTE is also admin/src/Queue.jsx's counter.
const STALE_MINUTES = 5, ATTEMPTS = 3, KEEP_DAYS = 14, MAX_NOTE = 2000;
const minutesAgo = m => new Date(Date.now() - m * 60e3).toISOString();
const get = (env, id) => env.DB.prepare("SELECT * FROM drive_imports WHERE id = ?").bind(Number(id)).first();

// What the panel sees: never Hermes's file list.
const shape = r => ({ id: r.id, folder_name: r.folder_name, note: r.note, status: r.status, error: r.error,
  requested_by: r.requested_by, created_at: r.created_at, ready_at: r.ready_at, listing_id: r.listing_id,
  result: r.result ? JSON.parse(r.result) : null });

async function send({ request, env, admin }) {
  if (!driveImportReady(env)) fail(503, PAUSED);
  const body = await readJson(request);
  const id = folderIdFrom(body?.link); // a null body has no link: 400
  if (!id) fail(400, "Paste the link of a Google Drive folder.");
  const note = typeof body.note === "string" ? body.note.trim() : "";
  if (body.note != null && typeof body.note !== "string") fail(400, "The note must be text");
  if (note.length > MAX_NOTE) fail(400, `The note can have at most ${MAX_NOTE} characters`);
  const folder = await folderInfo(env, id);
  if (!folder) fail(400, "The app can't open this folder. Check the link, or ask Franco to share the Properties folder with the app.");
  if (await insideRecords(env, folder)) fail(400, "This is a Records folder, which is never read. Paste the property's own folder.");
  // D9: flagged, never refused (a house back on the market, or from sale to rent).
  const [{ results: [listing] }, { results: [open] }] = await env.DB.batch([
    env.DB.prepare("SELECT id FROM listings WHERE drive_folder_id = ? ORDER BY id DESC LIMIT 1").bind(id),
    env.DB.prepare(`SELECT id FROM drive_imports WHERE folder_id = ? AND status IN ${IN_OPEN} ORDER BY id DESC LIMIT 1`).bind(id),
  ]);
  const r = await env.DB.prepare(`INSERT INTO drive_imports (folder_id, folder_name, note, requested_by, created_at)
    VALUES (?, ?, ?, ?, ?) RETURNING *`).bind(id, folder.name, note, admin, now()).first();
  return json({ item: shape(r), duplicate: listing ? { listing_id: listing.id } : open ? { import_id: open.id } : null }, 201);
}

async function list({ env }) {
  const since = minutesAgo(KEEP_DAYS * 24 * 60);
  const [{ results }, { results: [seen] }] = await env.DB.batch([
    env.DB.prepare(`SELECT * FROM drive_imports WHERE status IN ${IN_OPEN}
      OR COALESCE(decided_at, ready_at, claimed_at, created_at) >= ? ORDER BY id DESC LIMIT 200`).bind(since),
    env.DB.prepare("SELECT json_extract(value, '$.at') AS at FROM app_settings WHERE key = 'hermes'"),
  ]);
  return json({ items: results.map(shape), hermes_at: seen?.at ?? null, paused: !driveImportReady(env) });
}

// Review (Review Focus 4, bugs and security review): the server creates the draft and ties it to the row in one call,
// so there is one draft per row, never a listing made elsewhere. A draft the listing rules refuse puts the row back.
async function draft({ request, env, admin, params: [id] }) {
  const body = await readJson(request, 256 * 1024);
  // Queue import does not own structured staff costs. Reject before claiming a
  // row so even malformed numeric tokens cannot alter its state or metadata.
  if (hasEconomicInput(body)) return json({ error: 'Please check the highlighted fields',
    fields: { structured_costs: 'Add staff-only costs in the listing editor' } }, 400);
  const claimed = await env.DB.prepare(`UPDATE drive_imports SET status = 'review', decided_at = ?, decided_by = ?
    WHERE id = ? AND status = 'ready' RETURNING folder_id`).bind(now(), admin, Number(id)).first();
  if (!claimed) {
    const row = await get(env, id);
    if (!row) fail(404, "Not in the queue");
    if (row.status === "review") return json({ error: row.listing_id ? "This draft was already created"
      : "Someone is creating this draft right now", listing_id: row.listing_id }, 409);
    fail(409, "This one isn't ready to review");
  }
  const back = () => env.DB.prepare(`UPDATE drive_imports SET status = 'ready', decided_at = NULL, decided_by = NULL
    WHERE id = ? AND listing_id IS NULL`).bind(Number(id)).run();
  let res;
  try { res = await createListing(env, admin, body, { source: 'queue', related: { import_id: Number(id) } }); }
  catch (e) { await back(); throw e; }
  if (res.status !== 201) { await back(); return res; }
  const { id: lid } = await res.clone().json();
  await env.DB.batch([
    env.DB.prepare("UPDATE drive_imports SET listing_id = ? WHERE id = ?").bind(lid, Number(id)),
    env.DB.prepare("UPDATE listings SET drive_folder_id = ? WHERE id = ?").bind(claimed.folder_id, lid),
  ]);
  return res;
}

// Only the photos the proposal chose, so the panel can't be used to read the rest of the Drive.
async function photo({ env, params: [id, fileId] }) {
  const row = await get(env, id);
  const p = row?.result && JSON.parse(row.result).photos.find(x => x.id === fileId);
  if (!p || !["ready", "review"].includes(row.status)) fail(404, "Photo not found");
  return fileResponse(env, p);
}

async function retry({ env, params: [id] }) {
  if (!driveImportReady(env)) fail(503, PAUSED);
  const r = await env.DB.prepare(`UPDATE drive_imports SET status = 'queued', attempts = 0, error = NULL, claimed_at = NULL
    WHERE id = ? AND status = 'failed' RETURNING *`).bind(Number(id)).first();
  if (!r) fail(409, "Only a failed one can be tried again");
  return json({ item: shape(r) });
}

// C7: the draft goes with it, photos included; never a published listing or one with a sale.
async function discard({ env, admin, params: [id] }) {
  const row = await get(env, id);
  if (!row) fail(404, "Not in the queue");
  if (!OPEN.includes(row.status)) fail(409, "This one is already closed");
  if (row.listing_id) {
    const l = await env.DB.prepare(`SELECT published, EXISTS (SELECT 1 FROM sales WHERE listing_id = ?1) AS sale
      FROM listings WHERE id = ?1`).bind(row.listing_id).first();
    if (l?.published || l?.sale) fail(409, "Its listing is on the website: unpublish it first");
    if (l) {
      await deleteListing(env, row.listing_id, admin, { source: 'queue', related: { import_id: Number(id) } });
      return json({ item: shape(await get(env, id)) });
    }
  }
  const r = await env.DB.prepare(`UPDATE drive_imports SET status = 'discarded', decided_at = ?, decided_by = ?
    WHERE id = ? AND status IN ${IN_OPEN} RETURNING *`).bind(now(), admin, Number(id)).first();
  if (!r) fail(409, "This one is already closed");
  return json({ item: shape(r) });
}

// D11: the minimum for a listing that the website shows whole.
async function approve({ request, env, admin, params: [id] }) {
  const version=(await readJson(request))?.updated_at;
  if(typeof version!=='string')fail(400,'Missing updated_at: reload the listing');
  const row = await get(env, id);
  if (!row) fail(404, "Not in the queue");
  if (row.status !== "review" || !row.listing_id) fail(409, "Create the draft first");
  const l = await env.DB.prepare(`SELECT l.*, (SELECT COUNT(*) FROM media m WHERE m.listing_id = l.id AND m.public = 1
    AND m.kind = 'photo' AND m.origin <> 'external' AND m.r2_key IS NOT NULL AND m.r2_key <> '') AS photos FROM listings l WHERE l.id = ?`).bind(row.listing_id).first();
  if(!l||l.updated_at!==version)fail(409,'The listing changed. Reload and review it before publishing.');
  const has = v => v != null && String(v).trim() !== "";
  const missing = [["Title", has(l.title)], ["Sale or rent", has(l.operation)],
    ["Price", has(listingAmount(l)) || has(l.price_text)], ["Parish", has(l.parish)], ["A photo", l.photos > 0],
    ["Description", has(l.description)]].filter(([, ok]) => !ok).map(([k]) => k);
  if (missing.length) return json({ error: "Complete before publishing", missing }, 400);
  // The listing write and queue transition share the same D1 transaction.
  return setState({ env, admin, params: [row.listing_id, "publish"], fromQueue: true,
    related: { import_id: Number(id) }, expectedAt: version });
}

export default [
  ["GET", /^\/admin\/queue$/, list, true],
  ["POST", /^\/admin\/queue$/, send, true],
  ["POST", /^\/admin\/queue\/(\d+)\/draft$/, draft, true],
  ["GET", /^\/admin\/queue\/(\d+)\/photo\/([A-Za-z0-9_-]{10,100})$/, photo, true],
  ["POST", /^\/admin\/queue\/(\d+)\/retry$/, retry, true],
  ["POST", /^\/admin\/queue\/(\d+)\/discard$/, discard, true],
  ["POST", /^\/admin\/queue\/(\d+)\/approve$/, approve, true],
];

// Hermes's side (server/routes/hermes.js DOOR). It gets the folder's name, the note and its documents, never who sent
// it or any listing (D2). C6: a claim goes stale after 5 minutes; the third stale one fails (15 minutes).
export async function nextImport({ env }) {
  if (!driveImportReady(env)) return json({ import: null });
  const ts = now(), stale = minutesAgo(STALE_MINUTES);
  // A Drive failure kept while claiming (below) stays the reason; otherwise Hermes ran out of time.
  await env.DB.prepare(`UPDATE drive_imports SET status = 'failed', error = COALESCE(error, 'Hermes didn''t finish in 15 minutes')
    WHERE status = 'working' AND claimed_at <= ? AND attempts >= ?`).bind(stale, ATTEMPTS).run();
  const r = await env.DB.prepare(`UPDATE drive_imports SET status = 'working', attempts = attempts + 1, claimed_at = ?1
    WHERE id = (SELECT id FROM drive_imports WHERE status = 'queued' OR (status = 'working' AND claimed_at <= ?2)
      ORDER BY created_at, id LIMIT 1) RETURNING id, folder_id, folder_name, note`).bind(ts, stale).first();
  if (!r) return json({ import: null });
  let walked;
  try {
    const folder = await folderInfo(env, r.folder_id);
    if (!folder || await insideRecords(env, folder)) {
      await env.DB.prepare("UPDATE drive_imports SET status = 'failed', error = ? WHERE id = ?")
        .bind("The app can't open this folder any more", r.id).run();
      return nextImport({ env }); // the next one in the queue, if any
    }
    walked = await walkFolder(env, r.folder_id);
  } catch (e) { // left working: taken again in 5 minutes, failed with this reason after the third
    await env.DB.prepare("UPDATE drive_imports SET error = ? WHERE id = ?").bind(`Google Drive: ${e.message}`, r.id).run();
    throw e;
  }
  await env.DB.prepare("UPDATE drive_imports SET documents = ? WHERE id = ?").bind(JSON.stringify(walked), r.id).run();
  return json({ import: { id: r.id, folder_name: r.folder_name, note: r.note, skipped: walked.skipped,
    documents: walked.documents.map(({ id, name, path, mimeType, modifiedTime }) => ({ id, name, path, mimeType, modifiedTime })) } });
}

const working = async (env, id) => {
  const row = await get(env, id);
  return row?.status === "working" ? { row, walked: JSON.parse(row.documents ?? "null") } : null;
};

export async function importFile({ env, params: [id, fileId] }) {
  if (!driveImportReady(env)) fail(503, PAUSED);
  const w = await working(env, id);
  const doc = w?.walked?.documents.find(d => d.id === fileId);
  if (!doc) fail(404, "Not one of this import's documents");
  return fileResponse(env, doc);
}

const text = (v, max) => typeof v === "string" && v.length <= max;
function checkProposal(b) {
  if (!text(b?.property_txt, 100 * 1024) || !b.property_txt.trim()) fail(400, "property_txt: the details, at most 100 KB");
  const sources = b.sources ?? {};
  if (typeof sources !== "object" || Array.isArray(sources) || Object.keys(sources).length > 40
    || Object.entries(sources).some(([k, v]) => k.length > 40 || !text(v, 200))) fail(400, "sources: field → document name");
  const conflicts = b.conflicts ?? [];
  if (!Array.isArray(conflicts) || conflicts.length > 20 || conflicts.some(c => !text(c?.field, 40) || !Array.isArray(c.values)
    || c.values.length > 5 || c.values.some(v => !text(v?.value, 500) || !text(v?.document, 200))))
    fail(400, "conflicts: at most 20, each a field and its values with their documents");
  if (b.photos_folder != null && !text(b.photos_folder, 200)) fail(400, "photos_folder: a folder name");
  return { property_txt: b.property_txt, sources: Object.fromEntries(Object.entries(sources)),
    conflicts: conflicts.map(c => ({ field: c.field, values: c.values.map(v => ({ value: v.value, document: v.document })) })),
    photos_folder: b.photos_folder ?? null };
}

export async function importProposal({ request, env, params: [id] }) {
  if (!driveImportReady(env)) fail(503, PAUSED);
  const p = checkProposal(await readJson(request, 200 * 1024));
  const w = await working(env, id);
  if (!w) fail(409, "This import is not being worked on");
  const { folder, warning } = chooseEdited(w.walked.editedFolders, p.photos_folder);
  const got = folder ? await photosIn(env, folder.id) : { photos: [], skipped: [] };
  const warnings = [warning, ...got.skipped, ...w.walked.skipped].filter(Boolean);
  if (got.photos.length > MAX_PHOTOS) warnings.push(`${got.photos.length} photos: only the first ${MAX_PHOTOS} are used.`);
  const result = { ...p, photos_folder: folder?.name ?? null, photos: got.photos.slice(0, MAX_PHOTOS), warnings };
  const r = await env.DB.prepare(`UPDATE drive_imports SET status = 'ready', result = ?, ready_at = ? WHERE id = ? AND status = 'working'
    RETURNING id`).bind(JSON.stringify(result), now(), Number(id)).first();
  if (!r) fail(409, "This import is not being worked on");
  return json({ ok: true });
}
