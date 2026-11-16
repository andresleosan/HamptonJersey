import { accessReady, staffPrincipal, AccessError } from "../../server/access.js";

// PRE-06: the panel's files (/admin and everything under it) are served only to a request Access let through. Placed
// in functions/admin so that only /admin/* runs a Function; the public site's files stay static. Off: unchanged.
export async function onRequest({ request, env, next }) {
  if (!accessReady(env)) return next();
  try { await staffPrincipal(request, env); }
  catch (e) {
    if (!(e instanceof AccessError)) throw e;
    return new Response(e.status === 503 ? "Staff sign-in is unavailable right now. Please try again in a few minutes."
      : "Sign in through Hampton's security sign-in to open the Staff panel.",
    { status: e.status, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
  }
  return next();
}
