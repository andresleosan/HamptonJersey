import { json, fail, sha256 } from "../http.js";
import { activeSql } from "../applicants.js";
import { CANDIDATES_SQL } from "../match-store.js";
import { jerseyToday, plusDays, realDate, weekday } from "../viewings.js";
import { jerseyDayStart, groupDemand, topUnmet, funnel, responseTime, earliest, healthCursor, makeHealthCursor } from "../insights.js";
import { getWebVolumes, webVolumesFromRow, WEB_VOLUME_COLUMNS } from "../measurement.js";
import { getSearchMilestones } from "../measurement-funnel.js";
import { PUBLIC_BOOKING_BLOCKED_SQL } from "../viewing-store.js";
import { reviewPublicListing } from "./public.js";

const DAYS = ["7", "30", "90"];
// I8: offered to applicants and not archived; each query adds the operation.
const AVAILABLE = `${CANDIDATES_SQL} AND archived_at IS NULL`;
// A match in these statuses on an available listing of the applicant's operation. The listing subquery takes nothing
// from the applicant, so SQLite builds it once instead of scanning listings per match.
const matchIn = statuses => `EXISTS (SELECT 1 FROM matches m WHERE m.applicant_id = a.id AND m.status IN (${statuses})
  AND (m.listing_id, CASE a.operation WHEN 'rent' THEN 'rent' ELSE 'sale' END)
    IN (SELECT id, operation FROM listings WHERE ${AVAILABLE}))`;
const MATCHED = matchIn("'found', 'shortlisted'"); // I6
const OF_APPLICANT = "e.entity_type = 'applicant' AND e.entity_id = CAST(a.id AS TEXT)";
const OF_VIEWING = "e.entity_type = 'viewing' AND e.entity_id = CAST(v.id AS TEXT)";

// Bind order: from, to, since, from, to.
const TOTALS = `WITH activity AS (SELECT ${WEB_VOLUME_COLUMNS} FROM daily_stats
    WHERE day BETWEEN ? AND ? AND metric IN ('view','photos'))
  SELECT activity.view_count AS views, activity.view_count, activity.view_first, activity.photos_count, activity.photos_first,
  (SELECT COUNT(*) FROM viewing_requests WHERE created_at >= ?) AS viewing_requests,
  (SELECT COUNT(*) FROM viewing_requests WHERE status = 'completed' AND date BETWEEN ? AND ?) AS viewings_completed,
  (SELECT MIN(day) FROM daily_stats) AS first_day FROM activity`;
// I6, I7: today's active searches, never who they are.
const DEMAND = `SELECT a.operation, a.area_answer, a.parishes_wanted, a.parishes_excluded, a.bedrooms_min, a.budget_max, ${MATCHED} AS matched
  FROM applicants a WHERE ${activeSql("a")} AND a.search_category = 'residential'`;
const LISTINGS = `SELECT operation, parish, COUNT(*) AS n FROM listings WHERE ${AVAILABLE} GROUP BY operation, parish`;
// I9. Bind order: since, from, to.
const VIEWED = `SELECT s.listing_id, l.title, SUM(CASE s.metric WHEN 'view' THEN s.n ELSE 0 END) AS views,
  SUM(CASE s.metric WHEN 'photos' THEN s.n ELSE 0 END) AS photos, SUM(CASE s.metric WHEN 'tour' THEN s.n ELSE 0 END) AS tour,
  (SELECT COUNT(*) FROM viewing_requests v WHERE v.listing_id = s.listing_id AND v.created_at >= ?) AS viewings
  FROM daily_stats s JOIN listings l ON l.id = s.listing_id WHERE s.day BETWEEN ? AND ?
  GROUP BY s.listing_id HAVING views > 0 ORDER BY views DESC, s.listing_id LIMIT 10`;
// I10, I11 (a), (c): applicants created in the period and not archived, with the stages they were moved to (malformed
// event data skipped), the team's first change to them (applicant.matched comes from saving a listing: not attention)
// and, ruling R7, whether they have matches to review (active, with a found match on an available listing).
const COHORT = `SELECT a.source, a.stage, a.created_at, a.first_reviewed_at,
  (SELECT json_group_array(json_extract(e.data, '$.after.stage')) FROM events e
    WHERE ${OF_APPLICANT} AND e.type = 'applicant.stage_changed' AND json_valid(e.data)) AS stages,
  (SELECT MIN(e.at) FROM events e WHERE ${OF_APPLICANT} AND e.type IN ('applicant.stage_changed', 'applicant.updated')
    AND e.actor NOT IN ('public', 'system')) AS first_touch,
  ${activeSql("a")} AND ${matchIn("'found'")} AS to_review
  FROM applicants a WHERE a.archived_at IS NULL AND a.created_at >= ?`;
