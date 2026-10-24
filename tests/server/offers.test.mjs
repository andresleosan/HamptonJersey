import test from "node:test";
import assert from "node:assert/strict";
import { makeEnv, seedListing, call, adminCookie } from "./helpers.mjs";
import { reachedStages } from "../../server/insights.js";
import { MILESTONES } from "../../server/sales.js";

const ADMIN = "luismadef45@gmail.com";
const req = async (env, method, path, body) => call(env, method, path, { body, cookie: await adminCookie() });
const run = (env, sql, ...args) => env.DB.raw.prepare(sql).run(...args);
const row = (env, sql, ...args) => env.DB.raw.prepare(sql).get(...args);
const rows = (env, sql, ...args) => env.DB.raw.prepare(sql).all(...args);
const events = (env, id) => rows(env, "SELECT type, actor, data FROM events WHERE entity_type = 'applicant' AND entity_id = ? ORDER BY id",
  String(id)).map(e => ({ ...e, data: e.data == null ? null : JSON.parse(e.data) }));
const applicant = (env, id) => row(env, "SELECT stage, updated_at, updated_by FROM applicants WHERE id = ?", id);
const listing = (env, id = "HE-R001") => row(env, "SELECT availability, updated_at, updated_by FROM listings WHERE id = ?", id);
const offer = (env, id) => row(env, "SELECT * FROM offers WHERE id = ?", id);
const count = (env, table) => row(env, `SELECT COUNT(*) AS n FROM ${table}`).n;

// A house for sale and one to let; buyers are added through the panel (stage New, with their notice).
function world() {
  const env = makeEnv();
  seedListing(env, { id: "HE-R001", title: "Le Bernage", matchable: 1 });
  seedListing(env, { id: "HE-R002", title: "La Rocque", matchable: 1 });
  seedListing(env, { id: "HE-R003", title: "Flat to let", operation: "rent", availability: "to_let", sale_price: null,
    rent: 2000, rent_period: "month" });
  return env;
}
// Two accepts at once: both pass their checks before either batch runs, so the loser is turned away by its batch.
function together(env) {
  const batch = env.DB.batch.bind(env.DB);
  let arrived = 0, release;
  const both = new Promise(r => { release = r; });
  env.DB.batch = async stmts => {
    if (stmts.some(st => st.sql.includes("INSERT INTO sales")) && ++arrived <= 2) { if (arrived === 2) release(); await both; }
    return batch(stmts);
  };
}
let n = 0;
async function buyer(env, { stage, ...o } = {}) {
  n++;
  const r = await req(env, "POST", "/admin/applicants", { name: `Buyer ${n}`, email: `buyer${n}@example.je`, source: "phone",
    operation: "buy", budget_max: 900000, ...o });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  if (stage) run(env, "UPDATE applicants SET stage = ? WHERE id = ?", stage, r.data.id);
  return r.data.id;
}
async function record(env, applicant_id, listing_id = "HE-R001", amount = 750000, conditions = "Subject to mortgage") {
  const r = await req(env, "POST", "/admin/offers", { listing_id, applicant_id, amount, conditions });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  return r.data.offer.id;
}

test("offer: recording moves a searching buyer to offer and writes both events", async () => {
  const env = world();
  const id = await buyer(env, { stage: "searching" });
  const before = applicant(env, id).updated_at;
  const r = await req(env, "POST", "/admin/offers", { listing_id: "HE-R001", applicant_id: id, amount: "750000",
    conditions: " Subject to mortgage " });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  const o = r.data.offer;
  assert.deepEqual([o.listing_id, o.applicant_id, o.amount, o.conditions, o.status, o.counter_amount, o.created_by],
    ["HE-R001", id, 750000, "Subject to mortgage", "pending", null, ADMIN]);
  const a = applicant(env, id);
  assert.equal(a.stage, "offer");
  assert.ok(a.updated_at > before);
  const [recorded, stage] = events(env, id).slice(-2);
  assert.deepEqual([recorded.type, recorded.actor, recorded.data],
    ["offer.recorded", ADMIN, { offer_id: o.id, listing_id: "HE-R001", amount: 750000, conditions: "Subject to mortgage" }]);
  assert.deepEqual([stage.type, stage.data], ["applicant.stage_changed",
    { offer_id: o.id, listing_id: "HE-R001", before: { stage: "searching" }, after: { stage: "offer" } }]);
  // The F7-A funnel reads the stage history from these events.
  const history = events(env, id).filter(e => e.type === "applicant.stage_changed").map(e => e.data.after.stage);
  assert.ok(reachedStages("offer", history).has("offer"));

  // A New buyer leaves New: its new-applicant notice closes, as a panel save does.
  const fresh = await buyer(env);
  const open = () => row(env, `SELECT COUNT(*) AS n FROM notifications n JOIN events e ON e.id = n.event_id
    WHERE e.entity_type = 'applicant' AND e.entity_id = ? AND n.category = 'new_applicant' AND n.resolved_at IS NULL`, String(fresh)).n;
  assert.equal(open(), 1);
  await record(env, fresh);
  assert.equal(applicant(env, fresh).stage, "offer");
  assert.equal(open(), 0);

  // Amounts are whole pounds.
  const bad = await req(env, "POST", "/admin/offers", { listing_id: "HE-R001", applicant_id: id, amount: 10.5 });
  assert.equal(bad.status, 400);
  assert.ok(bad.data.fields.amount);
});

