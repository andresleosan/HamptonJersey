import test from "node:test";
import assert from "node:assert/strict";
import { makeEnv, call, adminCookie } from "./helpers.mjs";
import { jerseyToday } from "../../server/viewings.js";
import { LEGAL, addMonths, lawApplies, regimeOf, validateTenancyOperation } from "../../server/rentals.js";

// ADM-20: the 2025 tenancy rules behind ADM20_TENANCY_LAW_READY (migration 0073). A tenancy's rules come from the date
// its agreement was made and the date the 2025 rules start (a versioned legal parameter); the accommodation's scope is
// yes, no or unknown, and unknown is neither. One initial fixed term of up to 3 years and no premium or key money:
// while the rules are estimated the save needs an express confirmation, once validated a breach is refused.
const POLICY = { status: "estimated", regime2025From: LEGAL.regime2025From, initialTermYears: LEGAL.initialTermYears };
const VALIDATED = { ...POLICY, status: "validated" };
const IN = { agreement_on: "2026-05-01", law_scope: "yes" };
const fixed = (start_on, end_on, over = {}) => ({ kind: "fixed", start_on, end_on, ...IN, ...over });
const codes = r => r.issues.map(i => i.code);

test("the rules come from the agreement date and the parameter, never from the start date or the recorded label", () => {
  assert.equal(regimeOf("2026-04-14", POLICY), "2011");
  assert.equal(regimeOf("2026-04-15", POLICY), "2025");
  assert.equal(regimeOf("2026-04-20", { ...POLICY, regime2025From: "2026-05-01" }), "2011");
  for (const none of [null, undefined, "", "2026-02-30"]) assert.equal(regimeOf(none, POLICY), "unknown");
  // Agreed before the rules start, although it starts after them.
  assert.equal(lawApplies({ agreement_on: "2026-03-01", start_on: "2026-06-01", law_scope: "yes", regime: "2025" }, POLICY), "no");
  assert.equal(lawApplies({ ...IN, regime: "2011" }, POLICY), "yes");
});

test("unknown is neither yes nor no: only a 2025 agreement over accommodation in scope counts as covered", () => {
  assert.equal(lawApplies({ agreement_on: "2026-05-01", law_scope: "no" }, POLICY), "no");
  assert.equal(lawApplies({ agreement_on: "2026-05-01", law_scope: "unknown" }, POLICY), "unknown");
  assert.equal(lawApplies({ agreement_on: "2026-05-01" }, POLICY), "unknown");
  assert.equal(lawApplies({ agreement_on: null, law_scope: "yes", regime: "2025" }, POLICY), "unknown"); // a legacy label is not a date
  assert.equal(lawApplies({ agreement_on: null, law_scope: "no" }, POLICY), "no");
  assert.equal(lawApplies({ agreement_on: "2026-01-01", law_scope: "unknown" }, POLICY), "no");
});

test("an initial fixed term of more than 3 years: confirmed while estimated, refused once validated", () => {
  const long = fixed("2026-06-01", "2029-06-02"), ok = fixed("2026-06-01", "2029-06-01");
  assert.deepEqual(validateTenancyOperation({ operation: "create", tenancy: ok, policy: POLICY }), { allowed: true, applies: "yes", issues: [] });
  const asked = validateTenancyOperation({ operation: "create", tenancy: long, policy: POLICY });
  assert.deepEqual([asked.allowed, codes(asked), asked.issues[0].blocks, asked.issues[0].field], [false, ["long_term"], false, "end_on"]);
  assert.match(asked.issues[0].message, /up to 3 years/);
  assert.match(asked.issues[0].message, /not yet validated by a lawyer/);
  assert.equal(validateTenancyOperation({ operation: "create", tenancy: long, policy: POLICY, confirmed: ["long_term"] }).allowed, true);
  const refused = validateTenancyOperation({ operation: "create", tenancy: long, policy: VALIDATED, confirmed: ["long_term"] });
  assert.deepEqual([refused.allowed, refused.issues[0].blocks], [false, true]);
  // The parameter, not a constant.
  assert.equal(validateTenancyOperation({ operation: "create", tenancy: long, policy: { ...VALIDATED, initialTermYears: 4 } }).allowed, true);
  // Not covered: nothing to say. Not known: asked, never refused and never passed in silence.
  for (const out of [{ agreement_on: "2026-01-01" }, { law_scope: "no" }])
    assert.deepEqual(validateTenancyOperation({ operation: "create", tenancy: { ...long, ...out }, policy: VALIDATED }).issues, []);
  const unknown = validateTenancyOperation({ operation: "create", tenancy: { ...long, law_scope: "unknown" }, policy: VALIDATED });
  assert.deepEqual([unknown.allowed, unknown.applies, unknown.issues[0].blocks], [false, "unknown", false]);
  assert.match(unknown.issues[0].message, /not recorded whether the 2025 rules apply/);
  assert.equal(validateTenancyOperation({ operation: "create", tenancy: { ...long, law_scope: "unknown" }, policy: VALIDATED,
    confirmed: ["long_term"] }).allowed, true);
});

