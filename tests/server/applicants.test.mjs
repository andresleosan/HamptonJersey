import test from "node:test";
import assert from "node:assert/strict";
import { makeEnv, call, adminCookie, T0 } from "./helpers.mjs";

const ADMIN = "luismadef45@gmail.com", OTHER = "andres.san1404@gmail.com";
const STALE = "Someone else saved changes to this applicant. Reload to see them (your changes were not saved).";

const req = async (env, method, path, body, who = ADMIN) => call(env, method, path, { body, cookie: await adminCookie(who) });
const row = (env, sql, ...args) => env.DB.raw.prepare(sql).get(...args);
const rows = (env, sql, ...args) => env.DB.raw.prepare(sql).all(...args);
const form = (o = {}) => ({ name: "Jane Le Brocq", email: "jane@example.je", phone: "07797 123456", source: "phone",
  operation: "rent", budget_max: 2000, bedrooms_min: 2, ...o });
async function create(env, o) {
  const r = await req(env, "POST", "/admin/applicants", form(o));
  assert.equal(r.status, 201, JSON.stringify(r.data));
  // Saves stamp updated_at to the millisecond: start from T0 so the next save is always a new version.
  env.DB.raw.prepare("UPDATE applicants SET updated_at = ? WHERE id = ?").run(T0, r.data.id);
  env.DB.raw.prepare("UPDATE contacts SET updated_at = ? WHERE id = (SELECT contact_id FROM applicants WHERE id = ?)").run(T0, r.data.id);
  return r.data.id;
}
const detail = async (env, id) => (await req(env, "GET", `/admin/applicants/${id}`)).data;
// Puts the applicant's created_at in a known order for the sort tests.
const age = (env, id, at) => env.DB.raw.prepare("UPDATE applicants SET created_at = ? WHERE id = ?").run(at, id);

test("every applicants route needs a session", async () => {
  const env = makeEnv();
  for (const [m, p] of [["GET", "/admin/applicants"], ["POST", "/admin/applicants"], ["GET", "/admin/applicants/1"],
    ["PUT", "/admin/applicants/1"], ["DELETE", "/admin/applicants/1"], ["POST", "/admin/applicants/1/archive"],
    ["POST", "/admin/applicants/1/restore"], ["GET", "/admin/contacts/1"], ["PUT", "/admin/contacts/1"], ["PUT", "/admin/users/x%40y.je"]])
    assert.equal((await call(env, m, p, { body: m === "GET" ? undefined : {} })).status, 401, `${m} ${p}`);
});

test("create from the panel, then list filtered and sorted", async () => {
  const env = makeEnv();
  const a = await create(env);
  const b = await create(env, { name: "Tom Vibert", email: "tom@example.je", phone: null });
  const c = await create(env, { name: "Ann Renouf", email: null, phone: "+44 7700 900123", operation: "buy", budget_max: 650000 });
  age(env, a, "2026-10-01T09:00:00.000Z"); age(env, b, "2026-10-02T09:00:00.000Z"); age(env, c, "2026-10-03T09:00:00.000Z");

  const ap = row(env, "SELECT * FROM applicants WHERE id = ?", a);
  assert.equal(ap.stage, "new");
  assert.equal(ap.source, "phone");
  assert.equal(ap.updated_by, ADMIN);
  const contact = row(env, "SELECT * FROM contacts WHERE id = ?", ap.contact_id);
  assert.equal(contact.phone, "+447797123456");
  assert.equal(contact.last_activity_at, contact.created_at);

  // The panel's own entry is information for the Feed, not something to act on.
  const notices = rows(env, `SELECT n.*, e.type, e.entity_id, e.data, e.actor FROM notifications n JOIN events e ON e.id = n.event_id ORDER BY n.id`);
  assert.equal(notices.length, 3);
  assert.deepEqual({ ...notices[0], id: 0, event_id: 0, created_at: 0 }, {
    id: 0, event_id: 0, created_at: 0, category: "new_applicant", title: "New applicant: Jane Le Brocq · To Let",
    action_required: 0, resolved_at: null, resolved_by: null, type: "applicant.created", entity_id: String(a),
    data: JSON.stringify({ operation: "rent", source: "phone" }), actor: ADMIN });
  assert.equal(notices[2].title, "New applicant: Ann Renouf · To Buy");

  const list = async q => (await req(env, "GET", `/admin/applicants${q}`)).data.applicants;
  assert.deepEqual((await list("?operation=rent&sort=oldest")).map(x => x.id), [a, b]);
  assert.deepEqual((await list("?operation=rent")).map(x => x.id), [b, a], "newest is the default");
  assert.deepEqual((await list("")).map(x => x.id), [c, b, a]);
  assert.deepEqual(Object.keys((await list("?operation=buy"))[0]).sort(),
    ["assigned_name", "assigned_to", "created_at", "email", "id", "lost_reason", "name", "operation", "phone", "stage"]);
  for (const q of ["jane", "JANE@example", "07797 123456", "7797123", "+447797123456"])
    assert.deepEqual((await list(`?q=${encodeURIComponent(q)}`)).map(x => x.id), [a], q);
  assert.deepEqual((await list("?q=0044%207700-900123")).map(x => x.id), [c]);
  assert.deepEqual(await list("?q=100%25"), [], "LIKE wildcards are literal");

  await req(env, "PUT", `/admin/users/${encodeURIComponent(OTHER)}`, { name: "Andrés" });
  await req(env, "PUT", `/admin/applicants/${b}`, { updated_at: row(env, "SELECT updated_at FROM applicants WHERE id = ?", b).updated_at,
    assigned_to: OTHER, stage: "searching" });
  const [tom] = await list(`?assigned=${encodeURIComponent(OTHER)}&stage=searching`);
  assert.deepEqual(tom, { id: b, operation: "rent", stage: "searching", created_at: "2026-10-02T09:00:00.000Z",
    assigned_to: OTHER, assigned_name: "Andrés", lost_reason: null, name: "Tom Vibert", phone: null, email: "tom@example.je" });
  assert.deepEqual((await list("?stage=new")).map(x => x.id), [c, a]);
  // A lost search carries its reason, shown next to the badge.
  await req(env, "PUT", `/admin/applicants/${c}`, { updated_at: row(env, "SELECT updated_at FROM applicants WHERE id = ?", c).updated_at,
    stage: "lost", lost_reason: "Bought privately" });
  assert.deepEqual((await list("?stage=lost")).map(x => [x.id, x.lost_reason]), [[c, "Bought privately"]]);

  for (const q of ["?operation=lease", "?sort=price", "?stage=won"])
    assert.equal((await req(env, "GET", `/admin/applicants${q}`)).status, 400, q);
});

