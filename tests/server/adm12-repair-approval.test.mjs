import test from "node:test";
import assert from "node:assert/strict";
import { makeEnv, call, adminCookie } from "./helpers.mjs";
import { jerseyToday, plusDays } from "../../server/viewings.js";

// ADM-12 (plan tp03-adm-12, Tarea 2): a minimal supplier directory and the landlord's approval recorded by hand with its
// amount, evidence and date, tied to the supplier. All of it only with ADM12_SUPPLIERS_READY and migration 0089.
const req = async (env, method, path, body) => call(env, method, path, { body, cookie: await adminCookie() });
const T = jerseyToday();
const ok = (r, status = 200) => { assert.equal(r.status, status, JSON.stringify(r.data)); return r.data; };
const on = () => ({ ...makeEnv(), ADM12_SUPPLIERS_READY: "1" });
const landlord = async env => ok(await req(env, "POST", "/admin/landlords", { name: "Anne Owner", approval_limit: 500 }), 201).landlord.id;
const rental = async env => ok(await req(env, "POST", "/admin/rentals", { landlord_id: await landlord(env),
  address: "1 Rue des Pres", parish: "St Helier", service: "let_only" }), 201).rental.id;
const supplier = async (env, body) => ok(await req(env, "POST", "/admin/suppliers", body), 201).supplier;
const repair = async (env, id, body) => ok(await req(env, "POST", `/admin/rentals/${id}/repairs`, body), 201).repair;
const put = (env, r, body) => req(env, "PUT", `/admin/repairs/${r.id}`, { updated_at: r.updated_at, ...body });
const APPROVAL = { approved_amount: 900, approval_ref: "Landlord email of today", approved_on: T };

test("suppliers: off by default; a directory with contact and status, archived ones can't be chosen", async () => {
  const off = makeEnv();
  assert.equal((await req(off, "GET", "/admin/suppliers")).status, 404);
  assert.equal(ok(await req(off, "GET", `/admin/rentals/${await rental(off)}`)).suppliers, undefined);

  const env = on();
  assert.deepEqual(ok(await req(env, "POST", "/admin/suppliers", { email: "nope" }), 400).fields,
    { name: "Enter a name", email: "Enter a valid email address" });
  const a = await supplier(env, { name: "Jersey Heat", trade: "Plumbing", phone: "01534 000000", email: "jobs@heat.example" });
  const b = await supplier(env, { name: "Atlantic Roofs" });
  assert.deepEqual([a.name, a.trade, a.archived_at], ["Jersey Heat", "Plumbing", null]);
  const edited = ok(await req(env, "PUT", `/admin/suppliers/${b.id}`, { updated_at: b.updated_at, phone: "07700 900000",
    archived: true })).supplier;
  assert.equal(edited.phone, "07700 900000");
  assert.ok(edited.archived_at, "archived");
  assert.equal((await req(env, "PUT", `/admin/suppliers/${b.id}`, { updated_at: b.updated_at, name: "X" })).status, 409, "stale");
  assert.deepEqual(ok(await req(env, "GET", "/admin/suppliers")).suppliers.map(s => s.name), ["Jersey Heat", "Atlantic Roofs"],
    "active first");

  const id = await rental(env);
  assert.deepEqual(ok(await req(env, "GET", `/admin/rentals/${id}`)).suppliers.map(s => s.id), [b.id, a.id], "by name");
  for (const supplier_id of [b.id, 999])
    assert.equal(ok(await req(env, "POST", `/admin/rentals/${id}/repairs`, { title: "Leak", urgency: "urgent", supplier_id }), 400)
      .fields.supplier_id, "Choose a supplier from the list");
  const r = await repair(env, id, { title: "Leak", urgency: "urgent", supplier_id: a.id, contractor: "Old free text" });
  assert.deepEqual([r.supplier_id, r.contractor], [a.id, "Old free text"], "the free text stays as it was");
});