test("a further fixed term: refused once validated, from Renew and from an edit alike; only a tenancy not yet started is corrected", () => {
  const today = "2026-11-15";
  const before = fixed("2026-06-01", "2027-06-01"), later = { ...before, end_on: "2028-06-01" };
  const renew = policy => validateTenancyOperation({ operation: "renew", tenancy: later, before, policy });
  assert.deepEqual([codes(renew(POLICY)), renew(POLICY).issues[0].blocks], [["second_term"], false]);
  assert.deepEqual([renew(VALIDATED).allowed, renew(VALIDATED).issues[0].blocks], [false, true]);
  assert.deepEqual(validateTenancyOperation({ operation: "renew", tenancy: { ...before, kind: "periodic", end_on: null }, before,
    policy: VALIDATED }).issues, []);
  // Periodic back to fixed is a further fixed term too.
  assert.deepEqual(codes(validateTenancyOperation({ operation: "renew", tenancy: later, before: { ...before, kind: "periodic", end_on: null },
    policy: POLICY })), ["second_term"]);
  // An edit that lengthens a term already running, or makes a periodic tenancy fixed, is the same further term.
  const edit = policy => validateTenancyOperation({ operation: "update", tenancy: later, before, policy, today, confirmed: ["second_term"] });
  assert.deepEqual([codes(edit(VALIDATED)), edit(VALIDATED).issues[0].blocks, edit(VALIDATED).allowed], [["second_term"], true, false]);
  assert.deepEqual([edit(POLICY).issues[0].blocks, edit(POLICY).allowed], [false, true]);
  const refixed = validateTenancyOperation({ operation: "update", tenancy: before, before: { ...before, kind: "periodic", end_on: null },
    policy: VALIDATED, today, confirmed: ["second_term"] });
  assert.deepEqual([codes(refixed), refixed.allowed], [["second_term"], false]);
  // Before the tenancy starts its end date is still the initial term being corrected (within the limit); Renew never is.
  assert.deepEqual(validateTenancyOperation({ operation: "update", tenancy: later, before, policy: VALIDATED, today: "2026-05-31" }).issues, []);
  assert.deepEqual(codes(validateTenancyOperation({ operation: "update", tenancy: { ...before, end_on: "2029-06-02" }, before, policy: VALIDATED,
    today: "2026-05-31" })), ["long_term"]);
  assert.deepEqual(codes(validateTenancyOperation({ operation: "renew", tenancy: later, before, policy: VALIDATED, today: "2026-05-31" })), ["second_term"]);
  // A shorter term, or an edit that leaves the term alone (even a long one from before), raises nothing.
  assert.deepEqual(validateTenancyOperation({ operation: "update", tenancy: { ...before, end_on: "2027-01-01" }, before, policy: VALIDATED }).issues, []);
  const old = fixed("2026-06-01", "2031-06-01");
  assert.deepEqual(validateTenancyOperation({ operation: "update", tenancy: { ...old, tenant_phone: "x" }, before: old, policy: VALIDATED }).issues, []);
  // But an edit cannot stretch it past the limit.
  const stretched = validateTenancyOperation({ operation: "update", tenancy: { ...before, end_on: "2029-06-02" }, before, policy: VALIDATED,
    today, confirmed: ["long_term", "second_term"] });
  assert.deepEqual([stretched.allowed, codes(stretched)], [false, ["long_term", "second_term"]]);
});

