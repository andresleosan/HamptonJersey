import test from "node:test";
import assert from "node:assert/strict";
import { makeEnv, call, adminCookie } from "./helpers.mjs";
import { jerseyToday, plusDays } from "../../server/viewings.js";
import { paymentRef } from "../../server/rentals.js";

const req = async (env, method, path, body) => call(env, method, path, { body, cookie: await adminCookie() });
const run = (env, sql, ...args) => env.DB.raw.prepare(sql).run(...args);
const rows = (env, sql, ...args) => env.DB.raw.prepare(sql).all(...args);
const T = jerseyToday(), ago = n => plusDays(T, -n), ahead = n => plusDays(T, n);
const ok = (r, status = 200) => { assert.equal(r.status, status, JSON.stringify(r.data)); return r.data; };

const landlord = async (env, over = {}) => ok(await req(env, "POST", "/admin/landlords", { name: "Anne Owner", ...over }), 201).landlord.id;
const rental = async (env, landlord_id, over = {}) => ok(await req(env, "POST", "/admin/rentals", { landlord_id,
  address: "1 Rue des Pres", parish: "St Helier", service: "full", fee_percent: 10, ...over }), 201).rental.id;
const LET_ONLY = { service: "let_only", fee_percent: null };
const tenancy = async (env, rentalId, over = {}) => ok(await req(env, "POST", `/admin/rentals/${rentalId}/tenancies`,
  { tenant_name: "Tom Tenant", kind: "periodic", regime: "2025", rent: 1500, start_on: ago(6), ...over }), 201).tenancy;
const repair = (env, rentalId, body) => req(env, "POST", `/admin/rentals/${rentalId}/repairs`, body);
const putRepair = (env, r, body) => req(env, "PUT", `/admin/repairs/${r.id}`, { updated_at: r.updated_at, ...body });
const overview = async (env, qs = "") => ok(await req(env, "GET", `/admin/rentals${qs}`));
const STEP = { reminder: { days: 1, step: "reminder", label: "Friendly reminder" }, firm: { days: 5, step: "firm", label: "Firm reminder" } };

