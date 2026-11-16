// PRE-12 (Q05), review 16-nov: with 0112 applied and the switch turned off again, an answer to a notice already sent is
// recorded by the retention pass itself before cleanEmail clears the email's content, so the contact is never deleted.
import test from "node:test";
import assert from "node:assert/strict";
import { T0 } from "./helpers.mjs";
import { emailEnv } from "./email-helpers.mjs";
import { dispatchEmail } from "../../server/email.js";
import { runRetention } from "../../server/retention.js";
import { retentionNoticePass } from "../../server/retention-notices.js";

const LAST = "2025-11-25T10:00:00.000Z", NOTICE = "2026-10-26T09:00:00.000Z";
const insert = (env, table, row) => { const cols = Object.keys(row);
  return Number(env.DB.raw.prepare(`INSERT INTO ${table} (${cols.join(",")}) VALUES (${cols.map(() => "?").join(",")})`)
    .run(...cols.map(c => row[c])).lastInsertRowid); };
const row = (env, sql) => env.DB.raw.prepare(sql).get();
const exists = (env, id) => !!env.DB.raw.prepare("SELECT 1 FROM contacts WHERE id = ?").get(id);

for (const sender of ["jane@corp.example.test", "jane.home@example.test"]) {
  test(`switched off after the notice went out, an answer from ${sender} keeps the contact past the 30-day email cleanup`, async () => {
    const env = Object.assign(emailEnv(), { PRE12_RETENTION_NOTICE_READY: "1", PRE10_PURPOSE_READY: "1" });
    const c = insert(env, "contacts", { name: "X", email: "jane@corp.example.test", phone: null, last_activity_at: LAST,
      created_at: T0, updated_at: T0 });
    await retentionNoticePass(env, NOTICE);
    await dispatchEmail(env, () => NOTICE);
    await retentionNoticePass(env, "2026-10-26T09:10:00.000Z");
    assert.equal(row(env, "SELECT state FROM retention_notices").state, "accepted");
    const ref = row(env, "SELECT ref FROM outbound WHERE template = 'retention_notice'").ref;
    env.PRE12_RETENTION_NOTICE_READY = "0";
    insert(env, "email_inbound", { dedupe_key: "k1", sender, header_from: sender, recipient: "replies@example.test",
      subject: `Re: Your details [HE-OUT-${ref}]`, text: "Please keep my details", html_only: 0, truncated: 0,
      received_at: "2026-10-29T09:00:00.000Z" });
    for (const d of ["2026-11-26", "2026-11-29", "2026-11-30", "2026-12-15", "2027-02-01"]) await runRetention(env, `${d}T00:00:00.000Z`);
    assert.equal(exists(env, c), true, "the person answered: never deleted");
    assert.equal(row(env, "SELECT state FROM retention_notices").state, "replied");
  });
}
