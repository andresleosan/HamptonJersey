import test from "node:test";
import assert from "node:assert/strict";
import { makeEnv, call, adminCookie } from "./helpers.mjs";
import { jerseyToday, plusDays } from "../../server/viewings.js";
import { addMonths } from "../../server/rentals.js";

// ADM-14 behind ADM14_RENEWAL_READY (no migration): the landlord's and the tenant's answer to a fixed term's renewal,
// recorded by hand with its date and where it is recorded, kept as a rental event for the term's end date; and a rent
// agreed at renewal goes through ADM-15's review like Change rent. Nothing is sent and the clock is not touched.
const T = jerseyToday(), M0 = `${T.slice(0, 7)}-01`, END = plusDays(T, 60);
const base = () => ({ ...makeEnv(), ADM20_TENANCY_LAW_READY: "1", ADM17_LEGAL_TERMS_READY: "1", ADM15_RENT_REVIEW_READY: "1" });
const on = () => ({ ...base(), ADM14_RENEWAL_READY: "1" });
const req = async (env, method, path, body) => call(env, method, path, { body, cookie: await adminCookie() });
const rows = (env, sql, ...a) => env.DB.raw.prepare(sql).all(...a);
const renewed = env => rows(env, "SELECT data FROM rental_events WHERE type = 'tenancy.renewed' ORDER BY id").map(e => JSON.parse(e.data));
async function tenancy(env, over = {}) {
  const l = await req(env, "POST", "/admin/landlords", { name: "Synthetic owner" });
  const r = await req(env, "POST", "/admin/rentals", { landlord_id: l.data.landlord.id, address: "1 Synthetic Row", parish: "St Helier",
    service: "let_only" });
  const t = await req(env, "POST", `/admin/rentals/${r.data.rental.id}/tenancies`, { tenant_name: "Synthetic tenant", kind: "fixed",
    rent: 1000, start_on: addMonths(M0, -10), end_on: END, agreement_on: "2026-05-01", law_scope: "yes", ...over });
  assert.equal(t.status, 201, JSON.stringify(t.data));
  return t.data.tenancy.id;
}
const ANSWER = { party: "landlord", answer: "rent", rent: 1050, answered_on: T, source: "Email from the landlord" };

test("switch off: no answer route, no renewal on the tenancy, and Renew keeps what it recorded before", async () => {
  const env = base(), id = await tenancy(env);
  assert.equal((await req(env, "POST", `/admin/tenancies/${id}/renewal-answer`, ANSWER)).status, 404);
  assert.equal("renewal" in (await req(env, "GET", `/admin/tenancies/${id}`)).data, false);
  const r = await req(env, "POST", `/admin/tenancies/${id}/renew`, { kind: "periodic", rent: 1050, effective_on: addMonths(T, 2) });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal("review" in renewed(env)[0], false);
});

test("an answer needs who, what, when (not after today) and where it is recorded; a new rent only from the landlord", async () => {
  const env = on(), id = await tenancy(env), post = body => req(env, "POST", `/admin/tenancies/${id}/renewal-answer`, body);
  const errs = async body => (await post(body)).data.fields;
  assert.deepEqual(Object.keys(await errs({})).sort(), ["answer", "answered_on", "party", "source"]);
  assert.ok((await errs({ ...ANSWER, answered_on: plusDays(T, 1) })).answered_on);
  assert.ok((await errs({ ...ANSWER, rent: null })).rent);
  assert.ok((await errs({ ...ANSWER, party: "tenant" })).answer, "a tenant does not set the rent");
  assert.ok((await errs({ ...ANSWER, source: "x".repeat(201) })).source);
  assert.equal(rows(env, "SELECT 1 FROM rental_events WHERE type = 'renewal.answered'").length, 0);
});

