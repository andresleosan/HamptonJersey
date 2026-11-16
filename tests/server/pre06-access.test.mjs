// PRE-06: Cloudflare Access checked again at the origin for the Staff panel, the admin API, the session and private
// media. Keys, team domain and audience are synthetic and made here; nothing real is used or stored.
import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPair, exportJWK, createLocalJWKSet, SignJWT, UnsecuredJWT } from "jose";
import { handleApi } from "../../server/api.js";
import { verifyAccessAssertion, loadAccessPolicy, classifyAccessSurface, ACCESS_HEADER } from "../../server/access.js";
import { serveMedia } from "../../server/media.js";
import { makeEnv, adminCookie, seedListing, seedMedia } from "./helpers.mjs";

const ADMIN = "admin@example.test", OTHER = "colleague@example.test";
const AUD = "0123456789abcdef".repeat(4);
const team = n => `https://pre06-${n}.cloudflareaccess.com`;
const CERTS = "/cdn-cgi/access/certs";
const FIREBASE = "hamptonestatesjersey";
const GOOGLE_KEYS = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";

const good = await generateKeyPair("RS256", { extractable: true });
const bad = await generateKeyPair("RS256", { extractable: true });
const jwk = async (k, kid) => ({ ...(await exportJWK(k.publicKey)), kid, alg: "RS256", use: "sig" });
const KEYS = { keys: [await jwk(good, "k1")] };
const local = createLocalJWKSet(KEYS);

// Every key download goes through here: who asked for what, and what the "network" answers.
const fetched = [];
let network = url => url === GOOGLE_KEYS || url.endsWith(CERTS) ? Response.json(KEYS) : new Response("no", { status: 404 });
globalThis.fetch = async (input, init) => {
  const url = String(input instanceof Request ? input.url : input);
  fetched.push({ url, timeout: !!init?.signal });
  return network(url, init);
};

const now = () => Math.floor(Date.now() / 1000);
function assertion({ email = ADMIN, sub = "user-1", type = "app", iss = team("main"), aud = [AUD], exp = now() + 3600,
  nbf, kid = "k1", key = good.privateKey, alg = "RS256", extra = {} } = {}) {
  const claims = { type, ...extra };
  if (email !== null) claims.email = email; // null leaves the claim out
  if (sub !== null) claims.sub = sub;
  const jwt = new SignJWT(claims).setProtectedHeader({ alg, kid }).setIssuer(iss).setAudience(aud).setIssuedAt()
    .setExpirationTime(exp);
  if (nbf !== undefined) jwt.setNotBefore(nbf);
  return jwt.sign(key);
}
const firebaseToken = email => new SignJWT({ email, email_verified: true, firebase: { sign_in_provider: "google.com" } })
  .setProtectedHeader({ alg: "RS256", kid: "k1" }).setIssuer(`https://securetoken.google.com/${FIREBASE}`)
  .setAudience(FIREBASE).setSubject("uid1").setIssuedAt().setExpirationTime("1h").sign(good.privateKey);

const on = (over = {}) => ({ PRE06_ACCESS_READY: "1", ACCESS_TEAM_DOMAIN: team("main"), ACCESS_STAFF_AUD: AUD,
  SITE_URL: "https://hampton.test", ...over });
const world = (over = {}) => {
  const env = Object.assign(makeEnv(), over);
  seedListing(env);
  seedMedia(env, { id: "PUB1", r2_key: "media/p.jpg", thumb_key: "thumbs/p.jpg", public: 1 });
  seedMedia(env, { id: "PRIV1", r2_key: "media/q.jpg", thumb_key: "thumbs/q.jpg", public: 0, position: 1 });
  seedMedia(env, { id: "DOC1", r2_key: "media/plan.pdf", thumb_key: null, kind: "document", public: 0, position: 2,
    label: "Plan.pdf", content_type: "application/pdf" });
  seedMedia(env, { id: "SEC1", r2_key: "private-docs/id.pdf", thumb_key: null, kind: "document", public: 0, position: 3,
    label: "ID.pdf", content_type: "application/pdf" });
  const JPG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
  for (const k of ["media/p.jpg", "thumbs/p.jpg", "media/q.jpg", "thumbs/q.jpg"]) env.MEDIA.store.set(k, { body: JPG, type: "image/jpeg" });
  env.MEDIA.store.set("media/plan.pdf", { body: new TextEncoder().encode("%PDF-1.4 x"), type: "application/pdf" });
  env.MEDIA.store.set("private-docs/id.pdf", { body: new TextEncoder().encode("%PDF-1.4 y"), type: "application/pdf" });
  return env;
};

