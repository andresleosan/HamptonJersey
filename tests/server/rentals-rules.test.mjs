import test from "node:test";
import assert from "node:assert/strict";
import { LEGAL, ARREARS_STEPS, COMPLIANCE, paymentRef, REF_RE, addMonths, nextStep, complianceStatus, rentAssistant,
  earliestMoveOut, validateLandlord, validateRental, validateTenancy, validateRepair, validatePayment, parseMoney,
  parseBankDate } from "../../server/rentals.js";

test("constants and the payment reference", () => {
  assert.deepEqual(LEGAL, { depositDays: 30, reportDays: 7, licenceYears: 2, eicrYears: 5, gasYears: 1, alarmsYears: 1,
    warnDays: [60, 30, 7], renewalDays: 90, rentNoticeMonths: 2, rentIntervalMonths: 12, regime2025From: "2026-04-15",
    tenantNoticeMonths: 1, landlordNoticeMonths: 12 });
  assert.deepEqual(ARREARS_STEPS, [[1, "reminder", "Friendly reminder"], [5, "firm", "Firm reminder"],
    [7, "call", "Call the tenant"], [10, "landlord", "Tell the landlord"], [14, "letter", "Formal letter"]]);
  assert.deepEqual(COMPLIANCE, [["licence", "Rental dwelling licence", 2], ["eicr", "Electrical safety (EICR)", 5],
    ["gas", "Gas safety", 1], ["alarms", "Smoke and CO alarms", 1]]);
  assert.equal(paymentRef(42), "HE-T0042");
  assert.equal(paymentRef(12345), "HE-T12345");
  for (const s of ["Rent HE-T0042 May", "he-t0042", "HE-T 0042", "HET 0042", "heT0042"])
    assert.equal(s.match(REF_RE)?.[1], "0042", s);
  assert.equal("HE-T042".match(REF_RE), null);
});

test("addMonths: 31 Jan + 1 is the last day of February, leap years included", () => {
  assert.equal(addMonths("2026-01-31", 1), "2026-02-28");
  assert.equal(addMonths("2028-01-31", 1), "2028-02-29");
  assert.equal(addMonths("2026-03-31", 1), "2026-04-30");
  assert.equal(addMonths("2026-11-15", 2), "2027-01-15");
  assert.equal(addMonths("2026-10-24", 12), "2027-10-24");
  assert.equal(addMonths("2028-02-29", 12), "2029-02-28");
  assert.equal(addMonths("2026-03-31", -1), "2026-02-28");
});

test("nextStep: day 0 none; day 6 firm; day 15 letter even if nothing was done; done letter → null", () => {
  assert.equal(nextStep(0, []), null);
  assert.deepEqual(nextStep(1, []), [1, "reminder", "Friendly reminder"]);
  assert.deepEqual(nextStep(6, []), [5, "firm", "Firm reminder"]);
  assert.deepEqual(nextStep(6, ["reminder"]), [5, "firm", "Firm reminder"]);
  assert.equal(nextStep(6, ["firm"]), null);
  assert.deepEqual(nextStep(15, []), [14, "letter", "Formal letter"]);
  assert.equal(nextStep(15, ["letter"]), null);
  assert.equal(nextStep(40, ["letter"]), null);
});

test("complianceStatus: missing, overdue, 7/30/60-day warnings and ok", () => {
  const today = "2026-10-24", at = expires_on => complianceStatus({ done_on: "2025-01-01", expires_on }, today);
  assert.equal(complianceStatus({ done_on: null, expires_on: null }, today), "missing");
  assert.equal(at("2026-10-23"), "overdue");
  assert.equal(at("2026-10-24"), "due7");
  assert.equal(at("2026-10-31"), "due7");
  assert.equal(at("2026-11-01"), "due30");
  assert.equal(at("2026-11-23"), "due30");
  assert.equal(at("2026-11-24"), "due60");
  assert.equal(at("2026-12-23"), "due60");
  assert.equal(at("2026-12-24"), "ok");
});

