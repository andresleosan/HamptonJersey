// ADM-10: a closed statement (the latest revision) goes to its landlord by email only as a team member approved exactly
// that revision, once, through the app's approved queue (AUT-17) that Hermes's carrier sends; and never while
// ADM10_STATEMENT_EMAIL_READY is off. Gmail taking it marks sent_on. Synthetic data only.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { makeEnv, call, adminCookie } from "./helpers.mjs";
import { configure } from "./email-helpers.mjs";
import { jerseyToday } from "../../server/viewings.js";
import { addMonths } from "../../server/rentals.js";
import { claimForHermes, settleForHermes } from "../../server/email.js";
import { statementEmailPass, statementText } from "../../server/statement-emails.js";

const T = jerseyToday(), PREV = addMonths(`${T.slice(0, 7)}-01`, -1).slice(0, 7);
const ADMIN = "admin@example.test", OWNER = "owner@landlord.example.test";
const run = (e, sql, ...a) => e.DB.raw.prepare(sql).run(...a);
const rows = (e, sql, ...a) => e.DB.raw.prepare(sql).all(...a).map(r => ({ ...r }));
const req = async (e, method, path, body) => call(e, method, path, { body, cookie: await adminCookie() });
const ok = (r, status = 200) => { assert.equal(r.status, status, JSON.stringify(r.data)); return r.data; };

// on: this task's switch; mail: Hermes's carrier (AUT-17), seen just now, with the clock running for it.
function world({ on = true, statements = true, mail = true } = {}) {
  const e = Object.assign(makeEnv({ skip: [46, 49] }), { ...(statements && { ADM10_STATEMENTS_READY: "1" }),
    ...(on && { ADM10_STATEMENT_EMAIL_READY: "1" }), ...(mail && { HERMES_MAIL_READY: "1" }) });
  configure(e, { summary: false, recipients: [] });
  const at = new Date().toISOString();
  run(e, "INSERT INTO app_settings VALUES ('email_worker', ?, ?, 'system')", JSON.stringify({ at, ready: false, hermes: true }), at);
  run(e, "INSERT INTO app_settings VALUES ('hermes_mail_seen', ?, ?, 'hermes')", JSON.stringify({ at }), at);
  return e;
}
// A landlord (with an email unless told) with one full-management property, its rent received last month, and the month closed.
async function closed(e, { email = OWNER } = {}) {
  const L = ok(await req(e, "POST", "/admin/landlords", { name: "Sam Owner", ...(email && { email }) }), 201).landlord.id;
  const R = ok(await req(e, "POST", "/admin/rentals", { landlord_id: L, address: "A House", parish: "St Helier", service: "full", fee_percent: 10 }), 201).rental.id;
  const t = ok(await req(e, "POST", `/admin/rentals/${R}/tenancies`, { tenant_name: "Tom Tenant", tenant_email: "tom@tenant.example.test", kind: "periodic",
    regime: "2025", rent: 1500, start_on: `${PREV}-01`, collect_from: `${PREV}-01` }), 201).tenancy;
  run(e, "UPDATE rentals SET created_at = ? WHERE id = ?", `${PREV}-01T00:00:00.000Z`, R);
  run(e, "INSERT INTO payments (tenancy_id, received_on, amount, kind, source, created_at) VALUES (?, ?, 150000, 'rent', 'manual', ?)", t.id, `${PREV}-05`, T);
  return { L, R, t, run: await closeIt(e, L) };
}
const closeIt = async (e, L) => ok(await req(e, "POST", "/admin/statements", { landlord: L, month: PREV,
  digest: ok(await req(e, "GET", `/admin/statements?landlord=${L}&month=${PREV}`)).digest }), 201).run;
