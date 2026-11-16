import { now } from "./http.js";
import { retentionPass, retentionNoticesReady } from "./retention.js";
import { retentionNoticePass } from "./retention-notices.js";
import { demandRetentionPass } from "./demand-retention.js";
import { emailPass } from "./email.js";
import { enquiryEmailCheck, enquiryEmailPass } from "./consultation-email.js";
import { receiveEmail } from "./email-inbound.js";
import { weeklyInsightsPass } from './weekly-insights.js';
import { notificationsPass } from "./notification-reconcile.js";
import { enquiries } from "./consultations.js";
import { ENQUIRY_GATES } from "./routes/matches.js";

const { callPass } = enquiries(ENQUIRY_GATES); // AGE-08: which matches count for an enquiry, as its routes say
import { rentalClosureEnabled } from './rental-closure.js';
import { processExpiredRentalClosures } from './rental-closure-job.js';
import { followupReady, saleFollowupPass } from './sale-followup.js';
import { marketSweepPass, sweepReady } from './market-daily-sweep.js';
import { marketRematchPass, rematchReady } from './market-rematch.js';
import { reviewReady, searchReviewPass } from './search-review.js';
import { withApplicationWrite, BackupMaintenanceError, backupReady, purgeClosedWritePermits } from './backup-write-gate.js';
import { backupStartPass } from './backup-start.js';
import { spoolReady, stageInboundDuringBackup, replayBackupInbound } from './backup-mail-spool.js';
import { calendarReady, calendarRetryTick } from './calendar-sync.js';
import { savedSearchesReady, savedSearchPass, savedSearchCleanup } from './saved-searches.js';

// AUT-07: the clock. Cloudflare wakes this Worker (hampton-jobs, configured in jobs/wrangler.toml) every 10 minutes, on
// the website's D1. Each tick leaves its time in app_settings.clock, then runs what is due. Each job claims its run in
// D1 first, so a repeated tick, or a panel poll, does not redo a run that is done.
const clock = {
  async scheduled(controller, env) {
    const ts = new Date(controller.scheduledTime).toISOString();
    await env.DB.prepare(`INSERT INTO app_settings (key, value, updated_at, updated_by)
      VALUES ('clock', json_object('at', ?1), ?2, 'system')
      ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`).bind(ts, now()).run();
    if (backupReady(env)) { // PRE-14: every request leaves a permit row; those of past windows go, 1000 a tick
      try { await purgeClosedWritePermits(env); }
      catch { console.error('Backup permit purge failed'); }
    }
    if (spoolReady(env)) { // PRE-14: email kept during the last backup window, now stored with its arrival time
      try { const c = await replayBackupInbound(env); if (c.failed || c.rejected) console.error('Spooled email', c); }
      catch { console.error('Spooled email pass failed'); }
    }
    await retentionPass(env, ts); // G2: the first tick of each Jersey day deletes what is 12 months inactive.
    if (retentionNoticesReady(env)) { // PRE-12 (Q05): the notice before that deletion, up to 50 a tick; sent below
      try { await retentionNoticePass(env, now()); }
      catch { console.error('Retention notice pass failed'); }
    }
    await demandRetentionPass(env, ts); // Separate claim, outcome and retry from the existing retention pass.
    try { await notificationsPass(env, now()); }
    catch { console.error('Notification pass failed'); } // No source/customer data in operational logs.
    try { await callPass(env, now()); } // AGE-08: the call task of an enquiry with no useful answer two working days on.
    catch { console.error('Enquiry call pass failed'); }
    try { await weeklyInsightsPass(env, now()); }
    catch { console.error('Weekly Insights pass failed'); }
    if (followupReady(env)) { // OFE-06: the weekly internal sale review, off until the team sets day and time.
      try { await saleFollowupPass(env, now()); }
      catch { console.error('Sale follow-up pass failed'); }
    }
    if (rentalClosureEnabled(env)) {
      try { await processExpiredRentalClosures(env); }
      catch { console.error('Rental withdrawal pass failed'); }
    }
    if (sweepReady(env)) { // BUS-08: the daily market sweep, off until its sources are authorised (BUS-19)
      try { await marketSweepPass(env, now()); }
      catch { console.error('Market sweep pass failed'); }
    }
    if (rematchReady(env)) { // BUS-04: the market's changes cross again only the searches they affect
      try { await marketRematchPass(env, now()); }
      catch { console.error('Market rematch pass failed'); }
    }
    if (reviewReady(env)) { // BUS-17: the internal review of a search with no complete option for 21 days, then each 7
      try { await searchReviewPass(env, now()); }
      catch { console.error('Search review pass failed'); }
    }
    if (calendarReady(env)) { // VIS-12: viewings Google Calendar did not take yet, up to 50 a tick
      try { await calendarRetryTick(env, { limit: 50 }); }
      catch { console.error('Calendar retry pass failed'); }
    }
    try { await savedSearchCleanup(env, now()); } // REG-15: expired requests and unsent mail, also after switching off
    catch { console.error('Saved search cleanup failed'); }
    if (savedSearchesReady(env)) { // REG-15: a visitor's saved search, at most one email a day of new homes that fit
      try { await savedSearchPass(env, now()); }
      catch { console.error('Saved search pass failed'); }
    }
    // Use processing time for email: a delayed old trigger must not send yesterday's summary.
    // AGE-05: an enquiry email is claimed only while its check holds; what happened to each is written on it after.
    await emailPass(env, now(), now, await enquiryEmailCheck(env));
    await enquiryEmailPass(env);
  },
};

// PRE-14: the whole tick and each inbound email run inside one write permit. While the weekly backup has the gate
// closed the tick does nothing (no write, no send; the next tick catches up) and an email goes to the encrypted spool
// (Task 5, server/backup-mail-spool.js); without it, or if it cannot take it, the email is refused with a reason the
// sender sees. With BACKUP_READY off this is the plain call.
// Task 4: after the tick, outside its permit, the clock starts the week's backup Workflow (server/backup-start.js);
// with BACKUP_READY off that call returns at once and touches nothing.
const maintenance = e => { if (!(e instanceof BackupMaintenanceError)) throw e; };
export default {
  async scheduled(controller, env) {
    try {
      await withApplicationWrite(env, { operation_id: 'jobs:scheduled' }, () => clock.scheduled(controller, env))
        .catch(e => { maintenance(e); console.log('Clock paused for the weekly backup'); });
    } finally {
      await backupStartPass(env, now()).catch(() => console.error('Backup start failed'));
    }
  },
  email: (message, env) => withApplicationWrite(env, { operation_id: 'jobs:email' }, () => receiveEmail(message, env))
    .catch(async e => {
      maintenance(e);
      const staged = await stageInboundDuringBackup(message, env).catch(() => 'failed');
      if (staged !== 'staged') message.setReject('Hampton is saving its weekly backup. Please send this again in a few minutes.');
    }),
};