// I11 (b): website requests of the period (requested by 'public') and their first answer.
const WEB_VIEWINGS = `SELECT v.created_at, (SELECT MIN(e.at) FROM events e WHERE ${OF_VIEWING}
    AND e.type IN ('viewing.confirmed', 'viewing.cancelled', 'viewing.rescheduled')) AS replied_at
  FROM viewing_requests v WHERE v.created_at >= ?
    AND EXISTS (SELECT 1 FROM events e WHERE ${OF_VIEWING} AND e.type = 'viewing.requested' AND e.actor = 'public')`;

// I5: 7, 30 or 90 days (30 by default) that end today in Jersey and include it. Shared with the owner report (O2).
export function period(request) {
  const days = new URL(request.url).searchParams.get("days") ?? "30";
  if (!DAYS.includes(days)) fail(400, "Choose 7, 30 or 90 days");
  const to = jerseyToday();
  return { days: Number(days), from: plusDays(to, 1 - Number(days)), to };
}

// Separate search-record measurement: it does not join web activity to business outcomes.
async function milestones({request, env}) {
  const {from,to} = period(request), params = new URL(request.url).searchParams;
  const operation = params.get('operation') ?? 'all', category = params.get('category') ?? 'all';
  return json(await getSearchMilestones(env,{from,to,operation,category}));
}

// I12: one batch, counts and medians only.
async function insights({ request, env }) {
  const { days, from, to } = period(request), since = jerseyDayStart(from);
  const [[totals], active, available, viewed, cohort, webViewings] = await env.DB.batch([
    env.DB.prepare(TOTALS).bind(from, to, since, from, to),
    env.DB.prepare(DEMAND),
    env.DB.prepare(LISTINGS),
    env.DB.prepare(VIEWED).bind(since, from, to),
    env.DB.prepare(COHORT).bind(since),
    env.DB.prepare(WEB_VIEWINGS).bind(since),
  ]).then(r => r.map(x => x.results));
  const counts = funnel(cohort);
  return json({
    period: { days, from, to },
    activity: webVolumesFromRow(totals, {from, to}),
    totals: { views: totals.views, viewing_requests: totals.viewing_requests, new_applicants: counts.registered,
      viewings_completed: totals.viewings_completed },
    demand: groupDemand(active, available),
    unmet: topUnmet(active),
    views: { first_day: totals.first_day, rows: viewed },
    funnel: counts,
    times: {
      attend: responseTime(cohort.filter(a => a.source === "web")
        .map(a => [a.created_at, earliest(a.first_touch, a.first_reviewed_at)])),
      viewing_reply: responseTime(webViewings.map(v => [v.created_at, v.replied_at])),
      // R7: an unreviewed applicant waits only while there is something to review.
      first_review: responseTime(cohort.filter(a => a.first_reviewed_at || a.to_review)
        .map(a => [a.created_at, a.first_reviewed_at])),
    },
  });
}

// Complete listing snapshot used by the shared public-address review. Values travel as one compact JSON array;
// never truncate text or media, because that could hide an address from the public-eligibility review.
const HEALTH_LISTING_FIELDS = [
  'id','use','title','property_type','operation','availability','country','location','road_name','bedrooms','bathrooms',
  'tenure','sale_price','rent','rent_period','premium','currency','price_text','summary','description','tour_url','specs',
  'cover_media_id','published','archived_at','created_at','updated_at','updated_by','featured_rank','home_order','parish',
  'matchable','feat_pets','feat_parking','feat_furnished','feat_outdoor','feat_type','feat_evidence','features_at',
  'tenure_type','housing_category','restriction','confirmed_at','drive_folder_id','published_at','viewings_enabled',
  'viewing_hours','review_requested_at','review_requested_by','property_condition','interior_area_sqft','separate_wcs',
  'reception_rooms','has_garage','has_storage','has_lift','double_glazing','floor_level','building_floors','year_built',
  'heating_types','amenities','feature_overrides','price_per_sqft','rental_deposit','parish_rates','service_charge',
  'utilities_included','available_on',
];
const HEALTH_EXTRA_FIELDS = ['building_name_or_number','postcode','public_address_snapshot','public_address_snapshot_hash',
  'drive_folder_name','pub08_tags','pub08_video_url','active_interest'];
