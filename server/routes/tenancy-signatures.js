// ADM-19: mounted by server/api.js only when ADM19_SIGNATURE_READY is '1'. Staff session only, like the tenancy's
// other records. JSON in and out: no route here takes, returns or links to a file, or sends anything.
import { json } from "../http.js";
import { answer, ownBody } from "./tenancy-origins.js";
import { updateTenancy } from "./rent.js";
import { acceptedAgreementDate, readSignatures, saveSignatures } from "../tenancy-signatures.js";

// ADM-19 x ADM-20: the proposed agreement date, once a person accepts it, goes through the tenancy's own save, so its
// checks, regime label, history line and compare-and-set on updated_at (the tenancy the person read) all apply.
async function acceptAgreementDate({ request, env, admin, params: [id] }) {
  const b = await ownBody(request, id), agreement_on = await acceptedAgreementDate(env, b);
  const body = { agreement_on, updated_at: b.updated_at, ...("law_confirmed" in b ? { law_confirmed: b.law_confirmed } : {}) };
  return updateTenancy({ request: new Request("https://hampton.internal/", { method: "PUT", body: JSON.stringify(body) }), env, admin,
    params: [id] });
}

export default [
  ["GET", /^\/admin\/tenancy-signatures$/, async () => json({ ready: true }), true],
  ["GET", /^\/admin\/tenancies\/(\d+)\/signatures$/, async ({ env, params: [id] }) => json(await readSignatures(env, Number(id))), true],
  ["PUT", /^\/admin\/tenancies\/(\d+)\/signatures$/, async ({ request, env, admin, params: [id] }) =>
    answer(await saveSignatures(env, await ownBody(request, id), admin)), true],
  ["POST", /^\/admin\/tenancies\/(\d+)\/signatures\/agreement-date$/, acceptAgreementDate, true],
];
