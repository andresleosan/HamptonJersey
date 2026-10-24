import test from "node:test";
import assert from "node:assert/strict";
import { makeEnv, seedListing, call, adminCookie } from "./helpers.mjs";
import { jerseyToday, plusDays } from "../../server/viewings.js";
import { MILESTONES } from "../../server/sales.js";

const ADMIN = "luismadef45@gmail.com";
const req = async (env, method, path, body) => call(env, method, path, { body, cookie: await adminCookie() });
const run = (env, sql, ...args) => env.DB.raw.prepare(sql).run(...args);
const row = (env, sql, ...args) => env.DB.raw.prepare(sql).get(...args);
const rows = (env, sql, ...args) => env.DB.raw.prepare(sql).all(...args);
const events = (env, id) => rows(env, "SELECT type, actor, data FROM events WHERE entity_type = 'applicant' AND entity_id = ? ORDER BY id",
  String(id)).map(e => ({ ...e, data: e.data == null ? null : JSON.parse(e.data) }));
const sale = (env, id) => row(env, "SELECT * FROM sales WHERE id = ?", id);
const offer = (env, id) => row(env, "SELECT * FROM offers WHERE id = ?", id);
const availability = (env, id) => row(env, "SELECT availability FROM listings WHERE id = ?", id).availability;
const stage = (env, id) => row(env, "SELECT stage FROM applicants WHERE id = ?", id).stage;
const today = () => jerseyToday();

function world() {
  const env = makeEnv();
  for (const [id, title] of [["HE-R001", "Le Bernage"], ["HE-R002", "La Rocque"], ["HE-R004", "Les Ormes"]])
    seedListing(env, { id, title, matchable: 1 });
  return env;
}
let n = 0;
async function buyer(env, stage = "searching") {
  n++;
  const r = await req(env, "POST", "/admin/applicants", { name: `Buyer ${n}`, email: `sale${n}@example.je`, source: "phone",
    operation: "buy", budget_max: 900000 });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  run(env, "UPDATE applicants SET stage = ? WHERE id = ?", stage, r.data.id);
  return r.data.id;
}
async function record(env, applicant_id, listing_id = "HE-R001", amount = 750000) {
  const r = await req(env, "POST", "/admin/offers", { listing_id, applicant_id, amount });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  return r.data.offer.id;
}
async function accepted(env, applicant_id, listing_id = "HE-R001", amount = 750000) {
  const o = await record(env, applicant_id, listing_id, amount);
  const r = await req(env, "POST", `/admin/offers/${o}/accept`);
  assert.equal(r.status, 201, JSON.stringify(r.data));
  return r.data.sale_id;
}
const put = async (env, id, body) => req(env, "PUT", `/admin/sales/${id}`, { updated_at: sale(env, id).updated_at, ...body });
async function complete(env, id) {
  assert.equal((await req(env, "PUT", `/admin/sales/${id}/milestones/passing`, { done_on: today() })).status, 200);
  const r = await req(env, "POST", `/admin/sales/${id}/complete`);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  return r;
}
const counts = async env => (await req(env, "GET", "/admin/notifications/counts")).data;

