// PRE-06: the second barrier. Cloudflare Access sits in front of the Staff panel, the admin API, /api/session and
// /api/me; the origin checks again, from the signed assertion Access adds to each request, that the request really
// passed through it, for this site, and (in auth.js and the session route) that it is the same person as the Hampton
// session. Off unless PRE06_ACCESS_READY = "1". On, a missing or invalid configuration closes the Staff surface (503).
import { jwtVerify, createRemoteJWKSet, errors } from "jose";

export const ACCESS_HEADER = "cf-access-jwt-assertion";
const MAX_ASSERTION = 8 * 1024;
// Keys: 3 s to download, kept 5 min at most, and an unknown key id downloads again at most every 30 s.
const KEY_OPTIONS = { timeoutDuration: 3000, cacheMaxAge: 5 * 60e3, cooldownDuration: 30e3 };
const STAFF_PATH = /^\/(?:admin|api\/admin|api\/session|api\/me)(?:\/|$)/;

export const accessReady = env => env.PRE06_ACCESS_READY === "1";

export class AccessError extends Error {
  constructor(status, code) { super(code); this.status = status; this.code = code; }
}
const denied = () => new AccessError(403, "access_required");
const unavailable = () => new AccessError(503, "access_unavailable");

// Every route that needs an admin is Staff, wherever it lives; so are the panel and the session endpoints.
export const classifyAccessSurface = ({ pathname, requiresAdmin = false }) =>
  requiresAdmin || STAFF_PATH.test(pathname) ? "staff" : "public";

// The team domain is the issuer (https://<team>.cloudflareaccess.com), the audience is the Staff application's AUD tag,
// and the only host Staff is served on is SITE_URL's. Nothing is taken from the request to choose any of them.
export function loadAccessPolicy(env) {
  const issuer = env.ACCESS_TEAM_DOMAIN, audience = env.ACCESS_STAFF_AUD;
  let host = null;
  try { host = new URL(env.SITE_URL).host; } catch {}
  const wrong = [
    !(typeof issuer === "string" && /^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(issuer)) && "ACCESS_TEAM_DOMAIN",
    !(typeof audience === "string" && /^[0-9a-f]{64}$/.test(audience)) && "ACCESS_STAFF_AUD",
    !host && "SITE_URL",
  ].filter(Boolean);
  if (wrong.length) {
    console.error(`PRE-06: Access is on but ${wrong.join(", ")} is missing or invalid; Staff stays closed.`);
    throw unavailable();
  }
  return { issuer, audience, host };
}

const keySets = new Map();
const keysFor = issuer => {
  if (!keySets.has(issuer)) keySets.set(issuer, createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`), KEY_OPTIONS));
  return keySets.get(issuer);
};

// → { email, sub } of the person Access let through. 403 for anything wrong with the request or its assertion; 503 when
// the keys can't be had (stale keys are never used past their 5 minutes).
export async function verifyAccessAssertion(request, policy, { jwks = keysFor(policy.issuer), now } = {}) {
  const token = request.headers.get(ACCESS_HEADER);
  if (!token || token.length > MAX_ASSERTION) throw denied();
  if (new URL(request.url).host !== policy.host) throw denied();
  let keysDown = false;
  const keys = async (header, jwt) => {
    try { return await jwks(header, jwt); }
    catch (e) {
      if (!(e instanceof errors.JWKSNoMatchingKey || e instanceof errors.JWKSMultipleMatchingKeys)) keysDown = true;
      throw e;
    }
  };
  let payload;
  try {
    ({ payload } = await jwtVerify(token, keys, { issuer: policy.issuer, audience: policy.audience, algorithms: ["RS256"],
      clockTolerance: 60, requiredClaims: ["exp"], currentDate: now }));
  } catch { throw keysDown ? unavailable() : denied(); }
  const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
  if (payload.type !== "app" || !email || typeof payload.sub !== "string" || !payload.sub) throw denied();
  return { email, sub: payload.sub };
}

// Once per request: the API gate, auth.js and the session route all ask, the assertion is checked once.
const checked = new WeakMap();
export function staffPrincipal(request, env) {
  if (!checked.has(request)) {
    const result = (async () => verifyAccessAssertion(request, loadAccessPolicy(env)))();
    result.catch(() => {});
    checked.set(request, result);
  }
  return checked.get(request);
}

// Staff paths are matched on the decoded path, like the router; a segment that decodes to a separator, a dot segment
// or another escape is refused instead of being guessed at.
export const oddStaffSegment = segments => segments.some(raw => {
  let s;
  try { s = decodeURIComponent(raw); } catch { return true; }
  return s === "." || s === ".." || /[/\\%]/.test(s);
});
