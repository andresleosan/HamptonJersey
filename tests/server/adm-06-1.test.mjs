// ADM-06 task 1: a tenancy that starts from a Let agreed listing and an applicant picked by staff. Synthetic fixtures.
import test from "node:test";
import assert from "node:assert/strict";
import { makeEnv, call, adminCookie, seedListing, T0 } from "./helpers.mjs";
import { jerseyToday } from "../../server/viewings.js";

const T = jerseyToday(), M0 = `${T.slice(0, 7)}-01`;
const on = () => ({ ...makeEnv(), ADM06_TENANCY_ORIGIN_READY: "1" });
const req = async (env, method, path, body) => call(env, method, path, { body, cookie: await adminCookie() });
const rows = (env, sql, ...a) => env.DB.raw.prepare(sql).all(...a);
const row = (env, sql, ...a) => env.DB.raw.prepare(sql).get(...a);
const count = (env, table) => row(env, `SELECT COUNT(*) AS n FROM ${table}`).n;

async function rental(env, over = {}) {
  const l = await req(env, "POST", "/admin/landlords", { name: "Synthetic Owner" });
  const r = await req(env, "POST", "/admin/rentals", { landlord_id: l.data.landlord.id, address: "1 Rue des Exemples",
    parish: "St Helier", service: "full", fee_percent: 10, ...over });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  return r.data.rental.id;
}
const listing = (env, over = {}) => seedListing(env, { id: "HE-L001", title: "1 Rue des Exemples", road_name: "Rue des Exemples",
  operation: "rent", availability: "let_agreed", sale_price: null, rent: 1500, rent_period: "month", published: 0, ...over });
let seq = 0;
function applicant(env, over = {}) {
  const c = env.DB.raw.prepare(`INSERT INTO contacts (name, email, last_activity_at, created_at, updated_at)
    VALUES ('Tess Example', ?, ?, ?, ?)`).run(`tess${++seq}@example.test`, T0, T0, T0);
  const a = env.DB.raw.prepare(`INSERT INTO applicants (contact_id, operation, stage, source, created_at, updated_at)
    VALUES (?, ?, ?, 'web', ?, ?)`).run(c.lastInsertRowid, over.operation ?? "rent", over.stage ?? "agreed", T0, T0);
  return Number(a.lastInsertRowid);
}
const DRAFT = { tenant_name: "Tess Example", kind: "periodic", regime: "2025", rent: 1500, start_on: M0 };
async function setup(env = on()) {
  const rid = await rental(env); listing(env); const aid = applicant(env);
  return { env, rid, aid, pick: { rental_id: rid, listing_id: "HE-L001", applicant_id: aid } };
}
const preview = (env, pick) => req(env, "POST", "/admin/tenancy-origins/preview", pick);
async function commit(env, pick, over = {}) {
  const p = await preview(env, pick);
  assert.equal(p.status, 200, JSON.stringify(p.data));
  return req(env, "POST", "/admin/tenancy-origins/commit", { rental_id: pick.rental_id, source_versions: p.data.source_versions,
    tenancy_draft: DRAFT, operation_id: "op-000000001", ...over });
}

test("flag off: the origin routes do not exist and manual New tenancy still works", async () => {
  const env = makeEnv(), rid = await rental(env); listing(env); const aid = applicant(env);
  assert.equal((await preview(env, { rental_id: rid, listing_id: "HE-L001", applicant_id: aid })).status, 404);
  assert.equal((await req(env, "POST", "/admin/tenancy-origins/commit", {})).status, 404);
  const t = await req(env, "POST", `/admin/rentals/${rid}/tenancies`, { ...DRAFT, collect_from: M0 });
  assert.equal(t.status, 201, JSON.stringify(t.data));
  assert.equal(count(env, "tenancy_origins"), 0);
});

test("origin routes need the staff session, like New tenancy", async () => {
  const { env, pick } = await setup();
  assert.equal((await call(env, "POST", "/admin/tenancy-origins/preview", { body: pick })).status, 401);
  assert.equal((await call(env, "POST", "/admin/tenancy-origins/commit", { body: {} })).status, 401);
});

