// AGE-05 (M06): the clock's part of sending an enquiry by email, around the email pass of AUT-17 (server/jobs.js).
// The email pipeline claims an enquiry email only while enquiryEmailCheck holds, in the claim itself; after the
// dispatch, what happened to each email is written on its enquiry (settle, in server/consultations.js). Nothing here
// calls the email provider.
import { enquiries } from "./consultations.js";
import { ENQUIRY_GATES } from "./routes/matches.js";

const { settle, claimable } = enquiries(ENQUIRY_GATES);
// AGE05_SEND_READY is the clock's own (jobs/wrangler.toml, set as in the website's): off, no enquiry email is claimed
// and settle gives back what is queued. The facts an enquiry is checked against are read as the panel that queued it
// read them (sendReady needs AGE-03, EST-16 and EST-15 on), whatever the clock's vars say about them.
const FACTS = { AGE03_ENQUIRIES_READY: "1", EST15_UNAVAILABILITY_READY: "1", EST16_AVAILABILITY_READY: "1" };
const on = env => env.AGE05_SEND_READY === "1";

// The SQL server/email.js asks before claiming an enquiry email. "0" (none is claimed) while switched off, until
// migrations 0077 and 0080 are there, which is also before any can be queued, or if the schema cannot be read.
export async function enquiryEmailCheck(env) {
  if (!on(env)) return "0";
  try { await env.DB.prepare("SELECT email_ref FROM consultations LIMIT 0").all(); return claimable; }
  catch { return "0"; }
}

export async function enquiryEmailPass(env) {
  try { await settle({ ...env, ...FACTS, AGE05_SEND_READY: on(env) ? "1" : undefined }); }
  catch (e) {
    if (!/no such (table|column)/.test(e?.message ?? "")) console.error("Enquiry email pass failed"); // never the enquiry or its text
  }
}