test("offer: a rent listing, an archived listing, a sold listing or a renting applicant is 400", async () => {
  const env = world();
  const id = await buyer(env, { stage: "searching" });
  const renter = await buyer(env, { operation: "rent", budget_max: 2500 });
  seedListing(env, { id: "HE-R004", archived_at: "2026-10-01T00:00:00.000Z" });
  seedListing(env, { id: "HE-R005", availability: "sold" });
  for (const [listing_id, applicant_id, msg] of [["HE-R003", id, "This listing is not for sale"],
    ["HE-R004", id, "This listing is not for sale"], ["HE-R005", id, "This listing is not for sale"],
    ["HE-R001", renter, "This applicant is not an active buyer"]]) {
    const r = await req(env, "POST", "/admin/offers", { listing_id, applicant_id, amount: 500000 });
    assert.deepEqual([r.status, r.data.error], [400, msg], listing_id);
  }
  assert.equal(count(env, "offers"), 0);
  assert.equal(applicant(env, id).stage, "searching");
  assert.equal((await req(env, "POST", "/admin/offers", { listing_id: "HE-R009", applicant_id: id, amount: 1 })).status, 404);
});

test("offer: a paused or lost buyer keeps the stage", async () => {
  const env = world();
  for (const stage of ["paused", "lost"]) {
    const id = await buyer(env, { stage });
    const before = applicant(env, id).updated_at;
    const activity = () => row(env, "SELECT c.last_activity_at AS at FROM contacts c JOIN applicants a ON a.contact_id = c.id WHERE a.id = ?",
      id).at;
    run(env, "UPDATE contacts SET last_activity_at = '2026-01-01T00:00:00.000Z' WHERE id = (SELECT contact_id FROM applicants WHERE id = ?)", id);
    await record(env, id);
    // Still activity on the retention clock (G2).
    assert.ok(activity() > "2026-01-01T00:00:00.000Z");
    assert.equal(applicant(env, id).stage, stage);
    assert.equal(applicant(env, id).updated_at, before);
    assert.equal(events(env, id).at(-1).type, "offer.recorded");
    assert.ok(!events(env, id).some(e => e.type === "applicant.stage_changed"));
  }
});

test("offer: a buyer's new offer on a listing withdraws their open one there, in the same batch, with its event", async () => {
  const env = world();
  const a = await buyer(env, { stage: "searching" }), b = await buyer(env, { stage: "searching" });
  const first = await record(env, a), other = await record(env, a, "HE-R002"), rival = await record(env, b);
  assert.equal((await req(env, "POST", `/admin/offers/${first}/counter`, { counter_amount: 790000 })).status, 200);
  const before = events(env, a).length;
  const second = await record(env, a, "HE-R001", 770000);
  assert.deepEqual([offer(env, first).status, offer(env, first).note], ["withdrawn", "Superseded by a new offer"]);
  assert.equal(offer(env, first).counter_amount, 790000); // V21: the counter stays in the history
  // Only the buyer's offer on this listing: their offer elsewhere and another buyer's here stay open.
  assert.deepEqual([offer(env, other).status, offer(env, rival).status, offer(env, second).status], ["pending", "pending", "pending"]);
  assert.deepEqual(events(env, a).slice(before).map(e => [e.type, e.data]), [
    ["offer.withdrawn", { offer_id: first, listing_id: "HE-R001", note: "Superseded by a new offer" }],
    ["offer.recorded", { offer_id: second, listing_id: "HE-R001", amount: 770000, conditions: "Subject to mortgage" }],
  ]);
  // The listing archived between the checks and the write: the batch fails whole and supersedes nothing.
  const batch = env.DB.batch.bind(env.DB), count = events(env, a).length;
  env.DB.batch = async stmts => {
    if (stmts.some(st => st.sql.includes("INSERT INTO offers"))) run(env, "UPDATE listings SET archived_at = updated_at WHERE id = 'HE-R001'");
    return batch(stmts);
  };
  assert.equal((await req(env, "POST", "/admin/offers", { listing_id: "HE-R001", applicant_id: a, amount: 780000 })).status, 400);
  assert.equal(offer(env, second).status, "pending");
  assert.equal(events(env, a).length, count);
});

