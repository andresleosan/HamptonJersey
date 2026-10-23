export const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", ...headers } });

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export const fail = (status, message) => { throw new HttpError(status, message); };

export async function readJson(request, maxBytes = 32768) {
  const body = await request.text();
  if (new TextEncoder().encode(body).length > maxBytes) fail(413, "Request too large");
  try { return JSON.parse(body); } catch { fail(400, "Invalid JSON body"); }
}

export const now = () => new Date().toISOString();
