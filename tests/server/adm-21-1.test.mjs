// ADM-21: the accounting export's figures. Charges with ADM-09's write-offs and reversals, payments received, and
// ADM-10's closed statements (latest revision, from its frozen snapshot) as separate files that add up to what the
// panel shows. Fictitious data only. Production has neither 0046 nor 0049, so both are left out here.
import test from "node:test";
import assert from "node:assert/strict";
import { makeEnv, call, adminCookie } from "./helpers.mjs";
import { parseCsv } from "../../server/rentals.js";
import { jerseyToday, plusDays } from "../../server/viewings.js";
import { addMonths } from "../../server/rentals.js";

const T = jerseyToday(), THIS = T.slice(0, 7), PREV = addMonths(`${THIS}-01`, -1).slice(0, 7);
const PREV_END = plusDays(`${THIS}-01`, -1), FROM = `${PREV}-01`;
const ON = { ADM10_STATEMENTS_READY: "1", ADM09_ARREARS_READY: "1" };
const env = (flags = ON) => Object.assign(makeEnv({ skip: [46, 49] }), flags);
const req = async (e, method, path, body) => call(e, method, path, { body, cookie: await adminCookie() });
const run = (e, sql, ...a) => e.DB.raw.prepare(sql).run(...a);
const rows = (e, sql, ...a) => e.DB.raw.prepare(sql).all(...a).map(r => ({ ...r }));
const ok = (r, status = 200) => { assert.equal(r.status, status, r.text); return r.data; };
const COLUMNS = ["schema_version", "record_type", "record_id", "tenancy_ref", "date", "kind", "currency", "amount_pence",
  "direction", "related_id", "revision"];

// The export as objects, after checking it is a CSV attachment with the fixed header.
async function exportRows(e, type, from = FROM, to = T) {
  const r = await req(e, "GET", `/admin/rental-accounting/export?type=${type}&from=${from}&to=${to}`);
  assert.equal(r.status, 200, r.text);
  assert.equal(r.headers.get("content-type"), "text/csv; charset=utf-8");
  const [head, ...body] = parseCsv(r.text);
  assert.deepEqual(head, COLUMNS);
  assert.equal(r.headers.get("x-export-rows"), String(body.length));
  return { text: r.text, rows: body.map(v => Object.fromEntries(COLUMNS.map((k, i) => [k, v[i]]))) };
}
const signed = x => (x.direction === "debit" ? 1 : -1) * Number(x.amount_pence);

// A landlord with one full-management property (10% fee), its tenancy from the start of last month.
async function setup(e, name = "Sam Owner", address = "A House") {
  const L = ok(await req(e, "POST", "/admin/landlords", { name }), 201).landlord.id;
  const R = ok(await req(e, "POST", "/admin/rentals", { landlord_id: L, address, parish: "St Helier",
    service: "full", fee_percent: 10 }), 201).rental.id;
  const t = ok(await req(e, "POST", `/admin/rentals/${R}/tenancies`, { tenant_name: "Tom Tenant", kind: "periodic",
    regime: "2025", rent: 1500, start_on: FROM, collect_from: FROM }), 201).tenancy;
  run(e, "UPDATE rentals SET created_at = ? WHERE id = ?", `${PREV}-01T00:00:00.000Z`, R);
  return { L, R, t };
}
const pay = (e, t, received_on, amount, kind = "rent") => run(e, `INSERT INTO payments (tenancy_id, received_on, amount, kind,
  source, description, created_at) VALUES (?, ?, ?, ?, 'manual', 'Bank text', ?)`, t?.id ?? null, received_on, amount, kind, T);
const statement = async (e, L) => ok(await req(e, "GET", `/admin/statements?landlord=${L}&month=${PREV}`));
const close = async (e, L) => ok(await req(e, "POST", "/admin/statements",
  { landlord: L, month: PREV, digest: (await statement(e, L)).digest }), 201).run;
const detail = async (e, id) => ok(await req(e, "GET", `/admin/tenancies/${id}`));

