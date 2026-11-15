// EST-13 (M06): what is known about one candidate (a search and a property), one dimension each. None is read from
// another: an approval confirms no availability, a confirmed availability sends nothing, and each has its own writer.
const EVALUATION = { meets: "complete", pending: "to_confirm", alternative: "not_met", excluded: "not_met" };

// The must-haves the property does not answer: what a clarification enquiry may ask about.
export const unknownMusts = checks => checks.filter(c => c.priority === "must" && c.result === "unknown").map(c => c.key);

// EST-16: "confirmed" is written only from the confirmation in force for the property (a person's record with its own
// date, source, channel, evidence and scope: server/availability-confirmations.js), never from a listing's status, an
// approval or a request's payload. One that says not available is confirmed too, and is its own state.
export const availabilityState = confirmation => confirmation?.status === "available" ? "confirmed"
  : confirmation?.status === "unavailable" ? "confirmed_unavailable" : "not_confirmed";

// status and requirements_status: the match's own; decision_current: its approval covers the search and the property
// as they are now; clarification: the approved one still standing, if any; confirmation: the one in force, if any.
export const candidateState = ({ status, requirements_status, decision_current, clarification, confirmation }) => ({
  evaluation: EVALUATION[requirements_status] ?? "to_confirm",
  decision: status === "found" ? "undecided" : status === "rejected" ? "rejected" : decision_current ? "approved" : "approved_outdated",
  availability: availabilityState(confirmation),
  // The shared enquiry is AGE-03's to send ("sent" and what follows); until then only an approved clarification waits.
  enquiry: clarification ? "clarification_approved" : "not_sent",
});
