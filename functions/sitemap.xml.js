import { sitemapResponse } from "../server/seo.js";

export const onRequestGet = ({ request, env }) => sitemapResponse(request, env);
