// AGE-03 (M06): one shared availability enquiry per property and operation, started only from an approved match, with
// nothing about any client in it and nothing sent by the app. Synthetic data only.
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { makeEnv, seedListing, call, adminCookie, T0 } from "./listing-client.mjs";
import { recomputeForApplicant } from "../../server/match-store.js";
import { candidateState } from "../../server/candidate-state.js";
import { extractFeatures } from "../../server/listing-features.js";

const ADMIN = "admin@example.test", OTHER = "colleague@example.test";
// MET answers every must-have; ASK says nothing about parking; SHOP is a commercial unit to let.
const MET = "HE-R001", ASK = "HE-R002", SHOP = "HE-C001";
const run = (env, sql, ...args) => env.DB.raw.prepare(sql).run(...args);
const row = (env, sql, ...args) => ({ ...env.DB.raw.prepare(sql).get(...args) });
const rows = (env, sql, ...args) => env.DB.raw.prepare(sql).all(...args).map(r => ({ ...r }));
const req = async (env, method, path, body, email = ADMIN) => call(env, method, path, { body, cookie: await adminCookie(email) });
const ok = (r, status = 200) => { assert.equal(r.status, status, JSON.stringify(r.data)); return r.data; };

function world({ ready = true, schema, availability = false } = {}) {
  const env = makeEnv(schema);
  if (ready) env.AGE03_ENQUIRIES_READY = "1";
  if (availability) env.EST16_AVAILABILITY_READY = "1";
  for (const [id, description] of [[MET, "Parking for two cars"], [ASK, ""]])
    seedListing(env, { id, title: `Fixture home ${id}`, operation: "rent", availability: "to_let", rent: 1800, rent_period: "month", sale_price: null,
      bedrooms: 2, bathrooms: 2, housing_category: "registered", matchable: 1, ...extractFeatures({ description }), parish: "St Helier",
      location: "St Helier", road_name: "Rue de la Fixture" });
  seedListing(env, { id: SHOP, title: "Fixture shop", use: "commercial", operation: "rent", availability: "to_let", matchable: 1, rent: 24000,
    rent_period: "year", sale_price: null, interior_area_sqft: 1200, property_type: "Office", parish: "St Helier", location: "St Helier" });
  return env;
}
let people = 0;
// A tenant with three must-haves (up to £2,000 a month, two bedrooms, two parking spaces) and a household of its own.
async function searching(env, name, { adults = 2, children = 1, ...over } = {}) {
  const n = ++people;
  const c = run(env, "INSERT INTO contacts (name, email, phone, last_activity_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
    name, `age03-${n}@example.test`, `+4477009001${String(n).padStart(2, "0")}`, T0, T0, T0);
  const a = { contact_id: Number(c.lastInsertRowid), operation: "rent", stage: "searching", source: "phone", budget_max: 2000, bedrooms_min: 2,
    parking_spaces: 2, pets: '[{"kind":"none"}]', household_adults: adults, household_children: children, household_total: adults + children,
    created_at: T0, updated_at: T0,
    requirement_priorities: JSON.stringify({ version: 1, values: { budget: "must", bedrooms: "must", parking: "must" }, unknown: [] }), ...over };
  const cols = Object.keys(a);
  const id = Number(run(env, `INSERT INTO applicants (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`, ...Object.values(a)).lastInsertRowid);
  await recomputeForApplicant(env, id, "system");
  return id;
}
const OFFICE = { operation: "rent", search_category: "commercial", commercial_rent: 2000, commercial_rent_period: "month", area_min: 100,
  area_max: 120, area_unit: "sqm", budget_max: null, bedrooms_min: null, parking_spaces: null, pets: null, household_adults: null,
  household_children: null, household_total: null, requirement_priorities: null };
const matchId = (env, a, listing) => row(env, "SELECT id FROM matches WHERE applicant_id = ? AND listing_id = ?", a, listing).id;
const shortlist = async (env, a, listing = MET, email) =>
  ok(await req(env, "PUT", `/admin/matches/${matchId(env, a, listing)}`, { status: "shortlisted", from: "found" }, email)).match.id;
