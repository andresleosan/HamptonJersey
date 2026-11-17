// EST-10: the applicants list reads each work label from its real source (a viewing a person linked to the search through
// VIS-17, BUS-17's open review, a match with an essential fact to confirm), in the same query and through indexes; off,
// the list is read exactly as before. Synthetic data only.
import test from "node:test";
import assert from "node:assert/strict";
import { makeEnv, seedListing, call, adminCookie, T0, captured, plan } from "./listing-client.mjs";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { jerseyToday, jerseyNow } from "../../server/viewings.js";

const ON = { EST10_LABELS_READY: "1", VIS17_MULTIPART_READY: "1", BUS17_REVIEW_READY: "1" };
const run = (env, sql, ...args) => env.DB.raw.prepare(sql).run(...args);
const get = (env, sql, ...args) => env.DB.raw.prepare(sql).get(...args);
const req = async (env, path) => call(env, "GET", path, { cookie: await adminCookie() });
const ok = r => { assert.equal(r.status, 200, JSON.stringify(r.data)); return r.data; };
const list = async (env, q = "") => ok(await req(env, `/admin/applicants?sort=oldest${q}`));
const shift = days => new Date(Date.parse(`${jerseyToday()}T12:00:00Z`) + days * 864e5).toISOString().slice(0, 10);

let people = 0;
function search(env, name, over = {}) {
  const n = ++people;
  const c = run(env, "INSERT INTO contacts (name, email, last_activity_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
    name, `est10-${n}@example.test`, T0, T0, T0);
  const a = { contact_id: Number(c.lastInsertRowid), operation: "rent", stage: "searching", source: "phone", budget_max: 2000,
    created_at: new Date(Date.parse(T0) + n * 6e4).toISOString(), updated_at: T0, ...over };
  const cols = Object.keys(a);
  return Number(run(env, `INSERT INTO applicants (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`, ...Object.values(a)).lastInsertRowid);
}
const match = (env, a, listing, status = "found", rank = 0) => run(env, `INSERT INTO matches (applicant_id, listing_id, score, checks, status,
  reject_reason, requirements_rank, created_at, updated_at) VALUES (?, ?, 50, '[]', ?, ?, ?, ?, ?)`, a, listing, status,
  status === "rejected" ? "area" : null, rank, T0, T0);
// A viewing; linked: VIS-17 proposals naming a search (revisions 1, 2… as [search, state, date]), never an email or phone
// that matches. proposal: one revision for search a.
function viewing(env, a, { status = "requested", date = shift(2), time = "10:00", end = "10:30", proposal = null,
  proposals = proposal ? [[a, proposal]] : [] } = {}) {
  const neg = get(env, "SELECT id FROM negotiators ORDER BY id LIMIT 1").id;
  const email = get(env, "SELECT c.email FROM applicants a JOIN contacts c ON c.id = a.contact_id WHERE a.id = ?", a).email;
  const v = Number(run(env, `INSERT INTO viewing_requests (listing_id, kind, date, time, end_time, name, email, status, created_at, negotiator_id)
    VALUES ('HE-R001', 'viewing', ?, ?, ?, 'Fixture', ?, ?, ?, ?)`, date, time, end, email, status, T0, neg).lastInsertRowid);
  proposals.forEach(([who, state, on = date], i) => run(env, `INSERT INTO viewing_proposals (viewing_id, revision, applicant_id, negotiator_id,
      date, time, end_time, required, from_status, from_date, from_time, state, created_at, created_by, closed_at, closed_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, '["client"]', 'requested', ?, ?, ?, ?, 'admin@example.test', ?, ?)`,
    v, i + 1, who, neg, on, time, end, date, time, state, T0, state === "open" ? null : T0, state === "open" ? null : "admin@example.test"));
  return v;
}
// Jersey now, as the list reads it: a viewing of today counts while its end is later.
const clock = jerseyNow(), nowKey = `${clock.date} ${clock.time}`, ahead = end => `${clock.date} ${end}` > nowKey;
// BUS-17's review of a search, its Inbox task open unless done, the review closed when closed.
function review(env, a, { done = false, closed = false, cycle = 1 } = {}) {
  const r = Number(run(env, `INSERT INTO search_reviews (applicant_id, episode, cycle, due_at, opened_at, alternatives, closed_at, outcome)
    VALUES (?, 1, ?, ?, ?, '[]', ?, ?)`, a, cycle, T0, T0, closed ? T0 : null, closed ? "reviewed" : null).lastInsertRowid);
  const e = Number(run(env, `INSERT INTO events (at, actor, entity_type, entity_id, type, data) VALUES (?, 'system', 'applicant', ?,
    'applicant.search_review', json_object('review_id', ?))`, T0, String(a), r).lastInsertRowid);
  run(env, `INSERT INTO notifications (event_id, category, title, task_reason, action_required, created_at, task_key, resolved_at, resolved_by)
    VALUES (?, 'task', 'Review search', 'Fixture', 1, ?, ?, ?, ?)`, e, T0, `bus17:review:${r}`, done ? T0 : null, done ? "admin@example.test" : null);
}

