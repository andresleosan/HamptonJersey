export async function verifyTurnstile(token, secret, ip, fetchFn = fetch) {
  if (typeof token !== "string" || !token || !secret) return false;
  const body = new URLSearchParams({ secret, response: token });
  if (ip) body.set("remoteip", ip);
  const r = await fetchFn("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body });
  return r.ok && (await r.json()).success === true;
}
