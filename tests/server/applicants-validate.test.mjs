import test from "node:test";
import assert from "node:assert/strict";
import { makeEnv, T0 } from "./helpers.mjs";
import { OPTIONS, normalizePhone, validateApplicant } from "../../server/applicants.js";
import { readJson, HttpError } from "../../server/http.js";

const NOW = "2026-10-23T09:00:00.000Z"; // Jersey day 2026-10-23
const pub = (o = {}) => ({ operation: "rent", bedrooms_min: 2, budget_max: 2000, name: "Jane Le Brocq",
  email: "Jane@Example.je ", phone: "07797 123456", privacy: true, ...o });
const panel = (o = {}) => ({ operation: "buy", name: "Tom Renouf", phone: "07797 654321", source: "phone", ...o });
const errorsOf = (body, publicForm = true) => validateApplicant(body, { publicForm }, NOW).errors ?? {};
const applicantOf = (body, publicForm = true) => {
  const r = validateApplicant(body, { publicForm }, NOW);
  assert.equal(r.errors, undefined, JSON.stringify(r.errors));
  return r.value.applicant;
};

test("search category defaults to residential and rejects unrecognised categories", () => {
  assert.equal(applicantOf(pub()).search_category, "residential");
  assert.ok(errorsOf(pub({ search_category: "industrial" })).search_category);
});

test("commercial registration keeps unknowns and independent monetary amounts", () => {
  const a = applicantOf(pub({ search_category: "commercial", commercial_kind: "both", bedrooms_min: null,
    budget_max: null, commercial_use: "Café", area_min: 80, area_max: 120, area_unit: "sqm",
    commercial_purchase: 400000, commercial_rent: 20000, commercial_rent_period: "year",
    commercial_premium: 50000, commercial_expenses: 1500 }));
  assert.equal(a.search_category, "commercial");
  assert.equal(a.commercial_purchase, 400000);
  assert.equal(a.commercial_rent, 20000);
  assert.equal(a.commercial_rent_period, "year");
  assert.equal(a.commercial_premium, 50000);
  assert.equal(a.commercial_expenses, 1500);
  assert.equal(a.household_children, null);
  assert.equal(a.household_total, null);
  const changed = applicantOf(pub({ search_category: "commercial", bedrooms_min: 2, budget_max: 2000, household_children: 1 }));
  assert.equal(changed.bedrooms_min, null);
  assert.equal(changed.budget_max, null);
  assert.equal(changed.household_children, null);
});

test("commercial ranges and monetary periods are validated", () => {
  const body = pub({ search_category: "commercial", commercial_kind: "business", bedrooms_min: null, budget_max: null });
  assert.ok(errorsOf({ ...body, area_min: 100, area_max: 50, area_unit: "sqm" }).area_max);
  assert.ok(errorsOf({ ...body, area_min: 100 }).area_unit);
  assert.ok(errorsOf({ ...body, commercial_rent: 2000 }).commercial_rent_period);
  assert.ok(errorsOf({ ...body, commercial_premium: -1 }).commercial_premium);
});

test("a business transfer is a distinct commercial operation and can include a separate rent", () => {
  const a = applicantOf(pub({ search_category: "commercial", commercial_kind: "business", operation: "transfer",
    bedrooms_min: null, budget_max: null, commercial_premium: 40000, commercial_rent: 12000, commercial_rent_period: "year" }));
  assert.equal(a.operation, "rent");
  assert.equal(a.search_operation, "transfer");
  assert.equal(a.commercial_premium, 40000);
  assert.equal(a.commercial_rent, 12000);
  assert.ok(errorsOf(pub({ operation: "transfer" })).operation);
});

test("household total is known only when both counts are explicitly known", () => {
  assert.equal(applicantOf(pub({ household_adults: 2, household_children: 0 })).household_total, 2);
  assert.equal(applicantOf(pub({ household_adults: 2 })).household_total, null);
});

