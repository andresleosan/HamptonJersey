// VIS-13: the client's answer to a viewing, on AGE-12's private page (its session cookie; no token in any URL or email):
// the viewings of the search behind their link, and Confirm (they will attend), ask for another time (the team
// proposes one; the viewing stays as it is) or Cancel (their own viewing only: in an open viewing, their place). Each
// write asks again, inside the statement, that the link is in force, the viewing is theirs (the search a person linked
// to it, VIS-17), at the time they saw and not started. GET only reads (mail scanners prefetch links); every change is
// a same-origin POST. Off (VIS13_REMINDERS_READY) or before the migrations: 404, as AGE-12's own routes.
import { json, fail, readJson, now } from "../http.js";
import { logEvent, resolveNotices } from "../events.js";
import { coordinationOn, closeOpenProposal } from "../viewing-coordination.js";
import { afterViewingChange } from "../viewing-calendar.js";
import { client, VALID } from "../presentation-access.js";
import { remindersReady, migrated, local, START, SLOT } from "../viewing-reminders.js";

const LINKED = `(SELECT p.applicant_id FROM viewing_proposals p WHERE p.viewing_id = v.id AND p.applicant_id IS NOT NULL
  ORDER BY p.revision DESC LIMIT 1)`;
// ?1 viewing, ?2 grant, ?3 now (ISO), ?4 date and ?5 time the client saw, ?6 Jersey now.
const MINE = `v.id = ?1 AND EXISTS (SELECT 1 FROM presentation_grants g WHERE g.id = ?2 AND ${VALID.replaceAll("?", "?3")}
  AND g.applicant_id = ${LINKED}) AND v.date = ?4 AND v.time = ?5 AND ${START} > ?6`;
const once = type => `NOT EXISTS (SELECT 1 FROM events e WHERE e.entity_type = 'viewing' AND e.entity_id = CAST(v.id AS TEXT)
  AND e.type = '${type}' AND json_extract(e.data, '$.slot') = ${SLOT})`;
const GONE = "This link is not available. Please contact Hampton Estates.";
const on = handler => client(async ctx => {
  if (!remindersReady(ctx.env) || !(await migrated(ctx.env))) fail(404, GONE);
  return handler(ctx);
});

async function mine(env, grant) {
  const { results } = await env.DB.prepare(`SELECT v.id, v.date, v.time, v.end_time, v.kind, v.status, v.listing_id,
      COALESCE(l.title, v.listing_title_snapshot) AS title, l.location,
      NOT ${once("viewing.client_confirmed")} AS confirmed, NOT ${once("viewing.client_reschedule_requested")} AS reschedule_requested
    FROM viewing_requests v LEFT JOIN listings l ON l.id = v.listing_id
    WHERE v.status IN ('requested', 'confirmed') AND ${START} > ? AND ${LINKED} = ? ORDER BY v.date, v.time LIMIT 20`)
    .bind(local(Date.now()), grant.applicant_id).all();
  return results.map(v => ({ ...v, confirmed: !!v.confirmed, reschedule_requested: !!v.reschedule_requested }));
}
const list = async ({ env, grant }) => json({ viewings: await mine(env, grant) });

const TASK = { reschedule: name => `Client asks for another viewing time: ${name}`, cancel: name => `Client cancelled the viewing: ${name}` };
// POST {date, time}: the time the client saw. A second answer of the same kind changes nothing.
async function answer({ request, env, grant, params: [id, action], waitUntil }) {
  const b = (await readJson(request, 256)) ?? {};
  if (!/^\d{4}-\d\d-\d\d$/.test(b.date ?? "") || !/^\d\d:\d\d$/.test(b.time ?? "")) fail(400, "Reload the page and try again.");
  const v = await env.DB.prepare("SELECT id, name FROM viewing_requests WHERE id = ?").bind(Number(id)).first();
  const ts = now(), args = [Number(id), grant.id, ts, b.date, b.time, local(Date.now()), ts];
  const ref = { entity_type: "viewing", entity_id: String(Number(id)) };
  const event = (type, states) => env.DB.prepare(`INSERT INTO events (at, actor, entity_type, entity_id, type, data)
    SELECT ?7, 'client', 'viewing', CAST(v.id AS TEXT), '${type}', json_object('slot', ${SLOT}) FROM viewing_requests v
    WHERE ${MINE} AND v.status IN (${states}) AND ${once(type)}`).bind(...args);
  let done = null;
  if (v && action === "confirm") {
    [done] = await env.DB.batch([event("viewing.client_confirmed", "'confirmed'"),
      // The 2-hour task about this time (server/viewing-reminders.js), if one was opened, is done.
      env.DB.prepare(`UPDATE notifications SET resolved_at = COALESCE(resolved_at, ?1), resolved_by = COALESCE(resolved_by, 'client'),
        closed_by_source = 1, task_actor = 'client', task_action = 'source_resolved' WHERE resolved_at IS NULL AND changes() = 1
        AND event_id IN (SELECT id FROM events WHERE entity_type = 'viewing' AND entity_id = ?2 AND type = 'viewing.client_unconfirmed'
          AND json_extract(data, '$.slot') = ?3)`).bind(ts, ref.entity_id, Number(b.date.replaceAll("-", "") + b.time.replace(":", "")))]);
  } else if (v && action === "reschedule") {
    [done] = await env.DB.batch([event("viewing.client_reschedule_requested", "'requested', 'confirmed'"),
      env.DB.prepare(`INSERT INTO notifications (event_id, category, title, action_required, created_at)
        SELECT last_insert_rowid(), 'task', ?, 1, ? WHERE changes() = 1`).bind(TASK.reschedule(v.name).slice(0, 200), ts)]);
  } else if (v) { // cancel, as the panel's Cancel (server/routes/inbox.js) with the client as its actor
    const coordination = await coordinationOn(env);
    [done] = await env.DB.batch([
      env.DB.prepare(`UPDATE viewing_requests AS v SET status = 'cancelled', updated_at = ?7, updated_by = 'client'
        WHERE ${MINE} AND v.status IN ('requested', 'confirmed')`).bind(...args),
      ...logEvent(env, { actor: "client", ...ref, type: "viewing.cancelled", data: { by: "client" } },
        { category: "task", title: TASK.cancel(v.name).slice(0, 200), action_required: true }, { ifInserted: true }),
      resolveNotices(env, { ...ref, category: "viewing" }, "client", { ifEvent: "viewing.cancelled" }),
      ...(coordination ? [closeOpenProposal(env, { id: Number(id), state: "cancelled", ts, admin: "client" })] : []),
    ]);
    if (done.meta.changes) afterViewingChange(env, waitUntil, Number(id)); // VIS-12: its Google event, if any
  }
  if (!done?.meta.changes) {
    const shown = (await mine(env, grant)).find(x => x.id === Number(id));
    if (!shown) fail(404, "This viewing is not available. Please contact Hampton Estates.");
    if (shown.date !== b.date || shown.time !== b.time) fail(409, "This viewing has changed. Reload the page to see it.");
    if (action === "confirm" ? !shown.confirmed : action !== "reschedule" || !shown.reschedule_requested)
      fail(409, action === "confirm" ? "This viewing is not confirmed yet: we will contact you." : "Reload the page and try again.");
  }
  return json({ viewings: await mine(env, grant) });
}

export default [
  ["GET", /^\/presentation\/viewings$/, on(list), false],
  ["POST", /^\/presentation\/viewings\/(\d+)\/(confirm|reschedule|cancel)$/, on(answer), false],
];
