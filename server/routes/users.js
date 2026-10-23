import { json, fail, readJson, now } from "../http.js";
import { EMAIL } from "../viewings.js";

const list = async ({ env }) => json({ users: (await env.DB.prepare("SELECT * FROM admins ORDER BY email").all()).results });

// Shown instead of the email in "Assigned to" and the Timeline; blank = NULL (the email is shown).
function displayName(v) {
  if (v == null || (typeof v === "string" && !v.trim())) return null;
  if (typeof v !== "string") fail(400, "Enter the name as text");
  if (v.trim().length > 80) fail(400, "Use 80 characters or fewer for the name");
  return v.trim();
}

async function add({ request, env, admin }) {
  const body = await readJson(request);
  const email = String(body?.email ?? "").trim().toLowerCase();
  if (email.length > 254 || !EMAIL.test(email)) fail(400, "Invalid email");
  await env.DB.prepare("INSERT INTO admins (email, name, added_by, added_at) VALUES (?, ?, ?, ?) ON CONFLICT(email) DO NOTHING")
    .bind(email, displayName(body?.name), admin, now()).run();
  return json({ ok: true }, 201);
}

async function rename({ request, env, params: [email] }) {
  const body = await readJson(request);
  if (!body || typeof body !== "object" || !Object.hasOwn(body, "name")) fail(400, "Send name");
  const r = await env.DB.prepare("UPDATE admins SET name = ? WHERE email = ?").bind(displayName(body.name), email.toLowerCase()).run();
  if (!r.meta.changes) fail(404, "That email doesn't have access");
  return json({ ok: true });
}

// ponytail: no "last admin" check — you can't remove yourself and you are always an admin, so one always remains.
async function remove({ env, admin, params: [email] }) {
  if (email.toLowerCase() === admin) fail(400, "You can't remove your own access");
  const r = await env.DB.prepare("DELETE FROM admins WHERE email = ?").bind(email.toLowerCase()).run();
  if (!r.meta.changes) fail(404, "That email doesn't have access");
  return json({ ok: true });
}

export default [
  ["GET", /^\/admin\/users$/, list, true],
  ["POST", /^\/admin\/users$/, add, true],
  ["PUT", /^\/admin\/users\/([^/]+)$/, rename, true],
  ["DELETE", /^\/admin\/users\/([^/]+)$/, remove, true],
];