test("no children, not applicable and unknown remain distinct", () => {
  const none = applicantOf(pub({ household_adults: 2, household_children: 0 }));
  const na = applicantOf(pub({ household_adults: 2, household_children_status: "not_applicable" }));
  const unknown = applicantOf(pub({ household_adults: 2, household_children_status: "unknown" }));
  assert.deepEqual([none.household_children_status, none.household_children, none.household_total], ["known", 0, 2]);
  assert.deepEqual([na.household_children_status, na.household_children, na.household_total], ["not_applicable", null, null]);
  assert.deepEqual([unknown.household_children_status, unknown.household_children, unknown.household_total], ["unknown", null, null]);
  assert.ok(errorsOf(pub({ household_children: 1, household_children_status: "unknown" })).household_children);
});

test("bedroom maximum is preserved and cannot be below the minimum", () => {
  assert.equal(applicantOf(pub({ bedrooms_min: 2, bedrooms_max: 3 })).bedrooms_max, 3);
  assert.ok(errorsOf(pub({ bedrooms_min: 3, bedrooms_max: 2 })).bedrooms_max);
});

test("normalizePhone", () => {
  for (const s of ["07797 123456", "+44 7797 123456", "0044 7797-123456", "+44 (0)7797 123456", "07797.123.456"])
    assert.equal(normalizePhone(s), "+447797123456", s);
  assert.equal(normalizePhone("(01534) 727582"), "+441534727582");
  for (const s of ["12", "abc", "+44 7797 12345a", "+0 7797 123456", "", null, undefined, 7797123456])
    assert.equal(normalizePhone(s), null, String(s));
});

test("public form: required fields and consent", () => {
  assert.deepEqual(Object.keys(errorsOf({})).sort(),
    ["bedrooms_min", "budget_max", "email", "name", "operation", "phone", "privacy"]);
  assert.ok(errorsOf(pub({ privacy: "yes" })).privacy, "privacy must be exactly true");
  assert.ok(errorsOf(null).operation);
});

test("public form: value carries the normalised contact, consent and source", () => {
  const { contact, applicant } = validateApplicant(pub({ source: "phone", marketing: true }), { publicForm: true }, NOW).value;
  assert.deepEqual(contact, { name: "Jane Le Brocq", email: "jane@example.je", phone: "+447797123456",
    preferred_channel: null, best_time: null, privacy_ack_at: NOW, marketing_opt_in_at: NOW, consent_source: "web" });
  assert.equal(applicant.source, "web");
  assert.equal(validateApplicant(pub(), { publicForm: true }, NOW).value.contact.marketing_opt_in_at, null);
});

test("budget sanity per operation", () => {
  assert.ok(errorsOf(pub({ operation: "buy", budget_max: 1500 })).budget_max);
  assert.ok(errorsOf(pub({ operation: "rent", budget_max: 750000 })).budget_max);
  assert.ok(errorsOf(pub({ budget_min: 3000, budget_max: 2000 })).budget_min);
  assert.ok(errorsOf(pub({ budget_max: 2000, budget_stretch: 1800 })).budget_stretch);
  assert.ok(errorsOf(pub({ budget_max: "lots" })).budget_max);
  assert.equal(applicantOf(pub({ operation: "buy", budget_max: "650000" })).budget_max, 650000);
});

test("numbers stay in range and unknown stays NULL", () => {
  for (const [k, v] of [["bedrooms_min", 21], ["bedrooms_ideal", -1], ["bathrooms_min", 1.5], ["parking_spaces", 4],
    ["household_adults", 21], ["household_children", -1], ["lease_term_months", 0], ["lease_term_months", 121]])
    assert.ok(errorsOf(pub({ [k]: v }))[k], `${k}=${v}`);
  const a = applicantOf(pub({ parking_spaces: 0, bathrooms_min: "" }));
  assert.equal(a.parking_spaces, 0);
  assert.equal(a.bathrooms_min, null);
  assert.equal(a.budget_min, null);
});

test("move-in date is a real day between today and two years ahead, in Jersey time", () => {
  assert.equal(applicantOf(pub({ move_in_date: "2026-10-23" })).move_in_date, "2026-10-23");
  assert.equal(applicantOf(pub({ move_in_date: "2028-10-23" })).move_in_date, "2028-10-23");
  for (const d of ["2026-10-22", "2028-10-24", "2027-02-30", "next week"])
    assert.ok(errorsOf(pub({ move_in_date: d })).move_in_date, d);
  // 23:30 UTC on 22 Oct is already 23 Oct in Jersey (BST).
  const late = validateApplicant(pub({ move_in_date: "2026-10-23" }), { publicForm: true }, "2026-10-22T23:30:00.000Z");
  assert.equal(late.errors, undefined);
});

