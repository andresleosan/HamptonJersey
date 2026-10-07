// Cloudflare's documented test secrets answer for hostname "example.com"; skip the hostname check for them.
const TEST_SECRET = /^[123]x0+AA$/;

export async function verifyTurnstile(token, secret, ip, hostname, fetchFn = fetch) {
  if (typeof token !== "string" || !token || !secret) return false;
  const body = new URLSearchParams({ secret, response: token });
  if (ip) body.set("remoteip", ip);
  const r = await fetchFn("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body });
  if (!r.ok) return false;
  const out = await r.json();
  return out.success === true && (TEST_SECRET.test(secret) || out.hostname === hostname);
}
