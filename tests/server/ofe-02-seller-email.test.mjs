// OFE-02: an open offer goes to its seller by email only as a team member approved it (this seller, this contact, this
// text, this offer as it is), once, through the app's approved queue (AUT-17), delivered by Hermes's carrier from
// Hampton's Gmail; and never while OFE02_SEND_READY is off. Synthetic data only.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { makeEnv, seedListing, call, adminCookie, T0 } from "./listing-client.mjs";
import { configure } from "./email-helpers.mjs";
import { prepareSummary, claimForHermes } from "../../server/email.js";
import { offerEmailPass } from "../../server/offer-emails.js";
import worker from "../../server/jobs.js";

const ADMIN = "admin@example.test", KEY = "hermes-mail-key-hermes-mail-key-0123456789";
const SELLER = "owner@seller.example.test", OTHER = "partner@seller.example.test";
const run = (env, sql, ...a) => env.DB.raw.prepare(sql).run(...a);
const row = (env, sql, ...a) => ({ ...env.DB.raw.prepare(sql).get(...a) });
const n = (env, sql, ...a) => env.DB.raw.prepare(sql).get(...a).n;
const req = async (env, method, path, body) => call(env, method, path, { body, cookie: await adminCookie() });
const ok = (r, status = 200) => { assert.equal(r.status, status, JSON.stringify(r.data)); return r.data; };
const door = (env, path, body) => call(env, "POST", `/hermes/mail/${path}`, { body, bearer: KEY, origin: null });

// on: OFE-02's own switch; mail: the Hermes transport of AUT-17 (on in production).
function world({ on = true, mail = true, schema } = {}) {
  const env = { ...makeEnv(schema), HERMES_KEY: "g".repeat(40), HERMES_MAIL_KEY: KEY, ...(mail && { HERMES_MAIL_READY: "1" }),
    ...(on && { OFE02_SEND_READY: "1" }) };
  configure(env, { summary: false, recipients: [] });
  // The carrier polled just now and the clock runs with Hermes on: the app's sender is running.
  const at = new Date().toISOString();
  run(env, "INSERT INTO app_settings VALUES ('email_worker', ?, ?, 'system')", JSON.stringify({ at, ready: false, hermes: true }), at);
  run(env, "INSERT INTO app_settings VALUES ('hermes_mail_seen', ?, ?, 'hermes')", JSON.stringify({ at }), at);
  seedListing(env, { id: "HE-R001", title: "Le Bernage" });
  seedListing(env, { id: "HE-R002", title: "La Rocque", location: "Grouville" });
  return env;
}
let people = 0;
async function buyer(env) {
  const i = ++people;
  return ok(await req(env, "POST", "/admin/applicants", { name: `Bea Buyer ${i}`, email: `buyer${i}@example.test`, source: "phone",
    operation: "buy", budget_max: 900000 }), 201).id;
}
const offerOn = async (env, listing_id = "HE-R001", amount = 750000, conditions = "Subject to survey") =>
  ok(await req(env, "POST", "/admin/offers", { listing_id, applicant_id: await buyer(env), amount, conditions }), 201).offer.id;
const owner = async (env, { kind = "individual", listing = "HE-R001", contacts = [{ name: "Sam Seller", email: SELLER, phones: [] },
  { name: "Pat Partner", email: OTHER, phones: [] }], name = "Sam Seller" } = {}) =>
  ok(await req(env, "POST", "/admin/advertisers", { name, kind, channels: [], source_ids: [], listing_ids: [listing], commission: "",
    photo_permission: "", contacts }), 201).advertiser.id;