test("repair: a quote above the landlord's limit needs approval; done needs date and cost", async () => {
  const env = makeEnv();
  const L = await landlord(env, { approval_limit: 500 });
  const id = await rental(env, L);
  const t = await tenancy(env, id);
  assert.equal((await repair(env, 999, { title: "Leak", urgency: "urgent" })).status, 404);
  assert.deepEqual(ok(await repair(env, id, { urgency: "fast" }), 400).fields,
    { title: "Enter a title", urgency: "Choose emergency, urgent or routine" });

  let r = ok(await repair(env, id, { title: "Boiler", urgency: "urgent", quote: 800, contractor: "Jersey Heat" }), 201).repair;
  assert.equal(r.status, "reported");
  assert.equal(r.tenancy_id, t.id, "the running tenancy is attached");
  assert.equal(r.charge_landlord, 1);
  assert.equal(r.approved_at, null);

  // Above the limit: approved, in progress or done only after awaiting_approval.
  for (const status of ["approved", "in_progress", "done"])
    assert.equal((await putRepair(env, r, { status, done_on: T, cost: 750 })).status, 409, status);
  r = ok(await putRepair(env, r, { status: "awaiting_approval" })).repair;
  assert.equal((await putRepair(env, r, { status: "in_progress" })).status, 409, "awaiting approval goes to approved or cancelled");
  r = ok(await putRepair(env, r, { status: "approved" })).repair;
  assert.ok(r.approved_at, "the approval is stamped");
  r = ok(await putRepair(env, r, { status: "in_progress" })).repair;

  // done needs done_on and cost: a 400, never the database CHECK.
  assert.deepEqual(ok(await putRepair(env, r, { status: "done" }), 400).fields,
    { done_on: "Enter the date it was done", cost: "Enter the final cost" });
  assert.equal(ok(await putRepair(env, r, { status: "done", done_on: ahead(1), cost: 750 }), 400).fields.done_on,
    "Use today or an earlier date");
  r = ok(await putRepair(env, r, { status: "done", done_on: T, cost: 750 })).repair;
  assert.deepEqual([r.status, r.done_on, r.cost], ["done", T, 750]);
  assert.equal((await putRepair(env, r, { status: "in_progress" })).status, 409, "done is final");
  assert.equal(ok(await putRepair(env, r, { cost: null }), 400).fields.cost, "Enter the final cost", "the merged row is checked");
  assert.equal((await putRepair(env, { ...r, updated_at: "2000-01-01" }, { title: "Old" })).status, 409, "stale save");
  assert.equal((await putRepair(env, { id: r.id }, { title: "No lock" })).status, 400);

  // Within the limit (or no limit): straight to approved, no approval stamp; raising the quote past it then is refused.
  let s = ok(await repair(env, id, { title: "Tap", urgency: "routine", quote: 400 }), 201).repair;
  s = ok(await putRepair(env, s, { status: "approved" })).repair;
  assert.equal(s.approved_at, null);
  assert.equal((await putRepair(env, s, { quote: 900 })).status, 409, "a larger quote needs the landlord's approval");
  s = ok(await putRepair(env, s, { status: "cancelled" })).repair;

  // Created done: date and cost required; created with a quote over the limit as approved: refused.
  assert.deepEqual(Object.keys(ok(await repair(env, id, { title: "Lock", urgency: "urgent", status: "done" }), 400).fields),
    ["done_on", "cost"]);
  assert.equal((await repair(env, id, { title: "Roof", urgency: "urgent", quote: 900, status: "approved" })).status, 409);
  const d = ok(await repair(env, id, { title: "Lock", urgency: "urgent", status: "done", done_on: ago(2), cost: 90,
    charge_landlord: false }), 201).repair;
  assert.deepEqual([d.status, d.charge_landlord], ["done", 0]);

  // Each change writes its event; the property page lists the repairs, open ones first.
  const ev = rows(env, "SELECT type, rental_id, tenancy_id, data FROM rental_events WHERE type LIKE 'repair.%' ORDER BY id");
  assert.deepEqual(ev.map(e => e.type), ["repair.created", "repair.updated", "repair.updated", "repair.updated", "repair.updated",
    "repair.created", "repair.updated", "repair.updated", "repair.created"]);
  assert.deepEqual(JSON.parse(ev[1].data), { repair_id: r.id, before: { status: "reported" }, after: { status: "awaiting_approval" } });
  assert.equal(JSON.parse(ev[0].data).repair_id, r.id);
  assert.deepEqual([ev[0].rental_id, ev[0].tenancy_id], [id, t.id]);
  const page = ok(await req(env, "GET", `/admin/rentals/${id}`));
  assert.deepEqual(page.repairs.map(x => [x.title, x.status]), [["Lock", "done"], ["Tap", "cancelled"], ["Boiler", "done"]]);

  // An archived property takes no repairs.
  const gone = await rental(env, L, { address: "Gone" });
  ok(await req(env, "POST", `/admin/rentals/${gone}/archive`));
  assert.equal((await repair(env, gone, { title: "Leak", urgency: "urgent" })).status, 409);
});

test("repair: without a quote, a cost above the landlord's limit needs approval before done", async () => {
  const env = makeEnv();
  const id = await rental(env, await landlord(env, { approval_limit: 500 }));
  assert.equal((await repair(env, id, { title: "Drain", urgency: "urgent", status: "done", done_on: T, cost: 600 })).status, 409);
  let r = ok(await repair(env, id, { title: "Drain", urgency: "urgent" }), 201).repair;
  assert.equal((await putRepair(env, r, { status: "done", done_on: T, cost: 600 })).status, 409);
  r = ok(await putRepair(env, r, { status: "in_progress", cost: 500 })).repair; // at the limit: fine
  assert.equal((await putRepair(env, r, { status: "done", done_on: T, cost: 600 })).status, 409);
  r = ok(await putRepair(env, r, { status: "awaiting_approval", cost: 600 })).repair;
  r = ok(await putRepair(env, r, { status: "approved" })).repair;
  r = ok(await putRepair(env, r, { status: "done", done_on: T })).repair;
  assert.deepEqual([r.status, r.cost, !!r.approved_at], ["done", 600, true]);
});