test("a save that brings a tenancy under the rules checks its stored term and sums as if just entered", () => {
  const today = "2026-11-15", long = fixed("2026-06-01", "2031-06-01", { opening_balance: 50000 });
  const enter = (was, policy, over = {}) => validateTenancyOperation({ operation: "update", tenancy: long, before: { ...long, ...was },
    policy, today, ...over });
  // From not covered, or from not known, to covered: the term nobody touched in this save is refused once validated.
  for (const was of [{ law_scope: "no" }, { agreement_on: "2026-01-01" }, { law_scope: "unknown" }, { agreement_on: null }]) {
    const r = enter(was, VALIDATED, { confirmed: ["long_term", "premium"] });
    assert.deepEqual([r.allowed, codes(r), r.issues.map(i => i.blocks)], [false, ["long_term", "premium"], [true, false]], JSON.stringify(was));
    assert.equal(enter(was, POLICY).allowed, false);
    assert.equal(enter(was, POLICY, { confirmed: ["long_term", "premium"] }).allowed, true);
  }
  // From not covered to not known: asked, never refused.
  const maybe = validateTenancyOperation({ operation: "update", tenancy: { ...long, law_scope: "unknown" }, before: { ...long, law_scope: "no" },
    policy: VALIDATED, today });
  assert.deepEqual([maybe.allowed, codes(maybe), maybe.issues.some(i => i.blocks)], [false, ["long_term", "premium"], false]);
  // Staying covered, or becoming less covered, examines nothing that this save leaves alone.
  assert.deepEqual(enter({}, VALIDATED).issues, []);
  assert.deepEqual(validateTenancyOperation({ operation: "update", tenancy: { ...long, law_scope: "unknown" }, before: long, policy: VALIDATED, today }).issues, []);
  // What its history holds from while it was outside: a term lengthened after it started, a charge raised by hand.
  const short = fixed("2026-06-01", "2028-06-01"), was = { ...short, law_scope: "no" };
  const hist = history => validateTenancyOperation({ operation: "update", tenancy: short, before: was, policy: VALIDATED, today, history });
  assert.deepEqual(hist({ lengthened: 0, raised: 0 }).issues, []);
  assert.deepEqual([codes(hist({ lengthened: 1, raised: 0 })), hist({ lengthened: 1, raised: 0 }).issues[0].blocks], [["second_term"], true]);
  assert.deepEqual(codes(hist({ lengthened: 0, raised: 1 })), ["premium"]);
  // The history says nothing while the tenancy stays as covered as it was.
  assert.deepEqual(validateTenancyOperation({ operation: "update", tenancy: short, before: short, policy: VALIDATED, today,
    history: { lengthened: 1, raised: 1 } }).issues, []);
});

test("no premium or key money: any sum added beyond the rent series must be declared as neither", () => {
  const t = { kind: "periodic", start_on: "2026-06-01", ...IN };
  const create = validateTenancyOperation({ operation: "create", tenancy: { ...t, opening_balance: 50000 }, policy: VALIDATED });
  assert.deepEqual([create.allowed, codes(create), create.issues[0].blocks, create.issues[0].field], [false, ["premium"], false, "opening_balance"]);
  assert.match(create.issues[0].message, /premium or key money/);
  assert.equal(validateTenancyOperation({ operation: "create", tenancy: { ...t, opening_balance: 50000 }, policy: VALIDATED,
    confirmed: ["premium"] }).allowed, true);
  assert.deepEqual(validateTenancyOperation({ operation: "create", tenancy: { ...t, opening_balance: null }, policy: POLICY }).issues, []);
  const raise = (from, to) => validateTenancyOperation({ operation: "update", tenancy: { ...t, opening_balance: to },
    before: { ...t, opening_balance: from }, policy: POLICY });
  assert.deepEqual(codes(raise(null, 100)), ["premium"]);
  assert.deepEqual(codes(raise(500, 100)), []);
  assert.deepEqual(codes(raise(500, 500)), []);
  const charge = (before, after, over) => validateTenancyOperation({ operation: "charge", tenancy: { ...t, ...over }, charge: { before, after }, policy: POLICY });
  assert.deepEqual([codes(charge(100000, 120000)), charge(100000, 120000).issues[0].field], [["premium"], "amount"]);
  assert.deepEqual(codes(charge(100000, 90000)), []);
  assert.deepEqual(codes(charge(100000, 120000, { law_scope: "no" })), []);
  assert.deepEqual(charge(100000, 120000, { law_scope: "unknown" }).applies, "unknown");
});

// The routes, on D1.
const ADMIN = "admin@example.test", T = jerseyToday(), M0 = `${T.slice(0, 7)}-01`, LONG = addMonths(M0, 37);
const on = schema => ({ ...makeEnv(schema), ADM20_TENANCY_LAW_READY: "1", ADM17_LEGAL_TERMS_READY: "1" });
const req = async (env, method, path, body) => call(env, method, path, { body, cookie: await adminCookie(ADMIN) });
const one = (env, sql, ...args) => ({ ...env.DB.raw.prepare(sql).get(...args) });
async function rental(env, service = "full") {
  const l = await req(env, "POST", "/admin/landlords", { name: "Synthetic owner" });
  const r = await req(env, "POST", "/admin/rentals", { landlord_id: l.data.landlord.id, address: "1 Synthetic Row", parish: "St Helier",
    service, ...(service === "full" ? { fee_percent: 10 } : {}) });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  return r.data.rental.id;
}
const BASE = { tenant_name: "Synthetic tenant", kind: "periodic", rent: 1000, start_on: M0, ...IN };
const add = async (env, over = {}, service) => req(env, "POST", `/admin/rentals/${await rental(env, service)}/tenancies`, { ...BASE, ...over });
const created = async (env, over, service) => {
  const t = await add(env, over, service);
  assert.equal(t.status, 201, JSON.stringify(t.data));
  return t.data.tenancy;
};
const lastEvent = (env, id, type) => JSON.parse(one(env, "SELECT data FROM rental_events WHERE tenancy_id = ? AND type = ? ORDER BY id DESC LIMIT 1", id, type).data);
const validate = async env => {
  const { data: { terms } } = await req(env, "GET", "/admin/legal-terms");
  const r = await req(env, "PUT", "/admin/legal-terms", { values: terms.values, status: "validated", validated_ref: "Synthetic advice 1",
    validated_on: T, revision: terms.revision });
  assert.equal(r.status, 200, JSON.stringify(r.data));
};

