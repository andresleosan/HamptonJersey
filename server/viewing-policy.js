// VIS-09: viewing length, margins between homes and a daily maximum per negotiator. Availability and the booking
// writers use it only with VIS09_VIEWING_POLICY_READY=1; without saved rules the defaults below apply (viewing-store.js).
import { OPTIONS } from './applicants.js';

export const viewingPolicyReady = env => env?.VIS09_VIEWING_POLICY_READY === '1';

export const DEFAULT_VIEWING_POLICY = Object.freeze({
  duration_minutes:30, buffer_minutes:15, parish_extra_minutes:15, max_daily:8, revision:0,
});
const POLICY_KEYS = Object.keys(DEFAULT_VIEWING_POLICY);
// Bookings keep Jersey wall times; historical rows have no UTC offset and are never rewritten. Wall-clock arithmetic is
// exact while no clock change falls within 6 hours of the candidate (more than the largest margin plus the lost or
// repeated hour), so only such candidates are refused. The candidate's instant comes from its one valid offset (GMT or
// BST, checked by jerseyViewingInstant): there is none in the spring gap and two in the autumn fold.
const jerseyOffset = (() => {
  try { return new Intl.DateTimeFormat('en-GB', {
    timeZone:'Europe/Jersey', timeZoneName:'shortOffset', hour:'2-digit', hourCycle:'h23',
  }); } catch { return null; }
})();
const WINDOW_MS = 6*3600000;
function stableJerseyTime(date, time, duration) {
  try {
    const instants=[0,3600].map(offset=>jerseyViewingInstant(date,time,offset)).filter(Boolean);
    if (instants.length!==1) return false;
    const at=Date.parse(instants[0]), names=[at-WINDOW_MS, at+duration*60000+WINDOW_MS]
      .map(t=>jerseyOffset.formatToParts(new Date(t)).find(part=>part.type==='timeZoneName')?.value);
    return typeof names[0]==='string' && names[0]===names[1];
  } catch { return false; }
}
const STATUSES = new Set(['requested','confirmed','completed','no_show','cancelled']);
const ACTIVE = new Set(['requested','confirmed','completed','no_show']);
const parishKnown = value => typeof value === 'string' && OPTIONS.parishes.some(([parish])=>parish === value);
const sameParish = (a,b) => parishKnown(a) && parishKnown(b) && a === b;
const goodDay = value => typeof value === 'string' && /^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value)
  && new Date(value+'T12:00:00Z').toJSON()?.slice(0,10) === value;
function minutes(value, end = false) {
  if (end && value === '24:00') return 1440;
  if (typeof value !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
  return Number(value.slice(0,2))*60+Number(value.slice(3,5));
}
// Convert only a supplied, verified offset (seconds east of UTC). Missing legacy
// offsets are deliberately unresolved; neither an autumn fold nor its branch
// can be reconstructed from a wall time alone. This helper does not enable
// enforcement or alter historical rows.
export function jerseyViewingInstant(date, time, offsetSeconds) {
  if (!goodDay(date) || minutes(time) == null || !Number.isSafeInteger(offsetSeconds)
      || Math.abs(offsetSeconds)>86400) return null;
  try {
    const instant = new Date(Date.parse(`${date}T${time}:00Z`) - offsetSeconds*1000);
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
      timeZone:'Europe/Jersey', year:'numeric', month:'2-digit', day:'2-digit',
      hour:'2-digit', minute:'2-digit', second:'2-digit', hourCycle:'h23', era:'short',
    }).formatToParts(instant).map(part=>[part.type,part.value]));
    if (parts.era !== 'AD' || `${parts.year.padStart(4,'0')}-${parts.month}-${parts.day}` !== date
        || `${parts.hour}:${parts.minute}:${parts.second}` !== `${time}:00`) return null;
    return instant.toISOString();
  } catch { return null; }
}

