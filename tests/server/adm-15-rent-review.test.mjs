import test from "node:test";
import assert from "node:assert/strict";
import { makeEnv, call, adminCookie } from "./helpers.mjs";
import { jerseyToday } from "../../server/viewings.js";
import { LEGAL, addMonths, rentAssistant } from "../../server/rentals.js";

// ADM-15: the rent review behind ADM15_RENT_REVIEW_READY (no migration). The rules a rent change is estimated under
// come from the agreement date and the scope (ADM-20), never from the recorded label; the RPI figure counts only with
// its source and publication date, and is kept with the change; and the change's facts are an internal draft, no
// notice for the tenant, while the periods are not validated or it is not recorded whether the rules apply.
const POLICY = { status: "estimated", regime2025From: LEGAL.regime2025From, initialTermYears: LEGAL.initialTermYears };
const VALIDATED = { ...POLICY, status: "validated" };
const RPI = { percent: 3.2, as_of: "2026-09-30", source: "Synthetic RPI bulletin, September 2026" };
const T0 = { regime: "2011", agreement_on: "2026-05-01", law_scope: "yes", rent: 1200, start_on: "2026-05-01", last_rent_change_on: null };
const PERIODS = "the legal periods are not validated by a lawyer", SCOPE = "it is not recorded whether the 2025 rules apply to this tenancy";

test("the rules come from the agreement date and the scope, never from the recorded label", () => {
  // A 2025 agreement in scope, although its label says 2011.
  const yes = rentAssistant(T0, RPI, "2026-10-24", LEGAL, POLICY);
  assert.deepEqual([yes.applies, yes.cover, yes.max_rent, yes.earliest_on], [true, "yes", 1238, "2027-05-01"]);
  assert.deepEqual(yes.rpi, RPI);
  assert.equal(yes.notes.some(n => /label/.test(n)), false);
  // Agreed before the rules start, or accommodation out of scope, although the label says 2025: no estimate.
  for (const out of [{ agreement_on: "2026-04-14" }, { law_scope: "no" }]) {
    const no = rentAssistant({ ...T0, regime: "2025", ...out }, RPI, "2026-10-24", LEGAL, POLICY);
    assert.deepEqual([no.applies, no.cover, no.max_rent, no.earliest_on, no.rpi], [false, "no", null, null, null]);
    assert.match(no.notes[0], /not recorded as covering this tenancy/);
  }
  // The parameter, not a constant.
  assert.equal(rentAssistant(T0, RPI, "2026-10-24", LEGAL, { ...POLICY, regime2025From: "2026-06-01" }).cover, "no");
});

test("no agreement date or scope: it says so, works the estimate out only as a condition and never as covered", () => {
  for (const gap of [{ agreement_on: null, regime: "2025" }, { law_scope: "unknown" }]) {
    const a = rentAssistant({ ...T0, ...gap }, RPI, "2026-10-24", LEGAL, VALIDATED);
    assert.deepEqual([a.applies, a.cover, a.max_rent, a.earliest_on], [true, "unknown", 1238, "2027-05-01"]);
    assert.match(a.notes[0], /It is not recorded whether the 2025 rules apply to this tenancy/);
    assert.deepEqual(a.draft_only, [SCOPE]);
  }
});

test("the facts are an internal draft while the periods are not validated or the rules are not known to apply", () => {
  const of = (t, policy) => rentAssistant({ ...T0, ...t }, RPI, "2026-10-24", LEGAL, policy).draft_only;
  assert.deepEqual(of({}, POLICY), [PERIODS]);
  assert.deepEqual(of({ law_scope: "unknown" }, POLICY), [PERIODS, SCOPE]);
  assert.deepEqual(of({}, VALIDATED), []);
});

test("the limit needs an RPI figure with its source: none is made up, 0% keeps the rent, pounds round down", () => {
  const max = (rpi, rent = 1200) => rentAssistant({ ...T0, rent }, rpi, "2026-10-24", LEGAL, POLICY);
  for (const none of [null, { percent: 3.2, as_of: "2026-09-30" }, { ...RPI, source: "" }]) {
    const a = max(none);
    assert.deepEqual([a.max_rent, a.rpi, a.earliest_on], [null, null, "2027-05-01"]);
    assert.ok(a.notes.includes("Enter Jersey's RPI with its source and publication date to work out the limit."));
  }
  assert.equal(max({ ...RPI, percent: 0 }).max_rent, 1200);
  assert.equal(max({ ...RPI, percent: 3.125 }, 10000).max_rent, 10312); // never £10,313
  assert.equal(max({ ...RPI, percent: 15 }, 1000).max_rent, 1150);
  assert.equal(max({ ...RPI, percent: 0.04 }, 1200).max_rent, 1200); // 48p is no pound
});