async function advertiser(env, listing_ids = [MET, ASK, SHOP], name = "Fixture Agency") {
  return ok(await req(env, "POST", "/admin/advertisers", { name, kind: "agency", channels: [], source_ids: [], listing_ids, commission: "",
    photo_permission: "", contacts: [{ name: "Agency Desk", email: "desk@agency.example.test", phones: [{ label: "Office", number: "01534 000000" }] }] }), 201).advertiser.id;
}
const prepare = (env, match, body, email) => req(env, "POST", `/admin/matches/${match}/consultation`,
  { operation_id: randomUUID(), kind: "general", ...body }, email);
const sent = (o = {}) => ({ operation_id: randomUUID(), revision: 1, sent_at: "2026-11-10T09:30:00.000Z", via: "phone",
  evidence_ref: "Call note FIXTURE-EVIDENCE", ...o });
const markSent = (env, id, o, email) => req(env, "POST", `/admin/consultations/${id}/manual-send`, sent(o), email);
// The card of a search for a listing, as its Matches tab gets it.
async function card(env, a, listing = MET) {
  for (const status of ["found", "shortlisted", "rejected"]) {
    const found = ok(await req(env, "GET", `/admin/applicants/${a}/matches?status=${status}`)).matches.find(m => m.listing.id === listing);
    if (found) return found;
  }
}
const stored = env => JSON.stringify([rows(env, "SELECT * FROM events"), rows(env, "SELECT * FROM notifications"), rows(env, "SELECT * FROM matches")]);
// Everything the app keeps or shows about enquiries: their rows, their events and their Inbox tasks.
// Without the random request ids, whose hex digits prove nothing about a client.
const plain = text => text.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, "");
const written = env => plain(JSON.stringify([rows(env, "SELECT * FROM consultations"), rows(env, "SELECT * FROM consultation_matches"),
  rows(env, "SELECT * FROM events WHERE type LIKE 'consultation.%'"), rows(env, "SELECT * FROM notifications WHERE task_key LIKE 'consultation:%'")]));

test("the enquiry of a candidate is prepared or sent only by a shared enquiry in force for it", () => {
  const state = extra => candidateState({ status: "shortlisted", requirements_status: "meets", decision_current: 1, ...extra }).enquiry;
  assert.equal(state(), "not_sent");
  assert.equal(state({ consultation: { status: "manual_pending" } }), "prepared");
  assert.equal(state({ consultation: { status: "sent" } }), "sent_manually");
  assert.equal(state({ clarification: { by: ADMIN } }), "clarification_approved");
  assert.equal(state({ clarification: { by: ADMIN }, consultation: { status: "manual_pending" } }), "prepared");
});

test("switched off, or on before migration 0077, cards and routes are as before", async () => {
  for (const [ready, schema] of [[false, {}], [true, { through: 76 }]]) {
    const env = world({ ready, schema });
    const agency = await advertiser(env), ana = await searching(env, "Ana Le Gros"), m = await shortlist(env, ana);
    const before = stored(env), c = await card(env, ana);
    assert.equal(c.states.enquiry, "not_sent");
    assert.equal("enquiry" in c, false);
    assert.deepEqual(ok(await req(env, "GET", `/admin/matches/${m}/consultation`)), { enabled: false });
    assert.deepEqual(ok(await req(env, "GET", `/admin/listings/${MET}/consultations`)), { enabled: false });
    assert.equal((await prepare(env, m, { advertiser_id: agency })).status, 404);
    assert.equal((await markSent(env, 1)).status, 404);
    assert.equal((await req(env, "PUT", "/admin/consultations/1", { revision: 1, advertiser_id: agency, occupants_match_id: null })).status, 404);
    assert.equal(stored(env), before, "nothing is written");
  }
});

