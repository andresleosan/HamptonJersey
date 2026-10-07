import test from "node:test";
import assert from "node:assert/strict";
import { makeEnv, seedListing, seedMedia, call, adminCookie, T0 } from "./helpers.mjs";

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1]);
async function world() {
  const env = makeEnv();
  seedListing(env);
  seedListing(env, { id: "HE-R026", title: "Brittany", country: "France", published: 0 });
  seedMedia(env);
  seedMedia(env, { id: "A00002", r2_key: "media/external/e.jpg", thumb_key: null, origin: "external", public: 0, position: 1 });
  env.DB.raw.prepare("INSERT INTO research_properties (property_id, match_status, duplicate_group) VALUES ('HE-R001', 'exact_property', 'g1'), ('HE-R013', 'probable', 'g1'), ('HE-R027', 'none', NULL)").run();
  env.DB.raw.prepare("INSERT INTO research_issues (issue_id, property_ids, issue) VALUES ('I1', 'HE-R001; HE-R013', 'Possible duplicate')").run();
  return { env, cookie: await adminCookie() };
}

test("admin routes need a valid session of a listed admin", async () => {
  const { env } = await world();
  assert.equal((await call(env, "GET", "/admin/listings")).status, 401);
  assert.equal((await call(env, "GET", "/admin/listings", { cookie: await adminCookie("intruder@x.com") })).status, 401);
  assert.equal((await call(env, "GET", "/admin/listings", { cookie: "__Host-hs=forged.sig" })).status, 401);
  assert.equal((await call(env, "GET", "/me", { cookie: await adminCookie() })).data.email, "luismadef45@gmail.com");
});

test("session: missing or invalid Google token", async () => {
  const { env } = await world();
  assert.equal((await call(env, "POST", "/session", { body: {} })).status, 400);
  assert.equal((await call(env, "POST", "/session", { body: { idToken: "not-a-jwt" } })).status, 401);
  const out = await call(env, "DELETE", "/session");
  assert.match(out.headers.get("set-cookie"), /__Host-hs=; Path=\/; HttpOnly; Secure; SameSite=Strict; Max-Age=0/);
});

test("list and detail include cover, research, issues and duplicate warning", async () => {
  const { env, cookie } = await world();
  const list = (await call(env, "GET", "/admin/listings", { cookie })).data.listings;
  assert.deepEqual(list.map(l => l.id), ["HE-R001", "HE-R026"]);
  assert.equal(list[0].cover_id, "A00001");
  const d = (await call(env, "GET", "/admin/listings/HE-R001", { cookie })).data;
  assert.deepEqual(d.media.map(m => m.id), ["A00001", "A00002"]);
  assert.equal(d.research.match_status, "exact_property");
  assert.deepEqual(d.duplicates, ["HE-R013"]);
  assert.equal(d.issues.length, 1);
  assert.deepEqual(d.listing.specs, []);
  assert.equal((await call(env, "GET", "/admin/listings/HE-R999", { cookie })).status, 404);
});

test("create assigns the next free id, skipping ids used by research", async () => {
  const { env, cookie } = await world();
  const r = await call(env, "POST", "/admin/listings", { cookie, body: { title: "New home", use: "residential", operation: "sale", availability: "for_sale", country: "Jersey" } });
  assert.equal(r.status, 201);
  assert.equal(r.data.id, "HE-R028");   // HE-R027 exists in research
  const row = await env.DB.prepare("SELECT published, updated_by FROM listings WHERE id = 'HE-R028'").first();
  assert.deepEqual({ ...row }, { published: 0, updated_by: "luismadef45@gmail.com" });
  assert.equal((await call(env, "POST", "/admin/listings", { cookie, body: { title: "" } })).status, 400);
});

test("update: validates, ignores locked fields, and refuses stale saves with 409", async () => {
  const { env, cookie } = await world();
  const ok = await call(env, "PUT", "/admin/listings/HE-R001", { cookie, body: { title: "Renamed", published: 0, updated_at: T0 } });
  assert.equal(ok.status, 200);
  assert.equal(ok.data.listing.title, "Renamed");
  assert.equal(ok.data.listing.published, 1);
  const stale = await call(env, "PUT", "/admin/listings/HE-R001", { cookie, body: { title: "Other", updated_at: T0 } });
  assert.equal(stale.status, 409);
  const bad = await call(env, "PUT", "/admin/listings/HE-R001", { cookie, body: { sale_price: 0, updated_at: ok.data.listing.updated_at } });
  assert.equal(bad.status, 400);
  assert.ok(bad.data.fields.sale_price);
  assert.equal((await call(env, "PUT", "/admin/listings/HE-R001", { cookie, body: { title: "x" } })).status, 400);
});

