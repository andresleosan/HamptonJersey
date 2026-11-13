import { isPublicMedia, publicMediaTypeAllowed } from "./visibility.js";
import { currentAdmin } from "./auth.js";

const notFound = () => new Response("Not found", { status: 404, headers: { "cache-control": "private, no-store" } });
const PREFIX_BYTES = 1024, PDF = [0x25, 0x50, 0x44, 0x46, 0x2d];
const OFFICE_CONTAINERS = [[0x50, 0x4b, 0x03, 0x04], [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]];

// Inspect a bounded prefix without losing bytes from the response. These signatures do not
// validate the whole file or cover every document, malformed file, polyglot or metadata form.
async function inspectPublicBody(body) {
  const source = body instanceof ReadableStream ? body : new Response(body).body;
  if (!source) return null;
  const reader = source.getReader(), chunks = [];
  let size = 0, done = false, emptyChunks = 0;
  try {
    while (size < PREFIX_BYTES && !done) {
      const part = await reader.read(); done = part.done;
      if (!done && part.value?.byteLength) { chunks.push(part.value); size += part.value.byteLength; emptyChunks = 0; }
      else if (!done && ++emptyChunks > 16) { await reader.cancel().catch(() => {}); return null; }
    }
  } catch { await reader.cancel().catch(() => {}); return null; }
  const prefix = new Uint8Array(Math.min(size, PREFIX_BYTES));
  for (let offset = 0, i = 0; i < chunks.length && offset < prefix.length; i++) {
    const part = chunks[i].subarray(0, prefix.length - offset);
    prefix.set(part, offset); offset += part.length;
  }
  let document = OFFICE_CONTAINERS.some(signature => signature.every((value, i) => prefix[i] === value));
  for (let i = 0; !document && i <= prefix.length - PDF.length; i++) {
    if (PDF.every((value, j) => prefix[i + j] === value)) document = true;
  }
  let index = 0;
  const replay = new ReadableStream({
    async pull(controller) {
      try {
        if (index < chunks.length) {
          const chunk = chunks[index]; chunks[index++] = null; // release the prefix as soon as it is delivered
          controller.enqueue(chunk); return;
        }
        if (done) { controller.close(); reader.releaseLock(); return; }
        const part = await reader.read(); done = part.done;
        if (done) { controller.close(); reader.releaseLock(); } else controller.enqueue(part.value);
      } catch (error) { chunks.length = 0; controller.error(error); }
    },
    cancel(reason) { chunks.length = 0; return reader.cancel(reason); },
  });
  return { body: replay, document };
}

// 404 (not 403) for anything the caller may not see, so private files can't be confirmed to exist.
export async function serveMedia(request, env, id) {
  const row = await env.DB.prepare(
    "SELECT m.*, l.published, l.archived_at FROM media m JOIN listings l ON l.id = m.listing_id WHERE m.id = ?").bind(id).first();
  if (!row?.r2_key) return notFound();
  let pub = isPublicMedia(row, row);
  if (!pub && !(await currentAdmin(request, env))) return notFound();
  const key = new URL(request.url).searchParams.has("thumb") && row.thumb_key ? row.thumb_key : row.r2_key;
  const obj = await env.MEDIA.get(key);
  if (!obj) return notFound();
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  if (!headers.get("content-type") && row.content_type) headers.set("content-type", row.content_type);
  if (pub && !publicMediaTypeAllowed(headers.get('content-type'))) {
    if (!(await currentAdmin(request, env))) {
      if (obj.body instanceof ReadableStream) await obj.body.cancel().catch(() => {});
      return notFound();
    }
    pub = false;
  }
  let body = obj.body;
  if (pub) {
    const inspected = await inspectPublicBody(body);
    if (!inspected) return notFound();
    body = inspected.body;
    if (inspected.document) {
      if (!(await currentAdmin(request, env))) { await body.cancel().catch(() => {}); return notFound(); }
      pub = false;
    }
  }
  headers.set("etag", obj.httpEtag);
  headers.set("x-content-type-options", "nosniff");
  headers.set("cache-control", pub ? "public, max-age=86400" : "private, no-store");
  return new Response(body, { headers });
}
