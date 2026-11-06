import { listingPage, withPageHead } from "../../server/seo.js";

// S2: the SPA's index.html, with the listing's metadata for crawlers and link previews. listingPage (server/seo.js) is
// unit-tested, the rewrite (withPageHead) by the e2e against `wrangler pages dev`.
export async function onRequestGet({ request, env, params }) {
  let page, html;
  try {
    [page, html] = await Promise.all([listingPage(request, env, params.id), env.ASSETS.fetch(new URL("/", request.url))]);
  } catch (err) {
    // D1 (or anything before the rewrite) failed: the plain page, whose own "Try again" covers the outage. 503 so a
    // search engine comes back later instead of keeping this answer; never cached.
    console.error("listing page", params.id, err);
    const r = await env.ASSETS.fetch(new URL("/", request.url));
    const headers = new Headers(r.headers);
    headers.set("cache-control", "no-store");
    return new Response(r.body, { status: 503, headers });
  }
  return withPageHead(html, page);
}

// Link checkers and some preview robots ask with HEAD first: the same answer without the body.
export const onRequestHead = async ctx => new Response(null, await onRequestGet(ctx));
