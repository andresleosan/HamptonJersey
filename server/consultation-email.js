// AGE-05 (M06): the clock's part of sending an enquiry by email, around the email pass of AUT-17 (server/jobs.js).
// Before any email is dispatched, an enquiry whose email still waits is checked again and, if it must no longer go
// out, taken out of the queue; after, what happened to each email is written on its enquiry (settle, in
// server/consultations.js). Nothing here calls the email provider.
import { enquiries } from "./consultations.js";
import { ENQUIRY_GATES } from "./routes/matches.js";

const { settle } = enquiries(ENQUIRY_GATES);
// An enquiry is queued only where the app has these switches on (sendReady), so the clock reads the same facts
// whatever its own vars say.
const ON = { AGE03_ENQUIRIES_READY: "1", AGE05_SEND_READY: "1", EST15_UNAVAILABILITY_READY: "1", EST16_AVAILABILITY_READY: "1" };

// false: the check could not be made, so the caller dispatches no email on this tick. Before migrations 0077 and
// 0080 no enquiry can be queued, so there is nothing to check.
export async function enquiryEmailPass(env) {
  try { await settle({ ...env, ...ON }); return true; }
  catch (e) {
    if (/no such (table|column)/.test(e?.message ?? "")) return true;
    console.error("Enquiry email pass failed"); // never the enquiry, its recipient or its text
    return false;
  }
}
