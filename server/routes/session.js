import { json, fail, readJson } from "../http.js";
import { verifyFirebaseToken, signSession, sessionCookie, SESSION_HOURS } from "../auth.js";

async function signIn({ request, env }) {
  const { idToken } = (await readJson(request)) ?? {};
  if (typeof idToken !== "string" || !idToken) fail(400, "Falta el token de Google");
  let email;
  try { email = await verifyFirebaseToken(idToken, env.FIREBASE_PROJECT_ID); }
  catch { fail(401, "No se pudo verificar el acceso con Google. Inténtalo de nuevo."); }
  if (!(await env.DB.prepare("SELECT 1 FROM admins WHERE email = ?").bind(email).first())) fail(403, "Esta cuenta no tiene acceso");
  const value = await signSession(email, env.SESSION_SECRET);
  return json({ email }, 200, { "set-cookie": sessionCookie(value, SESSION_HOURS * 3600) });
}

export default [
  ["POST", /^\/session$/, signIn],
  ["DELETE", /^\/session$/, () => json({ ok: true }, 200, { "set-cookie": sessionCookie("", 0) })],
  ["GET", /^\/me$/, ({ admin }) => json({ email: admin }), true],
];
