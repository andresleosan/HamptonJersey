// ADM-16 task 2: deductions proposed in whole pence and the deposit's progress with mydeposits recorded by hand, apart
// from rent. Synthetic fixtures only.
import test from "node:test";
import assert from "node:assert/strict";
import { makeEnv, call, adminCookie } from "./helpers.mjs";
import { jerseyToday, plusDays } from "../../server/viewings.js";
import routes from "../../server/routes/tenancy-exits.js";

const T = jerseyToday(), M0 = `${T.slice(0, 7)}-01`, START = plusDays(M0, -62);
const on = () => ({ ...makeEnv(), ADM06_TENANCY_ORIGIN_READY: "1", ADM16_TENANCY_EXIT_READY: "1" });
const req = async (env, method, path, body, who) => call(env, method, path, { body, cookie: await adminCookie(who) });
const row = (env, sql, ...a) => env.DB.raw.prepare(sql).get(...a);
const rows = (env, sql, ...a) => env.DB.raw.prepare(sql).all(...a);
const count = (env, table) => row(env, `SELECT COUNT(*) AS n FROM ${table}`).n;

async function tenancy(env, over = {}) {
  const l = await req(env, "POST", "/admin/landlords", { name: "Synthetic Owner" });
  const r = await req(env, "POST", "/admin/rentals", { landlord_id: l.data.landlord.id, address: "6 Rue des Exemples",
    parish: "St Helier", service: "full", fee_percent: 10 });
  const t = await req(env, "POST", `/admin/rentals/${r.data.rental.id}/tenancies`, { tenant_name: "Tess Example", kind: "periodic",
    regime: "2025", rent: 1500, deposit: 1500, start_on: START, collect_from: START, ...over });
  assert.equal(t.status, 201, JSON.stringify(t.data));
  return t.data.tenancy.id;
}
const exit = (env, id) => req(env, "GET", `/admin/tenancies/${id}/exit`);
const saveExit = (env, id, body) => req(env, "PUT", `/admin/tenancies/${id}/exit-inventory`, body);
const propose = (env, id, body) => req(env, "PUT", `/admin/tenancies/${id}/deposit-proposal`, body);
const outcome = (env, id, body) => req(env, "POST", `/admin/tenancies/${id}/deposit-outcomes`, body);
// A tenancy that has ended, with its exit inventory and its own photo reference (and, unless keys: false, the day the
// keys came back). LINE: a deduction citing that reference.
let seq = 200;
async function moved(env = on(), { keys = true, ...over } = {}) {
  const id = await tenancy(env, over), ref = `Check-out photos, folder P-0${++seq}`;
  assert.equal((await req(env, "POST", `/admin/tenancies/${id}/end`, { ended_on: plusDays(T, 10) })).status, 200);
  const s = await saveExit(env, id, { expectedRevision: 0, rooms: [{ name: "Kitchen", condition: "changed", observations: "Oven not cleaned." }],
    evidence_refs: [ref], moved_out_on: keys ? T : null });
  assert.equal(s.status, 200, JSON.stringify(s.data));
  return { env, id, LINE: { reason: "Oven clean", amount_pence: 12050, evidence_ref: ref } };
}

test("deductions_cannot_exceed_deposit: whole pence, at most the deposit, after the exit inventory", async () => {
  const env = on(), bare = await tenancy(env);
  await req(env, "POST", `/admin/tenancies/${bare}/end`, { ended_on: plusDays(T, 10) });
  assert.equal((await propose(env, bare, { expectedRevision: 0, lines: [] })).status, 409, "the exit inventory comes first");
  const none = await moved(env, { deposit: null });
  const unknown = await propose(env, none.id, { expectedRevision: 0, lines: [] });
  assert.equal(unknown.status, 409, "no deposit recorded: nothing to deduct from, never £0");
  const { id, LINE } = await moved(env);
  const bad = async (lines, key) => {
    const r = await propose(env, id, { expectedRevision: 0, lines });
    assert.equal(r.status, 400, JSON.stringify(lines)); assert.ok(r.data.fields[key], `${key}: ${JSON.stringify(r.data.fields)}`);
  };
  await bad([{ ...LINE, amount_pence: 12.5 }], "lines.0.amount_pence");
  await bad([{ ...LINE, amount_pence: "12050" }], "lines.0.amount_pence");
  await bad([{ ...LINE, amount_pence: 0 }], "lines.0.amount_pence");
  await bad([{ ...LINE, amount_pence: -100 }], "lines.0.amount_pence");
  await bad([{ ...LINE, reason: " " }], "lines.0.reason");
  await bad([{ ...LINE, amount_pence: 100000 }, { ...LINE, reason: "Carpet", amount_pence: 50001 }], "lines");
  await bad(Array.from({ length: 21 }, () => ({ ...LINE, amount_pence: 1 })), "lines");
  assert.equal(count(env, "tenancy_deposit_proposals"), 0);
  const all = await propose(env, id, { expectedRevision: 0, lines: [{ ...LINE, amount_pence: 100000 }, { reason: "Carpet", amount_pence: 50000 }] });
  assert.equal(all.status, 200, JSON.stringify(all.data));
  assert.deepEqual([all.data.proposal.total_pence, all.data.proposal.deposit_pence], [150000, 150000]);
  assert.equal(all.data.proposal.lines[1].evidence_ref, null);
  // The database holds the same limit.
  assert.throws(() => env.DB.raw.prepare("UPDATE tenancy_deposit_proposals SET total_pence = 150001 WHERE tenancy_id = ?").run(id));
});

