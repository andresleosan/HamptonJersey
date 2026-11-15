// AGE-05 (M06): the clock's part of sending an enquiry by email, around the email pass of AUT-17 (server/jobs.js).
// The email pipeline claims an enquiry email only while enquiryEmailCheck holds, in the claim itself; after the
// dispatch, what happened to each email is written on its enquiry (settle, in server/consultations.js). Nothing here
// calls the email provider.
import { enquiries } from "./consultations.js";
import { ENQUIRY_GATES } from "./routes/matches.js";

const { settle, claimable } = enquiries(ENQUIRY_GATES);
// An enquiry is queued only where the app has these switches on (sendReady), so the clock reads the same facts
// whatever its own vars say.
const ON = { AGE03_ENQUIRIES_READY: "1", AGE05_SEND_READY: "1", EST15_UNAVAILABILITY_READY: "1", EST16_AVAILABILITY_READY: "1" };

// The SQL server/email.js asks before claiming an enquiry email. "0" (none is claimed) until migrations 0077 and 0080
// are there, which is also before any can be queued, or if the schema cannot be read.
export async function enquiryEmailCheck(env) {
  try { await env.DB.prepare("SELECT email_ref FROM consultations LIMIT 0").all(); return claimable; }
  catch { return "0"; }
}

export async function enquiryEmailPass(env) {
  try { await settle({ ...env, ...ON }); }
  catch (e) {
    if (!/no such (table|column)/.test(e?.message ?? "")) console.error("Enquiry email pass failed"); // never the enquiry or its text
  }
}
