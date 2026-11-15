// AGE-10 (migration 0085, AGE10_PHOTOS_READY): which files of a property's latest shared capture (SPR-03) may be
// shown to a client in a private presentation. A person decides, file by file: a suitable one is Hampton's own photo
// or a version without branding supplied or authorised by its advertiser or owner, with its evidence; a branded one
// stays internal, and while the capture has no suitable file a task asks for a version without branding. Only a file
// stored here can be reviewed, and a decision covers the file it was taken on (its etag and size as SPR-03 checked
// them, never its bytes). Every decision is kept, with the photo's provenance and who decided when. Nothing here
// changes or removes a file, removes branding, makes a photo public or sends: presenting is AGE-11 and AGE-12's, which
// read files()'s suitable ones. Neither the import's recorded permission nor a commission makes a photo suitable.
import { json, fail, readJson, now } from "./http.js";
import { capturesReady } from "./property-captures.js";
import { futureTaskStatements } from "./notification-events.js";

const ready = env => env?.AGE10_PHOTOS_READY === "1" && capturesReady(env);
const missingTable = e => /no such table/.test(e?.message ?? "");
const STATUSES = ["private_approved", "branded", "denied", "revoked"], BASES = ["own", "supplied_unbranded", "authorized_unbranded"];
const LATEST = `(SELECT json_object('version', p.version, 'status', p.status, 'basis', p.basis, 'evidence_ref', p.evidence_ref,
  'reviewed_by', p.reviewed_by, 'reviewed_at', p.reviewed_at, 'etag', p.original_etag, 'bytes', p.original_bytes)
  FROM image_permissions p WHERE p.media_id = a.media_id ORDER BY p.version DESC LIMIT 1)`;

// The latest capture's files with the decision in force on each: decision is null while the file is to review, and
// earlier says a decision was taken on another version of it. Before migration 0085 it throws "no such table".
export async function files(env, listingId) {
  const [cap, assets] = await env.DB.batch([
    env.DB.prepare("SELECT MAX(id) AS id FROM property_captures WHERE listing_id = ?").bind(listingId),
    env.DB.prepare(`SELECT a.id AS asset_id, a.media_id, a.role, a.label, a.state, a.etag, a.bytes, m.origin, m.provider,
      m.rights_status, m.created_by AS added_by, a.source_url, ${LATEST} AS latest
      FROM property_capture_assets a LEFT JOIN media m ON m.id = a.media_id
      WHERE a.capture_id = (SELECT MAX(id) FROM property_captures WHERE listing_id = ?) ORDER BY a.position, a.id`).bind(listingId)]);
  const list = assets.results.map(a => {
    const latest = a.latest && JSON.parse(a.latest), applies = latest && a.state === "stored" && latest.etag === a.etag && latest.bytes === a.bytes;
    const { etag, bytes, ...decision } = latest ?? {};
    return { asset_id: a.asset_id, media_id: a.media_id, role: a.role, label: a.label, state: a.state, etag: a.etag, bytes: a.bytes,
      version: latest?.version ?? 0, decision: applies ? decision : null, earlier: Boolean(latest && !applies),
      source: { origin: a.origin, provider: a.provider, rights_status: a.rights_status, added_by: a.added_by, source_url: a.source_url } };
  });
  return { capture_id: cap.results[0]?.id ?? null, files: list };
}
const suitable = list => list.filter(f => f.decision?.status === "private_approved").length;

// The panel's view: stored files only (the others can never be presented), without their storage fingerprint.
async function view(env, listingId) {
  const { capture_id, files: all } = await files(env, listingId), stored = all.filter(f => f.state === "stored");
  return { enabled: true, capture_id, suitable: suitable(stored), not_stored: all.length - stored.length,
    files: stored.map(({ etag, bytes, state, ...f }) => f) };
}

async function list({ env, params: [id] }) {
  if (!ready(env)) return json({ enabled: false });
  try { return json(await view(env, id)); }
  catch (e) { if (missingTable(e)) return json({ enabled: false }); throw e; }
}

const TASK = { work: "capture", episode: "photos", eventId: null, title: "Get an unbranded version of the photos",
  reason: "Only branded photos: ask the advertiser or owner for versions without branding, or for permission to share them, then review them here." };

