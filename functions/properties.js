import { propertiesPage, withPageHead } from "../server/seo.js";

// PUB-22: /properties is the SPA's index.html with the catalogue's own title, description and canonical (not the home
// page's). Nothing here reads D1, so it cannot fail the way a listing page can.
export async function onRequestGet({ request, env }) {
  return withPageHead(await env.ASSETS.fetch(new URL("/", request.url)), propertiesPage(request, env));
}

export const onRequestHead = async ctx => new Response(null, await onRequestGet(ctx));
