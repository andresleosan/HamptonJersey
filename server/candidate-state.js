import { CRITERIA } from "../site/requirements.js";

// EST-13 (M06): what is known about one candidate (a search and a property), one dimension each. None is read from
// another: an approval confirms no availability, a confirmed availability sends nothing, and each has its own writer.
const EVALUATION = { meets: "complete", pending: "to_confirm", alternative: "not_met", excluded: "not_met" };

// The checks of server/matching.js evaluate(), by key: their names on a card and in a clarification enquiry.
export const CHECK_LABEL = { ...Object.fromEntries(Object.entries(CRITERIA).map(([k, [label]]) => [k, label])), budget: "Budget", bedrooms: "Bedrooms",
  bathrooms: "Bathrooms", area: "Area", housing: "Housing", pets: "Pets", parking: "Parking", furnished: "Furnished", outdoor: "Outdoor", type: "Type",
  kind: "Property or business", use: "Use", floor_area: "Floor area", purchase: "Purchase price", rent: "Rent", premium: "Premium", expenses: "Running costs" };

// The must-haves the property does not answer: what a clarification enquiry may ask about.
export const unknownMusts = checks => checks.filter(c => c.priority === "must" && c.result === "unknown").map(c => c.key);

// EST-16: "confirmed" is written only from the confirmation in force for the property (a person's record with its own
// date, source, channel, evidence and scope: server/availability-confirmations.js), never from a listing's status, an
// approval or a request's payload. One that says not available is confirmed too, and is its own state.
export const availabilityState = confirmation => confirmation?.status === "available" ? "confirmed"
  : confirmation?.status === "unavailable" ? "confirmed_unavailable" : "not_confirmed";

// status and requirements_status: the match's own; decision_current: its approval covers the search and the property
// as they are now; clarification: the approved one still standing, if any; confirmation: the one in force, if any;
// consultation: the shared enquiry that covers the match now, if any (AGE-03: server/consultations.js).
export const candidateState = ({ status, requirements_status, decision_current, clarification, confirmation, consultation }) => ({
  evaluation: EVALUATION[requirements_status] ?? "to_confirm",
  decision: status === "found" ? "undecided" : status === "rejected" ? "rejected" : decision_current ? "approved" : "approved_outdated",
  availability: availabilityState(confirmation),
  // AGE-03: prepared while it waits to be sent by a person, sent_manually once someone records having sent it; the
  // app itself sends nothing (AGE-05). Without one, only an approved clarification waits.
  // AGE-06: awaiting_response once an answer said nothing useful, and answered_* once a person recorded what the
  // advertiser confirmed (answered alone: a clarification answered, or the outcome is not read while AGE-06 is off).
  enquiry: consultation?.status === "answered" ? ANSWERED[consultation.response_outcome] ?? "answered"
    : consultation?.status === "awaiting_response" ? "awaiting_response"
    : consultation?.status === "sent" ? "sent_manually" : consultation ? "prepared" : clarification ? "clarification_approved" : "not_sent",
});
const ANSWERED = { available: "answered_available", unavailable: "answered_unavailable" };