test("panel validation errors come back per field", async () => {
  const env = makeEnv();
  const r = await req(env, "POST", "/admin/applicants", form({ source: "web", budget_max: 1500, operation: "buy" }));
  assert.equal(r.status, 400);
  assert.ok(r.data.fields.source);
  assert.ok(r.data.fields.budget_max);
  assert.equal(row(env, "SELECT COUNT(*) AS n FROM contacts").n, 0);
});

test("existing email or phone answers 409 with the contact id", async () => {
  const env = makeEnv();
  const a = await create(env);
  const contactId = row(env, "SELECT contact_id FROM applicants WHERE id = ?", a).contact_id;
  for (const o of [{ email: "Jane@Example.je ", phone: null }, { email: null, phone: "+44 7797 123456" },
    { name: "Other", email: "other@example.je", phone: "0044 7797-123456" }]) {
    const r = await req(env, "POST", "/admin/applicants", form(o));
    assert.equal(r.status, 409, JSON.stringify(o));
    assert.deepEqual(r.data, { error: "Jane Le Brocq is already a contact", contact_id: contactId });
  }
  assert.equal(row(env, "SELECT COUNT(*) AS n FROM contacts").n, 1);

  // "Add a new search for this contact": the contact is used as it is, its own fields are not touched.
  env.DB.raw.prepare("UPDATE contacts SET last_activity_at = ? WHERE id = ?").run(T0, contactId);
  const before = row(env, "SELECT * FROM contacts WHERE id = ?", contactId);
  const r = await req(env, "POST", "/admin/applicants",
    form({ contact_id: contactId, name: "Changed", email: "x@example.je", operation: "buy", budget_max: 450000 }));
  assert.equal(r.status, 201);
  const second = row(env, "SELECT * FROM applicants WHERE id = ?", r.data.id);
  assert.equal(second.contact_id, contactId);
  assert.equal(second.operation, "buy");
  const after = row(env, "SELECT * FROM contacts WHERE id = ?", contactId);
  assert.deepEqual({ ...after, last_activity_at: null }, { ...before, last_activity_at: null });
  assert.notEqual(after.last_activity_at, T0, "a new search is activity on the contact");
  assert.equal(row(env, "SELECT title FROM notifications ORDER BY id DESC").title, "New applicant: Jane Le Brocq · To Buy");

  assert.equal((await req(env, "POST", "/admin/applicants", form({ contact_id: 999 }))).status, 404);
  assert.equal((await req(env, "POST", "/admin/applicants", form({ contact_id: "abc" }))).status, 400);
});

