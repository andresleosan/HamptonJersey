// PRE-06: what Access covers besides the API. The panel's static files go through a Function that checks the
// assertion, Pages really routes /admin/* to it, and every route that needs an admin sits under a path the Staff
// Access application covers. Synthetic keys only.
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { generateKeyPair, exportJWK, SignJWT } from "jose";
import { onRequest } from "../../functions/admin/_middleware.js";
import { ACCESS_HEADER } from "../../server/access.js";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const ISSUER = "https://pre06-panel.cloudflareaccess.com", AUD = "fedcba9876543210".repeat(4);
const { privateKey, publicKey } = await generateKeyPair("RS256");
const KEYS = { keys: [{ ...(await exportJWK(publicKey)), kid: "p1", alg: "RS256" }] };
globalThis.fetch = async input => String(input) === `${ISSUER}/cdn-cgi/access/certs` ? Response.json(KEYS)
  : new Response("no", { status: 404 });
const jwt = (email = "admin@example.test") => new SignJWT({ email, sub: "user-1", type: "app" })
  .setProtectedHeader({ alg: "RS256", kid: "p1" }).setIssuer(ISSUER).setAudience([AUD]).setIssuedAt()
  .setExpirationTime("1h").sign(privateKey);
const ON = { PRE06_ACCESS_READY: "1", ACCESS_TEAM_DOMAIN: ISSUER, ACCESS_STAFF_AUD: AUD, SITE_URL: "https://hampton.test" };

async function panel(env, path, token, host = "hampton.test") {
  let served = 0;
  const request = new Request(`https://${host}${path}`, { headers: token ? { [ACCESS_HEADER]: token } : {} });
  const res = await onRequest({ request, env, next: async () => { served++; return new Response("<!doctype html>panel"); } });
  return { status: res.status, served, body: await res.text(), cache: res.headers.get("cache-control"),
    frame: res.headers.get("x-frame-options"), robots: res.headers.get("x-robots-tag") };
}

test("panel files: off they are served as before; on only with a valid assertion for this host", async () => {
  for (const path of ["/admin", "/admin/", "/admin/index.html", "/admin/assets/index-abc.js"]) {
    for (const off of [{}, { ...ON, PRE06_ACCESS_READY: "0" }]) {
      const r = await panel(off, path, "garbage");
      assert.deepEqual([r.status, r.served, r.body], [200, 1, "<!doctype html>panel"], `off ${path}`);
    }
    const none = await panel(ON, path);
    assert.deepEqual([none.status, none.served, none.cache, none.frame, none.robots], [403, 0, "no-store", "DENY", "noindex"],
      `on, no assertion ${path}`);
    assert.doesNotMatch(none.body, /doctype/);
    assert.equal((await panel(ON, path, "garbage")).served, 0);
    assert.equal((await panel(ON, path, await jwt(), "hampton-preview.pages.dev")).status, 403);
    const ok = await panel(ON, path, await jwt());
    assert.deepEqual([ok.status, ok.served], [200, 1], `on, valid ${path}`);
  }
  const broken = await panel({ ...ON, ACCESS_TEAM_DOMAIN: "" }, "/admin/", await jwt());
  assert.deepEqual([broken.status, broken.served, broken.frame, broken.robots], [503, 0, "DENY", "noindex"], "misconfigured: closed");
});

test("Pages routes /admin/* to Functions, and only the paths it routed before besides it", () => {
  const out = mkdtempSync(join(tmpdir(), "pre06-routes-"));
  try {
    const build = spawnSync(join(ROOT, "node_modules/.bin/wrangler"), ["pages", "functions", "build", "--outdir",
      join(out, "worker"), "--output-routes-path", join(out, "routes.json")], { cwd: ROOT, encoding: "utf8", timeout: 120e3 });
    assert.equal(build.status, 0, build.stderr);
    const routes = JSON.parse(readFileSync(join(out, "routes.json"), "utf8"));
    assert.ok(routes.include.includes("/admin/*"), JSON.stringify(routes));
    assert.ok(!routes.include.includes("/*"), "the public site must not run a Function for every file");
    assert.deepEqual(routes.exclude, []);
    assert.deepEqual([...routes.include].sort(),
      ["/admin/*", "/api/*", "/media/*", "/p/*", "/properties", "/rental-application", "/robots.txt", "/sitemap.xml"]);
  } finally { rmSync(out, { recursive: true, force: true }); }
  // A hand-written _routes.json would replace the generated one; none may leave /admin out.
  assert.equal(existsSync(join(ROOT, "site/_routes.json")), false);
  // A file answering /admin itself would be served without the Function.
  assert.equal(existsSync(join(ROOT, "site/admin.html")), false);
});

test("every route that needs an admin lives where the Staff Access application covers it", async () => {
  const files = [...readdirSync(join(ROOT, "server/routes")).map(f => `server/routes/${f}`),
    ...readdirSync(join(ROOT, "server")).filter(f => f.endsWith(".js")).map(f => `server/${f}`)];
  let seen = 0;
  for (const f of files) {
    const mod = await import(join(ROOT, f));
    for (const value of Object.values(mod)) {
      if (!Array.isArray(value)) continue;
      for (const r of value) {
        if (!(Array.isArray(r) && typeof r[0] === "string" && r[1] instanceof RegExp && r[3] === true)) continue;
        seen++;
        assert.match(r[1].source, /^\^\\?\/(?:admin\\?\/|me\$)/, `${f}: ${r[0]} ${r[1].source}`);
      }
    }
  }
  assert.ok(seen > 100, `found ${seen} admin routes`);
});
