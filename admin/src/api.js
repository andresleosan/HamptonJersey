export class ApiError extends Error {
  constructor(status, message, data) { super(message); this.status = status; this.data = data; }
}

export async function api(path, { method = "GET", body, form } = {}) {
  let res;
  try {
    res = await fetch(`/api${path}`, {
      method, credentials: "same-origin",
      headers: body !== undefined ? { "content-type": "application/json" } : undefined,
      body: form ?? (body !== undefined ? JSON.stringify(body) : undefined),
    });
  } catch { throw new ApiError(0, "Can't reach the server. Check your connection and try again."); }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && path !== "/session") window.dispatchEvent(new Event("hs:signed-out"));
    throw new ApiError(res.status, data?.error || `Error ${res.status}`, data);
  }
  return data;
}