test("offer: counter, then accept uses the counter amount as the price", async () => {
  const env = world();
  const id = await buyer(env, { stage: "viewing" });
  const o = await record(env, id, "HE-R001", 700000);

  // Corrected while open: the event keeps before and after.
  const put = await req(env, "PUT", `/admin/offers/${o}`, { amount: 710000, conditions: null });
  assert.equal(put.status, 200);
  assert.deepEqual([put.data.offer.amount, put.data.offer.conditions], [710000, null]);
  assert.deepEqual(events(env, id).at(-1), { type: "offer.updated", actor: ADMIN, data: { offer_id: o, listing_id: "HE-R001",
    before: { amount: 700000, conditions: "Subject to mortgage" }, after: { amount: 710000, conditions: null } } });

  assert.equal((await req(env, "POST", `/admin/offers/${o}/counter`, { counter_amount: 0 })).status, 400);
  const c = await req(env, "POST", `/admin/offers/${o}/counter`, { counter_amount: 735000 });
  assert.equal(c.status, 200);
  assert.deepEqual([c.data.offer.status, c.data.offer.counter_amount], ["countered", 735000]);
  assert.deepEqual(events(env, id).at(-1).data, { offer_id: o, listing_id: "HE-R001",
    before: { counter_amount: null }, after: { counter_amount: 735000 } });

  const a = await req(env, "POST", `/admin/offers/${o}/accept`);
  assert.equal(a.status, 201, JSON.stringify(a.data));
  assert.equal(row(env, "SELECT price FROM sales WHERE id = ?", a.data.sale_id).price, 735000);
  assert.deepEqual([a.data.offer.status, a.data.offer.counter_amount], ["accepted", 735000]);

  // Closed now: no more changes.
  // A bad amount on a closed offer is still 409: closed comes first.
  for (const action of ["counter", "reject", "withdraw", "accept"]) {
    const r = await req(env, "POST", `/admin/offers/${o}/${action}`, { counter_amount: 0 });
    assert.deepEqual([r.status, r.data.error], [409, "This offer is no longer open"], action);
  }
  assert.equal((await req(env, "PUT", `/admin/offers/${o}`, { amount: 1 })).status, 409);

  // A pending offer accepted at its amount; a rejected or withdrawn one keeps its note.
  const other = await buyer(env, { stage: "offer" });
  const o2 = await record(env, other, "HE-R001", 690000);
  const rej = await req(env, "POST", `/admin/offers/${o2}/reject`, { note: " Too low " });
  assert.deepEqual([rej.status, rej.data.offer.status, rej.data.offer.note], [200, "rejected", "Too low"]);
  assert.deepEqual(events(env, other).at(-1).data, { offer_id: o2, listing_id: "HE-R001", note: "Too low" });
  const o3 = await record(env, other, "HE-R002", 500000);
  const w = await req(env, "POST", `/admin/offers/${o3}/withdraw`, { note: "Recorded in error" });
  assert.deepEqual([w.data.offer.status, events(env, other).at(-1).type], ["withdrawn", "offer.withdrawn"]);
  assert.equal((await req(env, "POST", "/admin/offers/999/accept")).status, 404);
});