test("switch off, or on with migration 0073 pending: New tenancy, Renew and the payloads work exactly as before", async () => {
  for (const env of [makeEnv(), on({ through: 72 })]) {
    const t = await add(env, { kind: "fixed", end_on: LONG, regime: "2011", opening_balance: 5000 });
    assert.equal(t.status, 201, JSON.stringify(t.data));
    assert.equal(t.data.tenancy.regime, "2011");
    assert.equal("law" in t.data, false);
    assert.equal((await add(env, {})).data.fields.regime, "Choose the 2011 or 2025 law");
    assert.equal((await req(env, "POST", `/admin/tenancies/${t.data.tenancy.id}/renew`, { kind: "fixed", end_on: addMonths(LONG, 12) })).status, 200);
    assert.equal("law" in (await req(env, "GET", `/admin/rentals/${t.data.tenancy.rental_id}`)).data, false);
  }
  // Migrated but switched off: the new columns keep their defaults whatever the body says.
  const env = makeEnv(), t = await created(env, { regime: "2011" });
  assert.deepEqual(one(env, "SELECT agreement_on, law_scope FROM tenancies WHERE id = ?", t.id), { agreement_on: null, law_scope: "unknown" });
});

test("New tenancy: the agreement date sets the recorded rules; without it the label is asked for and the scope stays unknown", async () => {
  const env = on();
  const t = await created(env);
  assert.deepEqual([t.regime, t.agreement_on, t.law_scope], ["2025", "2026-05-01", "yes"]);
  assert.equal((await created(env, { agreement_on: "2026-04-14", regime: "2025" })).regime, "2011"); // the date wins over a label sent with it
  assert.equal((await add(env, { agreement_on: null, law_scope: null })).data.fields.regime, "Choose the 2011 or 2025 law");
  const legacy = await created(env, { agreement_on: null, law_scope: null, regime: "2011" });
  assert.deepEqual([legacy.regime, legacy.agreement_on, legacy.law_scope], ["2011", null, "unknown"]);
  assert.equal((await add(env, { law_scope: "maybe" })).data.fields.law_scope, "Choose yes, no or not known");
  assert.equal((await add(env, { agreement_on: "2026-02-30" })).status, 400);
  const d = await req(env, "GET", `/admin/tenancies/${t.id}`);
  assert.deepEqual(d.data.law, { status: "estimated", regime2025From: "2026-04-15", initialTermYears: 3 });
  assert.deepEqual((await req(env, "GET", `/admin/rentals/${t.rental_id}`)).data.law, d.data.law);
});

test("New tenancy: a long fixed term or an opening sum needs the confirmation, which the history keeps; validated rules refuse the term", async () => {
  const env = on(), long = { kind: "fixed", end_on: LONG };
  const asked = await add(env, long);
  assert.equal(asked.status, 400);
  assert.deepEqual(Object.keys(asked.data.fields), ["law_confirmed"]);
  assert.equal(one(env, "SELECT COUNT(*) AS n FROM tenancies").n, 0);
  assert.equal((await add(env, { ...long, law_confirmed: ["premium"] })).status, 400);
  const t = await created(env, { ...long, opening_balance: 5000, law_confirmed: ["long_term", "premium"] });
  assert.deepEqual(lastEvent(env, t.id, "tenancy.created").law, { status: "estimated", applies: "yes", confirmed: ["long_term", "premium"] });
  assert.equal(one(env, "SELECT amount FROM charges WHERE tenancy_id = ? AND kind = 'opening'", t.id).amount, 5000);
  // Nothing to confirm: nothing kept.
  assert.equal("law" in lastEvent(env, (await created(env)).id, "tenancy.created"), false);
  // Not covered: saved as before.
  assert.equal((await add(env, { ...long, law_scope: "no" })).status, 201);
  await validate(env);
  const refused = await add(env, { ...long, law_confirmed: ["long_term"] });
  assert.equal(refused.status, 400);
  assert.match(refused.data.fields.end_on, /up to 3 years/);
  // Scope not known: asked, not refused.
  assert.deepEqual(Object.keys((await add(env, { ...long, law_scope: "unknown" })).data.fields), ["law_confirmed"]);
  assert.equal((await add(env, { ...long, law_scope: "unknown", law_confirmed: ["long_term"] })).status, 201);
});

