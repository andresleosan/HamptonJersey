// SAP-07 + EST-11 (spec 2026-11-04): the last real contact, Gone quiet at 14 days and the extra list filters.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { makeEnv, seedListing, call, adminCookie } from "./helpers.mjs";
import { touchByViewing } from "../../server/retention.js";

const NOW = Date.parse("2026-11-04T09:00:00.000Z"), DAY = 864e5;
const ago = days => new Date(NOW - days * DAY).toISOString();
const req = async (env, method, path, body) => call(env, method, path, { body, cookie: await adminCookie() });
const row = (env, sql, ...args) => env.DB.raw.prepare(sql).get(...args);
const run = (env, sql, ...args) => env.DB.raw.prepare(sql).run(...args);
const contactOf = (env, id) => row(env, "SELECT c.* FROM contacts c JOIN applicants a ON a.contact_id = c.id WHERE a.id = ?", id);
let n = 0;
async function create(env, o = {}) {
  n++;
  const r = await req(env, "POST", "/admin/applicants", { name: `Person ${n}`, email: `p${n}@example.je`, source: "phone",
    operation: "rent", budget_max: 2000, ...o });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  return r.data.id;
}
const quiet = (env, id, days) => run(env, `UPDATE contacts SET last_contact_at = ? WHERE id =
  (SELECT contact_id FROM applicants WHERE id = ?)`, ago(days), id);
const list = async (env, q = "") => {
  const r = await req(env, "GET", `/admin/applicants${q}`);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  return r.data.applicants;
};
const ids = async (env, q) => (await list(env, q)).map(a => a.id).sort((x, y) => x - y);

test("a real contact moves last_contact_at; a team edit does not", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: NOW });
  const env = makeEnv();
  const id = await create(env);
  const c = contactOf(env, id);
  assert.equal(c.last_contact_at, c.created_at, "registering is a contact");

  quiet(env, id, 20);
  const was = contactOf(env, id).last_contact_at;
  const a = (await req(env, "GET", `/admin/applicants/${id}`)).data.applicant;
  const ed = await req(env, "PUT", `/admin/applicants/${id}`, { ...a, bedrooms_min: 3 });
  assert.equal(ed.status, 200, JSON.stringify(ed.data));
  assert.equal(contactOf(env, id).last_contact_at, was, "an edit is not a contact");

  assert.equal((await req(env, "POST", `/admin/contacts/${c.id}/conversation`)).status, 200);
  assert.equal(contactOf(env, id).last_contact_at, new Date(NOW).toISOString(), "Log conversation is a contact");

  // A viewing with the contact's email, after its write (the changes() gate).
  quiet(env, id, 20);
  await env.DB.batch([env.DB.prepare("UPDATE contacts SET name = name WHERE id = ?").bind(c.id),
    touchByViewing(env, { email: c.email, phone: null }, "2026-11-04T08:00:00.000Z")]);
  assert.equal(contactOf(env, id).last_contact_at, "2026-11-04T08:00:00.000Z", "a viewing is a contact");
});

test("recording an offer is a contact", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: NOW });
  const env = makeEnv();
  seedListing(env, { id: "HE-R001", title: "Le Bernage", matchable: 1 });
  const id = await create(env, { operation: "buy", budget_max: 900000 });
  quiet(env, id, 20);
  const r = await req(env, "POST", "/admin/offers", { listing_id: "HE-R001", applicant_id: id, amount: 750000 });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.equal(contactOf(env, id).last_contact_at, new Date(NOW).toISOString());
});

test("Gone quiet: an active search, Paused included, with no contact for more than 14 days", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: NOW });
  const env = makeEnv();
  const fresh = await create(env), old = await create(env), paused = await create(env), lost = await create(env);
  const edge = await create(env);
  for (const id of [old, paused, lost]) quiet(env, id, 15);
  quiet(env, edge, 14);
  run(env, "UPDATE applicants SET stage = 'paused' WHERE id = ?", paused);
  run(env, "UPDATE applicants SET stage = 'lost', lost_reason = 'Found elsewhere' WHERE id = ?", lost);
  const by = Object.fromEntries((await list(env)).map(a => [a.id, a]));
  assert.deepEqual([fresh, old, paused, lost, edge].map(id => by[id].gone_quiet), [0, 1, 1, 0, 0]);
  assert.equal(by[old].last_contact_at, ago(15));
  assert.deepEqual(await ids(env, "?contact=quiet"), [old, paused]);
});