test("sales list: fees in progress and completed this year are net of the shared fee", async () => {
  const env = world();
  const a = await buyer(env), b = await buyer(env), c = await buyer(env), d = await buyer(env);
  const s1 = await accepted(env, a, "HE-R001");
  assert.equal((await put(env, s1, { fee: 10000, shared_agency: "Other Estates", shared_fee: 4000 })).status, 200);
  // R4: the stored row and the body are checked together, never left to the database.
  const over = await put(env, s1, { shared_fee: 12000 });
  assert.equal(over.status, 400);
  assert.ok(over.data.fields.shared_fee);
  assert.ok((await put(env, s1, { fee: 3000 })).data.fields.shared_fee);
  assert.ok((await put(env, s1, { fee: null })).data.fields.shared_fee);
  assert.deepEqual([sale(env, s1).fee, sale(env, s1).shared_fee], [10000, 4000]);

  const s2 = await accepted(env, b, "HE-R002");
  await put(env, s2, { fee: 8000 });
  await complete(env, s2);
  const s3 = await accepted(env, c, "HE-R004");
  await put(env, s3, { fee: 5000, shared_fee: 1000 });
  await complete(env, s3);
  // Completed on 31 December of last year, Jersey time: not this year's.
  const year = Number(today().slice(0, 4));
  run(env, "UPDATE sales SET closed_at = ? WHERE id = ?", `${year - 1}-12-31T23:59:59.000Z`, s3);
  seedListing(env, { id: "HE-R005", title: "Old one" });
  await record(env, d, "HE-R005");

  const r = await req(env, "GET", "/admin/sales");
  assert.equal(r.status, 200);
  assert.deepEqual(r.data.totals, { open_offers: 1, in_progress: 1, fees_in_progress: 6000, fees_completed_year: 8000 });
  assert.deepEqual(r.data.sales.map(s => [s.id, s.listing_title, s.buyer_name, s.price, s.target_date, s.next, s.overdue]),
    [[s1, "Le Bernage", "Buyer 1", 750000, null, { key: "lawyers", label: "Lawyers instructed", planned_on: null }, false]]);
  assert.deepEqual(r.data.closed.map(s => [s.id, s.status]).sort(), [[s2, "completed"], [s3, "completed"]]);
  const [o] = r.data.offers;
  assert.deepEqual([o.listing_id, o.listing_title, o.applicant_id, o.buyer_name, o.amount, o.status, o.waiting, o.backup],
    ["HE-R005", "Old one", d, "Buyer 4", 750000, "pending", false, false]);
  assert.ok("buyer_position" in o && "mortgage_aip" in o && "counter_amount" in o && "conditions" in o);

  // Closed more than 12 months ago: no longer listed.
  run(env, "UPDATE sales SET closed_at = ? WHERE id = ?", `${year - 2}-01-01T00:00:00.000Z`, s3);
  assert.deepEqual((await req(env, "GET", "/admin/sales")).data.closed.map(s => s.id), [s2]);
});

test("sales list: an overdue milestone puts the sale first and counts in the nav", async () => {
  const env = world();
  const a = await buyer(env), b = await buyer(env);
  const s1 = await accepted(env, a, "HE-R001"), s2 = await accepted(env, b, "HE-R002");
  const before = await counts(env);
  assert.equal(before.sales, 0);
  const step = (id, key, body) => req(env, "PUT", `/admin/sales/${id}/milestones/${key}`, body);
  assert.equal((await step(s1, "lawyers", { planned_on: plusDays(today(), 3) })).status, 200);
  const m = await step(s2, "lawyers", { planned_on: plusDays(today(), -1), note: "Chase Ogier" });
  assert.equal(m.status, 200);
  assert.deepEqual(m.data.milestone, { key: "lawyers", label: "Lawyers instructed", planned_on: plusDays(today(), -1), done_on: null,
    not_needed: false, note: "Chase Ogier", overdue: true });
  assert.deepEqual(events(env, b).at(-1), { type: "sale.milestone", actor: ADMIN, data: { offer_id: sale(env, s2).offer_id,
    sale_id: s2, listing_id: "HE-R002", key: "lawyers", before: { planned_on: null, note: null },
    after: { planned_on: plusDays(today(), -1), note: "Chase Ogier" } } });

  let r = await req(env, "GET", "/admin/sales");
  assert.deepEqual(r.data.sales.map(s => [s.id, s.overdue]), [[s2, true], [s1, false]]);
  const c = await counts(env);
  assert.equal(c.sales, 1);
  assert.equal(c.action, before.action);

  // In the order of V8, whatever the table's order; the next step follows the ones done or not needed.
  await step(s2, "lawyers", { done_on: today() });
  await step(s2, "due_diligence", { not_needed: true });
  const detail = await req(env, "GET", `/admin/sales/${s2}`);
  assert.deepEqual(detail.data.milestones.map(x => x.key), MILESTONES.map(([k]) => k));
  assert.equal(detail.data.sale.listing_title, "La Rocque");
  r = await req(env, "GET", "/admin/sales");
  assert.deepEqual(r.data.sales.map(s => [s.id, s.overdue]), [[s1, false], [s2, false]]);
  assert.deepEqual(r.data.sales.find(s => s.id === s2).next,
    { key: "questionnaire", label: "Seller's questionnaire received", planned_on: null });
  assert.equal((await counts(env)).sales, 0);

  // R4: done and not needed never reach the database together.
  const both = await step(s2, "lawyers", { not_needed: true });
  assert.equal(both.status, 400);
  assert.ok(both.data.fields.not_needed);
  assert.equal((await step(s2, "nope", { note: "x" })).status, 404);
  // A known step whose row is missing is not found either, never a 500.
  run(env, "DELETE FROM sale_milestones WHERE sale_id = ? AND key = 'settled'", s2);
  assert.deepEqual([(await step(s2, "settled", { note: "x" })).status, (await step(s2, "settled", { note: "x" })).data.error],
    [404, "Step not found"]);
  assert.equal((await step(s2, "lawyers", { planned_on: "2026-02-30" })).status, 400);
  // A step is not done tomorrow (Jersey's today is the limit); the stored day stays.
  const later = await step(s2, "contract", { done_on: plusDays(today(), 1) });
  assert.deepEqual([later.status, later.data.fields], [400, { done_on: "Use today or an earlier date" }]);
  assert.equal(row(env, "SELECT done_on FROM sale_milestones WHERE sale_id = ? AND key = 'contract'", s2).done_on, null);
});

