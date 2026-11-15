// AGE-12: a private link to the homes presented to one client, who answers on each without filling in the search
// again. Token kept as a hash, dormant until sent, valid until revoked; photos only AGE-10's suitable ones, checked in
// storage on every read. Synthetic data only.
import test from "node:test";
import assert from "node:assert/strict";
import { makeEnv, seedListing, seedMedia, call, adminCookie, T0 } from "./listing-client.mjs";
import { recomputeForApplicant } from "../../server/match-store.js";
import { extractFeatures } from "../../server/listing-features.js";

const ADMIN = "admin@example.test", HOME = "HE-R001", OTHER = "HE-R002";
const run = (env, sql, ...args) => env.DB.raw.prepare(sql).run(...args);
const rows = (env, sql, ...args) => env.DB.raw.prepare(sql).all(...args).map(r => ({ ...r }));
const req = async (env, method, path, body) => call(env, method, path, { body, cookie: await adminCookie(ADMIN) });
const ok = (r, status = 200) => { assert.equal(r.status, status, JSON.stringify(r.data)); return r.data; };
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);
const GONE = "This link is not available. Please contact Hampton Estates.";

const home = (env, id) => seedListing(env, { id, title: `Fixture ${id}`, operation: "rent", availability: "to_let", rent: 1800, rent_period: "month",
  sale_price: null, bedrooms: 2, bathrooms: 2, housing_category: "registered", matchable: 1, published: 0,
  ...extractFeatures({ description: "Parking for two cars" }), parish: "St Helier", location: "St Helier" });
let contacts = 0;
async function client(env) {
  const c = run(env, "INSERT INTO contacts (name, email, phone, last_activity_at, created_at, updated_at) VALUES ('Fixture Client', ?, ?, ?, ?, ?)",
    `age12-${++contacts}@example.test`, `+44770090${String(contacts).padStart(4, "0")}`, T0, T0, T0);
  const a = Number(run(env, `INSERT INTO applicants (contact_id, operation, stage, source, budget_max, bedrooms_min, parking_spaces, pets,
    household_adults, household_children, household_total, created_at, updated_at, requirement_priorities, viewing_availability) VALUES (?, 'rent',
    'searching', 'phone', 2000, 2, 2, '[{"kind":"none"}]', 2, 0, 2, ?, ?, ?, ?)`, Number(c.lastInsertRowid), T0, T0,
    JSON.stringify({ version: 1, values: { budget: "must", bedrooms: "must", parking: "must" }, unknown: [] }),
    JSON.stringify([{ day: "sat", start: "10:00", end: "12:00" }])).lastInsertRowid);
  await recomputeForApplicant(env, a, "system");
  return a;
}
const matchOf = (env, a, listing) => rows(env, "SELECT id FROM matches WHERE applicant_id = ? AND listing_id = ?", a, listing)[0].id;
const shortlist = async (env, id) => ok(await req(env, "PUT", `/admin/matches/${id}`, { status: "shortlisted", from: "found" }));