const path = id => `/admin/offers/${id}/seller-email`;
const context = async (env, id) => ok(await req(env, "GET", path(id)));
const keyOf = (ctx, seller, email) => ctx.sellers.find(s => s.id === seller).contacts.find(c => c.email === email).key;
const save = (env, id, body) => req(env, "PUT", path(id), body);
const approve = (env, id, revision) => req(env, "POST", `${path(id)}/approve`, { revision });
// An offer prepared for the seller's own address and approved as it is: queued once.
async function queued(env, { approveIt = true } = {}) {
  const seller = await owner(env), id = await offerOn(env), ctx = await context(env, id);
  const email = ok(await save(env, id, { revision: 0, advertiser_id: seller, contact_key: keyOf(ctx, seller, SELLER) })).email;
  if (approveIt) ok(await approve(env, id, email.revision));
  return { id, seller, ctx };
}
const outbound = env => env.DB.raw.prepare("SELECT * FROM outbound WHERE template = 'offer_to_seller' ORDER BY id").all().map(r => ({ ...r }));
const mail = env => row(env, "SELECT * FROM offer_emails");
const nextEmail = async env => ok(await door(env, "outbound/next")).email;

test("switched off or before migration 0126: no route, nothing in Sales, and a queued email is never claimed", async () => {
  for (const [label, env] of [["off", world({ on: false })], ["before 0126", world({ schema: { through: 125 } })]]) {
    const id = await offerOn(env);
    assert.equal((await req(env, "GET", path(id))).status, 404, label);
    assert.equal((await save(env, id, { revision: 0, advertiser_id: 1, contact_key: "a".repeat(64) })).status, 404, label);
    assert.equal((await approve(env, id, 1)).status, 404, label);
    assert.ok(!ok(await req(env, "GET", "/admin/sales")).seller_email, label);
    // The shared claim still works for the other emails: the team summary is claimed as before.
    configure(env, { summary: true, recipients: ["team@example.test"] });
    await prepareSummary(env, new Date().toISOString().slice(0, 11) + "09:00:00.000Z");
    assert.equal((await claimForHermes(env, "0"))?.to, "team@example.test", label);
    await offerEmailPass(env);
  }
  // Queued while on, then switched off: never claimed; the clock (off) takes it out of the queue unsent.
  const env = world();
  const { id } = await queued(env);
  assert.equal(ok(await req(env, "GET", "/admin/sales")).seller_email, true);
  env.OFE02_SEND_READY = "0";
  assert.equal(await nextEmail(env), null);
  await offerEmailPass(env);
  assert.equal(outbound(env)[0].status, "cancelled");
  env.OFE02_SEND_READY = "1";
  const e = (await context(env, id)).email;
  assert.deepEqual([e.status, e.revision, e.approval], ["draft", 2, null]);
});

test("the seller and their contact are never shown publicly", async () => {
  const env = world();
  await queued(env);
  const pub = await call(env, "GET", "/listings");
  assert.equal(pub.status, 200);
  for (const secret of [SELLER, OTHER, "Sam Seller", "Pat Partner"]) assert.ok(!pub.text.includes(secret), secret);
  const listing = row(env, "SELECT * FROM listings WHERE id = 'HE-R001'");
  assert.ok(!JSON.stringify(listing).includes(SELLER));
});

test("only the listing's own owners can be chosen: an old sale's seller or an agency is not reused for another listing", async () => {
  const env = world();
  // An old sale on HE-R001, its seller noted on the sale file, and HE-R001's owner in the directory.
  const old = await offerOn(env, "HE-R001");
  const sale = ok(await req(env, "POST", `/admin/offers/${old}/accept`), 201).sale_id;
  run(env, "UPDATE sales SET seller_name = 'Old Seller', seller_email = 'old@seller.example.test' WHERE id = ?", sale);
  const first = await owner(env, { listing: "HE-R001" });
  await owner(env, { kind: "agency", listing: "HE-R002", name: "Some Agency", contacts: [{ name: "Desk", email: "desk@agency.example.test", phones: [] }] });
  const id = await offerOn(env, "HE-R002");
  const ctx = await context(env, id);
  assert.deepEqual(ctx.sellers, [], "neither HE-R001's owner, nor the agency, nor the old sale's seller");
  assert.ok(!JSON.stringify(ctx).includes("old@seller.example.test"));
  const other = (await context(env, (await offerOn(env, "HE-R001")))).sellers[0];
  const r = await save(env, id, { revision: 0, advertiser_id: first, contact_key: other.contacts[0].key });
  assert.equal(r.status, 400);
  assert.equal(n(env, "SELECT COUNT(*) n FROM offer_emails"), 0);
  // Its own owner, once linked, can be chosen; a contact of another owner cannot.
  const own = await owner(env, { listing: "HE-R002", name: "Rae Owner", contacts: [{ name: "Rae Owner", email: "rae@owner.example.test", phones: [] }] });
  assert.equal((await save(env, id, { revision: 0, advertiser_id: own, contact_key: other.contacts[0].key })).status, 400);
  const k = keyOf(await context(env, id), own, "rae@owner.example.test");
  ok(await save(env, id, { revision: 0, advertiser_id: own, contact_key: k }));
});