// Compact array avoids repeating field names for each media item in the bounded D1 response.
const HEALTH_MEDIA_FIELDS = ['id','origin','public','r2_key','thumb_key','kind','content_type','label','position'];
// Six output bytes per UTF-8 input byte covers JSON escaping (including controls and supplementary Unicode).
// 1 KiB per row plus a 4 MB margin below a 50 MB ceiling covers column names and transport wrappers.
// This is a transport guard only, not evidence that D1 CPU, memory or row-read budgets are safe.
const HEALTH_OUTPUT_CAP = 46000000;
const HEALTH = contentEnabled => `WITH views AS (
  SELECT listing_id, SUM(n) AS views FROM daily_stats WHERE metric='view' AND day BETWEEN ? AND ?
  GROUP BY listing_id HAVING SUM(n)>=30
), requests AS (
  SELECT listing_id, COUNT(*) AS requests FROM viewing_requests
  WHERE created_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]*'
    AND length(created_at) BETWEEN 20 AND 29 AND substr(created_at,11,1) IN ('T',' ')
    AND substr(created_at,14,1)=':' AND substr(created_at,17,1)=':'
    AND substr(created_at,12,2) NOT GLOB '*[^0-9]*' AND substr(created_at,15,2) NOT GLOB '*[^0-9]*'
    AND substr(created_at,18,2) NOT GLOB '*[^0-9]*'
    AND substr(created_at,1,4)<>'0000'
    AND strftime('%Y-%m-%d',substr(created_at,1,10),'+0 days')=substr(created_at,1,10)
    AND substr(created_at,12,2) BETWEEN '00' AND '23' AND substr(created_at,15,2) BETWEEN '00' AND '59'
    AND substr(created_at,18,2) BETWEEN '00' AND '59'
    AND (substr(created_at,-1)='Z' OR (substr(created_at,-6,1) IN ('+','-')
      AND substr(created_at,-5,2) GLOB '[0-9][0-9]' AND substr(created_at,-3,1)=':'
      AND substr(created_at,-2,2) GLOB '[0-9][0-9]' AND substr(created_at,-5,2) BETWEEN '00' AND '14'
      AND substr(created_at,-2,2) BETWEEN '00' AND '59'
      AND (substr(created_at,-5,2)<>'14' OR substr(created_at,-2,2)='00')))
    AND (length(created_at)-19-(CASE WHEN substr(created_at,-1)='Z' THEN 1 ELSE 6 END)=0 OR (
      length(created_at)-19-(CASE WHEN substr(created_at,-1)='Z' THEN 1 ELSE 6 END) BETWEEN 2 AND 4
      AND substr(created_at,20,1)='.'
      AND substr(created_at,21,length(created_at)-20-(CASE WHEN substr(created_at,-1)='Z' THEN 1 ELSE 6 END)) NOT GLOB '*[^0-9]*'))
    AND julianday(created_at)>=julianday(?) AND julianday(created_at)<julianday(?)
  GROUP BY listing_id
), candidates AS (
  SELECT l.id, v.views AS health_views, COALESCE(q.requests,0) AS health_requests, COALESCE(rev.revision,0) AS health_revision,
    json_array(${HEALTH_LISTING_FIELDS.map(f => `l.${f}`).join(',')},
      d.building_name_or_number,d.postcode,d.public_address_snapshot,d.public_address_snapshot_hash,
      (SELECT folder_name FROM drive_imports di WHERE di.folder_id=l.drive_folder_id ORDER BY di.id DESC LIMIT 1),
      ${contentEnabled ? 'c.tags,c.video_url' : 'NULL,NULL'},0) AS health_listing,
    (SELECT json_group_array(json_array(id,origin,public,r2_key,thumb_key,kind,content_type,label,position))
      FROM (SELECT id,origin,public,r2_key,thumb_key,kind,content_type,label,position FROM media
            WHERE listing_id=l.id AND public=1 ORDER BY position,id)) AS health_media
  FROM views v JOIN listings l ON l.id=v.listing_id LEFT JOIN requests q ON q.listing_id=l.id
  LEFT JOIN listing_details d ON d.listing_id=l.id LEFT JOIN listing_health_revisions rev ON rev.listing_id=l.id
  ${contentEnabled ? 'LEFT JOIN listing_content c ON c.listing_id=l.id' : ''}
  WHERE COALESCE(q.requests,0)<=1 AND l.published=1 AND l.archived_at IS NULL
    AND l.viewings_enabled=1 AND l.availability NOT IN (${PUBLIC_BOOKING_BLOCKED_SQL})
    AND EXISTS (SELECT 1 FROM media m WHERE m.listing_id=l.id AND m.kind='photo' AND m.public=1
      AND m.origin<>'external' AND m.r2_key IS NOT NULL AND m.r2_key<>'')
  ORDER BY v.views DESC,l.id ASC LIMIT 10001
), first_view AS (SELECT MIN(day) AS first_day FROM daily_stats WHERE metric='view'),
 budget AS (
  SELECT COUNT(*) AS candidate_count,
    1024 + 6 * length(CAST(COALESCE((SELECT first_day FROM first_view),'') AS BLOB)) + COALESCE(SUM(1024 + 6 * (
      length(CAST(c.health_listing AS BLOB)) + length(CAST(c.health_media AS BLOB)) +
      length(CAST(c.id AS BLOB)) + length(CAST(COALESCE(first_view.first_day,'') AS BLOB)))),0) AS health_bytes
  FROM candidates c CROSS JOIN first_view
 )
SELECT budget.candidate_count,budget.health_bytes,
  CASE WHEN budget.health_bytes<=${HEALTH_OUTPUT_CAP} THEN first_view.first_day END AS first_day,
  c.id,c.health_views,c.health_requests,c.health_revision,c.health_listing,c.health_media
FROM budget CROSS JOIN first_view
LEFT JOIN candidates c ON budget.candidate_count<=10000 AND budget.health_bytes<=${HEALTH_OUTPUT_CAP}
ORDER BY c.health_views DESC,c.id ASC`;

