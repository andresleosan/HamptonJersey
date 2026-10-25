import { robotsResponse } from "../server/seo.js";

export const onRequestGet = ({ request, env }) => robotsResponse(request, env);
// HEAD: the same status and headers, no body.
export const onRequestHead = async ctx => new Response(null, await onRequestGet(ctx));
