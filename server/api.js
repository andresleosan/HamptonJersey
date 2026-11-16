import { missingClosureTable } from "./rental-closure.js";
import { json, fail, HttpError } from "./http.js";
import { currentAdmin, sameOrigin, accessMismatch } from "./auth.js";
import { accessReady, classifyAccessSurface, staffPrincipal, assertServiceAccess, oddSegment, AccessError } from "./access.js";
import { qaRoute } from "./qa-history.js";
import { STAFF_IMAGE_CACHE, staffMediaRoutes } from "./media.js";
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
import applicantTabRoutes from "./routes/applicant-tabs.js";
import matchRoutes from "./routes/matches.js";
import negotiatorRoutes from "./routes/negotiators.js";
import insightRoutes from "./routes/insights.js";
import saleRoutes from "./routes/sales.js";
import rentalRoutes from "./routes/rentals.js";
import rentRoutes, { arrearsReady, writeoffRoutes, renewalReady, renewalRoutes } from "./routes/rent.js";
import statementRoutes, { closingRoutes, statementsReady } from "./statements.js";
import accountingRoutes from "./rental-accounting.js";
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
import { dailySweepRoutes, sweepReady } from "./market-daily-sweep.js";
import demandRoutes from "./routes/demand.js";
import saleFollowupRoutes, { followupReady } from "./sale-followup.js";
import tenancyOriginRoutes from "./routes/tenancy-origins.js";
import tenancyExitRoutes from "./routes/tenancy-exits.js";
import { exitReady } from "./tenancy-exits.js";
import inspectionRoutes from "./routes/rental-inspections.js";
import { inspectionsReady } from "./rental-inspections.js";
import signatureRoutes from "./routes/tenancy-signatures.js";
import { signatureReady } from "./tenancy-signatures.js";
import documentRoutes from "./routes/listing-documents.js";
import { documentsReady } from "./listing-documents.js";
import missingPaymentRoutes from "./routes/missing-payments.js";
import { missingPaymentsReady } from "./missing-payments.js";
import legalRoutes, { legalTermsReady } from "./legal-terms.js";
import presentationRoutes from "./presentation-access.js";
import trashRoutes from "./property-photo-purge.js";
import chatContactRoutes, { chatContactReady } from "./chat-contact.js";
import chatApplicantRoutes, { chatApplicantReady } from "./chat-applicant.js";
import marketingPreferenceRoutes, { purposeReady } from "./communication-preferences.js";
import privacyRequestRoutes, { privacyRequestsReady } from "./privacy-requests.js";
import viewingGroupRoutes from "./routes/viewing-groups.js";
import { vis14Ready } from "./viewing-groups.js";
import { calendarRoutes, calendarOffRoutes, calendarReady } from "./viewing-calendar.js";
import { backupReady, withApplicationWrite, BackupMaintenanceError } from "./backup-write-gate.js";

const ACCESS_MESSAGES = {
  access_required: "Your security sign-in has expired. Sign in again to continue.",
  access_mismatch: "Your security sign-in is for a different account. Sign out, then sign in with the same Google account.",
  access_unavailable: "Staff sign-in is unavailable right now. Please try again in a few minutes.",
};
// Hermes's door and QA are called by programs with a service token, not by a person.
const SERVICE_ACCESS_MESSAGES = {
  access_required: "Missing or invalid Cloudflare Access service token for this service.",
  access_unavailable: "Cloudflare Access is not available for this service right now. Try again in a few minutes.",
};

// [method, path regex, handler, requiresAdmin]
const ROUTES = [...publicRoutes, ...ownerRoutes, ...sessionRoutes, ...listingRoutes, ...mediaRoutes, ...staffMediaRoutes, ...inboxRoutes, ...userRoutes, ...tourRoutes, ...notificationRoutes, ...notificationTaskRoutes, ...applicantRoutes, ...applicantTabRoutes, ...matchRoutes, ...negotiatorRoutes, ...insightRoutes, ...saleRoutes, ...rentalRoutes, ...rentRoutes, ...statementRoutes, ...accountingRoutes, ...reportRoutes, ...interestRoutes, ...hermesRoutes, ...automationRoutes, ...queueRoutes, ...chatRoutes, ...chatAdminRoutes, ...emailRoutes, ...advertiserRoutes, ...demandRoutes, ...presentationRoutes, ...trashRoutes];

