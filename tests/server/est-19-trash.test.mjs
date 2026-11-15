// EST-19: the trash of properties confirmed not available (EST-15/EST-16) and the purge of their photos six calendar
// months (Jersey time) after they entered it. Only external reference photos and their thumbnails go; every protected
// file stays, one case each. Synthetic data only.
import test from "node:test";
import assert from "node:assert/strict";
import { makeEnv, seedListing, seedMedia, call, adminCookie } from "./listing-client.mjs";

const ADMIN = "admin@example.test", OLD = "2026-01-10T10:00:00.000Z", RECENT = "2026-11-01T10:00:00.000Z";
const rows = (env, sql, ...args) => env.DB.raw.prepare(sql).all(...args).map(r => ({ ...r }));
const run = (env, sql, ...args) => env.DB.raw.prepare(sql).run(...args);
const req = async (env, method, path, body) => call(env, method, path, { body, cookie: await adminCookie(ADMIN) });
const ok = (r, status = 200) => { assert.equal(r.status, status, JSON.stringify(r.data)); return r.data; };
const FLAGS = { EST16_AVAILABILITY_READY: "1", EST15_UNAVAILABILITY_READY: "1", EST19_TRASH_READY: "1", EST19_PURGE_READY: "1" };

const confirm = (env, id, status, at, operation = null) => run(env, `INSERT INTO availability_confirmations (listing_id, operation,
  status, confirmed_at, source, channel, evidence_ref, recorded_at, recorded_by, reason) VALUES (?, ?, ?, ?, 'agency', 'phone',
  'Call note FIXTURE', ?, ?, ?)`, id, operation, status, at, at, ADMIN, status === "unavailable" ? "sold" : null);
// An external reference photo with its thumbnail, both stored.
const ext = (env, id, listing, over = {}) => {
  const m = seedMedia(env, { id, listing_id: listing, r2_key: `ext/${id}.jpg`, thumb_key: `thumbs/ext/${id}.jpg`, origin: "external",
    public: 0, position: Number(id.replace(/\D/g, "")) || 0, ...over });
  for (const k of [m.r2_key, m.thumb_key]) if (k) env.MEDIA.store.set(k, { body: new Uint8Array([1]), type: "image/jpeg" });
  return m;
};
const unsafe = (env, fn) => { env.DB.raw.exec("PRAGMA foreign_keys = OFF"); fn(); env.DB.raw.exec("PRAGMA foreign_keys = ON"); };

