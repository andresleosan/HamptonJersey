// AUT-22 (AUT22_WEEKLY_EMAIL_READY, in both wrangler.toml): the week's saved Insights (weekly_insights, ANA-08) by email
// to the team summary's recipients (Settings > Automations), once per week and recipient, as one row of the approved
// queue (outbound, server/email.js) that Hermes's carrier sends verbatim. The text is written from the stored snapshot
// only, never recalculated, and carries its figures and listing references only: nobody's personal data. Approved as
// the team summary is: by whoever saved that configuration revision. The claim asks server/weekly-insights-email-check.js
// again. Off: nothing is queued and none is claimed.
import { sha256 } from "./http.js";
import { logEvent } from "./events.js";
import { readEmailSettings, serviceReady, hermesTransport, SITE } from "./email.js";
import { weeklyPeriod } from "./weekly-insights.js";
import { weeklyEmailReady, WEEKLY_TEMPLATE, WEEKLY_VERSION, WEEKLY_CLAIMABLE, notOwner } from "./weekly-insights-email-check.js";

const n = v => Number(v).toLocaleString("en-GB");
// The email from the snapshot's payload (version 1), the same for the same snapshot.
export function weeklyInsightsEmail(p) {
  const { from, to } = p.period, t = p.totals, first = p.coverage?.first_day;
  const lines = ["Hampton weekly Insights", `Week: ${from} to ${to} (Jersey dates)`, "",
    `${n(t.views)} listing views (opens, not people)`, `${n(t.viewing_requests)} viewing requests`,
    `${n(t.new_applicants)} new applicants`, `${n(t.viewings_completed)} viewings completed`, "",
    "Most viewed properties:",
    ...(p.most_viewed.length ? p.most_viewed.map((r, i) => `${i + 1}. ${r.listing_id}: ${n(r.views)} views`)
      : ["No listing views recorded for this week."]), "",
    !first || first > from ? "View counting may not cover the whole week." : "View counting covers the whole week.",
    "These figures were saved when the week closed and do not identify anyone.", "",
    `Open the saved report: ${SITE}/admin/#/insights/weekly/${from}`, "", "Hampton Estates",
    "Recipients: the team summary's, in Settings > Automations in the panel."];
  return { subject: `Hampton weekly Insights · ${from} to ${to}`, text: lines.join("\n") };
}

// The clock (server/jobs.js), after the weekly snapshot and before the email pass: queued weekly emails that may no
// longer go are cancelled, then the latest closed week's snapshot, if stored, is queued for each recipient.
export async function weeklyInsightsEmailPass(env, ts) {
  if (!weeklyEmailReady(env)) return;
  await env.DB.prepare(`UPDATE outbound SET status = 'cancelled', updated_at = ? WHERE status = 'queued'
    AND template = '${WEEKLY_TEMPLATE}' AND NOT (${WEEKLY_CLAIMABLE})`).bind(ts).run();
  const s = await readEmailSettings(env), week = weeklyPeriod(ts)?.from;
  if (!week || !((serviceReady(env) && env.EMAIL) || hermesTransport(env)) || !s.enabled || !s.summary || !s.approved_at
    || !s.approved_by || !s.recipients.length) return;
  const wi = await env.DB.prepare(`SELECT payload, ${WEEKLY_VERSION} AS version FROM weekly_insights wi WHERE week_start = ?`)
    .bind(week).first();
  if (!wi) return; // no snapshot for the week: none is made here
  const { subject, text } = weeklyInsightsEmail(JSON.parse(wi.payload));
  const statements = (await Promise.all(s.recipients.map(async recipient => {
    const hash = await sha256(recipient), ref = crypto.randomUUID().replaceAll("-", "");
    return [env.DB.prepare(`INSERT INTO outbound(ref,dedupe_key,template,entity_id,version,recipient,recipient_hash,
      subject,text,status,approved_by,approved_at,config_revision,created_at,updated_at)
      SELECT ?1,?2,'${WEEKLY_TEMPLATE}',?3,?4,?5,?6,?7,?8,'queued',?9,?10,?11,?12,?12
      WHERE NOT EXISTS (SELECT 1 FROM email_suppressions WHERE address_hash = ?6)
        AND EXISTS (SELECT 1 FROM weekly_insights wi WHERE wi.week_start = ?3 AND ${WEEKLY_VERSION} = ?4)
        AND ${notOwner("?5")}
        AND EXISTS (SELECT 1 FROM app_settings WHERE key = 'email' AND json_extract(value, '$.revision') = ?11
          AND json_extract(value, '$.enabled') = 1 AND json_extract(value, '$.summary') = 1
          AND EXISTS (SELECT 1 FROM json_each(app_settings.value, '$.recipients') WHERE value = ?5))
      ON CONFLICT(dedupe_key) DO NOTHING`).bind(ref, await sha256([WEEKLY_TEMPLATE, week, recipient].join("\0")), week,
      wi.version, recipient, hash, subject, text, s.approved_by, s.approved_at, s.revision, ts),
      ...logEvent(env, { actor: s.approved_by, entity_type: "admin", entity_id: `email:${ref}`, type: "email.approved",
        data: { template: WEEKLY_TEMPLATE, week } }, null, { ifInserted: true })];
  }))).flat();
  await env.DB.batch(statements);
}
