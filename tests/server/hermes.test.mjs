import test from "node:test";
import assert from "node:assert/strict";
import { makeEnv, seedListing, call, adminCookie, ORIGIN, T0 } from "./helpers.mjs";

// AUT-13 (spec 2026-10-31): Hermes's door. Its own key, six fixed operations, public data and counts only.
const KEY = "hermes-test-key-hermes-test-key-0123456789";
const ADMIN = "luismadef45@gmail.com";
const env0 = () => ({ ...makeEnv(), HERMES_KEY: KEY });
// Hermes calls from the VPS through the key's custodian: no Origin, no cookie.
const door = (env, method, path, body) => call(env, method, `/hermes${path}`, { body, bearer: KEY, origin: null });
const admin = async (env, method, path, body) => call(env, method, path, { body, cookie: await adminCookie() });
const row = (env, sql, ...args) => ({ ...env.DB.raw.prepare(sql).get(...args) });
const run = (env, sql, ...args) => env.DB.raw.prepare(sql).run(...args);
const at = (t, iso) => t.mock.timers.enable({ apis: ["Date"], now: Date.parse(iso) });

const insert = (env, table, o) => {
  const cols = Object.keys(o);
  return Number(env.DB.raw.prepare(`INSERT INTO ${table} (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`)
    .run(...cols.map(c => o[c])).lastInsertRowid);
};
const notice = (env, { entity_type, entity_id, category, title, action_required = 1, type = "x" }) => insert(env, "notifications", {
  event_id: insert(env, "events", { at: T0, actor: "public", entity_type, entity_id: String(entity_id), type }),
  category, title, action_required, created_at: T0 });
// A registration and a viewing request from the website, with recognisable personal data.
function people(env) {
  const contact = insert(env, "contacts", { name: "Zelda Quarrington", email: "zelda@private.je", phone: "+447700900321",
    last_activity_at: T0, created_at: T0, updated_at: T0 });
  const applicant = insert(env, "applicants", { contact_id: contact, operation: "rent", source: "web", created_at: T0, updated_at: T0 });
  const viewing = insert(env, "viewing_requests", { listing_id: "HE-R001", kind: "In person", date: "2026-11-02", time: "11:30",
    name: "Ottoline Pryke", email: "otto@private.je", phone: "07700 900654", created_at: T0 });
  const n1 = notice(env, { entity_type: "applicant", entity_id: applicant, category: "new_applicant",
    title: "New applicant: Zelda Quarrington · To rent", type: "applicant.created" });
  const n2 = notice(env, { entity_type: "viewing", entity_id: viewing, category: "viewing",
    title: "Viewing request: Ottoline Pryke", type: "viewing.requested" });
  return { applicant, viewing, n1, n2 };
}
const SECRETS = ["Zelda", "Quarrington", "zelda@", "900321", "Ottoline", "Pryke", "otto@", "900654"];

test("the door opens only with the key", async () => {
  const env = env0();
  const cookie = await adminCookie();
  assert.equal((await call(env, "GET", "/hermes/status", { origin: null })).status, 401, "no key");
  assert.equal((await call(env, "GET", "/hermes/status", { bearer: "x".repeat(40), origin: null })).status, 401, "wrong key");
  assert.equal((await call(env, "GET", "/hermes/status", { cookie })).status, 401, "the panel's session is not the key");
  assert.equal((await call(env, "POST", "/hermes/pause", { cookie })).status, 401);
  assert.equal((await door(env, "GET", "/status")).status, 200);
  for (const key of [undefined, "short-key"]) {
    const e = { ...env0(), HERMES_KEY: key };
    assert.equal((await call(e, "GET", "/hermes/status", { bearer: key ?? "undefined", origin: null })).status, 401,
      "no key configured, or one too short: the door is closed");
  }
});

test("the key opens nothing but the door's six operations", async () => {
  const env = env0();
  seedListing(env);
  for (const [m, p] of [["GET", "/admin/listings"], ["POST", "/admin/listings/HE-R001/publish"],
    ["POST", "/admin/outbound/resume"], ["GET", "/admin/notifications/counts"]])
    assert.equal((await call(env, m, p, { bearer: KEY })).status, 401, `${m} ${p}`);
  for (const [m, p] of [["POST", "/resume"], ["POST", "/jobs/1/use"], ["POST", "/jobs/1/approve"], ["GET", "/listings"],
    ["DELETE", "/jobs/1"], ["GET", "/jobs/next"], ["POST", "/status"]])
    assert.equal((await door(env, m, p)).status, 404, `${m} ${p}`);
  assert.equal((await door(env, "GET", "/status")).headers.get("cache-control"), "no-store");
});