test("the proposed text names the offer and the property, and no buyer or other offer", async () => {
  const env = world();
  const seller = await owner(env);
  await offerOn(env, "HE-R001", 700000, "Cash buyer");
  const id = await offerOn(env, "HE-R001", 765000, "Subject to survey");
  const ctx = await context(env, id);
  for (const s of ["£765,000", "Le Bernage", "HE-R001", "Subject to survey", "Hampton Estates"]) assert.ok(ctx.proposed_text.includes(s), s);
  for (const s of ["Bea Buyer", "@example.test", "700,000", "Cash buyer"]) assert.ok(!ctx.proposed_text.includes(s), s);
  const e = ok(await save(env, id, { revision: 0, advertiser_id: seller, contact_key: keyOf(ctx, seller, SELLER) })).email;
  assert.equal(e.text, ctx.proposed_text);
  ok(await approve(env, id, 1));
  const [o] = outbound(env);
  assert.equal(o.text, ctx.proposed_text);
  assert.equal(o.recipient, SELLER);
  assert.match(o.subject, /Le Bernage/);
});

test("a withdrawn or rejected offer cannot be prepared or sent", async () => {
  const env = world();
  const seller = await owner(env), a = await offerOn(env);
  const ctx = await context(env, a), key = keyOf(ctx, seller, SELLER);
  ok(await req(env, "POST", `/admin/offers/${a}/withdraw`, {}));
  assert.equal((await save(env, a, { revision: 0, advertiser_id: seller, contact_key: key })).status, 409);
  const b = await offerOn(env);
  ok(await save(env, b, { revision: 0, advertiser_id: seller, contact_key: key }));
  ok(await req(env, "POST", `/admin/offers/${b}/reject`, {}));
  assert.equal((await approve(env, b, 1)).status, 409);
  assert.equal(outbound(env).length, 0);
});

test("a change to the offer, the contact or the text takes the approval away", async () => {
  const env = world();
  const { id, seller, ctx } = await queued(env);
  // The amount changes while the email waits: it is not claimed, and the clock takes it out unsent.
  ok(await req(env, "PUT", `/admin/offers/${id}`, { amount: 760000 }));
  assert.equal(await nextEmail(env), null);
  await offerEmailPass(env);
  let e = (await context(env, id)).email;
  assert.deepEqual([e.status, e.revision, e.approval], ["draft", 2, null]);
  assert.equal(outbound(env)[0].status, "cancelled");
  assert.ok(e.blocked, "prepared from the old amount");
  assert.equal((await approve(env, id, 2)).status, 409);
  // Prepared again and queued; then the contact is changed: a new revision nobody approved, its email taken back.
  ok(await save(env, id, { revision: 2, advertiser_id: seller, contact_key: keyOf(ctx, seller, SELLER) }));
  ok(await approve(env, id, 3));
  e = ok(await save(env, id, { revision: 3, advertiser_id: seller, contact_key: keyOf(ctx, seller, OTHER) })).email;
  assert.deepEqual([e.status, e.revision, e.approval], ["draft", 4, null]);
  assert.equal(outbound(env).at(-1).status, "cancelled");
  // The text alone changes: the same.
  e = ok(await save(env, id, { revision: 4, advertiser_id: seller, contact_key: keyOf(ctx, seller, OTHER), text: "Hello,\n\nAn offer.\n\nHampton Estates",
    offer_updated_at: (await context(env, id)).offer.updated_at })).email;
  assert.deepEqual([e.revision, e.approval, e.text], [5, null, "Hello,\n\nAn offer.\n\nHampton Estates"]);
  ok(await approve(env, id, 5));
  // The seller's directory entry changes after it was queued (another address): not claimed.
  run(env, "UPDATE advertisers SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+1 second')");
  assert.equal(await nextEmail(env), null);
  assert.equal(n(env, "SELECT COUNT(*) n FROM email_attempts"), 0);
});

