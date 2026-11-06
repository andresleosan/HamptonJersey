export const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", ...headers } });

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export const fail = (status, message) => { throw new HttpError(status, message); };

// Streams the body and stops at maxBytes, so an oversized or lying request is never buffered whole.
export async function readJson(request, maxBytes = 32768) {
  if (Number(request.headers.get("content-length")) > maxBytes) fail(413, "Request too large");
  const reader = request.body?.getReader(), chunks = [];
  for (let size = 0, r; reader && !(r = await reader.read()).done; chunks.push(r.value)) {
    size += r.value.byteLength;
    if (size > maxBytes) { await reader.cancel(); fail(413, "Request too large"); }
  }
  const text = await new Blob(chunks).text();
  try { return JSON.parse(text); } catch { fail(400, "Invalid JSON body"); }
}

export const now = () => new Date().toISOString();

// Hex SHA-256 of a text: bank rows (R9) and chat keys (MSG-02).
export const sha256 = async text => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)))]
  .map(b => b.toString(16).padStart(2, "0")).join("");
