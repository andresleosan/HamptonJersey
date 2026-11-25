// PUB-10 (Luis, 25-nov-2026): a «Sell or let» request is kept 12 months from its last activity (sent or its status
// last changed), then the retention pass deletes it as the panel's Delete does (an owner.erased event, no personal data).
import test from "node:test";
import assert from "node:assert/strict";
import { makeEnv, T0 } from "./helpers.mjs";
import { runRetention } from "../../server/retention.js";

const run = (env, sql, ...a) => env.DB.raw.prepare(sql).run(...a);
const ids = env => env.DB.raw.prepare("SELECT id FROM owner_requests ORDER BY id").all().map(r => r.id);
function owner(env, id, at) {
  run(env, "INSERT INTO app_settings (key, value, updated_at, updated_by) VALUES ('owner_enquiries', ?, ?, 'x') ON CONFLICT (key) DO NOTHING",
    JSON.stringify({ enabled: true, privacy_version: "v1" }), T0);
  run(env, `INSERT INTO owner_requests (id, request_id, payload_hash, name, phone, email, address, operation, valuation_requested,
    privacy_version, created_at, updated_at) VALUES (?, ?, 'h', 'Fixture Owner', '07700123456', 'owner@example.test', '1 Example Road',
    'sale', 1, 'v1', ?, ?)`, id, `r-${id}`, at, at);
}

test("a request with no activity for 12 months is deleted, a newer one stays, and only an erasure event remains", async () => {
  const env = makeEnv();
  owner(env, "a-old", "2025-11-20T10:00:00.000Z");
  owner(env, "b-new", "2025-12-01T10:00:00.000Z");
  run(env, "UPDATE owner_requests SET updated_at = ? WHERE id = 'b-new'", "2026-11-01T10:00:00.000Z");
  await runRetention(env, "2026-11-25T03:00:00.000Z");
  assert.deepEqual(ids(env), ["b-new"]);
  const ev = env.DB.raw.prepare("SELECT actor, entity_id, data FROM events WHERE type = 'owner.erased'").all().map(r => ({ ...r }));
  assert.deepEqual(ev, [{ actor: "system", entity_id: "owner-request:a-old", data: "{}" }]);
  assert.equal(env.DB.raw.prepare("SELECT COUNT(*) n FROM owner_request_receipts WHERE owner_request_id = 'a-old'").get().n, 0);
});

test("before migration 0118 the pass runs as before", async () => {
  const env = makeEnv({ skip: [118] });
  await runRetention(env, "2026-11-25T03:00:00.000Z");
});