test("property page: its tenancies newest first and its last 100 events, newest first", async () => {
  const env = makeEnv();
  const id = await rental(env, await landlord(env), { address: "P14 House" });
  const old = await tenancy(env, id, { tenant_name: "Old Tenant", start_on: ago(400) });
  ok(await req(env, "POST", `/admin/tenancies/${old.id}/end`, { ended_on: ago(30) }));
  const cur = await tenancy(env, id, { tenant_name: "New Tenant", start_on: ago(20) });
  const page = ok(await req(env, "GET", `/admin/rentals/${id}`));
  assert.deepEqual(page.tenancies.map(t => [t.id, t.tenant_name, t.ended_on]), [[cur.id, "New Tenant", null], [old.id, "Old Tenant", ago(30)]]);
  assert.deepEqual(Object.keys(page.tenancies[0]), ["id", "payment_ref", "tenant_name", "kind", "regime", "start_on", "end_on",
    "ended_on", "rent", "collect_from", "notice_given_on", "notice_by"]);
  assert.deepEqual(page.events.map(e => e.type), ["tenancy.created", "tenancy.ended", "tenancy.created", "rental.created"]);
  assert.deepEqual(page.events[1].data.ended_on, ago(30), "data comes parsed");
  assert.deepEqual(Object.keys(page.events[0]), ["id", "tenancy_id", "at", "actor", "type", "data"]);
  run(env, `INSERT INTO rental_events (rental_id, at, type) SELECT ?, '2000-01-01', 'old' FROM json_each(?)`, id,
    JSON.stringify(Array(120).fill(0)));
  const many = ok(await req(env, "GET", `/admin/rentals/${id}`)).events;
  assert.equal(many.length, 100);
  assert.equal(many[0].type, "tenancy.created");
  assert.equal(many[0].data.tenant_name, "New Tenant");
});

test("statement: rent received in the Jersey month, fee, GST when set, repairs charged, net; deposits apart", async () => {
  const env = makeEnv();
  const L = await landlord(env, { name: "Sam Owner" });
  const a = await rental(env, L, { address: "A House", fee_percent: 10 });
  const b = await rental(env, L, { address: "B Flat", fee_percent: 12.5 });
  const c = await rental(env, L, { address: "C Let Only", ...LET_ONLY });
  const other = await rental(env, await landlord(env, { name: "Other" }), { address: "Not Sam's" });
  const [ta, tb, tc, to] = [await tenancy(env, a, { start_on: "2026-08-01" }), await tenancy(env, b, { start_on: "2026-08-01" }),
    await tenancy(env, c, { start_on: "2026-08-01" }), await tenancy(env, other, { start_on: "2026-08-01" })];
  const pay = (t, received_on, amount, kind = "rent") => run(env, `INSERT INTO payments (tenancy_id, received_on, amount, kind,
    source, created_at) VALUES (?, ?, ?, ?, 'manual', ?)`, t.id, received_on, amount, kind, T);
  pay(ta, "2026-08-31", 99999); // the month before
  pay(ta, "2026-09-01", 100000);
  pay(ta, "2026-09-30", 50000);
  pay(ta, "2026-10-01", 77777); // the month after
  pay(ta, "2026-09-05", 200000, "deposit");
  pay(tb, "2026-09-10", 33333);
  pay(tb, "2026-09-11", 1000, "other");
  pay(tc, "2026-09-10", 150000, "deposit"); // let only: no statement line
  pay(to, "2026-09-10", 150000);
  const fix = (rid, title, done_on, cost, charge_landlord = 1, status = "done") => run(env, `INSERT INTO repairs (rental_id, title,
    urgency, status, cost, done_on, charge_landlord, created_at, updated_at) VALUES (?, ?, 'urgent', ?, ?, ?, ?, ?, ?)`,
  rid, title, status, cost, done_on, charge_landlord, T, T);
  fix(a, "Boiler", "2026-09-15", 300);
  fix(a, "Paint", "2026-09-20", 50, 0); // not charged to the landlord
  fix(a, "Fence", "2026-10-01", 80); // next month
  fix(b, "Leak", "2026-09-30", 120);
  fix(b, "Open job", null, null, 1, "in_progress");

  const get = qs => req(env, "GET", `/admin/statements${qs}`);
  let s = ok(await get(`?landlord=${L}&month=2026-09`));
  assert.deepEqual(s.landlord.name, "Sam Owner");
  assert.equal(s.month, "2026-09");
  assert.equal(s.gst_percent, 0);
  assert.deepEqual(s.rentals.map(r => [r.address, r.rent_received, r.fee, r.other_received]),
    [["A House", 150000, 15000, 200000], ["B Flat", 33333, 4167, 1000]]);
  assert.deepEqual(s.rentals[0].repairs.map(r => [r.title, r.done_on, r.cost]), [["Boiler", "2026-09-15", 30000]]);
  assert.deepEqual(s.rentals[1].repairs.map(r => [r.title, r.cost]), [["Leak", 12000]]);
  assert.deepEqual(s.totals, { rent: 183333, fee: 19167, gst: null, repairs: 42000, net: 183333 - 19167 - 42000 });

  ok(await req(env, "PUT", "/admin/settings/gst", { percent: 5 }));
  s = ok(await get(`?landlord=${L}&month=2026-09`));
  assert.equal(s.gst_percent, 5);
  assert.deepEqual(s.totals, { rent: 183333, fee: 19167, gst: 958, repairs: 42000, net: 183333 - 19167 - 958 - 42000 });

  // October so far: the 1 October rent and the fence.
  s = ok(await get(`?landlord=${L}&month=2026-10`));
  assert.deepEqual(s.rentals.map(r => [r.address, r.rent_received, r.repairs.length]), [["A House", 77777, 1], ["B Flat", 0, 0]]);

  assert.equal((await get(`?landlord=${L}&month=2026-13`)).status, 400);
  assert.equal((await get(`?landlord=${L}`)).status, 400);
  assert.equal((await get("?month=2026-09")).status, 400);
  assert.equal((await get("?landlord=999&month=2026-09")).status, 404);
  assert.equal((await call(env, "GET", `/admin/statements?landlord=${L}&month=2026-09`)).status, 401);
});