test("waiting: an offer untouched for three days counts; a backup offer on a listing with a sale does not", async () => {
  const env = world();
  const a = await buyer(env), b = await buyer(env), c = await buyer(env), d = await buyer(env);
  const old = new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString();
  const o1 = await record(env, a, "HE-R002");
  const o2 = await record(env, b, "HE-R001");
  await accepted(env, c, "HE-R001");
  const o3 = await record(env, d, "HE-R004");
  run(env, "UPDATE offers SET updated_at = ? WHERE id IN (?, ?)", old, o1, o2);

  const r = await req(env, "GET", "/admin/sales");
  const by = Object.fromEntries(r.data.offers.map(o => [o.id, [o.waiting, o.backup]]));
  assert.deepEqual(by, { [o1]: [true, false], [o2]: [false, true], [o3]: [false, false] });
  assert.equal((await counts(env)).sales, 1);
});

test("sale: a stale updated_at is 409 and nothing changes", async () => {
  const env = world();
  const a = await buyer(env);
  const id = await accepted(env, a);
  const seen = sale(env, id).updated_at;
  assert.equal((await req(env, "PUT", `/admin/sales/${id}`, { price: 1 })).status, 400);

  const ok = await put(env, id, { price: 740000, route: "share_transfer", seller_email: "SELLER@example.je ", target_date: "2026-12-18" });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  assert.deepEqual([ok.data.sale.price, ok.data.sale.route, ok.data.sale.seller_email, ok.data.sale.updated_by],
    [740000, "share_transfer", "SELLER@example.je", ADMIN]);
  const e = events(env, a).at(-1);
  assert.deepEqual([e.type, e.data], ["sale.updated", { offer_id: sale(env, id).offer_id, sale_id: id, listing_id: "HE-R001",
    before: { price: 750000, route: null, seller_email: null, target_date: null },
    after: { price: 740000, route: "share_transfer", seller_email: "SELLER@example.je", target_date: "2026-12-18" } }]);
  // A share transfer completes instead of passing before the Royal Court.
  const detail = await req(env, "GET", `/admin/sales/${id}`);
  assert.equal(detail.data.milestones.find(m => m.key === "passing").label, "Completion");

  const nEvents = events(env, a).length, stored = sale(env, id);
  const stale = await req(env, "PUT", `/admin/sales/${id}`, { updated_at: seen, price: 700000 });
  assert.equal(stale.status, 409);
  assert.deepEqual(sale(env, id), stored);
  assert.equal(events(env, a).length, nEvents);

  // Someone saves between our read and our write: the batch rolls back, events included.
  const batch = env.DB.batch.bind(env.DB);
  env.DB.batch = async stmts => {
    if (stmts.some(s => s.sql.startsWith("UPDATE sales"))) run(env, "UPDATE sales SET updated_at = 'x' WHERE id = ?", id);
    return batch(stmts);
  };
  const race = await put(env, id, { price: 700000 });
  assert.equal(race.status, 409);
  assert.equal(sale(env, id).price, 740000);
  assert.equal(events(env, a).length, nEvents);
  env.DB.batch = batch;

  // A closed sale is not edited.
  await req(env, "POST", `/admin/sales/${id}/fall-through`, { reason: "chain" });
  assert.equal((await put(env, id, { price: 700000 })).status, 409);
  assert.equal((await req(env, "GET", "/admin/sales/999")).status, 404);
});

