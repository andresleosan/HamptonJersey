import { listingPage } from "../../server/seo.js";

// Tags the static page may carry for the home page (S4); the listing's own replace them.
const HOME_TAGS = 'meta[name="description"], meta[name="robots"], meta[property^="og:"], meta[name^="twitter:"], link[rel="canonical"]';

// S2: the SPA's index.html, with the listing's metadata for crawlers and link previews. HTMLRewriter only exists on
// Workers: listingPage (server/seo.js) is unit-tested, this layer by the e2e against `wrangler pages dev`.
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
  const body = new HTMLRewriter()
    .on(HOME_TAGS, { element: e => e.remove() })
    .on("title", { element: e => { if (page.title) e.setInnerContent(page.title); } })
    // S7: the base of the links the page shares, from this deployment's SITE_URL. The listing's tags go right after it,
    // near the top of <head>: some preview robots read only the first bytes, and the inline CSS below is ~28 KB.
    .on('meta[name="site-url"]', { element: e => { e.setAttribute("content", page.siteUrl); e.after(page.head, { html: true }); } })
    .transform(html).body;
  page.headers.set("content-type", "text/html; charset=utf-8");
  return new Response(body, { status: page.status, headers: page.headers });
}

// Link checkers and some preview robots ask with HEAD first: the same answer without the body.
export const onRequestHead = async ctx => new Response(null, await onRequestGet(ctx));