test("five approved matches share one general enquiry; a match that is not approved cannot start or join it", async () => {
  const env = world(), agency = await advertiser(env);
  const families = [];
  for (const name of ["Ana Le Gros", "Ben Carter", "Cora Dupre", "Dan Evans", "Eve Fallon"]) families.push(await searching(env, name));
  const approved = [];
  for (const a of families) approved.push(await shortlist(env, a));
  const waiting = await searching(env, "Fay Garnier"), found = matchId(env, waiting, MET);

  // Before anything is prepared, the card offers it and says nothing was sent.
  const offer = ok(await req(env, "GET", `/admin/matches/${approved[0]}/consultation`));
  assert.equal(offer.enabled, true);
  assert.equal(offer.can, "general");
  assert.equal(offer.consultation, null);
  assert.deepEqual(offer.advertisers.map(a => [a.id, a.name]), [[agency, "Fixture Agency"]]);
  assert.equal((await card(env, families[0])).enquiry, null);

  const first = await prepare(env, approved[0], { advertiser_id: agency });
  assert.equal(first.status, 201, JSON.stringify(first.data));
  assert.equal(first.data.created, true);
  const id = first.data.consultation.id;
  for (const m of approved.slice(1)) {
    const joined = ok(await prepare(env, m, { advertiser_id: agency }, OTHER));
    assert.equal(joined.created, false);
    assert.equal(joined.consultation.id, id, "the same enquiry");
    assert.equal(joined.consultation.joined, true);
    assert.equal(joined.match.states.enquiry, "prepared");
  }
  const refused = await prepare(env, found, { advertiser_id: agency });
  assert.equal(refused.status, 409, JSON.stringify(refused.data));
  assert.match(refused.data.error, /approved/i);
  assert.equal(ok(await req(env, "GET", `/admin/matches/${found}/consultation`)).can, null);

  assert.deepEqual(rows(env, "SELECT id, kind, listing_id, operation, status, revision, advertiser_id, prepared_by, sent_at FROM consultations"),
    [{ id, kind: "general", listing_id: MET, operation: "rent", status: "manual_pending", revision: 1, advertiser_id: agency, prepared_by: ADMIN, sent_at: null }]);
  assert.deepEqual(rows(env, "SELECT match_id, linked_by FROM consultation_matches ORDER BY match_id"),
    approved.map((match_id, i) => ({ match_id, linked_by: i ? OTHER : ADMIN })));
  const detail = ok(await req(env, "GET", `/admin/matches/${approved[4]}/consultation`)).consultation;
  assert.equal(detail.matches, 5);
  assert.equal(detail.status, "manual_pending");
  assert.equal(detail.blocked, null);
  assert.deepEqual([detail.recipient.id, detail.recipient.name, detail.recipient.contacts[0].email], [agency, "Fixture Agency", "desk@agency.example.test"]);
  for (const a of families) assert.equal((await card(env, a)).states.enquiry, "prepared");
  assert.equal((await card(env, waiting)).states.enquiry, "not_sent");

  // One Inbox task for the team, on the property, still open: nothing has been sent.
  const tasks = rows(env, "SELECT title, category, action_required, resolved_at, target_kind, target_id, task_reason FROM notifications WHERE task_key LIKE 'consultation:%'");
  assert.equal(tasks.length, 1);
  assert.deepEqual([tasks[0].category, tasks[0].action_required, tasks[0].resolved_at, tasks[0].target_kind, tasks[0].target_id],
    ["task", 1, null, "listing", MET]);
  assert.equal(rows(env, "SELECT 1 FROM events WHERE type LIKE 'consultation.%'").length, 1);
  assert.equal(rows(env, "SELECT 1 FROM outbound").length, 0, "no email is written");
  // The property's own history still reads, and shows the event without any detail of it.
  const history = ok(await req(env, "GET", `/admin/listings/${MET}/history`)).items;
  assert.deepEqual(history.filter(i => i.details_unavailable).map(i => [i.type, i.changes]), [["listing.unknown", []]]);

  // Another property is another enquiry; the first one is not reused for it.
  const second = ok(await prepare(env, await shortlist(env, families[0], ASK), { advertiser_id: agency }), 201);
  assert.notEqual(second.consultation.id, id);
  assert.equal(second.consultation.matches, 1);
  assert.deepEqual(rows(env, "SELECT scope_key FROM consultations ORDER BY id").map(r => r.scope_key), [`general:${MET}:rent`, `general:${ASK}:rent`]);
});

