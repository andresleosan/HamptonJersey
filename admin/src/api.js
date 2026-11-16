export class ApiError extends Error {
  constructor(status, message, data, { code, outcome } = {}) {
    super(message); this.status = status; this.data = data; this.code = code; this.outcome = outcome;
  }
}

// PRE-06: Cloudflare Access answers an expired security sign-in with a redirect or a page of its own, never with
// Hampton's JSON. Nothing is retried: a write may or may not have reached the server, so its outcome is unknown.
const READS = new Set(["GET", "HEAD"]);
function reauth(method) {
  window.dispatchEvent(new Event("hs:access-reauth"));
  const read = READS.has(method);
  return new ApiError(0, read ? "Your security sign-in has expired. Sign in again to continue."
    : "Your security sign-in expired, so this change may or may not have been saved. Sign in again, then check it before trying again.",
  null, { code: "ACCESS_REAUTH_REQUIRED", outcome: read ? undefined : "unknown" });
}

// For the panel's own fetch calls too (downloads, uploads): the reauth error, already announced, or null.
// Their fetch must use redirect: "manual", like api().
export async function accessReauth(res, method = "GET") {
  if (res.type === "opaqueredirect" || (res.status >= 300 && res.status < 400)
    || /^text\/html/i.test(res.headers.get("content-type") ?? "")
    || (res.status === 403 && (await res.clone().json().catch(() => null))?.code === "access_required")) return reauth(method);
  return null;
}

export async function api(path, { method = "GET", body, form } = {}) {
  let res;
  try {
    res = await fetch(`/api${path}`, {
      method, credentials: "same-origin", redirect: "manual",
      headers: body !== undefined ? { "content-type": "application/json" } : undefined,
      body: form ?? (body !== undefined ? JSON.stringify(body) : undefined),
    });
  } catch { throw new ApiError(0, "Can't reach the server. Check your connection and try again."); }
  const lost = await accessReauth(res, method);
  if (lost) throw lost;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && path !== "/session") window.dispatchEvent(new Event("hs:signed-out"));
    throw new ApiError(res.status, data?.error || `Error ${res.status}`, data);
  }
  return data;
}