test("closed lists and parishes", () => {
  assert.ok(errorsOf(pub({ parishes_wanted: ["Paris"] })).parishes_wanted);
  assert.ok(errorsOf(pub({ parishes_wanted: "St Helier" })).parishes_wanted);
  assert.ok(errorsOf(pub({ property_types: ["flat", "flat"] })).property_types);
  assert.ok(errorsOf(pub({ outdoor: ["pool"] })).outdoor);
  assert.ok(errorsOf(pub({ housing_status: "resident" })).housing_status);
  assert.ok(errorsOf(pub({ preferred_channel: "fax" })).preferred_channel);
  assert.ok(errorsOf(pub({ parishes_wanted: ["St Helier", "Trinity"], parishes_excluded: ["Trinity"] })).parishes_excluded);
  const a = applicantOf(pub({ parishes_wanted: ["St Helier", "St Saviour"], parishes_excluded: ["St Ouen"],
    property_types: ["flat"], outdoor: [], housing_status: "licensed" }));
  assert.equal(a.parishes_wanted, '["St Helier","St Saviour"]');
  assert.equal(a.parishes_excluded, '["St Ouen"]');
  assert.equal(a.property_types, '["flat"]');
  assert.equal(a.outdoor, null);
  assert.equal(a.housing_status, "licensed");
  assert.equal(OPTIONS.parishes.length, 12);
});

test("pets: known kinds with a count, 'none' on its own", () => {
  assert.equal(applicantOf(pub({ pets: [{ kind: "dog", count: 2 }, { kind: "cat", count: 1 }] })).pets,
    '[{"kind":"dog","count":2},{"kind":"cat","count":1}]');
  assert.equal(applicantOf(pub({ pets: [{ kind: "none" }] })).pets, '[{"kind":"none"}]');
  for (const pets of [[{ kind: "horse", count: 1 }], [{ kind: "dog", count: 0 }], [{ kind: "dog", count: 1 }, { kind: "dog", count: 2 }],
    [{ kind: "none" }, { kind: "cat", count: 1 }], { kind: "dog", count: 1 }])
    assert.ok(errorsOf(pub({ pets })).pets, JSON.stringify(pets));
});

test("texts are trimmed and capped", () => {
  const { contact, applicant } = validateApplicant(pub({ name: "  Jane  ", near: " Victoria College ", requirements: "  " }),
    { publicForm: true }, NOW).value;
  assert.equal(contact.name, "Jane");
  assert.equal(applicant.near, "Victoria College");
  assert.equal(applicant.requirements, null);
  assert.ok(errorsOf(pub({ name: "x".repeat(121) })).name);
  assert.ok(errorsOf(pub({ near: "x".repeat(201) })).near);
  assert.ok(errorsOf(pub({ best_time: "x".repeat(201) })).best_time);
  assert.ok(errorsOf(pub({ requirements: "x".repeat(2001) })).requirements);
  assert.equal(applicantOf(pub({ requirements: "x".repeat(2000) })).requirements.length, 2000);
  assert.ok(errorsOf(pub({ email: "jane@example" })).email);
  assert.ok(errorsOf(pub({ phone: "12" })).phone);
});

test("panel form needs only name, one contact route, operation and source", () => {
  const ok = validateApplicant(panel(), { publicForm: false }, NOW);
  assert.equal(ok.errors, undefined);
  assert.equal(ok.value.contact.email, null);
  assert.equal(ok.value.contact.privacy_ack_at, null);
  assert.equal(ok.value.contact.marketing_opt_in_at, null);
  assert.equal(ok.value.contact.consent_source, null, "no consent, no consent source");
  assert.equal(ok.value.applicant.source, "phone");
  assert.equal(ok.value.applicant.bedrooms_min, null);
  assert.equal(validateApplicant(panel({ phone: "", email: "tom@example.je", source: "walk_in", privacy: true }),
    { publicForm: false }, NOW).value.contact.consent_source, "walk_in");
  assert.equal(validateApplicant(panel({ marketing: true }), { publicForm: false }, NOW).value.contact.consent_source, "phone");
  assert.deepEqual(Object.keys(errorsOf({}, false)).sort(), ["email", "name", "operation", "phone", "source"]);
  assert.ok(errorsOf(panel({ source: "web" }), false).source, "the panel cannot claim a web registration");
  const consent = validateApplicant(panel({ privacy: true, marketing: true }), { publicForm: false }, NOW).value.contact;
  assert.equal(consent.privacy_ack_at, NOW);
  assert.equal(consent.marketing_opt_in_at, NOW);
});

