import {jerseyNow,plusDays,weekday} from './viewings.js';
import {jerseyDayStart} from './insights.js';

// Use processing time, not an old scheduled trigger. Calendar dates survive the 167/169-hour DST weeks.
export function weeklyPeriod(ts) {
  const instant=new Date(ts);
  if(!Number.isFinite(instant.getTime()))throw new Error('Invalid weekly Insights timestamp');
  const local=jerseyNow(instant),day=['mon','tue','wed','thu','fri','sat','sun'].indexOf(weekday(local.date));
  if(day===0&&local.time<'08:00')return null;
  const until=plusDays(local.date,-day),from=plusDays(until,-7);
  return {from,until,to:plusDays(until,-1),startUtc:jerseyDayStart(from),endUtc:jerseyDayStart(until)};
}

export async function weeklyInsightsPass(env,ts) {
  const period=weeklyPeriod(ts);
  if(!period)return {created:false,week_start:null};
  const {from,until,to,startUtc,endUtc}=period,generated=new Date(ts).toISOString();
  const [result]=await env.DB.batch([env.DB.prepare(`INSERT INTO weekly_insights(week_start,week_until,generated_at,payload)
    SELECT ?1,?2,?3,json_object('version',1,'period',json_object('days',7,'from',?1,'to',?6),'generated_at',?3,
      'totals',json_object(
        'views',(SELECT COALESCE(SUM(n),0) FROM daily_stats WHERE metric='view' AND day>=?1 AND day<?2),
        'viewing_requests',(SELECT COUNT(*) FROM viewing_requests WHERE created_at>=?4 AND created_at<?5),
        'new_applicants',(SELECT COUNT(*) FROM applicants WHERE archived_at IS NULL AND created_at>=?4 AND created_at<?5),
        'viewings_completed',(SELECT COUNT(*) FROM viewing_requests WHERE status='completed' AND date>=?1 AND date<?2)),
      'most_viewed',json((SELECT json_group_array(json_object('listing_id',listing_id,'views',views)) FROM (
        SELECT listing_id,SUM(n) AS views FROM daily_stats WHERE metric='view' AND day>=?1 AND day<?2
        GROUP BY listing_id HAVING views>0 ORDER BY views DESC,listing_id LIMIT 5))),
      'coverage',json_object('first_day',(SELECT MIN(day) FROM daily_stats)))
    WHERE NOT EXISTS(SELECT 1 FROM weekly_insights WHERE week_start=?1)
    ON CONFLICT(week_start) DO NOTHING`).bind(from,until,generated,startUtc,endUtc,to)]);
  // D1 counts the trigger writes too; a replay writes no rows at all.
  return {created:result.meta.changes>0,week_start:from};
}
