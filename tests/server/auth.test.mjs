import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPair, exportJWK, createLocalJWKSet, SignJWT } from "jose";
import { verifyFirebaseToken, signSession, readSession, getCookie, sameOrigin, currentAdmin, COOKIE } from "../../server/auth.js";
import { makeEnv, SECRET } from "./helpers.mjs";

const PROJECT = "hamptonestatesjersey";
const { privateKey, publicKey } = await generateKeyPair("RS256");
const jwks = createLocalJWKSet({ keys: [{ ...(await exportJWK(publicKey)), kid: "k1", alg: "RS256" }] });
const token = (claims = {}, opts = {}) => new SignJWT({ email: "Luis@Example.com", email_verified: true,
  firebase: { sign_in_provider: "google.com" }, ...claims })
  .setProtectedHeader({ alg: "RS256", kid: "k1" })
  .setIssuer(opts.iss ?? `https://securetoken.google.com/${PROJECT}`).setAudience(opts.aud ?? PROJECT)
  .setSubject("uid1").setIssuedAt().setExpirationTime(opts.exp ?? "1h").sign(privateKey);

test("a valid Google token yields the lower-cased email", async () => {
  assert.equal(await verifyFirebaseToken(await token(), PROJECT, jwks), "luis@example.com");
});

test("wrong audience, issuer, unverified email or non-Google provider are rejected", async () => {
  for (const t of [await token({}, { aud: "other" }), await token({}, { iss: "https://evil" }),
    await token({ email_verified: false }), await token({ firebase: { sign_in_provider: "password" } }),
    await token({}, { exp: Math.floor(Date.now() / 1000) - 60 })]) {
    await assert.rejects(verifyFirebaseToken(t, PROJECT, jwks));
  }
});

test("session cookie round-trips and rejects tampering or expiry", async () => {
  const v = await signSession("a@b.com", SECRET, 1000);
  assert.equal(await readSession(v, SECRET, 2000), "a@b.com");
  assert.equal(await readSession(v, SECRET, 1000 + 8 * 3600e3 + 1), null);
  assert.equal(await readSession(v.replace(/^./, c => (c === "a" ? "b" : "a")), SECRET, 2000), null);
  assert.equal(await readSession("garbage", SECRET), null);
  assert.equal(await readSession(null, SECRET), null);
  await assert.rejects(signSession("a@b.com", "short"), /SESSION_SECRET/);
});

test("currentAdmin re-checks the admins table on every request", async () => {
  const env = makeEnv();
  const req = async email => new Request("https://h.test/x", { headers: { cookie: `x=1; ${COOKIE}=${await signSession(email, SECRET)}` } });
  assert.equal(await currentAdmin(await req("luismadef45@gmail.com"), env), "luismadef45@gmail.com");
  assert.equal(await currentAdmin(await req("someone@else.com"), env), null);
  await env.DB.prepare("DELETE FROM admins WHERE email = ?").bind("luismadef45@gmail.com").run();
  assert.equal(await currentAdmin(await req("luismadef45@gmail.com"), env), null);
});

test("cookie parsing and same-origin check", () => {
  const r = new Request("https://h.test/api/x", { method: "POST", headers: { cookie: "a=1; __Host-hs=abc.def", origin: "https://h.test" } });
  assert.equal(getCookie(r, "__Host-hs"), "abc.def");
  assert.equal(sameOrigin(r), true);
  assert.equal(sameOrigin(new Request("https://h.test/x", { method: "POST", headers: { origin: "https://evil.test" } })), false);
  assert.equal(sameOrigin(new Request("https://h.test/x", { method: "POST" })), false);
});