test("update logs only the changed fields and refuses stale saves", async () => {
  const env = makeEnv();
  const id = await create(env, { requirements: "Near the school", parishes_wanted: ["St Helier"] });
  const contactId = row(env, "SELECT contact_id FROM applicants WHERE id = ?", id).contact_id;
  env.DB.raw.prepare("UPDATE contacts SET last_activity_at = ? WHERE id = ?").run(T0, contactId);
  const { applicant } = await detail(env, id);
  assert.deepEqual(applicant.parishes_wanted, ["St Helier"], "JSON lists come back as arrays");

  // The panel sends the whole form back with one change.
  const first = await req(env, "PUT", `/admin/applicants/${id}`,
    { ...applicant, budget_max: 2500, parishes_wanted: ["St Helier", "Trinity"] });
  assert.equal(first.status, 200, JSON.stringify(first.data));
  assert.equal(first.data.applicant.budget_max, 2500);
  assert.notEqual(first.data.applicant.updated_at, applicant.updated_at);
  assert.equal(first.data.applicant.requirements, "Near the school", "untouched fields stay");
  const ev = row(env, "SELECT * FROM events WHERE type = 'applicant.updated'");
  assert.equal(ev.actor, ADMIN);
  assert.equal(ev.entity_type, "applicant");
  assert.equal(ev.entity_id, String(id));
  assert.deepEqual(JSON.parse(ev.data), {
    before: { budget_max: 2000, parishes_wanted: ["St Helier"] },
    after: { budget_max: 2500, parishes_wanted: ["St Helier", "Trinity"] } });
  assert.notEqual(row(env, "SELECT last_activity_at FROM contacts WHERE id = ?", contactId).last_activity_at, T0);

  // A second admin still holding the old version: refused, nothing written.
  const second = await req(env, "PUT", `/admin/applicants/${id}`, { ...applicant, requirements: "Garden" }, OTHER);
  assert.equal(second.status, 409);
  assert.equal(second.data.error, STALE);
  assert.equal(row(env, "SELECT requirements FROM applicants WHERE id = ?", id).requirements, "Near the school");
  assert.equal(row(env, "SELECT COUNT(*) AS n FROM events WHERE entity_type = 'applicant'").n, 2);

  assert.equal((await req(env, "PUT", `/admin/applicants/${id}`, { budget_max: 2600 })).status, 400, "updated_at is required");
  assert.equal((await req(env, "PUT", "/admin/applicants/999", { updated_at: T0 })).status, 404);

  // Only the stage: a stage_changed event; lost needs its reason, which is cleared when the search comes back.
  const cur = first.data.applicant;
  const noReason = await req(env, "PUT", `/admin/applicants/${id}`, { updated_at: cur.updated_at, stage: "lost" });
  assert.equal(noReason.status, 400);
  assert.ok(noReason.data.fields.lost_reason);
  const lost = await req(env, "PUT", `/admin/applicants/${id}`,
    { updated_at: cur.updated_at, stage: "lost", lost_reason: " Found elsewhere " });
  assert.equal(lost.status, 200);
  assert.equal(lost.data.applicant.lost_reason, "Found elsewhere");
  const sc = row(env, "SELECT * FROM events WHERE type = 'applicant.stage_changed'");
  assert.deepEqual(JSON.parse(sc.data), { before: { stage: "new", lost_reason: null }, after: { stage: "lost", lost_reason: "Found elsewhere" } });
  const back = await req(env, "PUT", `/admin/applicants/${id}`, { updated_at: lost.data.applicant.updated_at, stage: "searching" });
  assert.equal(back.data.applicant.lost_reason, null);
  for (const bad of [{ stage: "won" }, { assigned_to: "nobody@example.je" }, { budget_max: 900000 }]) {
    const r = await req(env, "PUT", `/admin/applicants/${id}`, { updated_at: back.data.applicant.updated_at, ...bad });
    assert.equal(r.status, 400, JSON.stringify(bad));
    assert.ok(r.data.fields[Object.keys(bad)[0]]);
  }
});

test("a save racing another one between the check and the write leaves no trace", async () => {
  const env = makeEnv();
  const id = await create(env);
  const { applicant } = await detail(env, id);
  const events = row(env, "SELECT COUNT(*) AS n FROM events").n;
  const batch = env.DB.batch.bind(env.DB);
  env.DB.batch = async stmts => {
    env.DB.raw.prepare("UPDATE applicants SET updated_at = ? WHERE id = ?").run("2026-10-23T12:00:00.000Z", id);
    return batch(stmts);
  };
  const r = await req(env, "PUT", `/admin/applicants/${id}`, { updated_at: applicant.updated_at, stage: "searching" });
  assert.equal(r.status, 409);
  assert.equal(r.data.error, STALE);
  assert.equal(row(env, "SELECT stage FROM applicants WHERE id = ?", id).stage, "new");
  assert.equal(row(env, "SELECT COUNT(*) AS n FROM events").n, events);
});