test("filters by budget, parish and source", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: NOW });
  const env = makeEnv();
  const cheap = await create(env, { budget_min: 1000, budget_max: 1500, parishes_wanted: ["St Helier"], source: "email" });
  const stretch = await create(env, { budget_max: 1800, budget_stretch: 2200, parishes_excluded: ["St Helier"] });
  const open = await create(env, { budget_max: null, source: "walk_in" });
  assert.deepEqual(await ids(env, "?budget=2000"), [stretch, open], "up to the stretch; no budget: any");
  assert.deepEqual(await ids(env, "?budget=900"), [stretch, open], "under the minimum is out");
  assert.deepEqual(await ids(env, "?parish=St%20Helier"), [cheap, open], "wanted it, or wants anywhere; excluded is out");
  assert.deepEqual(await ids(env, "?parish=Trinity"), [stretch, open]);
  assert.deepEqual(await ids(env, "?source=walk_in"), [open]);
  for (const q of ["?budget=abc", "?budget=-5", "?parish=Paris", "?source=fax", "?contact=x"])
    assert.equal((await req(env, "GET", `/admin/applicants${q}`)).status, 400, q);
});

test("the migration fills last_contact_at from the history", () => {
  const env = makeEnv();
  run(env, `INSERT INTO contacts (id, name, email, phone, last_activity_at, created_at, updated_at, last_contact_at)
    VALUES (1, 'A', 'a@example.je', NULL, '2026-10-30T00:00:00.000Z', '2026-09-01T00:00:00.000Z', '2026-10-30T00:00:00.000Z', NULL),
    (2, 'B', 'b@example.je', NULL, '2026-10-30T00:00:00.000Z', '2026-09-01T00:00:00.000Z', '2026-10-30T00:00:00.000Z', NULL),
    (3, 'C', NULL, '+447797999999', '2026-10-30T00:00:00.000Z', '2026-09-01T00:00:00.000Z', '2026-10-30T00:00:00.000Z', NULL)`);
  run(env, `INSERT INTO events (at, actor, entity_type, entity_id, type) VALUES
    ('2026-10-10T00:00:00.000Z', 'admin@example.test', 'contact', '1', 'contact.conversation'),
    ('2026-10-20T00:00:00.000Z', 'admin@example.test', 'contact', '1', 'contact.updated')`);
  run(env, `INSERT INTO viewing_requests (listing_id, kind, name, email, date, time, status, created_at)
    VALUES (NULL, 'in_person', 'B', 'B@example.je', '2026-10-15', '10:00', 'requested', '2026-10-12T00:00:00.000Z')`);
  run(env, `INSERT INTO viewing_requests (listing_id, kind, name, phone, date, time, status, created_at)
    VALUES (NULL, 'in_person', 'C', '07797 999-999', '2026-10-16', '10:00', 'requested', '2026-10-13T00:00:00.000Z')`);
  const sql = readFileSync(new URL("../../migrations/0019_last_contact.sql", import.meta.url), "utf8");
  env.DB.raw.exec(sql.slice(sql.indexOf("UPDATE contacts")));
  assert.equal(row(env, "SELECT last_contact_at FROM contacts WHERE id = 1").last_contact_at, "2026-10-10T00:00:00.000Z",
    "the conversation, not the team's edit");
  assert.equal(row(env, "SELECT last_contact_at FROM contacts WHERE id = 2").last_contact_at, "2026-10-12T00:00:00.000Z");
  assert.equal(row(env, "SELECT last_contact_at FROM contacts WHERE id = 3").last_contact_at, "2026-10-13T00:00:00.000Z",
    "a phone-only viewing typed another way");
});