test("the answers of the term being renewed show on the tenancy, the latest of each; a renewal starts the next term blank", async () => {
  const env = on(), id = await tenancy(env), post = body => req(env, "POST", `/admin/tenancies/${id}/renewal-answer`, body);
  assert.deepEqual((await req(env, "GET", `/admin/tenancies/${id}`)).data.renewal, { end_on: END, landlord: null, tenant: null,
    origin: null, draft: null });
  assert.equal((await post({ ...ANSWER, answer: "end", rent: 999 })).status, 200);
  const r = await post({ ...ANSWER, source: "  Email from the landlord, 2 Nov  " });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  await post({ party: "tenant", answer: "renew", answered_on: T, source: "Phone call" });
  const { renewal } = (await req(env, "GET", `/admin/tenancies/${id}`)).data;
  assert.deepEqual({ ...renewal.landlord, at: undefined, actor: undefined }, { party: "landlord", answer: "rent", rent: 1050, answered_on: T,
    source: "Email from the landlord, 2 Nov", end_on: END, at: undefined, actor: undefined });
  assert.deepEqual([renewal.tenant.answer, renewal.tenant.rent], ["renew", undefined]);
  // Only events of the rental's history: the Inbox's bridge and the clock read nothing new.
  assert.equal(rows(env, "SELECT 1 FROM events WHERE type = 'renewal.answered'").length, 0);
  // Renewed at the agreed rent: ADM-15's review is kept with the change, and the next term has no answer yet.
  const done = await req(env, "POST", `/admin/tenancies/${id}/renew`, { kind: "periodic", rent: 1050, effective_on: addMonths(T, 2) });
  assert.equal(done.status, 200, JSON.stringify(done.data));
  assert.deepEqual(Object.keys(renewed(env)[0].review), ["cover", "status", "rpi", "max_rent", "earliest_on"]);
  assert.equal("renewal" in done.data, false, "a periodic tenancy has no renewal");
});

// Second part: when the tenant leaves (or the landlord does not renew), a draft of the listing the tenancy came from
// (ADM-06's tenancy_origins), unpublished, to let from the end date, with the same photos' rows (no file copied).
const one = (env, sql, ...a) => env.DB.raw.prepare(sql).get(...a);
async function fromListing(env) {
  const l = await req(env, "POST", "/admin/listings", { title: "Synthetic flat to let", use: "residential", operation: "rent",
    availability: "to_let", country: "Jersey", rent: 1000, rent_period: "month", currency: "GBP", bedrooms: 2, summary: "Bright synthetic flat" });
  assert.equal(l.status, 201, JSON.stringify(l.data));
  const src = l.data.id, add = (id, kind) => env.DB.raw.prepare(`INSERT INTO media (id, listing_id, r2_key, thumb_key,
    origin, kind, public, position, created_at) VALUES (?, ?, ?, ?, 'upload', ?, 1, 0, ?)`).run(id, src, `uploads/${id}.jpg`,
    `thumbs/uploads/${id}.jpg`, kind, T);
  add("Ua1", "photo"); add("Ua2", "floorplan"); add("Ua3", "document");
  for (const k of ["Ua1", "Ua2", "Ua3"]) await env.MEDIA.put(`uploads/${k}.jpg`, "x");
  env.DB.raw.prepare("UPDATE listings SET cover_media_id = 'Ua1' WHERE id = ?").run(src);
  const id = await tenancy(env);
  env.DB.raw.prepare(`INSERT INTO tenancy_origins (tenancy_id, operation_id, rental_id, listing_id, applicant_id, listing_updated_at,
    applicant_updated_at, created_at, created_by) SELECT id, 'synthetic-op-' || id, rental_id, ?, 1, ?, ?, ?, 'admin@example.test'
    FROM tenancies WHERE id = ?`).run(src, T, T, T, id);
  return { src, id };
}
const draftOf = (env, id) => req(env, "POST", `/admin/tenancies/${id}/listing-draft`);