// One request to the API as Pages hands it over: raw segments, still percent-encoded.
async function api(env, method, path, { jwt, cookie, body, host = "hampton.test", origin = `https://${host}` } = {}) {
  const headers = new Headers();
  if (jwt !== undefined) headers.set(ACCESS_HEADER, jwt);
  if (cookie) headers.set("cookie", cookie);
  if (method !== "GET" && method !== "HEAD") headers.set("origin", origin);
  if (body !== undefined) headers.set("content-type", "application/json");
  const req = new Request(`https://${host}/api${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const res = await handleApi(req, env, path.split("?")[0].slice(1).split("/"));
  const text = method === "HEAD" ? "" : await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch {}
  return { status: res.status, headers: res.headers, data, text };
}

// ---- The validator on its own -------------------------------------------------------------------------------------

const policy = loadAccessPolicy(on());
const request = (jwt, host = "hampton.test") =>
  new Request(`https://${host}/api/me`, { headers: jwt === undefined ? {} : { [ACCESS_HEADER]: jwt } });
const verdict = async (jwt, opts = {}) => {
  try { return await verifyAccessAssertion(request(jwt, opts.host), opts.policy ?? policy, { jwks: opts.jwks ?? local }); }
  catch (e) { return { status: e.status }; }
};

test("a valid Access assertion yields the signed, lower-cased email", async () => {
  const p = await verdict(await assertion({ email: "Admin@Example.TEST" }));
  assert.equal(p.email, ADMIN);
  assert.equal(p.sub, "user-1");
});

test("missing, malformed or oversized assertions are refused with 403", async () => {
  assert.equal((await verdict(undefined)).status, 403);
  assert.equal((await verdict("")).status, 403);
  assert.equal((await verdict("not.a.jwt")).status, 403);
  const big = await assertion({ extra: { pad: "x".repeat(9000) } });
  assert.ok(big.length > 8192);
  assert.equal((await verdict(big)).status, 403);
});

test("a bad signature, wrong issuer, wrong audience or expired assertion is refused with 403", async () => {
  assert.equal((await verdict(await assertion({ key: bad.privateKey }))).status, 403, "signed by another key");
  assert.equal((await verdict(await assertion({ iss: team("other") }))).status, 403, "issuer");
  assert.equal((await verdict(await assertion({ aud: ["f".repeat(64)] }))).status, 403, "audience");
  assert.equal((await verdict(await assertion({ exp: now() - 120 }))).status, 403, "expired beyond 60 s");
  assert.equal((await verdict(await assertion({ nbf: now() + 120 }))).status, 403, "not yet valid");
  assert.equal((await verdict(await assertion({ exp: now() - 30 }))).email, ADMIN, "60 s clock tolerance");
});

test("alg none, HS256 and an unknown key id are refused with 403", async () => {
  const none = new UnsecuredJWT({ email: ADMIN, sub: "user-1", type: "app" }).setIssuer(team("main"))
    .setAudience([AUD]).setIssuedAt().setExpirationTime("1h").encode();
  assert.equal((await verdict(none)).status, 403, "alg none");
  const hs = await new SignJWT({ email: ADMIN, sub: "user-1", type: "app" }).setProtectedHeader({ alg: "HS256", kid: "k1" })
    .setIssuer(team("main")).setAudience([AUD]).setIssuedAt().setExpirationTime("1h").sign(new TextEncoder().encode("k".repeat(32)));
  assert.equal((await verdict(hs)).status, 403, "HS256");
  // The header says RS256 but the signature part is replaced by nothing.
  const stripped = (await assertion()).split(".").slice(0, 2).join(".") + ".";
  assert.equal((await verdict(stripped)).status, 403, "empty signature");
  assert.equal((await verdict(await assertion({ kid: "nope" }))).status, 403, "unknown kid");
});

test("only an app token for a person counts: type, email and subject are required", async () => {
  assert.equal((await verdict(await assertion({ type: "org" }))).status, 403);
  assert.equal((await verdict(await assertion({ email: null }))).status, 403);
  assert.equal((await verdict(await assertion({ email: "  " }))).status, 403);
  assert.equal((await verdict(await assertion({ sub: "" }))).status, 403, "a service token (empty sub) is not Staff");
  assert.equal((await verdict(await assertion({ sub: null }))).status, 403);
});

test("an assertion is only accepted on the configured site host", async () => {
  const jwt = await assertion();
  assert.equal((await verdict(jwt, { host: "hampton-preview.pages.dev" })).status, 403);
  assert.equal((await verdict(jwt)).email, ADMIN);
});

test("switched on without complete, valid configuration everything protected fails closed with 503", async () => {
  for (const over of [{ ACCESS_TEAM_DOMAIN: undefined }, { ACCESS_STAFF_AUD: undefined }, { SITE_URL: undefined },
    { ACCESS_TEAM_DOMAIN: "pre06-main.cloudflareaccess.com" }, { ACCESS_TEAM_DOMAIN: "https://evil.example.com" },
    { ACCESS_TEAM_DOMAIN: `${team("main")}/` }, { ACCESS_STAFF_AUD: "short" }, { SITE_URL: "not a url" }]) {
    assert.throws(() => loadAccessPolicy(on(over)), e => e.status === 503, JSON.stringify(over));
  }
});

test("keys come from the issuer's certs URL only, with a timeout, cached and refreshed", async t => {
  fetched.length = 0;
  const p = loadAccessPolicy(on({ ACCESS_TEAM_DOMAIN: team("cache") }));
  const jwt = await assertion({ iss: team("cache") });
  const viaNetwork = () => verifyAccessAssertion(request(jwt), p);
  assert.equal((await viaNetwork()).email, ADMIN);
  assert.equal((await viaNetwork()).email, ADMIN);
  assert.deepEqual(fetched, [{ url: team("cache") + CERTS, timeout: true }], "one download, from the issuer, with a timeout");
  // An unknown kid inside the 30 s cooldown does not download again.
  await assert.rejects(verifyAccessAssertion(request(await assertion({ iss: team("cache"), kid: "new" })), p), e => e.status === 403);
  assert.equal(fetched.length, 1);
  // After five minutes the keys must be downloaded again; if that fails, nothing is accepted on stale keys.
  const realNow = Date.now;
  t.after(() => { Date.now = realNow; network = url => url === GOOGLE_KEYS || url.endsWith(CERTS) ? Response.json(KEYS) : new Response("no", { status: 404 }); });
  Date.now = () => realNow() + 6 * 60e3;
  network = () => new Response("down", { status: 502 });
  await assert.rejects(viaNetwork(), e => e.status === 503);
  network = () => Promise.reject(new TypeError("network down"));
  await assert.rejects(viaNetwork(), e => e.status === 503);
  network = url => url.endsWith(CERTS) ? Response.json(KEYS) : new Response("no", { status: 404 });
  assert.equal((await viaNetwork()).email, ADMIN, "recovers once the keys are reachable");
  assert.ok(fetched.every(f => f.url === team("cache") + CERTS));
});

test("surfaces: the panel, the admin API, session and /me are Staff; the public site is not", () => {
  for (const p of ["/admin", "/admin/", "/admin/index.html", "/admin/assets/index-1.js", "/api/admin", "/api/admin/listings",
    "/api/session", "/api/me"]) assert.equal(classifyAccessSurface({ pathname: p }), "staff", p);
  for (const p of ["/", "/properties", "/p/HE-R001", "/media/PUB1", "/api/listings", "/api/chat", "/robots.txt",
    "/administrator", "/api/administer", "/api/meet"]) assert.equal(classifyAccessSurface({ pathname: p }), "public", p);
  assert.equal(classifyAccessSurface({ pathname: "/api/anything", requiresAdmin: true }), "staff");
});

// ---- Through the API ---------------------------------------------------------------------------------------------

test("switched off: behaviour is identical and Access is never consulted, whatever the headers say", async () => {
  fetched.length = 0;
  for (const off of [{}, { PRE06_ACCESS_READY: "0" }, on({ PRE06_ACCESS_READY: undefined })]) {
    const env = world(off), cookie = await adminCookie();
    for (const jwt of [undefined, "garbage", await assertion({ email: OTHER })]) {
      const me = await api(env, "GET", "/me", { cookie, jwt });
      assert.equal(me.status, 200); assert.equal(me.data.email, ADMIN);
      assert.equal((await api(env, "GET", "/admin/listings", { cookie, jwt })).status, 200);
      assert.equal((await api(env, "GET", "/admin/listings", { jwt })).status, 401);
      assert.equal((await api(env, "GET", "/listings", { jwt })).status, 200);
      const preview = await api(env, "GET", "/me", { cookie, jwt, host: "hampton-preview.pages.dev" });
      assert.equal(preview.status, 200, "no host rule while off");
    }
    const media = await serveMedia(new Request("https://hampton.test/media/PRIV1", { headers: { cookie } }), env, "PRIV1");
    assert.equal(media.status, 200, "a signed-in admin still sees private media on /media while off");
    fetched.length = 0;
    const signIn = await api(env, "POST", "/session", { body: { idToken: await firebaseToken(ADMIN) } });
    assert.equal(signIn.status, 200); assert.match(signIn.headers.get("set-cookie"), /__Host-hs=/);
    assert.ok(fetched.every(f => f.url === GOOGLE_KEYS), "only Google's keys are fetched");
  }
});

test("switched on: no assertion means 403 before any Staff route runs, also for unknown admin paths", async () => {
  const env = world(on()), cookie = await adminCookie();
  for (const [m, p] of [["GET", "/me"], ["GET", "/admin/listings"], ["GET", "/admin/does-not-exist"], ["DELETE", "/session"],
    ["POST", "/session"], ["GET", "/admin/media/PUB1/content"]]) {
    const r = await api(env, m, p, { cookie, body: m === "POST" ? { idToken: "x" } : undefined });
    assert.equal(r.status, 403, `${m} ${p}`);
    assert.equal(r.data.code, "access_required");
    assert.equal(r.headers.get("set-cookie"), null);
    assert.equal(r.headers.get("cache-control"), "no-store");
  }
  for (const jwt of ["garbage", await assertion({ key: bad.privateKey }), await assertion({ aud: ["f".repeat(64)] }),
    await assertion({ exp: now() - 3600 })]) assert.equal((await api(env, "GET", "/me", { cookie, jwt })).status, 403);
});

test("switched on: the public site, its API and public photos work without Access", async () => {
  const env = world(on());
  assert.equal((await api(env, "GET", "/listings")).status, 200);
  assert.equal((await api(env, "GET", "/config")).status, 200);
  const photo = await serveMedia(new Request("https://hampton.test/media/PUB1"), env, "PUB1");
  assert.equal(photo.status, 200);
});

test("switched on: a matching assertion and session reach the route; the Access email must be the session's", async () => {
  const env = world(on()), cookie = await adminCookie();
  const me = await api(env, "GET", "/me", { cookie, jwt: await assertion() });
  assert.equal(me.status, 200); assert.equal(me.data.email, ADMIN);
  assert.equal((await api(env, "GET", "/admin/listings", { cookie, jwt: await assertion({ email: "ADMIN@example.test" }) })).status, 200);
  for (const p of ["/me", "/admin/listings"]) {
    const mismatch = await api(env, "GET", p, { cookie, jwt: await assertion({ email: OTHER }) });
    assert.equal(mismatch.status, 403, p); assert.equal(mismatch.data.code, "access_mismatch");
    assert.equal(mismatch.headers.get("set-cookie"), null);
  }
  // A write with the wrong person changes nothing.
  const before = env.DB.raw.prepare("SELECT COUNT(*) AS n FROM admins").get().n;
  const add = await api(env, "POST", "/admin/users", { cookie, jwt: await assertion({ email: OTHER }), body: { email: "new@example.test" } });
  assert.equal(add.status, 403);
  assert.equal(env.DB.raw.prepare("SELECT COUNT(*) AS n FROM admins").get().n, before);
  // Access alone is not a Hampton session.
  assert.equal((await api(env, "GET", "/me", { jwt: await assertion() })).status, 401);
  // Removed from admins: the next request is refused even with a valid assertion.
  env.DB.raw.prepare("DELETE FROM admins WHERE email = ?").run(ADMIN);
  assert.equal((await api(env, "GET", "/me", { cookie, jwt: await assertion() })).status, 401);
});

test("switched on: sign-in needs the same Google account as Access before any cookie is signed", async () => {
  const env = world(on());
  const mismatch = await api(env, "POST", "/session", { jwt: await assertion({ email: OTHER }), body: { idToken: await firebaseToken(ADMIN) } });
  assert.equal(mismatch.status, 403); assert.equal(mismatch.data.code, "access_mismatch");
  assert.equal(mismatch.headers.get("set-cookie"), null);
  const ok = await api(env, "POST", "/session", { jwt: await assertion(), body: { idToken: await firebaseToken(ADMIN) } });
  assert.equal(ok.status, 200); assert.match(ok.headers.get("set-cookie"), /__Host-hs=/);
  const out = await api(env, "DELETE", "/session", { jwt: await assertion() });
  assert.equal(out.status, 200);
});

test("switched on: another host, encoded separators and dot segments are refused on Staff paths", async () => {
  const env = world(on()), cookie = await adminCookie(), jwt = await assertion();
  assert.equal((await api(env, "GET", "/me", { cookie, jwt, host: "hampton-preview.pages.dev" })).status, 403);
  assert.equal((await api(env, "GET", "/me", { cookie, jwt, host: "hamptonjersey.pages.dev" })).status, 403);
  for (const p of ["/admin%2Flistings", "/admin/%2E%2E/listings", "/admin/listings%5Cx", "/admin/%252e", "/admin/..",
    "/%61dmin/listings"]) {
    const r = await api(env, "GET", p, { cookie });
    assert.ok([400, 403].includes(r.status), `${p} → ${r.status}`);
  }
  for (const p of ["/admin%2Flistings", "/admin/%2E%2E/listings", "/admin/%252e"])
    assert.equal((await api(env, "GET", p, { cookie, jwt })).status, 400, p);
  // Unknown key servers or a misconfiguration never open the door.
  const broken = world(on({ ACCESS_STAFF_AUD: undefined }));
  const r = await api(broken, "GET", "/me", { cookie, jwt });
  assert.equal(r.status, 503); assert.equal(r.data.code, "access_unavailable");
  assert.equal((await api(broken, "GET", "/listings")).status, 200, "public API unaffected");
});

// ---- Private media -------------------------------------------------------------------------------------------------

test("switched on: private media is not served on the public /media route, even with a session", async () => {
  const env = world(on()), cookie = await adminCookie();
  const r = await serveMedia(new Request("https://hampton.test/media/PRIV1", { headers: { cookie } }), env, "PRIV1");
  assert.equal(r.status, 404);
  const withJwt = await serveMedia(new Request("https://hampton.test/media/PRIV1",
    { headers: { cookie, [ACCESS_HEADER]: await assertion() } }), env, "PRIV1");
  assert.equal(withJwt.status, 404, "the public route never falls back to a staff session while Access is on");
});

test("Staff media route: GET/HEAD, private, no-store, nosniff, PDFs as attachments, private documents never", async () => {
  for (const env of [world(), world(on())]) {
    const cookie = await adminCookie(), jwt = env.PRE06_ACCESS_READY ? await assertion() : undefined;
    const pub = await api(env, "GET", "/admin/media/PUB1/content", { cookie, jwt });
    assert.equal(pub.status, 200); assert.equal(pub.headers.get("content-type"), "image/jpeg");
    assert.equal(pub.headers.get("cache-control"), "no-store");
    assert.equal(pub.headers.get("x-content-type-options"), "nosniff");
    const priv = await api(env, "GET", "/admin/media/PRIV1/content?thumb", { cookie, jwt });
    assert.equal(priv.status, 200);
    const head = await api(env, "HEAD", "/admin/media/PRIV1/content", { cookie, jwt });
    assert.equal(head.status, 200);
    const pdf = await api(env, "GET", "/admin/media/DOC1/content", { cookie, jwt });
    assert.equal(pdf.status, 200); assert.match(pdf.headers.get("content-disposition"), /^attachment/);
    assert.equal((await api(env, "GET", "/admin/media/SEC1/content", { cookie, jwt })).status, 404);
    assert.equal((await api(env, "GET", "/admin/media/NOPE/content", { cookie, jwt })).status, 404);
    assert.equal((await api(env, "GET", "/admin/media/PRIV1/content", { jwt })).status, 401);
  }
});

test("the assertion header name is Cloudflare's", () => {
  assert.equal(ACCESS_HEADER, "cf-access-jwt-assertion");
});
