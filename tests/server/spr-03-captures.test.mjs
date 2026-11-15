// SPR-03: a confirmation that says available captures one shared record of the property (its data, the evidence and
// one row per photo with its own state), opens one Inbox task to open it, and its downloads never claim to be complete
// when a file is missing. Synthetic data only.
import test from "node:test";
import assert from "node:assert/strict";
import { makeEnv, seedListing, seedMedia, call, adminCookie, ORIGIN } from "./listing-client.mjs";
import { handleApi } from "../../server/api.js";
import { csvTextCell, settleQueuedCaptures } from "../../server/property-captures.js";
import { crc32 } from "node:zlib";

const ADMIN = "admin@example.test", OTHER = "colleague@example.test";
const HOME = "HE-R001", PATH = `/admin/listings/${HOME}/availability`, CAPTURES = `/admin/listings/${HOME}/captures`;
const rows = (env, sql, ...args) => env.DB.raw.prepare(sql).all(...args).map(r => ({ ...r }));
const req = async (env, method, path, body, email = ADMIN) => call(env, method, path, { body, cookie: await adminCookie(email) });
const ok = (r, status = 200) => { assert.equal(r.status, status, JSON.stringify(r.data)); return r.data; };
const fact = (o = {}) => ({ status: "available", confirmed_at: "2025-03-10T09:30:00.000Z", source: "owner", channel: "phone",
  evidence_ref: "Call note FIXTURE", scope: "property", ...o });
const confirm = (env, o, email) => req(env, "POST", PATH, fact(o), email);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);

function world({ ready = true, schema } = {}) {
  const env = makeEnv(schema);
  env.EST16_AVAILABILITY_READY = "1";
  if (ready) env.SPR03_CAPTURE_READY = "1";
  seedListing(env, { id: HOME, title: "=HYPERLINK(\"x\")", road_name: null });
  seedMedia(env, { id: "A1", r2_key: "media/a1.png", position: 0, label: "Kitchen" });
  seedMedia(env, { id: "A2", r2_key: "media/a2.png", position: 1, label: "Garden" });
  seedMedia(env, { id: "A3", r2_key: null, thumb_key: null, origin: "external", public: 0, position: 2, label: "Agency photo",
    source_url: "https://agency.example.test/p/1.jpg" });
  seedMedia(env, { id: "A4", r2_key: "media/plan.png", kind: "floorplan", position: 3, label: "Plan" });
  seedMedia(env, { id: "A5", r2_key: "docs/epc.pdf", kind: "document", public: 0, position: 4, label: "EPC" });
  seedMedia(env, { id: "A6", r2_key: "private-docs/D1.pdf", thumb_key: null, public: 0, position: 5, label: "Lease" }); // PUB-11's
  for (const key of ["media/a1.png", "media/plan.png", "docs/epc.pdf", "private-docs/D1.pdf"]) env.MEDIA.store.set(key, { body: PNG, type: "image/png" });
  return env;
}
// A binary answer (the ZIP), read whole for the assertions.
async function raw(env, path, cookie) {
  const res = await handleApi(new Request(ORIGIN + "/api" + path, { headers: cookie ? { cookie } : {} }), env, path.split("?")[0].slice(1).split("/"));
  return { status: res.status, headers: res.headers, bytes: new Uint8Array(await res.arrayBuffer()) };
}
// The names and contents of a stored ZIP, read from its central directory; each CRC-32 must match its bytes.
function unzip(b) {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength), files = {};
  let end = b.length - 22;
  while (v.getUint32(end, true) !== 0x06054b50) end--;
  let p = v.getUint32(end + 16, true);
  for (let n = v.getUint16(end + 10, true); n--;) {
    assert.equal(v.getUint32(p, true), 0x02014b50);
    const size = v.getUint32(p + 24, true), nameLen = v.getUint16(p + 28, true), local = v.getUint32(p + 42, true);
    const name = new TextDecoder().decode(b.subarray(p + 46, p + 46 + nameLen));
    const start = local + 30 + v.getUint16(local + 26, true);
    files[name] = b.subarray(start, start + size);
    assert.equal(v.getUint32(p + 16, true), crc32(files[name]), `CRC of ${name}`);
    assert.equal(v.getUint32(local + 14, true), crc32(files[name]), `local CRC of ${name}`);
    p += 46 + nameLen + v.getUint16(p + 30, true) + v.getUint16(p + 32, true);
  }
  return files;
}

