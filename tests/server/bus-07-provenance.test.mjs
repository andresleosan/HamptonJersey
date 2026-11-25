// BUS-07 / SPR-07: where each listing comes from, its optional link to a market home, and the list's source, sighting,
// confirmation and material-change fields. Synthetic data only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { makeEnv, seedListing, seedMedia, call, adminCookie, T0 } from './helpers.mjs';
import { normalizeObservation } from '../../server/market-extraction.js';
import { materialChange } from '../../server/listing-provenance.js';

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const AT = '2026-11-14T10:00:00.000Z';
const run = (env, sql, ...a) => env.DB.raw.prepare(sql).run(...a);
const count = (env, table) => env.DB.raw.prepare(`SELECT count(*) AS n FROM ${table}`).get().n;
const ok = (r, status = 200) => { assert.equal(r.status, status, JSON.stringify(r.data)); return r.data; };

function world({ on = true, identity = true, availability = false } = {}) {
  const env = makeEnv(), db = env.DB.raw;
  if (on) env.BUS07_PROVENANCE_READY = '1';
  if (identity) { env.BUS10_IDENTITY_READY = '1'; env.MARKET_INVENTORY_READY = '1'; }
  if (availability) env.EST16_AVAILABILITY_READY = '1';
  seedListing(env, { id: 'HE-R001', title: 'Own home', operation: 'rent', availability: 'to_let', rent: 1500, rent_period: 'month',
    sale_price: null, parish: 'St Helier', bedrooms: 2 });
  seedListing(env, { id: 'HE-R030', title: 'Imported, no photos', published: 0 });
  seedListing(env, { id: 'HE-C001', title: 'Imported shop', use: 'commercial', published: 0 });
  seedListing(env, { id: 'HE-R031', title: 'Imported, in the directory', published: 0 });
  seedListing(env, { id: 'HE-R1000', title: 'Own, past the import range' });
  seedMedia(env, { id: 'U1', listing_id: 'HE-C001', origin: 'upload', created_by: 'import', provider: 'Shop Agency',
    rights_status: 'user_declared_permission_2026-10-08', r2_key: 'uploads/u1.jpg', thumb_key: 'thumbs/uploads/u1.jpg' });
  seedMedia(env, { id: 'U2', listing_id: 'HE-R031', origin: 'upload', created_by: 'import', provider: 'Import Name',
    rights_status: 'user_declared_permission_2026-10-08', r2_key: 'uploads/u2.jpg', thumb_key: 'thumbs/uploads/u2.jpg' });
  // Hampton's own catalogue photo from another provider is not an agency import.
  seedMedia(env, { id: 'H1', listing_id: 'HE-R001', origin: 'external', public: 0, created_by: 'import', provider: 'Other Agency' });
  db.prepare("INSERT INTO market_directory_manifests VALUES (?,?,?,?,'accepted')").run('rev', 'a'.repeat(64), '2000-01-01T00:00:00.000Z', 'review');
  for (const source of ['agency-a', 'agency-b']) db.prepare(`INSERT INTO market_sources(source_ref,channel_id,directory_revision,source_kind,
    source_class,access_status,method,policy_version,evidence_ref,retention_ref,reviewed_at,review_due_at)
    VALUES (?,'site','rev','external','general','allowed','manual',1,'evidence','retention',?,?)`)
    .run(source, '2000-01-01T00:00:00.000Z', '2999-01-01T00:00:00.000Z');
  db.prepare(`INSERT INTO market_runs(id,kind,manifest_revision,manifest_sha256,operation_id,created_at,created_by)
    VALUES(?,'initial','rev',?,?,?,'fixture')`).run(id(100), 'a'.repeat(64), id(101), AT);
  env.seq = 0;
  return env;
}
// One advert as the manual upload stores it, normalised by the real normaliser.
function advert(env, source, key, { amount = 150000, seen = AT, parish = 'St Helier', bedrooms = 2, operation = 'rent' } = {}) {
  const seq = ++env.seq, page = id(1000 + seq), observation = id(2000 + seq);
  const normalized = normalizeObservation({ country_code: 'JE', territory_evidence: 'Address on the listing: Jersey', operation,
    observed_at: seen, title: 'Two bedroom flat', parish, bedrooms, bathrooms: 1, financial_terms: [operation === 'sale'
      ? { kind: 'sale_price', amount_minor: amount, currency: 'GBP', period: 'sale' }
      : { kind: 'rent', amount_minor: amount, currency: 'GBP', period: 'month' }] });
  env.DB.raw.prepare(`INSERT INTO market_pages(id,run_id,source_ref,channel_id,page_key,content_sha256,exhausted,observed_at,
    committed_at,committed_by,lease_token,lease_generation,policy_version) VALUES(?,?,?,'site',?,?,0,?,?,'fixture','fixture',1,1)`)
    .run(page, id(100), source, `page-${seq}`, 'b'.repeat(64), seen, seen);
  env.DB.raw.prepare(`INSERT INTO market_observations(id,page_id,source_ref,channel_id,external_key,raw_json,normalized_json,
    normalized_sha256,source_at,origin_sha256) VALUES(?,?,?,'site',?,?,?,?,?,?)`).run(observation, page, source, key,
    JSON.stringify({ listing_url: `https://${source}.example.test/${key}` }), JSON.stringify(normalized), 'c'.repeat(64), seen, 'd'.repeat(64));
  return observation;
}
const list = async env => {
  const d = ok(await call(env, 'GET', '/admin/listings', { cookie: await adminCookie() }));
  return { ...d, byId: Object.fromEntries(d.listings.map(l => [l.id, l])) };
};
const provenance = async (env, lid = 'HE-R001') => call(env, 'GET', `/admin/listings/${lid}/provenance`, { cookie: await adminCookie() });
const linkTo = async (env, observation_id, operation_id = randomUUID(), lid = 'HE-R001') =>
  call(env, 'POST', `/admin/listings/${lid}/market-link`, { cookie: await adminCookie(), body: { observation_id, operation_id } });
