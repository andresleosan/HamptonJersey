import { handleApi } from "../../server/api.js";

// waitUntil: work that may finish after the response is sent.
export const onRequest = ({ request, env, params, waitUntil }) => handleApi(request, env, params.path ?? [], waitUntil);