test("Renew: a further fixed term is confirmed while estimated and refused once validated; periodic goes on, and nothing paid or owed moves", async () => {
  const env = on(), t = await created(env, { kind: "fixed", end_on: addMonths(M0, 12) });
  await req(env, "POST", "/admin/payments", { tenancy_id: t.id, amount: 100000, received_on: T });
  const money = () => [one(env, "SELECT COUNT(*) AS n, SUM(amount) AS s FROM charges WHERE tenancy_id = ?", t.id),
    one(env, "SELECT COUNT(*) AS n, SUM(amount) AS s FROM payments WHERE tenancy_id = ?", t.id)];
  const before = money(), body = { kind: "fixed", end_on: addMonths(M0, 24) };
  const asked = await req(env, "POST", `/admin/tenancies/${t.id}/renew`, body);
  assert.equal(asked.status, 400);
  assert.deepEqual(Object.keys(asked.data.fields), ["law_confirmed"]);
  assert.equal(one(env, "SELECT end_on FROM tenancies WHERE id = ?", t.id).end_on, addMonths(M0, 12));
  const done = await req(env, "POST", `/admin/tenancies/${t.id}/renew`, { ...body, law_confirmed: ["second_term"] });
  assert.equal(done.status, 200, JSON.stringify(done.data));
  assert.deepEqual([done.data.tenancy.end_on, done.data.tenancy.payment_ref, done.data.tenancy.regime], [addMonths(M0, 24), t.payment_ref, "2025"]);
  assert.deepEqual(lastEvent(env, t.id, "tenancy.renewed").law, { status: "estimated", applies: "yes", confirmed: ["second_term"] });
  await validate(env);
  const refused = await req(env, "POST", `/admin/tenancies/${t.id}/renew`, { kind: "fixed", end_on: addMonths(M0, 30), law_confirmed: ["second_term"] });
  assert.equal(refused.status, 400);
  assert.match(refused.data.fields.end_on, /further fixed term/);
  assert.equal((await req(env, "POST", `/admin/tenancies/${t.id}/renew`, { kind: "periodic" })).status, 200);
  assert.deepEqual(money(), before);
});

test("Renew holds to the agreement date and scope it was checked on: a change meanwhile is a 409 and nothing is written", async () => {
  const env = on(), t = await created(env, { kind: "fixed", end_on: addMonths(M0, 12), law_scope: "no" }), batch = env.DB.batch.bind(env.DB);
  let changed = false;
  env.DB.batch = async statements => {
    if (!changed) { changed = true; env.DB.raw.prepare("UPDATE tenancies SET law_scope = 'yes' WHERE id = ?").run(t.id); }
    return batch(statements);
  };
  const res = await req(env, "POST", `/admin/tenancies/${t.id}/renew`, { kind: "fixed", end_on: addMonths(M0, 24) });
  assert.equal(res.status, 409);
  assert.equal(one(env, "SELECT end_on FROM tenancies WHERE id = ?", t.id).end_on, addMonths(M0, 12));
  assert.equal(one(env, "SELECT COUNT(*) AS n FROM rental_events WHERE tenancy_id = ? AND type = 'tenancy.renewed'", t.id).n, 0);
});

test("Edit: a partial edit cannot stretch the term unconfirmed; other edits of an older long term go through", async () => {
  const env = on(), t = await created(env, { kind: "fixed", end_on: LONG, law_confirmed: ["long_term"] });
  const put = (body, cur = t) => req(env, "PUT", `/admin/tenancies/${cur.id}`, { ...body, updated_at: cur.updated_at });
  const phone = await put({ tenant_phone: "01534 000000" });
  assert.equal(phone.status, 200, JSON.stringify(phone.data));
  const asked = await put({ end_on: addMonths(LONG, 1) }, phone.data.tenancy);
  assert.equal(asked.status, 400);
  assert.deepEqual(Object.keys(asked.data.fields), ["law_confirmed"]);
  const saved = await put({ end_on: addMonths(LONG, 1), law_confirmed: ["long_term", "second_term"] }, phone.data.tenancy);
  assert.equal(saved.status, 200, JSON.stringify(saved.data));
  assert.deepEqual(lastEvent(env, t.id, "tenancy.updated").law.confirmed, ["long_term", "second_term"]);
  await validate(env);
  const refused = await put({ end_on: addMonths(LONG, 2), law_confirmed: ["long_term", "second_term"] }, saved.data.tenancy);
  assert.equal(refused.status, 400);
  assert.match(refused.data.fields.end_on, /up to 3 years/);
  assert.equal((await put({ end_on: addMonths(M0, 30) }, saved.data.tenancy)).status, 200); // back within the limit
});