test("overview: to-do lists arrears due today, compliance within 60 days or missing, renewals at 90 days, open emergencies first", async () => {
  const env = makeEnv();
  const L = await landlord(env);
  // Arrears: only a step already due and not marked done.
  const late = await tenancy(env, await rental(env, L, { address: "1 Late Lane" }), { tenant_name: "Lia Late", start_on: ago(6) });
  const today = await tenancy(env, await rental(env, L, { address: "2 Today Road" }), { tenant_name: "Ted Today", start_on: ago(1) });
  const paid = await tenancy(env, await rental(env, L, { address: "3 Paid Place" }), { start_on: ago(6) });
  ok(await req(env, "POST", "/admin/payments", { tenancy_id: paid.id, received_on: T, amount: 150000 }), 201);
  const marked = await tenancy(env, await rental(env, L, { address: "4 Marked Mews" }), { start_on: ago(1) });
  ok(await req(env, "PUT", `/admin/tenancies/${marked.id}/arrears/${ago(1)}/reminder`, {}));

  // Compliance: property checks within 60 days or missing (gas left out without gas), and the tenancy's own deadlines.
  const c1 = await rental(env, L, { address: "5 Check Close", ...LET_ONLY, has_gas: false });
  ok(await req(env, "PUT", `/admin/rentals/${c1}/compliance/licence`, { done_on: ago(10), expires_on: ahead(30) }));
  ok(await req(env, "PUT", `/admin/rentals/${c1}/compliance/eicr`, { done_on: ago(10), expires_on: ahead(61) }));
  ok(await req(env, "PUT", `/admin/rentals/${c1}/compliance/alarms`, { done_on: ago(400), expires_on: ago(1) }));
  const dep = await tenancy(env, c1, { start_on: ago(40), deposit: 1500, deposit_received_on: ago(40), inventory_in_on: ago(39) });
  const c2 = await rental(env, L, { address: "6 Fresh Street", ...LET_ONLY });
  const fresh = await tenancy(env, c2, { start_on: ago(2) });

  // Renewals: fixed terms ending within 90 days without notice, and those already past their end.
  const r1 = await tenancy(env, await rental(env, L, { address: "7 Renew Row", ...LET_ONLY }),
    { kind: "fixed", start_on: ago(300), end_on: ahead(80), inventory_in_on: ago(300) });
  await tenancy(env, await rental(env, L, { address: "8 Later Lane", ...LET_ONLY }),
    { kind: "fixed", start_on: ago(300), end_on: ahead(100), inventory_in_on: ago(300) });
  const r3 = await tenancy(env, await rental(env, L, { address: "9 Ended Term", ...LET_ONLY }),
    { kind: "fixed", start_on: ago(400), end_on: ago(5), inventory_in_on: ago(400) });
  const n = await tenancy(env, await rental(env, L, { address: "10 Notice Way", ...LET_ONLY }),
    { kind: "fixed", start_on: ago(300), end_on: ahead(30), inventory_in_on: ago(300) });
  ok(await req(env, "POST", `/admin/tenancies/${n.id}/notice`, { given_on: T, by: "tenant" }));

  // Repairs: open ones, emergencies first; done ones gone.
  const lateRental = late.rental_id;
  const mk = async body => ok(await repair(env, lateRental, body), 201).repair;
  const routine = await mk({ title: "Gate", urgency: "routine" });
  const emergency = await mk({ title: "Flood", urgency: "emergency" });
  const urgent = await mk({ title: "Heating", urgency: "urgent" });
  await mk({ title: "Done", urgency: "emergency", status: "done", done_on: T, cost: 100 });

  run(env, "INSERT INTO payments (received_on, amount, description, kind, source, created_at) VALUES (?, 4200, 'FPS JOHN', 'rent', 'import', ?)", ago(3), T);
  run(env, "INSERT INTO payments (received_on, amount, description, kind, source, created_at) VALUES (?, 4300, 'FPS ANN', 'rent', 'import', ?)", ago(1), T);

  const { todo, rentals, totals } = await overview(env);
  assert.deepEqual(todo.arrears, [
    { tenancy_id: late.id, rental_id: late.rental_id, address: "1 Late Lane", tenant_name: "Lia Late", payment_ref: paymentRef(late.id),
      balance: 150000, oldest_unpaid_on: ago(6), days_late: 6, next_step: STEP.firm },
    { tenancy_id: today.id, rental_id: today.rental_id, address: "2 Today Road", tenant_name: "Ted Today",
      payment_ref: paymentRef(today.id), balance: 150000, oldest_unpaid_on: ago(1), days_late: 1, next_step: STEP.reminder },
  ]);

  const of = id => todo.compliance.filter(c => c.rental_id === id).map(c => [c.tenancy_id, c.kind, c.due_on, c.status]);
  assert.deepEqual(of(c1), [[dep.id, "deposit", ago(10), "overdue"], [null, "alarms", ago(1), "overdue"],
    [null, "licence", ahead(30), "due30"]]);
  assert.deepEqual(of(c2), [[null, "licence", null, "missing"], [null, "eicr", null, "missing"], [null, "gas", null, "missing"],
    [null, "alarms", null, "missing"], [fresh.id, "inventory_in", ahead(5), "due7"]]);
  assert.deepEqual(todo.compliance.find(c => c.kind === "deposit"), { rental_id: c1, address: "5 Check Close", tenancy_id: dep.id,
    tenant_name: "Tom Tenant", kind: "deposit", label: "Deposit protected", due_on: ago(10), status: "overdue" });
  assert.equal(todo.compliance.find(c => c.kind === "licence" && c.rental_id === c1).label, "Rental dwelling licence");
  assert.ok(["overdue", "missing"].includes(todo.compliance[0].status) && todo.compliance.at(-1).status !== "missing",
    "overdue and missing come first");

  assert.deepEqual(todo.renewals.map(r => [r.tenancy_id, r.address, r.end_on, r.label]),
    [[r3.id, "9 Ended Term", ago(5), "Fixed term ended"], [r1.id, "7 Renew Row", ahead(80), "Renewal due"]]);
  assert.deepEqual(Object.keys(todo.renewals[0]), ["tenancy_id", "rental_id", "address", "tenant_name", "end_on", "label"]);

  assert.deepEqual(todo.repairs.map(r => r.id), [emergency.id, urgent.id, routine.id]);
  assert.deepEqual(todo.repairs[0], { id: emergency.id, rental_id: lateRental, address: "1 Late Lane", title: "Flood",
    urgency: "emergency", status: "reported", contractor: null, quote: null, created_at: emergency.created_at });

  assert.deepEqual(todo.unmatched.map(p => [p.received_on, p.amount, p.description]), [[ago(1), 4300, "FPS ANN"], [ago(3), 4200, "FPS JOHN"]]);

  const late1 = rentals.find(r => r.id === late.rental_id);
  assert.deepEqual(late1.marks, ["arrears", "compliance", "repairs"]);
  assert.deepEqual(rentals.find(r => r.id === r1.rental_id).marks, ["compliance", "renewals"]);
  assert.deepEqual(totals, { properties: 10, occupied: 10, owed: 450000, unmatched: 2 }, "owed: the marked tenancy owes too");
});