test("deduction evidence from another tenancy is refused", async () => {
  const a = await moved(), b = await moved(a.env);
  const r = await propose(a.env, b.id, { expectedRevision: 0, lines: [a.LINE] });
  assert.equal(r.status, 400); assert.ok(r.data.fields["lines.0.evidence_ref"]);
  const cross = await propose(a.env, b.id, { tenancy_id: a.id, expectedRevision: 0, lines: [] });
  assert.equal(cross.status, 400);
  assert.equal(row(a.env, "SELECT COUNT(*) AS n FROM tenancy_deposit_proposals WHERE tenancy_id = ?", b.id).n, 0);
  assert.equal((await propose(a.env, b.id, { expectedRevision: 0, lines: [b.LINE] })).status, 200);
});

test("proposed_not_agreed_or_released", async () => {
  const { env, id, LINE } = await moved();
  const p = await propose(env, id, { expectedRevision: 0, lines: [LINE] });
  assert.equal(p.status, 200, JSON.stringify(p.data));
  assert.equal(p.data.proposal.revision, 1);
  const r = await exit(env, id);
  assert.equal(r.data.status, "proposed");
  assert.deepEqual(r.data.outcomes, []);
  assert.equal(r.data.proposal.total_pence, 12050);
  assert.equal(count(env, "tenancy_deposit_outcomes"), 0);
  assert.equal((await propose(env, id, { expectedRevision: 0, lines: [] })).status, 409, "stale revision");
  const again = await propose(env, id, { expectedRevision: 1, lines: [{ ...LINE, amount_pence: 9000 }] });
  assert.equal(again.status, 200); assert.equal(again.data.proposal.revision, 2);
  assert.equal((await exit(env, id)).data.status, "proposed");
  // Nothing is recorded with mydeposits before the keys are back.
  const early = await moved(env, { keys: false });
  assert.equal((await propose(env, early.id, { expectedRevision: 0, lines: [] })).status, 200);
  assert.equal((await outcome(env, early.id, { expectedRevision: 1, status: "requested", evidence_ref: "Request R-1",
    occurred_on: T })).status, 409);
});

test("request_not_proof_of_return", async () => {
  const { env, id, LINE } = await moved();
  await propose(env, id, { expectedRevision: 0, lines: [LINE] });
  const bad = async (body, key) => {
    const r = await outcome(env, id, { expectedRevision: 1, status: "requested", evidence_ref: "Request R-1", occurred_on: T, ...body });
    assert.equal(r.status, 400, JSON.stringify(body)); assert.ok(r.data.fields[key], JSON.stringify(r.data.fields));
  };
  await bad({ evidence_ref: "" }, "evidence_ref");
  await bad({ status: "released" }, "status");
  await bad({ status: "proposed" }, "status");
  await bad({ occurred_on: plusDays(T, 1) }, "occurred_on");
  await bad({ occurred_on: plusDays(T, -1) }, "occurred_on");
  const r = await outcome(env, id, { expectedRevision: 1, status: "requested", evidence_ref: "Repayment request, mydeposits R-1",
    occurred_on: T, returned: true });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.status, "requested");
  assert.equal(r.data.outcomes.length, 1);
  assert.equal(r.data.outcomes.some(o => o.status === "returned"), false, "a request is not a return");
  // The same submission again is stale: one request recorded.
  assert.equal((await outcome(env, id, { expectedRevision: 1, status: "requested", evidence_ref: "Repayment request, mydeposits R-1",
    occurred_on: T })).status, 409);
  assert.equal(count(env, "tenancy_deposit_outcomes"), 1);
  // What was requested stays as it was.
  assert.equal((await propose(env, id, { expectedRevision: 2, lines: [] })).status, 409);
  assert.equal(row(env, "SELECT total_pence FROM tenancy_deposit_proposals").total_pence, 12050);
});

