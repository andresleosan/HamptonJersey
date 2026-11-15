// SPR-08: the team's internal notes about a property. Added to, never rewritten; corrected or withdrawn only by
// their author; never on the website or in an event. Synthetic data only.
import test from "node:test";
import assert from "node:assert/strict";
import { makeEnv, seedListing, seedMedia, call, adminCookie } from "./listing-client.mjs";
import { listingPage } from "../../server/seo.js";

const ADMIN = "admin@example.test", OTHER = "colleague@example.test";
const HOME = "HE-R001", PATH = `/admin/listings/${HOME}/notes`, SECRET_TEXT = "FIXTURE-NOTE owner prefers afternoon calls";
const rows = (env, sql, ...args) => env.DB.raw.prepare(sql).all(...args).map(r => ({ ...r }));
const req = async (env, method, path, body, email = ADMIN) => call(env, method, path, { body, cookie: await adminCookie(email) });
const world = ({ ready = true, schema } = {}) => {
  const env = makeEnv(schema);
  if (ready) env.SPR08_SECTIONS_READY = "1";
  seedListing(env, { id: HOME });
  return env;
};
const add = (env, text, email) => req(env, "POST", PATH, { text }, email);
const notes = async env => (await req(env, "GET", PATH)).data.notes;

test("switched off, or on before migration 0079, the property is as before and nothing is written", async () => {
  for (const [ready, schema] of [[false, {}], [true, { through: 78 }]]) {
    const env = world({ ready, schema });
    const detail = await req(env, "GET", `/admin/listings/${HOME}`);
    assert.equal(detail.status, 200);
    assert.equal("sections_enabled" in detail.data, false);
    assert.equal((await req(env, "GET", PATH)).status, 404);
    assert.equal((await add(env, SECRET_TEXT)).status, 404);
    assert.equal((await req(env, "PUT", `${PATH}/1`, { text: "x" })).status, 404);
    assert.equal((await req(env, "DELETE", `${PATH}/1`)).status, 404);
    if (!schema.through) assert.deepEqual(rows(env, "SELECT * FROM property_notes"), []);
  }
});

test("a note takes its author and date from the session, and the list is newest first", async t => {
  const env = world();
  assert.equal((await req(env, "GET", `/admin/listings/${HOME}`)).data.sections_enabled, true);
  assert.deepEqual(await notes(env), []);
  t.mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-11-15T09:00:00.000Z") });
  const first = await req(env, "POST", PATH, { text: `  ${SECRET_TEXT}  `, author: "someone@else.test", written_at: "2001-01-01T00:00:00.000Z" });
  assert.equal(first.status, 201, first.text);
  t.mock.timers.setTime(Date.parse("2026-11-15T10:00:00.000Z"));
  assert.equal((await add(env, "Second note", OTHER)).status, 201);
  assert.deepEqual(await notes(env), [
    { id: 2, text: "Second note", author: OTHER, written_at: "2026-11-15T10:00:00.000Z", changed_at: null, own: false },
    { id: 1, text: SECRET_TEXT, author: ADMIN, written_at: "2026-11-15T09:00:00.000Z", changed_at: null, own: true },
  ]);
  // The answer to a write is the same list.
  assert.deepEqual(first.data.notes.map(n => n.id), [1]);
});

test("a note needs between 1 and 4000 characters of text, about a property that exists", async () => {
  const env = world();
  for (const text of ["", "   ", "x".repeat(4001), 7, null, undefined, ["a"]]) {
    const r = await add(env, text);
    assert.equal(r.status, 400, JSON.stringify(text));
    assert.ok(r.data.fields.text);
  }
  assert.equal((await add(env, "x".repeat(4000))).status, 201);
  assert.equal((await req(env, "POST", "/admin/listings/HE-R999/notes", { text: "x" })).status, 404);
  assert.equal((await req(env, "GET", "/admin/listings/HE-R999/notes")).status, 404);
  assert.equal(rows(env, "SELECT COUNT(*) AS n FROM property_notes")[0].n, 1);
  // Signed out: nothing is read or written.
  assert.equal((await call(env, "GET", PATH)).status, 401);
  assert.equal((await call(env, "POST", PATH, { body: { text: "x" } })).status, 401);
});