test("status: the panel's counts, the listings to confirm and a fixed summary, without personal data", async t => {
  at(t, "2026-10-31T08:00:00.000Z");
  const env = env0();
  seedListing(env, { id: "HE-R001", title: "Le Bernage", confirmed_at: "2026-01-01T00:00:00.000Z" });
  seedListing(env, { id: "HE-R002", title: "Fresh one", confirmed_at: "2026-10-30T00:00:00.000Z" });
  people(env);
  const { status, data } = await door(env, "GET", "/status");
  assert.equal(status, 200);
  assert.equal(data.counts.new_applicant, 1);
  assert.equal(data.counts.viewing, 1);
  assert.equal(data.counts.to_confirm, 1);
  assert.equal(data.drafts_waiting, 0);
  assert.deepEqual(data.to_confirm_listings, [{ id: "HE-R001", title: "Le Bernage", link: `${ORIGIN}/admin/#/p/HE-R001` }]);
  assert.equal(data.outbound, null);
  assert.match(data.summary, /^Hampton summary/);
  assert.match(data.summary, /1 new applicant/);
  assert.match(data.summary, /To confirm: HE-R001 Le Bernage/);
  assert.match(data.summary, new RegExp(`Open the panel: ${ORIGIN}/admin/`));
  const text = JSON.stringify(data);
  for (const s of SECRETS) assert.ok(!text.includes(s), `status leaks ${s}`);
});

test("status with nothing waiting says so", async () => {
  const { data } = await door(env0(), "GET", "/status");
  assert.match(data.summary, /Nothing waiting\./);
});

test("news: a fixed text and a panel link per new website notice, never who", async () => {
  const env = env0();
  seedListing(env, { id: "HE-R001", title: "23 Le Bernage" });
  const first = await door(env, "GET", "/news");
  assert.deepEqual(first.data, { items: [], cursor: 0 }, "without after: no history, just the cursor");
  const { applicant, n1, n2 } = people(env);
  // A general enquiry, a notice the team made in the panel and a match: not news for Telegram.
  const general = insert(env, "viewing_requests", { kind: "In person", date: "2026-11-03", time: "10:00", name: "Ottoline Pryke",
    phone: "07700 900654", created_at: T0 });
  const n3 = notice(env, { entity_type: "viewing", entity_id: general, category: "viewing", title: "Viewing request: Ottoline Pryke",
    type: "viewing.requested" });
  notice(env, { entity_type: "applicant", entity_id: applicant, category: "new_applicant", title: "New applicant: Zelda",
    action_required: 0 });
  notice(env, { entity_type: "applicant", entity_id: applicant, category: "matched", title: "Zelda matched" });
  const { status, data } = await door(env, "GET", "/news?after=0");
  assert.equal(status, 200);
  assert.deepEqual(data.items, [
    { id: n1, text: "New applicant", link: `${ORIGIN}/admin/#/` },
    { id: n2, text: "New viewing request for 23 Le Bernage", link: `${ORIGIN}/admin/#/viewings` },
    { id: n3, text: "New viewing request", link: `${ORIGIN}/admin/#/viewings` },
  ]);
  assert.equal(data.cursor, n3 + 2, "the cursor passes the notices that are not news");
  const text = JSON.stringify(data);
  for (const s of [...SECRETS, `applicants/${applicant}`]) assert.ok(!text.includes(s), `news leaks ${s}`);
  assert.deepEqual((await door(env, "GET", `/news?after=${data.cursor}`)).data, { items: [], cursor: data.cursor });
  assert.equal((await door(env, "GET", "/news?after=abc")).status, 400);
});