test("rentAssistant: 2025 tenancy caps at RPI and waits 12 months and 2 months' notice; 2011 tenancy does not apply", () => {
  const rpi = { percent: 3.2, as_of: "2026-09-30" };
  const t = { regime: "2025", rent: 1200, start_on: "2026-05-01", last_rent_change_on: null };
  // 12 months after the start is later than today + 2 months.
  let a = rentAssistant(t, rpi, "2026-10-24");
  assert.equal(a.applies, true);
  assert.equal(a.max_rent, 1238); // 1,238.40 rounded down to the pound
  assert.equal(a.earliest_on, "2027-05-01");
  assert.ok(a.notes.length);
  // A year after the last change, today + 2 months is later.
  a = rentAssistant({ ...t, start_on: "2024-01-31", last_rent_change_on: "2025-08-31" }, rpi, "2026-10-24");
  assert.equal(a.earliest_on, "2026-12-24");
  // Whole pounds without float drift: 1,000 × 1.15 is 1,150, not 1,149.
  assert.equal(rentAssistant({ ...t, rent: 1000 }, { percent: 15, as_of: "2026-09-30" }, "2026-10-24").max_rent, 1150);
  assert.equal(rentAssistant(t, null, "2026-10-24").max_rent, null);

  a = rentAssistant({ ...t, regime: "2011" }, rpi, "2026-10-24");
  assert.deepEqual([a.applies, a.max_rent, a.earliest_on], [false, null, null]);
  assert.deepEqual(a.notes, ["Rent changes follow the tenancy agreement (2011 law). Check with a lawyer"]);
});

test("earliestMoveOut: a month from the tenant, a year from the landlord, the end date in a fixed term", () => {
  const periodic = { kind: "periodic", end_on: null };
  assert.equal(earliestMoveOut(periodic, { given_on: "2026-01-31", by: "tenant" }), "2026-02-28");
  assert.equal(earliestMoveOut(periodic, { given_on: "2026-10-24", by: "landlord" }), "2027-10-24");
  const fixed = { kind: "fixed", end_on: "2027-04-30" };
  assert.equal(earliestMoveOut(fixed, { given_on: "2026-10-24", by: "tenant" }), "2027-04-30");
  // Past its end date a fixed tenancy runs on as periodic (R24).
  assert.equal(earliestMoveOut(fixed, { given_on: "2027-06-10", by: "tenant" }), "2027-07-10");
});

test("parseMoney and parseBankDate: pounds, commas, minus, junk and impossible dates", () => {
  assert.equal(parseMoney("£1,234.56"), 123456);
  assert.equal(parseMoney("1234.5"), 123450);
  assert.equal(parseMoney("-50"), -5000);
  assert.equal(parseMoney("-£50.00"), -5000);
  assert.equal(parseMoney(" 0.29 "), 29);
  assert.equal(parseMoney(1500), 150000);
  for (const junk of ["", "abc", "12.345", "1.2.3", "1,23", "=1+1", "£", "-", null, undefined, "1e5"])
    assert.equal(parseMoney(junk), null, String(junk));

  assert.equal(parseBankDate("24/10/2026", "DMY"), "2026-10-24");
  assert.equal(parseBankDate("4/1/2026", "DMY"), "2026-01-04");
  assert.equal(parseBankDate(" 2026-10-24 ", "ISO"), "2026-10-24");
  for (const [text, format] of [["31/02/2026", "DMY"], ["2026-02-30", "ISO"], ["24/10/2026", "ISO"],
    ["2026-10-24", "DMY"], ["13/13/2026", "DMY"], ["junk", "DMY"], ["", "ISO"], [null, "ISO"], ["24/10/2026", "MDY"]])
    assert.equal(parseBankDate(text, format), null, `${text} ${format}`);
});