test("an existing tenancy keeps its label, charges and payments; recording its agreement date and scope is what moves its rules", async () => {
  const env = makeEnv(), off = await created(env, { kind: "fixed", end_on: addMonths(M0, 12), regime: "2011" });
  await req(env, "POST", "/admin/payments", { tenancy_id: off.id, amount: 100000, received_on: T });
  const money = () => [env.DB.raw.prepare("SELECT due_on, amount, kind, edited FROM charges WHERE tenancy_id = ? ORDER BY id").all(off.id).map(r => ({ ...r })),
    env.DB.raw.prepare("SELECT received_on, amount, kind FROM payments WHERE tenancy_id = ? ORDER BY id").all(off.id).map(r => ({ ...r }))];
  const before = money();
  Object.assign(env, { ADM20_TENANCY_LAW_READY: "1", ADM17_LEGAL_TERMS_READY: "1" });
  await validate(env);
  const d = await req(env, "GET", `/admin/tenancies/${off.id}`);
  assert.deepEqual([d.data.tenancy.regime, d.data.tenancy.agreement_on, d.data.tenancy.law_scope], ["2011", null, "unknown"]);
  const renew = (body, id = off.id) => req(env, "POST", `/admin/tenancies/${id}/renew`, { kind: "fixed", end_on: addMonths(M0, 24), ...body });
  // The agreement date and scope recorded: the label follows the date, and the history says so.
  const cur = (await req(env, "GET", `/admin/tenancies/${off.id}`)).data.tenancy;
  const saved = await req(env, "PUT", `/admin/tenancies/${off.id}`, { agreement_on: "2026-05-01", law_scope: "yes", updated_at: cur.updated_at });
  assert.equal(saved.status, 200, JSON.stringify(saved.data));
  assert.deepEqual([saved.data.tenancy.regime, saved.data.tenancy.agreement_on, saved.data.tenancy.law_scope], ["2025", "2026-05-01", "yes"]);
  const event = lastEvent(env, off.id, "tenancy.updated");
  assert.deepEqual([event.before, event.after], [{ regime: "2011", agreement_on: null, law_scope: "unknown" },
    { regime: "2025", agreement_on: "2026-05-01", law_scope: "yes" }]);
  assert.equal((await renew({ end_on: addMonths(M0, 30), law_confirmed: ["second_term"] })).status, 400); // now covered, and validated
  assert.deepEqual(money(), before);
  // Not known is not "no": a further fixed term is asked about; and not "yes" either: validated rules do not refuse it.
  const legacy = await created(env, { kind: "fixed", end_on: addMonths(M0, 12), agreement_on: null, law_scope: null, regime: "2011" });
  assert.deepEqual(Object.keys((await renew({}, legacy.id)).data.fields), ["law_confirmed"]);
  assert.equal((await renew({ law_confirmed: ["second_term"] }, legacy.id)).status, 200);
  assert.equal(lastEvent(env, legacy.id, "tenancy.renewed").law.applies, "unknown");
  // Recorded as covered afterwards, that further term is refused like any other.
  const late = await put(env, legacy.id, { agreement_on: "2026-05-01", law_scope: "yes" });
  assert.equal(late.status, 400);
  assert.match(late.data.fields.end_on, /further fixed term/);
});

const put = async (env, id, body) => req(env, "PUT", `/admin/tenancies/${id}`,
  { ...body, updated_at: one(env, "SELECT updated_at FROM tenancies WHERE id = ?", id).updated_at });
const stored = (env, id) => one(env, "SELECT kind, end_on, agreement_on, law_scope, regime FROM tenancies WHERE id = ?", id);

test("validated rules: a tenancy moved out of the rules and back, or recorded as covered later, does not carry a breach past them", async () => {
  const env = on(), year = { kind: "fixed", end_on: addMonths(M0, 12) }, far = addMonths(M0, 120);
  await validate(env);
  // (a) The scope set to "no" with a ten-year term, then back to "yes".
  const a = await created(env, year);
  assert.equal((await put(env, a.id, { law_scope: "no", end_on: far })).status, 200);
  const back = await put(env, a.id, { law_scope: "yes" });
  assert.equal(back.status, 400);
  assert.match(back.data.fields.end_on, /up to 3 years/);
  assert.deepEqual([stored(env, a.id).law_scope, stored(env, a.id).end_on], ["no", far]);
  // Brought within the limit while outside, it is still a term lengthened after it started.
  assert.equal((await put(env, a.id, { end_on: addMonths(M0, 24) })).status, 200);
  const within = await put(env, a.id, { law_scope: "yes", law_confirmed: ["second_term"] });
  assert.equal(within.status, 400);
  assert.match(within.data.fields.end_on, /further fixed term/);
  // (b) The agreement date moved before the rules with the long term, then back.
  const b = await created(env, year);
  assert.equal((await put(env, b.id, { agreement_on: "2026-01-01", end_on: far })).status, 200);
  assert.equal((await put(env, b.id, { agreement_on: "2026-05-01" })).status, 400);
  assert.equal(stored(env, b.id).agreement_on, "2026-01-01");
  // (c) Entered with nothing recorded and the long term confirmed, then recorded as covered.
  const c = await created(env, { kind: "fixed", end_on: LONG, agreement_on: null, law_scope: null, regime: "2025", law_confirmed: ["long_term"] });
  const covered = await put(env, c.id, { agreement_on: "2026-05-01", law_scope: "yes", law_confirmed: ["long_term"] });
  assert.equal(covered.status, 400);
  assert.match(covered.data.fields.end_on, /up to 3 years/);
  // The same save may bring the term within the rules.
  assert.equal((await put(env, c.id, { agreement_on: "2026-05-01", law_scope: "yes", end_on: addMonths(M0, 36) })).status, 200);
  assert.equal(stored(env, c.id).law_scope, "yes");
});