function validatePolicy(policy) {
  if (!policy || typeof policy !== 'object' || Array.isArray(policy)
      || POLICY_KEYS.some(key=>!Number.isSafeInteger(policy[key]))
      || policy.duration_minutes<10 || policy.duration_minutes>180 || policy.duration_minutes%5!==0
      || policy.buffer_minutes<0 || policy.buffer_minutes>120
      || policy.parish_extra_minutes<0 || policy.parish_extra_minutes>120
      || policy.max_daily<1 || policy.max_daily>40 || policy.revision<0) throw new TypeError('Invalid viewing policy');
  return Object.fromEntries(POLICY_KEYS.map(key=>[key,policy[key]]));
}

// The staff form's rules (migration 0047's limits), each with its message; revision: the one the form was loaded with.
const LIMITS = [['duration_minutes',10,180,5,'Choose 10 to 180 minutes, in steps of 5'],
  ['buffer_minutes',0,120,1,'Choose 0 to 120 minutes'],['parish_extra_minutes',0,120,1,'Choose 0 to 120 minutes'],
  ['max_daily',1,40,1,'Choose 1 to 40 viewings']];
export function validViewingPolicy(body) {
  const src = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  const errors = {}, value = {};
  for (const [key,min,max,step,message] of LIMITS) {
    const n = src[key];
    if (!Number.isSafeInteger(n) || n<min || n>max || n%step!==0) errors[key]=message; else value[key]=n;
  }
  if (!Number.isSafeInteger(src.revision) || src.revision<0) errors.revision='Reload the page and try again';
  else value.revision=src.revision;
  return Object.keys(errors).length ? {errors} : {value};
}

// No stored record means the explicitly approved defaults, not an unlimited policy.
// The property is reserved for eventual property-specific rules; none are inferred here.
export function resolveViewingPolicy(negotiator, property) {
  void property;
  const stored = negotiator?.viewing_policy;
  return stored == null ? {...DEFAULT_VIEWING_POLICY} : validatePolicy(stored);
}

// The caller must supply one consistent snapshot, including the nullable sidecar
// policy_revision; missing sidecars never inherit a listing's current parish.
// Booking authorization, actual opening
// hours, state/publication and the commit-time SQL guard remain separate obligations.
export function canReserveViewing(snapshot, candidate, {excludeViewingId = null} = {}) {
  if (!snapshot || typeof snapshot !== 'object' || !Array.isArray(snapshot.bookings)) throw new TypeError('Invalid viewing snapshot');
  const policy = validatePolicy(snapshot.policy);
  const start = minutes(candidate?.time);
  if (!candidate || !Number.isSafeInteger(candidate.negotiator_id) || candidate.negotiator_id<1
      || !goodDay(candidate.date) || start == null || start+policy.duration_minutes>1440
      || (candidate.parish != null && (typeof candidate.parish!=='string' || candidate.parish.length>100))
      || (excludeViewingId != null && (!Number.isSafeInteger(excludeViewingId) || excludeViewingId<1)))
    throw new TypeError('Invalid viewing candidate');
  const end = start+policy.duration_minutes, reasons = new Set(), warnings = new Set();
  if (!stableJerseyTime(candidate.date, candidate.time, policy.duration_minutes)) reasons.add('timezone_transition_review');
  if (!parishKnown(candidate.parish)) warnings.add('parish_unconfirmed');
  let count = 0;
  for (const booking of snapshot.bookings) {
    if (!booking || typeof booking !== 'object' || Array.isArray(booking)) { reasons.add('invalid_booking'); continue; }
    if (Number.isSafeInteger(booking.negotiator_id) && booking.negotiator_id!==candidate.negotiator_id) continue;
    if (booking.status==='cancelled') continue;
    const dayDifference = goodDay(booking.date)
      ? (Date.parse(booking.date+'T12:00:00Z')-Date.parse(candidate.date+'T12:00:00Z'))/86400000 : null;
    if (dayDifference != null && Math.abs(dayDifference)>1) continue;
    if (excludeViewingId != null && booking.id===excludeViewingId) continue;
    if (!Number.isSafeInteger(booking.negotiator_id) || booking.negotiator_id<1 || !goodDay(booking.date)
        || !Number.isSafeInteger(booking.id) || booking.id<1 || !STATUSES.has(booking.status)) {
      reasons.add('invalid_booking'); continue;
    }
    if (!ACTIVE.has(booking.status)) continue;
    if (dayDifference===0) count++;
    const startOfBooking = minutes(booking.time), endOfBooking = minutes(booking.end_time,true);
    const hasSnapshot = booking.policy_revision != null;
    const oldBuffer = hasSnapshot ? booking.buffer_minutes : DEFAULT_VIEWING_POLICY.buffer_minutes;
    const oldExtra = hasSnapshot ? booking.parish_extra_minutes : DEFAULT_VIEWING_POLICY.parish_extra_minutes;
    const oldParish = hasSnapshot ? booking.parish : null;
    if (startOfBooking == null || endOfBooking == null || endOfBooking<=startOfBooking
        || (hasSnapshot && (!Number.isSafeInteger(booking.policy_revision) || booking.policy_revision<0))
        || !Number.isSafeInteger(oldBuffer) || oldBuffer<0 || oldBuffer>120
        || !Number.isSafeInteger(oldExtra) || oldExtra<0 || oldExtra>120) { reasons.add('invalid_booking'); continue; }
    const a = startOfBooking+dayDifference*1440, b = endOfBooking+dayDifference*1440;
    if (!parishKnown(oldParish)) warnings.add('parish_unconfirmed');
    const separation = Math.max(policy.buffer_minutes,oldBuffer)
      + (sameParish(candidate.parish,oldParish) ? 0 : Math.max(policy.parish_extra_minutes,oldExtra));
    if (start < b + separation && end + separation > a) reasons.add('time_conflict');
  }
  if (count>=policy.max_daily) reasons.add('daily_limit');
  return {allowed:reasons.size===0,reasons:[...reasons],warnings:[...warnings]};
}