test("switched off, or before migration 0084, a confirmation captures nothing and the routes say so", async () => {
  for (const [ready, schema] of [[false, {}], [true, { through: 83 }]]) {
    const env = world({ ready, schema });
    ok(await confirm(env), 201);
    if (!schema.through) assert.equal(rows(env, "SELECT * FROM property_captures").length, 0);
    assert.equal(rows(env, "SELECT * FROM notifications").length, 0);
    assert.deepEqual(ok(await req(env, "GET", CAPTURES)), { enabled: false });
    assert.equal((await req(env, "POST", "/admin/property-captures/1/check", {})).status, 404);
  }
});

test("a confirmation that says available captures one shared record; a missing photo leaves it partial and visible", async () => {
  const env = world();
  ok(await confirm(env), 201);
  ok(await confirm(env)); // the same click again: no second confirmation, no second capture
  ok(await confirm(env, { status: "unknown" }), 201); // not available-or-not: nothing to capture
  const [capture] = rows(env, "SELECT * FROM property_captures");
  assert.equal(rows(env, "SELECT 1 FROM property_captures").length, 1);
  assert.deepEqual([capture.listing_id, capture.operation, capture.state, capture.created_by], [HOME, "sale", "partial", ADMIN]);
  const data = JSON.parse(capture.data);
  assert.equal(data.property.title, "=HYPERLINK(\"x\")");
  assert.deepEqual(data.confirmation, { status: "available", confirmed_at: "2025-03-10T09:30:00.000Z", source: "owner", channel: "phone",
    evidence_ref: "Call note FIXTURE", recorded_by: ADMIN, scope: "property" });
  assert.deepEqual(data.adverts, []);
  // One row per photo and floor plan, never a document; each with its own state.
  assert.deepEqual(rows(env, "SELECT media_id, role, state, bytes FROM property_capture_assets ORDER BY position"), [
    { media_id: "A1", role: "photo", state: "stored", bytes: PNG.length },
    { media_id: "A2", role: "photo", state: "failed", bytes: null },
    { media_id: "A3", role: "photo", state: "blocked", bytes: null },
    { media_id: "A4", role: "floorplan", state: "stored", bytes: PNG.length }]);
  // Its activity in the property's history, and one task in the Inbox to open the record.
  assert.deepEqual(rows(env, "SELECT entity_type, entity_id, type, json_extract(data, '$.state') AS state FROM events WHERE type = 'listing.captured'"),
    [{ entity_type: "listing", entity_id: HOME, type: "listing.captured", state: "partial" }]);
  assert.deepEqual(rows(env, "SELECT title, target_kind, target_id, action_required, resolved_at FROM notifications"),
    [{ title: "Open property record: capture partial (2 of 4 files)", target_kind: "listing", target_id: HOME, action_required: 1, resolved_at: null }]);
  const history = ok(await req(env, "GET", `/admin/listings/${HOME}/history`));
  assert.ok(history.items.some(i => i.type === "listing.captured" && !i.details_unavailable), JSON.stringify(history.items));

  const view = ok(await req(env, "GET", CAPTURES));
  assert.equal(view.enabled, true);
  assert.deepEqual(view.latest.assets.map(a => [a.label, a.state]), [["Kitchen", "stored"], ["Garden", "failed"], ["Agency photo", "blocked"], ["Plan", "stored"]]);
  assert.match(view.latest.assets[1].problem, /not found/);
  assert.equal(view.latest.assets[2].source_url, "https://agency.example.test/p/1.jpg");
  assert.ok(view.latest.missing.includes("road_name"));
  assert.deepEqual(view.latest.counts, { files: 4, stored: 2, waiting: 0 });
});

