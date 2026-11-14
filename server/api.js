import { json, fail, HttpError } from "./http.js";
import { currentAdmin, sameOrigin } from "./auth.js";
import { qaRoute } from "./qa-history.js";
import publicRoutes from "./routes/public.js";
import ownerRoutes from "./routes/owner-requests.js";
import sessionRoutes from "./routes/session.js";
import listingRoutes from "./routes/listings.js";
import mediaRoutes from "./routes/media.js";
import inboxRoutes from "./routes/inbox.js";
import userRoutes from "./routes/users.js";
import tourRoutes from "./routes/tours.js";
import notificationRoutes from "./routes/notifications.js";
import notificationTaskRoutes from "./routes/notification-tasks.js";
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
import automationRoutes, { modeRoutes } from "./routes/automations.js";
import queueRoutes from "./routes/queue.js";
import chatRoutes from "./routes/chat.js";
import chatAdminRoutes from "./routes/chats.js";
import emailRoutes from "./routes/email.js";
import advertiserRoutes from "./routes/advertisers.js";
import advertiserPrivacyRoutes from "./advertiser-privacy.js";
import marketInventoryRoutes from "./routes/market-inventory.js";
import demandRoutes from "./routes/demand.js";
import saleFollowupRoutes, { followupReady } from "./sale-followup.js";
import tenancyOriginRoutes from "./routes/tenancy-origins.js";
import tenancyExitRoutes from "./routes/tenancy-exits.js";
import { exitReady } from "./tenancy-exits.js";
import inspectionRoutes from "./routes/rental-inspections.js";
import { inspectionsReady } from "./rental-inspections.js";
import documentRoutes from "./routes/listing-documents.js";
import { documentsReady } from "./listing-documents.js";
import missingPaymentRoutes from "./routes/missing-payments.js";
import { missingPaymentsReady } from "./missing-payments.js";

// [method, path regex, handler, requiresAdmin]
const ROUTES = [...publicRoutes, ...ownerRoutes, ...sessionRoutes, ...listingRoutes, ...mediaRoutes, ...inboxRoutes, ...userRoutes, ...tourRoutes, ...notificationRoutes, ...notificationTaskRoutes, ...applicantRoutes, ...matchRoutes, ...negotiatorRoutes, ...insightRoutes, ...saleRoutes, ...rentalRoutes, ...rentRoutes, ...reportRoutes, ...interestRoutes, ...hermesRoutes, ...automationRoutes, ...queueRoutes, ...chatRoutes, ...chatAdminRoutes, ...emailRoutes, ...advertiserRoutes, ...demandRoutes];

// waitUntil(promise): keeps work running after the response is sent (Pages' context.waitUntil). Without one, the
// promise still runs, unawaited; pass only promises that never reject.
export async function handleApi(request, env, segments, waitUntil = () => {}) {
  const res = await route(request, env, segments, waitUntil);
  // Admin, session and chat answers carry personal data: never cache them anywhere.
  if (/^(admin|me|session|hermes|chat|qa)$/.test(segments[0] ?? "")) res.headers.set("cache-control", "no-store");
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
    if (segments[0] === "qa") return await qaRoute({request, env, path, segments});
    // Market tables require a separate migration and source review. New routes
    // stay absent unless the deployment explicitly enables the completed slice.
    let routes = [...ROUTES, ...(env.MARKET_INVENTORY_READY === '1' ? marketInventoryRoutes : []),
      ...(followupReady(env) ? saleFollowupRoutes : [])]; // OFE-06: needs migration 0053
    // AUT-10: the mode switch exists only with its migration (0054) and flag.
    if (env.AUT10_MODES_READY === '1') routes = [...routes, ...modeRoutes];
    if (env.ADM06_TENANCY_ORIGIN_READY === '1') routes = [...routes, ...tenancyOriginRoutes]; // ADM-06: needs migration 0056
    if (exitReady(env)) routes = [...routes, ...tenancyExitRoutes]; // ADM-16: needs migration 0059
    if (inspectionsReady(env)) routes = [...routes, ...inspectionRoutes]; // ADM-13: needs migration 0060
    if (documentsReady(env)) routes = [...routes, ...documentRoutes]; // PUB-11: needs migration 0058
    if (missingPaymentsReady(env)) routes = [...routes, ...missingPaymentRoutes]; // NOT-05: no migration
    // AGE-14: advertiser personal-data removal needs migration 0057 and its flag.
    if (env.AGE14_SUPPRESSION_READY === '1') routes = [...routes, ...advertiserPrivacyRoutes];
    for (const [m, re, handler, auth] of routes) {
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
