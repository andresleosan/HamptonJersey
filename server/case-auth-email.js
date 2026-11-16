// ADM-12 (spec tp03-case-evidence, «Autenticación transaccional efímera»): the sign-in code by email, through email.js's
// sender and switch (EMAIL_SERVICE_READY and the EMAIL binding; off until AUT-17). The code is made in memory and leaves
// only in that one provider call: the database keeps its HMAC, the outcome and the quota, never the code, the body or the
// address, and no outbound row (so it never shows in Email). One batch checks the link again, revokes the previous code,
// applies 1 a minute and 10 a Jersey day per link and reserves one of the team's 100 emails a day in email_attempts,
// shared with dispatchEmail. Only then, after checking the link and the email settings once more, is the provider called,
// once. An unclear result is never resent: the tenant asks for a new code, which revokes this one.
import { fail, now } from "./http.js";
import { DAILY_LIMIT, emailDay, serviceReady, sendNow } from "./email.js";
import { ensureChanged } from "./routes/rentals.js";
import { TOKEN, caseKey, challengeDigest, hashCaseToken, keyId, makeCode } from "./case-access-crypto.js";
import { gone, grantInForce, stillInForce } from "./case-access.js";

const CODE_MS = 10 * 60e3, PER_DAY = 10;
const NO_EMAIL = "We can't send a code right now. Please try again later or contact Hampton Estates.";
// As dispatchEmail's AUTHORIZED: email switched on, sending not paused, the address (by its hash) not suppressed.
const SENDABLE = `EXISTS (SELECT 1 FROM app_settings WHERE key = 'email' AND json_extract(value,'$.enabled') = 1)
  AND NOT EXISTS (SELECT 1 FROM app_settings WHERE key = 'outbound' AND json_extract(value,'$.paused') = 1)
  AND NOT EXISTS (SELECT 1 FROM email_suppressions WHERE address_hash = ?)`;
const transport = env => serviceReady(env) && typeof env.EMAIL?.send === "function";
const SUBJECT = "Your Hampton Estates code";
const body = code => [`Your code is ${code}.`, "", "Enter it on the Hampton Estates page where you asked for it, to report a repair. "
  + "It works for 10 minutes. If you did not ask for it, you can ignore this email.", "", "Hampton Estates",
  "42 Bath Street, St Helier, Jersey JE2 4ST"].join("\n");

// POST with the link's token (from the page's fragment): a code to the tenancy's email, or 404 for any link not in force.
export async function beginCaseChallenge(env, { bootstrap } = {}) {
  if (!transport(env)) fail(503, NO_EMAIL);
  if (typeof bootstrap !== "string" || !TOKEN.test(bootstrap)) gone();
  const g = await grantInForce(env, "g.token_hash = ?", await hashCaseToken(bootstrap), now());
  return g ? sendCaseChallengeCode(env, g) : gone();
}

export async function sendCaseChallengeCode(env, g, clock = now) {
  const secret = caseKey(env), ts = clock(), day = emailDay(ts), minuteAgo = new Date(Date.parse(ts) - 60e3).toISOString();
  const id = crypto.randomUUID(), attempt = crypto.randomUUID(), code = makeCode();
  const expires = new Date(Math.min(Date.parse(ts) + CODE_MS, Date.parse(g.expires_at))).toISOString();
  const st = (sql, ...a) => env.DB.prepare(sql).bind(...a);
  try {
    await env.DB.batch([
      stillInForce(env, g, ts),
      st("UPDATE case_challenges SET status = 'revoked' WHERE grant_id = ? AND status = 'open'", g.id),
      st("INSERT INTO case_challenges (id, grant_id, digest, key_id, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)",
        id, g.id, await challengeDigest(secret, id, g.id, code), await keyId(secret), ts, expires),
      st(`INSERT INTO case_auth_attempts (id, challenge_id, grant_id, recipient_version, status, day, at, expires_at)
        SELECT ?, ?, ?, ?, 'reserved', ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM case_auth_attempts WHERE grant_id = ? AND at > ?)
        AND (SELECT COUNT(*) FROM case_auth_attempts WHERE grant_id = ? AND day = ?) < ${PER_DAY}`,
        attempt, id, g.id, g.source_revision, day, ts, expires, g.id, minuteAgo, g.id, day),
      ensureChanged(env),
      st(`INSERT INTO email_attempts (token, outbound_id, day, at) SELECT ?, NULL, ?, ? WHERE ${SENDABLE}
        AND (SELECT COUNT(*) FROM email_attempts WHERE day = ?) < ${DAILY_LIMIT}`, attempt, day, ts, g.source_revision, day),
      ensureChanged(env),
    ]);
  } catch (e) {
    // Nothing was written. Say which rule stopped it, never the address.
    if (!(await grantInForce(env, "g.id = ?", g.id, clock()))) gone();
    const q = await env.DB.prepare(`SELECT (SELECT COUNT(*) FROM case_auth_attempts WHERE grant_id = ?1 AND at > ?2) AS recent,
      (SELECT COUNT(*) FROM case_auth_attempts WHERE grant_id = ?1 AND day = ?3) AS today,
      (SELECT COUNT(*) FROM email_attempts WHERE day = ?3) < ${DAILY_LIMIT} AND ${SENDABLE.replace("?", "?4")} AS sendable`)
      .bind(g.id, minuteAgo, day, g.source_revision).first();
    if (q.recent) fail(429, "A code was sent less than a minute ago. Please wait a minute before asking for another.");
    if (q.today >= PER_DAY) fail(429, "You have asked for 10 codes today. Please try again tomorrow or contact Hampton Estates.");
    if (!q.sendable) fail(503, NO_EMAIL);
    throw e;
  }
  // The link, this code and the email settings may have changed meanwhile: checked again right before the call.
  const live = transport(env) && await env.DB.prepare(`SELECT 1 FROM case_challenges WHERE id = ? AND status = 'open' AND ${SENDABLE}`)
    .bind(id, g.source_revision).first() && await grantInForce(env, "g.id = ?", g.id, clock());
  if (!live) {
    await settle(env, id, attempt, "failed", null, "NOT_SENT");
    return (await grantInForce(env, "g.id = ?", g.id, clock())) ? fail(503, NO_EMAIL) : gone();
  }
  let status = "accepted", messageId = null, error = null;
  try {
    const r = await sendNow(env, g.email, SUBJECT, body(code));
    if (typeof r?.messageId !== "string" || !r.messageId || r.messageId.length > 512) throw new Error("Missing acceptance id");
    messageId = r.messageId;
  } catch (e) {
    // An error the provider names is a refusal: this code is withdrawn. Anything else may have arrived.
    const named = typeof e?.code === "string" && /^E_[A-Z_]{1,58}$/.test(e.code);
    [status, error] = named ? ["failed", e.code] : ["unknown", "UNKNOWN_RESULT"];
  }
  await settle(env, id, attempt, status, messageId, error);
  if (status === "failed") fail(503, NO_EMAIL);
  return { challenge_id: id, expires_at: expires };
}

async function settle(env, id, attempt, status, messageId, error) {
  try {
    await env.DB.batch([
      env.DB.prepare("UPDATE case_auth_attempts SET status = ?, message_id = ?, error_code = ? WHERE id = ? AND status = 'reserved'")
        .bind(status, messageId, error, attempt),
      ...(status === "failed" ? [env.DB.prepare("UPDATE case_challenges SET status = 'revoked' WHERE id = ? AND status = 'open'").bind(id)] : []),
    ]);
  } catch { console.error("ADM-12: a sign-in code's outcome could not be saved"); } // never the code, address or provider payload
}
