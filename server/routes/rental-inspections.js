// ADM-13: mounted by server/api.js only when ADM13_INSPECTIONS_READY is '1'. Staff session only, like the tenancy's
// other actions. JSON in and out: no route here takes, returns or links to a file, sends anything or makes a report.
import { json } from "../http.js";
import { fieldErrors } from "./rentals.js";
import { ownBody } from "./tenancy-origins.js";
import { decideRepair, readInspections, recordInspection } from "../rental-inspections.js";

const answer = r => (r.errors ? fieldErrors(r.errors) : json(r, r.replayed ? 200 : 201));

export default [
  ["GET", /^\/admin\/rental-inspections$/, async () => json({ ready: true }), true],
  ["GET", /^\/admin\/tenancies\/(\d+)\/inspections$/, async ({ env, params: [id] }) => json(await readInspections(env, Number(id))), true],
  ["POST", /^\/admin\/tenancies\/(\d+)\/inspections$/, async ({ request, env, admin, params: [id] }) =>
    answer(await recordInspection(env, await ownBody(request, id), admin)), true],
  ["POST", /^\/admin\/tenancies\/(\d+)\/inspections\/(\d+)\/repairs$/, async ({ request, env, admin, params: [id, inspection] }) =>
    answer(await decideRepair(env, { ...await ownBody(request, id), inspection_id: Number(inspection) }, admin)), true],
];
