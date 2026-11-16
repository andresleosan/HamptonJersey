// ADM-21: the accounting download's protection and limits. Signed-in team members only, same origin, an attachment
// never cached; ranges and sizes checked, over the limits refused rather than cut short; formulas and bank text kept
// out. Fictitious data only.
import test from "node:test";
import assert from "node:assert/strict";
import { makeEnv, call, adminCookie, ORIGIN } from "./helpers.mjs";
import { handleApi } from "../../server/api.js";
import { parseCsv } from "../../server/rentals.js";
import { encodeAccountingCsv } from "../../server/rental-accounting-csv.js";
import { jerseyToday, plusDays } from "../../server/viewings.js";

const T = jerseyToday(), FROM = plusDays(T, -40);
const env = (flags = { ADM10_STATEMENTS_READY: "1", ADM09_ARREARS_READY: "1" }) => Object.assign(makeEnv({ skip: [46, 49] }), flags);
const req = async (e, path, cookie) => call(e, "GET", path, { cookie: cookie ?? await adminCookie() });
const url = (type, from = FROM, to = T) => `/admin/rental-accounting/export?type=${type}&from=${from}&to=${to}`;
const run = (e, sql, ...a) => e.DB.raw.prepare(sql).run(...a);
const ok = (r, status = 200) => { assert.equal(r.status, status, r.text); return r; };

async function tenancy(e) {
  const L = ok(await call(e, "POST", "/admin/landlords", { body: { name: "Sam Owner" }, cookie: await adminCookie() }), 201).data.landlord.id;
  const R = ok(await call(e, "POST", "/admin/rentals", { body: { landlord_id: L, address: "A House", parish: "St Helier", service: "full",
    fee_percent: 10 }, cookie: await adminCookie() }), 201).data.rental.id;
  return ok(await call(e, "POST", `/admin/rentals/${R}/tenancies`, { body: { tenant_name: "Tom Tenant", tenant_email: "tom@example.test",
    kind: "periodic", regime: "2025", rent: 1500, start_on: FROM, collect_from: FROM }, cookie: await adminCookie() }), 201).data.tenancy;
}
const pay = (e, tenancy_id, amount, description = null) => run(e, `INSERT INTO payments (tenancy_id, received_on, amount, kind,
  source, description, created_at) VALUES (?, ?, ?, 'rent', 'manual', ?, ?)`, tenancy_id, plusDays(T, -1), amount, description, T);
// A GET as a browser sends it, with its Sec-Fetch-Site and Origin headers.
async function browser(e, headers) {
  const h = new Headers({ cookie: await adminCookie(), ...headers });
  const res = await handleApi(new Request(`${ORIGIN}/api${url("payments")}`, { headers: h }), e, url("payments").split("?")[0].slice(1).split("/"));
  return { status: res.status, type: res.headers.get("content-type"), text: await res.text() };
}

test("only a signed-in team member on the same site gets the file, as an attachment never cached", async () => {
  const e = env(), t = await tenancy(e);
  pay(e, t.id, 150000);
  for (const cookie of ["", await adminCookie("someone@example.test")]) {
    const r = await req(e, url("payments"), cookie);
    assert.equal(r.status, 401);
    assert.doesNotMatch(r.text, /payment-|150000/);
  }
  for (const headers of [{ "sec-fetch-site": "cross-site" }, { "sec-fetch-site": "same-site" }, { origin: "https://evil.test" }]) {
    const r = await browser(e, headers);
    assert.equal(r.status, 403, JSON.stringify(headers));
    assert.doesNotMatch(r.text, /payment-|150000/);
  }
  assert.equal((await browser(e, { "sec-fetch-site": "same-origin", origin: ORIGIN })).status, 200);
  assert.equal((await browser(e, { "sec-fetch-site": "none" })).status, 200, "typed or opened from a bookmark");
  const r = ok(await req(e, url("payments")));
  assert.equal(r.headers.get("cache-control"), "no-store");
  assert.equal(r.headers.get("x-content-type-options"), "nosniff");
  assert.equal(r.headers.get("content-disposition"), `attachment; filename="hampton-payments-${FROM}-to-${T}.csv"`);
  assert.ok(!r.text.startsWith("﻿"), "UTF-8 without a byte-order mark");
  assert.ok(r.text.endsWith("\r\n"));
});