// Predicate for a future INSERT, or for an UPDATE of exactly excludeViewingId.
// The owning transaction must also check hours, property/publication state,
// permissions, and insert/update the snapshot with its event. Never expose the
// exclusion option to an INSERT or accept it from an untrusted requester.
export function reservationPolicyGuard(candidate, selectedPolicy, {excludeViewingId = null} = {}) {
  const policy = validatePolicy(selectedPolicy);
  const start = minutes(candidate?.time);
  if (!candidate || !Number.isSafeInteger(candidate.negotiator_id) || candidate.negotiator_id<1
      || !goodDay(candidate.date) || start==null || start+policy.duration_minutes>1440
      || (candidate.listing_id != null && (typeof candidate.listing_id!=='string' || !/^HE-[A-Z]\d{3,}$/.test(candidate.listing_id)))
      || (candidate.parish != null && (typeof candidate.parish!=='string' || candidate.parish.length>100))
      || (candidate.listing_id == null && candidate.parish != null)
      || (excludeViewingId != null && (!Number.isSafeInteger(excludeViewingId) || excludeViewingId<1)))
    throw new TypeError('Invalid viewing candidate');
  // The finite list is derived from the existing shared applicant/listing values.
  const parishes=OPTIONS.parishes.map(([name])=>`'${name.replaceAll("'","''")}'`).join(',');
  const validStart=`(typeof(o.time)='text' AND length(o.time)=5 AND o.time GLOB '[0-2][0-9]:[0-5][0-9]' AND substr(o.time,1,2)<='23')`;
  const validEnd=`(typeof(o.end_time)='text' AND length(o.end_time)=5 AND (o.end_time='24:00' OR (o.end_time GLOB '[0-2][0-9]:[0-5][0-9]' AND substr(o.end_time,1,2)<='23')))`;
  const dayOffset=`(CASE o.date WHEN date(c.local_date,'-1 day') THEN -1440 WHEN date(c.local_date,'+1 day') THEN 1440 ELSE 0 END)`;
  const oldStart=`(${dayOffset}+CAST(substr(o.time,1,2) AS INTEGER)*60+CAST(substr(o.time,4,2) AS INTEGER))`;
  const oldEnd=`(${dayOffset}+CAST(substr(o.end_time,1,2) AS INTEGER)*60+CAST(substr(o.end_time,4,2) AS INTEGER))`;
  const gap=`(MAX(c.buffer_minutes,COALESCE(s.buffer_minutes,15)) + CASE
    WHEN c.parish IN (${parishes}) AND s.parish IN (${parishes}) AND c.parish=s.parish THEN 0
    ELSE MAX(c.parish_extra_minutes,COALESCE(s.parish_extra_minutes,15)) END)`;
  return {
    sql:`EXISTS (SELECT 1 FROM (SELECT ? AS negotiator_id, ? AS local_date, ? AS start_minute, ? AS end_minute,
        ? AS listing_id, ? AS parish, ? AS revision, ? AS duration_minutes, ? AS buffer_minutes,
        ? AS parish_extra_minutes, ? AS max_daily, ? AS excluded_id, ? AS stable_timezone) c
      JOIN negotiators n ON n.id=c.negotiator_id AND n.active=1
      LEFT JOIN viewing_policy_settings p ON p.negotiator_id=n.id
      WHERE c.stable_timezone=1 AND COALESCE(p.revision,0)=c.revision AND COALESCE(p.duration_minutes,30)=c.duration_minutes
        AND COALESCE(p.buffer_minutes,15)=c.buffer_minutes AND COALESCE(p.parish_extra_minutes,15)=c.parish_extra_minutes
        AND COALESCE(p.max_daily,8)=c.max_daily
        AND ((c.listing_id IS NULL AND c.parish IS NULL) OR EXISTS
          (SELECT 1 FROM listings l WHERE l.id=c.listing_id AND l.parish IS c.parish))
        AND NOT EXISTS (SELECT 1 FROM viewing_requests bad WHERE bad.negotiator_id=c.negotiator_id
          AND bad.status IS NOT 'cancelled' AND (c.excluded_id IS NULL OR bad.id<>c.excluded_id)
          AND NOT (typeof(bad.date)='text' AND length(bad.date)=10
            AND bad.date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
            AND substr(bad.date,1,4)<>'0000' AND date(bad.date,'+0 days') IS bad.date))
        AND (SELECT COUNT(*) FROM viewing_requests o WHERE o.negotiator_id=c.negotiator_id AND o.date=c.local_date
          AND o.status IS NOT 'cancelled' AND (c.excluded_id IS NULL OR o.id<>c.excluded_id)) < c.max_daily
        AND NOT EXISTS (SELECT 1 FROM viewing_requests o LEFT JOIN viewing_policy_snapshots s ON s.viewing_id=o.id
          WHERE o.negotiator_id=c.negotiator_id
            AND o.date IN (date(c.local_date,'-1 day'),c.local_date,date(c.local_date,'+1 day')) AND o.status IS NOT 'cancelled'
            AND (c.excluded_id IS NULL OR o.id<>c.excluded_id)
            AND (o.status IS NULL OR o.status NOT IN ('requested','confirmed','completed','no_show') OR NOT ${validStart} OR NOT ${validEnd}
              OR ${oldEnd} <= ${oldStart}
              OR (c.start_minute < ${oldEnd} + ${gap} AND c.end_minute + ${gap} > ${oldStart}))))`,
    binds:[candidate.negotiator_id,candidate.date,start,start+policy.duration_minutes,candidate.listing_id ?? null,
      candidate.parish ?? null,policy.revision,policy.duration_minutes,policy.buffer_minutes,
      policy.parish_extra_minutes,policy.max_daily,excludeViewingId,
      stableJerseyTime(candidate.date,candidate.time,policy.duration_minutes)?1:0],
  };
}