function world(flags = ON, schema = {}) {
  const env = Object.assign(makeEnv(schema), flags);
  people = 0; // each world the same people, so two worlds compare equal
  for (const id of ["HE-R001", "HE-R002"]) seedListing(env, { id, matchable: 1, operation: "rent", availability: "to_let", rent: 1500,
    rent_period: "month", sale_price: null });
  const id = {};
  id.pending = search(env, "Pending"); viewing(env, id.pending, { proposal: "open" });
  id.held = search(env, "Held"); viewing(env, id.held, { proposal: "declined" }); // a request still held, its proposal declined
  id.booked = search(env, "Booked"); viewing(env, id.booked, { status: "confirmed", proposal: "confirmed" });
  id.unlinked = search(env, "Unlinked"); viewing(env, id.unlinked, { status: "confirmed" });
  id.past = search(env, "Past"); viewing(env, id.past, { status: "confirmed", date: shift(-3), proposal: "confirmed" });
  id.review = search(env, "Review"); review(env, id.review); match(env, id.review, "HE-R001");
  id.done = search(env, "Done"); review(env, id.done, { done: true });
  id.closed = search(env, "Closed"); review(env, id.closed, { closed: true });
  id.essential = search(env, "Essential"); match(env, id.essential, "HE-R001", "found", 1); match(env, id.essential, "HE-R002", "rejected", 1);
  id.rejected = search(env, "Rejected essential"); match(env, id.rejected, "HE-R001", "rejected", 1);
  id.resolved = search(env, "Resolved", { search_state: "resolved", resolution_reason: "found_elsewhere", resolved_at: T0, resolved_by: "admin@example.test" });
  viewing(env, id.resolved, { status: "confirmed", proposal: "confirmed" });
  // An open proposal and a request whose time has passed, nobody having closed them: nothing pending.
  id.stale = search(env, "Stale"); viewing(env, id.stale, { date: shift(-5), proposals: [[id.stale, "open", shift(-4)]] });
  // Linked to A by mistake, then re-linked to B (revision 2): only the latest proposal links it.
  id.relinkA = search(env, "Relinked first"); id.relinkB = search(env, "Relinked second");
  viewing(env, id.relinkB, { status: "confirmed", date: shift(3), proposals: [[id.relinkA, "superseded"], [id.relinkB, "confirmed"]] });
  // An open proposal left on a viewing cancelled meanwhile (switched off): not pending.
  id.cancelled = search(env, "Cancelled"); viewing(env, id.cancelled, { status: "cancelled", date: shift(3), proposal: "open" });
  // Today: one already over, one still to come (each as the clock reads it now).
  id.ended = search(env, "Ended today"); viewing(env, id.ended, { status: "confirmed", date: clock.date, time: "00:00", end: "00:01", proposal: "confirmed" });
  id.later = search(env, "Later today"); viewing(env, id.later, { status: "confirmed", date: clock.date, time: "23:58", end: "23:59", proposal: "confirmed" });
  // A commercial search is not in the work queue: no label is read for it.
  id.commercial = search(env, "Commercial", { search_category: "commercial", commercial_kind: "property" });
  viewing(env, id.commercial, { status: "confirmed", proposal: "confirmed" });
  return { env, id };
}
const labelsOf = (data, id) => Object.fromEntries(Object.entries(id).map(([k, v]) => [k, data.applicants.find(a => a.id === v)?.work_labels]));

test("each label comes from its real source, several at once, and no source is inferred", async () => {
  const { env, id } = world();
  const data = await list(env);
  assert.deepEqual(data.work_labels, ["essential", "viewing_pending", "viewing_booked", "search_review"]);
  assert.deepEqual(labelsOf(data, id), {
    pending: ["viewing_pending"], held: ["viewing_pending"],
    booked: ["viewing_booked"], // no_visit_confirmation_from_request: only the viewing's own confirmed state books it
    unlinked: [], // visit_unlinked_pending_not_booked: same email, no link by a person, no label
    past: [],
    review: ["review", "search_review"], // review_and_waiting_together
    done: [], closed: [], // review7_days_after_close: Done or closed, nothing until BUS-17 opens the next
    essential: ["review", "essential"], rejected: [],
    resolved: null, // ready_not_search_resolved: a resolved search keeps its history only
    stale: [], relinkA: [], relinkB: ["viewing_booked"], cancelled: [],
    ended: ahead("00:01") ? ["viewing_booked"] : [], later: ahead("23:59") ? ["viewing_booked"] : [],
    commercial: null,
  });
  for (const a of data.applicants) for (const k of ["essential", "viewing_pending", "viewing_booked", "search_review"]) assert.equal(k in a, false);
});

