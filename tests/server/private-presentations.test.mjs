// AGE-11: the extra human review of a private presentation before a person sends AGE-12's link. The snapshot (homes,
// availability confirmation and its date, conditions, AGE-10's suitable photos checked in storage) is approved as a
// version; sending needs the latest approval to match the snapshot rebuilt then (stale: 409), and the client's page
// shows only the approved snapshot. Off, or before migration 0115, AGE-12 answers as before. Synthetic data only.
import test from "node:test";
import assert from "node:assert/strict";
import { makeEnv, seedListing, seedMedia, call, adminCookie, captured, T0 } from "./listing-client.mjs";
import { recomputeForApplicant } from "../../server/match-store.js";
import { extractFeatures } from "../../server/listing-features.js";

const ADMIN = "admin@example.test", COLLEAGUE = "colleague@example.test", HOME = "HE-R001", OTHER = "HE-R002";
const run = (env, sql, ...args) => env.DB.raw.prepare(sql).run(...args);
const rows = (env, sql, ...args) => env.DB.raw.prepare(sql).all(...args).map(r => ({ ...r }));
const req = async (env, method, path, body, who = ADMIN) => call(env, method, path, { body, cookie: await adminCookie(who) });
const ok = (r, status = 200) => { assert.equal(r.status, status, JSON.stringify(r.data)); return r.data; };
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);

const home = (env, id) => seedListing(env, { id, title: `Fixture ${id}`, operation: "rent", availability: "to_let", rent: 1800, rent_period: "month",
  sale_price: null, bedrooms: 2, bathrooms: 2, housing_category: "registered", matchable: 1, published: 0,
  ...extractFeatures({ description: "Parking for two cars" }), parish: "St Helier", location: "St Helier" });
async function client(env) {
  const c = run(env, "INSERT INTO contacts (name, email, phone, last_activity_at, created_at, updated_at) VALUES ('Fixture Client', ?, ?, ?, ?, ?)",
    "age11-client@example.test", "+447700900111", T0, T0, T0);
  const a = Number(run(env, `INSERT INTO applicants (contact_id, operation, stage, source, budget_max, bedrooms_min, parking_spaces, pets,
    household_adults, household_children, household_total, created_at, updated_at, requirement_priorities) VALUES (?, 'rent',
    'searching', 'phone', 2000, 2, 2, '[{"kind":"none"}]', 2, 0, 2, ?, ?, ?)`, Number(c.lastInsertRowid), T0, T0,
    JSON.stringify({ version: 1, values: { budget: "must", bedrooms: "must", parking: "must" }, unknown: [] })).lastInsertRowid);
  await recomputeForApplicant(env, a, "system");
  return a;
}
const matchOf = (env, a, listing) => rows(env, "SELECT id FROM matches WHERE applicant_id = ? AND listing_id = ?", a, listing)[0].id;
const confirm = async (env, listing, status = "available", confirmed_at = "2026-11-10T09:30:00.000Z") =>
  ok(await req(env, "POST", `/admin/listings/${listing}/availability`, { status, confirmed_at, source: "owner", channel: "phone",
    evidence_ref: "Call note FIXTURE", scope: "property" }), 201);

// Two homes confirmed available, both approved for the client. The first has three captured photos: two suitable
// (P1, P3), one branded (P2); the second one suitable photo (Q1).
async function world({ review = true, presentations = true, schema } = {}) {
  const env = makeEnv(schema);
  Object.assign(env, { EST16_AVAILABILITY_READY: "1", SPR03_CAPTURE_READY: "1", AGE10_PHOTOS_READY: "1", SAP02_COUNTS_READY: "1" },
    presentations && { AGE12_PRESENTATIONS_READY: "1" }, review && { AGE11_REVIEW_READY: "1" });
  home(env, HOME); home(env, OTHER);
  for (const [id, listing, label, pos] of [["P1", HOME, "Front", 0], ["P2", HOME, "Branded", 1], ["P3", HOME, "Garden", 2], ["Q1", OTHER, "Hall", 0]]) {
    seedMedia(env, { id, listing_id: listing, r2_key: `uploads/${id}.png`, position: pos, label, origin: "upload", created_by: ADMIN, public: 0 });
    env.MEDIA.store.set(`uploads/${id}.png`, { body: PNG, type: "image/png" });
  }
  await confirm(env, HOME); await confirm(env, OTHER);
  const asset = media => rows(env, "SELECT id FROM property_capture_assets WHERE media_id = ? ORDER BY id DESC", media)[0].id;
  for (const [media, body] of [["P1", { status: "private_approved", basis: "own" }], ["P2", { status: "branded" }],
    ["P3", { status: "private_approved", basis: "own" }], ["Q1", { status: "private_approved", basis: "own" }]])
    ok(await req(env, "POST", "/admin/photo-permissions", { asset_id: asset(media), version: 0, ...body }));
  const a = await client(env);
  for (const l of [HOME, OTHER]) ok(await req(env, "PUT", `/admin/matches/${matchOf(env, a, l)}`, { status: "shortlisted", from: "found" }));
  return { env, a, asset };
}
const link = async (env, a, listings = [HOME]) =>
  ok(await req(env, "POST", `/admin/applicants/${a}/presentations`, { match_ids: listings.map(l => matchOf(env, a, l)) }), 201);