test("archive → cannot publish → restore → delete only when archived and confirmed", async () => {
  const { env, cookie } = await world();
  const fd = new FormData();
  fd.append("file", new File([JPEG], "a.jpg")); fd.append("thumb", new File([JPEG], "t.jpg"));
  const up = await call(env, "POST", "/admin/listings/HE-R001/media", { cookie, form: fd });
  assert.equal((await call(env, "DELETE", "/admin/listings/HE-R001", { cookie, body: { confirm: "HE-R001" } })).status, 400);
  const arch = await call(env, "POST", "/admin/listings/HE-R001/archive", { cookie });
  assert.equal(arch.data.listing.published, 0);
  assert.ok(arch.data.listing.archived_at);
  assert.equal((await call(env, "POST", "/admin/listings/HE-R001/publish", { cookie })).status, 400);
  assert.equal((await call(env, "DELETE", "/admin/listings/HE-R001", { cookie, body: { confirm: "nope" } })).status, 400);
  assert.equal((await call(env, "DELETE", "/admin/listings/HE-R001", { cookie, body: { confirm: "HE-R001" } })).status, 200);
  assert.equal(await env.DB.prepare("SELECT 1 FROM listings WHERE id = 'HE-R001'").first(), null);
  assert.equal((await env.DB.prepare("SELECT deleted_by FROM deleted_listings WHERE id = 'HE-R001'").first()).deleted_by, "luismadef45@gmail.com");
  assert.equal(env.MEDIA.store.has(up.data.media.r2_key), false);
  const r = await call(env, "POST", "/admin/listings/HE-R026/archive", { cookie });
  assert.equal((await call(env, "POST", "/admin/listings/HE-R026/restore", { cookie })).data.listing.archived_at, null);
  assert.ok(r);
});

test("media: reorder, cover, kinds; external can never be made public; stale saves get 409", async () => {
  const { env, cookie } = await world();
  const items = [{ id: "A00002", position: 0, public: false, kind: "document", label: "Brochure" },
    { id: "A00001", position: 1, public: true, kind: "photo", label: "Kitchen" }];
  const put = (body) => call(env, "PUT", "/admin/listings/HE-R001/media", { cookie, body });
  assert.equal((await put({ items, cover_media_id: "A00001" })).status, 400);              // no updated_at
  const r = await put({ items, cover_media_id: "A00001", updated_at: T0 });
  assert.equal(r.status, 200);
  assert.deepEqual(r.data.media.map(m => m.id), ["A00002", "A00001"]);
  assert.notEqual(r.data.listing.updated_at, T0);
  assert.equal(r.data.listing.cover_media_id, "A00001");
  // Another admin, editor opened before that save: refused, nothing overwritten.
  const stale = await put({ items: [{ ...items[1], public: false }], cover_media_id: null, updated_at: T0 });
  assert.equal(stale.status, 409);
  assert.equal((await env.DB.prepare("SELECT public FROM media WHERE id = 'A00001'").first()).public, 1);
  const ts = r.data.listing.updated_at;
  items[0].public = true;
  assert.match((await put({ items, updated_at: ts })).data.error, /externas/);
  assert.equal((await put({ items: [{ ...items[1], id: "ZZZ" }], updated_at: ts })).status, 400);
  assert.equal((await put({ items: [items[1]], cover_media_id: "A00002", updated_at: ts })).status, 400);
});

