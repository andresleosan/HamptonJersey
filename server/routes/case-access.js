// ADM-12 (ADM12_CASE_ACCESS_READY, migration 0110): the public sign-in of case-access. POST the link's token (read from
// the page's fragment, never a query string) for a code by email; POST the code for a 30-minute session cookie,
// __Host-, HttpOnly, Secure, SameSite=Strict; POST sign-out ends it. Answers are no-store (api.js). The forms that use
// it: repair-reports.js.
import { json, readJson } from "../http.js";
import { keyed, verifyCaseChallenge, endCaseSession, COOKIE } from "../case-access.js";
import { beginCaseChallenge } from "../case-auth-email.js";

const challenge = async ({ request, env }) => json(await beginCaseChallenge(env, (await readJson(request, 256)) ?? {}), 202);

async function verify({ request, env }) {
  const s = await verifyCaseChallenge(env, (await readJson(request, 256)) ?? {});
  return json({ ok: true, expires_at: s.expires_at }, 200,
    { "set-cookie": `${COOKIE}=${s.token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${s.max_age}` });
}

async function signOut({ request, env }) {
  await endCaseSession(env, request);
  return json({ ok: true }, 200, { "set-cookie": `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0` });
}

export default [
  ["POST", /^\/case-access\/challenge$/, keyed(challenge), false],
  ["POST", /^\/case-access\/verify$/, keyed(verify), false],
  ["POST", /^\/case-access\/sign-out$/, keyed(signOut), false],
];