test("rent-only and buy-only fields are dropped for the other operation", () => {
  const extra = { furnished: "bogus", lease_term_months: 999, buyer_position: "bogus", mortgage_aip: "bogus" };
  const rent = applicantOf(pub({ ...extra, furnished: "yes", lease_term_months: 12 }));
  assert.equal(rent.furnished, "yes");
  assert.equal(rent.lease_term_months, 12);
  assert.equal(rent.buyer_position, null);
  assert.equal(rent.mortgage_aip, null);
  const buy = applicantOf(pub({ ...extra, operation: "buy", budget_max: 650000, buyer_position: "cash", mortgage_aip: "in_progress" }));
  assert.equal(buy.furnished, null);
  assert.equal(buy.lease_term_months, null);
  assert.equal(buy.buyer_position, "cash");
  assert.equal(buy.mortgage_aip, "in_progress");
});

test("the value fits the contacts and applicants tables as they are", () => {
  const env = makeEnv();
  const insert = (table, row) => {
    const cols = Object.keys(row);
    return env.DB.raw.prepare(`INSERT INTO ${table} (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`)
      .run(...cols.map(c => row[c]));
  };
  const { contact, applicant } = validateApplicant(pub({ operation: "buy", budget_min: 400000, budget_max: 650000,
    budget_stretch: 700000, property_types: ["house", "cottage"], bedrooms_ideal: 3, bathrooms_min: 2, parking_spaces: 3,
    outdoor: ["garden"], pets: [{ kind: "dog", count: 1 }], parishes_wanted: ["Trinity"], near: "Work in St Helier",
    move_in_date: "2027-03-01", buyer_position: "first_time", mortgage_aip: "yes", housing_status: "entitled",
    household_adults: 2, household_children: 1, requirements: "Quiet road", preferred_channel: "whatsapp",
    best_time: "Evenings", marketing: true }), { publicForm: true }, NOW).value;
  const contactCols = env.DB.raw.prepare("SELECT name FROM pragma_table_info('contacts')").all().map(r => r.name);
  const applicantCols = env.DB.raw.prepare("SELECT name FROM pragma_table_info('applicants')").all().map(r => r.name);
  const routeSet = ["id", "last_activity_at", "last_contact_at", "created_at", "updated_at", "updated_by"];
  assert.deepEqual(Object.keys(contact).sort(), contactCols.filter(c => !routeSet.includes(c)).sort());
  // stage (DEFAULT 'new'), lost_reason, assigned_to and first_reviewed_at belong to the workflow, not to the registration.
  assert.deepEqual(Object.keys(applicant).sort(), applicantCols.filter(c =>
    ![...routeSet, "contact_id", "matches_revision", "match_inputs_revision", "match_ranking_version", "archived_at", "stage", "lost_reason", "assigned_to", "first_reviewed_at", "search_state", "resolved_at", "resolved_by", "resolution_reason"].includes(c)).sort());
  const { lastInsertRowid } = insert("contacts", { ...contact, last_activity_at: T0, created_at: T0, updated_at: T0 });
  insert("applicants", { ...applicant, contact_id: Number(lastInsertRowid), created_at: T0, updated_at: T0 });
  assert.equal(env.DB.raw.prepare("SELECT stage FROM applicants").get().stage, "new");
});