// waitUntil(promise): keeps work running after the response is sent (Pages' context.waitUntil). Without one, the
// promise still runs, unawaited; pass only promises that never reject.
export async function handleApi(request, env, segments, waitUntil = () => {}) {
  const res = backupReady(env) ? await gated(request, env, segments, waitUntil) : await route(request, env, segments, waitUntil);
  // Admin, session and chat answers carry personal data: never cache them anywhere.
  // PRE-06: except a panel image from the Staff media route, kept in that browser's cache only (server/media.js).
  const staffImage = segments[0] === "admin" && segments[1] === "media" && res.headers.get("cache-control") === STAFF_IMAGE_CACHE;
  if (/^(admin|me|session|hermes|chat|qa|presentation)$/.test(segments[0] ?? "") && !staffImage) res.headers.set("cache-control", "no-store");
  // AGE-12: a client's private presentation is never indexed and never says where it was opened from.
  if (segments[0] === "presentation") { res.headers.set("x-robots-tag", "noindex"); res.headers.set("referrer-policy", "no-referrer"); }
  return res;
}

// PRE-14: every /api request, Hermes's door and GETs included, runs inside one write permit that stays open until the
// request's waitUntil work has finished; the answer goes out as soon as the route returns. While the weekly backup has
// the gate closed nothing runs (the body is not read) and the answer is 503 backup_maintenance with Retry-After 60.
function gated(request, env, segments, waitUntil) {
  const pending = [];
  let respond;
  const answer = new Promise(r => { respond = r; });
  const family = /^[a-z0-9-]{1,40}$/.test(segments[0] ?? "") ? segments[0] : "other";
  const permit = withApplicationWrite(env, { operation_id: `api:${family}` }, async () => {
    respond(await route(request, env, segments, p => { pending.push(p); }));
    for (let i = 0; i < pending.length; i++) await Promise.resolve(pending[i]).catch(() => {});
  });
  waitUntil(permit.catch(() => {}));
  return Promise.race([answer, permit.then(() => answer, e => {
    if (e instanceof BackupMaintenanceError) return json({ error: "Hampton is saving its weekly backup. Please try again in a minute.",
      code: e.code }, 503, { "retry-after": String(e.retryAfter) });
    console.error(e);
    return json({ error: "Server error. Please try again." }, 500);
  })]);
}