test("a not available confirmation captures nothing", async () => {
  const env = world();
  ok(await confirm(env, { status: "unavailable" }), 201);
  assert.equal(rows(env, "SELECT 1 FROM property_captures").length, 0);
});

test("checking again stores what is now there without duplicates and updates the same task; a closed task stays closed", async () => {
  const env = world();
  ok(await confirm(env), 201);
  env.MEDIA.store.set("media/a2.png", { body: PNG, type: "image/png" });
  env.DB.raw.prepare("DELETE FROM media WHERE id = 'A3'").run(); // a later edit of the property does not change the capture
  const id = rows(env, "SELECT id FROM property_captures")[0].id;
  env.DB.raw.prepare("UPDATE notifications SET resolved_at = '2026-11-15T10:00:00.000Z', resolved_by = ?").run(ADMIN);
  let view = ok(await req(env, "POST", `/admin/property-captures/${id}/check`, {}, OTHER));
  assert.deepEqual([view.latest.state, view.latest.counts], ["partial", { files: 4, stored: 3, waiting: 0 }], "the link-only photo still blocks it");
  assert.equal(rows(env, "SELECT 1 FROM property_capture_assets").length, 4);
  // Once the blocked one is gone from storage too, nothing more changes: no new event, one task.
  view = ok(await req(env, "POST", `/admin/property-captures/${id}/check`, {}));
  assert.equal(rows(env, "SELECT 1 FROM events WHERE type = 'listing.captured'").length, 2);
  assert.deepEqual(rows(env, "SELECT title, resolved_by FROM notifications"),
    [{ title: "Open property record: capture partial (3 of 4 files)", resolved_by: ADMIN }], "closed by a person, it stays closed");
  assert.equal(rows(env, "SELECT attempts FROM property_capture_assets WHERE media_id = 'A2'")[0].attempts, 2);
});

test("every file stored: complete, and its task says so", async () => {
  const env = world();
  env.DB.raw.prepare("DELETE FROM media WHERE id IN ('A2','A3')").run();
  ok(await confirm(env), 201);
  assert.equal(rows(env, "SELECT state FROM property_captures")[0].state, "complete");
  assert.deepEqual(rows(env, "SELECT title FROM notifications"), [{ title: "Open property record: capture complete (2 files)" }]);
});