test("approval: recorded with amount, evidence and date; a higher quote or cost, or another supplier, asks again", async () => {
  const env = on(), id = await rental(env);
  const a = await supplier(env, { name: "Jersey Heat" }), b = await supplier(env, { name: "Island Gas" });
  let r = await repair(env, id, { title: "Boiler", urgency: "urgent", quote: 800, supplier_id: a.id });
  r = ok(await put(env, r, { status: "awaiting_approval" })).repair;
  assert.deepEqual(Object.keys(ok(await put(env, r, { status: "approved" }), 400).fields).sort(),
    ["approval_ref", "approved_amount", "approved_on"]);
  assert.equal(ok(await put(env, r, { status: "approved", ...APPROVAL, approved_amount: 700 }), 400).fields.approved_amount,
    "The landlord approved less than the quote or cost");
  assert.equal(ok(await put(env, r, { status: "approved", ...APPROVAL, approved_on: plusDays(T, 1) }), 400).fields.approved_on,
    "Use today or an earlier date");
  r = ok(await put(env, r, { status: "approved", ...APPROVAL })).repair;
  assert.ok(r.approved_at);
  assert.deepEqual([r.approved_amount, r.approval_ref, r.approved_on], [900, "Landlord email of today", T]);

  // quote_change_revokes_old_approval: within the amount approved it stands; above it, it has to be asked again.
  r = ok(await put(env, r, { quote: 900 })).repair;
  assert.equal(r.approved_amount, 900);
  assert.equal((await put(env, r, { quote: 950 })).status, 409);
  // wrong_supplier_approval_not_reusable: another supplier from the directory is another approval; correcting the
  // contractor's free text is not.
  assert.equal((await put(env, r, { supplier_id: b.id })).status, 409);
  r = ok(await put(env, r, { contractor: "Jersey Heat Ltd" })).repair;
  assert.deepEqual([!!r.approved_at, r.approved_amount], [true, 900]);
  // cost_above_approved_amount_needs_review: the real cost is recorded with the landlord's new approval in the same step.
  r = ok(await put(env, r, { status: "in_progress" })).repair;
  assert.deepEqual(Object.keys(ok(await put(env, r, { status: "done", done_on: T, cost: 950 }), 400).fields).sort(),
    ["approval_ref", "approved_amount", "approved_on"]);
  assert.equal(ok(await put(env, r, { status: "done", done_on: T, cost: 950, ...APPROVAL }), 400).fields.approved_amount,
    "The landlord approved less than the quote or cost");
  r = ok(await put(env, r, { status: "done", done_on: T, cost: 950, ...APPROVAL, approved_amount: 950,
    approval_ref: "Landlord text about the extra" })).repair;
  assert.deepEqual([r.status, r.cost, r.approved_amount, r.approval_ref], ["done", 950, 950, "Landlord text about the extra"]);

  // Within what was approved the cost needs nothing more, and details sent outside an approval are ignored.
  let w = await repair(env, id, { title: "Valve", urgency: "urgent", quote: 800 });
  w = ok(await put(env, w, { status: "awaiting_approval" })).repair;
  w = ok(await put(env, w, { status: "approved", ...APPROVAL })).repair;
  w = ok(await put(env, w, { status: "done", done_on: T, cost: 880, approved_amount: 5000 })).repair;
  assert.deepEqual([w.status, w.approved_amount], ["done", 900]);

  // Asked again: the old approval goes with it.
  let s = await repair(env, id, { title: "Roof", urgency: "routine", quote: 600 });
  s = ok(await put(env, s, { status: "awaiting_approval" })).repair;
  s = ok(await put(env, s, { status: "approved", ...APPROVAL })).repair;
  s = ok(await put(env, s, { status: "awaiting_approval", quote: 1200 })).repair;
  assert.deepEqual([s.approved_at, s.approved_amount, s.approval_ref, s.approved_on], [null, null, null, null]);
});