test("jobs: Hermes asks for a listing text, takes it with the listing's public fields, returns a draft", async t => {
  at(t, "2026-10-31T09:00:00.000Z");
  const env = env0();
  seedListing(env, { id: "HE-R001", title: "Le Bernage", road_name: "Rue Secrète", summary: "Garden\nGarage" });
  run(env, "INSERT INTO research_properties (property_id) VALUES ('HE-R001')");
  assert.equal((await door(env, "POST", "/jobs", { kind: "listing_text", listing: "HE-X999" })).status, 404);
  assert.equal((await door(env, "POST", "/jobs", { kind: "post", listing: "HE-R001" })).status, 400);
  const made = await door(env, "POST", "/jobs", { kind: "listing_text", listing: "HE-R001" });
  assert.equal(made.status, 201);
  const again = await door(env, "POST", "/jobs", { kind: "listing_text", listing: "HE-R001" });
  assert.deepEqual([again.status, again.data.id], [409, made.data.id], "one open job per listing");
  assert.equal(row(env, "SELECT requested_by FROM jobs").requested_by, "hermes");

  const { data } = await door(env, "POST", "/jobs/next");
  assert.equal(data.job.id, made.data.id);
  assert.equal(data.job.kind, "listing_text");
  assert.equal(data.job.listing.id, "HE-R001");
  assert.equal(data.job.listing.title, "Le Bernage");
  assert.deepEqual(data.job.listing.summary, ["Garden", "Garage"]);
  for (const k of ["photos", "image", "interest", "tourUrl", "featured", "order"]) assert.ok(!(k in data.job.listing), k);
  assert.ok(!JSON.stringify(data).includes("Secrète"), "not the road");
  assert.deepEqual((await door(env, "POST", "/jobs/next")).data, { job: null }, "taken: nothing else to do");

  const id = data.job.id, draft = p => door(env, "POST", `/jobs/${id}/draft`, p);
  assert.equal((await draft({ title: "x".repeat(201) })).status, 400);
  assert.equal((await draft({ title: " ", summary: "", description: "" })).status, 400, "something to read");
  assert.equal((await draft({ title: 5 })).status, 400);
  assert.equal((await door(env, "POST", "/jobs/999/draft", { title: "x" })).status, 404);
  const before = row(env, "SELECT * FROM listings WHERE id = 'HE-R001'");
  const ok = await draft({ title: "A home with a garden", summary: "Garden\nGarage", description: "Light and calm." });
  assert.equal(ok.status, 200);
  assert.equal(ok.data.link, `${ORIGIN}/admin/#/p/HE-R001`);
  assert.deepEqual(row(env, "SELECT * FROM listings WHERE id = 'HE-R001'"), before, "a draft never touches the listing");
  const job = row(env, "SELECT status, result, drafted_at FROM jobs WHERE id = ?", id);
  assert.equal(job.status, "draft");
  assert.deepEqual(JSON.parse(job.result), { title: "A home with a garden", summary: "Garden\nGarage", description: "Light and calm." });
  assert.equal((await draft({ title: "Again" })).status, 409, "only a job being worked on takes a draft");
  assert.equal((await door(env, "GET", "/status")).data.drafts_waiting, 1);
});

test("jobs: oldest first, never the same one twice, a stale one retried and failed at the third attempt", async t => {
  at(t, "2026-10-31T09:00:00.000Z");
  const env = env0();
  seedListing(env, { id: "HE-R001" });
  seedListing(env, { id: "HE-R002" });
  await door(env, "POST", "/jobs", { kind: "listing_text", listing: "HE-R002" });
  t.mock.timers.setTime(Date.parse("2026-10-31T09:00:01.000Z"));
  await door(env, "POST", "/jobs", { kind: "listing_text", listing: "HE-R001" });
  const [a, b] = await Promise.all([door(env, "POST", "/jobs/next"), door(env, "POST", "/jobs/next")]);
  assert.deepEqual([a.data.job.listing.id, b.data.job.listing.id].sort(), ["HE-R001", "HE-R002"]);
  assert.equal(a.data.job.listing.id, "HE-R002", "oldest first");
  const id = a.data.job.id;
  for (const [n, min] of [[2, 11], [3, 22]]) {
    t.mock.timers.setTime(Date.parse(`2026-10-31T09:${min}:30.000Z`));
    const again = await door(env, "POST", "/jobs/next");
    assert.equal(again.data.job?.id, id, `attempt ${n}`);
    await door(env, "POST", `/jobs/${b.data.job.id}/draft`, { title: "keep the other one busy" }).catch(() => {});
  }
  t.mock.timers.setTime(Date.parse("2026-10-31T09:33:30.000Z"));
  assert.deepEqual((await door(env, "POST", "/jobs/next")).data, { job: null });
  assert.equal(row(env, "SELECT status, attempts FROM jobs WHERE id = ?", id).status, "failed");
  assert.equal(row(env, "SELECT attempts FROM jobs WHERE id = ?", id).attempts, 3);
});