test("charges, payments and statements export as separate record types", async () => {
  const e = env(), { L, t } = await setup(e);
  pay(e, t, `${PREV}-05`, 150000);
  await close(e, L);
  const charges = await exportRows(e, "charges"), payments = await exportRows(e, "payments"), lines = await exportRows(e, "statements");
  assert.ok(charges.rows.length >= 2);
  assert.deepEqual([...new Set(charges.rows.map(x => x.record_type))], ["rent_charges"]);
  assert.deepEqual(payments.rows.map(x => [x.record_type, x.record_id, x.tenancy_ref, x.date, x.kind, x.amount_pence, x.direction]),
    [["rent_payments", `payment-1`, t.payment_ref, `${PREV}-05`, "rent", "150000", "credit"]]);
  assert.deepEqual([...new Set(lines.rows.map(x => x.record_type))], ["landlord_statement_lines"]);
  for (const x of [...charges.rows, ...payments.rows, ...lines.rows]) {
    assert.equal(x.schema_version, "1");
    assert.equal(x.currency, "GBP");
    assert.match(x.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.match(x.amount_pence, /^\d+$/);
  }
  const charge = charges.rows[0];
  assert.deepEqual([charge.record_id, charge.tenancy_ref, charge.date, charge.kind, charge.amount_pence, charge.direction],
    [rows(e, "SELECT 'charge-' || id AS id FROM charges ORDER BY due_on, id")[0].id, t.payment_ref, FROM, "rent", "150000", "debit"]);
});

test("a write-off is a credit adjustment, never a payment, and its reversal a debit; the ledger adds up to the balance", async () => {
  const e = env(), { t } = await setup(e);
  pay(e, t, `${PREV}-05`, 50000);
  const before = (await detail(e, t.id)).balance;
  const rev = (await detail(e, t.id)).tenancy.financial_revision;
  ok(await req(e, "POST", `/admin/tenancies/${t.id}/writeoffs`, { amount: 30000, reason: "Tenant left the island", financial_revision: rev }));
  let d = await detail(e, t.id);
  assert.equal(d.balance, before - 30000);
  let charges = (await exportRows(e, "charges")).rows;
  const wo = charges.filter(x => x.record_type === "rent_adjustments");
  assert.deepEqual(wo.map(x => [x.kind, x.amount_pence, x.direction, x.date, x.tenancy_ref]), [["writeoff", "30000", "credit", T, t.payment_ref]]);
  assert.match(wo[0].related_id, /^charge-\d+$/);
  assert.ok(charges.some(x => x.record_id === wo[0].related_id), "the charge it reduces is in the same file");
  const payments = (await exportRows(e, "payments")).rows;
  assert.deepEqual(payments.map(x => x.amount_pence), ["50000"], "no cash for the write-off");
  const ledger = list => list.reduce((s, x) => s + signed(x), 0);
  assert.equal(ledger([...charges, ...payments]), d.balance);
  assert.ok(charges.every(x => x.revision === String(d.tenancy.financial_revision)));

  const id = d.writeoffs[0].id;
  ok(await req(e, "POST", `/admin/tenancies/${t.id}/writeoffs/${id}/reverse`, { reason: "Entered by mistake",
    financial_revision: d.tenancy.financial_revision }));
  d = await detail(e, t.id);
  charges = (await exportRows(e, "charges")).rows;
  assert.deepEqual(charges.filter(x => x.record_type === "rent_adjustments").map(x => [x.kind, x.direction]),
    [["writeoff", "credit"], ["reversal", "debit"]]);
  assert.equal(ledger([...charges, ...payments]), d.balance);
  assert.equal(d.balance, before);
});

test("only closed statements export, at their latest revision, and their lines add up to the Statements page", async () => {
  const e = env(), a = await setup(e), b = await setup(e, "Other Owner", "B House");
  ok(await req(e, "PUT", "/admin/settings/gst", { percent: 5 }));
  pay(e, a.t, `${PREV}-05`, 150000);
  pay(e, a.t, `${PREV}-06`, 200000, "deposit");
  pay(e, b.t, `${PREV}-05`, 150000);
  run(e, `INSERT INTO repairs (rental_id, title, urgency, status, cost, done_on, charge_landlord, created_at, updated_at)
    VALUES (?, 'Boiler', 'urgent', 'done', 240, ?, 1, ?, ?)`, a.R, `${PREV}-10`, T, T);
  assert.deepEqual((await exportRows(e, "statements")).rows, [], "nothing closed yet");

  const first = await close(e, a.L);
  let lines = (await exportRows(e, "statements")).rows;
  assert.ok(lines.every(x => x.tenancy_ref === `HE-L${String(a.L).padStart(4, "0")}` && x.date === PREV_END), "landlord b is not closed");
  const totals = (await statement(e, a.L)).closed.statement.totals;
  const sum = kind => lines.filter(x => x.kind === kind).reduce((s, x) => s + Number(x.amount_pence), 0);
  assert.deepEqual({ rent: sum("rent"), fee: sum("fee"), gst: sum("gst"), repairs: sum("repair"), net: sum("net") },
    { rent: totals.rent, fee: totals.fee, gst: totals.gst, repairs: totals.repairs, net: totals.net });
  assert.equal(totals.net, 150000 - 15000 - 750 - 24000);
  assert.equal(sum("rent") - sum("fee") - sum("gst") - sum("repair"), sum("net"));
  assert.deepEqual(lines.map(x => [x.kind, x.direction]),
    [["rent", "credit"], ["fee", "debit"], ["repair", "debit"], ["gst", "debit"], ["net", "credit"]]);
  assert.ok(lines.every(x => x.revision === "1" && x.record_id.startsWith(`statement-${first.id}:`)));
  assert.ok(!lines.some(x => x.amount_pence === "200000"), "the deposit stays apart");

  // A late payment, then revision 2: only revision 2 exports, as the page shows it.
  pay(e, a.t, `${PREV}-20`, 10000);
  const second = await close(e, a.L);
  lines = (await exportRows(e, "statements")).rows;
  assert.ok(lines.every(x => x.revision === "2" && x.record_id.startsWith(`statement-${second.id}:`)));
  assert.equal(sum("rent"), (await statement(e, a.L)).closed.statement.totals.rent);
  assert.equal(sum("rent"), 160000);
});

test("a statement exports from its frozen snapshot: a later correction does not change it until a new revision", async () => {
  const e = env(), { L, t } = await setup(e);
  pay(e, t, `${PREV}-05`, 150000);
  await close(e, L);
  const before = (await exportRows(e, "statements")).text;
  pay(e, t, `${PREV}-21`, 9900);
  assert.equal((await exportRows(e, "statements")).text, before);
  assert.ok((await exportRows(e, "payments")).rows.some(x => x.amount_pence === "9900"), "the payments file has it");
  // A month that ends after the range is left out.
  assert.deepEqual((await exportRows(e, "statements", FROM, plusDays(PREV_END, -1))).rows, []);
});

test("exporting marks nothing sent or paid and writes no figures; it is logged without its rows", async () => {
  const e = env(), { L, t } = await setup(e);
  pay(e, t, `${PREV}-05`, 150000);
  await close(e, L);
  await exportRows(e, "charges");
  const figures = () => rows(e, `SELECT (SELECT COUNT(*) FROM charges) AS c, (SELECT COUNT(*) FROM payments) AS p,
    (SELECT COUNT(*) FROM charge_adjustments) AS a, (SELECT json_group_array(json_array(sent_on, paid_on)) FROM statement_runs) AS s,
    (SELECT financial_revision FROM tenancies WHERE id = ${t.id}) AS r`)[0];
  const was = figures();
  for (const type of ["charges", "payments", "statements"]) await exportRows(e, type);
  assert.deepEqual(figures(), was);
  assert.equal(was.s, "[[null,null]]");
  const log = rows(e, "SELECT actor, entity_id, type, data FROM events WHERE type = 'rental_accounting.exported' ORDER BY id");
  assert.equal(log.length, 4);
  assert.deepEqual(JSON.parse(log[2].data), { type: "payments", from: FROM, to: T, rows: 1 });
  assert.equal(log[2].actor, "admin@example.test");
});