test("the enquiry names the property and asks about availability and viewing times, with nothing about any client", async () => {
  const env = world(), agency = await advertiser(env);
  const ana = await searching(env, "Ana Le Gros", { adults: 2, children: 1 }), ben = await searching(env, "Ben Carter", { adults: 2, children: 2 });
  const [ma, mb] = [await shortlist(env, ana), await shortlist(env, ben)];
  const made = ok(await prepare(env, ma, { advertiser_id: agency }), 201).consultation;
  ok(await prepare(env, mb, { advertiser_id: agency, include_occupants: true }));
  const text = row(env, "SELECT body FROM consultations").body;
  assert.equal(made.text, text);
  for (const said of [MET, `Fixture home ${MET}`, "St Helier", "available", "viewing"]) assert.ok(text.includes(said), `says ${said}`);
  assert.equal(made.asks_availability, true);
  assert.equal(made.occupants, null);
  assert.ok(!/household|people|person|adult|child/i.test(text), "no household unless one case is chosen");
  assert.ok(!text.includes("Rue de la Fixture"), "not the private street address");
  // Nothing kept or shown about the enquiry carries a client's name, email, phone or budget; joining changes no text.
  const all = written(env) + JSON.stringify(made) + JSON.stringify(ok(await req(env, "GET", `/admin/listings/${MET}/consultations`)));
  for (const secret of ["Ana", "Le Gros", "Ben", "Carter", "age03-", "7700900", "2000", "2,000", "1800", "1,800"])
    assert.ok(!all.includes(secret), `no ${secret}`);

  // One chosen case may state its own household size: never a sum, never another family's.
  const withAna = ok(await req(env, "PUT", `/admin/consultations/${made.id}`, { revision: 1, advertiser_id: agency, occupants_match_id: ma })).consultation;
  assert.equal(withAna.revision, 2);
  assert.equal(withAna.occupants, 3);
  assert.match(withAna.text, /household of 3 people/);
  assert.ok(!/\b(4|7)\b/.test(withAna.text), "neither Ben's household nor both together");
  const again = written(env);
  for (const secret of ["Ana", "Le Gros", "Carter", "age03-", "7700900", "2000"]) assert.ok(!again.includes(secret), `no ${secret}`);
  assert.equal(ok(await req(env, "GET", `/admin/matches/${ma}/consultation`)).consultation.occupants_from_this_match, true);
  assert.equal(ok(await req(env, "GET", `/admin/matches/${mb}/consultation`)).consultation.occupants_from_this_match, false);
  // Saved again without naming a case, the one stated stays.
  const kept = ok(await req(env, "PUT", `/admin/consultations/${made.id}`, { revision: 2, advertiser_id: agency })).consultation;
  assert.deepEqual([kept.revision, kept.occupants, kept.text], [3, 3, withAna.text]);
  // A match of another enquiry, or one that is not approved, is not a case to choose.
  const cy = await searching(env, "Cy Hamon");
  assert.equal((await req(env, "PUT", `/admin/consultations/${made.id}`, { revision: 3, advertiser_id: agency, occupants_match_id: matchId(env, cy, MET) })).status, 409);
  assert.equal((await req(env, "PUT", `/admin/consultations/${made.id}`, { revision: 1, advertiser_id: agency, occupants_match_id: null })).status, 409,
    "a stale revision changes nothing");
});

test("a commercial enquiry invents no residents", async () => {
  const env = world(), agency = await advertiser(env);
  const firm = await searching(env, "Fixture Trading Ltd", OFFICE), m = await shortlist(env, firm, SHOP);
  assert.equal(ok(await req(env, "GET", `/admin/matches/${m}/consultation`)).occupants, null);
  const refused = await prepare(env, m, { advertiser_id: agency, include_occupants: true });
  assert.equal(refused.status, 400, JSON.stringify(refused.data));
  const made = ok(await prepare(env, m, { advertiser_id: agency }), 201).consultation;
  assert.equal(made.occupants, null);
  assert.ok(!/household|people|person|resident|occupant/i.test(made.text));
  assert.ok(made.text.includes(SHOP) && made.text.includes("Fixture shop"));
});