const unlink = async (env, link_id, operation_id = randomUUID(), lid = 'HE-R001') =>
  call(env, 'POST', `/admin/listings/${lid}/market-link/undo`, { cookie: await adminCookie(), body: { link_id, operation_id } });
async function directory(env, listing_ids, name = 'Directory Agency', extra = {}) {
  return ok(await call(env, 'POST', '/admin/advertisers', { cookie: await adminCookie(), body: { name, kind: 'agency', channels: [],
    source_ids: [], listing_ids, commission: '', photo_permission: '', contacts: [{ name: 'Desk', email: 'desk@agency.example.test',
      phones: [{ label: 'Office', number: '01534 000000' }] }], ...extra } }), 201).advertiser;
}

test('switched off, the list and the listing are exactly as before and the new routes are absent', async () => {
  const env = world({ on: false });
  const { listings, provenance_tracking } = await list(env);
  assert.equal(provenance_tracking, undefined);
  for (const l of listings) for (const k of ['provenance', 'seen_at', 'confirmed', 'material_change_at']) assert.equal(k in l, false, k);
  assert.equal((await provenance(env)).status, 404);
  assert.equal((await call(env, 'GET', '/admin/listings/HE-R001/market-candidates', { cookie: await adminCookie() })).status, 404);
  assert.equal((await linkTo(env, advert(env, 'agency-a', 'A-1'))).status, 404);
  assert.equal(count(env, 'market_properties'), 0);
});