const path = id => `/admin/statement-runs/${id}/email`;
const context = async (e, id) => ok(await req(e, "GET", path(id)));
const approve = (e, id, revision, digest) => req(e, "POST", `${path(id)}/approve`, { revision, digest });
const approveCtx = async (e, id) => { const c = await context(e, id); return approve(e, id, c.revision, c.digest); };
const outbound = e => rows(e, "SELECT * FROM outbound WHERE template = 'owner_statement' ORDER BY id");
const sentOn = (e, id) => rows(e, "SELECT sent_on, sent_by FROM statement_runs WHERE id = ?", id)[0];
// The carrier takes the one claimable email and says Gmail accepted it (or what else happened).
async function carrier(e, outcome = "sent") {
  const c = await claimForHermes(e, "0");
  if (c) await settleForHermes(e, c.ref, c.token, outcome, outcome === "sent" ? "msg-1" : undefined);
  return c;
}

test("switched off, without the statements switch or before the carrier: no route and nothing is claimed", async () => {
  for (const [label, e] of [["off", world({ on: false })], ["no statements", world({ statements: false })]]) {
    assert.equal((await req(e, "GET", path(1))).status, 404, label);
    assert.equal((await approve(e, 1, 1, "x")).status, 404, label);
    assert.equal((await req(e, "POST", `${path(1)}/outcome`, { sent: true })).status, 404, label);
    await statementEmailPass(e);
  }
  // Queued while on, then switched off: never claimed, and the clock takes it out of the queue.
  const e = world(), { run: r } = await closed(e);
  ok(await approveCtx(e, r.id));
  e.ADM10_STATEMENT_EMAIL_READY = "0";
  assert.equal(await carrier(e), null);
  await statementEmailPass(e);
  assert.equal(outbound(e)[0].status, "cancelled");
  assert.equal(sentOn(e, r.id).sent_on, null);
});

test("both wrangler files carry the switch, off", () => {
  for (const f of ["wrangler.toml", "jobs/wrangler.toml"])
    assert.match(readFileSync(new URL(`../../${f}`, import.meta.url), "utf8"), /^ADM10_STATEMENT_EMAIL_READY = "0"$/m, f);
});

test("the proposed text carries the statement's figures and nothing else", async () => {
  const e = world(), { run: r } = await closed(e);
  const c = await context(e, r.id);
  assert.equal(ok(await req(e, "GET", `/admin/statements?landlord=${r.landlord_id}&month=${PREV}`)).email_ready, true);
  const off = world({ on: false }), o = await closed(off);
  assert.equal(ok(await req(off, "GET", `/admin/statements?landlord=${o.L}&month=${PREV}`)).email_ready, undefined, "off: no button");
  assert.deepEqual([c.blocked, c.recipient.email, c.revision, c.digest], [null, OWNER, 1, r.source_digest]);
  for (const s of ["Sam Owner", "A House", "£1,500.00", "£150.00", "£1,350.00", "Hampton Estates"]) assert.ok(c.text.includes(s), s);
  for (const s of ["Tom Tenant", "tenant.example.test", OWNER]) assert.ok(!c.text.includes(s), s);
  assert.match(c.subject, /statement/i);
});

test("a person approves one revision: it is queued once, to the landlord's address, with the text shown", async () => {
  const e = world(), { run: r } = await closed(e);
  const c = await context(e, r.id);
  assert.equal(outbound(e).length, 0, "nothing is queued by looking");
  ok(await approve(e, r.id, c.revision, c.digest));
  const [o] = outbound(e);
  assert.deepEqual([o.recipient, o.text, o.status, o.approved_by, o.version, o.entity_id], [OWNER, c.text, "queued", ADMIN, 1, String(r.id)]);
  assert.equal((await approve(e, r.id, c.revision, c.digest)).status, 409, "the same click again");
  assert.equal(outbound(e).length, 1);
  assert.equal((await context(e, r.id)).email.status, "queued");
});

