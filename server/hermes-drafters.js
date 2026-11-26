import { fail } from "./http.js";

// AUT-15 (spec 2026-11-03): who may use Hermes drafts, that is spend Luis's personal ChatGPT plan. The app_settings row
// hermes_drafters holds a JSON list of emails, set by a remote SQL command (never in this public repo); no row or any
// other value means nobody. Not a role: never reuse it for another permission.
export async function canUseHermesDrafts(env, email) {
  const row = await env.DB.prepare("SELECT value FROM app_settings WHERE key = 'hermes_drafters'").first();
  try {
    const list = JSON.parse(row?.value);
    return Array.isArray(list) && list.some(e => typeof e === "string" && e.trim().toLowerCase() === email);
  } catch { return false; }
}
// Before reading the request, so someone off the list can't tell which listings exist.
export const draftersOnly = handler => async ctx => {
  if (!(await canUseHermesDrafts(ctx.env, ctx.admin))) fail(403, "Hermes drafts aren't available to your account.");
  return handler(ctx);
};
