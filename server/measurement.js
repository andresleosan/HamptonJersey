import { fail } from './http.js';
import { realDate } from './viewings.js';

const METRICS = {
  view: { key: 'listing_open', label: 'Listing opens', source: 'Website counters', unit: 'recorded_actions',
    definition: 'Recorded openings of a published listing page.' },
  photos: { key: 'gallery_open', label: 'Gallery opens', source: 'Website counters', unit: 'recorded_actions',
    definition: 'Recorded openings of a published listing photo gallery.' },
  filter_actions: { key: 'filter_actions', label: 'Filter actions', source: 'Not integrated', unit: 'recorded_actions',
    definition: 'Filter activity is not integrated in this report.' },
};

// A description names an action, never a visitor, session or business outcome.
export function describeWebMetric(metric) {
  const entry = Object.hasOwn(METRICS, metric) ? METRICS[metric] : Object.values(METRICS).find(item => item.key === metric);
  return entry ? { unit: entry.unit, definition: entry.definition } : null;
}

// Shared by the ordinary Insights report and the direct activity endpoint.
// The date-leading primary key bounds the scan to this period.
export const WEB_VOLUME_COLUMNS = `
      COALESCE(SUM(CASE WHEN metric = 'view' THEN n ELSE 0 END), 0) AS view_count,
      MIN(CASE WHEN metric = 'view' AND n > 0 THEN day END) AS view_first,
      COALESCE(SUM(CASE WHEN metric = 'photos' THEN n ELSE 0 END), 0) AS photos_count,
      MIN(CASE WHEN metric = 'photos' AND n > 0 THEN day END) AS photos_first`;

export function webVolumesFromRow(row, {from, to}) {
  const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000 + 1;
  const sources = ['view', 'photos'].map(metric => {
    const info = METRICS[metric];
    return { ...info, count: row[`${metric}_count`], first_observed_day: row[`${metric}_first`],
      coverage: 'unknown', notes: 'First observed day is within this period, not the start of measurement. Coverage is unknown.' };
  });
  sources.push({ ...METRICS.filter_actions, count: null, first_observed_day: null,
    coverage: 'not_configured', notes: 'Filter activity is not integrated in this report.' });
  return { period: { days, from, to }, sources, coverage: { measured_from: null,
    notes: 'Stored actions may be missing. Counts are actions, not people or sessions; a successful request does not guarantee a count. Web Analytics is not integrated in this report.' } };
}

export async function getWebVolumes(env, {from, to}) {
  if (!realDate(from) || !realDate(to) || from > to) fail(400, 'Choose a valid date range');
  const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000 + 1;
  if (days > 90) fail(400, 'Choose at most 90 days');
  const {results} = await env.DB.prepare(`SELECT ${WEB_VOLUME_COLUMNS}
    FROM daily_stats WHERE day BETWEEN ? AND ? AND metric IN ('view', 'photos')`)
    .bind(from, to).all();
  return webVolumesFromRow(results[0], {from, to});
}