test("upload accepts real images only; delete only removes uploads", async () => {
  const { env, cookie } = await world();
  const fd = (bytes) => { const f = new FormData(); f.append("file", new File([bytes], "x")); f.append("thumb", new File([bytes], "t")); f.append("label", "Garden"); f.append("width", "1600"); f.append("height", "1067"); return f; };
  const up = await call(env, "POST", "/admin/listings/HE-R001/media", { cookie, form: fd(JPEG) });
  assert.equal(up.status, 201);
  const m = up.data.media;
  assert.deepEqual([m.origin, m.public, m.position, m.width, m.label], ["upload", 1, 2, 1600, "Garden"]);
  assert.ok(env.MEDIA.store.has(m.r2_key) && env.MEDIA.store.has(m.thumb_key));
  assert.equal((await call(env, "POST", "/admin/listings/HE-R001/media", { cookie, form: fd(new TextEncoder().encode("<svg onload=x>")) })).status, 400);
  assert.equal((await call(env, "DELETE", "/admin/media/A00001", { cookie })).status, 400);
  assert.equal((await call(env, "DELETE", `/admin/media/${m.id}`, { cookie })).status, 200);
  assert.equal(env.MEDIA.store.has(m.r2_key), false);
});

test("viewings inbox: list with counts, change status, delete", async () => {
  const { env, cookie } = await world();
  env.DB.raw.prepare("INSERT INTO viewing_requests (listing_id, kind, date, time, name, email, created_at) VALUES ('HE-R001', 'In person', '2030-01-02', '10:00', 'Jane', 'j@x.je', ?)").run(T0);
  const l = (await call(env, "GET", "/admin/viewings?status=new", { cookie })).data;
  assert.equal(l.viewings[0].listing_title, "Le Bernage");
  assert.deepEqual(l.counts, { new: 1, contacted: 0, closed: 0 });
  assert.equal((await call(env, "PUT", "/admin/viewings/1", { cookie, body: { status: "bogus" } })).status, 400);
  assert.equal((await call(env, "PUT", "/admin/viewings/1", { cookie, body: { status: "contacted" } })).status, 200);
  assert.equal((await call(env, "GET", "/admin/viewings?status=contacted", { cookie })).data.viewings.length, 1);
  assert.equal((await call(env, "DELETE", "/admin/viewings/1", { cookie })).status, 200);
  assert.equal((await call(env, "DELETE", "/admin/viewings/1", { cookie })).status, 404);
});

test("users: add, refuse self-removal, remove others", async () => {
  const { env, cookie } = await world();
  assert.equal((await call(env, "POST", "/admin/users", { cookie, body: { email: " New@Hampton.je " } })).status, 201);
  assert.ok((await call(env, "GET", "/admin/users", { cookie })).data.users.some(u => u.email === "new@hampton.je"));
  assert.equal((await call(env, "POST", "/admin/users", { cookie, body: { email: "bad" } })).status, 400);
  assert.equal((await call(env, "DELETE", "/admin/users/luismadef45%40gmail.com", { cookie })).status, 400);
  assert.equal((await call(env, "DELETE", "/admin/users/new%40hampton.je", { cookie })).status, 200);
  assert.equal((await call(env, "DELETE", "/admin/users/new%40hampton.je", { cookie })).status, 404);
});

test("a price needs its currency, and rent needs its period", async () => {
  const { env, cookie } = await world();
  const base = { title: "Shop", use: "commercial", operation: "business", availability: "for_sale", country: "Jersey" };
  const created = await call(env, "POST", "/admin/listings", { cookie, body: { ...base, premium: 50000 } });
  assert.equal(created.status, 400);
  assert.ok(created.data.fields.currency);
  assert.equal((await call(env, "POST", "/admin/listings", { cookie, body: { ...base, premium: 50000, currency: "GBP" } })).status, 201);
  // Partial update is checked against the stored row: HE-R026 has no currency stored.
  env.DB.raw.prepare("UPDATE listings SET currency = NULL, sale_price = NULL WHERE id = 'HE-R026'").run();
  const bad = await call(env, "PUT", "/admin/listings/HE-R026", { cookie, body: { sale_price: 200000, updated_at: T0 } });
  assert.equal(bad.status, 400);
  assert.ok(bad.data.fields.currency);
  const rent = await call(env, "PUT", "/admin/listings/HE-R001", { cookie, body: { operation: "rent", rent: 1500, updated_at: T0 } });
  assert.ok(rent.data.fields.rent_period);
  assert.equal((await call(env, "PUT", "/admin/listings/HE-R001", { cookie, body: { operation: "rent", rent: 1500, rent_period: "month", updated_at: T0 } })).status, 200);
});