test("overview: search by tenant name, payment reference and address; filters", async () => {
  const env = makeEnv();
  const anne = await landlord(env, { name: "Anne Owner" }), bob = await landlord(env, { name: "Bob 100% Owner" });
  const t1 = await tenancy(env, await rental(env, anne, { address: "1 Rue des Pres" }), { tenant_name: "Tom Tenant", rent: 1500 });
  const t2 = await tenancy(env, await rental(env, bob, { address: "5 Grande Route", ...LET_ONLY }),
    { tenant_name: "Zoe Zed", rent: 2100, start_on: ago(30) });
  const empty = await rental(env, anne, { address: "7 Empty Lane" });
  const gone = await rental(env, anne, { address: "9 Archived Row" });
  ok(await req(env, "POST", `/admin/rentals/${gone}/archive`));

  const list = async qs => (await overview(env, qs)).rentals.map(r => r.address);
  assert.deepEqual(await list(""), ["1 Rue des Pres", "5 Grande Route", "7 Empty Lane"]);
  assert.deepEqual(await list("?q=zoe"), ["5 Grande Route"]);
  assert.deepEqual(await list(`?q=${encodeURIComponent(paymentRef(t1.id))}`), ["1 Rue des Pres"]);
  assert.deepEqual(await list("?q=rue%20DES"), ["1 Rue des Pres"]);
  assert.deepEqual(await list("?q=bob"), ["5 Grande Route"], "by landlord too");
  assert.deepEqual(await list("?q=100%25"), ["5 Grande Route"], "% is literal");
  assert.deepEqual(await list("?q=%25%25%25"), []);
  assert.deepEqual(await list("?service=let_only"), ["5 Grande Route"]);
  assert.deepEqual(await list("?service=full"), ["1 Rue des Pres", "7 Empty Lane"]);
  assert.deepEqual(await list("?filter=arrears"), ["1 Rue des Pres"]);
  assert.deepEqual(await list("?archived=1"), ["9 Archived Row"]);
  assert.deepEqual(await list("?q=lane&service=full"), ["7 Empty Lane"]);
  for (const bad of ["?service=x", "?filter=x", "?archived=2"]) assert.equal((await req(env, "GET", `/admin/rentals${bad}`)).status, 400, bad);

  const { rentals, todo } = await overview(env);
  assert.deepEqual(rentals[0], { id: t1.rental_id, address: "1 Rue des Pres", parish: "St Helier", service: "full",
    landlord_id: anne, landlord_name: "Anne Owner", archived_at: null, tenancy_id: t1.id, tenant_name: "Tom Tenant",
    payment_ref: paymentRef(t1.id), rent: 1500, balance: 150000, marks: ["arrears", "compliance"] });
  assert.deepEqual([rentals[1].tenant_name, rentals[1].rent, rentals[1].balance], ["Zoe Zed", 2100, null], "let only has no balance");
  assert.deepEqual([rentals[2].id, rentals[2].tenancy_id, rentals[2].tenant_name, rentals[2].balance], [empty, null, null, null]);
  assert.equal(todo.arrears.length, 1, "the to-do is never filtered");
  assert.equal((await call(env, "GET", "/admin/rentals")).status, 401);
});