test("a revision or figures that changed after preparing are refused (409), and an older revision is never sent", async () => {
  const e = world(), { L, t, run: r } = await closed(e);
  const c = await context(e, r.id);
  run(e, "INSERT INTO payments (tenancy_id, received_on, amount, kind, source, created_at) VALUES (?, ?, 10000, 'rent', 'manual', ?)", t.id, `${PREV}-20`, T);
  const r2 = await closeIt(e, L);
  assert.equal((await approve(e, r.id, c.revision, c.digest)).status, 409);
  assert.equal((await approve(e, r2.id, 1, c.digest)).status, 409, "a revision number that is not this one");
  assert.equal((await approve(e, r2.id, r2.revision, c.digest)).status, 409, "figures that are not this revision's");
  assert.match((await context(e, r.id)).blocked, /newer revision/i);
  assert.equal(outbound(e).length, 0);
  ok(await approveCtx(e, r2.id));
  assert.equal(outbound(e)[0].version, 2);
});

test("blocked: no email on the landlord, an invalid one, an archived landlord, a run already marked sent", async () => {
  const e = world(), { L, run: r } = await closed(e, { email: null });
  assert.match((await context(e, r.id)).blocked, /email/i);
  assert.equal((await approveCtx(e, r.id)).status, 409);
  run(e, "UPDATE landlords SET email = 'not an address' WHERE id = ?", L);
  assert.match((await context(e, r.id)).blocked, /email/i);
  run(e, "UPDATE landlords SET email = ? WHERE id = ?", OWNER, L);
  assert.equal((await context(e, r.id)).blocked, null);
  ok(await req(e, "PUT", `/admin/statement-runs/${r.id}/sent`, {}));
  assert.match((await context(e, r.id)).blocked, /already/i);
  assert.equal((await approveCtx(e, r.id)).status, 409);
  const f = world(), g = await closed(f);
  run(f, "UPDATE landlords SET archived_at = ? WHERE id = ?", T, g.L);
  assert.match((await context(f, g.run.id)).blocked, /archived/i);
  assert.equal((await req(f, "GET", path(999))).status, 404);
  assert.equal(outbound(e).length + outbound(f).length, 0);
});

test("the email service stopped, paused, or the address suppressed: refused, nothing queued", async () => {
  const e = world(), { run: r } = await closed(e);
  run(e, "INSERT INTO app_settings VALUES ('outbound', '{\"paused\":1}', ?, 'x')", T);
  assert.equal((await approveCtx(e, r.id)).status, 409);
  run(e, "DELETE FROM app_settings WHERE key = 'outbound'");
  const { sha256 } = await import("../../server/http.js");
  run(e, "INSERT INTO email_suppressions VALUES (?, ?, 'team')", await sha256(OWNER), T);
  assert.equal((await approveCtx(e, r.id)).status, 409);
  assert.equal(outbound(e).length, 0);
});

test("Gmail taking it marks the statement sent by whoever approved it; the hand mark stays for the others", async () => {
  const e = world(), { run: r } = await closed(e);
  ok(await approveCtx(e, r.id));
  const c = await carrier(e);
  assert.equal(c.to, OWNER);
  assert.equal(sentOn(e, r.id).sent_on, null, "not before the clock writes it back");
  await statementEmailPass(e);
  assert.deepEqual(sentOn(e, r.id), { sent_on: T, sent_by: ADMIN });
  await statementEmailPass(e);
  assert.equal(sentOn(e, r.id).sent_on, T);
  assert.equal(outbound(e).length, 1);
  assert.match((await context(e, r.id)).blocked, /already/i);
  assert.equal(await carrier(e), null);
});

test("it is not claimed once the revision is superseded, the address changed or the statement marked sent", async () => {
  for (const [label, change] of [
    ["superseded", (e, x) => { run(e, "INSERT INTO payments (tenancy_id, received_on, amount, kind, source, created_at) VALUES (?, ?, 1000, 'rent', 'manual', ?)", x.t.id, `${PREV}-21`, T); return closeIt(e, x.L); }],
    ["address changed", (e, x) => run(e, "UPDATE landlords SET email = 'other@landlord.example.test' WHERE id = ?", x.L)],
    ["marked by hand", (e, x) => req(e, "PUT", `/admin/statement-runs/${x.run.id}/sent`, {})],
  ]) {
    const e = world(), x = await closed(e);
    ok(await approveCtx(e, x.run.id));
    await change(e, x);
    assert.equal(await carrier(e), null, label);
    await statementEmailPass(e);
    assert.equal(outbound(e)[0].status, "cancelled", label);
  }
});