test("approval: an emergency does not skip the landlord's limit", async () => {
  const env = on(), id = await rental(env);
  const r = await repair(env, id, { title: "Burst pipe", urgency: "emergency", quote: 2000 });
  for (const status of ["approved", "in_progress"]) assert.equal((await put(env, r, { status })).status, 409, status);
  assert.equal((await req(env, "POST", `/admin/rentals/${id}/repairs`, { title: "Lock", urgency: "emergency",
    status: "done", done_on: T, cost: 700 })).status, 409);
});

test("approval: switched off, the approval needs no details and the new fields are ignored", async () => {
  const env = makeEnv(), id = await rental(env);
  let r = await repair(env, id, { title: "Boiler", urgency: "urgent", quote: 800, supplier_id: 5 });
  assert.equal(r.supplier_id, null);
  r = ok(await put(env, r, { status: "awaiting_approval" })).repair;
  r = ok(await put(env, r, { status: "approved", approved_amount: 100 })).repair;
  assert.deepEqual([!!r.approved_at, r.approved_amount], [true, null]);
});

// Switched off, the rules are the ones before ADM-12 (762d5f3): only asking again or a higher quote drops the approval.
test("approval: switched off, a final cost above the quote and a contractor correction keep the approval", async () => {
  const env = makeEnv(), id = await rental(env);
  let r = await repair(env, id, { title: "Boiler", urgency: "urgent", quote: 800, contractor: "Jersey Heat" });
  r = ok(await put(env, r, { status: "awaiting_approval" })).repair;
  r = ok(await put(env, r, { status: "approved" })).repair;
  const at = r.approved_at;
  r = ok(await put(env, r, { contractor: "Jersey Heat Ltd" })).repair;
  r = ok(await put(env, r, { quote: 700 })).repair;
  r = ok(await put(env, r, { status: "in_progress" })).repair;
  r = ok(await put(env, r, { status: "done", done_on: T, cost: 850 })).repair;
  assert.deepEqual([r.status, r.cost, r.approved_at], ["done", 850, at]);
  let s = await repair(env, id, { title: "Roof", urgency: "urgent", quote: 800 });
  s = ok(await put(env, s, { status: "awaiting_approval" })).repair;
  s = ok(await put(env, s, { status: "approved" })).repair;
  assert.equal((await put(env, s, { quote: 801 })).status, 409, "a higher quote above the limit asks again");
});

test("approval: switched on then off, asking again clears every detail and nothing compares with an old amount", async () => {
  const env = on(), off = { ...env, ADM12_SUPPLIERS_READY: "0" }, id = await rental(env);
  let r = await repair(env, id, { title: "Boiler", urgency: "urgent", quote: 800 });
  r = ok(await put(env, r, { status: "awaiting_approval" })).repair;
  r = ok(await put(env, r, { status: "approved", ...APPROVAL })).repair;
  r = ok(await put(off, r, { status: "awaiting_approval" })).repair;
  assert.deepEqual([r.approved_at, r.approved_amount, r.approval_ref, r.approved_on], [null, null, null, null]);
  r = ok(await put(off, r, { status: "approved" })).repair;
  assert.equal((await put(env, r, { quote: 850 })).status, 409, "the approval of 800 does not stretch to an old 900");
  r = ok(await put(env, r, { status: "in_progress" })).repair;
  r = ok(await put(env, r, { status: "done", done_on: T, cost: 850 })).repair;
  assert.equal(r.status, "done", "an approval given while switched off is not stuck on a missing amount");
});

test("approval: switched on before migration 0089, repairs work as switched off", async () => {
  const env = { ...makeEnv({ through: 88 }), ADM12_SUPPLIERS_READY: "1" }, id = await rental(env);
  let r = await repair(env, id, { title: "Boiler", urgency: "urgent", quote: 800, supplier_id: 1 });
  r = ok(await put(env, r, { status: "awaiting_approval" })).repair;
  r = ok(await put(env, r, { status: "approved" })).repair;
  assert.ok(r.approved_at);
  assert.equal(ok(await req(env, "GET", `/admin/rentals/${id}`)).suppliers, undefined);
});