// Two homes, the first confirmed available and captured with three photos: one suitable, one branded, one suitable
// but changed in storage later. Two clients approved on the first; the second home is approved but not confirmed.
async function world({ ready = true, schema } = {}) {
  const env = makeEnv(schema);
  Object.assign(env, { EST16_AVAILABILITY_READY: "1", SPR03_CAPTURE_READY: "1", AGE10_PHOTOS_READY: "1", SAP02_COUNTS_READY: "1" },
    ready && { AGE12_PRESENTATIONS_READY: "1" });
  home(env, HOME); home(env, OTHER);
  for (const [id, label, pos] of [["P1", "Front", 0], ["P2", "Branded", 1], ["P3", "Garden", 2]]) {
    seedMedia(env, { id, r2_key: `uploads/${id}.png`, position: pos, label, origin: "upload", created_by: ADMIN, public: 0 });
    env.MEDIA.store.set(`uploads/${id}.png`, { body: PNG, type: "image/png" });
  }
  ok(await req(env, "POST", `/admin/listings/${HOME}/availability`, { status: "available", confirmed_at: "2026-11-10T09:30:00.000Z",
    source: "owner", channel: "phone", evidence_ref: "Call note FIXTURE", scope: "property" }), 201);
  const asset = media => rows(env, "SELECT id FROM property_capture_assets WHERE media_id = ?", media)[0].id;
  for (const [media, body] of [["P1", { status: "private_approved", basis: "own" }], ["P2", { status: "branded" }],
    ["P3", { status: "private_approved", basis: "own" }]])
    ok(await req(env, "POST", "/admin/photo-permissions", { asset_id: asset(media), version: 0, ...body }));
  const a = await client(env), b = await client(env);
  for (const m of [matchOf(env, a, HOME), matchOf(env, a, OTHER), matchOf(env, b, HOME)]) await shortlist(env, m);
  return { env, a, b, asset };
}
const create = async (env, a, matches) => req(env, "POST", `/admin/applicants/${a}/presentations`, { match_ids: matches });
const tokenOf = link => new URL(link).hash.slice(1);
async function sentLink(env, a) {
  const g = ok(await create(env, a, [matchOf(env, a, HOME)]), 201);
  ok(await req(env, "POST", `/admin/presentations/${g.id}/sent`, {}));
  return g;
}
const redeem = (env, token) => call(env, "POST", "/presentation/session", { body: { token } });
async function session(env, token) {
  const r = await redeem(env, token);
  assert.equal(r.status, 200, r.text);
  return r.headers.get("set-cookie").split(";")[0];
}
const as = (env, cookie, method, path, body) => call(env, method, path, { body, cookie });

test("switched off, or before migration 0086, the panel says so and every client route answers 404", async () => {
  for (const [ready, schema] of [[false, undefined], [true, { through: 85 }]]) {
    const { env, a } = await world({ ready, schema });
    assert.deepEqual(ok(await req(env, "GET", `/admin/applicants/${a}/presentations`)), { enabled: false });
    assert.equal((await create(env, a, [matchOf(env, a, HOME)])).status, 404);
    assert.equal((await redeem(env, "x".repeat(43))).status, 404);
    assert.equal((await call(env, "GET", "/presentation/options")).status, 404);
  }
});

test("a link keeps only its token's hash, is dormant until a person records sending it, and offers only confirmed approved homes", async () => {
  const { env, a, b } = await world();
  const panel = ok(await req(env, "GET", `/admin/applicants/${a}/presentations`));
  assert.deepEqual(panel.presentable.map(o => o.listing_id), [HOME]); // the second home has no confirmation in force
  // Not presentable: a home without confirmation, another client's match, nothing at all.
  assert.equal((await create(env, a, [matchOf(env, a, OTHER)])).status, 409);
  assert.equal((await create(env, a, [matchOf(env, b, HOME)])).status, 409);
  assert.equal((await create(env, a, [])).status, 400);
  const g = ok(await create(env, a, [matchOf(env, a, HOME)]), 201), token = tokenOf(g.link);
  assert.match(token, /^[A-Za-z0-9_-]{43}$/); // 256 random bits
  assert.equal(new URL(g.link).pathname, "/presentation");
  const [stored] = rows(env, "SELECT * FROM presentation_grants");
  assert.equal(stored.expires_at, null);
  assert.ok(!JSON.stringify(rows(env, "SELECT * FROM presentation_grants")).includes(token));
  assert.equal(stored.token_hash.length, 64);
  // Dormant: the same generic answer as an unknown token.
  const dormant = await redeem(env, token);
  assert.equal(dormant.status, 404);
  assert.equal(dormant.data.error, GONE);
  assert.equal((await redeem(env, "A".repeat(43))).data.error, GONE);
  ok(await req(env, "POST", `/admin/presentations/${g.id}/sent`, {}));
  const r = await redeem(env, token);
  assert.equal(r.status, 200);
  assert.match(r.headers.get("set-cookie"), /^__Host-hp=[^;]+; Path=\/; HttpOnly; Secure; SameSite=Strict; Max-Age=604800$/);
  for (const h of [["cache-control", "no-store"], ["x-robots-tag", "noindex"], ["referrer-policy", "no-referrer"]])
    assert.equal(r.headers.get(h[0]), h[1]);
  // The same link can be redeemed again (a new 7-day session) while it is not revoked.
  assert.equal((await redeem(env, token)).status, 200);
  // The panel never shows the token again.
  assert.ok(!JSON.stringify(ok(await req(env, "GET", `/admin/applicants/${a}/presentations`))).includes(token));
});

