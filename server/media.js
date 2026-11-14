import { isPublicMedia, publicMediaTypeAllowed } from "./visibility.js";
import { currentAdmin } from "./auth.js";
import { rentalClosureEnabled, rentalClosureVisibleSql } from './rental-closure.js';
import { PRIVATE_DOCS } from './listing-documents.js';

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
  // Only a leading PDF header (optionally after BOM/whitespace) is a signal. Searching anywhere
  // in an image prefix would mistake ordinary image comments for a document.
  let start = prefix[0] === 0xef && prefix[1] === 0xbb && prefix[2] === 0xbf ? 3 : 0;
  while ([0x09, 0x0a, 0x0c, 0x0d, 0x20].includes(prefix[start])) start++;
  if (!document && PDF.every((value, j) => prefix[start + j] === value)) document = true;
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

const loadRow = (env, id) => env.DB.prepare(
  `SELECT m.*, l.published, l.archived_at${rentalClosureEnabled(env) ? `, (${rentalClosureVisibleSql('l')}) AS closure_visible` : ''}
   FROM media m JOIN listings l ON l.id = m.listing_id WHERE m.id = ?`).bind(id).first();
const selectedKey = (row, thumb) => thumb && row.thumb_key ? row.thumb_key : row.r2_key;
const cancelBody = async body => { if (body instanceof ReadableStream && !body.locked) await body.cancel().catch(() => {}); };

// 404 (not 403) for anything the caller may not see, so private files can't be confirmed to exist.
export async function serveMedia(request, env, id) {
  const row = await loadRow(env, id);
  // PUB-11: private listing documents are never served here, not even to staff.
  if (!row?.r2_key || [row.r2_key, row.thumb_key].some(key => key?.startsWith(PRIVATE_DOCS))) return notFound();
  let pub = isPublicMedia(row, row) && (!rentalClosureEnabled(env) || row.closure_visible === 1);
  if (!pub && !(await currentAdmin(request, env))) return notFound();
  const thumb = new URL(request.url).searchParams.has("thumb"), key = selectedKey(row, thumb);
  const obj = await env.MEDIA.get(key);
  if (!obj) return notFound();
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  const objectType = headers.get("content-type");
  if (!objectType && row.content_type) headers.set("content-type", row.content_type);
  if (pub && !publicMediaTypeAllowed(headers.get('content-type'))) {
    if (!(await currentAdmin(request, env))) {
      await cancelBody(obj.body);
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
  // The row and authorization may have changed while the object or its prefix was read.
  // Never return bytes for a different resource or a removed row; downgrade a no-longer-public
  // resource to private only after rechecking the staff session.
  let latest;
  try { latest = await loadRow(env, id); }
  catch (error) { await cancelBody(body); throw error; }
  if (!latest?.r2_key || latest.listing_id !== row.listing_id || latest.created_at !== row.created_at ||
      latest.r2_key !== row.r2_key || latest.thumb_key !== row.thumb_key || selectedKey(latest, thumb) !== key) {
    await cancelBody(body); return notFound();
  }
  pub = pub && isPublicMedia(latest, latest) && (!rentalClosureEnabled(env) || latest.closure_visible === 1);
  if (!pub && !(await currentAdmin(request, env))) { await cancelBody(body); return notFound(); }
  if (!objectType) {
    if (latest.content_type) headers.set("content-type", latest.content_type);
    else headers.delete("content-type");
  }
  headers.set("etag", obj.httpEtag);
  headers.set("x-content-type-options", "nosniff");
  headers.set("cache-control", pub ? (rentalClosureEnabled(env) ? "no-store" : "public, max-age=86400") : "private, no-store");
  return new Response(body, { headers });
}
