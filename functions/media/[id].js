import { serveMedia } from "../../server/media.js";

export const onRequestGet = ({ request, env, params }) => serveMedia(request, env, params.id);
