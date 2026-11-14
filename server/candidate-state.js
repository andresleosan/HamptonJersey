// EST-13 (M06): what is known about one candidate (a search and a property), one dimension each. None is read from
// another: an approval confirms no availability, a confirmed availability sends nothing, and each has its own writer.
const EVALUATION = { meets: "complete", pending: "to_confirm", alternative: "not_met", excluded: "not_met" };

// The must-haves the property does not answer: what a clarification enquiry may ask about.
export const unknownMusts = checks => checks.filter(c => c.priority === "must" && c.result === "unknown").map(c => c.key);

// status and requirements_status: the match's own; decision_current: its approval covers the search and the property
// as they are now; clarification: the approved one still standing, if any.
export const candidateState = ({ status, requirements_status, decision_current, clarification }) => ({
  evaluation: EVALUATION[requirements_status] ?? "to_confirm",
  decision: status === "found" ? "undecided" : status === "rejected" ? "rejected" : decision_current ? "approved" : "approved_outdated",
  // "confirmed" is written only with its own date, person or channel, evidence and scope (EST-16, AGE-03): never from a
  // listing's status, an approval or a request's payload.
  availability: "not_confirmed",
  // The shared enquiry is AGE-03's to send ("sent" and what follows); until then only an approved clarification waits.
  enquiry: clarification ? "clarification_approved" : "not_sent",
});