test("the earliest date: the interval since the last change or the notice from today, with the periods in force", () => {
  const on = (t, today, legal = LEGAL) => rentAssistant({ ...T0, ...t }, RPI, today, legal, POLICY).earliest_on;
  assert.equal(on({}, "2026-10-24"), "2027-05-01"); // the interval is not yet served
  assert.equal(on({ start_on: "2024-01-31", agreement_on: "2026-05-01", last_rent_change_on: "2025-08-31" }, "2026-10-24"), "2026-12-24");
  assert.equal(on({}, "2026-10-24", { ...LEGAL, rentIntervalMonths: 6 }), "2026-12-24");
  assert.equal(on({ last_rent_change_on: "2025-08-31" }, "2026-12-31", { ...LEGAL, rentNoticeMonths: 2 }), "2027-02-28"); // capped at the month's end
});

test("without the policy the assistant answers exactly as before", () => {
  const t = { regime: "2025", rent: 1200, start_on: "2026-05-01", last_rent_change_on: null };
  assert.deepEqual(rentAssistant(t, { percent: 3.2, as_of: "2026-09-30" }, "2026-10-24"), { applies: true, max_rent: 1238, earliest_on: "2027-05-01",
    notes: ["This estimate uses the recorded 2025 label; it does not confirm which rules apply. Check with a Jersey lawyer.",
      "Exceptions may apply after improvements or when rent is below the market. Check with a Jersey lawyer."] });
  assert.deepEqual(Object.keys(rentAssistant({ ...t, regime: "2011" }, null, "2026-10-24")), ["applies", "max_rent", "earliest_on", "notes"]);
});

// The routes, on D1.
const T = jerseyToday(), M0 = `${T.slice(0, 7)}-01`, PUBLISHED = addMonths(M0, -1);
const law = schema => ({ ...makeEnv(schema), ADM20_TENANCY_LAW_READY: "1", ADM17_LEGAL_TERMS_READY: "1" });
const on = schema => ({ ...law(schema), ADM15_RENT_REVIEW_READY: "1" });
const req = async (env, method, path, body) => call(env, method, path, { body, cookie: await adminCookie() });
const changed = env => env.DB.raw.prepare("SELECT data FROM rental_events WHERE type = 'rent.changed' ORDER BY id").all().map(e => JSON.parse(e.data));
async function tenancy(env, over = {}) {
  const l = await req(env, "POST", "/admin/landlords", { name: "Synthetic owner" });
  const r = await req(env, "POST", "/admin/rentals", { landlord_id: l.data.landlord.id, address: "1 Synthetic Row", parish: "St Helier",
    service: "let_only" });
  const t = await req(env, "POST", `/admin/rentals/${r.data.rental.id}/tenancies`, { tenant_name: "Synthetic tenant", kind: "periodic",
    rent: 1000, start_on: addMonths(M0, -14), agreement_on: "2026-05-01", law_scope: "yes", ...over });
  assert.equal(t.status, 201, JSON.stringify(t.data));
  return t.data.tenancy.id;
}
const SAVED = { percent: 3.2, as_of: PUBLISHED, source: "Synthetic RPI bulletin" };

test("switch off, or on without ADM-20's rules: the RPI, the assistant and the rent change work exactly as before", async () => {
  for (const env of [law(), { ...makeEnv(), ADM15_RENT_REVIEW_READY: "1" }]) {
    const id = await tenancy(env, { regime: "2025" });
    const put = await req(env, "PUT", "/admin/settings/rpi", { percent: 3.2, as_of: PUBLISHED, source: "ignored" });
    assert.deepEqual(put.data, { rpi: { percent: 3.2, as_of: PUBLISHED } });
    const { assistant } = (await req(env, "GET", `/admin/tenancies/${id}`)).data;
    assert.deepEqual(Object.keys(assistant), ["applies", "max_rent", "earliest_on", "notes", "rpi"]);
    assert.deepEqual([assistant.max_rent, assistant.earliest_on], [1032, addMonths(T, 2)]);
    assert.equal((await req(env, "POST", `/admin/tenancies/${id}/rent`, { rent: 1100, effective_on: addMonths(T, 2) })).status, 200);
    assert.deepEqual(changed(env), [{ before: 1000, rent: 1100, effective_on: addMonths(T, 2) }]);
  }
});