test("pause: Hermes can only pause; the panel shows it and only the panel resumes", async t => {
  at(t, "2026-10-31T10:00:00.000Z");
  const env = env0();
  const p = await door(env, "POST", "/pause");
  assert.deepEqual(p.data, { outbound: { paused: true, at: "2026-10-31T10:00:00.000Z", by: "hermes" } });
  t.mock.timers.setTime(Date.parse("2026-10-31T11:00:00.000Z"));
  assert.equal((await door(env, "POST", "/pause")).data.outbound.at, "2026-10-31T10:00:00.000Z", "already paused: kept");
  const counts = (await admin(env, "GET", "/admin/notifications/counts")).data;
  assert.deepEqual(counts.outbound, { at: "2026-10-31T10:00:00.000Z", by: "hermes" });
  assert.equal((await door(env, "GET", "/status")).data.outbound.paused, true);
  assert.equal((await call(env, "POST", "/admin/outbound/resume")).status, 401);
  assert.equal((await call(env, "POST", "/admin/outbound/resume", { cookie: await adminCookie(), origin: "https://evil.test" })).status, 403);
  assert.equal((await admin(env, "POST", "/admin/outbound/resume")).status, 200);
  assert.equal((await admin(env, "GET", "/admin/notifications/counts")).data.outbound, null);
  const kept = JSON.parse(row(env, "SELECT value FROM app_settings WHERE key = 'outbound'").value);
  assert.deepEqual(kept, { paused: false, at: "2026-10-31T11:00:00.000Z", by: ADMIN });
});

test("every request with the key leaves its time; none without it", async t => {
  at(t, "2026-10-31T12:00:00.000Z");
  const env = env0();
  await call(env, "GET", "/hermes/status", { bearer: "nope".repeat(10), origin: null });
  assert.equal(env.DB.raw.prepare("SELECT 1 FROM app_settings WHERE key = 'hermes'").get(), undefined);
  await door(env, "GET", "/news");
  assert.deepEqual(JSON.parse(row(env, "SELECT value FROM app_settings WHERE key = 'hermes'").value), { at: "2026-10-31T12:00:00.000Z" });
});

test("panel: ask for a draft, see it, use it or discard it; all with the session", async t => {
  at(t, "2026-10-31T13:00:00.000Z");
  const env = env0();
  seedListing(env, { id: "HE-R001" });
  assert.equal((await call(env, "GET", "/admin/jobs?listing=HE-R001")).status, 401);
  assert.equal((await call(env, "POST", "/admin/jobs", { body: { kind: "listing_text", listing: "HE-R001" } })).status, 401);
  assert.deepEqual((await admin(env, "GET", "/admin/jobs?listing=HE-R001")).data, { job: null, hermes_at: null });
  const made = await admin(env, "POST", "/admin/jobs", { kind: "listing_text", listing: "HE-R001" });
  assert.equal(made.status, 201);
  assert.equal(made.data.job.status, "queued");
  assert.equal((await admin(env, "POST", "/admin/jobs", { kind: "listing_text", listing: "HE-R001" })).status, 409);
  assert.equal(row(env, "SELECT requested_by FROM jobs").requested_by, ADMIN);
  const id = made.data.job.id;
  assert.equal((await admin(env, "POST", `/admin/jobs/${id}/use`)).status, 409, "nothing to use yet");

  await door(env, "POST", "/jobs/next");
  await door(env, "POST", `/jobs/${id}/draft`, { title: "New title", summary: "A\nB", description: "Text." });
  const seen = (await admin(env, "GET", "/admin/jobs?listing=HE-R001")).data;
  assert.equal(seen.hermes_at, "2026-10-31T13:00:00.000Z");
  assert.equal(seen.job.status, "draft");
  assert.deepEqual(seen.job.result, { title: "New title", summary: "A\nB", description: "Text." });

  const before = row(env, "SELECT * FROM listings WHERE id = 'HE-R001'");
  const used = await admin(env, "POST", `/admin/jobs/${id}/use`);
  assert.equal(used.status, 200);
  assert.deepEqual(used.data.job.result, { title: "New title", summary: "A\nB", description: "Text." });
  assert.deepEqual(row(env, "SELECT * FROM listings WHERE id = 'HE-R001'"), before, "the listing changes only on Save");
  assert.deepEqual(row(env, "SELECT status, decided_by, decided_at FROM jobs WHERE id = ?", id),
    { status: "used", decided_by: ADMIN, decided_at: "2026-10-31T13:00:00.000Z" });
  assert.equal((await admin(env, "POST", `/admin/jobs/${id}/use`)).status, 409, "once");
  assert.equal((await admin(env, "POST", `/admin/jobs/${id}/discard`)).status, 409);

  const next = await admin(env, "POST", "/admin/jobs", { kind: "listing_text", listing: "HE-R001" });
  assert.equal(next.status, 201, "a used draft leaves room for another");
  assert.equal((await admin(env, "POST", `/admin/jobs/${next.data.job.id}/discard`)).status, 200);
  assert.equal(row(env, "SELECT status FROM jobs WHERE id = ?", next.data.job.id).status, "discarded");
  assert.deepEqual((await door(env, "POST", "/jobs/next")).data, { job: null }, "a discarded job is not taken");
  assert.equal((await admin(env, "POST", "/admin/jobs/999/discard")).status, 404);
  assert.equal((await admin(env, "GET", "/admin/jobs?listing=HE-X999")).data.job, null);
});