test("an unknown result is never sent again by the app: a person says whether it left, for the email they saw", async () => {
  const e = world(), { run: r } = await closed(e);
  ok(await approveCtx(e, r.id));
  await carrier(e, "unknown");
  await statementEmailPass(e);
  assert.equal(sentOn(e, r.id).sent_on, null);
  const first = (await context(e, r.id)).email;
  assert.equal(first.status, "unknown");
  assert.equal((await approveCtx(e, r.id)).status, 409, "no second email while this one is unknown");
  assert.equal((await req(e, "POST", `${path(r.id)}/outcome`, { sent: "yes", ref: first.ref })).status, 400);
  assert.equal((await req(e, "POST", `${path(r.id)}/outcome`, { sent: false })).status, 400, "the email seen is named");
  assert.equal((await req(e, "POST", `${path(r.id)}/outcome`, { sent: false, ref: "other" })).status, 409);
  ok(await req(e, "POST", `${path(r.id)}/outcome`, { sent: false, ref: first.ref }));
  assert.equal(outbound(e)[0].status, "cancelled");
  assert.equal((await req(e, "POST", `${path(r.id)}/outcome`, { sent: false, ref: first.ref })).status, 409);
  ok(await approveCtx(e, r.id));
  assert.equal(outbound(e).length, 2);
  await carrier(e, "unknown");
  const second = (await context(e, r.id)).email;
  assert.equal((await req(e, "POST", `${path(r.id)}/outcome`, { sent: true, ref: first.ref })).status, 409, "a stale page decides nothing");
  ok(await req(e, "POST", `${path(r.id)}/outcome`, { sent: true, ref: second.ref }));
  assert.deepEqual(sentOn(e, r.id), { sent_on: T, sent_by: ADMIN });
});

test("a claim that only ran out of time cannot be called not sent for an hour, so a late Gmail answer is not lost", async () => {
  const e = world(), { run: r } = await closed(e);
  ok(await approveCtx(e, r.id));
  await carrier(e, "unknown");
  const { ref } = (await context(e, r.id)).email;
  e.DB.raw.prepare("UPDATE outbound SET error_code = 'CLAIM_EXPIRED', claimed_at = ? WHERE ref = ?").run(new Date().toISOString(), ref);
  assert.equal((await req(e, "POST", `${path(r.id)}/outcome`, { sent: false, ref })).status, 409);
  e.DB.raw.prepare("UPDATE outbound SET claimed_at = ? WHERE ref = ?").run(new Date(Date.now() - 2 * 3600e3).toISOString(), ref);
  ok(await req(e, "POST", `${path(r.id)}/outcome`, { sent: false, ref }));
});

test("the text never shows a written-off or other line that is not positive, as the panel does", () => {
  const s = { month: "2026-10", landlord: { name: "Sam Owner" }, totals: { rent: 100, fee: 10, gst: null, repairs: 0, net: 90 },
    rentals: [{ address: "A House", rent_received: 100, fee_percent: 10, fee: 10, repairs: [], other_received: 0, written_off: -500 }] };
  const t = statementText(s, 1);
  assert.ok(!t.includes("written off") && !t.includes("Other money"), t);
});

test("a refused email goes back to a person: the statement is not marked and a new approval is allowed", async () => {
  const e = world(), { run: r } = await closed(e);
  ok(await approveCtx(e, r.id));
  await carrier(e, "failed");
  await statementEmailPass(e);
  assert.equal(sentOn(e, r.id).sent_on, null);
  assert.equal((await context(e, r.id)).email.status, "failed");
  ok(await approveCtx(e, r.id));
  assert.equal(outbound(e).length, 2);
});
