import { isPublicMedia } from "./visibility.js";
import { currentAdmin } from "./auth.js";

const notFound = () => new Response("Not found", { status: 404 });

// 404 (not 403) for anything the caller may not see, so private files can't be confirmed to exist.
export async function serveMedia(request, env, id) {
  const row = await env.DB.prepare(
    "SELECT m.*, l.published, l.archived_at FROM media m JOIN listings l ON l.id = m.listing_id WHERE m.id = ?").bind(id).first();
  if (!row?.r2_key) return notFound();
  const pub = isPublicMedia(row, row);
  if (!pub && !(await currentAdmin(request, env))) return notFound();
  const key = new URL(request.url).searchParams.has("thumb") && row.thumb_key ? row.thumb_key : row.r2_key;
  const obj = await env.MEDIA.get(key);
  if (!obj) return notFound();
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  if (!headers.get("content-type") && row.content_type) headers.set("content-type", row.content_type);
  headers.set("etag", obj.httpEtag);
  headers.set("x-content-type-options", "nosniff");
  headers.set("cache-control", pub ? "public, max-age=86400" : "private, no-store");
  return new Response(obj.body, { headers });
}