test("estimated rules: coming under the rules asks again for the confirmation of the stored term and sums", async () => {
  const env = on();
  // An opening sum entered while outside the rules, then the scope set to "yes".
  const t = await created(env, { law_scope: "no", opening_balance: 50000 });
  assert.equal(one(env, "SELECT amount FROM charges WHERE tenancy_id = ? AND kind = 'opening'", t.id).amount, 50000);
  assert.deepEqual(Object.keys((await put(env, t.id, { law_scope: "yes" })).data.fields), ["law_confirmed"]);
  assert.equal(stored(env, t.id).law_scope, "no");
  assert.equal((await put(env, t.id, { law_scope: "yes", law_confirmed: ["premium"] })).status, 200);
  assert.deepEqual(lastEvent(env, t.id, "tenancy.updated").law, { status: "estimated", applies: "yes", confirmed: ["premium"] });
  // A long term entered while outside.
  const l = await created(env, { kind: "fixed", end_on: LONG, law_scope: "no" });
  assert.deepEqual(Object.keys((await put(env, l.id, { law_scope: "yes" })).data.fields), ["law_confirmed"]);
  assert.equal((await put(env, l.id, { law_scope: "yes", law_confirmed: ["long_term"] })).status, 200);
  // A charge raised by hand while outside.
  const r = await created(env, { law_scope: "no" });
  const ch = one(env, "SELECT id, amount FROM charges WHERE tenancy_id = ? ORDER BY due_on LIMIT 1", r.id);
  assert.equal((await req(env, "PUT", `/admin/charges/${ch.id}`, { amount: ch.amount + 5000 })).status, 200);
  assert.deepEqual(Object.keys((await put(env, r.id, { law_scope: "yes" })).data.fields), ["law_confirmed"]);
  assert.equal((await put(env, r.id, { law_scope: "yes", law_confirmed: ["premium"] })).status, 200);
  // The tenancy page carries what the form needs to show those issues.
  assert.deepEqual((await req(env, "GET", `/admin/tenancies/${r.id}`)).data.law_history, { lengthened: 0, raised: 1 });
});

test("validated rules: Edit details cannot lengthen a running fixed term or make a periodic tenancy fixed, as Renew cannot", async () => {
  const env = on();
  await validate(env);
  const t = await created(env, { kind: "fixed", end_on: addMonths(M0, 12) });
  const longer = await put(env, t.id, { end_on: addMonths(M0, 24), law_confirmed: ["second_term"] });
  assert.equal(longer.status, 400);
  assert.match(longer.data.fields.end_on, /further fixed term/);
  assert.equal(stored(env, t.id).end_on, addMonths(M0, 12));
  const p = await created(env);
  assert.equal((await put(env, p.id, { kind: "fixed", end_on: addMonths(M0, 12), law_confirmed: ["second_term"] })).status, 400);
  assert.equal(stored(env, p.id).kind, "periodic");
  // A tenancy that has not started yet: its end date is still the initial term, corrected within the limit only.
  const next = await created(env, { kind: "fixed", start_on: addMonths(M0, 1), end_on: addMonths(M0, 13) });
  assert.equal((await put(env, next.id, { end_on: addMonths(M0, 38) })).status, 400);
  assert.equal((await put(env, next.id, { end_on: addMonths(M0, 25) })).status, 200);
});

test("the confirmation counts only for the issues found; the label cannot contradict the agreement date; a charge is corrected from the amount read", async () => {
  const env = on(), long = { kind: "fixed", end_on: LONG };
  assert.deepEqual(Object.keys((await add(env, { ...long, law_confirmed: ["long_term", "second_term", "premium"] })).data.fields), ["law_confirmed"]);
  assert.deepEqual(Object.keys((await add(env, { law_confirmed: ["premium"] })).data.fields), ["law_confirmed"]);
  const t = await created(env, { ...long, law_confirmed: ["long_term"] });
  const relabel = await put(env, t.id, { regime: "2011" });
  assert.equal(relabel.status, 200);
  assert.equal(stored(env, t.id).regime, "2025");
  // Two corrections of one charge at once: the second is refused, not applied over an amount it never saw.
  const c = one(env, "SELECT id, amount FROM charges WHERE tenancy_id = ? ORDER BY due_on LIMIT 1", t.id), batch = env.DB.batch.bind(env.DB);
  let changed = false;
  env.DB.batch = async statements => {
    if (!changed) { changed = true; env.DB.raw.prepare("UPDATE charges SET amount = ? WHERE id = ?").run(c.amount - 50000, c.id); }
    return batch(statements);
  };
  assert.equal((await req(env, "PUT", `/admin/charges/${c.id}`, { amount: c.amount - 10000 })).status, 409);
  assert.equal(one(env, "SELECT amount FROM charges WHERE id = ?", c.id).amount, c.amount - 50000);
});

