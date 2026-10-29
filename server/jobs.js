import { now } from "./http.js";
import { retentionPass } from "./retention.js";

// AUT-07: the clock. Cloudflare wakes this Worker (hampton-jobs, configured in jobs/wrangler.toml) every 10 minutes, on
// the website's D1. Each tick leaves its time in app_settings.clock, then runs what is due. Each job claims its run in
// D1 first, so a repeated tick, or a panel poll, does not redo a run that is done.
export default {
  async scheduled(controller, env) {
    const ts = new Date(controller.scheduledTime).toISOString();
    await env.DB.prepare(`INSERT INTO app_settings (key, value, updated_at, updated_by)
      VALUES ('clock', json_object('at', ?1), ?2, 'system')
      ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`).bind(ts, now()).run();
    await retentionPass(env, ts); // G2: the first tick of each Jersey day deletes what is 12 months inactive.
  },
};
