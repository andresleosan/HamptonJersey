import { jwtVerify, createRemoteJWKSet } from "jose";

const GOOGLE_JWKS = createRemoteJWKSet(new URL(
  "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"));

// Firebase ID token → verified Google email (lower case). Throws on anything else.
export async function verifyFirebaseToken(token, projectId, jwks = GOOGLE_JWKS) {
  const { payload } = await jwtVerify(token, jwks, {
    issuer: `https://securetoken.google.com/${projectId}`, audience: projectId, algorithms: ["RS256"],
  });
  if (payload.email_verified !== true || payload.firebase?.sign_in_provider !== "google.com" || typeof payload.email !== "string")
    throw new Error("Not a verified Google account");
  return payload.email.toLowerCase();
}

export const COOKIE = "__Host-hs";
export const SESSION_HOURS = 8;
const enc = new TextEncoder();
const b64u = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64u = s => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
function hmacKey(secret) {
  if (typeof secret !== "string" || secret.length < 32) throw new Error("SESSION_SECRET missing or shorter than 32 characters");
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export async function signSession(email, secret, nowMs = Date.now()) {
  const key = await hmacKey(secret);
  const body = b64u(enc.encode(JSON.stringify({ email, exp: nowMs + SESSION_HOURS * 3600e3 })));
  return `${body}.${b64u(await crypto.subtle.sign("HMAC", key, enc.encode(body)))}`;
}

export async function readSession(value, secret, nowMs = Date.now()) {
  const key = await hmacKey(secret); // misconfiguration must fail loudly, not look like "signed out"
  try {
    const [body, sig] = String(value ?? "").split(".");
    if (!body || !sig || !(await crypto.subtle.verify("HMAC", key, unb64u(sig), enc.encode(body)))) return null;
    const { email, exp } = JSON.parse(new TextDecoder().decode(unb64u(body)));
    return typeof email === "string" && exp > nowMs ? email : null;
  } catch { return null; }
}

export const sessionCookie = (value, maxAge) =>
  `${COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;

export const getCookie = (request, name) =>
  (request.headers.get("cookie") || "").split(/;\s*/).find(c => c.startsWith(name + "="))?.slice(name.length + 1) ?? null;

// Signed cookie AND still listed in admins: removing someone takes effect on their next request.
export async function currentAdmin(request, env) {
  const email = await readSession(getCookie(request, COOKIE), env.SESSION_SECRET);
  if (!email) return null;
  return (await env.DB.prepare("SELECT 1 FROM admins WHERE email = ?").bind(email).first()) ? email : null;
}

export const sameOrigin = request => request.headers.get("origin") === new URL(request.url).origin;