test("charges: an opening sum added later and a charge corrected upwards need the declaration; lowering one does not", async () => {
  const env = on(), t = await created(env);
  const put = body => req(env, "PUT", `/admin/tenancies/${t.id}`, { ...body, updated_at: t.updated_at });
  const asked = await put({ opening_balance: 7500 });
  assert.equal(asked.status, 400);
  assert.deepEqual(Object.keys(asked.data.fields), ["law_confirmed"]);
  assert.equal(one(env, "SELECT COUNT(*) AS n FROM charges WHERE tenancy_id = ? AND kind = 'opening'", t.id).n, 0);
  assert.equal((await put({ opening_balance: 7500, law_confirmed: ["premium"] })).status, 200);
  const c = one(env, "SELECT id, amount FROM charges WHERE tenancy_id = ? AND kind = 'rent' ORDER BY due_on LIMIT 1", t.id);
  const up = await req(env, "PUT", `/admin/charges/${c.id}`, { amount: c.amount + 5000 });
  assert.equal(up.status, 400);
  assert.deepEqual(Object.keys(up.data.fields), ["law_confirmed"]);
  assert.equal(one(env, "SELECT amount FROM charges WHERE id = ?", c.id).amount, c.amount);
  assert.equal((await req(env, "PUT", `/admin/charges/${c.id}`, { amount: c.amount + 5000, law_confirmed: ["premium"] })).status, 200);
  assert.deepEqual(lastEvent(env, t.id, "charge.edited").law, { status: "estimated", applies: "yes", confirmed: ["premium"] });
  assert.equal((await req(env, "PUT", `/admin/charges/${c.id}`, { amount: c.amount })).status, 200);
  // A tenancy the rules do not cover is corrected as before.
  const out = await created(env, { law_scope: "no" });
  const oc = one(env, "SELECT id, amount FROM charges WHERE tenancy_id = ? ORDER BY due_on LIMIT 1", out.id);
  assert.equal((await req(env, "PUT", `/admin/charges/${oc.id}`, { amount: oc.amount + 5000 })).status, 200);
});

test("the start of the 2025 rules and the longest initial term are versioned legal parameters, estimated until validated with them", async () => {
  const env = on();
  // A set validated before these parameters existed: it never held them, so it reads as estimated.
  const KEYS = ["depositDays", "reportDays", "licenceYears", "eicrYears", "gasYears", "alarmsYears", "tenantNoticeMonths",
    "landlordNoticeMonths", "rentNoticeMonths", "rentIntervalMonths"];
  env.DB.raw.prepare("INSERT INTO legal_settings (key, value, revision, updated_at, updated_by) VALUES ('terms', ?, 1, ?, ?)")
    .run(JSON.stringify({ values: Object.fromEntries(KEYS.map(k => [k, LEGAL[k]])), status: "validated", validated_ref: "Synthetic advice 0",
      validated_on: "2026-11-01" }), "2026-11-01T00:00:00.000Z", ADMIN);
  const { data: { terms } } = await req(env, "GET", "/admin/legal-terms");
  assert.deepEqual([terms.status, terms.values.regime2025From, terms.values.initialTermYears], ["estimated", "2026-04-15", 3]);
  const save = values => req(env, "PUT", "/admin/legal-terms", { values: { ...terms.values, ...values }, status: "estimated", revision: 1 });
  assert.equal((await save({ regime2025From: "2026-02-30" })).data.fields.regime2025From, "Enter a date");
  assert.equal((await save({ initialTermYears: 0 })).data.fields.initialTermYears, "Enter a whole number from 1 to 20");
  // Agreed on 1 May: covered while the rules start on 15 April, not once they are saved as starting on 1 June.
  const long = { kind: "fixed", end_on: LONG };
  assert.equal((await add(env, long)).status, 400);
  assert.equal((await save({ regime2025From: "2026-06-01" })).status, 200);
  const t = await created(env, long);
  assert.equal(t.regime, "2011");
  assert.equal(one(env, "SELECT COUNT(*) AS n FROM legal_setting_versions WHERE key = 'terms'").n, 2);
  // Without ADM-17's switch the code's values count, estimated.
  delete env.ADM17_LEGAL_TERMS_READY;
  assert.deepEqual((await req(env, "GET", `/admin/tenancies/${t.id}`)).data.law, { status: "estimated", regime2025From: "2026-04-15", initialTermYears: 3 });
});
