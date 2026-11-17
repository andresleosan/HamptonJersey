// SAP-09: Book viewing, from an applicant's record or one of its matches, of a home another agency advertises. A local
// slot is never the agency's acceptance, so this does not book: in one write it holds the time as a request (as the
// website's are) and opens VIS-17's proposal on it, linked to this search, with the client and the advertiser (and the
// negotiator, when attending) as the people who must accept. Staff record each answer on the viewing (VIS-17); it is
// confirmed only once everyone has accepted. The person is this search's contact, read here, never sent by the panel.
// Staff only; it exists with VIS-17's switch and answers 404 until migration 0114. Nothing is sent.
import { json, fail, readJson, now } from "../http.js";
import { logEvent } from "../events.js";
import { validateViewing, jerseyNow, isFree, addMinutes, SLOT_MINUTES } from "../viewings.js";
import { loadAvailability, bookStatement, policySnapshot } from "../viewing-store.js";
import { noticeCheck } from "../house-rules.js";
import { touchByViewing } from "../retention.js";
import { calendarBusyCheck } from "../viewing-calendar.js";
import { coordinationOn, validRequired, operationFits } from "../viewing-coordination.js";

const fields = f => json({ error: "Please check the highlighted fields.", fields: f }, 400);
const taken = () => json({ error: "That time was just booked. Please choose another." }, 409);

async function start({ request, env, admin, params: [aid] }) {
  if (!(await coordinationOn(env))) fail(404, "Not found");
  const id = /^[1-9]\d{0,15}$/.test(aid) && Number.isSafeInteger(Number(aid)) ? Number(aid) : fail(400, "Invalid applicant ID");
  const body = (await readJson(request)) ?? {}, clock = jerseyNow();
  const search = await env.DB.prepare(`SELECT a.id, a.operation, a.search_state, a.archived_at, c.name, c.email, c.phone
    FROM applicants a JOIN contacts c ON c.id = a.contact_id WHERE a.id = ?`).bind(id).first();
  if (!search) fail(404, "Applicant not found");
  if (search.archived_at || !["active", "needs_review"].includes(search.search_state))
    fail(409, "This search is not active. Reopen it to arrange a viewing.");
  const r = validateViewing({ listing_id: body.listing_id, kind: body.kind, negotiator_id: body.negotiator_id, date: body.date,
    time: body.time, name: search.name, email: search.email, phone: search.phone }, { today: clock.date, panel: true });
  if (r.errors) {
    const { name, email, phone, ...rest } = r.errors;
    if (name || email || phone) fail(409, "Add a name and an email or phone to this contact first.");
    return fields(rest);
  }
  const v = { ...r.value, notes: null };
  const listing = v.listing_id && await env.DB.prepare("SELECT operation FROM listings WHERE id = ?").bind(v.listing_id).first();
  if (!listing) return fields({ listing_id: "Choose the property" });
  if (!operationFits(listing.operation, search.operation))
    return fields({ listing_id: `This search is to ${search.operation}; this property is for ${listing.operation === "sale" ? "sale" : "rent"}` });
  const required = validRequired(["client", "advertiser", ...(body.staff === true ? ["staff"] : [])]);
  const a = await loadAvailability(env, { from: v.date, days: 1, now: clock, fromTomorrow: false, negotiatorId: v.negotiator_id,
    listingId: v.listing_id });
  if (a.property_viewings_enabled === false) return fields({ listing_id: "Viewings are disabled for this property." });
  if (!a.negotiators.length) return fields({ negotiator_id: "Choose an active negotiator" });
  const slots = a.days[0].slots[v.negotiator_id], policy = a.policies?.[v.negotiator_id] ?? null;
  if (!isFree(slots, v.time)) return slots.some(s => s.time === v.time) ? taken() : fields({ time: "That time is not available. Please choose another." });
  const end = addMinutes(v.time, policy?.duration_minutes ?? SLOT_MINUTES);
  const notice = await noticeCheck(env, v, clock, body.notice_confirmed === true);
  if (notice.error) return fields({ notice_confirmed: notice.error });
  const cal = await calendarBusyCheck(env, { negotiator_id: v.negotiator_id, date: v.date, time: v.time, end_time: end },
    { reviewed: body.calendar_reviewed });
  if (cal?.error) return json({ error: cal.error, code: cal.code }, 409);
  // One batch: the held request, its margins, its event (entity_id: the request's row), then the proposal on that row
  // (read back from the event just written) and its own event. Each later write happens only if the one before did, so
  // a slot taken meanwhile writes nothing at all.
  const ts = now();
  const [held] = await env.DB.batch([
    bookStatement(env, v, { status: "requested", policy, parish: a.parish ?? null, actor: admin, notice: notice.guard }),
    ...(policy ? [policySnapshot(env, policy, a.parish ?? null)] : []),
    ...logEvent(env, { actor: admin, entity_type: "viewing", entity_id: null, type: "viewing.requested",
      data: { listing_id: v.listing_id, date: v.date, time: v.time, kind: v.kind, negotiator_id: v.negotiator_id, coordinated: true,
        ...(notice.confirmed ? { notice_confirmed: true } : {}), ...(cal?.reviewed ? { calendar_reviewed: true } : {}) } }, null,
    { ifInserted: true }),
    env.DB.prepare(`INSERT INTO viewing_proposals (viewing_id, revision, applicant_id, negotiator_id, date, time, end_time, required,
        notice_confirmed, from_status, from_negotiator_id, from_date, from_time, created_at, created_by)
      SELECT CAST(e.entity_id AS INTEGER), 1, ?, ?, ?, ?, ?, ?, ?, 'requested', ?, ?, ?, ?, ?
      FROM events e WHERE e.id = last_insert_rowid() AND e.type = 'viewing.requested' AND changes() = 1`)
      .bind(search.id, v.negotiator_id, v.date, v.time, end, JSON.stringify(required), notice.confirmed ? 1 : 0,
        v.negotiator_id, v.date, v.time, ts, admin),
    env.DB.prepare(`INSERT INTO events (at, actor, entity_type, entity_id, type, data)
      SELECT ?, ?, 'viewing', CAST(p.viewing_id AS TEXT), 'viewing.proposed', ?
      FROM viewing_proposals p WHERE p.id = last_insert_rowid() AND changes() = 1`)
      .bind(ts, admin, JSON.stringify({ revision: 1, negotiator_id: v.negotiator_id, date: v.date, time: v.time, required,
        search_linked: true, from_applicant: true, ...(notice.confirmed ? { notice_confirmed: true } : {}) })),
    touchByViewing(env, v, ts),
  ]);
  if (!held.meta.changes) return taken();
  return json({ id: held.meta.last_row_id }, 201);
}

export default [["POST", /^\/admin\/applicants\/(\d+)\/viewing-proposals$/, start, true]];
