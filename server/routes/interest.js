import { json, fail, readJson, now } from "../http.js";
import { logEvent } from "../events.js";
import { personSql, interestRowsSql, interestDates, INTEREST_REASONS } from "../viewings.js";

const fields = f => json({ error: "Please check the highlighted fields.", fields: f }, 400);
const contact = r => ({ email: r.email, phone: r.phone });
const shape = r => ({ viewing_id: r.id, name: r.name, ...contact(r), date: r.date, time: r.time, status: r.status, outcome: r.outcome });

// VIS-02 (R1, R8): who counts in the listing's interest, each person once, from their latest viewing that counts and
// with the contacts of the bookings joined to them; and who the team took out and would count otherwise. The rows come
// latest first, so the first row of a person (or of one of their own identities) is the latest.
async function who({ env, params: [id] }) {
  const [[l], rows] = (await env.DB.batch([env.DB.prepare("SELECT title FROM listings WHERE id = ?").bind(id),
    env.DB.prepare(interestRowsSql).bind(id, ...interestDates())])).map(r => r.results);
  if (!l) fail(404, "Listing not found");
  const persons = new Map();
  for (const r of rows) (persons.get(r.person) ?? persons.set(r.person, []).get(r.person)).push(r);
  const people = [], removed = [];
  for (const g of persons.values()) {
    const live = g.filter(r => !r.interest_removed_at), [r] = live.length ? live : g;
    if (!live.length) {
      removed.push({ ...shape(r), removed_at: r.interest_removed_at, reason: r.interest_reason, note: r.interest_note });
      continue;
    }
    const also = new Map();
    for (const x of live) if (x.own !== r.own && !also.has(x.own)) also.set(x.own, contact(x));
    people.push({ ...shape(r), also: [...also.values()], joined: live.some(x => x.interest_same_as != null) });
  }
  return json({ title: l.title, active_interest: people.length, people, removed });
}

const EVENT = { remove: "viewing.uncounted", restore: "viewing.recounted", join: "viewing.joined", separate: "viewing.separated" };
// The listing of viewing `?` and the person it counts as.
const PERSON = `SELECT listing_id, ${personSql("v")} AS person FROM viewing_requests v WHERE v.id = ?`;

// VIS-02: one correction to the count, made to every viewing of the listing that counts as the same person as viewing
// `id` (R4): remove it with a reason, restore it, join it to the person of viewing `same_as` (R14), or separate what was
// joined to it.
async function correct({ request, env, admin, params: [id] }) {
  const body = await readJson(request);
  if (typeof body?.action !== "string" || !Object.hasOwn(EVENT, body.action)) fail(400, "Unknown action");
  const cur = await env.DB.prepare(PERSON).bind(Number(id)).first();
  if (!cur) fail(404, "Viewing not found");
  if (!cur.listing_id) fail(400, "This viewing isn't for a listing.");
  // The rows: those of the person (as read above) that the action changes. `only` may bind values of its own.
  let set, only, onlyBinds = [], persons = [cur.person], data = null;
  if (body.action === "remove") {
    const errors = {}, note = body.note ?? "";
    if (!INTEREST_REASONS.includes(body.reason)) errors.reason = "Choose a reason";
    if (typeof note !== "string" || note.trim().length > 200) errors.note = "Use 200 characters or fewer";
    else if (body.reason === "other" && !note.trim()) errors.note = "Add a note for Other";
    if (Object.keys(errors).length) return fields(errors);
    set = { interest_removed_at: now(), interest_reason: body.reason, interest_note: note.trim() || null };
    only = "interest_removed_at IS NULL";
    data = { reason: body.reason };
  } else if (body.action === "restore") {
    set = { interest_removed_at: null, interest_reason: null, interest_note: null };
    only = "interest_removed_at IS NOT NULL";
  } else if (body.action === "join") {
    const other = /^[1-9]\d{0,9}$/.test(String(body.same_as)) && await env.DB.prepare(PERSON).bind(Number(body.same_as)).first();
    if (!other || other.listing_id !== cur.listing_id) return fields({ same_as: "Choose who they are" });
    if (other.person === cur.person) fail(400, "They already count as one person.");
    // R14: the chosen person's viewings take the key too, so the join no longer depends on the viewing that ties a
    // phone to an email: if that one goes, both sides still count as one.
    set = { interest_same_as: other.person };
    only = "interest_same_as IS NOT ?";
    onlyBinds = [other.person];
    persons = [cur.person, other.person];
    data = { same_as: Number(body.same_as) };
  } else if (body.action === "separate") {
    set = { interest_same_as: null };
    only = "interest_same_as IS NOT NULL";
  }
  // R5: only the interest columns change, not updated_at, so a correction never makes someone's open viewing stale.
  // The person is matched as read above: when it changed meanwhile, nothing is written and the event isn't either.
  const [r] = await env.DB.batch([
    env.DB.prepare(`UPDATE viewing_requests SET ${Object.keys(set).map(c => `${c} = ?`).join(", ")}
      WHERE listing_id = ? AND ${only} AND ${personSql("viewing_requests")} IN (${persons.map(() => "?").join(", ")})`)
      .bind(...Object.values(set), cur.listing_id, ...onlyBinds, ...persons),
    ...logEvent(env, { actor: admin, entity_type: "viewing", entity_id: String(Number(id)), type: EVENT[body.action], data },
      null, { ifChanged: true }),
  ]);
  if (!r.meta.changes) fail(409, "Someone else changed this person's count. The list now shows the latest.");
  return json({ ok: true });
}

export default [
  ["GET", /^\/admin\/listings\/(HE-[A-Z]\d{3,})\/interest$/, who, true],
  ["PUT", /^\/admin\/viewings\/(\d+)\/interest$/, correct, true],
];
