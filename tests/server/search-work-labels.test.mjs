// EST-10: a search's work labels, each from its own fact and none suppressing another. Synthetic data only.
import test from "node:test";
import assert from "node:assert/strict";
import { workLabelsFor, labelsReady, WORK_LABEL_TEXT, sourceLabels } from "../../server/search-work-labels.js";

const active = { queue: "No matches", found: 0, shortlisted: 0 };

test("only EST10_LABELS_READY=1 switches the labels on", () => {
  assert.equal(labelsReady({ EST10_LABELS_READY: "1" }), true);
  for (const v of [undefined, "0", "true", 1]) assert.equal(labelsReady({ EST10_LABELS_READY: v }), false);
});

test("review_and_waiting_together: a 21-day review and homes waiting for review show side by side", () => {
  assert.deepEqual(workLabelsFor({ ...active, queue: "Waiting for review", found: 2, search_review: 1 }), ["review", "search_review"]);
  assert.deepEqual(workLabelsFor({ queue: "New properties found", found: 3, shortlisted: 1, in_process: 1, essential: 1, viewing_pending: 1,
    viewing_booked: 1, search_review: 1 }), ["new", "review", "shortlisted", "in_process", "essential", "viewing_pending", "viewing_booked", "search_review"]);
});

test("no_7day_no_matches_rule: a search without matches gets no label of its own; only BUS-17's review speaks of absence", () => {
  assert.deepEqual(workLabelsFor({ ...active, created_at: "2020-01-01T00:00:00.000Z" }), []);
  assert.deepEqual(workLabelsFor({ ...active, search_review: 1 }), ["search_review"]);
});

test("ready_not_search_resolved: labels exist only for an active home search and never resolve it", () => {
  assert.equal(workLabelsFor({ ...active, queue: null, viewing_booked: 1, search_review: 1 }), null, "not in the work queue: history only");
  const labels = workLabelsFor({ ...active, viewing_booked: 1, shortlisted: 1 });
  assert.deepEqual(labels, ["shortlisted", "viewing_booked"]);
  assert.equal(labels.some(k => /resolved|closed|done/.test(k)), false);
});

test("missing_essential_unknown: a source not read is absent, never a 0 that reads as none", () => {
  // Undefined (the source was not read) and 0 (read, none) both give no label; the response says which sources were read.
  assert.deepEqual(workLabelsFor({ ...active }), []);
  assert.deepEqual(workLabelsFor({ ...active, essential: 1 }), ["essential"]);
  assert.deepEqual(sourceLabels({ viewings: false, review: false }), ["essential"]);
  assert.deepEqual(sourceLabels({ viewings: true, review: false }), ["essential", "viewing_pending", "viewing_booked"]);
  assert.deepEqual(sourceLabels({ viewings: true, review: true }), ["essential", "viewing_pending", "viewing_booked", "search_review"]);
});

test("no_visit_confirmation_from_request: a held request is pending, booked only from the viewing's confirmed state", () => {
  assert.deepEqual(workLabelsFor({ ...active, viewing_pending: 1 }), ["viewing_pending"]);
  assert.deepEqual(workLabelsFor({ ...active, viewing_pending: 1, viewing_booked: 1 }), ["viewing_pending", "viewing_booked"],
    "a new time being agreed for a booked viewing shows both");
});

test("text_not_color_only: every label has its own words", () => {
  for (const k of ["new", "review", "shortlisted", "in_process", "essential", "viewing_pending", "viewing_booked", "search_review"])
    assert.match(WORK_LABEL_TEXT[k], /^[A-Z][a-z].{3,}/, k);
  assert.equal(new Set(Object.values(WORK_LABEL_TEXT)).size, Object.keys(WORK_LABEL_TEXT).length);
});