async function route(request, env, segments, waitUntil) {
  const method = request.method;
  let surface = "public";
  try {
    // Pages hands catch-all segments still percent-encoded (e.g. "x%40gmail.com").
    let path;
    try { path = "/" + segments.map(decodeURIComponent).join("/"); } catch { fail(400, "Bad URL encoding"); }
    // PRE-06: Staff, Hermes's door and QA pass Access before anything else runs; Hermes and QA keep their own keys.
    const access = accessReady(env);
    surface = access ? classifyAccessSurface({ pathname: "/api" + path }) : "public";
    if (surface !== "public") {
      await (surface === "staff" ? staffPrincipal(request, env) : assertServiceAccess(request, env, surface));
      if (oddSegment(segments)) fail(400, "Bad URL encoding");
    }
    // AUT-13: Hermes's door has its own key and no cookie, so the same-origin check (against cookie CSRF) is not its.
    if (segments[0] === "hermes") return await hermesDoor(request, env, path.slice("/hermes".length));
    if (method !== "GET" && method !== "HEAD" && !sameOrigin(request)) fail(403, "Cross-origin request blocked");
    if (segments[0] === "qa") return await qaRoute({request, env, path, segments});
    // Market tables require a separate migration and source review. New routes
    // stay absent unless the deployment explicitly enables the completed slice.
    let routes = [...ROUTES, ...(env.MARKET_INVENTORY_READY === '1' ? marketInventoryRoutes : []),
      ...(env.MARKET_INVENTORY_READY === '1' && sweepReady(env) ? dailySweepRoutes : []), // BUS-08: needs migration 0095
      ...(followupReady(env) ? saleFollowupRoutes : [])]; // OFE-06: needs migration 0053
    // AUT-10: the mode switch exists only with its migration (0054) and flag.
    if (env.AUT10_MODES_READY === '1') routes = [...routes, ...modeRoutes];
    if (env.ADM06_TENANCY_ORIGIN_READY === '1') routes = [...routes, ...tenancyOriginRoutes]; // ADM-06: needs migration 0056
    if (exitReady(env)) routes = [...routes, ...tenancyExitRoutes]; // ADM-16: needs migration 0059
    if (inspectionsReady(env)) routes = [...routes, ...inspectionRoutes]; // ADM-13: needs migration 0060
    if (signatureReady(env)) routes = [...routes, ...signatureRoutes]; // ADM-19: needs migration 0103
    if (documentsReady(env)) routes = [...routes, ...documentRoutes]; // PUB-11: needs migration 0058
    if (missingPaymentsReady(env)) routes = [...routes, ...missingPaymentRoutes]; // NOT-05: no migration
    if (legalTermsReady(env)) routes = [...routes, ...legalRoutes]; // ADM-17: saving needs migration 0063
    if (arrearsReady(env)) routes = [...routes, ...writeoffRoutes]; // ADM-09: needs migration 0045
    if (renewalReady(env)) routes = [...routes, ...renewalRoutes]; // ADM-14: no migration
    if (statementsReady(env)) routes = [...routes, ...closingRoutes]; // ADM-10: needs migration 0090
    if (chatContactReady(env)) routes = [...routes, ...chatContactRoutes]; // MSG-03: needs migration 0093
    if (chatApplicantReady(env)) routes = [...routes, ...chatApplicantRoutes]; // MSG-05: needs migrations 0093 and 0098
    if (purposeReady(env)) routes = [...routes, ...marketingPreferenceRoutes]; // PRE-10: needs migration 0096
    if (privacyRequestsReady(env)) routes = [...routes, ...privacyRequestRoutes]; // PRE-12: needs migration 0101
    if (vis14Ready(env)) routes = [...routes, ...viewingGroupRoutes]; // VIS-14: needs migration 0104
    routes = [...routes, ...(calendarReady(env) ? calendarRoutes : calendarOffRoutes)]; // VIS-12: needs migration 0105
    // AGE-14: advertiser personal-data removal needs migration 0057 and its flag.
    if (env.AGE14_SUPPRESSION_READY === '1') routes = [...routes, ...advertiserPrivacyRoutes];
    for (const [m, re, handler, auth] of routes) {
      const hit = m === method && re.exec(path);
      if (!hit) continue;
      if (auth && access) await staffPrincipal(request, env);
      const admin = auth ? await currentAdmin(request, env) : null;
      if (auth && !admin && access && await accessMismatch(request, env)) throw new AccessError(403, "access_mismatch");
      if (auth && !admin) fail(401, "Please sign in to continue");
      return await handler({ request, env, admin, params: hit.slice(1), waitUntil });
    }
    fail(404, "Not found");
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    if (e instanceof AccessError)
      return json({ error: (surface === "hermes" || surface === "qa" ? SERVICE_ACCESS_MESSAGES : ACCESS_MESSAGES)[e.code], code: e.code }, e.status);
    // PUB-16 switched on before migration 0087: a read runs again as switched off.
    if ((method === "GET" || method === "HEAD") && missingClosureTable(env, e))
      return route(request, { ...env, PUB16_TIMED_CLOSURE_READY: "0" }, segments, waitUntil);
    console.error(e);
    return json({ error: "Server error. Please try again." }, 500);
  }
}