test("assigning closes the new-applicant notice", async () => {
  const env = makeEnv();
  const id = await create(env);
  const open = () => row(env, `SELECT COUNT(*) AS n FROM notifications n JOIN events e ON e.id = n.event_id
    WHERE e.entity_id = ? AND n.resolved_at IS NULL`, String(id)).n;
  // The website's entry needs action (Task 11 writes it); mimic it on the same applicant.
  env.DB.raw.prepare("INSERT INTO events (at, actor, entity_type, entity_id, type) VALUES (?, 'public', 'applicant', ?, 'applicant.created')").run(T0, String(id));
  env.DB.raw.prepare("INSERT INTO notifications (event_id, category, title, action_required, created_at) VALUES (last_insert_rowid(), 'new_applicant', 'New applicant', 1, ?)").run(T0);
  assert.equal(open(), 2);

  let { applicant } = await detail(env, id);
  const req1 = await req(env, "PUT", `/admin/applicants/${id}`, { updated_at: applicant.updated_at, requirements: "Quiet street" });
  assert.equal(req1.status, 200);
  assert.equal(open(), 2, "editing requirements leaves the notice open");

  const r = await req(env, "PUT", `/admin/applicants/${id}`, { updated_at: req1.data.applicant.updated_at, assigned_to: ` ${OTHER.toUpperCase()} ` });
  assert.equal(r.status, 200);
  assert.equal(r.data.applicant.assigned_to, OTHER);
  assert.equal(r.data.applicant.stage, "new");
  assert.equal(open(), 0);
  assert.equal(row(env, "SELECT resolved_by FROM notifications WHERE action_required = 1").resolved_by, ADMIN);
});

test("leaving the new stage also closes it", async () => {
  const env = makeEnv();
  const id = await create(env);
  env.DB.raw.prepare("INSERT INTO events (at, actor, entity_type, entity_id, type) VALUES (?, 'public', 'applicant', ?, 'applicant.created')").run(T0, String(id));
  env.DB.raw.prepare("INSERT INTO notifications (event_id, category, title, action_required, created_at) VALUES (last_insert_rowid(), 'new_applicant', 'New applicant', 1, ?)").run(T0);
  const { applicant } = await detail(env, id);
  await req(env, "PUT", `/admin/applicants/${id}`, { updated_at: applicant.updated_at, stage: "searching" });
  assert.equal(row(env, "SELECT COUNT(*) AS n FROM notifications WHERE resolved_at IS NULL").n, 0);
});

test("contact edits: stale saves and an email or phone of another contact are refused", async () => {
  const env = makeEnv();
  const a = await create(env);
  await create(env, { name: "Tom Vibert", email: "tom@example.je", phone: "07797 654321" });
  const { contact } = await detail(env, a);
  const path = `/admin/contacts/${contact.id}`;

  const ok = await req(env, "PUT", path, { updated_at: contact.updated_at, best_time: "After 6pm", email: " Jane.LB@Example.je" });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  assert.equal(ok.data.contact.email, "jane.lb@example.je");
  assert.equal(ok.data.contact.phone, "+447797123456");
  const ev = row(env, "SELECT * FROM events WHERE type = 'contact.updated'");
  assert.equal(ev.entity_type, "contact");
  assert.equal(ev.entity_id, String(contact.id));
  assert.deepEqual(JSON.parse(ev.data), { before: { email: "jane@example.je", best_time: null },
    after: { email: "jane.lb@example.je", best_time: "After 6pm" } });

  const stale = await req(env, "PUT", path, { updated_at: contact.updated_at, best_time: "Mornings" });
  assert.equal(stale.status, 409);
  assert.equal(stale.data.error, "Someone else saved changes to this contact. Reload to see them (your changes were not saved).");

  const cur = ok.data.contact;
  for (const taken of [{ email: "TOM@example.je" }, { phone: "+44 7797 654321" }]) {
    const r = await req(env, "PUT", path, { updated_at: cur.updated_at, ...taken });
    assert.equal(r.status, 409, JSON.stringify(taken));
    assert.ok(r.data.contact_id);
  }
  const noVersion = await req(env, "PUT", path, { best_time: "Mornings" });
  assert.equal(noVersion.status, 400);
  assert.equal(noVersion.data.error, "Missing updated_at: reload the contact");
  const none = await req(env, "PUT", path, { updated_at: cur.updated_at, email: null, phone: "" });
  assert.equal(none.status, 400);
  assert.ok(none.data.fields.email);
});

test("the team confirms or withdraws marketing consent, logged as consent_changed", async () => {
  const env = makeEnv();
  const { contact } = await detail(env, await create(env));
  const path = `/admin/contacts/${contact.id}`;
  assert.equal(contact.marketing_opt_in_at, null);
  assert.equal((await req(env, "PUT", path, { updated_at: contact.updated_at, marketing: "yes" })).status, 400);

  const on = await req(env, "PUT", path, { updated_at: contact.updated_at, marketing: true });
  assert.equal(on.status, 200, JSON.stringify(on.data));
  const at = on.data.contact.marketing_opt_in_at;
  assert.ok(at);
  assert.equal(on.data.contact.consent_source, "web", "a confirmed opt-in came from the website's second submission");
  assert.equal(on.data.contact.updated_by, ADMIN);
  const ev = rows(env, "SELECT * FROM events WHERE entity_type = 'contact' ORDER BY id");
  assert.deepEqual(ev.map(e => e.type), ["contact.consent_changed"]);
  assert.deepEqual(JSON.parse(ev[0].data), { before: { marketing_opt_in_at: null }, after: { marketing_opt_in_at: at } });

  // Already opted in: nothing changes, the first date stays.
  const again = await req(env, "PUT", path, { updated_at: on.data.contact.updated_at, marketing: true });
  assert.equal(again.data.contact.marketing_opt_in_at, at);
  assert.equal(row(env, "SELECT COUNT(*) AS n FROM events WHERE type = 'contact.consent_changed'").n, 1);

  const off = await req(env, "PUT", path, { updated_at: on.data.contact.updated_at, marketing: false, best_time: "Evenings" });
  assert.equal(off.status, 200, JSON.stringify(off.data));
  assert.equal(off.data.contact.marketing_opt_in_at, null);
  assert.deepEqual(rows(env, "SELECT type FROM events WHERE entity_type = 'contact' ORDER BY id").map(e => e.type),
    ["contact.consent_changed", "contact.updated", "contact.consent_changed"]);
});