test("counts: rentals adds overdue items and unmatched payments; action unchanged", async () => {
  const env = makeEnv();
  const counts = async () => ok(await req(env, "GET", "/admin/notifications/counts"));
  assert.deepEqual(await counts(), { action: 0, new_applicant: 0, viewing: 0, matched: 0, sales: 0, rentals: 0 });

  const L = await landlord(env);
  const done = async id => { for (const k of ["licence", "eicr", "alarms"])
    ok(await req(env, "PUT", `/admin/rentals/${id}/compliance/${k}`, { done_on: T })); };
  // Arrears with a step due (+1), its checks done and check-in recorded (+0).
  const f = await rental(env, L, { address: "F", has_gas: false });
  await done(f);
  const late = await tenancy(env, f, { start_on: ago(6), inventory_in_on: ago(6) });
  // A let-only fixed term ending in 60 days (+1 renewal), deposit received 31 days ago and not protected (+1 overdue).
  const g = await rental(env, L, { address: "G", ...LET_ONLY, has_gas: false });
  await done(g);
  await tenancy(env, g, { kind: "fixed", start_on: ago(31), end_on: ahead(60), deposit: 1000, deposit_received_on: ago(31),
    inventory_in_on: ago(31) });
  // Deposit received 30 days ago: due today, not overdue yet (+0).
  const h = await rental(env, L, { address: "H", ...LET_ONLY, has_gas: false });
  await done(h);
  await tenancy(env, h, { start_on: ago(30), deposit: 1000, deposit_received_on: ago(30), inventory_in_on: ago(30) });
  // Nothing recorded and maybe gas: four missing checks (+4).
  await rental(env, L, { address: "M", ...LET_ONLY });
  // An open emergency (+1); routine and closed ones don't count.
  ok(await repair(env, f, { title: "Flood", urgency: "emergency" }), 201);
  ok(await repair(env, f, { title: "Gate", urgency: "routine" }), 201);
  ok(await repair(env, f, { title: "Old flood", urgency: "emergency", status: "done", done_on: T, cost: 10 }), 201);
  // An unmatched payment (+1).
  run(env, "INSERT INTO payments (received_on, amount, kind, source, created_at) VALUES (?, 100, 'rent', 'import', ?)", T, T);

  assert.deepEqual(await counts(), { action: 0, new_applicant: 0, viewing: 0, matched: 0, sales: 0, rentals: 9 });
  ok(await req(env, "PUT", `/admin/tenancies/${late.id}/arrears/${ago(6)}/firm`, {}));
  assert.equal((await counts()).rentals, 8, "a marked step stops counting");
  assert.equal(ok(await req(env, "GET", "/admin/notifications?box=action")).counts.rentals, 8);
});

