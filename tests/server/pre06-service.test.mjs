// PRE-06: the service lane. With Access on, Hermes's door (/api/hermes) and QA (/api/qa) also need a Cloudflare Access
// service-token assertion of their own application (own audience, Client ID in that service's allow list, empty sub),
// checked before their own keys, which they keep. Off, nothing changes. Synthetic keys and IDs only.
import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPair, exportJWK, SignJWT } from "jose";
import { handleApi } from "../../server/api.js";
import { ACCESS_HEADER, classifyAccessSurface, loadServicePolicy } from "../../server/access.js";
import { makeEnv, adminCookie } from "./helpers.mjs";

const ISSUER = "https://pre06-service.cloudflareaccess.com";
const STAFF_AUD = "1".repeat(64), HERMES_AUD = "2".repeat(64), QA_AUD = "3".repeat(64);
const HERMES_ID = `${"a".repeat(32)}.access`, QA_ID = `${"b".repeat(32)}.access`, STRANGER = `${"c".repeat(32)}.access`;
const KEY = "hermes-test-key-hermes-test-key-0123456789";
const QA_KEY = "qa-test-key-qa-test-key-qa-test-key-0123456789";

const { privateKey, publicKey } = await generateKeyPair("RS256");
const KEYS = { keys: [{ ...(await exportJWK(publicKey)), kid: "s1", alg: "RS256" }] };
let keyFetches = 0;
globalThis.fetch = async input => {
  if (String(input) !== `${ISSUER}/cdn-cgi/access/certs`) return new Response("no", { status: 404 });
  keyFetches++;
  return Response.json(KEYS);
};

// A service token as Cloudflare documents it: common_name = Client ID, sub empty, no email.
const token = ({ aud = HERMES_AUD, common_name = HERMES_ID, sub = "", email, nbf, exp = "1h", type = "app" } = {}) => {
  const claims = { type, sub };
  if (common_name !== null) claims.common_name = common_name;
  if (email) claims.email = email;
  const jwt = new SignJWT(claims).setProtectedHeader({ alg: "RS256", kid: "s1" }).setIssuer(ISSUER).setAudience([aud])
    .setIssuedAt().setExpirationTime(exp);
  if (nbf !== undefined) jwt.setNotBefore(nbf);
  return jwt.sign(privateKey);
};
const human = (aud = STAFF_AUD) => token({ aud, common_name: null, sub: "user-1", email: "admin@example.test" });

const ON = { PRE06_ACCESS_READY: "1", ACCESS_TEAM_DOMAIN: ISSUER, ACCESS_STAFF_AUD: STAFF_AUD, SITE_URL: "https://hampton.test",
  ACCESS_HERMES_AUD: HERMES_AUD, ACCESS_HERMES_CLIENT_IDS: HERMES_ID, ACCESS_QA_AUD: QA_AUD, ACCESS_QA_CLIENT_IDS: QA_ID };
const world = (over = {}) => ({ ...makeEnv(), HERMES_KEY: KEY, ...over });

async function api(env, method, path, { jwt, bearer = KEY, cookie, host = "hampton.test" } = {}) {
  const headers = new Headers();
  if (jwt !== undefined) headers.set(ACCESS_HEADER, jwt);
  if (bearer) headers.set("authorization", `Bearer ${bearer}`);
  if (cookie) headers.set("cookie", cookie);
  const res = await handleApi(new Request(`https://${host}/api${path}`, { method, headers }), env, path.split("?")[0].slice(1).split("/"));
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch {}
  return { status: res.status, data };
}

test("surfaces: Hermes's door and QA are services of their own", () => {
  for (const p of ["/api/hermes", "/api/hermes/status", "/api/hermes/jobs/next"]) assert.equal(classifyAccessSurface({ pathname: p }), "hermes");
  for (const p of ["/api/qa", "/api/qa/history"]) assert.equal(classifyAccessSurface({ pathname: p }), "qa");
  assert.equal(classifyAccessSurface({ pathname: "/api/admin/jobs" }), "staff", "the panel's Hermes screens are Staff");
  assert.equal(classifyAccessSurface({ pathname: "/api/hermesx" }), "public");
});

test("switched off: Hermes works with its key alone, whatever Access headers come along", async () => {
  keyFetches = 0;
  for (const off of [{}, { ...ON, PRE06_ACCESS_READY: "0" }, { ...ON, PRE06_ACCESS_READY: undefined }]) {
    const env = world(off);
    for (const jwt of [undefined, "garbage", await human()]) {
      assert.equal((await api(env, "GET", "/hermes/status", { jwt })).status, 200);
      assert.equal((await api(env, "GET", "/hermes/status", { jwt, bearer: "wrong-key-wrong-key-wrong-key-0000" })).status, 401);
    }
    assert.equal((await api(env, "GET", "/qa/history")).status, 503, "QA unconfigured, as before");
  }
  assert.equal(keyFetches, 0, "Access is never consulted");
});