test("a clarification enquiry is its own kind, for one match, asks only about the unknown must-have and approves nothing", async () => {
  const env = world(), agency = await advertiser(env);
  const ana = await searching(env, "Ana Le Gros"), ben = await searching(env, "Ben Carter");
  const [ma, mb] = [matchId(env, ana, ASK), matchId(env, ben, ASK)];
  // Not approved for a clarification yet; and a clarification approval is never read as the match's approval.
  assert.equal((await prepare(env, ma, { kind: "clarification", advertiser_id: agency })).status, 409);
  for (const m of [ma, mb]) ok(await req(env, "PUT", `/admin/matches/${m}/clarification`, { approved: true }));
  assert.equal(ok(await req(env, "GET", `/admin/matches/${ma}/consultation`)).can, "clarification");
  assert.equal((await prepare(env, ma, { kind: "general", advertiser_id: agency })).status, 409);
  assert.equal((await prepare(env, ma, { kind: "clarification", advertiser_id: agency, include_occupants: true })).status, 400);

  const one = ok(await prepare(env, ma, { kind: "clarification", advertiser_id: agency }), 201);
  const two = ok(await prepare(env, mb, { kind: "clarification", advertiser_id: agency }), 201);
  assert.notEqual(one.consultation.id, two.consultation.id, "one per match: never shared");
  assert.equal(one.consultation.kind, "clarification");
  assert.equal(one.consultation.matches, 1);
  assert.match(one.consultation.text, /Parking/);
  assert.ok(!/still available|viewing/i.test(one.consultation.text), "only the unknown must-have is asked");
  assert.ok(!/household|people|Ana|Le Gros|2000|2,000/i.test(one.consultation.text));
  assert.deepEqual([one.match.status, one.match.states.decision, one.match.states.enquiry], ["found", "undecided", "prepared"]);
  assert.equal(row(env, "SELECT COUNT(*) AS n FROM events WHERE type = 'match.reviewed'").n, 0, "nothing is shortlisted");
  // Withdrawing the clarification takes the match out of its enquiry, which can then not be sent.
  ok(await req(env, "PUT", `/admin/matches/${ma}/clarification`, { approved: false }));
  assert.equal((await card(env, ana, ASK)).states.enquiry, "not_sent");
  assert.equal((await markSent(env, one.consultation.id)).status, 409);
  assert.equal(ok(await markSent(env, two.consultation.id)).consultation.status, "sent");
});

test("a general availability already confirmed is reused; a confirmed unavailability stops the enquiry", async () => {
  const env = world({ availability: true }), agency = await advertiser(env);
  const confirm = (listing, status, confirmed_at = "2026-11-01T09:30:00.000Z") => req(env, "POST", `/admin/listings/${listing}/availability`,
    { status, confirmed_at, source: "agency", channel: "phone", evidence_ref: `Call note FIXTURE-EVIDENCE ${status}`, scope: "property" });
  const ana = await searching(env, "Ana Le Gros"), m = await shortlist(env, ana);
  const ben = await searching(env, "Ben Carter"), mb = await shortlist(env, ben);
  ok(await confirm(MET, "available"), 201);
  const offer = ok(await req(env, "GET", `/admin/matches/${m}/consultation`));
  assert.equal(offer.availability.status, "available");
  const made = ok(await prepare(env, m, { advertiser_id: agency }), 201).consultation;
  assert.equal(made.asks_availability, false);
  assert.ok(!/still available\?|confirm (that|whether) it is still available/i.test(made.text), "availability is not asked again");
  assert.match(made.text, /viewing/);
  assert.equal(row(env, "SELECT COUNT(*) AS n FROM availability_confirmations").n, 1, "an enquiry writes no confirmation");

  // The property is then confirmed as not available: the pending enquiry cannot go out, and none can be prepared.
  ok(await confirm(MET, "unavailable", "2026-11-05T09:30:00.000Z"), 201);
  const blocked = await markSent(env, made.id);
  assert.equal(blocked.status, 409, JSON.stringify(blocked.data));
  assert.match(blocked.data.error, /not available/i);
  assert.match(ok(await req(env, "GET", `/admin/listings/${MET}/consultations`)).consultations[0].blocked, /not available/i);
  assert.equal((await prepare(env, mb, { advertiser_id: agency })).status, 409, "nor can another match join it");
  assert.deepEqual(row(env, "SELECT status, sent_at FROM consultations WHERE id = ?", made.id), { status: "manual_pending", sent_at: null });
  assert.equal(row(env, "SELECT COUNT(*) AS n FROM consultation_matches").n, 1);
});

