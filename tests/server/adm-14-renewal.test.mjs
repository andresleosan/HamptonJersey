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
  assert.deepEqual((await req(env, "GET", `/admin/tenancies/${id}`)).data.renewal, { end_on: END, landlord: null, tenant: null });
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

test("only a running fixed term takes an answer", async () => {
  const env = on(), periodic = await tenancy(env, { kind: "periodic", end_on: null }), ended = await tenancy(env);
  assert.equal((await req(env, "POST", `/admin/tenancies/${periodic}/renewal-answer`, ANSWER)).status, 409);
  assert.equal((await req(env, "POST", `/admin/tenancies/${ended}/end`, { ended_on: T })).status, 200);
  assert.equal((await req(env, "POST", `/admin/tenancies/${ended}/renewal-answer`, ANSWER)).status, 409);
});
