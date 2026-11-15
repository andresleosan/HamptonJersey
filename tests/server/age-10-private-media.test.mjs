// AGE-10: which captured photos (SPR-03) may be shown to a client in a private presentation, decided by a person per
// file and kept with its original's fingerprint and provenance. A branded photo stays internal and asks for a suitable
// version; nothing here writes a file, removes branding or publishes. Synthetic data only.
import test from "node:test";
import assert from "node:assert/strict";
import { makeEnv, seedListing, seedMedia, call, adminCookie } from "./listing-client.mjs";

const ADMIN = "admin@example.test", HOME = "HE-R001", PHOTOS = `/admin/listings/${HOME}/photo-permissions`;
const rows = (env, sql, ...args) => env.DB.raw.prepare(sql).all(...args).map(r => ({ ...r }));
const req = async (env, method, path, body) => call(env, method, path, { body, cookie: await adminCookie(ADMIN) });
const ok = (r, status = 200) => { assert.equal(r.status, status, JSON.stringify(r.data)); return r.data; };
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);

// A co-listed home: two photos of the agency import (with the permission recorded then), one of the team, a file gone
// and a link only. The agency has a commission and photo notes in the directory. Captured on an available confirmation.
async function world({ ready = true, schema } = {}) {
  const env = makeEnv(schema);
  Object.assign(env, { EST16_AVAILABILITY_READY: "1", SPR03_CAPTURE_READY: "1" }, ready && { AGE10_PHOTOS_READY: "1" });
  seedListing(env, { id: HOME, published: 0 });
  const agency = { origin: "upload", created_by: "import", provider: "Agency Example", rights_status: "user_declared_permission_2026-10-08", public: 0 };
  seedMedia(env, { id: "P1", r2_key: "uploads/p1.png", position: 0, label: "Front", ...agency });
  seedMedia(env, { id: "P2", r2_key: "uploads/p2.png", position: 1, label: "Kitchen", ...agency });
  seedMedia(env, { id: "P3", r2_key: "uploads/p3.png", position: 2, label: "Garden", origin: "upload", created_by: ADMIN });
  seedMedia(env, { id: "P4", r2_key: "uploads/gone.png", position: 3, label: "Gone" });
  seedMedia(env, { id: "P5", r2_key: null, thumb_key: null, origin: "external", public: 0, position: 4, label: "Link",
    source_url: "https://agency.example.test/5.jpg" });
  for (const key of ["uploads/p1.png", "uploads/p2.png", "uploads/p3.png"]) env.MEDIA.store.set(key, { body: PNG, type: "image/png" });
  if (!schema) env.DB.raw.prepare(`INSERT INTO advertisers (name, kind, details, activity_on, created_at, updated_at,
    updated_by) VALUES ('Agency Example', 'agency', ?, '2026-11-01', '2026-11-01T00:00:00.000Z', '2026-11-01T00:00:00.000Z', 'fixture')`).run(JSON.stringify({ listing_ids: [HOME], commission: "2%",
    photo_permission: "Photos may be used" }));
  ok(await req(env, "POST", `/admin/listings/${HOME}/availability`, { status: "available", confirmed_at: "2026-11-10T09:30:00.000Z",
    source: "owner", channel: "phone", evidence_ref: "Call note FIXTURE", scope: "property" }), 201);
  return env;
}
const asset = (env, media) => rows(env, "SELECT id FROM property_capture_assets WHERE media_id = ? ORDER BY id DESC", media)[0].id;
const decide = (env, media, body) => req(env, "POST", "/admin/photo-permissions", { asset_id: asset(env, media), version: 0, ...body });
const file = (data, media) => data.files.find(f => f.media_id === media);
// R2 writes, to show that nothing here changes a file.
const writes = env => { const w = []; env.MEDIA.put = async k => w.push(["put", k]); env.MEDIA.delete = async k => w.push(["delete", k]); return w; };

test("switched off, or before migration 0085, nothing is listed and nothing can be decided", async () => {
  for (const [ready, schema] of [[false, undefined], [true, { through: 84 }]]) {
    const env = await world({ ready, schema });
    assert.deepEqual(ok(await req(env, "GET", PHOTOS)), { enabled: false });
    assert.equal((await req(env, "POST", "/admin/photo-permissions", { asset_id: 1, status: "branded", version: 0 })).status, 404);
  }
});

test("every stored file starts to review: neither the import's recorded permission nor a commission makes it suitable", async () => {
  const env = await world(), data = ok(await req(env, "GET", PHOTOS));
  assert.deepEqual(data.files.map(f => [f.media_id, f.decision, f.version]), [["P1", null, 0], ["P2", null, 0], ["P3", null, 0]]);
  assert.equal(data.suitable, 0);
  assert.equal(data.not_stored, 2); // the file gone and the link only can never be presented
  assert.deepEqual(file(data, "P1").source, { origin: "upload", provider: "Agency Example", rights_status: "user_declared_permission_2026-10-08",
    added_by: "import", source_url: null });
  // A file not stored here cannot be reviewed.
  const link = rows(env, "SELECT id FROM property_capture_assets WHERE media_id = 'P5'")[0].id;
  assert.equal((await req(env, "POST", "/admin/photo-permissions", { asset_id: link, status: "private_approved", basis: "own", version: 0 })).status, 409);
});

