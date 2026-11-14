// NOT-05: mounted by server/api.js only when NOT05_MISSING_PAYMENTS_READY is '1'. Staff session, like Rentals › To do.
// Read only, but for the tab's grace period; nothing here sends a message, records a payment or marks a step.
import { json, readJson } from "../http.js";
import { fieldErrors } from "./rentals.js";
import { missingPayments, saveGrace } from "../missing-payments.js";

export default [
  ["GET", /^\/admin\/missing-payments$/, async ({ env }) => json(await missingPayments(env)), true],
  ["PUT", /^\/admin\/missing-payments\/grace$/, async ({ request, env, admin }) => {
    const r = await saveGrace(env, await readJson(request), admin);
    return r.errors ? fieldErrors(r.errors) : json(r);
  }, true],
];