test("nothing is sent by the app: a person records having sent it, once, and the Inbox task closes", async () => {
  const env = world(), agency = await advertiser(env);
  const ana = await searching(env, "Ana Le Gros"), ben = await searching(env, "Ben Carter");
  const [ma, mb] = [await shortlist(env, ana), await shortlist(env, ben)];
  const id = ok(await prepare(env, ma, { advertiser_id: agency }), 201).consultation.id;
  ok(await prepare(env, mb, { advertiser_id: agency }));
  assert.deepEqual(row(env, "SELECT status, sent_at, sent_by, sent_via FROM consultations"), { status: "manual_pending", sent_at: null, sent_by: null, sent_via: null });

  for (const [bad, field] of [[{ via: "telepathy" }, "via"], [{ sent_at: "2999-01-01T00:00:00.000Z" }, "sent_at"], [{ evidence_ref: " " }, "evidence_ref"]]) {
    const r = await markSent(env, id, bad);
    assert.equal(r.status, 400, JSON.stringify(r.data));
    assert.ok(r.data.fields[field], field);
  }
  assert.equal((await markSent(env, id, { operation_id: "nope" })).status, 400);
  assert.equal((await markSent(env, id, { revision: 7 })).status, 409, "the version reviewed must be the current one");
  assert.equal((await call(env, "POST", `/admin/consultations/${id}/manual-send`, { body: sent() })).status, 401);

  const mine = sent({ via: "email" });
  const done = ok(await req(env, "POST", `/admin/consultations/${id}/manual-send`, mine, OTHER)).consultation;
  assert.deepEqual([done.status, done.sent_at, done.sent_via, done.sent_by, done.sent_evidence_ref],
    ["sent", "2026-11-10T09:30:00.000Z", "email", OTHER, "Call note FIXTURE-EVIDENCE"]);
  // The same request again (a retried click) is the same action; a second person's is refused.
  assert.equal(ok(await req(env, "POST", `/admin/consultations/${id}/manual-send`, mine, OTHER)).consultation.status, "sent");
  const twice = await markSent(env, id);
  assert.equal(twice.status, 409, JSON.stringify(twice.data));
  assert.equal(rows(env, "SELECT 1 FROM events WHERE type = 'consultation.sent_manually'").length, 1);
  assert.equal(rows(env, "SELECT 1 FROM outbound").length, 0);
  const task = row(env, "SELECT resolved_at, resolved_by, closed_by_source FROM notifications WHERE task_key LIKE 'consultation:%'");
  assert.ok(task.resolved_at);
  assert.deepEqual([task.resolved_by, task.closed_by_source], [OTHER, 1]);
  for (const a of [ana, ben]) assert.equal((await card(env, a)).states.enquiry, "sent_manually");
  assert.equal((await req(env, "PUT", `/admin/consultations/${id}`, { revision: 1, advertiser_id: agency, occupants_match_id: null })).status, 409,
    "a sent enquiry is not rewritten");
  // A match approved later joins the enquiry already sent: no second one for the same property.
  const cora = await searching(env, "Cora Dupre"), mc = await shortlist(env, cora);
  const late = ok(await prepare(env, mc, { advertiser_id: agency }));
  assert.equal(late.consultation.id, id);
  assert.equal(late.match.states.enquiry, "sent_manually");
  assert.equal(row(env, "SELECT COUNT(*) AS n FROM consultations").n, 1);
});

