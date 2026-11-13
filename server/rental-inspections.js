import { HttpError } from './http.js';

// No inspection purpose/capability and storage lifecycle have been approved.
// This public service must stay unavailable until they are enforced atomically.
const unavailable=async()=>{throw new HttpError(503,'Inspection integration unavailable');};
export const scheduleInspection=unavailable;
export const saveInspection=unavailable;
export const completeInspection=unavailable;
export const reviewInspectionEvidence=unavailable;
export const revokeInspectionEvidence=unavailable;
