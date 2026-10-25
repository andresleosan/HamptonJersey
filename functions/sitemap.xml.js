import { sitemapResponse } from "../server/seo.js";

export const onRequestGet = ({ request, env }) => sitemapResponse(request, env);
// HEAD: the same status and headers, no body.
export const onRequestHead = async ctx => new Response(null, await onRequestGet(ctx));