test("pause, a suppressed address, a removed seller or the switch off: the email is not claimed", async () => {
  const env = world();
  await queued(env);
  const [o] = outbound(env);
  run(env, "INSERT INTO app_settings VALUES ('outbound', '{\"paused\":true}', ?, 'x')", T0);
  assert.equal(await nextEmail(env), null, "paused");
  run(env, "DELETE FROM app_settings WHERE key = 'outbound'");
  run(env, "INSERT INTO email_suppressions VALUES (?, ?, 'team')", o.recipient_hash, T0);
  assert.equal(await nextEmail(env), null, "suppressed");
  run(env, "DELETE FROM email_suppressions");
  env.OFE02_SEND_READY = "0";
  assert.equal(await nextEmail(env), null, "switched off");
  env.OFE02_SEND_READY = "1";
  assert.equal(n(env, "SELECT COUNT(*) n FROM email_attempts"), 0);
  assert.equal((await nextEmail(env)).to, SELLER, "all clear: claimed");
  // The seller's personal data removed from the directory (AGE-14, for good): not claimed.
  const gone = world();
  await queued(gone);
  run(gone, "UPDATE advertisers SET suppressed_at = ?", new Date().toISOString());
  assert.equal(await nextEmail(gone), null, "seller removed");
});

test("a retry or an unknown result never sends twice, and Gmail taking it never accepts the offer", async () => {
  const env = world();
  const { id } = await queued(env);
  ok(await approve(env, id, 1)); // the same click again
  assert.equal(outbound(env).length, 1);
  let email = await nextEmail(env);
  assert.equal(await nextEmail(env), null, "claimed once");
  ok(await door(env, `outbound/${email.ref}/result`, { token: email.token, outcome: "unknown" }));
  await offerEmailPass(env);
  let e = (await context(env, id)).email;
  assert.equal(e.status, "needs_review");
  assert.equal(await nextEmail(env), null, "unknown is never retried");
  assert.equal((await approve(env, id, 1)).status, 409);
  assert.equal((await req(env, "POST", `${path(id)}/outcome`, { revision: 0, sent: false })).status, 409, "wrong revision");
  // A person checked Gmail: it did not leave. A new revision, approved again, is a second email of its own.
  e = ok(await req(env, "POST", `${path(id)}/outcome`, { revision: 1, sent: false })).email;
  assert.deepEqual([e.status, e.revision, e.approval], ["draft", 2, null]);
  ok(await approve(env, id, 2));
  assert.equal(outbound(env).length, 2);
  email = await nextEmail(env);
  ok(await door(env, `outbound/${email.ref}/result`, { token: email.token, outcome: "sent", message_id: "m-1", thread_id: "t-1" }));
  ok(await door(env, `outbound/${email.ref}/result`, { token: email.token, outcome: "sent", message_id: "m-1", thread_id: "t-1" }));
  // The clock settles it (jobs.js, with its own switch).
  await worker.scheduled({ cron: "*/10 * * * *", scheduledTime: Date.now() }, { DB: env.DB, MEDIA: env.MEDIA, HERMES_MAIL_READY: "1",
    OFE02_SEND_READY: "1" }, { waitUntil() {} });
  e = (await context(env, id)).email;
  assert.equal(e.status, "sent");
  assert.ok(e.sent_at);
  assert.equal(row(env, "SELECT status FROM offers WHERE id = ?", id).status, "pending", "the offer stays open");
  assert.equal(n(env, "SELECT COUNT(*) n FROM sales"), 0);
  assert.equal(row(env, "SELECT gmail_thread_id FROM outbound WHERE ref = ?", email.ref).gmail_thread_id, "t-1");
  assert.ok(ok(await door(env, "threads")).threads.some(t => t.id === "t-1"), "the seller's reply is read in that thread");
  assert.equal(await nextEmail(env), null);
});

