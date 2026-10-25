import { listingPage } from "../../server/seo.js";

// Tags the static page may carry for the home page (S4); the listing's own replace them.
const HOME_TAGS = 'meta[name="description"], meta[name="robots"], meta[property^="og:"], meta[name^="twitter:"], link[rel="canonical"]';

// S2: the SPA's index.html, with the listing's metadata for crawlers and link previews. HTMLRewriter only exists on
// Workers: listingPage (server/seo.js) is unit-tested, this layer by the e2e against `wrangler pages dev`.
export async function onRequestGet({ request, env, params }) {
  const [page, html] = await Promise.all([listingPage(request, env, params.id), env.ASSETS.fetch(new URL("/", request.url))]);
  const body = new HTMLRewriter()
    .on(HOME_TAGS, { element: e => e.remove() })
    .on("title", { element: e => { if (page.title) e.setInnerContent(page.title); } })
    .on("head", { element: e => e.append(page.head, { html: true }) })
    .transform(html).body;
  page.headers.set("content-type", "text/html; charset=utf-8");
  return new Response(body, { status: page.status, headers: page.headers });
}