test("panel: an archived listing gets no job; deleting a listing deletes its jobs", async () => {
  const env = env0();
  seedListing(env, { id: "HE-R001", archived_at: T0 });
  seedListing(env, { id: "HE-R002" });
  assert.equal((await admin(env, "POST", "/admin/jobs", { kind: "listing_text", listing: "HE-R001" })).status, 404);
  await admin(env, "POST", "/admin/jobs", { kind: "listing_text", listing: "HE-R002" });
  run(env, "DELETE FROM listings WHERE id = 'HE-R002'");
  assert.equal(row(env, "SELECT COUNT(*) AS n FROM jobs").n, 0);
});

test("only listings on the website reach Hermes; one that leaves it keeps its job waiting", async () => {
  const env = env0();
  seedListing(env, { id: "HE-R001", published: 0 });
  seedListing(env, { id: "HE-R002" });
  assert.equal((await door(env, "POST", "/jobs", { kind: "listing_text", listing: "HE-R001" })).status, 404);
  assert.equal((await admin(env, "POST", "/admin/jobs", { kind: "listing_text", listing: "HE-R001" })).status, 404);
  await door(env, "POST", "/jobs", { kind: "listing_text", listing: "HE-R002" });
  run(env, "UPDATE listings SET published = 0 WHERE id = 'HE-R002'");
  assert.deepEqual((await door(env, "POST", "/jobs/next")).data, { job: null });
  run(env, "UPDATE listings SET published = 1 WHERE id = 'HE-R002'");
  assert.equal((await door(env, "POST", "/jobs/next")).data.job.listing.id, "HE-R002");
});

test("the door never names who paused from the panel; a cursor past the last notice comes back", async () => {
  const env = env0();
  run(env, `INSERT INTO app_settings (key, value, updated_at) VALUES ('outbound', json_object('paused', json('true'), 'at', ?1,
    'by', ?2), ?1)`, T0, ADMIN);
  assert.deepEqual((await door(env, "GET", "/status")).data.outbound, { paused: true, at: T0, by: "team" });
  assert.deepEqual((await door(env, "POST", "/pause")).data.outbound, { paused: true, at: T0, by: "team" });
  assert.equal((await admin(env, "GET", "/admin/notifications/counts")).data.outbound.by, ADMIN, "the panel says who");
  assert.deepEqual((await door(env, "GET", "/news?after=99")).data, { items: [], cursor: 0 });
});

test("news: a viewing request names only a listing on the website, never an old or hidden title", async () => {
  const env = env0();
  seedListing(env, { id: "HE-R001", title: "Live one" });
  seedListing(env, { id: "HE-R002", title: "Off-market house", published: 0 });
  seedListing(env, { id: "HE-R003", title: "Archived house", archived_at: T0 });
  const ask = (listing_id, listing_title_snapshot = null) => notice(env, { entity_type: "viewing", category: "viewing",
    title: "Viewing request: Ottoline Pryke", type: "viewing.requested", entity_id: insert(env, "viewing_requests", {
      listing_id, listing_title_snapshot, kind: "In person", date: "2026-11-02", time: "11:30", name: "Ottoline Pryke",
      phone: "07700 900654", created_at: T0 }) });
  ask("HE-R001"); ask("HE-R002"); ask("HE-R003"); ask(null, "Old snapshot title");
  const { data } = await door(env, "GET", "/news?after=0");
  assert.deepEqual(data.items.map(i => i.text), ["New viewing request for Live one", "New viewing request",
    "New viewing request", "New viewing request"]);
  for (const s of ["Off-market", "Archived house", "Old snapshot"]) assert.ok(!JSON.stringify(data).includes(s), s);
});