test("readJson refuses bodies over the limit and keeps the 400 for bad JSON", async () => {
  const req = body => new Request("https://hampton.test/api/x", { method: "POST", body });
  assert.deepEqual(await readJson(req(JSON.stringify({ a: 1 }))), { a: 1 });
  const big = JSON.stringify({ a: "x".repeat(32768) });
  await assert.rejects(readJson(req(big)), e => e instanceof HttpError && e.status === 413 && e.message === "Request too large");
  await assert.rejects(readJson(req(JSON.stringify({ a: "é".repeat(16381) }))), e => e.status === 413, "counts bytes, not characters");
  assert.equal((await readJson(req(big), 65536)).a.length, 32768);
  await assert.rejects(readJson(req("{")), e => e.status === 400 && e.message === "Invalid JSON body");
  await assert.rejects(readJson(req("")), e => e.status === 400);
});

test("readJson stops at the limit whatever Content-Length says", async () => {
  const LIMIT = "Request too large";
  const stream = (n, onCancel) => {
    let sent = 0;
    return new ReadableStream({
      pull(c) { if (sent >= n) return c.close(); sent += 1024; c.enqueue(new TextEncoder().encode("x".repeat(1024))); },
      cancel: onCancel,
    });
  };
  // A lying-small Content-Length: the stream is cut off and cancelled, not read to the end.
  let cancelled = false;
  const lying = { headers: new Headers({ "content-length": "10" }), body: stream(10 * 1024 * 1024, () => { cancelled = true; }) };
  await assert.rejects(readJson(lying), e => e.status === 413 && e.message === LIMIT);
  assert.ok(cancelled, "the reader is cancelled");
  // No Content-Length at all (streamed upload).
  const absent = new Request("https://hampton.test/api/x", { method: "POST", body: stream(64 * 1024), duplex: "half" });
  assert.equal(absent.headers.get("content-length"), null);
  await assert.rejects(readJson(absent), e => e.status === 413);
  // A Content-Length above the limit is refused before the body is touched.
  const announced = { headers: new Headers({ "content-length": "40000" }), get body() { throw new Error("body was read"); } };
  await assert.rejects(readJson(announced), e => e.status === 413 && e.message === LIMIT);
  // A normal body still parses, multi-byte text included.
  const ok = new Request("https://hampton.test/api/x", { method: "POST", body: JSON.stringify({ rent: "£1,500" }) });
  assert.deepEqual(await readJson(ok), { rent: "£1,500" });
});

test("weekly viewing preferences are validated and stored as local Jersey wall times", () => {
  const slots = [{ day: 1, start: "09:00", end: "12:00" }, { day: 1, start: "13:00", end: "17:00" },
    { day: 0, start: "01:00", end: "02:30" }];
  assert.deepEqual(JSON.parse(applicantOf(pub({ viewing_availability: slots })).viewing_availability), slots);
  assert.equal(applicantOf(pub()).viewing_availability, null);
  for (const invalid of [[{ day: 7, start: "09:00", end: "10:00" }], [{ day: 1, start: "24:00", end: "25:00" }],
    [{ day: 1, start: "10:00", end: "09:00" }], "bad"]) {
    assert.ok(errorsOf(pub({ viewing_availability: invalid })).viewing_availability);
  }
});

// Four adjacent one-hour intervals per day; 22 spans six days, all within the same week.
const weeklyIntervals = count => Array.from({ length: count }, (_, i) => {
  const hour = 10 + i % 4;
  return { day: Math.floor(i / 4), start: `${hour}:00`, end: `${hour + 1}:00` };
});

test("weekly viewing preferences accept 21 valid non-overlapping intervals", () => {
  const allowed = weeklyIntervals(21);
  assert.deepEqual(JSON.parse(applicantOf(pub({ viewing_availability: allowed })).viewing_availability), allowed);
});

test("weekly viewing preferences reject 22 valid non-overlapping intervals by count", () => {
  assert.equal(errorsOf(pub({ viewing_availability: weeklyIntervals(22) })).viewing_availability,
    "Choose valid, non-overlapping times with an end after the start (up to 21).");
});

test("weekly viewing preferences reject overlapping intervals independently of the count limit", () => {
  const overlap = [{ day: 1, start: "09:00", end: "12:00" }, { day: 1, start: "11:00", end: "13:00" }];
  assert.ok(errorsOf(pub({ viewing_availability: overlap })).viewing_availability);
});
