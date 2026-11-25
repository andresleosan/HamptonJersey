// AUT-22: whether a weekly Insights email (outbound template 'weekly_insights') may be claimed now, in SQL from its
// outbound row. server/email.js asks it in the claim and again just before the transport. A leaf: server/email.js
// imports it, so it imports nothing. The recipients are the team summary's (app_settings 'email', $.recipients) with
// its approval: the summary still on, the same configuration revision and the address still in the list. The snapshot
// is the one the text was written from (week_start = entity_id, generated_at pinned in version) and still the latest
// week. An owner of a property (a landlord, or an owner in Advertisers) is never a recipient.
export const weeklyEmailReady = env => env?.AUT22_WEEKLY_EMAIL_READY === "1";
export const WEEKLY_TEMPLATE = "weekly_insights";
// The snapshot's generated_at as whole seconds since 1970: outbound.version of its email.
export const WEEKLY_VERSION = "CAST(strftime('%s', wi.generated_at) AS INTEGER)";
// Addresses compared as the team list stores them: trimmed and lower case. r: the SQL of the address.
export const notOwner = r => `NOT EXISTS (SELECT 1 FROM landlords WHERE lower(trim(email)) = ${r})
  AND NOT EXISTS (SELECT 1 FROM advertisers ad, json_each(ad.details, '$.contacts') j WHERE ad.kind IN ('individual', 'entity')
    AND lower(trim(json_extract(j.value, '$.email'))) = ${r})`;
export const WEEKLY_CLAIMABLE = `EXISTS (SELECT 1 FROM weekly_insights wi WHERE wi.week_start = outbound.entity_id
    AND ${WEEKLY_VERSION} = outbound.version AND wi.week_start = (SELECT MAX(week_start) FROM weekly_insights))
  AND ${notOwner("outbound.recipient")}
  AND EXISTS (SELECT 1 FROM app_settings ws WHERE ws.key = 'email' AND json_extract(ws.value, '$.summary') = 1
    AND json_extract(ws.value, '$.revision') = outbound.config_revision
    AND EXISTS (SELECT 1 FROM json_each(ws.value, '$.recipients') WHERE value = outbound.recipient))`;
// "0" (none is claimed) while switched off.
export const weeklyClaimSql = async env => (weeklyEmailReady(env) ? WEEKLY_CLAIMABLE : "0");