test('source: Hampton, the agency import, or the directory, which corrects it', async () => {
  const env = world();
  let { byId, provenance_tracking } = await list(env);
  assert.equal(provenance_tracking, true);
  const view = l => [l.provenance.kind, l.provenance.basis, l.provenance.labels];
  assert.deepEqual(view(byId['HE-R001']), ['hampton', null, []]);
  assert.deepEqual(view(byId['HE-R1000']), ['hampton', null, []]);
  assert.deepEqual(view(byId['HE-R030']), ['co_listed', 'import', []]);
  assert.deepEqual(view(byId['HE-C001']), ['co_listed', 'import', ['Shop Agency']]);
  assert.deepEqual(view(byId['HE-R031']), ['co_listed', 'import', ['Import Name']]);
  // The team names the agency in the directory: it wins over the import's name, for the list and the listing alike.
  const a = await directory(env, ['HE-R031', 'HE-R001']);
  ({ byId } = await list(env));
  assert.deepEqual(view(byId['HE-R031']), ['co_listed', 'directory', ['Directory Agency']]);
  assert.deepEqual(byId['HE-R031'].provenance.advertisers, [{ id: a.id, name: 'Directory Agency' }]);
  assert.equal(byId['HE-R001'].provenance.kind, 'co_listed');
  // ...and taking a listing out of the directory takes it back.
  ok(await call(env, 'PUT', `/admin/advertisers/${a.id}`, { cookie: await adminCookie(), body: { ...a, listing_ids: ['HE-R031'] } }));
  ({ byId } = await list(env));
  assert.equal(byId['HE-R001'].provenance.kind, 'hampton');
  // Through a research source too, as AGE-03 chooses its recipients.
  run(env, "INSERT INTO research_sources (source_id, property_id, accessed_on) VALUES ('S-1', 'HE-R1000', '2026-10-05')");
  await directory(env, [], 'Research Agency', { source_ids: ['S-1'] });
  ({ byId } = await list(env));
  assert.deepEqual(view(byId['HE-R1000']), ['co_listed', 'directory', ['Research Agency']]);
  assert.equal(byId['HE-R1000'].seen_at, '2026-10-05');

  // The listing: the permission recorded with the import, as recorded, and no contact detail of the agency.
  const d = ok(await provenance(env, 'HE-R031'));
  assert.deepEqual(d.authorizations, [{ by: 'Import Name', permission: 'user_declared_permission_2026-10-08', photos: 1, basis: 'import' }]);
  assert.equal(JSON.stringify(d).includes('desk@agency'), false);
  assert.equal(JSON.stringify(d).includes('01534'), false);
  assert.equal((await call(env, 'GET', '/admin/listings/HE-R001/provenance')).status, 401);
});

test('seen on the web and confirmed are two things, and the editorial check stays as it was', async () => {
  const env = world({ availability: true });
  run(env, "UPDATE listings SET confirmed_at = ? WHERE id = 'HE-R001'", '2026-11-01T09:00:00.000Z');
  run(env, "INSERT INTO research_sources (source_id, property_id, accessed_on) VALUES ('S-1','HE-R001','2026-10-05'), ('S-2','HE-R001','Undated')");
  let { byId } = await list(env);
  assert.equal(byId['HE-R001'].seen_at, '2026-10-05');
  assert.equal(byId['HE-R001'].confirmed, null);
  assert.equal(byId['HE-R001'].confirmed_at, '2026-11-01T09:00:00.000Z');
  ok(await call(env, 'POST', '/admin/listings/HE-R001/availability', { cookie: await adminCookie(), body: { status: 'available',
    confirmed_at: '2026-11-10T09:30:00.000Z', source: 'owner', channel: 'phone', scope: 'property', evidence_ref: 'Call note' } }), 201);
  ({ byId } = await list(env));
  assert.deepEqual(byId['HE-R001'].confirmed, { status: 'available', confirmed_at: '2026-11-10T09:30:00.000Z', source: 'owner' });
  assert.equal(byId['HE-R001'].confirmed_at, '2026-11-01T09:00:00.000Z');
  assert.equal(JSON.stringify(byId['HE-R001']).includes('Call note'), false);
  // EST-16 off: no confirmation field at all.
  ({ byId } = await list(world()));
  assert.equal('confirmed' in byId['HE-R001'], false);
});