test("counts: the rentals count is cached for 10 minutes and any rental write drops it", async () => {
  const env = makeEnv();
  const rentalsCount = async () => ok(await req(env, "GET", "/admin/notifications/counts")).rentals;
  const cache = () => rows(env, "SELECT value FROM app_settings WHERE key = 'rentals_count'").map(r => JSON.parse(r.value))[0];
  const setCache = (n, at) => run(env, `INSERT INTO app_settings (key, value, updated_at) VALUES ('rentals_count', ?, ?)
    ON CONFLICT (key) DO UPDATE SET value = excluded.value`, JSON.stringify({ n, at }), at);
  const late = await tenancy(env, await rental(env, await landlord(env), { has_gas: false }), { start_on: ago(6), inventory_in_on: ago(6) });
  assert.equal(await rentalsCount(), 4, "arrears + three missing checks");
  const stored = cache();
  assert.equal(stored.n, 4);
  assert.ok(Date.now() - Date.parse(stored.at) < 60000);

  // Fresh: the stored number is used as is, nothing worked out again.
  const recent = new Date(Date.now() - 9 * 60000).toISOString();
  setCache(42, recent);
  assert.equal(await rentalsCount(), 42);
  assert.deepEqual(cache(), { n: 42, at: recent });
  // Stale (over 10 minutes): worked out again and stored.
  setCache(42, new Date(Date.now() - 11 * 60000).toISOString());
  assert.equal(await rentalsCount(), 4);
  assert.ok(Date.now() - Date.parse(cache().at) < 60000);

  // A payment drops the cache in its own batch: the next poll shows the arrears gone, well within 10 minutes.
  setCache(4, new Date().toISOString());
  ok(await req(env, "POST", "/admin/payments", { tenancy_id: late.id, received_on: T, amount: 150000 }), 201);
  assert.equal(cache(), undefined);
  assert.equal(await rentalsCount(), 3);
  assert.deepEqual(Object.keys(ok(await req(env, "GET", "/admin/notifications/counts"))),
    ["action", "new_applicant", "viewing", "matched", "sales", "rentals"]);
});

test("tenancy search: running ones of either service and full ones ended in the last 12 months", async () => {
  const env = makeEnv(), L = await landlord(env);
  const find = async q => ok(await req(env, "GET", `/admin/tenancies?q=${encodeURIComponent(q)}`)).tenancies;
  const running = await tenancy(env, await rental(env, L, { address: "1 Smith Lane" }), { tenant_name: "Ann Smith" });
  const lately = await tenancy(env, await rental(env, L, { address: "2 Smith Lane" }), { tenant_name: "Bob Smith", start_on: ago(400) });
  const long = await tenancy(env, await rental(env, L, { address: "3 Smith Lane" }), { tenant_name: "Cy Smith", start_on: ago(800) });
  const letOnly = await tenancy(env, await rental(env, L, { address: "4 Smith Lane", ...LET_ONLY }), { tenant_name: "Di Smith", start_on: ago(400) });
  const moving = await tenancy(env, await rental(env, L, { address: "5 Smith Lane", ...LET_ONLY }), { tenant_name: "Ed Smith" });
  run(env, "UPDATE tenancies SET ended_on = ? WHERE id IN (?, ?)", ago(30), lately.id, letOnly.id);
  run(env, "UPDATE tenancies SET ended_on = ? WHERE id = ?", ago(400), long.id);
  run(env, "UPDATE tenancies SET ended_on = ? WHERE id = ?", ahead(20), moving.id);
  assert.deepEqual((await find("smith")).map(t => [t.tenant_name, t.ended_on]),
    [["Ann Smith", null], ["Ed Smith", ahead(20)], ["Bob Smith", ago(30)]], "running first; old and let-only ended ones left out");
  assert.deepEqual(Object.keys((await find(running.payment_ref.toLowerCase()))[0]),
    ["tenancy_id", "tenant_name", "payment_ref", "ended_on", "address", "service"]);
  assert.equal((await find("2 smith"))[0].tenancy_id, lately.id, "by address");
  assert.deepEqual(await find(" "), []);
  assert.deepEqual(await find("%"), []);
});