test("dispute_keeps_evidence_and_legal_hold", async () => {
  const { env, id, LINE } = await moved();
  await propose(env, id, { expectedRevision: 0, lines: [LINE] });
  const step = async (rev, status, evidence_ref) => {
    const r = await outcome(env, id, { expectedRevision: rev, status, evidence_ref, occurred_on: T });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    return r;
  };
  await step(1, "requested", "Repayment request, mydeposits R-2");
  await step(2, "disputed", "Dispute file D-0001");
  assert.equal((await exit(env, id)).data.status, "disputed");
  // On hold: the inventory and the proposal the dispute rests on cannot change.
  const inv = await saveExit(env, id, { expectedRevision: 1, rooms: [{ name: "Kitchen", condition: "not_checked" }], moved_out_on: T });
  assert.equal(inv.status, 409);
  assert.equal((await propose(env, id, { expectedRevision: 3, lines: [] })).status, 409);
  assert.equal(JSON.parse(row(env, "SELECT rooms FROM tenancy_exit_inventories").rooms)[0].condition, "changed");
  await step(3, "agreed", "Adjudication decision, D-0001");
  const done = await step(4, "returned", "mydeposits release confirmation, D-0001");
  assert.equal(done.data.status, "returned");
  assert.deepEqual(done.data.outcomes.map(o => [o.status, o.evidence_ref]), [["requested", "Repayment request, mydeposits R-2"],
    ["disputed", "Dispute file D-0001"], ["agreed", "Adjudication decision, D-0001"], ["returned", "mydeposits release confirmation, D-0001"]]);
  assert.equal((await outcome(env, id, { expectedRevision: 5, status: "disputed", evidence_ref: "Late", occurred_on: T })).status, 409,
    "nothing after the return");
  // Kept as recorded, whatever the route.
  assert.throws(() => env.DB.raw.prepare("DELETE FROM tenancy_deposit_outcomes WHERE status = 'disputed'").run(), /kept as recorded/);
  assert.throws(() => env.DB.raw.prepare("UPDATE tenancy_deposit_outcomes SET evidence_ref = 'x'").run(), /kept as recorded/);
  for (const [m, re] of routes) assert.ok(m !== "DELETE" && !/upload|download|file|media/i.test(re.source), re.source);
  const events = rows(env, "SELECT type, data FROM rental_events WHERE type LIKE 'deposit.%'");
  assert.deepEqual(events.map(e => e.type), ["deposit.proposal_saved", "deposit.outcome_recorded", "deposit.outcome_recorded",
    "deposit.outcome_recorded", "deposit.outcome_recorded"]);
  assert.ok(!/D-0001|R-2|P-0\d/.test(JSON.stringify(events)), "references stay out of the history");
});

test("deposit_allocation_not_rent_receipt: deductions and the return move no money and pay no rent", async () => {
  const { env, id } = await moved();
  const money = async () => [rows(env, "SELECT * FROM payments"), rows(env, "SELECT * FROM charges ORDER BY id"),
    (await req(env, "GET", `/admin/tenancies/${id}`)).data.balance, row(env, "SELECT deposit, deposit_ref FROM tenancies WHERE id = ?", id)];
  const before = await money();
  assert.ok(before[2] > 150000, "more rent is owed than the deposit");
  assert.equal((await propose(env, id, { expectedRevision: 0, lines: [{ reason: "Unpaid rent", amount_pence: 150000 }] })).status, 200);
  assert.equal((await outcome(env, id, { expectedRevision: 1, status: "agreed", evidence_ref: "Tenant agreement email, folder A-1",
    occurred_on: T })).status, 200);
  assert.equal((await outcome(env, id, { expectedRevision: 2, status: "returned", evidence_ref: "mydeposits release, folder A-1",
    occurred_on: T })).status, 200);
  assert.deepEqual(await money(), before);
  assert.equal(count(env, "payments"), 0);
  assert.equal(rows(env, "SELECT type FROM rental_events WHERE type LIKE 'payment.%'").length, 0);
});