async function listingHealth({ request, env }) {
  // Disabled is a normal state. Only an explicitly enabled deployment may query the proposed schema.
  if (env.LISTING_HEALTH_READY !== '1') return json({ enabled: false });
  const params = new URL(request.url).searchParams;
  const cursor = params.has('cursor') ? healthCursor(params.get('cursor')) : null;
  if (params.has('cursor') && !cursor) fail(400, 'Invalid cursor');
  const to = jerseyToday(), from = plusDays(to, -29), until = plusDays(to, 1);
  const period = { days: 30, from, to };
  const { results } = await env.DB.prepare(HEALTH(env.PUB08_CONTENT_READY === '1'))
    .bind(from, to, jerseyDayStart(from), jerseyDayStart(until)).all();
  if (!results.length) fail(503, 'Listing health is temporarily unavailable');
  if (results[0].candidate_count > 10000) fail(503, 'Too many listings to display');
  if (results[0].health_bytes > HEALTH_OUTPUT_CAP) fail(503, 'Listing health is too large to display');
  const first_day = results[0].first_day ?? null;
  const candidates = results.filter(r => r.id != null);
  const reviewed = await Promise.all(candidates.map(async row => {
    const values = JSON.parse(row.health_listing);
    const listing = Object.fromEntries([...HEALTH_LISTING_FIELDS,...HEALTH_EXTRA_FIELDS].map((key,i) => [key,values[i]]));
    const media = JSON.parse(row.health_media).map(values => Object.fromEntries(HEALTH_MEDIA_FIELDS.map((key, i) => [key, values[i]])));
    const visible = await reviewPublicListing(env, listing, media);
    // Match site/lib.js shownOnSite: an unservable cover hides the listing, even if another photo exists.
    const shown = !!visible && typeof visible.pub.image === 'string' && /^\/media\/[A-Za-z0-9]+$/.test(visible.pub.image);
    return { row, listing, visible: shown };
  }));
  const fingerprint = reviewed.map(({row,visible}) => [row.id,row.health_views,row.health_requests,row.health_revision,visible]);
  const hash = await sha256(JSON.stringify({period, first_day, eligibility:'public-photo-and-bookable-v1', rows:fingerprint}));
  if (cursor && cursor.hash !== hash) fail(409, 'Results changed; reload');
  const rows = reviewed.filter(r => r.visible).map(({row,listing}) => ({
    listing_id: row.id, title: listing.title, views: row.health_views, viewing_requests: row.health_requests,
  }));
  const offset = cursor?.offset ?? 0;
  if (cursor && offset >= rows.length) fail(400, 'Invalid cursor');
  return json({ enabled:true, period, first_day, coverage:'unknown', rows: rows.slice(offset, offset+50),
    next_cursor: offset+50 < rows.length ? makeHealthCursor(offset+50, hash) : null });
}

async function weekly({env,params:[weekStart]}) {
  if(!realDate(weekStart)||weekday(weekStart)!=='mon')fail(400,'Choose a valid Monday');
  const row=await env.DB.prepare('SELECT payload FROM weekly_insights WHERE week_start=?').bind(weekStart).first();
  if(!row)fail(404,'Weekly Insights not found');
  return json(JSON.parse(row.payload));
}

async function activity({request, env}) {
  const {from, to} = period(request);
  return json(await getWebVolumes(env, {from, to}));
}

// Until the source and policy are verified, never infer an absent counter is zero.
async function searchTrends({request}) {
  const selected = period(request);
  return json({available: false, coverage: 'unknown', period: selected});
}

export default [
  ["GET", /^\/admin\/insights\/search-trends$/, searchTrends, true],
  ["GET", /^\/admin\/insights$/, insights, true],
  ["GET", /^\/admin\/insights\/milestones$/, milestones, true],
  ["GET", /^\/admin\/insights\/listing-health$/, listingHealth, true],
  ["GET", /^\/admin\/insights\/activity$/, activity, true],
  ["GET", /^\/admin\/insights\/weekly\/([^/]+)$/, weekly, true],
];