test("offer: the seller counters again, lower, and accept uses the second counter", async () => {
  const env = world();
  const id = await buyer(env, { stage: "viewing" });
  const o = await record(env, id, "HE-R001", 700000);
  assert.equal((await req(env, "POST", `/admin/offers/${o}/counter`, { counter_amount: 760000 })).status, 200);
  const again = await req(env, "POST", `/admin/offers/${o}/counter`, { counter_amount: 740000 });
  assert.deepEqual([again.status, again.data.offer.status, again.data.offer.counter_amount], [200, "countered", 740000]);
  assert.deepEqual(events(env, id).at(-1), { type: "offer.countered", actor: ADMIN, data: { offer_id: o, listing_id: "HE-R001",
    before: { counter_amount: 760000 }, after: { counter_amount: 740000 } } });
  const a = await req(env, "POST", `/admin/offers/${o}/accept`);
  assert.equal(a.status, 201, JSON.stringify(a.data));
  assert.equal(row(env, "SELECT price FROM sales WHERE id = ?", a.data.sale_id).price, 740000);
});

test("accept: creates the sale with nine milestones, listing under_offer, buyer agreed, in one go", async () => {
  const env = world();
  const id = await buyer(env, { stage: "searching" });
  const o = await record(env, id, "HE-R001", 760000);
  const l0 = listing(env), a0 = applicant(env, id);
  const r = await req(env, "POST", `/admin/offers/${o}/accept`);
  assert.equal(r.status, 201, JSON.stringify(r.data));
  const sale = row(env, "SELECT * FROM sales WHERE id = ?", r.data.sale_id);
  assert.deepEqual([sale.listing_id, sale.applicant_id, sale.offer_id, sale.price, sale.status, sale.created_by],
    ["HE-R001", id, o, 760000, "in_progress", ADMIN]);
  assert.deepEqual(rows(env, "SELECT key FROM sale_milestones WHERE sale_id = ?", sale.id).map(m => m.key).sort(),
    MILESTONES.map(([k]) => k).sort());
  assert.equal(offer(env, o).status, "accepted");
  const l = listing(env);
  assert.deepEqual([l.availability, l.updated_by], ["under_offer", ADMIN]);
  assert.ok(l.updated_at > l0.updated_at);
  const a = applicant(env, id);
  assert.equal(a.stage, "agreed");
  assert.ok(a.updated_at > a0.updated_at);
  const ref = { offer_id: o, listing_id: "HE-R001", sale_id: sale.id };
  assert.deepEqual(events(env, id).slice(-3).map(e => [e.type, e.data]), [
    ["offer.accepted", ref],
    ["listing.availability_changed", { ...ref, before: { availability: "for_sale" }, after: { availability: "under_offer" } }],
    ["applicant.stage_changed", { ...ref, before: { stage: "offer" }, after: { stage: "agreed" } }],
  ]);
  // Under offer, the listing is no longer offered to other buyers (V2: its matches are recalculated).
  const later = await buyer(env);
  assert.equal(row(env, "SELECT COUNT(*) AS n FROM matches WHERE applicant_id = ? AND listing_id = 'HE-R001' AND status = 'found'",
    later).n, 0);

  // A lost buyer whose offer is accepted is Agreed, and the lost reason goes, as a panel save does.
  const lost = await buyer(env);
  run(env, "UPDATE applicants SET stage = 'lost', lost_reason = 'Went quiet' WHERE id = ?", lost);
  const o2 = await record(env, lost, "HE-R002");
  assert.equal((await req(env, "POST", `/admin/offers/${o2}/accept`)).status, 201);
  assert.deepEqual({ ...row(env, "SELECT stage, lost_reason FROM applicants WHERE id = ?", lost) }, { stage: "agreed", lost_reason: null });
  const moved = events(env, lost).at(-1).data;
  assert.deepEqual([moved.before, moved.after], [{ stage: "lost", lost_reason: "Went quiet" }, { stage: "agreed", lost_reason: null }]);
});

test("accept: two accepts on one listing at once, one wins, the other is 409 and changes nothing", async () => {
  const env = world();
  const a = await buyer(env, { stage: "viewing" }), b = await buyer(env, { stage: "viewing" });
  const oa = await record(env, a, "HE-R001", 750000), ob = await record(env, b, "HE-R001", 760000);
  const eventsBefore = count(env, "events");
  together(env);
  const [ra, rb] = await Promise.all([req(env, "POST", `/admin/offers/${oa}/accept`), req(env, "POST", `/admin/offers/${ob}/accept`)]);
  const [win, lose] = ra.status === 201 ? [[ra, a, oa], [rb, b, ob]] : [[rb, b, ob], [ra, a, oa]];
  assert.equal(win[0].status, 201, JSON.stringify(win[0].data));
  assert.deepEqual([lose[0].status, lose[0].data.error], [409, "This listing already has a sale in progress"]);
  assert.deepEqual([offer(env, win[2]).status, offer(env, lose[2]).status], ["accepted", "pending"]);
  assert.equal(count(env, "sales"), 1);
  assert.equal(count(env, "sale_milestones"), MILESTONES.length);
  assert.equal(listing(env).availability, "under_offer");
  assert.deepEqual([applicant(env, win[1]).stage, applicant(env, lose[1]).stage], ["agreed", "offer"]);
  assert.equal(count(env, "events") - eventsBefore, 3);
});