test("confirming an opt-in keeps a consent source already on file", async () => {
  const env = makeEnv();
  const { contact } = await detail(env, await create(env, { privacy: true }));
  assert.equal(contact.consent_source, "phone");
  const on = await req(env, "PUT", `/admin/contacts/${contact.id}`, { updated_at: contact.updated_at, marketing: true });
  assert.equal(on.status, 200, JSON.stringify(on.data));
  assert.ok(on.data.contact.marketing_opt_in_at);
  assert.equal(on.data.contact.consent_source, "phone");
});

test("an archived search is read only until restored", async () => {
  const env = makeEnv();
  const id = await create(env);
  assert.equal((await req(env, "POST", `/admin/applicants/${id}/archive`)).status, 200);
  const { applicant } = await detail(env, id);
  const events = row(env, "SELECT COUNT(*) AS n FROM events").n;
  const r = await req(env, "PUT", `/admin/applicants/${id}`, { updated_at: applicant.updated_at, requirements: "Garden" });
  assert.equal(r.status, 409);
  assert.equal(r.data.error, "Restore this search to edit it");
  assert.equal(row(env, "SELECT requirements FROM applicants WHERE id = ?", id).requirements, null);
  assert.equal(row(env, "SELECT COUNT(*) AS n FROM events").n, events);
});

// Archive + permanent delete land between the route's read and its batch.
const deletedMidFlight = (env, id, name = "Jane Le Brocq") => {
  const batch = env.DB.batch.bind(env.DB);
  env.DB.batch = async stmts => {
    env.DB.batch = batch;
    if (!row(env, "SELECT archived_at FROM applicants WHERE id = ?", id).archived_at)
      assert.equal((await req(env, "POST", `/admin/applicants/${id}/archive`)).status, 200);
    assert.equal((await req(env, "DELETE", `/admin/applicants/${id}`, { confirm: name })).status, 200);
    return batch(stmts);
  };
};
const dataLeft = env => rows(env, "SELECT type FROM events WHERE data IS NOT NULL AND entity_type IN ('applicant', 'contact')");

test("a contact deleted while its edit is saving: 404 and no personal data left in the history", async () => {
  const env = makeEnv();
  const id = await create(env);
  const { contact } = await detail(env, id);
  deletedMidFlight(env, id);
  const r = await req(env, "PUT", `/admin/contacts/${contact.id}`,
    { updated_at: contact.updated_at, email: "jane.new@example.je", marketing: true });
  assert.equal(r.status, 404);
  assert.equal(r.data.error, "Contact not found");
  assert.equal(row(env, "SELECT COUNT(*) AS n FROM contacts").n, 0);
  assert.deepEqual(dataLeft(env), []);
});

test("an applicant deleted while its edit is saving: 404 and no data left in the history", async () => {
  const env = makeEnv();
  const id = await create(env);
  const { applicant } = await detail(env, id);
  deletedMidFlight(env, id);
  const r = await req(env, "PUT", `/admin/applicants/${id}`, { updated_at: applicant.updated_at, requirements: "Near the school" });
  assert.equal(r.status, 404);
  assert.equal(r.data.error, "Applicant not found");
  assert.deepEqual(dataLeft(env), []);
});

test("archive closes the open notices; restore brings it back to the list", async () => {
  const env = makeEnv();
  const id = await create(env);
  env.DB.raw.prepare("INSERT INTO events (at, actor, entity_type, entity_id, type) VALUES (?, 'public', 'applicant', ?, 'applicant.created')").run(T0, String(id));
  env.DB.raw.prepare("INSERT INTO notifications (event_id, category, title, action_required, created_at) VALUES (last_insert_rowid(), 'new_applicant', 'New applicant', 1, ?)").run(T0);
  const ids = async q => (await req(env, "GET", `/admin/applicants${q}`)).data.applicants.map(x => x.id);

  const r = await req(env, "POST", `/admin/applicants/${id}/archive`);
  assert.equal(r.status, 200);
  assert.ok(r.data.applicant.archived_at);
  assert.equal(row(env, "SELECT COUNT(*) AS n FROM notifications WHERE resolved_at IS NULL").n, 0);
  assert.deepEqual(await ids(""), []);
  assert.deepEqual(await ids("?archived=1"), [id]);
  assert.equal((await req(env, "POST", `/admin/applicants/${id}/archive`)).status, 400);

  assert.equal((await req(env, "POST", `/admin/applicants/${id}/restore`)).status, 200);
  assert.deepEqual(await ids(""), [id]);
  assert.equal((await req(env, "POST", `/admin/applicants/${id}/restore`)).status, 400);
  assert.deepEqual(rows(env, "SELECT type FROM events WHERE type LIKE 'applicant.%ed' AND actor = ? ORDER BY id", ADMIN).map(e => e.type),
    ["applicant.created", "applicant.archived", "applicant.restored"]);
});