const review = async (env, id) => ok(await req(env, "GET", `/admin/presentations/${id}/review`));
const approve = (env, id, body, who) => req(env, "POST", `/admin/presentations/${id}/approve`, body, who);
const send = (env, id) => req(env, "POST", `/admin/presentations/${id}/sent`, {});
async function approved(env, id) {
  const r = await review(env, id);
  return ok(await approve(env, id, { snapshot_hash: r.snapshot_hash, version: r.approval?.version ?? 0 }));
}
async function session(env, g) {
  const r = await call(env, "POST", "/presentation/session", { body: { token: new URL(g.link).hash.slice(1) } });
  assert.equal(r.status, 200, r.text);
  return r.headers.get("set-cookie").split(";")[0];
}
const as = (env, cookie, method, path, body) => call(env, method, path, { body, cookie });

test("the review shows the exact snapshot: chosen homes only, their confirmation date, conditions and suitable photos", async () => {
  const { env, a, asset } = await world();
  const g = await link(env, a); // OTHER is approved and available too, but the team did not choose it
  const r = await review(env, g.id);
  assert.equal(r.enabled, true);
  assert.match(r.snapshot_hash, /^[0-9a-f]{64}$/);
  assert.deepEqual(r.blockers, []);
  assert.equal(r.approval, null);
  assert.deepEqual(r.snapshot.homes.map(h => [h.listing_id, h.title, h.operation, h.rent, h.rent_period, h.availability_confirmed_at]),
    [[HOME, `Fixture ${HOME}`, "rent", 1800, "month", "2026-11-10T09:30:00.000Z"]]);
  assert.deepEqual(r.snapshot.homes[0].photos.map(p => [p.asset_id, p.label]), [[asset("P1"), "Front"], [asset("P3"), "Garden"]]);
  assert.ok(!JSON.stringify(r).includes("age11-client")); // no contact details
  // Staff only.
  assert.equal((await call(env, "GET", `/admin/presentations/${g.id}/review`)).status, 401);
  assert.equal((await call(env, "POST", `/admin/presentations/${g.id}/approve`, { body: {} })).status, 401);
});

test("sending needs an approval of the snapshot as it stands: none, or a stale one, answers 409 and the link stays dormant", async () => {
  const { env, a } = await world();
  const g = await link(env, a);
  const none = await send(env, g.id);
  assert.equal(none.status, 409);
  assert.match(none.data.error, /Review and approve/);
  const first = ok(await approve(env, g.id, { snapshot_hash: (await review(env, g.id)).snapshot_hash, version: 0 }));
  assert.deepEqual([first.approval.version, first.approval.approved_by, first.approved_current], [1, ADMIN, true]);
  // The panel says it is approved.
  assert.equal(ok(await req(env, "GET", `/admin/applicants/${a}/presentations`)).grants[0].approval.version, 1);
  // The description changes after the approval: the snapshot is stale and cannot be sent.
  run(env, "UPDATE listings SET summary = 'Now with a new kitchen' WHERE id = ?", HOME);
  const stale = await send(env, g.id);
  assert.equal(stale.status, 409);
  assert.match(stale.data.error, /changed since it was approved/);
  assert.equal(rows(env, "SELECT sent_at FROM presentation_grants")[0].sent_at, null);
  const r = await review(env, g.id);
  assert.equal(r.approved_current, false);
  // Approving the old preview is refused too; the new one is version 2.
  assert.equal((await approve(env, g.id, { snapshot_hash: first.snapshot_hash, version: 1 })).status, 409);
  const second = ok(await approve(env, g.id, { snapshot_hash: r.snapshot_hash, version: 1 }));
  assert.equal(second.approval.version, 2);
  assert.equal(second.snapshot.homes[0].summary, "Now with a new kitchen");
  // Approving again what is already approved writes nothing.
  assert.equal((await approve(env, g.id, { snapshot_hash: r.snapshot_hash, version: 2 })).status, 409);
  ok(await send(env, g.id));
  // Once sent, the snapshot is closed: no new approval.
  assert.equal((await approve(env, g.id, { snapshot_hash: r.snapshot_hash, version: 2 })).status, 409);
  assert.equal(rows(env, "SELECT COUNT(*) AS n FROM presentation_reviews")[0].n, 2);
  assert.equal(rows(env, "SELECT COUNT(*) AS n FROM events WHERE type = 'applicant.presentation_approved'")[0].n, 2);
  assert.throws(() => run(env, "UPDATE presentation_reviews SET approved_by = 'x'"), /append-only/);
});