test("the client sees only the homes of their link and AGE-10's suitable photos, checked in storage when served", async () => {
  const { env, a, b, asset } = await world();
  const cookie = await session(env, tokenOf((await sentLink(env, a)).link));
  await sentLink(env, b); // another client's link, on the same home
  const r = await as(env, cookie, "GET", "/presentation/options");
  assert.equal(r.headers.get("cache-control"), "no-store");
  const data = ok(r);
  assert.deepEqual(data.options.map(o => [o.match_id, o.listing.id, o.choice]), [[matchOf(env, a, HOME), HOME, null]]);
  assert.deepEqual(data.options[0].photos.map(p => p.label), ["Front", "Garden"]); // never the branded one
  assert.ok(!JSON.stringify(data).includes("age12-")); // no contact details of anyone
  assert.equal(data.options.length, 1); // not the other client's
  const photo = id => as(env, cookie, "GET", `/presentation/photos/${id}`);
  const shown = await photo(asset("P1"));
  assert.equal(shown.status, 200);
  assert.equal(shown.headers.get("content-type"), "image/png");
  assert.equal(shown.headers.get("cache-control"), "no-store");
  assert.equal((await photo(asset("P2"))).status, 404); // branded: internal only
  // Changed in storage since SPR-03 checked it: not served, though its decision still reads as suitable.
  env.MEDIA.store.set("uploads/P3.png", { body: PNG, type: "image/png", etag: "other" });
  assert.equal((await photo(asset("P3"))).status, 404);
  // AGE-10's withdrawal blocks the next read.
  ok(await req(env, "POST", "/admin/photo-permissions", { asset_id: asset("P1"), version: 1, status: "revoked" }));
  assert.equal((await photo(asset("P1"))).status, 404);
  // Without a session, or with a forged one, nothing.
  assert.equal((await call(env, "GET", `/presentation/photos/${asset("P3")}`)).status, 404);
  // A signature changed in its first character (the last one's low bits are padding, which decoding ignores).
  assert.equal((await as(env, cookie.replace(/\.(\d+)\.(.)/, (_, exp, c) => `.${exp}.${c === "A" ? "B" : "A"}`), "GET", "/presentation/options")).status, 404);
  assert.equal((await as(env, cookie.replace(/^__Host-hp=\d+/, "__Host-hp=2"), "GET", "/presentation/options")).status, 404);
});