test("external_listing_cannot_become_managed_by_inference", async () => {
  const { env, aid } = await setup();
  const before = [count(env, "rentals"), count(env, "tenancies"), count(env, "tenancy_origins")];
  // Same address as the managed property, but no property chosen: nothing is matched by address or name.
  const p = await preview(env, { listing_id: "HE-L001", applicant_id: aid });
  assert.equal(p.status, 400); assert.ok(p.data.fields.rental_id);
  const c = await req(env, "POST", "/admin/tenancy-origins/commit", { source_versions: { listing_id: "HE-L001",
    listing_updated_at: T0, applicant_id: aid, applicant_updated_at: T0 }, tenancy_draft: DRAFT, operation_id: "op-000000009" });
  assert.equal(c.status, 400); assert.ok(c.data.fields.rental_id);
  const none = await preview(env, { rental_id: 999, listing_id: "HE-L001", applicant_id: aid });
  assert.equal(none.status, 404);
  // A listing not let agreed, or not to rent, is not eligible either.
  listing(env, { id: "HE-L002", availability: "to_let" });
  const tl = await preview(env, { rental_id: 1, listing_id: "HE-L002", applicant_id: aid });
  assert.equal(tl.status, 200); assert.equal(tl.data.eligible, false);
  assert.deepEqual([count(env, "rentals"), count(env, "tenancies"), count(env, "tenancy_origins")], before);
});

test("preview_has_no_side_effects and draft_preview_does_not_publish_listing", async () => {
  const { env, pick } = await setup();
  const tables = ["tenancies", "rental_events", "charges", "rent_changes", "tenancy_origins", "tenancy_signed_contracts", "events"];
  const snap = () => [tables.map(t => count(env, t)), row(env, "SELECT * FROM listings WHERE id = 'HE-L001'"),
    row(env, "SELECT * FROM applicants WHERE id = ?", pick.applicant_id), row(env, "SELECT updated_at FROM rentals WHERE id = ?", pick.rental_id)];
  const before = snap();
  const p = await preview(env, { ...pick, signed_contract_ref: "Signed lease, folder L-0001" });
  assert.equal(p.status, 200, JSON.stringify(p.data));
  assert.equal(p.data.eligible, true);
  assert.equal(p.data.preview.listing.id, "HE-L001");
  assert.equal(p.data.preview.applicant.name, "Tess Example");
  assert.equal(p.data.preview.draft.tenant_name, "Tess Example");
  assert.equal(p.data.preview.draft.rent, 1500);
  assert.deepEqual(p.data.source_versions, { listing_id: "HE-L001", listing_updated_at: T0, applicant_id: pick.applicant_id,
    applicant_updated_at: T0 });
  assert.deepEqual(snap(), before);
  const c = await commit(env, pick);
  assert.equal(c.status, 201, JSON.stringify(c.data));
  const l = row(env, "SELECT published, availability, updated_at FROM listings WHERE id = 'HE-L001'");
  assert.deepEqual({ ...l }, { published: 0, availability: "let_agreed", updated_at: T0 }, "the listing is not touched");
});

test("stale_let_agreed_409: a listing or applicant changed after the preview fails without writing", async () => {
  const { env, pick } = await setup();
  const p = await preview(env, pick);
  env.DB.raw.prepare("UPDATE listings SET updated_at = '2026-10-08T00:00:00.000Z' WHERE id = 'HE-L001'").run();
  const send = (sv, op) => req(env, "POST", "/admin/tenancy-origins/commit", { rental_id: pick.rental_id, source_versions: sv,
    tenancy_draft: DRAFT, operation_id: op });
  assert.equal((await send(p.data.source_versions, "op-000000002")).status, 409);
  const p2 = await preview(env, pick);
  env.DB.raw.prepare("UPDATE applicants SET updated_at = '2026-10-09T00:00:00.000Z' WHERE id = ?").run(pick.applicant_id);
  assert.equal((await send(p2.data.source_versions, "op-000000003")).status, 409);
  const p3 = await preview(env, pick);
  env.DB.raw.prepare("UPDATE listings SET availability = 'to_let' WHERE id = 'HE-L001'").run();
  assert.equal((await send(p3.data.source_versions, "op-000000004")).status, 409);
  // The preview's own expected versions answer 409 too.
  env.DB.raw.prepare("UPDATE listings SET availability = 'let_agreed' WHERE id = 'HE-L001'").run();
  assert.equal((await preview(env, { ...pick, expected_listing_at: T0 })).status, 409);
  assert.equal(count(env, "tenancies"), 0); assert.equal(count(env, "tenancy_origins"), 0);
  assert.equal(count(env, "rental_events"), 2, "only the landlord and property creation");
});