test("complete: needs passing done or not needed", async () => {
  const env = world();
  const a = await buyer(env);
  const id = await accepted(env, a);
  const r = await req(env, "POST", `/admin/sales/${id}/complete`);
  assert.equal(r.status, 400);
  assert.equal(sale(env, id).status, "in_progress");
  assert.equal(availability(env, "HE-R001"), "under_offer");
  assert.equal((await req(env, "PUT", `/admin/sales/${id}/milestones/passing`, { not_needed: true })).status, 200);
  // R11: completing sells the listing from any availability but sold, even one set by hand to let.
  run(env, "UPDATE listings SET availability = 'to_let' WHERE id = 'HE-R001'");
  assert.equal((await req(env, "POST", `/admin/sales/${id}/complete`)).status, 200);
  assert.equal(sale(env, id).status, "completed");
  assert.equal(availability(env, "HE-R001"), "sold");
  assert.equal((await req(env, "POST", `/admin/sales/${id}/complete`)).status, 409);
  assert.equal((await req(env, "POST", `/admin/sales/${id}/fall-through`, { reason: "chain" })).status, 409);
  assert.equal((await req(env, "PUT", `/admin/sales/${id}/milestones/settled`, { done_on: today() })).status, 409);
});

test("complete: listing sold, buyer completed, backup offers rejected and the buyer's other offers withdrawn, each with an event", async () => {
  const env = world();
  const a = await buyer(env), b = await buyer(env);
  const elsewhere = await record(env, a, "HE-R002");
  const backup = await record(env, b, "HE-R001", 760000);
  const id = await accepted(env, a, "HE-R001");
  // An offer the buyer records on the listing while buying it is a backup of their own.
  const own = await record(env, a, "HE-R001", 740000);
  const s = sale(env, id);
  const r = await complete(env, id);
  assert.deepEqual([r.data.sale.status, r.data.sale.id], ["completed", id]);

  const done = sale(env, id);
  assert.equal(done.status, "completed");
  assert.ok(done.closed_at);
  assert.equal(availability(env, "HE-R001"), "sold");
  assert.equal(availability(env, "HE-R002"), "for_sale");
  assert.equal(stage(env, a), "completed");
  assert.equal(offer(env, s.offer_id).status, "accepted");
  assert.deepEqual([offer(env, backup).status, offer(env, backup).note], ["rejected", "Property sold"]);
  assert.deepEqual([offer(env, elsewhere).status, offer(env, elsewhere).note], ["withdrawn", "Buyer completed elsewhere"]);
  // The buyer's own other offer on the listing is theirs to withdraw, not a backup to reject, and not "elsewhere".
  assert.deepEqual([offer(env, own).status, offer(env, own).note], ["withdrawn", "Buyer bought this property"]);

  const ref = { offer_id: s.offer_id, sale_id: id, listing_id: "HE-R001" };
  assert.deepEqual(events(env, b).at(-1), { type: "offer.rejected", actor: ADMIN,
    data: { offer_id: backup, sale_id: id, listing_id: "HE-R001", note: "Property sold" } });
  const withdrawn = (offer_id, listing_id, note) => ["offer.withdrawn", { offer_id, sale_id: id, listing_id, note }];
  assert.deepEqual(events(env, a).slice(-5).map(e => [e.type, e.data]), [
    ["sale.completed", ref],
    withdrawn(own, "HE-R001", "Buyer bought this property"),
    withdrawn(elsewhere, "HE-R002", "Buyer completed elsewhere"),
    ["listing.availability_changed", { ...ref, before: { availability: "under_offer" }, after: { availability: "sold" } }],
    ["applicant.stage_changed", { ...ref, before: { stage: "agreed" }, after: { stage: "completed" } }],
  ]);
  // Their ids are integers, as in every other event (a bound JS number would be stored as 1.0).
  for (const e of rows(env, "SELECT data FROM events WHERE type IN ('offer.rejected', 'offer.withdrawn')"))
    assert.match(e.data, new RegExp(`"sale_id":${id},`));

  // The applicant's and the listing's own views.
  const mineView = await req(env, "GET", `/admin/applicants/${a}/offers`);
  assert.equal(mineView.status, 200);
  assert.deepEqual(mineView.data.offers.map(o => [o.id, o.status, o.listing_title]).sort(),
    [[s.offer_id, "accepted", "Le Bernage"], [elsewhere, "withdrawn", "La Rocque"], [own, "withdrawn", "Le Bernage"]].sort());
  assert.deepEqual(mineView.data.sales.map(x => [x.id, x.status, x.listing_title]), [[id, "completed", "Le Bernage"]]);
  const listingView = (await req(env, "GET", "/admin/listings/HE-R001/offers")).data;
  assert.deepEqual([listingView.open, listingView.sale], [0, null]);
  // Every offer on the listing, whatever its status, newest first, with its buyer.
  assert.deepEqual(listingView.offers.map(o => [o.id, o.status, o.note, o.applicant_id]), [
    [own, "withdrawn", "Buyer bought this property", a], [s.offer_id, "accepted", null, a], [backup, "rejected", "Property sold", b]]);
  assert.deepEqual(Object.keys(listingView.offers[0]).sort(), ["amount", "applicant_id", "buyer_name", "counter_amount", "created_at",
    "id", "note", "status", "updated_at"]);
  assert.ok(listingView.offers.every(o => /^Buyer \d+$/.test(o.buyer_name)));
  assert.equal((await req(env, "GET", "/admin/applicants/999/offers")).status, 404);
  assert.equal((await req(env, "GET", "/admin/listings/HE-R999/offers")).status, 404);
});