// HE-R010: in the trash since January with two purgeable photos and every file-level protection. HE-R011…R016: one
// purgeable-looking photo each, kept by a listing-level protection. HE-R017 was restored; HE-R018 is unavailable only
// for an operation it does not offer.
function world(flags = FLAGS) {
  const env = Object.assign(makeEnv(), flags);
  for (const n of [10, 11, 12, 13, 14, 15, 16, 17, 18, 19]) seedListing(env, { id: `HE-R0${n}`, published: n === 11 ? 1 : 0 });
  const L = "HE-R010";
  ext(env, "E1", L); ext(env, "E2", L);
  ext(env, "COV", L); run(env, "UPDATE listings SET cover_media_id = 'COV' WHERE id = ?", L);
  ext(env, "FP", L, { kind: "floorplan" });
  ext(env, "DOC", L, { kind: "document" });
  ext(env, "PRIV", L, { r2_key: "private-docs/HE-R010/priv.jpg" });
  seedMedia(env, { id: "OWN", listing_id: L, r2_key: "media/own.jpg", thumb_key: "thumbs/own.jpg", origin: "hampton" });
  seedMedia(env, { id: "UP", listing_id: L, r2_key: "uploads/up.jpg", thumb_key: "thumbs/uploads/up.jpg", origin: "upload", public: 0 });
  ext(env, "SH", L, { r2_key: "ext/shared.jpg" }); ext(env, "SH2", "HE-R019", { r2_key: "ext/shared.jpg", thumb_key: null });
  ext(env, "CAP", L);
  ext(env, "PERM", L);
  ext(env, "LINK", L, { r2_key: null, thumb_key: null, source_url: "https://agency.example.test/1.jpg" });
  confirm(env, L, "available", "2025-12-01T10:00:00.000Z");
  confirm(env, L, "unavailable", OLD);
  unsafe(env, () => {
    run(env, `INSERT INTO property_captures (id, listing_id, confirmation_id, operation, data, created_at, created_by)
      VALUES (1, ?, 1, 'sale', '{}', ?, ?)`, L, OLD, ADMIN);
    run(env, "INSERT INTO property_capture_assets (capture_id, media_id, role, position, blob_key, state) VALUES (1, 'X', 'photo', 0, 'ext/CAP.jpg', 'stored')");
    run(env, `INSERT INTO image_permissions (listing_id, media_id, version, status, capture_id, asset_id, original_etag, original_bytes,
      source, reviewed_by, reviewed_at) VALUES (?, 'PERM', 1, 'branded', 1, 1, 'e', 1, '{}', ?, ?)`, L, ADMIN, OLD);
    run(env, `INSERT INTO offers (id, listing_id, applicant_id, amount, status, created_at, updated_at) VALUES (1, 'HE-R012', 1, 1000, 'accepted', ?, ?),
      (2, 'HE-R013', 1, 1000, 'pending', ?, ?)`, OLD, OLD, OLD, OLD);
    run(env, "INSERT INTO sales (listing_id, applicant_id, offer_id, price, status, created_at, updated_at) VALUES ('HE-R012', 1, 1, 1000, 'in_progress', ?, ?)", OLD, OLD);
    run(env, "INSERT INTO tenancies (id, rental_id, tenant_name, kind, regime, start_on, rent, due_day, created_at, updated_at) VALUES (1, 1, 'Fixture', 'periodic', '2025', '2026-02-01', 1000, 1, ?, ?)", OLD, OLD);
    run(env, `INSERT INTO tenancy_origins (tenancy_id, operation_id, rental_id, listing_id, applicant_id, listing_updated_at, applicant_updated_at,
      created_at, created_by) VALUES (1, 'op-fixture-1', 1, 'HE-R014', 1, ?, ?, ?, ?)`, OLD, OLD, OLD, ADMIN);
    run(env, `INSERT INTO rental_closure_windows (closure_id, listing_id, close_event_id, state, opened_at, due_at, previous_availability,
      previous_published, previous_viewings_enabled, applied_updated_at, withdrawn_at) VALUES ('c1', 'HE-R015', 1, 'withdrawn', ?,
      strftime('%Y-%m-%dT%H:%M:%fZ', ?, '+24 hours'), 'to_let', 1, 1, ?, ?)`, OLD, OLD, OLD, OLD);
  });
  for (const n of [11, 12, 13, 14, 15, 16, 17, 18]) ext(env, `K${n}`, `HE-R0${n}`);
  for (const n of [11, 12, 13, 14, 15, 17]) confirm(env, `HE-R0${n}`, "unavailable", OLD);
  confirm(env, "HE-R017", "available", "2026-03-01T10:00:00.000Z");
  confirm(env, "HE-R016", "unavailable", RECENT);
  confirm(env, "HE-R018", "unavailable", OLD, "rent");
  return env;
}
const media = env => rows(env, "SELECT id FROM media ORDER BY id").map(r => r.id);
const keys = env => [...env.MEDIA.store.keys()].sort();

test("switched off, nothing is listed and nothing can be purged; the trash alone never deletes", async () => {
  for (const flags of [{}, { ...FLAGS, EST19_TRASH_READY: "0" }, { ...FLAGS, EST15_UNAVAILABILITY_READY: "0" }]) {
    const env = world(flags), before = media(env);
    assert.deepEqual(ok(await req(env, "GET", "/admin/trash")), { enabled: false });
    assert.equal((await req(env, "POST", "/admin/trash/purge")).status, 404);
    assert.deepEqual(media(env), before);
  }
  const env = world({ ...FLAGS, EST19_PURGE_READY: "0" }), before = keys(env);
  assert.equal(ok(await req(env, "GET", "/admin/trash")).purge, false);
  assert.equal((await req(env, "POST", "/admin/trash/purge")).status, 404);
  assert.deepEqual(keys(env), before);
});

test("the trash lists what is confirmed not available, from when, why and what its purge would delete, without deleting", async () => {
  const env = world(), before = keys(env), data = ok(await req(env, "GET", "/admin/trash"));
  assert.equal(data.enabled, true); assert.equal(data.purge, true);
  const byId = Object.fromEntries(data.listings.map(l => [l.id, l]));
  assert.deepEqual(Object.keys(byId).sort(), ["HE-R010", "HE-R011", "HE-R012", "HE-R013", "HE-R014", "HE-R015", "HE-R016"]);
  const t = byId["HE-R010"];
  assert.deepEqual([t.entered_at, t.reason, t.scope, t.photos, t.kept, t.held, t.due],
    [OLD, "sold", "property", 2, 10, null, true]);
  assert.equal(t.due_at, "2026-07-10T09:00:00.000Z"); // six calendar months in Jersey: 10:00 GMT → 10:00 BST
  assert.deepEqual(["HE-R011", "HE-R012", "HE-R013", "HE-R014", "HE-R015"].map(id => [byId[id].held, byId[id].photos]),
    [["published", 0], ["sale", 0], ["offer", 0], ["tenancy", 0], ["closure", 0]]);
  assert.deepEqual([byId["HE-R016"].due, byId["HE-R016"].photos], [false, 1]);
  assert.equal(data.due_photos, 2);
  assert.deepEqual(keys(env), before);
});