test("each new label filters the list, and reading changes no search", async () => {
  const { env, id } = world();
  const before = env.DB.raw.prepare("SELECT id, search_state, updated_at, matches_revision FROM applicants ORDER BY id").all();
  const today = [...(ahead("00:01") ? [id.ended] : []), ...(ahead("23:59") ? [id.later] : [])];
  for (const [label, ids] of [["viewing_pending", [id.pending, id.held]], ["viewing_booked", [id.booked, id.relinkB, ...today]],
    ["search_review", [id.review]], ["essential", [id.essential]], ["review", [id.review, id.essential]]])
    assert.deepEqual((await list(env, `&work_label=${label}`)).applicants.map(a => a.id), ids, label);
  // no_pending keeps its meaning (no match waiting for review or shortlisted), whatever other labels a search carries.
  const none = (await list(env, "&work_label=no_pending")).applicants;
  assert.deepEqual(none.find(a => a.id === id.booked).work_labels, ["viewing_booked"]);
  assert.equal(none.some(a => a.found > 0 || a.shortlisted > 0), false);
  assert.deepEqual(env.DB.raw.prepare("SELECT id, search_state, updated_at, matches_revision FROM applicants ORDER BY id").all(), before);
});

test("the labels are read in the list's own query, through indexes", async () => {
  const { env } = world();
  const main = captured(env, /WITH listed/);
  await list(env);
  assert.equal(main.length, 1);
  const p = plan(env, main[0]);
  assert.match(p, /viewing_proposals_applicant/);
  assert.match(p, /search_reviews_one_open/);
  for (const t of ["p", "v", "r", "m", "n"]) assert.doesNotMatch(p, new RegExp(`SCAN ${t}\\b`), t);
});

test("off, the list's SQL, binds and response are those of before", async () => {
  const off = world({ ...ON, EST10_LABELS_READY: "0" }), absent = world({ VIS17_MULTIPART_READY: "1", BUS17_REVIEW_READY: "1" });
  const seen = [off, absent].map(w => captured(w.env, /WITH listed|sqlite_master/));
  const [a, b] = [await list(off.env), await list(absent.env)];
  const same = q => q.map(({ sql, args }) => ({ sql, args: args.filter((_, i) => i !== 2) })); // [2]: the 14-day cutoff, from the clock
  assert.deepEqual(same(seen[0]), same(seen[1]));
  assert.equal(seen[0].length, 1);
  assert.equal(seen[0][0].args.length, 3);
  assert.doesNotMatch(seen[0][0].sql, /viewing_proposals|search_reviews|requirements_rank/);
  assert.deepEqual(a, b);
  assert.equal("work_labels" in a, false);
  assert.equal(a.applicants.some(r => "work_labels" in r), false);
  assert.equal((await req(off.env, "/admin/applicants?work_label=viewing_booked")).status, 400);
});

// The list as it was before EST-10 (42b168f6), loaded beside the current one: switched off, both run the same SQL.
test("off, the list runs exactly the SQL of before EST-10", async t => {
  let old;
  try { old = execFileSync("git", ["show", "42b168f6:server/routes/applicants.js"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }); }
  catch { return t.skip("git history not available"); }
  const dir = mkdtempSync(join(tmpdir(), "est10-baseline-")), file = join(dir, "applicants.mjs");
  const server = new URL("../../server/", import.meta.url).href;
  writeFileSync(file, old.replaceAll('from "../../site/', `from "${new URL("../../site/", import.meta.url).href}`)
    .replaceAll('from "../', `from "${server}`).replaceAll('from "./', `from "${server}routes/`));
  try {
    const lists = [(await import(pathToFileURL(file).href)).default, (await import("../../server/routes/applicants.js")).default]
      .map(routes => routes.find(([method, path]) => method === "GET" && path.test("/admin/applicants"))[2]);
    for (const q of ["sort=oldest", "work_label=review&queue=Waiting%20for%20review", "archived=1&q=Fixture", "expiring=1"]) {
      const sql = [];
      for (const handler of lists) {
        const { env } = world({ ...ON, EST10_LABELS_READY: "0", SAP02_COUNTS_READY: "1" });
        const seen = captured(env, /WITH listed/);
        const r = await handler({ request: new Request(`https://example.test/api/admin/applicants?${q}`), env });
        assert.equal(r.status, 200);
        sql.push(seen.map(s => ({ sql: s.sql, args: s.args.filter((_, i) => i !== 2) })));
      }
      assert.deepEqual(sql[1], sql[0], q);
      assert.equal(sql[0].length, 1);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("missing_provider_pending_not_zero: a source off or not migrated is not read and its labels are not offered", async () => {
  const { env, id } = world({ EST10_LABELS_READY: "1", BUS17_REVIEW_READY: "1" });
  const seen = captured(env, /WITH listed/);
  const data = await list(env);
  assert.deepEqual(data.work_labels, ["essential", "search_review"]);
  assert.doesNotMatch(seen[0].sql, /viewing_proposals/);
  assert.deepEqual(labelsOf(data, id).booked, []);
  assert.equal((await req(env, "/admin/applicants?work_label=viewing_booked")).status, 400);

  const early = Object.assign(makeEnv({ through: 98 }), ON);
  search(early, "Before the migrations");
  const d = await list(early);
  assert.deepEqual(d.work_labels, ["essential"]);
  assert.deepEqual(d.applicants[0].work_labels, []);
  assert.equal((await req(early, "/admin/applicants?work_label=search_review")).status, 400);
});