test("double_commit_one_tenancy_and_ref: the same operation_id commits once, in sequence or at once", async () => {
  const { env, pick } = await setup();
  const first = await commit(env, pick);
  assert.equal(first.status, 201, JSON.stringify(first.data));
  assert.equal(first.data.replayed, false);
  const again = await commit(env, pick);
  assert.equal(again.status, 200); assert.equal(again.data.replayed, true);
  assert.equal(again.data.tenancy.id, first.data.tenancy.id);
  assert.equal(count(env, "tenancies"), 1);
  assert.deepEqual(rows(env, "SELECT payment_ref FROM tenancies").map(r => r.payment_ref), [first.data.tenancy.payment_ref]);
  assert.match(first.data.tenancy.payment_ref, /^HE-T\d{4}$/);
  const o = row(env, "SELECT * FROM tenancy_origins");
  assert.deepEqual([o.tenancy_id, o.rental_id, o.listing_id, o.applicant_id, o.created_by],
    [first.data.tenancy.id, pick.rental_id, "HE-L001", pick.applicant_id, "admin@example.test"]);
  // The same id for another selection is refused.
  const other = applicant(env);
  const p = await preview(env, { ...pick, applicant_id: other });
  const reuse = await req(env, "POST", "/admin/tenancy-origins/commit", { rental_id: pick.rental_id,
    source_versions: p.data.source_versions, tenancy_draft: DRAFT, operation_id: "op-000000001" });
  assert.equal(reuse.status, 409);

  const b = await setup(on()), pb = await preview(b.env, b.pick);
  const body = { rental_id: b.rid, source_versions: pb.data.source_versions, tenancy_draft: DRAFT, operation_id: "op-concurrent" };
  const both = await Promise.all([req(b.env, "POST", "/admin/tenancy-origins/commit", body),
    req(b.env, "POST", "/admin/tenancy-origins/commit", body)]);
  assert.deepEqual(both.map(r => r.status).sort(), [200, 201]);
  assert.equal(both[0].data.tenancy.id, both[1].data.tenancy.id);
  assert.equal(count(b.env, "tenancies"), 1); assert.equal(count(b.env, "tenancy_origins"), 1);
});

test("active_tenancy_blocks_second", async () => {
  const { env, pick } = await setup();
  const manual = await req(env, "POST", `/admin/rentals/${pick.rental_id}/tenancies`, { ...DRAFT, tenant_name: "Other Person", collect_from: M0 });
  assert.equal(manual.status, 201);
  const p = await preview(env, pick);
  assert.equal(p.status, 200); assert.equal(p.data.eligible, false);
  assert.ok(p.data.reasons.some(r => /already has a tenancy/.test(r)));
  const c = await commit(env, pick);
  assert.equal(c.status, 409);
  assert.equal(count(env, "tenancies"), 1); assert.equal(count(env, "tenancy_origins"), 0);
});

test("manual_new_tenancy_unchanged: same tenancy, reference and charges as a commit, without an origin", async () => {
  const env = on(), a = await rental(env), b = await rental(env); listing(env); const aid = applicant(env);
  const draft = { ...DRAFT, deposit: 1500, opening_balance: 25000, collect_from: M0 };
  const manual = await req(env, "POST", `/admin/rentals/${a}/tenancies`, draft);
  assert.equal(manual.status, 201, JSON.stringify(manual.data));
  const c = await commit(env, { rental_id: b, listing_id: "HE-L001", applicant_id: aid }, { tenancy_draft: draft });
  assert.equal(c.status, 201, JSON.stringify(c.data));
  const shape = t => rows(env, `SELECT due_on, amount, kind FROM charges WHERE tenancy_id = ? ORDER BY due_on, kind`, t);
  assert.deepEqual(shape(c.data.tenancy.id), shape(manual.data.tenancy.id));
  const pick = t => { const { id, rental_id, payment_ref, created_at, updated_at, address, ...rest } = t; return rest; };
  assert.deepEqual(pick(c.data.tenancy), pick(manual.data.tenancy));
  assert.match(manual.data.tenancy.payment_ref, /^HE-T\d{4}$/);
  assert.deepEqual(rows(env, "SELECT tenancy_id FROM tenancy_origins").map(r => r.tenancy_id), [c.data.tenancy.id]);
  // The draft is checked like New tenancy.
  const bad = await commit(env, { rental_id: a, listing_id: "HE-L001", applicant_id: aid }, { operation_id: "op-000000005",
    tenancy_draft: { ...DRAFT, tenant_name: "" } });
  assert.equal(bad.status, 400); assert.ok(bad.data.fields.tenant_name);
});
