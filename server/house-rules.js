// VIS-10: what each house asks of a viewing: hours of notice while it is tenanted, who shows it and where its keys
// are (migration 0066). Staff only: the panel's routes below. The website reads noticeShort's answer, never the rules.
// Off (VIS10_HOUSE_RULES_READY) or before the migration, readHouseRules is undefined and every booking is as before.
import { json, fail, readJson, now } from "./http.js";
import { jerseyNow } from "./viewings.js";

export const houseRulesReady = env => env?.VIS10_HOUSE_RULES_READY === "1";
const FIELDS = ["notice_hours", "shown_by", "negotiator_id", "keys", "access_note"];
const NONE = { notice_hours: 0, shown_by: null, negotiator_id: null, keys: null, access_note: null };

// A listing's occupancy (PUB-07's, never copied) with its rules: their columns are null while none are saved.
// undefined: switched off, not migrated, or no listing asked for; null: no such listing.
export async function readHouseRules(env, listingId) {
  if (!houseRulesReady(env) || !listingId) return undefined;
  try {
    return await env.DB.prepare(`SELECT l.occupancy, r.notice_hours, r.shown_by, r.negotiator_id, n.name AS negotiator_name,
        n.active AS negotiator_active, r.keys, r.access_note, r.updated_at, r.updated_by
      FROM listings l LEFT JOIN listing_viewing_rules r ON r.listing_id = l.id LEFT JOIN negotiators n ON n.id = r.negotiator_id
      WHERE l.id = ?`).bind(listingId).first();
  } catch (e) {
    if (/no such (table|column)/.test(e?.message ?? "")) return undefined;
    throw e;
  }
}

// Minutes from the Jersey clock ({date, time}) to a viewing's start, both wall-clock values.
// ponytail: an hour out when a clock change falls in between (twice a year); compare instants if that ever matters.
const minutesTo = ({ date, time }, clock) => (Date.parse(`${date}T${time}:00Z`) - Date.parse(`${clock.date}T${clock.time}:00Z`)) / 60000;

// Whether a viewing at slot starts sooner than the house's notice. Only a house marked Tenanted asks for notice:
// unknown occupancy is never read as a tenant. The notice is Hampton's own rule, not a legal period or a consent.
export const noticeShort = (house, slot, clock = jerseyNow()) => house?.occupancy === "tenanted" && house.notice_hours > 0
  && !!slot?.date && !!slot.time && minutesTo(slot, clock) < house.notice_hours * 60;
export const noticeMessage = house => `This property is tenanted and needs ${house.notice_hours} hours' notice. `
  + "Confirm that access is agreed with the tenant, or choose a later time.";

// The same rule inside a booking's INSERT or a move's UPDATE: hours saved since readHouseRules are read again.
export const noticeGuard = (v, clock) => ({
  sql: `NOT EXISTS (SELECT 1 FROM listing_viewing_rules r JOIN listings l ON l.id = r.listing_id
    WHERE r.listing_id = ? AND l.occupancy = 'tenanted' AND r.notice_hours * 60 > ?)`,
  binds: [v.listing_id ?? null, minutesTo(v, clock)],
});

// What a booking or a move does about notice. confirmed: staff said access is agreed (the panel only; the website
// passes false). error: refuse with this text. guard: add to the write. confirmed: record it in the event.
export async function noticeCheck(env, v, clock, confirmed = false) {
  const house = await readHouseRules(env, v.listing_id);
  if (!house) return {};
  if (!noticeShort(house, v, clock)) return { guard: noticeGuard(v, clock) };
  return confirmed ? { confirmed: true } : { error: noticeMessage(house) };
}

const fields = f => json({ error: "Please check the highlighted fields.", fields: f }, 400);
const stale = "Someone else saved changes to these house rules. Reload to see them (your changes were not saved).";

function validate(body) {
  const src = body && typeof body === "object" && !Array.isArray(body) ? body : {};
  const errors = {}, value = {};
  const text = (k, max) => {
    const t = src[k] == null ? "" : typeof src[k] === "string" ? src[k].trim() : null;
    if (t == null || t.length > max) errors[k] = `Use ${max} characters or fewer`; else value[k] = t || null;
  };
  if (Number.isInteger(src.notice_hours) && src.notice_hours >= 0 && src.notice_hours <= 168) value.notice_hours = src.notice_hours;
  else errors.notice_hours = "Choose 0 to 168 hours";
  value.shown_by = src.shown_by || null;
  if (value.shown_by && !["negotiator", "owner", "tenant"].includes(value.shown_by)) errors.shown_by = "Choose who shows it";
  value.negotiator_id = value.shown_by === "negotiator" ? src.negotiator_id : null;
  if (value.shown_by === "negotiator" && !(Number.isSafeInteger(value.negotiator_id) && value.negotiator_id > 0))
    errors.negotiator_id = "Choose an active negotiator";
  text("keys", 200); text("access_note", 2000);
  return Object.keys(errors).length ? { errors } : { value };
}

const answer = house => json({ enabled: true, ...house });

async function show({ env, params: [id] }) {
  const house = await readHouseRules(env, id);
  if (house === undefined) return json({ enabled: false });
  return house ? answer(house) : fail(404, "Listing not found");
}

// updated_at: the one the form was loaded with (null: none saved yet). A save made meanwhile is refused, never merged.
async function save({ request, env, admin, params: [id] }) {
  const body = await readJson(request), cur = await readHouseRules(env, id);
  if (!cur) fail(404, cur === undefined ? "Not found" : "Listing not found");
  const r = validate(body);
  if (r.errors) return fields(r.errors);
  const v = r.value, was = cur.updated_at ? cur : NONE, changed = FIELDS.filter(k => v[k] !== was[k]);
  if ((body.updated_at ?? null) !== cur.updated_at) fail(409, stale);
  if (!changed.length) return answer(cur);
  if (v.negotiator_id && !(await env.DB.prepare("SELECT 1 FROM negotiators WHERE id = ? AND active = 1").bind(v.negotiator_id).first()))
    return fields({ negotiator_id: "Choose an active negotiator" });
  const at = now();
  const [saved] = await env.DB.batch([
    env.DB.prepare(`INSERT INTO listing_viewing_rules (listing_id, notice_hours, shown_by, negotiator_id, keys, access_note, updated_at, updated_by)
      SELECT ?, ?, ?, ?, ?, ?, ?, ? WHERE (SELECT updated_at FROM listing_viewing_rules WHERE listing_id = ?) IS ?
      ON CONFLICT (listing_id) DO UPDATE SET notice_hours = excluded.notice_hours, shown_by = excluded.shown_by,
        negotiator_id = excluded.negotiator_id, keys = excluded.keys, access_note = excluded.access_note,
        updated_at = excluded.updated_at, updated_by = excluded.updated_by`)
      .bind(id, ...FIELDS.map(k => v[k]), at, admin, id, cur.updated_at),
    // Who, when and which fields: the text of the keys and the note stays in its row only.
    env.DB.prepare("INSERT INTO listing_viewing_rule_changes (listing_id, at, actor, fields) SELECT ?, ?, ?, ? WHERE changes() = 1")
      .bind(id, at, admin, JSON.stringify(changed)),
  ]);
  if (!saved.meta.changes) fail(409, stale);
  return answer(await readHouseRules(env, id));
}

export default [
  ["GET", /^\/admin\/listings\/(HE-[A-Z]\d{3,})\/viewing-rules$/, show, true],
  ["PUT", /^\/admin\/listings\/(HE-[A-Z]\d{3,})\/viewing-rules$/, save, true],
];
