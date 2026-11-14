import { json, now, readJson } from "../http.js";
import { modesReady, readOperationModes, setOperationMode } from "../operation-modes.js";
import { jobLastActivity } from "../retention.js";
import { readWebchat } from "./chats.js";

// AUT-01 (spec 2026-11-01): the Automations screen. What runs on its own and when it last ran, from app_settings (clock,
// retention_run, hermes) and the jobs table. Counts, times and listing titles only: never who, nor a draft's text (A8).

// A4: the clock ticks every 10 minutes, Hermes asks every minute or two. Hermes never seen is not installed yet, not stopped.
const CLOCK_MS = 30 * 60e3, HERMES_MS = 15 * 60e3;
export const stoppedFlags = (clockAt, hermesAt, nowMs) => ({
  clock: !clockAt || nowMs - Date.parse(clockAt) > CLOCK_MS,
  hermes: !!hermesAt && nowMs - Date.parse(hermesAt) > HERMES_MS,
});

const CLOSED_AT = jobLastActivity("j"); // A7: when a used, discarded or failed job closed

async function automations({ env, admin }) {
  const since = new Date(Date.now() - 30 * 86400e3).toISOString();
  const [{ results: settings }, { results: month }, { results: waiting }, { results: recent }] = await env.DB.batch([
    env.DB.prepare("SELECT key, value FROM app_settings WHERE key IN ('clock', 'retention_run', 'hermes', 'webchat')"),
    env.DB.prepare(`SELECT j.status, COUNT(*) AS n FROM jobs j WHERE j.status IN ('used', 'discarded', 'failed')
      AND ${CLOSED_AT} >= ? GROUP BY j.status`).bind(since),
    env.DB.prepare(`SELECT j.id, j.listing_id, l.title, j.drafted_at FROM jobs j JOIN listings l ON l.id = j.listing_id
      WHERE j.status = 'draft' ORDER BY j.drafted_at, j.id`),
    env.DB.prepare(`SELECT j.id, j.listing_id, l.title, j.status, j.requested_by, j.created_at,
      CASE WHEN j.status IN ('used', 'discarded', 'failed') THEN ${CLOSED_AT} END AS closed_at
      FROM jobs j JOIN listings l ON l.id = j.listing_id ORDER BY j.id DESC LIMIT 20`),
  ]);
  const get = key => { const r = settings.find(s => s.key === key); return r ? JSON.parse(r.value) : null; };
  const clock = get("clock"), hermes = get("hermes"), retention = get("retention_run");
  const stopped = stoppedFlags(clock?.at, hermes?.at, Date.now());
  const n = status => month.find(m => m.status === status)?.n ?? 0;
  return json({
    clock: { at: clock?.at ?? null, stopped: stopped.clock },
    retention: retention && { ...retention, jobs: retention.jobs ?? 0, chats: retention.chats ?? 0 },
    hermes: { at: hermes?.at ?? null, stopped: stopped.hermes, month: { used: n("used"), discarded: n("discarded"), failed: n("failed") },
      waiting, recent: recent.map(({ requested_by, ...j }) => ({ ...j, by: requested_by === "hermes" ? "Hermes" : "Team" })) },
    webchat: readWebchat(settings.find(s => s.key === "webchat")?.value),
    // AUT-10: absent while the flag is off, so the screen is exactly as before.
    ...(modesReady(env) && { modes: await readOperationModes(env, admin) }),
  });
}

// H11, A6: Hermes or anyone in the panel can pause; already paused, who paused and when are kept. Resuming is the panel's
// alone (server/routes/hermes.js).
export async function pauseOutbound(env, by) {
  const ts = now();
  await env.DB.prepare(`INSERT INTO app_settings (key, value, updated_at, updated_by)
    VALUES ('outbound', json_object('paused', json('true'), 'at', ?1, 'by', ?2), ?1, ?2)
    ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by
    WHERE json_extract(app_settings.value, '$.paused') IS NOT 1`).bind(ts, by).run();
  const { value } = await env.DB.prepare("SELECT value FROM app_settings WHERE key = 'outbound'").first();
  const { at, by: who } = JSON.parse(value);
  return { paused: true, at, by: who };
}

const pause = async ({ env, admin }) => json({ outbound: await pauseOutbound(env, admin) });

// AUT-10: mounted by server/api.js only when AUT10_MODES_READY is '1'.
const setMode = async ({ request, env, admin }) => {
  const { status, policy } = await setOperationMode(env, admin, await readJson(request, 1024));
  return json(status === 409 ? { error: "Someone changed this mode first. Here is the current one.", policy } : { policy }, status);
};
export const modeRoutes = [["POST", /^\/admin\/automations\/modes$/, setMode, true]];

export default [
  ["GET", /^\/admin\/automations$/, automations, true],
  ["POST", /^\/admin\/outbound\/pause$/, pause, true],
];
