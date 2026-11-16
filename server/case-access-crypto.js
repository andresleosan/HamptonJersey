// ADM-12 (plan tp03-adm-12, Tarea 1): the primitives of the tenant's limited access, native WebCrypto only. A link or a
// session is 256 random bits and the database keeps its SHA-256; a 6-digit code lives in memory and the database keeps
// its HMAC-SHA256 under the operator's key (CASE_CHALLENGE_HMAC_KEY, never in Git), bound to its challenge and grant.
import { sha256 } from "./http.js";

const enc = new TextEncoder();
const b64u = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");

export const TOKEN = /^[A-Za-z0-9_-]{43}$/;
export const makeCaseToken = () => b64u(crypto.getRandomValues(new Uint8Array(32)));
export const hashCaseToken = token => sha256(token);

// Uniform over 000000-999999: values at or above 4294 × 10^6 are drawn again.
export function makeCode() {
  const n = new Uint32Array(1);
  do crypto.getRandomValues(n); while (n[0] >= 4294e6);
  return String(n[0] % 1e6).padStart(6, "0");
}

// The operator's key (32 characters or more), or null: without it no code is made and the routes stay closed.
export const caseKey = env => typeof env?.CASE_CHALLENGE_HMAC_KEY === "string" && env.CASE_CHALLENGE_HMAC_KEY.length >= 32
  ? env.CASE_CHALLENGE_HMAC_KEY : null;
const importKey = secret => crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
const message = (challengeId, grantId, code) => enc.encode(`adm12-case-challenge:${challengeId}:${grantId}:${code}`);

export const challengeDigest = async (secret, challengeId, grantId, code) =>
  hex(await crypto.subtle.sign("HMAC", await importKey(secret), message(challengeId, grantId, code)));
// In constant time, inside WebCrypto.
export const verifyDigest = async (secret, digest, challengeId, grantId, code) => /^[0-9a-f]{64}$/.test(digest)
  && crypto.subtle.verify("HMAC", await importKey(secret), Uint8Array.from(digest.match(/../g), h => parseInt(h, 16)),
    message(challengeId, grantId, code));
// Which key made a digest, so a rotated key fails old codes closed: a fingerprint, not the key.
export const keyId = async secret => hex(await crypto.subtle.sign("HMAC", await importKey(secret), enc.encode("adm12-key-id"))).slice(0, 16);
