import { robotsResponse } from "../server/seo.js";

export const onRequestGet = ({ request, env }) => robotsResponse(request, env);