test("detail shows viewing requests with the same email or phone", async () => {
  const env = makeEnv();
  const id = await create(env, { email: "jane@example.je", phone: "+447797123456" });
  const viewing = (o) => Number(env.DB.raw.prepare(
    "INSERT INTO viewing_requests (kind, date, time, name, email, phone, created_at) VALUES ('In person', '2026-11-02', '11:30', ?, ?, ?, ?)")
    .run(o.name, o.email, o.phone ?? null, o.at).lastInsertRowid);
  const byPhone = viewing({ name: "J Le Brocq", email: "work@example.je", phone: "07797 123 456", at: "2026-10-20T09:00:00.000Z" });
  const byEmail = viewing({ name: "Jane", email: "Jane@Example.je", at: "2026-10-21T09:00:00.000Z" });
  viewing({ name: "Tom", email: "tom@example.je", phone: "07797 654321", at: "2026-10-22T09:00:00.000Z" });

  const d = await detail(env, id);
  assert.deepEqual(d.viewings.map(v => v.id), [byEmail, byPhone]);
  assert.equal(d.applicant.id, id);
  assert.equal(d.contact.email, "jane@example.je");
  assert.deepEqual(d.events.map(e => e.type), ["applicant.created"]);
  assert.deepEqual(d.events[0].data, { operation: "rent", source: "phone" });
  assert.deepEqual(d.duplicates, []);
  assert.equal((await req(env, "GET", "/admin/applicants/999")).status, 404);
});

test("detail lists contact events with the applicant's, newest first, and the open duplicate submissions", async () => {
  const env = makeEnv();
  const id = await create(env);
  const { contact } = await detail(env, id);
  const dup = (at, resolved) => {
    env.DB.raw.prepare("INSERT INTO events (at, actor, entity_type, entity_id, type, data) VALUES (?, 'public', 'contact', ?, 'applicant.duplicate_submitted', ?)")
      .run(at, String(contact.id), JSON.stringify({ operation: "rent", budget_max: 3000 }));
    return Number(env.DB.raw.prepare("INSERT INTO notifications (event_id, category, title, action_required, created_at, resolved_at) VALUES (last_insert_rowid(), 'new_applicant', 'Jane Le Brocq registered again', 1, ?, ?)")
      .run(at, resolved).lastInsertRowid);
  };
  const open = dup("2999-01-01T00:00:00.000Z", null);
  dup("2999-01-02T00:00:00.000Z", "2999-01-03T00:00:00.000Z");
  const d = await detail(env, id);
  assert.deepEqual(d.events.map(e => [e.entity_type, e.type]),
    [["contact", "applicant.duplicate_submitted"], ["contact", "applicant.duplicate_submitted"], ["applicant", "applicant.created"]]);
  assert.equal(d.duplicates.length, 1);
  assert.equal(d.duplicates[0].id, open);
  assert.deepEqual(d.duplicates[0].data, { operation: "rent", budget_max: 3000 });
});

test("permanent delete only from Archived, with the exact name, and wipes personal data from history", async () => {
  const env = makeEnv();
  const id = await create(env, { requirements: "Jane's private notes" });
  const { applicant, contact } = await detail(env, id);
  await req(env, "PUT", `/admin/applicants/${id}`, { updated_at: applicant.updated_at, requirements: "Changed notes" });
  await req(env, "PUT", `/admin/contacts/${contact.id}`, { updated_at: contact.updated_at, best_time: "Evenings" });
  env.DB.raw.prepare("INSERT INTO events (at, actor, entity_type, entity_id, type, data) VALUES (?, 'public', 'contact', ?, 'applicant.duplicate_submitted', ?)")
    .run(T0, String(contact.id), JSON.stringify({ name: "Jane Le Brocq", phone: "+447797123456" }));
  env.DB.raw.prepare("INSERT INTO notifications (event_id, category, title, action_required, created_at) VALUES (last_insert_rowid(), 'new_applicant', 'Jane Le Brocq registered again', 1, ?)").run(T0);
  const path = `/admin/applicants/${id}`;

  const active = await req(env, "DELETE", path, { confirm: "Jane Le Brocq" });
  assert.equal(active.status, 400, "not archived yet");
  await req(env, "POST", `${path}/archive`);
  for (const confirm of ["jane le brocq", "Jane", undefined]) {
    const r = await req(env, "DELETE", path, { confirm });
    assert.equal(r.status, 400, String(confirm));
    assert.equal(r.data.error, "Type Jane Le Brocq to confirm deletion");
  }
  assert.ok(row(env, "SELECT id FROM applicants WHERE id = ?", id));

  const r = await req(env, "DELETE", path, { confirm: "Jane Le Brocq" });
  assert.equal(r.status, 200);
  assert.equal(row(env, "SELECT COUNT(*) AS n FROM applicants").n, 0);
  assert.equal(row(env, "SELECT COUNT(*) AS n FROM contacts").n, 0, "the contact had no other searches");
  const history = rows(env, "SELECT * FROM events WHERE entity_type IN ('applicant', 'contact') ORDER BY id");
  assert.ok(history.length >= 6);
  assert.ok(history.every(e => e.data === null), "only type, date and actor are kept");
  assert.deepEqual(history.map(e => e.type).filter(t => t.endsWith(".deleted")), ["applicant.deleted", "contact.deleted"]);
  const notices = rows(env, "SELECT * FROM notifications");
  assert.ok(notices.every(n => n.title === "Deleted applicant"));
  assert.ok(notices.every(n => n.resolved_at), "nothing left open in the Inbox");
  assert.equal((await req(env, "GET", path)).status, 404);
  assert.equal((await req(env, "DELETE", path, { confirm: "Jane Le Brocq" })).status, 404);
  assert.equal((await req(env, "GET", "/admin/notifications?box=feed")).status, 200, "the Inbox still reads the wiped events");
});

