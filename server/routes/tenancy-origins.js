// ADM-06: mounted by server/api.js only when ADM06_TENANCY_ORIGIN_READY is '1'. Staff session only, like New tenancy.
// JSON in and out: no route here takes, returns or links to a file.
import { json, fail, readJson } from "../http.js";
import { asObject, fieldErrors } from "./rentals.js";
import { detail } from "./rent.js";
import { candidates, commitTenancyOrigin, prepareTenancyFromAgreement, readRecords, saveEntryInventory,
  saveSignedContract } from "../tenancy-origins.js";

const body = async request => asObject(await readJson(request));
const answer = r => (r.errors ? fieldErrors(r.errors) : json(r));
// The path names the tenancy; a body for another one (a form left open on another page) is refused.
const ownBody = async (request, id) => {
  const b = await body(request);
  if ("tenancy_id" in b && Number(b.tenancy_id) !== Number(id)) fail(400, "This form is for another tenancy. Reload the page");
  return { ...b, tenancy_id: Number(id) };
};

async function commit({ request, env, admin }) {
  const r = await commitTenancyOrigin(env, await body(request), admin);
  if (r.errors) return fieldErrors(r.errors);
  return json({ ...(await detail(env, r.tenancy_id)), replayed: r.replayed }, r.replayed ? 200 : 201);
}

export default [
  ["GET", /^\/admin\/tenancy-origins$/, async () => json({ ready: true }), true],
  ["GET", /^\/admin\/tenancy-origins\/candidates$/, async ({ env }) => json(await candidates(env)), true],
  ["POST", /^\/admin\/tenancy-origins\/preview$/, async ({ request, env }) =>
    answer(await prepareTenancyFromAgreement(env, await body(request))), true],
  ["POST", /^\/admin\/tenancy-origins\/commit$/, commit, true],
  ["GET", /^\/admin\/tenancies\/(\d+)\/records$/, async ({ env, params: [id] }) => json(await readRecords(env, Number(id))), true],
  ["PUT", /^\/admin\/tenancies\/(\d+)\/signed-contract$/, async ({ request, env, admin, params: [id] }) =>
    answer(await saveSignedContract(env, await ownBody(request, id), admin)), true],
  ["PUT", /^\/admin\/tenancies\/(\d+)\/entry-inventory$/, async ({ request, env, admin, params: [id] }) =>
    answer(await saveEntryInventory(env, await ownBody(request, id), admin)), true],
];