test("validators: required fields, ranges, cross-field rules and partial edits", () => {
  assert.deepEqual(validateLandlord({ name: " Ann ", email: "ann@example.je", approval_limit: "500" }),
    { value: { name: "Ann", email: "ann@example.je", phone: null, approval_limit: 500, notes: null } });
  assert.deepEqual(Object.keys(validateLandlord({ email: "nope", approval_limit: 0 }).errors).sort(),
    ["approval_limit", "email", "name"]);
  assert.deepEqual(validateLandlord({ notes: "" }, { partial: true }), { value: { notes: null } });

  const rental = { landlord_id: 1, address: "1 Rue de Haut", parish: "St Helier", service: "full", fee_percent: 10.5 };
  assert.deepEqual(validateRental({ ...rental, has_gas: false }),
    { value: { ...rental, has_gas: 0, notes: null } });
  assert.equal(validateRental({ ...rental, service: "let_only", fee_percent: null }).value.has_gas, null);
  const bad = validateRental({ landlord_id: "x", address: "", parish: "Paris", service: "full", fee_percent: 10.555,
    has_gas: "yes" }).errors;
  assert.deepEqual(Object.keys(bad).sort(), ["address", "fee_percent", "has_gas", "landlord_id", "parish"]);
  assert.ok(validateRental({ ...rental, fee_percent: null }).errors.fee_percent);
  assert.ok(validateRental({ ...rental, fee_percent: 101 }).errors.fee_percent);
  assert.deepEqual(validateRental({ has_gas: true }, { partial: true }), { value: { has_gas: 1 } });

  const tenancy = { tenant_name: "Tom Vibert", kind: "fixed", regime: "2025", start_on: "2026-05-31",
    end_on: "2027-05-30", rent: 1500 };
  const t = validateTenancy(tenancy).value;
  assert.equal(t.due_day, 28); // R23: the start day, capped at 28
  assert.equal(t.collect_from, null);
  assert.equal(validateTenancy({ ...tenancy, start_on: "2026-05-04" }).value.due_day, 4);
  assert.ok(validateTenancy({ ...tenancy, end_on: null }).errors.end_on);
  assert.ok(validateTenancy({ ...tenancy, end_on: "2026-05-31" }).errors.end_on);
  assert.ok(validateTenancy({ ...tenancy, due_day: 29 }).errors.due_day);
  assert.ok(validateTenancy({ ...tenancy, rent: 1000001 }).errors.rent);
  assert.ok(validateTenancy({ ...tenancy, collect_from: "2026-05-30" }).errors.collect_from);
  assert.ok(validateTenancy({ ...tenancy, opening_balance: -1 }).errors.opening_balance);
  assert.equal(validateTenancy({ ...tenancy, opening_balance: 12345 }).value.opening_balance, 12345);
  assert.ok(validateTenancy({ ...tenancy, regime: "2020" }).errors.regime);
  assert.deepEqual(validateTenancy({ tenant_phone: "+44 7700 900123" }, { partial: true }),
    { value: { tenant_phone: "+44 7700 900123" } });

  const today = "2026-10-24";
  assert.deepEqual(validateRepair({ title: "Boiler", urgency: "emergency" }, { today }).value,
    { title: "Boiler", detail: null, urgency: "emergency", contractor: null, quote: null,
      cost: null, done_on: null, charge_landlord: 1 });
  assert.deepEqual(Object.keys(validateRepair({ title: "", urgency: "soon", done_on: "2026-10-25" }, { today }).errors)
    .sort(), ["done_on", "title", "urgency"]);
  assert.deepEqual(validateRepair({ status: "done", cost: 250, charge_landlord: false }, { partial: true, today }),
    { value: { status: "done", cost: 250, charge_landlord: 0 } });
  assert.ok(validateRepair({ status: "closed" }, { partial: true, today }).errors.status);

  assert.deepEqual(validatePayment({ tenancy_id: 3, received_on: "2026-10-24", amount: 150050 }, { today }),
    { value: { tenancy_id: 3, received_on: "2026-10-24", amount: 150050, kind: "rent", description: null } });
  const p = validatePayment({ received_on: "2026-10-25", amount: 1.5, kind: "fee", description: "x".repeat(301) },
    { today }).errors;
  assert.deepEqual(Object.keys(p).sort(), ["amount", "description", "kind", "received_on", "tenancy_id"]);
  for (const amount of [0, -1, 100000001]) assert.ok(validatePayment({ amount }, { partial: true }).errors.amount);
  assert.deepEqual(validatePayment({ kind: "deposit" }, { partial: true }), { value: { kind: "deposit" } });
});