test("two people and a retry share one action", async () => {
  const env = world(), agency = await advertiser(env);
  const ana = await searching(env, "Ana Le Gros"), ben = await searching(env, "Ben Carter");
  const [ma, mb] = [await shortlist(env, ana), await shortlist(env, ben)];
  const body = { operation_id: randomUUID(), kind: "general", advertiser_id: agency };
  const [a, b, c] = await Promise.all([req(env, "POST", `/admin/matches/${ma}/consultation`, body),
    req(env, "POST", `/admin/matches/${mb}/consultation`, { ...body, operation_id: randomUUID() }, OTHER),
    req(env, "POST", `/admin/matches/${ma}/consultation`, body)]);
  assert.deepEqual([a.status, b.status, c.status].sort(), [200, 200, 201], JSON.stringify([a.data, b.data, c.data]));
  assert.equal(new Set([a, b, c].map(r => r.data.consultation.id)).size, 1);
  assert.equal(row(env, "SELECT COUNT(*) AS n FROM consultations").n, 1);
  assert.equal(row(env, "SELECT COUNT(*) AS n FROM consultation_matches").n, 2);
  assert.equal(row(env, "SELECT COUNT(*) AS n FROM notifications WHERE task_key LIKE 'consultation:%'").n, 1);
  assert.equal(row(env, "SELECT COUNT(*) AS n FROM events WHERE type = 'consultation.prepared'").n, 1);

  // Two requests that both read "none open" before either writes: the database itself keeps the one enquiry.
  const cora = await searching(env, "Cora Dupre"), mc = await shortlist(env, cora), real = env.DB.prepare.bind(env.DB);
  env.DB.prepare = sql => (/FROM consultations WHERE scope_key = \?/.test(sql) ? { bind: () => ({ first: async () => null }) } : real(sql));
  for (const [m, email] of [[mc, OTHER], [ma, ADMIN]]) {
    const late = ok(await prepare(env, m, { advertiser_id: agency }, email));
    assert.deepEqual([late.created, late.consultation.id, late.consultation.matches], [false, a.data.consultation.id, 3]);
  }
  env.DB.prepare = real;
  assert.deepEqual(rows(env, `SELECT (SELECT COUNT(*) FROM consultations) AS enquiries, (SELECT COUNT(*) FROM consultation_matches) AS matches,
    (SELECT COUNT(*) FROM notifications WHERE task_key LIKE 'consultation:%') AS tasks,
    (SELECT COUNT(*) FROM events WHERE type = 'consultation.prepared') AS events`), [{ enquiries: 1, matches: 3, tasks: 1, events: 1 }]);
});

