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

// OFE-02: with its switch on as well (and the others as deployed), the claim carries the offer's own check too.
test("the carrier's claim with OFE-02's check fits D1's depth", async () => {
  const db = makeDb(), seen = [];
  const env = { ...vars, OFE02_SEND_READY: "1", DB: { ...db, prepare: sql => {
    seen.push(sql);
    const s = db.prepare(sql);
    return /^SELECT id FROM outbound WHERE status='queued'/.test(sql) ? { ...s, bind: (...a) => ({ ...s.bind(...a), all: async () => ({ results: [{ id: 1 }] }) }) } : s;
  } } };
  assert.equal(await claimForHermes(env, await enquiryEmailCheck(env)), null);
  const claim = seen.find(sql => sql.startsWith("UPDATE outbound SET status='sending'"));
  assert.ok(claim?.includes("FROM offer_emails oe"), "the claim was prepared with the offer's check");
});
