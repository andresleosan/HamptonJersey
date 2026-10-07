import { json, fail, readJson, now } from "../http.js";
import { EMAIL } from "../viewings.js";

const list = async ({ env }) => json({ users: (await env.DB.prepare("SELECT * FROM admins ORDER BY email").all()).results });

async function add({ request, env, admin }) {
  const email = String((await readJson(request))?.email ?? "").trim().toLowerCase();
  if (email.length > 254 || !EMAIL.test(email)) fail(400, "Invalid email");
  await env.DB.prepare("INSERT INTO admins (email, added_by, added_at) VALUES (?, ?, ?) ON CONFLICT(email) DO NOTHING")
    .bind(email, admin, now()).run();
  return json({ ok: true }, 201);
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
  ["DELETE", /^\/admin\/users\/([^/]+)$/, remove, true],
];
