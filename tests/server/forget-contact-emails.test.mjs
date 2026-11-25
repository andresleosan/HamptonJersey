// 25-nov-2026: a contact deleted takes its emails' content with it at once (trigger contact_email_erasure, migration 0023).
import test from "node:test";
import assert from "node:assert/strict";
import { makeEnv, call, adminCookie, T0 } from "./helpers.mjs";
import { runRetention } from "../../server/retention.js";

const run = (env, sql, ...a) => env.DB.raw.prepare(sql).run(...a);
const out = env => env.DB.raw.prepare("SELECT recipient, subject, text, status, error_code FROM outbound ORDER BY id").all().map(r => ({ ...r }));
function email(env, to, status) {
  run(env, `INSERT INTO outbound (ref, dedupe_key, template, entity_id, version, recipient, recipient_hash, subject, text, status, approved_by,
    approved_at, created_at, updated_at) VALUES (lower(hex(randomblob(16))), lower(hex(randomblob(16))), 'viewing_reminder_2h', '1', 1, ?, 'h',
    'Viewing reminder', 'Your viewing', ?, 'automation', ?, ?, ?)`, to, status, T0, T0, T0);
}

test("the applicant's Delete blanks the contact's emails; another person's stay", async () => {
  const env = makeEnv();
  const r = await call(env, "POST", "/admin/applicants", { body: { name: "Gone Person", email: "Gone@Example.test", source: "phone", operation: "rent" },
    cookie: await adminCookie() });
  assert.equal(r.status, 201, r.text);
  run(env, "UPDATE applicants SET archived_at = ? WHERE id = ?", T0, r.data.id);
  email(env, "gone@example.test", "queued"); email(env, "gone@example.test", "sending"); email(env, "gone@example.test", "accepted");
  email(env, "stays@example.test", "queued");
  const d = await call(env, "DELETE", `/admin/applicants/${r.data.id}`, { body: { confirm: "Gone Person" }, cookie: await adminCookie() });
  assert.ok(d.status < 300, d.text);
  const [q, s, a, other] = out(env);
  for (const e of [q, s, a]) assert.deepEqual([e.recipient, e.subject, e.text], [null, null, null]);
  assert.deepEqual([q.status, s.status, s.error_code, a.status], ["cancelled", "unknown", "CONTACT_ERASED_IN_FLIGHT", "accepted"]);
  assert.deepEqual([other.recipient, other.status], ["stays@example.test", "queued"]);
});

test("the retention pass blanks the emails of the contacts it deletes", async () => {
  const env = makeEnv();
  run(env, "INSERT INTO contacts (name, email, last_activity_at, created_at, updated_at) VALUES ('Old Person', 'old@example.test', ?, ?, ?)",
    "2024-01-01T00:00:00.000Z", "2024-01-01T00:00:00.000Z", "2024-01-01T00:00:00.000Z");
  email(env, "old@example.test", "accepted");
  run(env, "UPDATE outbound SET created_at = ?", "2026-11-24T00:00:00.000Z"); // recent: the 30-day clean-up would not blank it
  await runRetention(env, "2026-11-25T03:00:00.000Z");
  assert.equal(env.DB.raw.prepare("SELECT COUNT(*) n FROM contacts").get().n, 0);
  assert.deepEqual([out(env)[0].recipient, out(env)[0].text], [null, null]);
});