test("fall through: listing back to for_sale and buyer to searching; a listing withdrawn by hand stays withdrawn", async () => {
  const env = world();
  const a = await buyer(env), b = await buyer(env);
  const id = await accepted(env, a, "HE-R001");
  const view = (await req(env, "GET", "/admin/listings/HE-R001/offers")).data;
  assert.deepEqual([view.open, view.sale, view.offers.map(o => [o.id, o.status])],
    [0, { id, status: "in_progress" }, [[sale(env, id).offer_id, "accepted"]]]);
  const bad = await req(env, "POST", `/admin/sales/${id}/fall-through`, { reason: "bored" });
  assert.equal(bad.status, 400);
  assert.ok(bad.data.fields.reason);
  assert.equal((await req(env, "POST", `/admin/sales/${id}/fall-through`, { reason: "finance", note: "x".repeat(301) })).status, 400);

  const r = await req(env, "POST", `/admin/sales/${id}/fall-through`, { reason: "finance", note: " Mortgage refused " });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const s = sale(env, id);
  assert.deepEqual([s.status, s.fell_through_reason, s.fell_through_note], ["fallen_through", "finance", "Mortgage refused"]);
  assert.ok(s.closed_at);
  assert.equal(offer(env, s.offer_id).status, "accepted");
  assert.equal(availability(env, "HE-R001"), "for_sale");
  assert.equal(stage(env, a), "searching");
  const ref = { offer_id: s.offer_id, sale_id: id, listing_id: "HE-R001" };
  // The recompute after the close may add applicant.matched (back for sale, back to searching).
  assert.deepEqual(events(env, a).filter(e => e.type !== "applicant.matched").slice(-3).map(e => [e.type, e.data]), [
    ["sale.fallen_through", { ...ref, reason: "finance", note: "Mortgage refused" }],
    ["listing.availability_changed", { ...ref, before: { availability: "under_offer" }, after: { availability: "for_sale" } }],
    ["applicant.stage_changed", { ...ref, before: { stage: "agreed" }, after: { stage: "searching" } }],
  ]);

  // Changed by hand meanwhile: the team's listing and the buyer's stage are left alone.
  const id2 = await accepted(env, b, "HE-R002");
  run(env, "UPDATE listings SET availability = 'withdrawn' WHERE id = 'HE-R002'");
  run(env, "UPDATE applicants SET stage = 'paused' WHERE id = ?", b);
  assert.equal((await req(env, "POST", `/admin/sales/${id2}/fall-through`, { reason: "seller_withdrew" })).status, 200);
  assert.equal(availability(env, "HE-R002"), "withdrawn");
  assert.equal(stage(env, b), "paused");
  assert.deepEqual(events(env, b).at(-1).type, "sale.fallen_through");
  assert.equal(sale(env, id2).fell_through_note, null);
});