test("the purge deletes only due external photos and their thumbnails, keeping every protected file and all history", async () => {
  const env = world(), confirmations = rows(env, "SELECT * FROM availability_confirmations");
  const r = ok(await req(env, "POST", "/admin/trash/purge"));
  assert.equal(r.deleted, 2);
  assert.deepEqual(media(env).filter(id => ["E1", "E2"].includes(id)), []);
  for (const id of ["COV", "FP", "DOC", "PRIV", "OWN", "UP", "SH", "SH2", "CAP", "PERM", "LINK", "K11", "K12", "K13", "K14", "K15", "K16", "K17", "K18"])
    assert.ok(media(env).includes(id), `${id} kept`);
  assert.ok(!keys(env).some(k => /E[12]\.jpg$/.test(k)));
  for (const k of ["ext/COV.jpg", "ext/FP.jpg", "ext/DOC.jpg", "ext/shared.jpg", "ext/CAP.jpg", "ext/PERM.jpg", "ext/K16.jpg"]) assert.ok(keys(env).includes(k), k);
  // The record says which photos went, never a person; the property, its confirmations and capture stay.
  const ev = rows(env, "SELECT entity_type, entity_id, type, actor, data FROM events WHERE type = 'listing.photos_purged'");
  assert.equal(ev.length, 1);
  assert.deepEqual([ev[0].entity_id, JSON.parse(ev[0].data).media_ids, JSON.parse(ev[0].data).entered_at], ["HE-R010", ["E1", "E2"], OLD]);
  assert.deepEqual(rows(env, "SELECT * FROM availability_confirmations"), confirmations);
  assert.equal(rows(env, "SELECT 1 FROM listings").length, 10);
  assert.equal(rows(env, "SELECT 1 FROM property_captures").length, 1);
  const history = ok(await req(env, "GET", "/admin/listings/HE-R010/history"));
  assert.ok(history.items.some(i => i.type === "listing.photos_purged" && !i.details_unavailable), JSON.stringify(history.items));
  // Again: nothing left to delete, no second record.
  assert.equal(ok(await req(env, "POST", "/admin/trash/purge")).deleted, 0);
  assert.equal(rows(env, "SELECT 1 FROM events WHERE type = 'listing.photos_purged'").length, 1);
  assert.equal(ok(await req(env, "GET", "/admin/trash")).due_photos, 0);
});

test("restoring is a new confirmation that it is available: the property leaves the trash and keeps its photos", async () => {
  const env = world();
  ok(await req(env, "POST", "/admin/listings/HE-R010/availability", { status: "available", confirmed_at: "2026-11-10T09:30:00.000Z",
    source: "owner", channel: "phone", evidence_ref: "Call note FIXTURE", scope: "property" }), 201);
  assert.ok(!ok(await req(env, "GET", "/admin/trash")).listings.some(l => l.id === "HE-R010"));
  assert.equal(ok(await req(env, "POST", "/admin/trash/purge")).deleted, 0);
  assert.ok(media(env).includes("E1"));
});

test("one click deletes at most 20 photos (40 files) in one storage call; the next click goes on", async () => {
  const env = Object.assign(makeEnv(), FLAGS), calls = [];
  seedListing(env, { id: "HE-R020", published: 0 });
  for (let i = 1; i <= 25; i++) ext(env, `B${i}`, "HE-R020");
  confirm(env, "HE-R020", "unavailable", OLD);
  const del = env.MEDIA.delete.bind(env.MEDIA);
  env.MEDIA.delete = async k => { calls.push([].concat(k).length); return del(k); };
  assert.equal(ok(await req(env, "POST", "/admin/trash/purge")).deleted, 20);
  assert.equal(ok(await req(env, "POST", "/admin/trash/purge")).deleted, 5);
  assert.deepEqual(calls, [40, 10]);
  assert.equal(rows(env, "SELECT 1 FROM media").length, 0);
  assert.equal(rows(env, "SELECT 1 FROM events WHERE type = 'listing.photos_purged'").length, 2);
});

test("a storage failure deletes no row and writes no record; the retry finishes once", async () => {
  const env = world(), del = env.MEDIA.delete.bind(env.MEDIA);
  env.MEDIA.delete = async () => { throw new Error("R2 down"); };
  assert.equal((await req(env, "POST", "/admin/trash/purge")).status, 500);
  assert.ok(media(env).includes("E1"));
  assert.equal(rows(env, "SELECT 1 FROM events WHERE type = 'listing.photos_purged'").length, 0);
  env.MEDIA.delete = del;
  assert.equal(ok(await req(env, "POST", "/admin/trash/purge")).deleted, 2);
  assert.equal(rows(env, "SELECT 1 FROM events WHERE type = 'listing.photos_purged'").length, 1);
});
