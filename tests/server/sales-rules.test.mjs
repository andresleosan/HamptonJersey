import test from "node:test";
import assert from "node:assert/strict";
import { MILESTONES, milestoneLabel, validateOffer, validateSale, validateMilestone, isOverdue, nextMilestone,
  OFFER_WAITING_MS } from "../../server/sales.js";

test("milestones: share transfer renames passing and settled", () => {
  assert.deepEqual(MILESTONES.map(([k]) => k), ["lawyers", "due_diligence", "questionnaire", "searches", "mortgage",
    "contract", "funds", "passing", "settled"]);
  for (const route of [null, "freehold"]) {
    assert.equal(milestoneLabel("passing", route), "Passing contract (Royal Court)");
    assert.equal(milestoneLabel("settled", route), "Seller paid and Stamp Duty settled");
  }
  assert.equal(milestoneLabel("passing", "share_transfer"), "Completion");
  assert.equal(milestoneLabel("settled", "share_transfer"), "Seller paid and LTT settled");
  assert.equal(milestoneLabel("lawyers", "share_transfer"), "Lawyers instructed");
  assert.equal(OFFER_WAITING_MS, 2 * 24 * 3600 * 1000);
});

test("validateOffer: whole pounds up to 100 million, conditions up to 1,000 characters", () => {
  assert.deepEqual(validateOffer({ amount: 750000, conditions: " Subject to mortgage " }),
    { value: { amount: 750000, conditions: "Subject to mortgage" } });
  assert.deepEqual(validateOffer({ amount: "750000" }), { value: { amount: 750000, conditions: null } });
  for (const amount of [0, -1, 1.5, 100000001, "abc", undefined])
    assert.ok(validateOffer({ amount }).errors.amount, String(amount));
  assert.ok(validateOffer({ amount: 1, conditions: "x".repeat(1001) }).errors.conditions);
  assert.deepEqual(validateOffer({ conditions: "" }, { partial: true }), { value: { conditions: null } });
  assert.ok(validateOffer({ amount: null }, { partial: true }).errors.amount);
});

test("validateSale: bad email, shared fee above fee and a 121-character name are field errors", () => {
  const { errors } = validateSale({ seller_email: "jane@", fee: 5000, shared_fee: 6000, seller_name: "x".repeat(121) });
  assert.deepEqual(Object.keys(errors).sort(), ["seller_email", "seller_name", "shared_fee"]);
  // Absent keys are left alone; blanks clear.
  assert.deepEqual(validateSale({ notes: " Chain of two ", seller_lawyer_email: "", route: "share_transfer" }),
    { value: { notes: "Chain of two", seller_lawyer_email: null, route: "share_transfer" } });
  const bad = { route: "leasehold", target_date: "2026-02-30", price: null, fee: 0, notes: "x".repeat(2001),
    buyer_lawyer_phone: 7797123456 };
  assert.deepEqual(Object.keys(validateSale(bad).errors).sort(), Object.keys(bad).sort());
  assert.deepEqual(validateSale({ target_date: "2026-12-01", fee: 10000, shared_fee: 10000, buyer_lawyer_email: "a@b.je" }),
    { value: { target_date: "2026-12-01", fee: 10000, shared_fee: 10000, buyer_lawyer_email: "a@b.je" } });
});

test("validateMilestone: dates or null, done and not needed are exclusive", () => {
  assert.deepEqual(validateMilestone({ planned_on: "2026-11-01", done_on: null, not_needed: false, note: " ok " }),
    { value: { planned_on: "2026-11-01", done_on: null, not_needed: 0, note: "ok" } });
  assert.deepEqual(validateMilestone({ not_needed: true }), { value: { not_needed: 1 } });
  const { errors } = validateMilestone({ planned_on: "1 Nov", not_needed: "yes", note: "x".repeat(301) });
  assert.deepEqual(Object.keys(errors).sort(), ["not_needed", "note", "planned_on"]);
  assert.ok(validateMilestone({ done_on: "2026-10-24", not_needed: true }).errors.not_needed);
});

test("isOverdue: planned yesterday and open is overdue; done, not needed or planned today is not", () => {
  const today = "2026-10-24", open = { planned_on: "2026-10-23", done_on: null, not_needed: 0 };
  assert.equal(isOverdue(open, today), true);
  assert.equal(isOverdue({ ...open, done_on: "2026-10-23" }, today), false);
  assert.equal(isOverdue({ ...open, not_needed: 1 }, today), false);
  assert.equal(isOverdue({ ...open, planned_on: today }, today), false);
  assert.equal(isOverdue({ ...open, planned_on: null }, today), false);
});

test("nextMilestone: the first neither done nor not needed", () => {
  const ms = MILESTONES.map(([key]) => ({ key, planned_on: null, done_on: null, not_needed: 0 }));
  assert.equal(nextMilestone(ms).key, "lawyers");
  ms[0].done_on = "2026-10-20";
  ms[1].not_needed = 1;
  assert.equal(nextMilestone(ms).key, "questionnaire");
  assert.equal(nextMilestone(ms.map(m => ({ ...m, done_on: "2026-10-20" }))), null);
});