test("a home not confirmed available, no longer approved, or without a suitable photo blocks the approval", async () => {
  for (const [label, change, code] of [
    ["availability unknown", async (env) => confirm(env, HOME, "unknown", "2026-11-11T09:30:00.000Z"), "not_confirmed"],
    ["match rejected", async (env, a) => run(env, "UPDATE matches SET status = 'rejected', reject_reason = 'other' WHERE id = ?", matchOf(env, a, HOME)), "not_confirmed"],
    ["no suitable photo", async (env, a, asset) => {
      for (const m of ["P1", "P3"]) ok(await req(env, "POST", "/admin/photo-permissions", { asset_id: asset(m), version: 1, status: "revoked" }));
    }, "no_photo"],
  ]) {
    const { env, a, asset } = await world();
    const g = await link(env, a);
    await change(env, a, asset);
    const r = await review(env, g.id);
    assert.deepEqual(r.blockers.map(b => [b.listing_id, b.code]), [[HOME, code]], label);
    if (code === "not_confirmed") assert.equal(r.snapshot.homes[0].availability_confirmed_at, null, label); // never shown as confirmed
    const refused = await approve(env, g.id, { snapshot_hash: r.snapshot_hash, version: 0 });
    assert.equal(refused.status, 409, label);
    assert.equal(rows(env, "SELECT COUNT(*) AS n FROM presentation_reviews")[0].n, 0, label);
  }
});

test("a photo changed in storage since SPR-03 checked it is left out of the snapshot", async () => {
  const { env, a, asset } = await world();
  const g = await link(env, a);
  env.MEDIA.store.set("uploads/P3.png", { body: PNG, type: "image/png", etag: "other" });
  assert.deepEqual((await review(env, g.id)).snapshot.homes[0].photos.map(p => p.asset_id), [asset("P1")]);
});

test("two people approving the same preview at once: one approval", async () => {
  const { env, a } = await world();
  const g = await link(env, a), { snapshot_hash } = await review(env, g.id);
  const both = await Promise.all([approve(env, g.id, { snapshot_hash, version: 0 }), approve(env, g.id, { snapshot_hash, version: 0 }, COLLEAGUE)]);
  assert.deepEqual(both.map(r => r.status).sort(), [200, 409]);
  assert.equal(rows(env, "SELECT COUNT(*) AS n FROM presentation_reviews")[0].n, 1);
});