test('changed in the last 7 days means a real change of price or availability', async () => {
  const env = world(), cookie = await adminCookie();
  const save = async patch => {
    const { updated_at } = env.DB.raw.prepare("SELECT updated_at FROM listings WHERE id='HE-R001'").get();
    ok(await call(env, 'PUT', '/admin/listings/HE-R001', { cookie, body: { updated_at, ...patch } }));
  };
  await save({ title: 'Own home, renamed' });
  assert.equal((await list(env)).byId['HE-R001'].material_change_at, null, 'a cosmetic save');
  await save({ rent: 1500, rent_period: 'month' });
  assert.equal((await list(env)).byId['HE-R001'].material_change_at, null, 'the same rent');
  await save({ rent: 1400, rent_period: 'month' });
  const at = (await list(env)).byId['HE-R001'].material_change_at;
  assert.ok(at, 'a lower rent');
  assert.equal((await list(env)).byId['HE-C001'].material_change_at, null);
  // Older than 7 days: no longer recent.
  run(env, "UPDATE events SET at = '2026-01-01T00:00:00.000Z' WHERE entity_id = 'HE-R001'");
  assert.equal((await list(env)).byId['HE-R001'].material_change_at, null);
  await save({ availability: 'withdrawn' });
  assert.ok((await list(env)).byId['HE-R001'].material_change_at, 'availability');
  // Pure rule: currency and operation count; an event without its values counts when it named the field.
  const rent = { operation: 'rent', rent: 1000, rent_period: 'month', currency: 'GBP' };
  assert.equal(materialChange({ before: { currency: 'GBP' }, after: { currency: 'EUR' } }, rent), true);
  assert.equal(materialChange({ before: { rent: 1000, rent_period: 'month' }, after: { rent: 1000, rent_period: 'year' } }, rent), true);
  assert.equal(materialChange({ fields: ['rent'] }, rent), true);
});

test('a person links a listing to a market home, sees its adverts, and undoes it; nothing else changes', async () => {
  const env = world();
  const a = advert(env, 'agency-a', 'A-1', { amount: 150000, seen: '2026-11-12T08:00:00.000Z' });
  const b = advert(env, 'agency-b', 'B-1', { amount: 155000, seen: '2026-11-13T08:00:00.000Z' });
  advert(env, 'agency-b', 'B-2', { parish: 'St Ouen', bedrooms: 4 });
  const before = ['listings', 'matches', 'availability_confirmations', 'events', 'market_observations'].map(t => count(env, t));

  let d = ok(await provenance(env));
  assert.equal(d.linking, true);
  assert.equal(d.link, null);
  const picks = ok(await call(env, 'GET', '/admin/listings/HE-R001/market-candidates', { cookie: await adminCookie() })).publications;
  assert.equal(picks.length, 3);
  assert.deepEqual(picks.slice(0, 2).map(p => p.external_key).sort(), ['A-1', 'B-1'], 'same parish and bedrooms first');

  const op = randomUUID();
  d = ok(await linkTo(env, a, op), 201);
  assert.equal(d.link.linked_by, 'admin@example.test');
  assert.ok(d.link.linked_at);
  assert.deepEqual(d.publications.map(p => [p.external_key, p.price.amount_minor, p.observed_at]),
    [['A-1', 150000, '2026-11-12T08:00:00.000Z']]);
  assert.deepEqual(ok(await linkTo(env, a, op)).link, d.link, 'a retried click');
  assert.equal((await linkTo(env, b, op)).status, 409, 'the same request for another advert');
  assert.equal((await linkTo(env, b)).status, 409, 'one standing link per listing');
  assert.equal((await list(env)).byId['HE-R001'].seen_at, '2026-11-12');
  assert.deepEqual(['listings', 'matches', 'availability_confirmations', 'events', 'market_observations'].map(t => count(env, t)), before,
    'a link changes no listing, match, confirmation, history or observation');

  // BUS-10: once a person says the two adverts are one home, the listing shows both.
  ok(await call(env, 'POST', '/admin/market/identity/decisions', { cookie: await adminCookie(),
    body: { action: 'same_property', left_observation_id: a, right_observation_id: b, operation_id: randomUUID() } }), 201);
  d = ok(await provenance(env));
  assert.deepEqual(d.publications.map(p => p.external_key), ['B-1', 'A-1']);
  assert.equal((await list(env)).byId['HE-R001'].seen_at, '2026-11-13');

  const undone = ok(await unlink(env, d.link.id));
  assert.equal(undone.link, null);
  assert.deepEqual(undone.history.map(h => h.action), ['unlink', 'link']);
  assert.equal((await unlink(env, d.link.id)).status, 409);
  assert.throws(() => run(env, "UPDATE listing_market_links SET actor = 'x'"), /immutable/);
  assert.equal((await list(env)).byId['HE-R001'].seen_at, null);
  ok(await linkTo(env, b), 201);
});

