export const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", ...headers } });

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export const fail = (status, message) => { throw new HttpError(status, message); };

export async function readJson(request) {
  try { return await request.json(); } catch { fail(400, "Invalid JSON body"); }
}

export const now = () => new Date().toISOString();
