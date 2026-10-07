import { json, fail, HttpError } from "./http.js";
import { currentAdmin, sameOrigin } from "./auth.js";
import publicRoutes from "./routes/public.js";
import sessionRoutes from "./routes/session.js";
import listingRoutes from "./routes/listings.js";
import mediaRoutes from "./routes/media.js";
import inboxRoutes from "./routes/inbox.js";
import userRoutes from "./routes/users.js";

// [method, path regex, handler, requiresAdmin]
const ROUTES = [...publicRoutes, ...sessionRoutes, ...listingRoutes, ...mediaRoutes, ...inboxRoutes, ...userRoutes];

export async function handleApi(request, env, segments) {
  const res = await route(request, env, segments);
  // Admin and session answers carry personal data: never cache them anywhere.
  if (/^(admin|me|session)$/.test(segments[0] ?? "")) res.headers.set("cache-control", "no-store");
  return res;
}

async function route(request, env, segments) {
  const method = request.method;
  try {
    // Pages hands catch-all segments still percent-encoded (e.g. "x%40gmail.com").
    let path;
    try { path = "/" + segments.map(decodeURIComponent).join("/"); } catch { fail(400, "Bad URL encoding"); }
    if (method !== "GET" && method !== "HEAD" && !sameOrigin(request)) fail(403, "Cross-origin request blocked");
    for (const [m, re, handler, auth] of ROUTES) {
      const hit = m === method && re.exec(path);
      if (!hit) continue;
      const admin = auth ? await currentAdmin(request, env) : null;
      if (auth && !admin) fail(401, "Inicia sesión para continuar");
      return await handler({ request, env, admin, params: hit.slice(1) });
    }
    fail(404, "Not found");
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    console.error(e);
    return json({ error: "Error del servidor. Inténtalo de nuevo." }, 500);
  }
}