test('without BUS-10 the source still reads, and linking is absent', async () => {
  const env = world({ identity: false });
  const d = ok(await provenance(env));
  assert.equal(d.linking, false);
  assert.equal(d.provenance.kind, 'hampton');
  assert.equal((await linkTo(env, randomUUID())).status, 404);
});

// Review 15-nov: an advert that already has a home (an earlier link, or a BUS-10 decision) is linked only while its
// source is open now: allowed, review in date and its current directory accepted. Nothing is written otherwise.
test('a link needs the advert\'s source open now, even when the advert already has a home', async () => {
  const env = world(), db = env.DB.raw;
  const a = advert(env, 'agency-a', 'A-1');
  ok(await unlink(env, ok(await linkTo(env, a), 201).link.id));
  const rows = () => count(env, 'listing_market_links');
  const refused = async why => {
    const before = [rows(), count(env, 'market_properties')];
    assert.equal((await linkTo(env, a)).status, 409, why);
    assert.deepEqual([rows(), count(env, 'market_properties')], before, `${why}: nothing written`);
  };
  db.prepare("UPDATE market_sources SET policy_version=policy_version+1, access_status='denied' WHERE source_ref='agency-a'").run();
  await refused('source denied');
  db.prepare("UPDATE market_sources SET policy_version=policy_version+1, access_status='allowed', review_due_at='2001-01-01T00:00:00.000Z' WHERE source_ref='agency-a'").run();
  await refused('review out of date');
  db.prepare("UPDATE market_sources SET policy_version=policy_version+1, review_due_at='2999-01-01T00:00:00.000Z' WHERE source_ref='agency-a'").run();
  ok(await unlink(env, ok(await linkTo(env, a), 201).link.id));
  // Closed between the first check and the write: the write's own guard refuses it.
  const prepare = env.DB.prepare.bind(env.DB);
  env.DB.prepare = sql => {
    if (/^\s*INSERT INTO listing_market_links/.test(sql) && /'link'/.test(sql))
      db.prepare("UPDATE market_sources SET policy_version=policy_version+1, access_status='paused' WHERE source_ref='agency-a'").run();
    return prepare(sql);
  };
  await refused('source paused during the link');
  env.DB.prepare = prepare;
  db.prepare("UPDATE market_sources SET policy_version=policy_version+1, access_status='allowed' WHERE source_ref='agency-a'").run();
  db.prepare("UPDATE market_directory_manifests SET status='revoked' WHERE revision='rev'").run();
  await refused('directory revoked');
});

test('a link needs the advert to offer the listing\'s operation', async () => {
  const env = world();
  const sale = advert(env, 'agency-a', 'S-1', { operation: 'sale', amount: 50000000 });
  assert.equal((await linkTo(env, sale)).status, 409);
  assert.equal(count(env, 'listing_market_links'), 0);
});