test("archive: a listing or applicant with an open offer or a sale in progress is 409", async () => {
  const env = world();
  const a = await buyer(env), b = await buyer(env);
  const o = await record(env, a, "HE-R002");
  const view = (await req(env, "GET", "/admin/listings/HE-R002/offers")).data;
  assert.deepEqual([view.open, view.sale, view.offers.map(x => [x.id, x.status])], [1, null, [[o, "pending"]]]);
  const busy = { status: 409, error: "Close its offers and sale first" };
  const archive = async path => { const r = await req(env, "POST", `${path}/archive`); return { status: r.status, error: r.data.error }; };
  assert.deepEqual(await archive("/admin/listings/HE-R002"), busy);
  assert.deepEqual(await archive(`/admin/applicants/${a}`), busy);
  const id = await accepted(env, b, "HE-R001");
  assert.deepEqual(await archive("/admin/listings/HE-R001"), busy);
  assert.deepEqual(await archive(`/admin/applicants/${b}`), busy);
  assert.equal(row(env, "SELECT COUNT(*) AS n FROM listings WHERE archived_at IS NOT NULL").n, 0);
  assert.equal(row(env, "SELECT COUNT(*) AS n FROM applicants WHERE archived_at IS NOT NULL").n, 0);
  assert.ok(!events(env, a).some(e => e.type === "applicant.archived"));

  await req(env, "POST", `/admin/offers/${o}/withdraw`, {});
  await req(env, "POST", `/admin/sales/${id}/fall-through`, { reason: "chain" });
  for (const path of ["/admin/listings/HE-R002", `/admin/applicants/${a}`, "/admin/listings/HE-R001", `/admin/applicants/${b}`])
    assert.equal((await req(env, "POST", `${path}/archive`)).status, 200, path);
});

test("delete: an archived applicant with a fallen-through sale is 409; without sales it is deleted with its offers", async () => {
  const env = world();
  const name = id => row(env, "SELECT c.name FROM contacts c JOIN applicants a ON a.contact_id = c.id WHERE a.id = ?", id).name;
  const kept = { status: 409, error: "Kept for 5 years: it has a sale" };
  const del = async (path, confirm) => { const r = await req(env, "DELETE", path, { confirm }); return { status: r.status, error: r.data.error }; };
  const a = await buyer(env), b = await buyer(env), c = await buyer(env);
  const id = await accepted(env, a, "HE-R001");
  await req(env, "POST", `/admin/sales/${id}/fall-through`, { reason: "buyer_withdrew" });
  assert.equal((await req(env, "POST", `/admin/applicants/${a}/archive`)).status, 200);
  assert.deepEqual(await del(`/admin/applicants/${a}`, name(a)), kept);
  assert.ok(row(env, "SELECT 1 AS x FROM applicants WHERE id = ?", a));

  const o = await record(env, b, "HE-R002");
  await req(env, "POST", `/admin/offers/${o}/withdraw`, {});
  assert.equal((await req(env, "POST", `/admin/applicants/${b}/archive`)).status, 200);
  assert.deepEqual(await del(`/admin/applicants/${b}`, name(b)), { status: 200, error: undefined });
  assert.equal(row(env, "SELECT COUNT(*) AS n FROM offers WHERE applicant_id = ?", b).n, 0);

  // The same for a listing: one with a completed sale is kept; one with offers only goes, with its offers.
  const id2 = await accepted(env, c, "HE-R004");
  await complete(env, id2);
  assert.equal((await req(env, "POST", "/admin/listings/HE-R004/archive")).status, 200);
  assert.deepEqual(await del("/admin/listings/HE-R004", "HE-R004"), kept);
  assert.ok(row(env, "SELECT 1 AS x FROM listings WHERE id = 'HE-R004'"));
  assert.equal((await req(env, "POST", "/admin/listings/HE-R001/archive")).status, 200);
  assert.deepEqual(await del("/admin/listings/HE-R001", "HE-R001"), kept);

  const d = await buyer(env);
  const o2 = await record(env, d, "HE-R002");
  await req(env, "POST", `/admin/offers/${o2}/reject`, {});
  assert.equal((await req(env, "POST", "/admin/listings/HE-R002/archive")).status, 200);
  assert.deepEqual(await del("/admin/listings/HE-R002", "HE-R002"), { status: 200, error: undefined });
  assert.equal(row(env, "SELECT COUNT(*) AS n FROM offers WHERE listing_id = 'HE-R002'").n, 0);
});