test("switched on: Hermes needs its service assertion and still its key", async () => {
  const env = world(ON);
  const none = await api(env, "GET", "/hermes/status");
  assert.equal(none.status, 403); assert.equal(none.data.code, "access_required");
  assert.doesNotMatch(none.data.error, /staff|sign-in/i, "a service's own wording, not the panel's");
  const ok = await api(env, "GET", "/hermes/status", { jwt: await token() });
  assert.equal(ok.status, 200);
  assert.equal((await api(env, "GET", "/hermes/status", { jwt: await token(), bearer: null })).status, 401, "the key is still required");
  assert.equal((await api(env, "GET", "/hermes/status", { jwt: await token({ nbf: Math.floor(Date.now() / 1000) - 5 }) })).status, 200,
    "nbf is checked when present");
  assert.equal((await api(env, "GET", "/hermes/status", { jwt: await token({ nbf: Math.floor(Date.now() / 1000) + 600 }) })).status, 403);
  // An encoded path is the same door.
  assert.equal((await api(env, "GET", "/%68ermes/status")).status, 403);
});

test("switched on: wrong identities never cross lanes", async () => {
  const env = world(ON), cookie = await adminCookie();
  const refused = async (path, jwt, why, extra = {}) => {
    const r = await api(env, "GET", path, { jwt, ...extra });
    assert.equal(r.status, 403, `${why}: ${r.status} ${JSON.stringify(r.data)}`);
  };
  await refused("/hermes/status", await token({ common_name: null }), "no common_name");
  await refused("/hermes/status", await token({ common_name: "" }), "empty common_name");
  await refused("/hermes/status", await token({ common_name: STRANGER }), "Client ID not allowed");
  await refused("/hermes/status", await token({ sub: "user-1" }), "a person's subject");
  await refused("/hermes/status", await human(), "a person's Staff token");
  await refused("/hermes/status", await human(HERMES_AUD), "a person on Hermes's audience");
  await refused("/hermes/status", await token({ aud: QA_AUD, common_name: QA_ID }), "QA's token on Hermes");
  await refused("/hermes/status", await token({ aud: STAFF_AUD }), "Staff audience");
  await refused("/hermes/status", await token({ type: "org" }), "not an app token");
  await refused("/hermes/status", await token({ exp: Math.floor(Date.now() / 1000) - 120 }), "expired");
  await refused("/hermes/status", await token(), "another host", { host: "hampton-preview.pages.dev" });
  await refused("/qa/history", await token(), "Hermes's token on QA");
  await refused("/me", await token(), "Hermes's token on Staff", { cookie, bearer: null });
  await refused("/admin/jobs", await token(), "Hermes's token on the panel's Hermes screens", { cookie, bearer: null });
  await refused("/me", await token({ aud: STAFF_AUD, common_name: HERMES_ID }), "a service token on Staff's audience",
    { cookie, bearer: null });
});

test("switched on: QA passes with its own assertion and keeps its own checks", async () => {
  const env = world({ ...ON, QA_HISTORY_ACTIVE: "true", QA_HISTORY_KEY: QA_KEY, QA_DB: makeEnv().DB });
  assert.equal((await api(env, "GET", "/qa/history", { bearer: QA_KEY })).status, 403);
  const through = await api(env, "GET", "/qa/history", { jwt: await token({ aud: QA_AUD, common_name: QA_ID }), bearer: "x" });
  assert.equal(through.status, 401, "past Access, QA's own key decides");
});

test("switched on without a service's configuration that service stays closed (503); the others keep working", async () => {
  for (const [over, wrong] of [[{ ACCESS_HERMES_AUD: undefined }, "hermes"], [{ ACCESS_HERMES_CLIENT_IDS: "" }, "hermes"],
    [{ ACCESS_HERMES_CLIENT_IDS: "not-an-id" }, "hermes"], [{ ACCESS_HERMES_CLIENT_IDS: `${HERMES_ID}, ` }, "hermes"],
    [{ ACCESS_HERMES_AUD: STAFF_AUD }, "hermes"], [{ ACCESS_QA_AUD: undefined }, "qa"], [{ ACCESS_QA_AUD: HERMES_AUD }, "qa"]]) {
    assert.throws(() => loadServicePolicy({ ...ON, ...over }, wrong), e => e.status === 503, JSON.stringify(over));
  }
  const env = world({ ...ON, ACCESS_HERMES_AUD: undefined });
  const r = await api(env, "GET", "/hermes/status", { jwt: await token() });
  assert.equal(r.status, 503); assert.equal(r.data.code, "access_unavailable");
  assert.doesNotMatch(r.data.error, /staff|sign-in/i);
  assert.equal((await api(env, "GET", "/listings", { bearer: null })).status, 200, "public API unaffected");
  // Two Client IDs, comma separated, both accepted.
  const two = world({ ...ON, ACCESS_HERMES_CLIENT_IDS: `${STRANGER},${HERMES_ID}` });
  assert.equal((await api(two, "GET", "/hermes/status", { jwt: await token() })).status, 200);
});