test("listing draft: only after an answer that the term ends, from the tenancy's origin listing, once", async () => {
  const env = { ...on(), ADM06_TENANCY_ORIGIN_READY: "1" }, { src, id } = await fromListing(env);
  assert.equal((await draftOf(env, id)).status, 409, "nobody answered that it ends");
  await req(env, "POST", `/admin/tenancies/${id}/renewal-answer`, { party: "tenant", answer: "end", answered_on: T, source: "Tenant's email" });
  assert.equal((await req(env, "GET", `/admin/tenancies/${id}`)).data.renewal.origin, src);
  const made = await draftOf(env, id);
  assert.equal(made.status, 201, JSON.stringify(made.data));
  const draft = made.data.id, l = one(env, "SELECT * FROM listings WHERE id = ?", draft);
  assert.notEqual(draft, src);
  assert.deepEqual([l.title, l.operation, l.availability, l.available_on, l.published, l.rent, l.bedrooms, l.summary],
    ["Synthetic flat to let", "rent", "to_let", END, 0, 1000, 2, "Bright synthetic flat"]);
  // The photos' rows point at the same files; documents stay with the original; the cover follows.
  const media = rows(env, "SELECT id, r2_key, kind FROM media WHERE listing_id = ? ORDER BY kind", draft);
  assert.deepEqual(media.map(m => [m.kind, m.r2_key]), [["floorplan", "uploads/Ua2.jpg"], ["photo", "uploads/Ua1.jpg"]]);
  assert.equal(l.cover_media_id, media.find(m => m.kind === "photo").id);
  // A second click opens the same draft, and the tenancy says which.
  const again = await draftOf(env, id);
  assert.deepEqual([again.status, again.data.id], [200, draft]);
  assert.equal((await req(env, "GET", `/admin/tenancies/${id}`)).data.renewal.draft, draft);
  assert.equal(rows(env, "SELECT 1 FROM listings").length, 2);
  // Deleting the draft keeps the original's files; a new click then makes a new draft.
  const { updated_at } = one(env, "SELECT updated_at FROM listings WHERE id = ?", draft);
  assert.equal((await req(env, "POST", `/admin/listings/${draft}/archive`, { updated_at })).status, 200);
  const gone = await req(env, "DELETE", `/admin/listings/${draft}`, { confirm: draft });
  assert.equal(gone.status, 200, JSON.stringify(gone.data));
  assert.ok(env.MEDIA.store.has("uploads/Ua1.jpg") && env.MEDIA.store.has("uploads/Ua2.jpg"));
  assert.equal((await req(env, "GET", `/admin/tenancies/${id}`)).data.renewal.draft, null);
  const next = await draftOf(env, id);
  assert.equal(next.status, 201);
  assert.notEqual(next.data.id, draft);
  // A photo removed from the new draft leaves the original's file too.
  const [photo] = rows(env, "SELECT id FROM media WHERE listing_id = ? AND kind = 'photo'", next.data.id);
  assert.equal((await req(env, "DELETE", `/admin/media/${photo.id}`)).status, 200);
  assert.ok(env.MEDIA.store.has("uploads/Ua1.jpg"));
});

test("listing draft: a tenancy entered by hand has no listing to copy; switch off, no route", async () => {
  const env = { ...on(), ADM06_TENANCY_ORIGIN_READY: "1" }, id = await tenancy(env);
  await req(env, "POST", `/admin/tenancies/${id}/renewal-answer`, { ...ANSWER, answer: "end" });
  assert.deepEqual([(await req(env, "GET", `/admin/tenancies/${id}`)).data.renewal.origin, (await draftOf(env, id)).status], [null, 409]);
  const off = base(), t = await tenancy(off);
  assert.equal((await draftOf(off, t)).status, 404);
});

test("only a running fixed term takes an answer", async () => {
  const env = on(), periodic = await tenancy(env, { kind: "periodic", end_on: null }), ended = await tenancy(env);
  assert.equal((await req(env, "POST", `/admin/tenancies/${periodic}/renewal-answer`, ANSWER)).status, 409);
  assert.equal((await req(env, "POST", `/admin/tenancies/${ended}/end`, { ended_on: T })).status, 200);
  assert.equal((await req(env, "POST", `/admin/tenancies/${ended}/renewal-answer`, ANSWER)).status, 409);
});
