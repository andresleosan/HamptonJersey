// AUT-17: runs with the existing daily clean-up even while email is disabled.
export async function cleanEmail(env, ts) {
  const content = new Date(Date.parse(ts) - 30 * 86400e3).toISOString();
  const metadata = new Date(Date.parse(ts) - 90 * 86400e3).toISOString();
  await env.DB.batch([
    env.DB.prepare(`UPDATE outbound SET recipient=NULL,subject=NULL,text=NULL,claim_token=NULL,
      status=CASE WHEN status='sending' THEN 'unknown' WHEN status IN ('draft','queued') THEN 'cancelled' ELSE status END,
      error_code=CASE WHEN status='sending' THEN 'CONTENT_EXPIRED_IN_FLIGHT' ELSE error_code END
      WHERE created_at < ? AND (recipient IS NOT NULL OR text IS NOT NULL)`).bind(content),
    env.DB.prepare(`UPDATE email_inbound SET sender=NULL,header_from=NULL,recipient=NULL,subject=NULL,text=NULL,
      message_id=NULL,in_reply_to=NULL,references_header=NULL WHERE received_at < ? AND sender IS NOT NULL`).bind(content),
    env.DB.prepare("DELETE FROM email_inbound WHERE received_at < ?").bind(metadata),
    env.DB.prepare("DELETE FROM outbound WHERE created_at < ?").bind(metadata),
    env.DB.prepare("DELETE FROM email_attempts WHERE at < ?").bind(metadata),
    env.DB.prepare("DELETE FROM email_inbound_keys WHERE created_at < ?").bind(metadata),
  ]);
}