test("the RPI is saved with its source and the date it was published, today or earlier", async () => {
  const env = on(), put = body => req(env, "PUT", "/admin/settings/rpi", body);
  for (const source of [undefined, "", "   ", 7, "x".repeat(201)])
    assert.match((await put({ ...SAVED, source })).data.fields.source, /where the figure was published/);
  assert.match((await put({ ...SAVED, as_of: addMonths(T, 1) })).data.fields.as_of, /today or earlier/);
  for (const percent of [-0.1, -3, 30.01, "abc", null]) assert.equal((await put({ ...SAVED, percent })).status, 400, String(percent));
  assert.deepEqual((await put({ ...SAVED, source: `  ${SAVED.source} ` })).data, { rpi: SAVED });
  assert.deepEqual((await req(env, "GET", "/admin/settings/rpi")).data, { rpi: SAVED });
  const [event] = env.DB.raw.prepare("SELECT data FROM rental_events WHERE type = 'settings.updated'").all();
  assert.deepEqual(JSON.parse(event.data), { key: "rpi", value: SAVED });
});

test("a figure saved before the switch has no source: no limit until someone records where it was published", async () => {
  const env = law(), id = await tenancy(env);
  await req(env, "PUT", "/admin/settings/rpi", { percent: 3.2, as_of: PUBLISHED });
  env.ADM15_RENT_REVIEW_READY = "1";
  const { assistant } = (await req(env, "GET", `/admin/tenancies/${id}`)).data;
  assert.deepEqual([assistant.cover, assistant.max_rent, assistant.rpi], ["yes", null, { percent: 3.2, as_of: PUBLISHED }]);
  await req(env, "POST", `/admin/tenancies/${id}/rent`, { rent: 1500, effective_on: addMonths(T, 2) });
  assert.deepEqual(changed(env)[0].review, { cover: "yes", status: "estimated", rpi: null, max_rent: null, earliest_on: addMonths(T, 2) });
});

test("the rent change keeps what the assistant said: the RPI with its source, the limit, the earliest date and the rules' status", async () => {
  const env = on(), id = await tenancy(env, { regime: "2011" });
  await req(env, "PUT", "/admin/settings/rpi", SAVED);
  const d = (await req(env, "GET", `/admin/tenancies/${id}`)).data;
  assert.deepEqual([d.assistant.applies, d.assistant.cover, d.assistant.max_rent, d.assistant.earliest_on, d.assistant.draft_only],
    [true, "yes", 1032, addMonths(T, 2), ["the legal periods are not validated by a lawyer"]]);
  // Above the limit and before the earliest date: still the employee's decision, and the history says what was known.
  const r = await req(env, "POST", `/admin/tenancies/${id}/rent`, { rent: 1100, effective_on: T });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.deepEqual(changed(env), [{ before: 1000, rent: 1100, effective_on: T,
    review: { cover: "yes", status: "estimated", rpi: SAVED, max_rent: 1032, earliest_on: addMonths(T, 2) } }]);
  // The next one is worked out from the rent and the date of that change; a rent that falls is kept the same way.
  const down = await req(env, "POST", `/admin/tenancies/${id}/rent`, { rent: 900, effective_on: addMonths(T, 1) });
  assert.equal(down.status, 200, JSON.stringify(down.data));
  assert.deepEqual(changed(env)[1], { before: 1100, rent: 900, effective_on: addMonths(T, 1),
    review: { cover: "yes", status: "estimated", rpi: SAVED, max_rent: 1135, earliest_on: addMonths(T, 12) } });
});

test("scope not recorded, or rules validated: the review says which, and only a covered tenancy under validated periods is no internal draft", async () => {
  const env = on(), unknown = await tenancy(env, { agreement_on: null, law_scope: null, regime: "2025" }), covered = await tenancy(env);
  const { data: { terms } } = await req(env, "GET", "/admin/legal-terms");
  assert.equal((await req(env, "PUT", "/admin/legal-terms", { values: terms.values, status: "validated", validated_ref: "Synthetic advice 1",
    validated_on: T, revision: terms.revision })).status, 200);
  const of = async id => (await req(env, "GET", `/admin/tenancies/${id}`)).data.assistant;
  assert.deepEqual([(await of(unknown)).cover, (await of(unknown)).draft_only], ["unknown", ["it is not recorded whether the 2025 rules apply to this tenancy"]]);
  assert.deepEqual([(await of(covered)).cover, (await of(covered)).draft_only], ["yes", []]);
  await req(env, "POST", `/admin/tenancies/${unknown}/rent`, { rent: 1010, effective_on: addMonths(T, 2) });
  assert.deepEqual(changed(env)[0].review, { cover: "unknown", status: "validated", rpi: null, max_rent: null, earliest_on: addMonths(T, 2) });
  // Not covered (agreed before the rules start): the change is kept with no estimate, whatever RPI is saved.
  await req(env, "PUT", "/admin/settings/rpi", SAVED);
  const out = await tenancy(env, { agreement_on: "2026-01-10" });
  assert.equal((await req(env, "POST", `/admin/tenancies/${out}/rent`, { rent: 2000, effective_on: T })).status, 200);
  assert.deepEqual(changed(env)[1].review, { cover: "no", status: "validated", rpi: null, max_rent: null, earliest_on: null });
});