test("a permanently deleted search or contact never lends its id, or its history, to a new one", async () => {
  const env = makeEnv();
  const id = await create(env);
  const contactId = row(env, "SELECT contact_id FROM applicants WHERE id = ?", id).contact_id;
  assert.equal((await req(env, "POST", `/admin/applicants/${id}/archive`)).status, 200);
  assert.equal((await req(env, "DELETE", `/admin/applicants/${id}`, { confirm: "Jane Le Brocq" })).status, 200);
  const next = await create(env, { name: "Tom Vibert", email: "tom@example.je", phone: "07797 654321" });
  assert.notEqual(next, id);
  const d = await detail(env, next);
  assert.notEqual(d.contact.id, contactId);
  assert.deepEqual(d.events.map(e => e.type), ["applicant.created"], "only the new search's own history");
});

test("deleting one of two searches keeps the contact and its own history", async () => {
  const env = makeEnv();
  const first = await create(env);
  const contactId = row(env, "SELECT contact_id FROM applicants WHERE id = ?", first).contact_id;
  const second = (await req(env, "POST", "/admin/applicants", form({ contact_id: contactId, operation: "buy", budget_max: 450000 }))).data.id;
  const { contact } = await detail(env, first);
  await req(env, "PUT", `/admin/contacts/${contact.id}`, { updated_at: contact.updated_at, best_time: "Evenings" });
  await req(env, "POST", `/admin/applicants/${second}/archive`);
  assert.equal((await req(env, "DELETE", `/admin/applicants/${second}`, { confirm: "Jane Le Brocq" })).status, 200);

  assert.ok(row(env, "SELECT id FROM contacts WHERE id = ?", contactId));
  assert.ok(row(env, "SELECT id FROM applicants WHERE id = ?", first));
  assert.ok(row(env, "SELECT data FROM events WHERE type = 'contact.updated'").data);
  assert.ok(row(env, "SELECT data FROM events WHERE type = 'applicant.created' AND entity_id = ?", String(first)).data);
  assert.equal(row(env, "SELECT data FROM events WHERE type = 'applicant.created' AND entity_id = ?", String(second)).data, null);
  assert.equal(row(env, "SELECT COUNT(*) AS n FROM events WHERE type = 'contact.deleted'").n, 0);
});

test("users can carry a display name", async () => {
  const env = makeEnv();
  const users = async () => (await req(env, "GET", "/admin/users")).data.users;
  assert.equal((await req(env, "POST", "/admin/users", { email: "Sam@Hampton.je", name: " Sam Le Sueur " })).status, 201);
  assert.equal((await users()).find(u => u.email === "sam@hampton.je").name, "Sam Le Sueur");
  assert.equal((await users()).find(u => u.email === ADMIN).name, null);

  assert.equal((await req(env, "PUT", `/admin/users/${encodeURIComponent(ADMIN)}`, { name: "Luis" })).status, 200);
  assert.equal((await users()).find(u => u.email === ADMIN).name, "Luis");
  assert.equal((await req(env, "PUT", "/admin/users/sam%40hampton.je", { name: "" })).status, 200);
  assert.equal((await users()).find(u => u.email === "sam@hampton.je").name, null, "blank clears it");

  for (const body of [{ name: "x".repeat(81) }, { name: 5 }, {}])
    assert.equal((await req(env, "PUT", "/admin/users/sam%40hampton.je", body)).status, 400, JSON.stringify(body));
  assert.equal((await req(env, "POST", "/admin/users", { email: "new@hampton.je", name: "x".repeat(81) })).status, 400);
  assert.equal((await req(env, "PUT", "/admin/users/nobody%40hampton.je", { name: "Nobody" })).status, 404);
});

