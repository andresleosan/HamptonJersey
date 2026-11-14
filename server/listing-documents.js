// PUB-11: private PDF documents per listing (staff only, gated by PUB11_DOCUMENTS_READY).
// Rows live in listing_documents, never in media, so no public reader can list or serve them.
import { fail, json, now } from './http.js';
import { logEvent } from './events.js';

export const PRIVATE_DOCS = 'private-docs/';
export const documentsReady = env => env.PUB11_DOCUMENTS_READY === '1';
const MAX_BYTES = 20 * 1024 * 1024, MAX_DOCUMENTS = 50, STALE_MS = 10 * 60 * 1000;
const PDF = [0x25, 0x50, 0x44, 0x46, 0x2d], EOF = new TextEncoder().encode('%%EOF');
const COLUMNS = 'id, label, bytes, created_at, created_by';
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');

// Stream the body with a hard cap: a missing or lying content-length never buffers more than the limit.
async function readCapped(request) {
  if (Number(request.headers.get('content-length')) > MAX_BYTES) fail(413, 'The PDF is larger than 20 MB');
  const reader = request.body?.getReader(), chunks = [];
  let size = 0;
  for (let r; reader && !(r = await reader.read()).done;) {
    size += r.value.byteLength;
    if (size > MAX_BYTES) { await reader.cancel().catch(() => {}); fail(413, 'The PDF is larger than 20 MB'); }
    chunks.push(r.value);
  }
  return new Uint8Array(await new Blob(chunks).arrayBuffer());
}

// A PDF starts with %PDF- and ends with %%EOF (possibly followed by whitespace). This rejects other
// formats and truncated uploads; it does not parse or sanitize the PDF's internal objects.
function isPdf(bytes) {
  if (!PDF.every((v, i) => bytes[i] === v)) return false;
  const tail = bytes.subarray(Math.max(0, bytes.length - 1024));
  for (let i = tail.length - EOF.length; i >= 0; i--) if (EOF.every((v, j) => tail[i + j] === v)) return true;
  return false;
}

// Finish what an interrupted upload or removal left behind for this listing only: a stale pending
// intent is first claimed as 'removing' so a late commit cannot revive it, then object and row go.
// Runs on writes only (never on GET); an object delete failure leaves the row for the next attempt.
export async function reconcileDocuments(env, listingId) {
  await env.DB.prepare(`UPDATE listing_documents SET status = 'removing'
    WHERE listing_id = ? AND status = 'pending' AND created_at < ?`)
    .bind(listingId, new Date(Date.now() - STALE_MS).toISOString()).run();
  const { results } = await env.DB.prepare(`SELECT id, r2_key FROM listing_documents
    WHERE listing_id = ? AND status = 'removing' LIMIT 20`).bind(listingId).all();
  for (const doc of results) {
    try {
      await env.MEDIA.delete(doc.r2_key);
      await env.DB.prepare("DELETE FROM listing_documents WHERE id = ? AND status = 'removing'").bind(doc.id).run();
    } catch { /* retried on the next change */ }
  }
}

export async function listDocuments(env, listingId) {
  const { results } = await env.DB.prepare(`SELECT ${COLUMNS} FROM listing_documents
    WHERE listing_id = ? AND status = 'stored' ORDER BY created_at DESC, id LIMIT ${MAX_DOCUMENTS}`).bind(listingId).all();
  return results;
}