test("milestone: a save of the same step meanwhile that breaks the CHECK is 409 and changes nothing", async () => {
  const env = world();
  const a = await buyer(env);
  const id = await accepted(env, a);
  const nEvents = events(env, a).length;
  // Another admin marks the step not needed between our read and our write.
  const batch = env.DB.batch.bind(env.DB);
  env.DB.batch = async stmts => {
    if (stmts[0].sql.startsWith("UPDATE sale_milestones"))
      run(env, "UPDATE sale_milestones SET not_needed = 1 WHERE sale_id = ? AND key = 'mortgage'", id);
    return batch(stmts);
  };
  const r = await req(env, "PUT", `/admin/sales/${id}/milestones/mortgage`, { done_on: today() });
  assert.deepEqual([r.status, r.data.error], [409, "Someone else changed this step. Reload to see it"]);
  const m = row(env, "SELECT done_on, not_needed FROM sale_milestones WHERE sale_id = ? AND key = 'mortgage'", id);
  assert.deepEqual({ ...m }, { done_on: null, not_needed: 1 });
  assert.equal(events(env, a).length, nEvents);
});

test("archive: an offer recorded between the check and the write still blocks it, and nothing is archived", async () => {
  const env = world();
  const a = await buyer(env);
  const nEvents = events(env, a).length;
  const sneak = applicant_id => run(env, `INSERT INTO offers (listing_id, applicant_id, amount, created_at, updated_at)
    VALUES ('HE-R001', ?, 700000, '2026-10-24T00:00:00.000Z', '2026-10-24T00:00:00.000Z')`, applicant_id);
  // The listing: its archive is one UPDATE; the offer lands just before it runs.
  const prepare = env.DB.prepare;
  env.DB.prepare = sql => {
    const st = prepare(sql);
    if (!/^UPDATE listings SET published/.test(sql)) return st;
    return { ...st, bind: (...args) => { const b = st.bind(...args); return { ...b, run: () => { sneak(a); return b.run(); } }; } };
  };
  const l = await req(env, "POST", "/admin/listings/HE-R001/archive");
  assert.deepEqual([l.status, l.data.error], [409, "Close its offers and sale first"]);
  assert.equal(row(env, "SELECT archived_at FROM listings WHERE id = 'HE-R001'").archived_at, null);
  env.DB.prepare = prepare;

  // The buyer: their archive batch rolls back whole, event and notices included.
  const b = await buyer(env, "new");
  const batch = env.DB.batch.bind(env.DB);
  env.DB.batch = async stmts => {
    if (stmts[0].sql.startsWith("UPDATE applicants SET archived_at")) sneak(b);
    return batch(stmts);
  };
  const openNotices = () => row(env, `SELECT COUNT(*) AS n FROM notifications n JOIN events e ON e.id = n.event_id
    WHERE e.entity_type = 'applicant' AND e.entity_id = ? AND n.resolved_at IS NULL`, String(b)).n;
  const notices = openNotices(), bEvents = events(env, b).length;
  assert.ok(notices > 0);
  const r = await req(env, "POST", `/admin/applicants/${b}/archive`);
  assert.deepEqual([r.status, r.data.error], [409, "Close its offers and sale first"]);
  assert.equal(row(env, "SELECT archived_at FROM applicants WHERE id = ?", b).archived_at, null);
  assert.equal(events(env, b).length, bEvents);
  assert.equal(openNotices(), notices);
  assert.equal(events(env, a).length, nEvents);
});
