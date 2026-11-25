// 25-nov-2026: D1 refused the carrier's claim of an approved enquiry ("Expression tree is too large (maximum depth
// 100)"), with the website's switches as deployed. makeDb keeps a lower limit (helpers.mjs); this runs the claim's
// statements with the switches of wrangler.toml, the claim itself included.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { makeDb } from "./helpers.mjs";
import { claimForHermes } from "../../server/email.js";
import { enquiryEmailCheck } from "../../server/consultation-email.js";

const toml = readFileSync(new URL("../../wrangler.toml", import.meta.url), "utf8");
const vars = Object.fromEntries([...toml.slice(toml.indexOf("[vars]"), toml.indexOf("\n[", toml.indexOf("[vars]") + 1))
  .matchAll(/^([A-Z0-9_]+)\s*=\s*"([^"]*)"/gm)].map(m => [m[1], m[2]]));

test("the carrier's claim of an enquiry fits D1's depth with the deployed switches", async () => {
  assert.equal(vars.AGE05_SEND_READY, "1");
  const db = makeDb(), seen = [];
  // A candidate is offered whatever the data, so the claim's own UPDATE and its re-read are prepared too.
  const env = { ...vars, DB: { ...db, prepare: sql => {
    seen.push(sql);
    const s = db.prepare(sql);
    return /^SELECT id FROM outbound WHERE status='queued'/.test(sql) ? { ...s, bind: (...a) => ({ ...s.bind(...a), all: async () => ({ results: [{ id: 1 }] }) }) } : s;
  } } };
  assert.equal(await claimForHermes(env, await enquiryEmailCheck(env)), null);
  assert.ok(seen.some(sql => sql.startsWith("UPDATE outbound SET status='sending'")), "the claim was prepared");
});

// OFE-02 and VIS-13: with both switches on as well (and the others as deployed), the claim carries both checks.
test("the carrier's claim with OFE-02's and VIS-13's checks fits D1's depth", async () => {
  const db = makeDb(), seen = [];
  const env = { ...vars, OFE02_SEND_READY: "1", VIS13_REMINDERS_READY: "1", DB: { ...db, prepare: sql => {
    seen.push(sql);
    const s = db.prepare(sql);
    return /^SELECT id FROM outbound WHERE status='queued'/.test(sql) ? { ...s, bind: (...a) => ({ ...s.bind(...a), all: async () => ({ results: [{ id: 1 }] }) }) } : s;
  } } };
  assert.equal(await claimForHermes(env, await enquiryEmailCheck(env)), null);
  const claim = seen.find(sql => sql.startsWith("UPDATE outbound SET status='sending'"));
  assert.ok(claim?.includes("FROM offer_emails oe"), "the claim was prepared with the offer's check");
  assert.ok(claim?.includes("WHEN 'viewing_reminder_24h' THEN"), "the claim carries the reminder check");
});

// The worst case: every switch of wrangler.toml on (retention notices, purposes, every template's check), so a new
// template's check is measured with all the others in the claim (one CASE by template since 25-nov).
test("the carrier's claim with every switch on fits D1's depth", async () => {
  const db = makeDb(), seen = [], all = Object.fromEntries(Object.entries(vars).map(([k, v]) => [k, /_READY$/.test(k) ? "1" : v]));
  const env = { ...all, DB: { ...db, prepare: sql => {
    seen.push(sql);
    const s = db.prepare(sql);
    return /^SELECT id FROM outbound WHERE status='queued'/.test(sql) ? { ...s, bind: (...a) => ({ ...s.bind(...a), all: async () => ({ results: [{ id: 1 }] }) }) } : s;
  } } };
  assert.equal(await claimForHermes(env, await enquiryEmailCheck(env)), null);
  const claim = seen.find(sql => sql.startsWith("UPDATE outbound SET status='sending'"));
  for (const t of ["enquiry", "offer_to_seller", "viewing_reminder_24h", "retention_notice", "viewing_feedback", "viewing_cancelled_closed"]) assert.ok(claim.includes(`'${t}'`), t);
  assert.ok(claim.includes("e.type = 'viewing.cancelled'"), "the claim carries AUT-21's check");
});
