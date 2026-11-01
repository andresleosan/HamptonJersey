import { json, fail, HttpError } from "./http.js";
import { currentAdmin, sameOrigin } from "./auth.js";
import publicRoutes from "./routes/public.js";
import sessionRoutes from "./routes/session.js";
import listingRoutes from "./routes/listings.js";
import mediaRoutes from "./routes/media.js";
import inboxRoutes from "./routes/inbox.js";
import userRoutes from "./routes/users.js";
import tourRoutes from "./routes/tours.js";
import notificationRoutes from "./routes/notifications.js";
import applicantRoutes from "./routes/applicants.js";
import matchRoutes from "./routes/matches.js";
import negotiatorRoutes from "./routes/negotiators.js";
import insightRoutes from "./routes/insights.js";
import saleRoutes from "./routes/sales.js";
import rentalRoutes from "./routes/rentals.js";
import rentRoutes from "./routes/rent.js";
import reportRoutes from "./routes/report.js";
import interestRoutes from "./routes/interest.js";
import hermesRoutes, { hermesDoor } from "./routes/hermes.js";
import automationRoutes from "./routes/automations.js";

// [method, path regex, handler, requiresAdmin]
const ROUTES = [...publicRoutes, ...sessionRoutes, ...listingRoutes, ...mediaRoutes, ...inboxRoutes, ...userRoutes, ...tourRoutes, ...notificationRoutes, ...applicantRoutes, ...matchRoutes, ...negotiatorRoutes, ...insightRoutes, ...saleRoutes, ...rentalRoutes, ...rentRoutes, ...reportRoutes, ...interestRoutes, ...hermesRoutes, ...automationRoutes];

// waitUntil(promise): keeps work running after the response is sent (Pages' context.waitUntil). Without one, the
// promise still runs, unawaited; pass only promises that never reject.
export async function handleApi(request, env, segments, waitUntil = () => {}) {
  const res = await route(request, env, segments, waitUntil);
  // Admin and session answers carry personal data: never cache them anywhere.
  if (/^(admin|me|session|hermes)$/.test(segments[0] ?? "")) res.headers.set("cache-control", "no-store");
  return res;
}

async function route(request, env, segments, waitUntil) {
  const method = request.method;
  try {
    // Pages hands catch-all segments still percent-encoded (e.g. "x%40gmail.com").
    let path;
    try { path = "/" + segments.map(decodeURIComponent).join("/"); } catch { fail(400, "Bad URL encoding"); }
    // AUT-13: Hermes's door has its own key and no cookie, so the same-origin check (against cookie CSRF) is not its.
    if (segments[0] === "hermes") return await hermesDoor(request, env, path.slice("/hermes".length));
    if (method !== "GET" && method !== "HEAD" && !sameOrigin(request)) fail(403, "Cross-origin request blocked");
    for (const [m, re, handler, auth] of ROUTES) {
      const hit = m === method && re.exec(path);
      if (!hit) continue;
      const admin = auth ? await currentAdmin(request, env) : null;
      if (auth && !admin) fail(401, "Please sign in to continue");
      return await handler({ request, env, admin, params: hit.slice(1), waitUntil });
    }
    fail(404, "Not found");
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    console.error(e);
    return json({ error: "Server error. Please try again." }, 500);
  }
}
