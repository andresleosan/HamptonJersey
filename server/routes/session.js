import { json, fail, readJson } from "../http.js";
import { verifyFirebaseToken, signSession, sessionCookie, SESSION_HOURS } from "../auth.js";
import { accessReady, staffPrincipal, AccessError } from "../access.js";

async function signIn({ request, env }) {
  if (env.QA_HISTORY_KEY && env.QA_HISTORY_KEY === env.SESSION_SECRET) fail(503, "Session unavailable");
  const { idToken } = (await readJson(request)) ?? {};
  if (typeof idToken !== "string" || !idToken) fail(400, "Missing Google token");
  let email;
  try { email = await verifyFirebaseToken(idToken, env.FIREBASE_PROJECT_ID); }
  catch { fail(401, "Couldn't verify your Google sign-in. Please try again."); }
  // PRE-06: the Google account must be the one Access let through, before any cookie is signed.
  if (accessReady(env) && (await staffPrincipal(request, env)).email !== email) throw new AccessError(403, "access_mismatch");
  if (!(await env.DB.prepare("SELECT 1 FROM admins WHERE email = ?").bind(email).first())) fail(403, "This account doesn't have access");
  const value = await signSession(email, env.SESSION_SECRET);
  return json({ email }, 200, { "set-cookie": sessionCookie(value, SESSION_HOURS * 3600) });
}

export default [
  ["POST", /^\/session$/, signIn],
  ["DELETE", /^\/session$/, () => json({ ok: true }, 200, { "set-cookie": sessionCookie("", 0) })],
  ["GET", /^\/me$/, ({ admin }) => json({ email: admin }), true],
];
