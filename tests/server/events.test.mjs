import test from "node:test";
import assert from "node:assert/strict";
import { makeEnv, seedListing, call, adminCookie } from "./helpers.mjs";
import { logEvent } from "../../server/events.js";

const turnstile = ok => { globalThis.fetch = async () => new Response(JSON.stringify({ success: ok, hostname: "hampton.test" })); };
const nextWeekday = () => { const d = new Date(Date.now() + 2 * 864e5); if (d.getUTCDay() === 0) d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); };
const booking = (o = {}) => ({ listing_id: "HE-R001", agent: "Gilberto Franco", kind: "In person", date: nextWeekday(),
  time: "11:30", name: "Jane Le Brocq", email: "jane@example.je", phone: "", turnstile: "tok", ...o });
const ADMIN = "luismadef45@gmail.com";

async function requested() {
  const env = makeEnv();
  seedListing(env);
  turnstile(true);
  assert.equal((await call(env, "POST", "/viewings", { body: booking() })).status, 201);
  const { id } = await env.DB.prepare("SELECT id FROM viewing_requests").first();
  return { env, id };
}
const events = env => env.DB.raw.prepare("SELECT * FROM events ORDER BY id").all();
const notices = env => env.DB.raw.prepare("SELECT * FROM notifications ORDER BY id").all();

test("a viewing request writes its event and an open notice", async () => {
  const { env, id } = await requested();
  const [e, ...more] = events(env);
  assert.equal(more.length, 0);
  assert.equal(e.type, "viewing.requested");
  assert.equal(e.actor, "public");
  assert.equal(e.entity_type, "viewing");
  assert.equal(e.entity_id, String(id));
  assert.deepEqual(JSON.parse(e.data), { listing_id: "HE-R001", date: booking().date, time: "11:30", kind: "In person" });
  const [n, ...others] = notices(env);
  assert.equal(others.length, 0);
  assert.equal(n.event_id, e.id);
  assert.equal(n.category, "viewing");
  assert.equal(n.title, "Viewing request: Jane Le Brocq");
  assert.equal(n.action_required, 1);
  assert.equal(n.resolved_at, null);
});

test("the notice closes when the request leaves new", async () => {
  const { env, id } = await requested();
  const cookie = await adminCookie();
  assert.equal((await call(env, "PUT", `/admin/viewings/${id}`, { cookie, body: { notes: "Left a message" } })).status, 200);
  assert.equal(notices(env)[0].resolved_at, null, "a notes-only change keeps it open");
  assert.equal((await call(env, "PUT", `/admin/viewings/${id}`, { cookie, body: { status: "new" } })).status, 200);
  assert.equal(notices(env)[0].resolved_at, null, "staying new keeps it open");
  assert.equal((await call(env, "PUT", `/admin/viewings/${id}`, { cookie, body: { status: "contacted" } })).status, 200);
  const [n] = notices(env);
  assert.ok(n.resolved_at);
  assert.equal(n.resolved_by, ADMIN);
});

test("a missing request is 404 and leaves other notices open", async () => {
  const { env, id } = await requested();
  const cookie = await adminCookie();
  assert.equal((await call(env, "PUT", `/admin/viewings/${id + 1}`, { cookie, body: { status: "contacted" } })).status, 404);
  assert.equal(notices(env)[0].resolved_at, null);
});

test("a rejected viewing writes nothing", async () => {
  const env = makeEnv();
  seedListing(env);
  turnstile(false);
  assert.equal((await call(env, "POST", "/viewings", { body: booking() })).status, 400);
  assert.equal(events(env).length, 0);
  assert.equal(notices(env).length, 0);
});

test("deleting a request closes its notice", async () => {
  const { env, id } = await requested();
  assert.equal((await call(env, "DELETE", `/admin/viewings/${id}`, { cookie: await adminCookie() })).status, 200);
  const [n] = notices(env);
  assert.ok(n.resolved_at);
  assert.equal(n.resolved_by, ADMIN);
});

test("deleting a request takes the name off its notice and the request off its history", async () => {
  const { env, id } = await requested();
  assert.equal((await call(env, "DELETE", `/admin/viewings/${id}`, { cookie: await adminCookie() })).status, 200);
  const [n] = notices(env);
  assert.equal(n.title, "Deleted viewing request");
  const [e] = events(env);
  assert.equal(e.type, "viewing.requested", "the history keeps what happened and when");
  assert.equal(e.data, null);
  assert.ok(!JSON.stringify(notices(env)).includes("Jane"), "the name is gone from every notice");
});

test("data: null is stored as SQL NULL", async () => {
  const env = makeEnv();
  await env.DB.batch(logEvent(env, { actor: "system", entity_type: "admin", entity_id: "x", type: "t", data: null }));
  assert.equal(events(env)[0].data, null);
});