test("an answer is one explicit POST per home: not for me touches only this client's match, a viewing request is not a booking", async () => {
  const { env, a, b } = await world();
  const cookie = await session(env, tokenOf((await sentLink(env, a)).link)), mine = matchOf(env, a, HOME), theirs = matchOf(env, b, HOME);
  const before = { matches: rows(env, "SELECT id, status, reject_reason FROM matches ORDER BY id"), search: rows(env, "SELECT * FROM applicants ORDER BY id"),
    listing: rows(env, "SELECT * FROM listings ORDER BY id"), viewings: rows(env, "SELECT COUNT(*) AS n FROM viewing_requests")[0].n };
  // Reading answers nothing.
  ok(await as(env, cookie, "GET", "/presentation/options"));
  assert.equal(rows(env, "SELECT COUNT(*) AS n FROM presentation_options WHERE choice IS NOT NULL")[0].n, 0);
  assert.equal((await as(env, cookie, "POST", "/presentation/respond", { match_id: mine, choice: "maybe" })).status, 400);
  assert.equal((await as(env, cookie, "POST", "/presentation/respond", { match_id: theirs, choice: "not_for_me" })).status, 404);
  const answered = ok(await as(env, cookie, "POST", "/presentation/respond", { match_id: mine, choice: "not_for_me", reason: "Too far from work" }));
  assert.equal(answered.option.choice, "not_for_me");
  // Twice (a double click): one answer, one event, one task.
  assert.equal((await as(env, cookie, "POST", "/presentation/respond", { match_id: mine, choice: "interested" })).status, 409);
  assert.deepEqual(rows(env, "SELECT choice, reason FROM presentation_options"), [{ choice: "not_for_me", reason: "Too far from work" }]);
  assert.equal(rows(env, "SELECT COUNT(*) AS n FROM events WHERE type = 'applicant.presentation_answered'")[0].n, 1);
  assert.deepEqual(rows(env, "SELECT title, target_kind, target_id, resolved_at FROM notifications WHERE task_key LIKE 'presentation:%'"),
    [{ title: `Client says ${HOME} is not for them`, target_kind: "applicant", target_id: String(a), resolved_at: null }]);
  // Nothing else changed: no match (theirs or mine), no criteria, no availability, no viewing.
  assert.deepEqual(rows(env, "SELECT id, status, reject_reason FROM matches ORDER BY id"), before.matches);
  assert.deepEqual(rows(env, "SELECT * FROM applicants ORDER BY id"), before.search);
  assert.deepEqual(rows(env, "SELECT * FROM listings ORDER BY id"), before.listing);
  assert.equal(rows(env, "SELECT COUNT(*) AS n FROM viewing_requests")[0].n, before.viewings);

  // A viewing request starts coordination with the times already on file; it books nothing.
  const { env: env2, a: a2 } = await world();
  const c2 = await session(env2, tokenOf((await sentLink(env2, a2)).link));
  ok(await as(env2, c2, "POST", "/presentation/respond", { match_id: matchOf(env2, a2, HOME), choice: "request_viewing" }));
  const [task] = rows(env2, "SELECT title, task_reason FROM notifications WHERE task_key LIKE 'presentation:%'");
  assert.equal(task.title, `Arrange a viewing of ${HOME} for the client`);
  assert.match(task.task_reason, /viewing times already on their search/);
  assert.equal(rows(env2, "SELECT COUNT(*) AS n FROM viewing_requests")[0].n, 0);
});

test("a revocation blocks every later read, the session's and the link's", async () => {
  const { env, a, asset } = await world();
  const g = await sentLink(env, a), token = tokenOf(g.link), cookie = await session(env, token);
  ok(await req(env, "POST", `/admin/presentations/${g.id}/revoke`, {}));
  assert.equal((await as(env, cookie, "GET", "/presentation/options")).status, 404);
  assert.equal((await as(env, cookie, "GET", `/presentation/photos/${asset("P1")}`)).status, 404);
  assert.equal((await as(env, cookie, "POST", "/presentation/respond", { match_id: matchOf(env, a, HOME), choice: "interested" })).status, 404);
  assert.equal((await redeem(env, token)).status, 404);
  assert.equal(rows(env, "SELECT COUNT(*) AS n FROM presentation_options WHERE choice IS NOT NULL")[0].n, 0);
  // A revoked link cannot be marked as sent again.
  assert.equal((await req(env, "POST", `/admin/presentations/${g.id}/sent`, {})).status, 409);
  const panel = ok(await req(env, "GET", `/admin/applicants/${a}/presentations`));
  assert.equal(panel.grants[0].revoked_by, ADMIN);
});