test("a wrong revision is refused with 409 and writes nothing", async () => {
  const env = world();
  const { id, seller, ctx } = await queued(env, { approveIt: false });
  const before = [n(env, "SELECT COUNT(*) n FROM events"), JSON.stringify(mail(env)), outbound(env).length];
  assert.equal((await save(env, id, { revision: 0, advertiser_id: seller, contact_key: keyOf(ctx, seller, OTHER) })).status, 409);
  assert.equal((await save(env, id, { revision: 7, advertiser_id: seller, contact_key: keyOf(ctx, seller, OTHER) })).status, 409);
  assert.equal((await approve(env, id, 2)).status, 409);
  assert.equal((await approve(env, id, 0)).status, 409);
  assert.deepEqual([n(env, "SELECT COUNT(*) n FROM events"), JSON.stringify(mail(env)), outbound(env).length], before);
});

test("migration 0126 only adds a table and its index", () => {
  const sql = readFileSync(new URL("../../migrations/0126_offer_emails.sql", import.meta.url), "utf8").replace(/--.*$/gm, "");
  assert.ok(sql.split(";").map(s => s.trim()).filter(Boolean).every(s => /^CREATE (TABLE|INDEX) offer_emails/.test(s)));
});

test("the website and the clock carry the same OFE02_SEND_READY, off", () => {
  const flag = file => readFileSync(new URL(`../../${file}`, import.meta.url), "utf8").match(/^OFE02_SEND_READY = "(.*)"$/m)?.[1];
  assert.equal(flag("wrangler.toml"), "0");
  assert.equal(flag("jobs/wrangler.toml"), "0");
});

// Review 25-nov: a text written from an offer as it no longer is never goes out with the new offer's record. A text is
// saved only with the offer version it was written from; the panel then gets the proposed text from the offer as it is.
test("a text written before the offer changed is refused, and the proposed text follows the offer as it is now", async () => {
  const env = world(), seller = await owner(env), id = await offerOn(env), ctx = await context(env, id);
  const old = ctx.proposed_text, seen = ctx.offer.updated_at;
  assert.ok(old.includes("750,000"));
  ok(await save(env, id, { revision: 0, advertiser_id: seller, contact_key: keyOf(ctx, seller, SELLER), text: old, offer_updated_at: seen }));
  ok(await req(env, "PUT", `/admin/offers/${id}`, { amount: 800000 }));
  const edited = old + "\n";
  for (const body of [{ text: edited, offer_updated_at: seen }, { text: edited }])
    assert.equal((await save(env, id, { revision: 1, advertiser_id: seller, contact_key: keyOf(ctx, seller, SELLER), ...body })).status, 409);
  const now = await context(env, id);
  assert.ok(now.proposed_text.includes("800,000") && now.email.stale);
  const e = ok(await save(env, id, { revision: 1, advertiser_id: seller, contact_key: keyOf(ctx, seller, SELLER), text: now.proposed_text,
    offer_updated_at: now.offer.updated_at })).email;
  assert.ok(e.text.includes("800,000") && !e.blocked && !e.stale);
});