test("no bank, tenant or contact details leave: just the fixed columns", async () => {
  const e = env(), t = await tenancy(e);
  pay(e, t.id, 150000, "FASTER PAYMENT GB29NWBK60161331926819 TOM TENANT");
  pay(e, null, 2500, "Unknown sender 12345678");
  for (const type of ["charges", "payments"]) {
    const text = ok(await req(e, url(type))).text;
    assert.doesNotMatch(text, /GB29|FASTER|Unknown sender|Tom Tenant|tom@example|A House|Sam Owner/i);
  }
  const [, ...body] = parseCsv(ok(await req(e, url("payments"))).text);
  assert.deepEqual(body.map(r => [r[3], r[7], r[9]]), [[t.payment_ref, "150000", ""], ["", "2500", ""]], "unmatched has no tenancy");
});

test("text that a spreadsheet could run as a formula gets an apostrophe; quotes and commas stay intact", async () => {
  const e = env(), t = await tenancy(e);
  pay(e, t.id, 100);
  for (const ref of ["=HYPERLINK(\"http://x\")", "+1", "-1", "@SUM(A1)", "\tHE", "HE, \"T\"\r\n1"]) {
    run(e, "UPDATE tenancies SET payment_ref = ? WHERE id = ?", ref, t.id);
    const [, row] = parseCsv(ok(await req(e, url("payments"))).text);
    assert.equal(row[3], /^[=+\-@\t]/.test(ref) ? "'" + ref : ref);
  }
});

test("the same figures export the same bytes again", async () => {
  const e = env(), t = await tenancy(e);
  pay(e, t.id, 150000);
  for (const type of ["charges", "payments", "statements"]) {
    assert.equal(ok(await req(e, url(type))).text, ok(await req(e, url(type))).text);
  }
});

test("a type, a real range of up to 366 days ending by today, and statements only with ADM-10", async () => {
  const e = env();
  const fields = async path => { const r = await req(e, path); assert.equal(r.status, 400, r.text); return r.data.fields; };
  assert.deepEqual(Object.keys(await fields("/admin/rental-accounting/export")), ["type", "from", "to"]);
  assert.ok((await fields(url("bank"))).type);
  assert.ok((await fields(url("payments", "2026-02-30"))).from);
  assert.match((await fields(url("payments", FROM, plusDays(T, 1)))).to, /up to today/);
  assert.match((await fields(url("payments", T, FROM))).to, /on or after/);
  assert.match((await fields(url("payments", plusDays(T, -366), T))).to, /366 days/);
  ok(await req(e, url("payments", plusDays(T, -365), T)));
  const off = env({ ADM09_ARREARS_READY: "1" });
  assert.match((await call(off, "GET", url("statements"), { cookie: await adminCookie() })).data.fields.type, /not switched on/);
});

test("over 50,000 rows or 16 MB is refused, not cut short; an amount over £1m is refused too", async () => {
  const e = env();
  run(e, `WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 50001)
    INSERT INTO payments (tenancy_id, received_on, amount, kind, source, created_at) SELECT NULL, ?, 100, 'rent', 'manual', ? FROM n`, T, T);
  let r = await req(e, url("payments"));
  assert.equal(r.status, 413);
  assert.match(r.data.error, /over 50,000 rows/);
  run(e, "DELETE FROM payments WHERE id = 1");
  r = ok(await req(e, url("payments")));
  assert.equal(r.headers.get("x-export-rows"), "50000");

  const row = { schema_version: 1, record_type: "rent_payments", record_id: "x", tenancy_ref: "x".repeat(400), date: T, kind: "rent",
    currency: "GBP", amount_pence: 1, direction: "credit", related_id: null, revision: 1 };
  assert.throws(() => encodeAccountingCsv(Array(50000).fill(row)), RangeError);

  // A closed statement whose net is over £1,000,000 (written here directly): refused with a clear message, no file.
  const s = env();
  run(s, "INSERT INTO landlords (name, created_at, updated_at) VALUES ('Big Owner', ?, ?)", T, T);
  const month = plusDays(T.slice(0, 7) + "-01", -1).slice(0, 7);
  const snapshot = JSON.stringify({ landlord: { id: 1, name: "Big Owner" }, month, gst_percent: 0, rentals: [{ id: 1, address: "x",
    fee_percent: 0, rent_received: 100000001, fee: 0, repairs: [], other_received: 0 }],
    totals: { rent: 100000001, fee: 0, gst: null, repairs: 0, net: 100000001 } });
  run(s, `INSERT INTO statement_runs (landlord_id, month, revision, snapshot, source_digest, net_pence, closed_at, closed_by)
    VALUES (1, ?, 1, ?, ?, 100000001, ?, 'admin@example.test')`, month, snapshot, "0".repeat(64), T);
  r = await call(s, "GET", url("statements", `${month}-01`, T), { cookie: await adminCookie() });
  assert.equal(r.status, 422);
  assert.match(r.data.error, /over £1,000,000/);
});