test("accept: a buyer with a sale in progress elsewhere is 409", async () => {
  const env = world();
  const id = await buyer(env, { stage: "viewing" });
  const o1 = await record(env, id, "HE-R001"), o2 = await record(env, id, "HE-R002");
  assert.equal((await req(env, "POST", `/admin/offers/${o1}/accept`)).status, 201);
  const eventsBefore = count(env, "events");
  const r = await req(env, "POST", `/admin/offers/${o2}/accept`);
  assert.deepEqual([r.status, r.data.error], [409, "This buyer already has a sale in progress"]);
  assert.equal(offer(env, o2).status, "pending");
  assert.equal(listing(env, "HE-R002").availability, "for_sale");
  assert.equal(count(env, "sales"), 1);
  assert.equal(count(env, "events"), eventsBefore);

  // The same buyer accepted on two listings at once: one sale, the other listing untouched.
  const other = await buyer(env, { stage: "viewing" });
  seedListing(env, { id: "HE-R004", title: "Mont Cochon" });
  const o3 = await record(env, other, "HE-R002"), o4 = await record(env, other, "HE-R004");
  const before = count(env, "events");
  together(env);
  const res = await Promise.all([o3, o4].map(o => req(env, "POST", `/admin/offers/${o}/accept`)));
  assert.deepEqual(res.map(x => x.status).sort(), [201, 409]);
  assert.equal(res.find(x => x.status === 409).data.error, "This buyer already has a sale in progress");
  assert.deepEqual([offer(env, o3).status, offer(env, o4).status].sort(), ["accepted", "pending"]);
  assert.deepEqual(["HE-R002", "HE-R004"].map(l => listing(env, l).availability).sort(), ["for_sale", "under_offer"]);
  assert.equal(count(env, "sales"), 2);
  assert.equal(count(env, "events") - before, 3);
});

test("accept: the buyer's open form gets 409 after the automatic stage change", async () => {
  const env = world();
  const id = await buyer(env, { stage: "viewing" });
  const o = await record(env, id);
  const seen = applicant(env, id).updated_at; // the form opened now, at Offer
  assert.equal((await req(env, "POST", `/admin/offers/${o}/accept`)).status, 201);
  const r = await req(env, "PUT", `/admin/applicants/${id}`, { stage: "offer", updated_at: seen });
  assert.equal(r.status, 409);
  assert.equal(applicant(env, id).stage, "agreed");
});

test("accept: a listing already under_offer by hand is left as is and no availability event is written", async () => {
  const env = world();
  run(env, "UPDATE listings SET availability = 'under_offer' WHERE id = 'HE-R001'");
  const id = await buyer(env, { stage: "agreed" });
  const o = await record(env, id);
  const l0 = listing(env), a0 = applicant(env, id);
  const r = await req(env, "POST", `/admin/offers/${o}/accept`);
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.deepEqual(listing(env), l0);
  // Already Agreed: the stage stays too.
  assert.deepEqual(applicant(env, id), a0);
  assert.deepEqual(events(env, id).at(-1).type, "offer.accepted");
  assert.equal(rows(env, "SELECT 1 FROM events WHERE type IN ('listing.availability_changed', 'applicant.stage_changed') AND entity_id = ?",
    String(id)).length, 0);
});

test("offers: cross-origin POST is 403 and a signed-out call is 401", async () => {
  const env = world();
  const id = await buyer(env, { stage: "viewing" });
  const body = { listing_id: "HE-R001", applicant_id: id, amount: 750000 };
  const cross = await call(env, "POST", "/admin/offers", { body, cookie: await adminCookie(), origin: "https://evil.test" });
  assert.equal(cross.status, 403);
  assert.equal((await call(env, "POST", "/admin/offers", { body })).status, 401);
  assert.equal((await call(env, "POST", "/admin/offers/1/accept", {})).status, 401);
  assert.equal(count(env, "offers"), 0);
});