test("the client sees only the approved snapshot: later changes and photos stay out, withdrawals and lost availability still apply", async () => {
  const { env, a, asset } = await world();
  const g = await link(env, a), mine = matchOf(env, a, HOME);
  await approved(env, g.id);
  ok(await send(env, g.id));
  const cookie = await session(env, g);
  // After sending: the title and description change, the branded photo becomes suitable.
  run(env, "UPDATE listings SET title = 'Changed title', summary = 'Changed summary' WHERE id = ?", HOME);
  ok(await req(env, "POST", "/admin/photo-permissions", { asset_id: asset("P2"), version: 1, status: "private_approved", basis: "own" }));
  const [o] = ok(await as(env, cookie, "GET", "/presentation/options")).options;
  assert.equal(o.match_id, mine);
  assert.equal(o.offered, true);
  assert.deepEqual([o.listing.title, o.listing.summary, o.listing.rent, o.listing.availability_confirmed_at],
    [`Fixture ${HOME}`, null, 1800, "2026-11-10T09:30:00.000Z"]);
  assert.deepEqual(o.photos.map(p => p.label), ["Front", "Garden"]);
  assert.equal((await as(env, cookie, "GET", `/presentation/photos/${asset("P2")}`)).status, 404); // not in the snapshot
  assert.equal((await as(env, cookie, "GET", `/presentation/photos/${asset("P1")}`)).status, 200);
  // AGE-10's withdrawal still blocks the photo.
  ok(await req(env, "POST", "/admin/photo-permissions", { asset_id: asset("P1"), version: 1, status: "revoked" }));
  assert.deepEqual(ok(await as(env, cookie, "GET", "/presentation/options")).options[0].photos.map(p => p.label), ["Garden"]);
  assert.equal((await as(env, cookie, "GET", `/presentation/photos/${asset("P1")}`)).status, 404);
  // No longer confirmed available: nothing of the home, and no answer.
  await confirm(env, HOME, "unknown", "2026-11-12T09:30:00.000Z");
  const [gone] = ok(await as(env, cookie, "GET", "/presentation/options")).options;
  assert.deepEqual(gone, { match_id: mine, choice: null, answered_at: null, offered: false, listing: null, photos: [] });
  assert.equal((await as(env, cookie, "GET", `/presentation/photos/${asset("P3")}`)).status, 404);
  assert.equal((await as(env, cookie, "POST", "/presentation/respond", { match_id: mine, choice: "interested" })).status, 409);
  // Confirmed again: the answer goes through as AGE-12's.
  await confirm(env, HOME, "available", "2026-11-13T09:30:00.000Z");
  ok(await as(env, cookie, "POST", "/presentation/respond", { match_id: mine, choice: "interested" }));
  assert.deepEqual(rows(env, "SELECT choice FROM presentation_options"), [{ choice: "interested" }]);
});

test("a link sent before the review existed keeps AGE-12's view once switched on", async () => {
  const { env, a } = await world({ review: false });
  const g = await link(env, a);
  ok(await send(env, g.id));
  const cookie = await session(env, g);
  const before = ok(await as(env, cookie, "GET", "/presentation/options"));
  env.AGE11_REVIEW_READY = "1";
  assert.deepEqual(ok(await as(env, cookie, "GET", "/presentation/options")), before);
  assert.equal((await review(env, g.id)).approval, null);
});

// Timestamps, ids of time and tokens differ between two runs.
const plain = data => JSON.parse(JSON.stringify(data).replace(/\d{4}-\d\d-\d\dT[\d:.]+Z/g, "T").replace(/#[A-Za-z0-9_-]{43}/g, "#token"));
async function age12Run(env, a) {
  const out = [];
  const g = await link(env, a);
  out.push(plain(g), plain(ok(await req(env, "GET", `/admin/applicants/${a}/presentations`))));
  out.push(plain(ok(await send(env, g.id))));
  const cookie = await session(env, g);
  out.push(plain(ok(await as(env, cookie, "GET", "/presentation/options"))));
  out.push((await as(env, cookie, "GET", `/presentation/photos/${rows(env, "SELECT id FROM property_capture_assets ORDER BY id")[0].id}`)).status);
  out.push(plain(ok(await as(env, cookie, "POST", "/presentation/respond", { match_id: matchOf(env, a, HOME), choice: "call_me" }))));
  out.push(plain(ok(await req(env, "POST", `/admin/presentations/${g.id}/revoke`, {}))));
  return out;
}

test("off, AGE-12 reads nothing of the review and answers as switched on before migration 0115", async () => {
  const off = await world({ review: false }), seen = captured(off.env, /presentation_reviews/);
  const answers = await age12Run(off.env, off.a);
  assert.deepEqual(seen, []);
  assert.deepEqual(ok(await req(off.env, "GET", "/admin/presentations/1/review")), { enabled: false });
  assert.equal((await approve(off.env, 1, { snapshot_hash: "0".repeat(64), version: 0 })).status, 404);
  const unmigrated = await world({ schema: { skip: [115] } });
  assert.deepEqual(await age12Run(unmigrated.env, unmigrated.a), answers);
  assert.deepEqual(ok(await req(unmigrated.env, "GET", "/admin/presentations/1/review")), { enabled: false });
  assert.equal((await approve(unmigrated.env, 1, { snapshot_hash: "0".repeat(64), version: 0 })).status, 404);
  // AGE-12 off: AGE-11 has nothing to review either.
  const age12off = await world({ presentations: false });
  assert.deepEqual(ok(await req(age12off.env, "GET", "/admin/presentations/1/review")), { enabled: false });
});