test("before it goes out the enquiry is checked again: active search, standing approval, offered property, recipient", async () => {
  const env = world(), agency = await advertiser(env), spare = await advertiser(env, [MET], "Second Fixture Agency");
  const elsewhere = await advertiser(env, [ASK], "Other Fixture Agency");
  const ana = await searching(env, "Ana Le Gros"), ben = await searching(env, "Ben Carter");
  const [ma, mb] = [await shortlist(env, ana), await shortlist(env, ben)];
  // The recipient is an advertiser of this property in the directory, with its personal data still there.
  assert.equal((await prepare(env, ma, { advertiser_id: elsewhere })).status, 400);
  assert.equal((await prepare(env, ma, {})).status, 400);
  const id = ok(await prepare(env, ma, { advertiser_id: agency, include_occupants: true }), 201).consultation.id;
  ok(await prepare(env, mb, { advertiser_id: agency }));

  // Ana's search is resolved: she leaves the enquiry, which stays open for Ben; her household can no longer be stated.
  ok(await req(env, "POST", `/admin/applicants/${ana}/search`, { state: "resolved", reason: "Found a home elsewhere",
    updated_at: row(env, "SELECT updated_at FROM applicants WHERE id = ?", ana).updated_at }));
  let detail = ok(await req(env, "GET", `/admin/listings/${MET}/consultations`)).consultations[0];
  assert.equal(detail.matches, 1);
  assert.equal(detail.status, "manual_pending");
  assert.match(detail.blocked, /household/i);
  assert.equal((await markSent(env, id)).status, 409);
  assert.equal((await card(env, ben)).states.enquiry, "prepared");
  assert.equal((await card(env, ana)).states.enquiry, "not_sent");
  detail = ok(await req(env, "PUT", `/admin/consultations/${id}`, { revision: 1, advertiser_id: agency, occupants_match_id: null })).consultation;
  assert.deepEqual([detail.revision, detail.occupants, detail.blocked], [2, null, null]);
  assert.ok(!/household/i.test(detail.text));

  // The recipient's personal data is removed (AGE-14): not sent to it; another advertiser of the property is chosen.
  run(env, "UPDATE advertisers SET suppressed_at = ? WHERE id = ?", T0, agency);
  assert.equal((await markSent(env, id, { revision: 2 })).status, 409);
  assert.deepEqual(ok(await req(env, "GET", `/admin/matches/${mb}/consultation`)).advertisers.map(a => a.id), [spare]);
  assert.equal((await req(env, "PUT", `/admin/consultations/${id}`, { revision: 2, advertiser_id: agency, occupants_match_id: null })).status, 400);
  detail = ok(await req(env, "PUT", `/admin/consultations/${id}`, { revision: 2, advertiser_id: spare, occupants_match_id: null })).consultation;
  assert.deepEqual([detail.revision, detail.recipient.id, detail.blocked], [3, spare, null]);
  assert.equal((await markSent(env, id, { revision: 2 })).status, 409, "the old version is not the one sent");

  // The price changes after the approval: no approval stands, so nothing goes out until it is reviewed again.
  run(env, "UPDATE listings SET rent = 1700 WHERE id = ?", MET);
  const stale = await markSent(env, id, { revision: 3 });
  assert.equal(stale.status, 409, JSON.stringify(stale.data));
  assert.equal(ok(await req(env, "GET", `/admin/listings/${MET}/consultations`)).consultations[0].matches, 0);
  assert.equal((await card(env, ben)).states.enquiry, "not_sent");
  ok(await req(env, "PUT", `/admin/matches/${mb}`, { status: "found", from: "shortlisted" }));
  await shortlist(env, ben);
  assert.equal((await card(env, ben)).states.enquiry, "prepared", "approved again on today's details, it is covered again");
  // The property leaves the offer: an approval given before is no longer one, and nothing is asked about it.
  run(env, "UPDATE listings SET availability = 'withdrawn' WHERE id = ?", MET);
  assert.equal((await markSent(env, id, { revision: 3 })).status, 409);
  assert.equal(row(env, "SELECT status FROM consultations WHERE id = ?", id).status, "manual_pending");
  assert.equal(row(env, "SELECT resolved_at FROM notifications WHERE task_key LIKE 'consultation:%'").resolved_at, null);
});

test("migration 0077 only adds, and its rows never hold back the removal of a match, a search or a draft", async () => {
  const sql = readFileSync(new URL("../../migrations/0077_consultations.sql", import.meta.url), "utf8").replace(/--.*$/gm, "");
  const statements = sql.split(";").map(s => s.trim()).filter(Boolean);
  assert.equal(statements.length, 5);
  for (const s of statements) assert.match(s, /^CREATE (TABLE|INDEX|UNIQUE INDEX) consultation/);
  const env = world(), agency = await advertiser(env);
  const ana = await searching(env, "Ana Le Gros"), ben = await searching(env, "Ben Carter");
  ok(await prepare(env, await shortlist(env, ana), { advertiser_id: agency }), 201);
  ok(await prepare(env, await shortlist(env, ben), { advertiser_id: agency }));
  run(env, "DELETE FROM matches WHERE applicant_id = ?", ana);
  run(env, "DELETE FROM applicants WHERE id = ?", ben);
  assert.deepEqual(row(env, "SELECT (SELECT COUNT(*) FROM consultations) AS enquiries, (SELECT COUNT(*) FROM consultation_matches) AS matches"),
    { enquiries: 1, matches: 0 });
  assert.match(ok(await req(env, "GET", `/admin/listings/${MET}/consultations`)).consultations[0].blocked, /No approved match/);
  run(env, "DELETE FROM listings WHERE id = ?", MET);
  assert.equal(row(env, "SELECT COUNT(*) AS n FROM consultations").n, 0);
});