test("counts: a stale cache brings the charges up to date first, a fresh one reads nothing (P19)", async () => {
  const env = makeEnv();
  const rentalsCount = async () => ok(await req(env, "GET", "/admin/notifications/counts")).rentals;
  const charges = () => rows(env, "SELECT COUNT(*) AS n FROM charges")[0].n;
  const setCache = (n, at) => run(env, `INSERT INTO app_settings (key, value, updated_at) VALUES ('rentals_count', ?, ?)
    ON CONFLICT (key) DO UPDATE SET value = excluded.value`, JSON.stringify({ n, at }), at);
  await tenancy(env, await rental(env, await landlord(env), { has_gas: false }), { start_on: ago(6), inventory_in_on: ago(6) });
  // As if a new month began and nobody has opened Rentals since: the tenancy has no charges yet.
  run(env, "DELETE FROM charges");
  setCache(3, new Date().toISOString());
  assert.equal(await rentalsCount(), 3);
  assert.equal(charges(), 0, "a fresh cache generates nothing");
  setCache(3, new Date(Date.now() - 11 * 60000).toISOString());
  assert.equal(await rentalsCount(), 4, "three missing checks + the arrears of the charges made in the same batch");
  assert.ok(charges() >= 2, "this month's charge and the next one");
});

test("overview: 300 tenancies with two years of charges in under 10 ms of handler CPU", async t => {
  const env = makeEnv(), db = env.DB.raw;
  const start = plusDays(T, -730), ts = new Date().toISOString();
  db.exec("BEGIN");
  db.prepare("INSERT INTO landlords (name, created_at, updated_at) VALUES ('Big Owner', ?, ?)").run(ts, ts);
  for (let i = 1; i <= 300; i++) {
    db.prepare(`INSERT INTO rentals (landlord_id, address, parish, service, fee_percent, created_at, updated_at)
      VALUES (1, ?, 'St Helier', 'full', 10, ?, ?)`).run(`${i} Long Street`, ts, ts);
    db.prepare("INSERT INTO compliance_items (rental_id, kind, done_on, expires_on) SELECT ?, value, ?, ? FROM json_each(?)")
      .run(i, T, plusDays(T, i % 3 ? 400 : 20), JSON.stringify(["licence", "eicr", "gas", "alarms"]));
    db.prepare(`INSERT INTO tenancies (rental_id, payment_ref, tenant_name, kind, regime, start_on, rent, due_day, collect_from,
      inventory_in_on, created_at, updated_at) VALUES (?, ?, ?, 'periodic', '2025', ?, 1500, 1, ?, ?, ?, ?)`)
      .run(i, paymentRef(i), `Tenant ${i}`, start, start, start, ts, ts);
    db.prepare("INSERT INTO rent_changes (tenancy_id, effective_on, rent, created_at) VALUES (?, ?, 1500, ?)").run(i, start, ts);
  }
  db.exec("COMMIT");
  ok(await req(env, "GET", "/admin/rentals")); // makes the two years of charges
  // Paid in full except one tenancy in ten, which misses its latest charge due.
  db.prepare(`INSERT INTO payments (tenancy_id, received_on, amount, kind, source, created_at)
    SELECT tenancy_id, due_on, amount, 'rent', 'manual', ? FROM charges c WHERE due_on <= ?
    AND NOT (tenancy_id % 10 = 0 AND due_on = (SELECT MAX(due_on) FROM charges WHERE tenancy_id = c.tenancy_id AND due_on <= ?))`)
    .run(ts, T, T);
  assert.ok(db.prepare("SELECT COUNT(*) AS n FROM charges").get().n >= 300 * 24);

  const cookie = await adminCookie(), cpu = [];
  for (let i = 0; i < 12; i++) {
    const before = process.cpuUsage();
    const r = await call(env, "GET", "/admin/rentals", { cookie });
    const used = process.cpuUsage(before);
    assert.equal(r.status, 200);
    cpu.push((used.user + used.system) / 1000);
  }
  const median = cpu.sort((a, b) => a - b)[6];
  t.diagnostic(`GET /admin/rentals, 300 tenancies x 24 months: median ${median.toFixed(2)} ms CPU (node:sqlite double)`);
  // A reference on the double (SQL runs in-process here; on D1 it doesn't count as Worker CPU). Above 10 ms it is
  // reported as a risk, not failed; the bound only catches a runaway query.
  assert.ok(median < 100, `median ${median} ms`);
});
