// AGE-15: the agencies of the import of 8 Oct 2026 enter the Advertisers directory (AGE-04) by themselves, with the
// generic address each publishes on its own website, so an enquiry (AGE-03) can be prepared without typing them in.
// Which listing is an agency's: the same rule as BUS-07's provenance (its imported photos name it). Once a Jersey day,
// on the clock, behind AGE15_AUTO_ADVERTISERS_READY. Sends nothing. Add-only: a listing or contact a person removed is
// not put back, a renamed advertiser is not duplicated, and one whose data was removed (AGE-14) is never touched again.
import { now } from './http.js';
import { jerseyToday } from './viewings.js';

// Reviewed list: name, provider as the import's photos name it (media.provider), and the generic address (never a
// person's) read on the agency's own page, with that page and the date. Only these five agencies appear in the import;
// the other providers are on Hampton's own listings (HE-R001 to HE-R027, HE-C) and stay out.
export const AGENCIES = [
  { key: 'hunt', name: 'Hunt Estates', providers: ['Hunt Estates'], email: 'enquiries@huntestates.com', url: 'https://huntestates.com/', read_on: '2026-11-24' },
  { key: 'red', name: 'Red Properties', providers: ['Red Properties'], email: 'info@redproperties.je', url: 'https://www.redproperties.je/', read_on: '2026-11-24' },
  { key: 'slomans', name: 'Slomans Estate Agents', providers: ['Slomans Estate Agents'], email: 'hello@slomans.co.uk', url: 'https://slomans.co.uk/contact', read_on: '2026-11-24' },
  { key: 'prestige', name: 'Prestige Properties', providers: ['Prestige Properties'], email: 'help@prestige.je', url: 'https://www.prestige.je/', read_on: '2026-11-24' },
  { key: 'columbia', name: 'Columbia Estates', providers: ['Columbia Estates'], email: 'info@columbia.je', url: 'https://www.columbiaestates.je/contact-us/', read_on: '2026-11-24' },
];

export const syncReady = env => env?.AGE15_AUTO_ADVERTISERS_READY === '1';
const KEY = 'advertiser_sync'; // app_settings: { day, agencies: { <key>: { id, listings: [ids already given] } } }
const WHO = 'AGE-15 sync';

// ponytail: no claim of the day; two ticks are 10 minutes apart and a pass takes ms, and every write is idempotent.
export async function advertiserSyncPass(env, ts, today = jerseyToday(new Date(ts))) {
  const row = await env.DB.prepare('SELECT value FROM app_settings WHERE key = ?').bind(KEY).first();
  const state = row ? JSON.parse(row.value) : { agencies: {} };
  if (state.day === today) return;
  // Photos the import of 8 Oct uploaded (HE-R028 to HE-R285, HE-C018 to HE-C021, HE-I002, HE-I003): Hampton's own
  // listings carry origin 'hampton' or external references, never these.
  const photos = (await env.DB.prepare(`SELECT DISTINCT m.provider, m.listing_id FROM media m JOIN listings l ON l.id = m.listing_id
    WHERE m.origin = 'upload' AND m.created_by = 'import' AND m.provider IS NOT NULL ORDER BY m.listing_id`).all()).results;
  const t = now();
  // The state is written in the same transaction as each advertiser it records, so a pass cut short never creates an
  // agency twice nor puts back a listing a person removed. when: SQL that must hold for the state to be written.
  const upsert = (value, when = '1') => env.DB.prepare(`INSERT INTO app_settings (key, value, updated_at, updated_by)
    SELECT ?, ${value}, ?, 'system' WHERE ${when}
    ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`);
  for (const a of AGENCIES) {
    const seen = state.agencies[a.key] ??= { id: null, listings: [] };
    const fresh = [...new Set(photos.filter(p => a.providers.includes(p.provider)).map(p => p.listing_id))]
      .filter(id => !seen.listings.includes(id));
    if (!fresh.length) continue;
    if (seen.id == null) {
      const details = { contacts: [{ name: 'General enquiries', email: a.email, phones: [] }], channels: [{ label: 'Website', url: a.url }],
        source_ids: [], listing_ids: fresh, commission: '', photo_permission: '' };
      seen.listings.push(...fresh);
      const [r] = await env.DB.batch([
        env.DB.prepare('INSERT INTO advertisers(name,kind,details,activity_on,created_at,updated_at,updated_by) VALUES(?,?,?,?,?,?,?)')
          .bind(a.name, 'agency', JSON.stringify(details), today, t, t, WHO),
        upsert(`json_set(?, '$.agencies.${a.key}.id', last_insert_rowid())`).bind(KEY, JSON.stringify(state), t),
      ]);
      seen.id = r.meta.last_row_id;
      continue;
    }
    const ad = await env.DB.prepare('SELECT details, version, suppressed_at FROM advertisers WHERE id = ?').bind(seen.id).first();
    if (!ad || ad.suppressed_at) continue;
    const details = JSON.parse(ad.details);
    details.listing_ids = [...new Set([...details.listing_ids, ...fresh])];
    seen.listings.push(...fresh);
    const [r] = await env.DB.batch([
      env.DB.prepare(`UPDATE advertisers SET details=?, updated_at=?, updated_by=?, version=version+1
        WHERE id=? AND version=? AND suppressed_at IS NULL`).bind(JSON.stringify(details), t, WHO, seen.id, ad.version),
      upsert('?', 'changes() = 1').bind(KEY, JSON.stringify(state), t),
    ]);
    if (!r.meta.changes) seen.listings.splice(-fresh.length); // a person saved meanwhile: tomorrow's pass adds them
  }
  state.day = today;
  await upsert('?').bind(KEY, JSON.stringify(state), t).run();
}
