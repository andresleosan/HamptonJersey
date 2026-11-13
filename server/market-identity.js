import { HttpError } from './http.js';

// The public service is intentionally unavailable. Source policy, staff
// membership and added_at are not a durable authorization/session generation.
// Future integration must adopt ADM-18 before connecting the transaction core.
const unavailable = async () => { throw new HttpError(503, 'Identity integration unavailable'); };
export const resolvePropertyIdentity = unavailable;
export const mergePropertyIdentities = unavailable;
export const undoPropertyIdentityDecision = unavailable;
export const readPropertyIdentity = unavailable;
