import { makeEnv, T0 } from "./helpers.mjs";
export const TS = "2026-11-06T08:00:00.000Z";
export function emailEnv(over = {}) {
  const env = makeEnv();
  env.SITE_URL = "https://www.hamptonestatesjersey.com";
  env.EMAIL_SERVICE_READY = "true";
  env.sent = [];
  env.EMAIL = { async send(message) { env.sent.push(message); return { messageId: `provider-${env.sent.length}` }; } };
  configure(env, over);
  return env;
}
export function configure(env, over = {}) {
  const value = { enabled: true, summary: true, recipients: ["team@example.test"], revision: 1,
    approved_by: "admin@example.test", approved_at: T0, ...over };
  env.DB.raw.prepare(`INSERT INTO app_settings (key,value,updated_at,updated_by) VALUES ('email',?,?,?)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value`).run(JSON.stringify(value), T0, "admin@example.test");
}