test('a commercial sale counts a change of its asking price; an old business listing still counts each price on its own', async () => {
  const env = world(), cookie = await adminCookie();
  seedListing(env, { id: 'HE-C002', title: 'Shop', use: 'commercial', operation: 'sale', availability: 'for_sale', sale_price: 400000,
    currency: 'GBP', rent: null, rent_period: null, premium: null, tenure_type: 'leasehold', published: 0 });
  const save = async patch => {
    const { updated_at } = env.DB.raw.prepare("SELECT updated_at FROM listings WHERE id='HE-C002'").get();
    ok(await call(env, 'PUT', '/admin/listings/HE-C002', { cookie, body: { updated_at, ...patch } }));
  };
  await save({ sale_price: 400000 });
  assert.equal((await list(env)).byId['HE-C002'].material_change_at, null, 'the same price');
  await save({ sale_price: 450000 });
  assert.ok((await list(env)).byId['HE-C002'].material_change_at, 'a higher asking price');
  const shop = { operation: 'business', premium: 50000, rent: 36000, rent_period: 'year' };
  assert.equal(materialChange({ before: { rent: 30000 }, after: { rent: 36000 } }, shop), true);
  assert.equal(materialChange({ before: { premium: 40000 }, after: { premium: 50000 } }, shop), true);
  assert.equal(materialChange({ before: { premium: 40000, rent: 36000 }, after: { premium: 50000, rent: 26000 } }, shop), true, 'never summed');
});

test('an advertiser whose personal data was removed (AGE-14) does not make a listing co-listed', async () => {
  const env = world();
  const a = await directory(env, ['HE-R001']);
  assert.equal((await list(env)).byId['HE-R001'].provenance.kind, 'co_listed');
  run(env, 'UPDATE advertisers SET suppressed_at = ? WHERE id = ?', AT, a.id);
  assert.equal((await list(env)).byId['HE-R001'].provenance.kind, 'hampton');
  assert.equal(ok(await provenance(env)).provenance.kind, 'hampton');
});

// The app's only ways to write to an agency are AGE-03's enquiry (and AGE-05's email of it): no other module queues
// email or reads an advertiser's contacts, and this task's answers carry none.
test('a co-listed listing is enquired about only through AGE-03', () => {
  const files = dir => readdirSync(new URL(`../../${dir}/`, import.meta.url), { recursive: true }).filter(f => f.endsWith('.js'))
    .map(f => [`${dir}/${f}`, readFileSync(new URL(`../../${dir}/${f}`, import.meta.url), 'utf8')]);
  const code = [...files('server'), ...files('functions'), ...files('jobs').filter(([f]) => !f.includes('node_modules'))];
  // REG-15 queues email only to a website visitor who saved a search, never to an advertiser (it reads no contacts of one).
  // PRE-12's retention notice goes only to an applicant contact's own address, never to an advertiser.
  // OFE-02 emails an offer to the listing's seller: an individual or entity advertiser, never an agency (offer-emails.js).
  // VIS-13's viewing reminder goes only to the linked search's contact, never to an advertiser.
  // AUT-22's weekly Insights email goes only to the team summary's recipients, never to an owner or an advertiser.
  // AUT-21's feedback request and closure notice go only to the address a viewing was booked with, never to an advertiser.
  assert.deepEqual(code.filter(([, s]) => /INSERT INTO outbound/i.test(s)).map(([f]) => f).sort(),
    ['server/consultations.js', 'server/email.js', 'server/offer-emails.js', 'server/retention-notices.js', 'server/saved-searches.js', 'server/viewing-emails.js',
      'server/viewing-reminders.js', 'server/weekly-insights-email.js']);
  assert.deepEqual(code.filter(([, s]) => /advertisers/.test(s) && /\.contacts\b|\$\.contacts/.test(s)).map(([f]) => f).sort(),
    // AUT-17 (Luis, 21-nov-2026): Hermes writes the enquiry and the viewing proposal to the advertiser from Gmail.
    // OFE-02: the seller's contact, only of individual or entity advertisers.
    // AUT-22: an owner's contact is read only to keep it out of the weekly email's recipients.
    ['server/advertiser-privacy.js', 'server/consultations.js', 'server/hermes-mail.js', 'server/offer-email-check.js', 'server/offer-emails.js', 'server/routes/advertisers.js', 'server/weekly-insights-email-check.js']);
  // email.js queues only the team summary, to the team's own recipients.
  const email = readFileSync(new URL('../../server/email.js', import.meta.url), 'utf8');
  assert.equal(/advertiser/i.test(email), false);
  assert.equal(/contacts|outbound/i.test(readFileSync(new URL('../../server/listing-provenance.js', import.meta.url), 'utf8')), false);
});