test("a photo only branded stays internal, opens one task for a suitable version, and no file or listing changes", async () => {
  const env = await world(), w = writes(env), media = rows(env, "SELECT * FROM media ORDER BY id");
  let data = ok(await decide(env, "P1", { status: "branded" }));
  data = ok(await decide(env, "P2", { status: "branded" }));
  assert.equal(file(data, "P1").decision.status, "branded");
  assert.equal(data.suitable, 0);
  assert.deepEqual(rows(env, "SELECT title, resolved_at FROM notifications WHERE task_key = ?", `work:capture:listing:${HOME}:photos`),
    [{ title: "Get an unbranded version of the photos", resolved_at: null }]);
  assert.deepEqual(w, []); // no branding removed, nothing stored or deleted
  assert.deepEqual(rows(env, "SELECT * FROM media ORDER BY id"), media); // nothing made public
  assert.deepEqual(rows(env, "SELECT type FROM events WHERE type = 'listing.photo_reviewed'").length, 2);
  const history = ok(await req(env, "GET", `/admin/listings/${HOME}/history`));
  assert.ok(history.items.some(i => i.type === "listing.photo_reviewed" && !i.details_unavailable));
});

test("one photo approved does not approve the agency's others; a supplied version needs its evidence", async () => {
  const env = await world();
  assert.equal((await decide(env, "P1", { status: "private_approved", basis: "supplied_unbranded" })).status, 400);
  assert.equal((await decide(env, "P1", { status: "private_approved" })).status, 400);
  const data = ok(await decide(env, "P1", { status: "private_approved", basis: "authorized_unbranded",
    evidence_ref: "Email from the agency, 12 Nov" }));
  assert.equal(file(data, "P1").decision.basis, "authorized_unbranded");
  assert.equal(file(data, "P1").decision.reviewed_by, ADMIN);
  assert.equal(file(data, "P2").decision, null);
  assert.equal(data.suitable, 1);
});

test("a suitable version closes the task and leaves the branded original, its file and its decision as they were", async () => {
  const env = await world();
  ok(await decide(env, "P1", { status: "branded" }));
  const data = ok(await decide(env, "P3", { status: "private_approved", basis: "own" }));
  assert.equal(file(data, "P1").decision.status, "branded");
  assert.equal(data.suitable, 1);
  assert.ok(env.MEDIA.store.has("uploads/p1.png"));
  assert.notEqual(rows(env, "SELECT resolved_at FROM notifications WHERE task_key = ?", `work:capture:listing:${HOME}:photos`)[0].resolved_at, null);
});

test("a decision on an old version answers 409 and writes nothing; only a given permission can be withdrawn", async () => {
  const env = await world();
  assert.equal((await decide(env, "P3", { status: "revoked" })).status, 409);
  ok(await decide(env, "P3", { status: "private_approved", basis: "own" }));
  const before = rows(env, "SELECT COUNT(*) AS n FROM events")[0].n;
  assert.equal((await decide(env, "P3", { status: "denied", version: 0 })).status, 409);
  assert.equal(rows(env, "SELECT COUNT(*) AS n FROM image_permissions")[0].n, 1);
  assert.equal(rows(env, "SELECT COUNT(*) AS n FROM events")[0].n, before);
  const data = ok(await decide(env, "P3", { status: "revoked", version: 1 }));
  assert.equal(file(data, "P3").decision.status, "revoked");
  assert.equal(data.suitable, 0);
  // Every decision is kept, with the original it was taken on.
  assert.deepEqual(rows(env, "SELECT version, status, original_etag, original_bytes FROM image_permissions ORDER BY version"),
    [{ version: 1, status: "private_approved", original_etag: "test", original_bytes: PNG.length },
      { version: 2, status: "revoked", original_etag: "test", original_bytes: PNG.length }]);
});

test("a decision covers the original it was taken on: a changed file is to review again", async () => {
  const env = await world();
  ok(await decide(env, "P3", { status: "private_approved", basis: "own" }));
  env.MEDIA.store.set("uploads/p3.png", { body: PNG, type: "image/png", etag: "other" });
  ok(await req(env, "POST", `/admin/property-captures/${rows(env, "SELECT id FROM property_captures")[0].id}/check`, {}));
  const data = ok(await req(env, "GET", PHOTOS));
  assert.equal(file(data, "P3").decision, null);
  assert.equal(file(data, "P3").earlier, true);
  assert.equal(file(data, "P3").version, 1);
  assert.equal(data.suitable, 0);
});