test("downloads are for staff, attachments, never cached; the ZIP and the data say when they are not complete", async () => {
  const env = world(), cookie = await adminCookie();
  ok(await confirm(env), 201);
  const [capture] = rows(env, "SELECT id FROM property_captures"), assets = rows(env, "SELECT id, media_id FROM property_capture_assets ORDER BY position");
  const base = `/admin/property-captures/${capture.id}`;
  for (const path of [`${base}/files/${assets[0].id}`, `${base}/photos.zip`, `${base}/data.json`, `${base}/data.csv`])
    assert.equal((await raw(env, path)).status, 401, path);

  const one = await raw(env, `${base}/files/${assets[0].id}`, cookie);
  assert.equal(one.status, 200);
  assert.deepEqual([...one.bytes], [...PNG]);
  assert.match(one.headers.get("content-disposition"), /^attachment; filename="HE-R001-capture-\d+-1\.png"$/);
  assert.equal(one.headers.get("cache-control"), "no-store");
  assert.equal(one.headers.get("x-content-type-options"), "nosniff");
  assert.equal((await raw(env, `${base}/files/${assets[1].id}`, cookie)).status, 404, "a failed file has nothing to download");
  assert.equal((await raw(env, `/admin/property-captures/${capture.id + 1}/files/${assets[0].id}`, cookie)).status, 404);

  // All photos: only the stored ones, the floor plan not among them, and marked incomplete.
  const zip = await raw(env, `${base}/photos.zip`, cookie);
  assert.equal(zip.status, 200);
  assert.equal(zip.headers.get("x-capture-complete"), "0");
  assert.match(zip.headers.get("content-disposition"), /incomplete\.zip"$/);
  assert.deepEqual(Object.keys(unzip(zip.bytes)), ["01-Kitchen.png"]);
  assert.deepEqual([...unzip(zip.bytes)["01-Kitchen.png"]], [...PNG]);
  // A selection: a file that is not a stored photo of this capture is refused, not skipped.
  assert.equal((await raw(env, `${base}/photos.zip?ids=${assets[3].id}`, cookie)).status, 400);
  assert.equal((await raw(env, `${base}/photos.zip?ids=${assets[0].id}`, cookie)).headers.get("x-capture-complete"), "0");

  const data = JSON.parse(new TextDecoder().decode((await raw(env, `${base}/data.json`, cookie)).bytes));
  assert.equal(data.complete, false);
  assert.equal(data.property.title, "=HYPERLINK(\"x\")", "JSON keeps the original value");
  assert.deepEqual(data.files.map(f => f.state), ["stored", "failed", "blocked", "stored"]);
  const csv = new TextDecoder().decode((await raw(env, `${base}/data.csv`, cookie)).bytes);
  assert.match(csv, /^field,value\r\n/);
  assert.match(csv, /\r\nproperty\.title,"'=HYPERLINK\(""x""\)"\r\n/);
  assert.match(csv, /\r\ncomplete,no\r\n/);
});

test("a CSV cell never starts a formula and keeps quotes and lines", () => {
  for (const v of ["=1+1", "+1", "-1", "@SUM(A1)", "\t=1", "\r=1", "﻿=1", " =1"]) assert.match(csvTextCell(v), /^"?'/);
  assert.equal(csvTextCell('a "b"\nc'), '"\'a ""b""\nc"');
  assert.equal(csvTextCell(null), "");
  assert.equal(csvTextCell(3), "3");
});

// Review 15-nov: a photo deleted after the capture was complete.
test("a stored photo deleted later: no download says complete, checking again makes it partial, the ZIP leaves it out", async () => {
  const env = world(), cookie = await adminCookie();
  env.DB.raw.prepare("DELETE FROM media WHERE id IN ('A3','A4')").run();
  env.DB.raw.prepare("UPDATE media SET origin = 'upload' WHERE id = 'A2'").run();
  env.MEDIA.store.set("media/a2.png", { body: new Uint8Array([0xff, 0xd8, 9, 9, 9]), type: "image/jpeg" });
  ok(await confirm(env), 201);
  const [{ id }] = rows(env, "SELECT id FROM property_captures"), base = `/admin/property-captures/${id}`;
  assert.equal(rows(env, "SELECT state FROM property_captures")[0].state, "complete");
  assert.equal((await raw(env, `${base}/photos.zip`, cookie)).headers.get("x-capture-complete"), "1");
  ok(await req(env, "DELETE", "/admin/media/A2")); // the panel's delete removes the stored file too
  assert.equal(env.MEDIA.store.has("media/a2.png"), false);

  const view = ok(await req(env, "GET", CAPTURES)).latest;
  assert.deepEqual([view.state, view.counts.stored, view.assets[1].state], ["partial", 1, "failed"]);
  assert.match(view.assets[1].problem, /no longer in storage/);
  const cookieGet = path => raw(env, `${base}/${path}`, cookie), text = async path => new TextDecoder().decode((await cookieGet(path)).bytes);
  assert.equal(JSON.parse(await text("data.json")).complete, false);
  assert.match(await text("data.csv"), /\r\ncomplete,no\r\n/);
  const zip = await cookieGet("photos.zip");
  assert.deepEqual([zip.status, zip.headers.get("x-capture-complete")], [200, "0"]);
  assert.deepEqual(Object.keys(unzip(zip.bytes)), ["01-Kitchen.png"], "the gone file is left out before the answer starts");
  assert.equal((await cookieGet(`photos.zip?ids=${rows(env, "SELECT id FROM property_capture_assets WHERE media_id = 'A2'")[0].id}`)).status, 400);

  // Checking again also checks stored files: back to partial, one event and the task says so.
  const checked = ok(await req(env, "POST", `${base}/check`, {})).latest;
  assert.deepEqual([checked.state, checked.counts], ["partial", { files: 2, stored: 1, waiting: 0 }]);
  assert.equal(rows(env, "SELECT state FROM property_captures")[0].state, "partial");
  assert.deepEqual(rows(env, "SELECT title FROM notifications WHERE task_key LIKE 'work:capture:%'"),
    [{ title: "Open property record: capture partial (1 of 2 files)" }]);
});

test("a file that changed since it was checked is not put in the ZIP until it is checked again", async () => {
  const env = world(), cookie = await adminCookie();
  ok(await confirm(env), 201);
  const [{ id }] = rows(env, "SELECT id FROM property_captures");
  env.MEDIA.store.set("media/a1.png", { body: new Uint8Array([1, 2, 3]), type: "image/png", etag: "changed" });
  assert.equal((await raw(env, `/admin/property-captures/${id}/photos.zip`, cookie)).status, 404, "no stored photo is still the one checked");
  ok(await req(env, "POST", `/admin/property-captures/${id}/check`, {}));
  const zip = await raw(env, `/admin/property-captures/${id}/photos.zip`, cookie);
  assert.deepEqual([...unzip(zip.bytes)["01-Kitchen.png"]], [1, 2, 3]);
});

test("files are checked a few at a time: the rest wait, visible in the Inbox, and are checked by the clock or again", async () => {
  const env = world();
  for (let i = 0; i < 6; i++) {
    seedMedia(env, { id: `B${i}`, r2_key: `media/b${i}.png`, position: 10 + i, label: `Room ${i}` });
    env.MEDIA.store.set(`media/b${i}.png`, { body: PNG, type: "image/png" });
  }
  ok(await confirm(env), 201);
  assert.equal(rows(env, "SELECT state FROM property_captures")[0].state, "queued");
  assert.deepEqual(rows(env, "SELECT title FROM notifications"),
    [{ title: "Open property record: 5 of 10 files checked, the rest still to check" }]);
  await settleQueuedCaptures(env);
  assert.equal(rows(env, "SELECT state FROM property_captures")[0].state, "partial");
  assert.deepEqual(rows(env, "SELECT title FROM notifications"), [{ title: "Open property record: capture partial (8 of 10 files)" }]);
});

test("only the confirmation in force captures; a later not available closes the open capture task", async () => {
  const env = world();
  ok(await confirm(env, { status: "unavailable", reason: "let", confirmed_at: "2025-04-01T09:00:00.000Z" }), 201);
  ok(await confirm(env, { confirmed_at: "2025-03-01T09:00:00.000Z" }), 201); // older than the one in force
  assert.equal(rows(env, "SELECT 1 FROM property_captures").length, 0);
  ok(await confirm(env, { confirmed_at: "2025-05-01T09:00:00.000Z" }), 201);
  assert.equal(rows(env, "SELECT 1 FROM property_captures").length, 1);
  ok(await confirm(env, { status: "unavailable", reason: "let", confirmed_at: "2025-06-01T09:00:00.000Z" }), 201);
  assert.deepEqual(rows(env, "SELECT resolved_by, closed_by_source FROM notifications WHERE task_key LIKE 'work:capture:%'"),
    [{ resolved_by: "system", closed_by_source: 1 }]);
});