test("each pending duplicate says whether the contact already has an active search of that operation", async () => {
  // The contact has an open buy search, plus (or not) a rent search in the given stage; the duplicate asks to rent.
  for (const [rentStage, expectRent] of [[null, false], ["searching", true], ["lost", false]]) {
    const env = makeEnv();
    const buy = await create(env, { operation: "buy", budget_max: 450000 });
    const contactId = row(env, "SELECT contact_id FROM applicants WHERE id = ?", buy).contact_id;
    let rent = null;
    if (rentStage) {
      rent = (await req(env, "POST", "/admin/applicants", form({ contact_id: contactId }))).data.id;
      env.DB.raw.prepare("UPDATE applicants SET stage = ?, lost_reason = ? WHERE id = ?")
        .run(rentStage, rentStage === "lost" ? "Found elsewhere" : null, rent);
    }
    env.DB.raw.prepare("INSERT INTO events (at, actor, entity_type, entity_id, type, data) VALUES (?, 'public', 'contact', ?, 'applicant.duplicate_submitted', ?)")
      .run(T0, String(contactId), JSON.stringify({ operation: "rent" }));
    env.DB.raw.prepare("INSERT INTO notifications (event_id, category, title, action_required, created_at) VALUES (last_insert_rowid(), 'new_applicant', 'Jane Le Brocq registered again', 1, ?)").run(T0);
    const [dup] = (await detail(env, buy)).duplicates;
    assert.equal(dup.active_search_id, expectRent ? rent : null, String(rentStage));
  }
});

test("a new search for a contact with an active search of that operation is refused", async () => {
  const env = makeEnv();
  const rent = await create(env);
  const contactId = row(env, "SELECT contact_id FROM applicants WHERE id = ?", rent).contact_id;
  const counts = () => [row(env, "SELECT COUNT(*) AS n FROM applicants").n, row(env, "SELECT COUNT(*) AS n FROM events").n,
    row(env, "SELECT last_activity_at FROM contacts WHERE id = ?", contactId).last_activity_at];
  const before = counts();
  const r = await req(env, "POST", "/admin/applicants", form({ contact_id: contactId }));
  assert.equal(r.status, 409);
  assert.deepEqual(r.data, { error: "Jane Le Brocq already has an active To Let search", applicant_id: rent });
  assert.deepEqual(counts(), before, "nothing written");

  env.DB.raw.prepare("UPDATE applicants SET stage = 'completed' WHERE id = ?").run(rent);
  assert.equal((await req(env, "POST", "/admin/applicants", form({ contact_id: contactId }))).status, 201, "a completed search is over");
});

test("a stale save is 409 whatever the database error says", async () => {
  const env = makeEnv();
  const id = await create(env);
  const { applicant, contact } = await detail(env, id);
  const batch = env.DB.batch.bind(env.DB);
  const racing = table => async stmts => {
    env.DB.raw.prepare(`UPDATE ${table} SET updated_at = ? WHERE id = ?`).run("2026-10-23T12:00:00.000Z", table === "applicants" ? id : contact.id);
    try { return await batch(stmts); } catch { throw new Error("D1_ERROR: something else entirely"); }
  };
  env.DB.batch = racing("applicants");
  const a = await req(env, "PUT", `/admin/applicants/${id}`, { updated_at: applicant.updated_at, stage: "searching" });
  assert.equal(a.status, 409);
  assert.equal(a.data.error, STALE);
  env.DB.batch = racing("contacts");
  const c = await req(env, "PUT", `/admin/contacts/${contact.id}`, { updated_at: contact.updated_at, best_time: "Evenings" });
  assert.equal(c.status, 409);
  assert.equal(c.data.error, "Someone else saved changes to this contact. Reload to see them (your changes were not saved).");

  // Not a version problem: the error is passed on (500).
  env.DB.batch = async () => { throw new Error("D1 down"); };
  const fresh = row(env, "SELECT updated_at FROM applicants WHERE id = ?", id).updated_at;
  const orig = console.error; console.error = () => {};
  try { assert.equal((await req(env, "PUT", `/admin/applicants/${id}`, { updated_at: fresh, stage: "viewing" })).status, 500); }
  finally { console.error = orig; }
});

test("a contact can be read by its id, for a new search started from it", async () => {
  const env = makeEnv();
  const id = await create(env);
  const contactId = row(env, "SELECT contact_id FROM applicants WHERE id = ?", id).contact_id;
  const r = await req(env, "GET", `/admin/contacts/${contactId}`);
  assert.equal(r.status, 200);
  assert.deepEqual({ id: r.data.contact.id, name: r.data.contact.name, email: r.data.contact.email, phone: r.data.contact.phone },
    { id: contactId, name: "Jane Le Brocq", email: "jane@example.je", phone: "+447797123456" });
  assert.equal((await req(env, "GET", "/admin/contacts/999")).status, 404);
});