test("EST-04: In process counts a home presented and waiting for the client's answer", async () => {
  const { env, a } = await world();
  const waiting = async () => ok(await req(env, "GET", `/admin/applicants/${a}/matches?status=shortlisted&only=waiting_applicant`));
  assert.equal((await waiting()).counts.shortlisted, 0); // a dormant link waits for nobody
  const cookie = await session(env, tokenOf((await sentLink(env, a)).link));
  const w = await waiting();
  assert.equal(w.counts.shortlisted, 1);
  assert.equal(w.summary.waiting_applicant, 1);
  const list = ok(await req(env, "GET", "/admin/applicants"));
  assert.equal(list.applicants.find(x => x.id === a).in_process, 1);
  ok(await as(env, cookie, "POST", "/presentation/respond", { match_id: matchOf(env, a, HOME), choice: "interested" }));
  assert.equal((await waiting()).counts.shortlisted, 0);
});

test("switched on before migration 0086, the list and the match pages answer as switched off, enquiries' In process kept", async () => {
  const answers = [];
  for (const [ready, schema] of [[false, undefined], [true, { through: 85 }]]) {
    const { env, a } = await world({ ready, schema });
    env.AGE03_ENQUIRIES_READY = "1";
    const agency = ok(await req(env, "POST", "/admin/advertisers", { name: "Fixture Agency", kind: "agency", channels: [], source_ids: [],
      listing_ids: [HOME], commission: "", photo_permission: "", contacts: [{ name: "Desk", email: "desk@agency.example.test", phones: [] }] }), 201).advertiser.id;
    ok(await req(env, "POST", `/admin/matches/${matchOf(env, a, HOME)}/consultation`, { operation_id: crypto.randomUUID(), kind: "general",
      advertiser_id: agency }), 201);
    const list = ok(await req(env, "GET", "/admin/applicants")), page = ok(await req(env, "GET",
      `/admin/applicants/${a}/matches?status=shortlisted&only=waiting_applicant`));
    answers.push({ in_process: list.in_process, mine: list.applicants.find(x => x.id === a).in_process, counts: page.counts, summary: page.summary,
      shown: page.matches.length, filtered: ok(await req(env, "GET", "/admin/applicants?work_label=in_process")).applicants.map(x => x.id) });
  }
  assert.equal(answers[0].mine, 1);
  assert.deepEqual(answers[1], answers[0]);
});

test("a home no longer offered stops waiting for the client and is shown only as no longer available, without its photos", async () => {
  const { env, a, asset } = await world();
  const cookie = await session(env, tokenOf((await sentLink(env, a)).link));
  const waiting = async () => ok(await req(env, "GET", `/admin/applicants/${a}/matches?status=shortlisted&only=waiting_applicant`)).counts.shortlisted;
  assert.equal(await waiting(), 1);
  run(env, "UPDATE listings SET archived_at = ? WHERE id = ?", "2026-11-14T10:00:00.000Z", HOME);
  assert.equal(await waiting(), 0);
  assert.equal(ok(await req(env, "GET", "/admin/applicants")).applicants.find(x => x.id === a).in_process, 0);
  const [o] = ok(await as(env, cookie, "GET", "/presentation/options")).options;
  assert.deepEqual(o, { match_id: matchOf(env, a, HOME), choice: null, answered_at: null, offered: false, listing: null, photos: [] });
  assert.equal((await as(env, cookie, "GET", `/presentation/photos/${asset("P1")}`)).status, 404);
});

test("only JPEG, PNG and WebP photos are served, never SVG", async () => {
  const { env, a, asset } = await world();
  const cookie = await session(env, tokenOf((await sentLink(env, a)).link));
  for (const [type, status] of [["image/webp", 200], ["image/svg+xml", 404], ["image/gif", 404], ["image/jpeg", 200]]) {
    env.MEDIA.store.set("uploads/P1.png", { body: PNG, type });
    assert.equal((await as(env, cookie, "GET", `/presentation/photos/${asset("P1")}`)).status, status, type);
  }
});