export async function addDocument(env, request, listingId, admin) {
  const type = (request.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
  if (type !== 'application/pdf') fail(415, 'Only PDF documents can be uploaded');
  let label = null;
  try { label = decodeURIComponent(request.headers.get('x-document-label') ?? ''); } catch { fail(400, 'Invalid document name'); }
  label = label.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200) || null;
  await reconcileDocuments(env, listingId);
  const bytes = await readCapped(request);
  if (!isPdf(bytes)) fail(400, 'This file is not a complete PDF');
  const sha256 = hex(await crypto.subtle.digest('SHA-256', bytes));
  const id = 'D' + crypto.randomUUID().replace(/-/g, '').slice(0, 16), key = `${PRIVATE_DOCS}${id}.pdf`;
  // Durable intent first: if the worker stops after the object write, reconciliation finds the key.
  const intent = await env.DB.prepare(`INSERT INTO listing_documents (id, listing_id, r2_key, label, bytes, sha256, created_at, created_by)
    SELECT ?, ?, ?, ?, ?, ?, ?, ? WHERE (SELECT COUNT(*) FROM listing_documents WHERE listing_id = ?) < ${MAX_DOCUMENTS}`)
    .bind(id, listingId, key, label, bytes.byteLength, sha256, now(), admin, listingId).run();
  if (!intent.meta.changes) fail(409, `This listing already has ${MAX_DOCUMENTS} documents. Remove one first.`);
  let stored;
  try {
    // R2 rejects the write if the received bytes do not match this digest.
    await env.MEDIA.put(key, bytes, { httpMetadata: { contentType: 'application/pdf' }, sha256 });
    [stored] = await env.DB.batch([
      env.DB.prepare("UPDATE listing_documents SET status = 'stored' WHERE id = ? AND status = 'pending'").bind(id),
      ...logEvent(env, { actor: admin, entity_type: 'admin', entity_id: `listing-document:${id}`, type: 'listing_document.added',
        data: { listing_id: listingId, document_id: id, bytes: bytes.byteLength } }, null, { ifChanged: true }),
    ]);
  } catch (error) {
    await cleanup(env, id, key);
    throw error;
  }
  if (!stored.meta.changes) { await cleanup(env, id, key); fail(409, 'The upload took too long. Please try again.'); }
  return env.DB.prepare(`SELECT ${COLUMNS} FROM listing_documents WHERE id = ?`).bind(id).first();
}

// Best effort: a leftover row is then a stale intent that reconciliation removes later.
async function cleanup(env, id, key) {
  try {
    await env.MEDIA.delete(key);
    await env.DB.prepare("DELETE FROM listing_documents WHERE id = ? AND status <> 'stored'").bind(id).run();
  } catch { /* reconciled on the next change */ }
}

const storedRow = (env, listingId, id) => env.DB.prepare(`SELECT id, label, r2_key FROM listing_documents
  WHERE id = ? AND listing_id = ? AND status = 'stored'`).bind(id, listingId).first();

export async function downloadDocument(env, listingId, id) {
  const row = await storedRow(env, listingId, id);
  if (!row) fail(404, 'Document not found');
  const obj = await env.MEDIA.get(row.r2_key);
  if (!obj) fail(404, 'Document not found');
  // A removal may have started while the object was read: never return its bytes afterwards.
  if (!(await storedRow(env, listingId, id))) {
    if (obj.body instanceof ReadableStream) await obj.body.cancel().catch(() => {});
    fail(404, 'Document not found');
  }
  const name = (row.label ?? id).replace(/[^A-Za-z0-9 ._-]+/g, '_').replace(/\.pdf$/i, '').slice(0, 100) || id;
  return new Response(obj.body, { headers: {
    'content-type': 'application/pdf',
    'content-disposition': `attachment; filename="${name}.pdf"`,
    'x-content-type-options': 'nosniff',
    'content-security-policy': "default-src 'none'; sandbox",
    'cache-control': 'private, no-store',
  } });
}

export async function removeDocument(env, listingId, id, admin) {
  await reconcileDocuments(env, listingId);
  const row = await storedRow(env, listingId, id);
  if (!row) fail(404, 'Document not found');
  const [claimed] = await env.DB.batch([
    env.DB.prepare("UPDATE listing_documents SET status = 'removing' WHERE id = ? AND listing_id = ? AND status = 'stored'")
      .bind(id, listingId),
    ...logEvent(env, { actor: admin, entity_type: 'admin', entity_id: `listing-document:${id}`, type: 'listing_document.removed',
      data: { listing_id: listingId, document_id: id } }, null, { ifChanged: true }),
  ]);
  if (!claimed.meta.changes) fail(404, 'Document not found');
  // Hidden from now on; if R2 fails here the row stays 'removing' and reconciliation retries.
  await reconcileDocuments(env, listingId);
  return json({ ok: true });
}
