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
  const text = new TextDecoder().decode(await new Blob(chunks).arrayBuffer());
  try { return JSON.parse(text); } catch { fail(400, "Invalid JSON body"); }
}

export const now = () => new Date().toISOString();
