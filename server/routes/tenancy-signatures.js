// ADM-19: mounted by server/api.js only when ADM19_SIGNATURE_READY is '1'. Staff session only, like the tenancy's
// other records. JSON in and out: no route here takes, returns or links to a file, or sends anything.
import { json } from "../http.js";
import { answer, ownBody } from "./tenancy-origins.js";
import { readSignatures, saveSignatures } from "../tenancy-signatures.js";

export default [
  ["GET", /^\/admin\/tenancy-signatures$/, async () => json({ ready: true }), true],
  ["GET", /^\/admin\/tenancies\/(\d+)\/signatures$/, async ({ env, params: [id] }) => json(await readSignatures(env, Number(id))), true],
  ["PUT", /^\/admin\/tenancies\/(\d+)\/signatures$/, async ({ request, env, admin, params: [id] }) =>
    answer(await saveSignatures(env, await ownBody(request, id), admin)), true],
];