test("the author corrects a note by adding a version; the earlier one is kept and a stale correction is refused", async t => {
  const env = world();
  t.mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-11-15T09:00:00.000Z") });
  await add(env, "Keys with the neighbour at number 4");
  t.mock.timers.setTime(Date.parse("2026-11-15T11:30:00.000Z"));
  const fixed = await req(env, "PUT", `${PATH}/1`, { text: "Keys with the neighbour at number 6" });
  assert.equal(fixed.status, 200, fixed.text);
  assert.deepEqual(fixed.data.notes, [{ id: 2, text: "Keys with the neighbour at number 6", author: ADMIN,
    written_at: "2026-11-15T09:00:00.000Z", changed_at: "2026-11-15T11:30:00.000Z", own: true }]);
  // Append-only: both versions are rows, and no row can be rewritten.
  assert.deepEqual(rows(env, "SELECT id, replaces, body FROM property_notes ORDER BY id"), [
    { id: 1, replaces: null, body: "Keys with the neighbour at number 4" },
    { id: 2, replaces: 1, body: "Keys with the neighbour at number 6" }]);
  assert.throws(() => env.DB.raw.prepare("UPDATE property_notes SET body = 'x' WHERE id = 1").run(), /append-only/);
  // The version already corrected cannot be corrected or withdrawn again: the page is out of date.
  const stale = await req(env, "PUT", `${PATH}/1`, { text: "Keys at the office" });
  assert.equal(stale.status, 409);
  assert.match(stale.data.error, /Reload/);
  assert.equal((await req(env, "DELETE", `${PATH}/1`)).status, 409);
  // The same text again, or no text, changes nothing.
  assert.equal((await req(env, "PUT", `${PATH}/2`, { text: " " })).status, 400);
  assert.equal(rows(env, "SELECT COUNT(*) AS n FROM property_notes")[0].n, 2);
  // Even the database refuses a second version of the same row.
  assert.throws(() => env.DB.raw.prepare(`INSERT INTO property_notes (listing_id, replaces, body, written_at, created_at, created_by)
    VALUES ('${HOME}', 1, 'x', 'a', 'b', 'c')`).run(), /UNIQUE/);
});

test("only its author corrects or withdraws a note, and only on its own property", async () => {
  const env = world();
  seedListing(env, { id: "HE-R002" });
  await add(env, "Written by the admin");
  assert.equal((await req(env, "PUT", `${PATH}/1`, { text: "Rewritten by a colleague" }, OTHER)).status, 403);
  assert.equal((await req(env, "DELETE", `${PATH}/1`, undefined, OTHER)).status, 403);
  // A note is reached only through its own property.
  assert.equal((await req(env, "PUT", "/admin/listings/HE-R002/notes/1", { text: "x" })).status, 404);
  assert.equal((await req(env, "DELETE", "/admin/listings/HE-R002/notes/1")).status, 404);
  assert.equal((await req(env, "PUT", `${PATH}/99`, { text: "x" })).status, 404);
  assert.deepEqual(rows(env, "SELECT id, body FROM property_notes"), [{ id: 1, body: "Written by the admin" }]);
  assert.deepEqual(await notes(env), (await req(env, "GET", PATH, undefined, OTHER)).data.notes.map(n => ({ ...n, own: true })));
});

test("a withdrawn note leaves who and when, and its text is no longer given", async t => {
  const env = world();
  t.mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-11-15T09:00:00.000Z") });
  await add(env, SECRET_TEXT);
  t.mock.timers.setTime(Date.parse("2026-11-15T12:00:00.000Z"));
  const gone = await req(env, "DELETE", `${PATH}/1`);
  assert.equal(gone.status, 200, gone.text);
  assert.deepEqual(gone.data.notes, [{ id: 2, text: null, author: ADMIN, written_at: "2026-11-15T09:00:00.000Z",
    changed_at: "2026-11-15T12:00:00.000Z", own: true }]);
  assert.equal(gone.text.includes("FIXTURE-NOTE"), false);
  // A withdrawal is final: it is neither corrected nor withdrawn again.
  assert.equal((await req(env, "PUT", `${PATH}/2`, { text: "Back again" })).status, 409);
  assert.equal((await req(env, "DELETE", `${PATH}/2`)).status, 409);
  assert.equal(rows(env, "SELECT COUNT(*) AS n FROM property_notes")[0].n, 2);
});

test("a note's text never reaches the website, the listing reads or an event", async () => {
  const env = world();
  env.SITE_URL = "https://www.hamptonestatesjersey.com";
  seedMedia(env); // published with a public photo: on the website
  const before = JSON.stringify([rows(env, "SELECT * FROM events"), rows(env, "SELECT * FROM notifications"), rows(env, "SELECT * FROM listings")]);
  await add(env, SECRET_TEXT);
  await req(env, "PUT", `${PATH}/1`, { text: `${SECRET_TEXT} (corrected)` });
  await req(env, "DELETE", `${PATH}/2`);
  // Writing notes changes no listing and leaves no event or notification.
  assert.equal(JSON.stringify([rows(env, "SELECT * FROM events"), rows(env, "SELECT * FROM notifications"), rows(env, "SELECT * FROM listings")]), before);
  await add(env, SECRET_TEXT);
  const site = await call(env, "GET", "/listings");
  assert.equal(site.status, 200);
  assert.ok(site.text.includes(HOME));
  const page = await listingPage(new Request(`${env.SITE_URL}/p/${HOME}`), env, HOME);
  assert.equal(page.status, 200);
  for (const [where, text] of [["public list", site.text], ["public page", JSON.stringify(page)],
    ["panel list", (await req(env, "GET", "/admin/listings")).text], ["panel detail", (await req(env, "GET", `/admin/listings/${HOME}`)).text],
    ["history", (await req(env, "GET", `/admin/listings/${HOME}/history`)).text]])
    assert.equal(text.includes("FIXTURE-NOTE"), false, where);
});

test("notes go with their property when it is deleted", async () => {
  const env = world();
  await add(env, "One");
  await req(env, "PUT", `${PATH}/1`, { text: "Two" });
  await req(env, "DELETE", `${PATH}/2`);
  env.DB.raw.prepare("DELETE FROM listings WHERE id = ?").run(HOME);
  assert.deepEqual(rows(env, "SELECT * FROM property_notes"), []);
});
