// ADM-16: mounted by server/api.js only when ADM16_TENANCY_EXIT_READY is '1'. Staff session only, like End tenancy.
// JSON in and out: no route here takes, returns or links to a file, and none removes what was recorded.
import { json } from "../http.js";
import { answer, ownBody } from "./tenancy-origins.js";
import { readExit, recordDepositOutcome, saveDepositProposal, saveExitInventory } from "../tenancy-exits.js";

const write = save => async ({ request, env, admin, params: [id] }) => answer(await save(env, await ownBody(request, id), admin));

export default [
  ["GET", /^\/admin\/tenancy-exits$/, async () => json({ ready: true }), true],
  ["GET", /^\/admin\/tenancies\/(\d+)\/exit$/, async ({ env, params: [id] }) => json(await readExit(env, Number(id))), true],
  ["PUT", /^\/admin\/tenancies\/(\d+)\/exit-inventory$/, write(saveExitInventory), true],
  ["PUT", /^\/admin\/tenancies\/(\d+)\/deposit-proposal$/, write(saveDepositProposal), true],
  ["POST", /^\/admin\/tenancies\/(\d+)\/deposit-outcomes$/, write(recordDepositOutcome), true],
];