// One decision on one stored file, on the version the person saw (version: 0 when none). An older version, or a file
// changed since, answers 409 and writes nothing. Writes the decision, one event to the property's history and, when it
// changes, the task for a suitable version.
async function decide({ request, env, admin }) {
  if (!ready(env)) fail(404, "Not found");
  const b = (await readJson(request)) ?? {}, status = b.status, basis = status === "private_approved" ? b.basis : null;
  const evidence = typeof b.evidence_ref === "string" && b.evidence_ref.trim() ? b.evidence_ref.trim().slice(0, 500) : null;
  if (!STATUSES.includes(status)) fail(400, "Choose a decision");
  if (status === "private_approved" && !BASES.includes(basis)) fail(400, "Say why this photo may be shown");
  if (basis && basis !== "own" && !evidence) fail(400, "Say who supplied or authorised this version, and how");
  if (!Number.isSafeInteger(b.version) || b.version < 0 || !Number.isSafeInteger(b.asset_id)) fail(400, "Reload the photos");
  let a;
  try {
    a = await env.DB.prepare(`SELECT a.*, c.listing_id, m.origin, m.provider, m.rights_status, m.created_by AS added_by, m.created_at AS added_at,
      (SELECT status FROM image_permissions WHERE media_id = a.media_id ORDER BY version DESC LIMIT 1) AS current
      FROM property_capture_assets a JOIN property_captures c ON c.id = a.capture_id LEFT JOIN media m ON m.id = a.media_id
      WHERE a.id = ?`).bind(b.asset_id).first();
  } catch (e) { if (missingTable(e)) fail(404, "Not found"); throw e; }
  if (!a) fail(404, "Photo not found");
  if (a.state !== "stored") fail(409, "Only a file stored here can be reviewed: check files again");
  if (status === "revoked" && a.current !== "private_approved") fail(409, "Only a permission given can be withdrawn");
  // The task follows the latest capture once this decision is in: open while no file is suitable and one is branded,
  // closed once one is suitable.
  const after = (await files(env, a.listing_id)).files.filter(f => f.state === "stored")
    .map(f => (f.media_id === a.media_id && f.etag === a.etag && f.bytes === a.bytes ? status : f.decision?.status));
  const fit = after.includes("private_approved"), open = !fit && after.includes("branded");
  const target = { kind: "listing", id: a.listing_id }, taskKey = `work:capture:listing:${a.listing_id}:photos`;
  const pendingTask = fit && await env.DB.prepare("SELECT 1 FROM notifications WHERE task_key = ? AND resolved_at IS NULL").bind(taskKey).first();
  const ts = now(), source = { origin: a.origin, provider: a.provider, rights_status: a.rights_status, added_by: a.added_by,
    added_at: a.added_at, source_url: a.source_url, label: a.label };
  const [inserted] = await env.DB.batch([
    env.DB.prepare(`INSERT INTO image_permissions (listing_id, media_id, version, status, basis, evidence_ref, capture_id, asset_id,
      original_etag, original_bytes, source, reviewed_by, reviewed_at) SELECT ?, ?, ? + 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      WHERE (SELECT COALESCE(MAX(version), 0) FROM image_permissions WHERE media_id = ?) = ?
        AND EXISTS (SELECT 1 FROM property_capture_assets WHERE id = ? AND state = 'stored' AND etag IS ? AND bytes IS ?)`)
      .bind(a.listing_id, a.media_id, b.version, status, basis, evidence, a.capture_id, a.id, a.etag, a.bytes, JSON.stringify(source),
        admin, ts, a.media_id, b.version, a.id, a.etag, a.bytes),
    env.DB.prepare(`INSERT INTO events (at, actor, entity_type, entity_id, type, data) SELECT ?, ?, 'listing', ?, 'listing.photo_reviewed',
      json_object('version', 1, 'fields', json('[]'), 'media_id', ?, 'status', ?, 'basis', ?) WHERE changes() = 1`)
      .bind(ts, admin, a.listing_id, a.media_id, status, basis),
    ...(open || pendingTask ? futureTaskStatements(env, { ...TASK, phase: open ? "pending" : "resolved", target }, { ifInserted: true }) : []),
  ]);
  if (!inserted.meta.changes) fail(409, "Someone else reviewed this photo, or its file changed: reload the photos (your decision was not saved).");
  return json(await view(env, a.listing_id));
}

export default [
  ["GET", /^\/admin\/listings\/(HE-[A-Z]\d{3,})\/photo-permissions$/, list, true],
  ["POST", /^\/admin\/photo-permissions$/, decide, true],
];
