// Test doubles for Cloudflare bindings: D1 on node:sqlite, R2 on a Map.
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";

const MIG = new URL("../../migrations/", import.meta.url);
export const T0 = "2026-10-07T10:00:00.000Z";

export function makeDb() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON;");
  for (const f of readdirSync(MIG).filter(f => f.endsWith(".sql")).sort()) db.exec(readFileSync(new URL(f, MIG), "utf8"));
  const stmt = (sql, args = []) => ({
    sql,
    bind: (...a) => stmt(sql, a),
    all: async () => ({ results: db.prepare(sql).all(...args), meta: {} }),
    first: async () => db.prepare(sql).get(...args) ?? null,
    run: async () => {
      const r = db.prepare(sql).run(...args);
      return { results: [], meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
    },
  });
  return {
    raw: db,
    prepare: sql => stmt(sql),
    async batch(stmts) {
      db.exec("BEGIN");
      try {
        const out = [];
        for (const s of stmts) out.push(/^\s*(SELECT|WITH)/i.test(s.sql) ? await s.all() : await s.run());
        db.exec("COMMIT");
        return out;
      } catch (e) { db.exec("ROLLBACK"); throw e; }
    },
  };
}

export function makeBucket() {
  const store = new Map();
  return {
    store,
    async put(key, body, opts) { store.set(key, { body, type: opts?.httpMetadata?.contentType }); },
    async get(key) {
      const o = store.get(key);
      return o && { body: o.body, httpEtag: '"test"', writeHttpMetadata: h => o.type && h.set("content-type", o.type) };
    },
    async delete(keys) { for (const k of [].concat(keys)) store.delete(k); },
  };
}

export const SECRET = "test-secret-test-secret-test-secret-0123";
export const makeEnv = () => ({
  DB: makeDb(), MEDIA: makeBucket(), SESSION_SECRET: SECRET,
  TURNSTILE_SECRET: "turnstile-test", TURNSTILE_SITE_KEY: "site-key", FIREBASE_PROJECT_ID: "hamptonestatesjersey",
});

const insert = (env, table, row) => {
  const cols = Object.keys(row);
  env.DB.raw.prepare(`INSERT INTO ${table} (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`)
    .run(...cols.map(c => row[c]));
  return row;
};
export const seedListing = (env, over = {}) => insert(env, "listings", {
  id: "HE-R001", use: "residential", title: "Le Bernage", operation: "sale", availability: "for_sale",
  country: "Jersey", location: "St Saviour", sale_price: 779000, currency: "GBP", bedrooms: 3,
  published: 1, specs: "[]", created_at: T0, updated_at: T0, updated_by: "import", ...over,
});
export const seedMedia = (env, over = {}) => insert(env, "media", {
  id: "A00001", listing_id: "HE-R001", r2_key: "media/hampton/a.jpg", thumb_key: "thumbs/hampton/a.jpg",
  origin: "hampton", kind: "photo", label: "Kitchen.png", public: 1, position: 0, content_type: "image/jpeg",
  created_at: T0, ...over,
});

import { handleApi } from "../../server/api.js";
import { signSession, COOKIE } from "../../server/auth.js";

export const ORIGIN = "https://hampton.test";
export async function call(env, method, path, { body, cookie, origin = ORIGIN, form } = {}) {
  const headers = new Headers();
  if (origin && method !== "GET") headers.set("origin", origin);
  if (cookie) headers.set("cookie", cookie);
  if (body !== undefined) headers.set("content-type", "application/json");
  const req = new Request(ORIGIN + "/api" + path, {
    method, headers, body: form ?? (body !== undefined ? JSON.stringify(body) : undefined) });
  const segments = path.split("?")[0].slice(1).split("/").map(decodeURIComponent); // Pages hands decoded segments
  const res = await handleApi(req, env, segments);
  return { status: res.status, headers: res.headers, data: await res.json().catch(() => null) };
}
export const adminCookie = async (email = "luismadef45@gmail.com") => `${COOKIE}=${await signSession(email, SECRET)}`;
