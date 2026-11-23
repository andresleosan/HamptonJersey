import { HttpError } from './http.js';
import { OPTIONS } from './applicants.js';
import { mergePropertyIdentitiesCore, readPropertyIdentityCore, resolvePropertyIdentityCore,
  undoPropertyIdentityDecisionCore, keptApart, primary, uuid } from './internal/market-identity-core.js';

// BUS-10: one physical home with its listings from each source. Closed unless the deployment has
// migrations 0050 and 0068 and sets BUS10_IDENTITY_READY. Callers are routes with a staff session.
// Two listings become one home only by a person's decision; a decision never changes an observation
// and says nothing about availability.
const gated = fn => async (env, ...rest) => {
  if (env?.BUS10_IDENTITY_READY !== '1') throw new HttpError(503, 'Identity integration unavailable');
  return fn(env, ...rest);
};
export const resolvePropertyIdentity = gated(resolvePropertyIdentityCore);
export const mergePropertyIdentities = gated(mergePropertyIdentitiesCore);
export const undoPropertyIdentityDecision = gated(undoPropertyIdentityDecisionCore);
export const readPropertyIdentity = gated(readPropertyIdentityCore);

const bad = () => { throw new HttpError(400, 'Invalid identity request'); };
const conflict = message => { throw new HttpError(409, message); };
const READ = 2000, SHOWN = 50;
const MAIN = { sale: 'sale_price', rent: 'rent', business: 'business_price' };
// "St. Helier", "Saint Helier" and "st helier" compare equal; nothing is guessed beyond spelling.
const plain = text => typeof text === 'string' ? text.toLowerCase().replace(/\bsaint\b/g, 'st').replace(/[^a-z0-9]+/g, ' ').trim() : '';

// BUS-04 reads an advert's price by the same rule (advertPrice).
export function advertPrice(n) {
  const terms = (n.financial_terms ?? []).filter(t => t.kind === MAIN[n.operation] && t.amount_minor != null && t.currency);
  if (terms.length !== 1) return null;
  return n.operation === 'rent' && n.monthly_rent_minor != null
    ? { amount_minor: n.monthly_rent_minor, currency: terms[0].currency, period: 'month' }
    : { amount_minor: terms[0].amount_minor, currency: terms[0].currency, period: terms[0].period };
}
// A listing as its source last showed it: the evidence a person compares.
function publication(row) {
  const n = JSON.parse(row.normalized_json), f = n.fields ?? {};
  return { observation_id: row.id, source_ref: row.source_ref, channel_id: row.channel_id, external_key: row.external_key,
    listing_url: typeof row.listing_url === 'string' && row.listing_url.startsWith('https://') ? row.listing_url : null,
    operation: n.operation, title: f.title ?? null, parish: f.parish ?? null, bedrooms: f.bedrooms ?? null,
    bathrooms: f.bathrooms ?? null, price: advertPrice(n), location: n.territory_evidence ?? null, observed_at: n.observed_at ?? null };
}
const pair = (a, b) => a < b ? `${a}|${b}` : `${b}|${a}`;
// The latest reading of each listing of a source open now; a listing its source withdrew is left out.
const LATEST = `SELECT id,source_ref,channel_id,external_key,normalized_json,json_extract(raw_json,'$.listing_url') AS listing_url FROM (
    SELECT o.id,o.source_ref,o.channel_id,o.external_key,o.normalized_json,o.raw_json,
      ROW_NUMBER() OVER (PARTITION BY o.source_ref,o.channel_id,o.external_key ORDER BY o.source_at DESC,o.sequence DESC) AS n,
      MAX(o.deleted_tombstone) OVER (PARTITION BY o.source_ref,o.channel_id,o.external_key) AS gone
    FROM market_observations o JOIN market_sources s ON s.source_ref=o.source_ref AND s.channel_id=o.channel_id
      AND s.access_status IN ('allowed','manual_only') AND s.reviewed_at<=strftime('%Y-%m-%dT%H:%M:%fZ','now')
      AND s.review_due_at>strftime('%Y-%m-%dT%H:%M:%fZ','now') AND (s.source_kind='internal' OR EXISTS (SELECT 1
        FROM market_directory_manifests m WHERE m.revision=s.directory_revision AND m.status='accepted')))
  WHERE n=1 AND gone=0`;

// The review a person works from: possible duplicates, homes already linked and pairs kept apart.
// Reading it writes nothing. A pair is proposed only when operation, parish and bedrooms are known and equal
// and the price or the title is equal too; anything less is left alone rather than guessed.
export const readIdentityReview = gated(async env => {
  const db = primary(env.DB);
  const [latest, linked, aliases, apart] = await db.batch([
    db.prepare(`${LATEST} ORDER BY source_ref,channel_id,external_key LIMIT ?`).bind(READ + 1),
    db.prepare(`SELECT a.source_ref,a.channel_id,a.external_key,l.operation,io.property_id
      FROM market_listings l JOIN market_observations a ON a.id=l.anchor_observation_id
      JOIN market_identity_observations io ON io.observation_id=a.id`),
    db.prepare(`SELECT a.source_property_id,a.target_property_id,a.decision_id,d.created_at
      FROM market_identity_aliases a JOIN market_identity_decisions d ON d.id=a.decision_id`),
    db.prepare(`SELECT s.id,s.left_property_id,s.right_property_id,s.created_at FROM market_identity_separations s
      WHERE s.action='different_properties' AND NOT EXISTS (SELECT 1 FROM market_identity_separations r WHERE r.reopens=s.id)`),
  ]);
  const key = p => JSON.stringify([p.source_ref, p.channel_id, p.external_key, p.operation]);
  const own = new Map(linked.results.map(row => [key(row), row.property_id]));
  const parent = new Map(aliases.results.map(a => [a.source_property_id, a.target_property_id]));
  const root = id => { while (parent.has(id)) id = parent.get(id); return id; };
  const pubs = latest.results.slice(0, READ).map(publication), shown = new Map();
  // A listing nobody has decided on yet is its own home.
  const home = p => own.has(key(p)) ? root(own.get(key(p))) : key(p);
  for (const p of pubs) if (own.has(key(p))) shown.set(own.get(key(p)), p);
  const keptApart = new Set(apart.results.map(s => pair(root(s.left_property_id), root(s.right_property_id))));

  const buckets = new Map(), candidates = [], asked = new Set();
  for (const p of pubs) {
    if (!plain(p.parish) || p.bedrooms == null) continue;
    const bucket = `${p.operation}|${plain(p.parish)}|${p.bedrooms}`;
    buckets.set(bucket, [...(buckets.get(bucket) ?? []), p]);
  }
  for (const group of buckets.values()) for (let i = 0; i < group.length; i++) for (let j = i + 1; j < group.length; j++) {
    const left = group[i], right = group[j], homes = pair(home(left), home(right));
    const same = ['operation', 'parish', 'bedrooms',
      ...(left.price && JSON.stringify(left.price) === JSON.stringify(right.price) ? ['price'] : []),
      ...(plain(left.title) && plain(left.title) === plain(right.title) ? ['title'] : [])];
    // One question per pair of homes, and none for a pair already linked or already kept apart.
    if (same.length === 3 || home(left) === home(right) || asked.has(homes) || keptApart.has(homes)) continue;
    asked.add(homes); candidates.push({ left, right, same });
  }
  const members = new Map();
  for (const id of new Set(own.values())) members.set(root(id), [...(members.get(root(id)) ?? []), id]);
  const homes = [...members].filter(([, ids]) => ids.length > 1).map(([id, ids]) => {
    // The newest link of a home always ends at its root, so it is the one that can be undone.
    const last = aliases.results.filter(a => a.target_property_id === id).sort((a, b) => a.created_at < b.created_at ? 1 : -1)[0];
    return { property_id: id, linked: ids.length, publications: ids.map(member => shown.get(member)).filter(Boolean),
      last_decision: { id: last.decision_id, decided_at: last.created_at } };
  });
  const separated = apart.results.map(s => ({ id: s.id, decided_at: s.created_at,
    left: shown.get(s.left_property_id), right: shown.get(s.right_property_id) })).filter(s => s.left && s.right);
  return { candidates: candidates.slice(0, SHOWN), homes, separated,
    truncated: latest.results.length > READ || candidates.length > SHOWN };
});

// A retried click returns the decision it already made; the same operation id for anything else is refused.
async function replayed(db, operationId, actor, action, subject) {
  const row = await db.prepare(`SELECT id,action,actor,source_evidence_observation_id AS a,target_evidence_observation_id AS b,
      undo_of AS undone FROM market_identity_decisions WHERE operation_id=?
    UNION ALL SELECT id,action,actor,left_property_id,right_property_id,reopens FROM market_identity_separations
      WHERE operation_id=?`).bind(operationId, operationId).first();
  if (!row) return null;
  const same = ['undo', 'reopen'].includes(row.action) ? action === 'undo' && row.undone === subject
    : row.action === action && [row.a, row.b].sort().join() === [...subject].sort().join();
  if (row.actor !== actor || !same) conflict('Identity state or access changed');
  return { decision_id: row.id, action: row.action, replayed: true };
}
// The home of the listing an observation belongs to. A listing keeps the home of its first decided reading,
// so later readings of it never open a second one.
async function listingHome(env, db, observationId, actor) {
  const linked = await db.prepare(`SELECT a.id AS anchor,io.property_id FROM market_observations o
    JOIN market_observations a ON a.source_ref=o.source_ref AND a.channel_id=o.channel_id AND a.external_key=o.external_key
    JOIN market_listings l ON l.anchor_observation_id=a.id AND l.operation=json_extract(o.normalized_json,'$.operation')
    JOIN market_identity_observations io ON io.observation_id=a.id WHERE o.id=?`).bind(observationId).first();
  const own = linked ? { anchor: linked.anchor, property: linked.property_id } : { anchor: observationId,
    property: (await resolvePropertyIdentityCore(env, { observation_id: observationId, operation_id: crypto.randomUUID(),
      sole_home: true }, actor)).property_id };
  const root = await db.prepare(`WITH RECURSIVE up(id) AS (SELECT ? UNION
      SELECT a.target_property_id FROM market_identity_aliases a JOIN up ON a.source_property_id=up.id)
    SELECT p.id,p.version FROM up JOIN market_properties p ON p.id=up.id
    WHERE NOT EXISTS (SELECT 1 FROM market_identity_aliases a WHERE a.source_property_id=p.id)`).bind(own.property).first();
  return { ...own, root: root.id, version: root.version };
}
const ancestors = name => `${name}(id) AS (SELECT ? UNION
  SELECT a.target_property_id FROM market_identity_aliases a JOIN ${name} ON a.source_property_id=${name}.id)`;

// "Same home" links the two homes through the core (versioned, with every source still open); "different homes"
// records the refusal so the pair is not proposed again. Neither is ever taken without this call.
export const decideIdentity = gated(async (env, input, actor) => {
  if (!input || !['same_property', 'different_properties'].includes(input.action) || !uuid(input.left_observation_id) ||
      !uuid(input.right_observation_id) || !uuid(input.operation_id) || input.left_observation_id === input.right_observation_id) bad();
  const db = primary(env.DB);
  const left = await listingHome(env, db, input.left_observation_id, actor);
  const right = await listingHome(env, db, input.right_observation_id, actor);
  const again = await replayed(db, input.operation_id, actor, input.action,
    input.action === 'same_property' ? [left.anchor, right.anchor] : [left.property, right.property]);
  if (again) return again;
  if (left.root === right.root) conflict('These listings are already linked as one home');
  // A refusal stands for the whole home: the core refuses, inside the link's own batch, to join two homes that
  // a standing refusal keeps apart, so a link and a refusal that cross cannot both be recorded.
  if (input.action === 'same_property') return mergePropertyIdentitiesCore(env, { operation_id: input.operation_id,
    source_property_id: left.root, target_property_id: right.root, source_evidence_observation_id: left.anchor,
    target_evidence_observation_id: right.anchor, expected_source_version: left.version, expected_target_version: right.version }, actor);
  // A refusal grants nothing, but it is taken only while the sources of both homes are open: the core checks on read.
  await readPropertyIdentityCore(env, { property_id: left.property }, actor);
  await readPropertyIdentityCore(env, { property_id: right.property }, actor);
  const id = crypto.randomUUID(), [first, second] = [left.property, right.property].sort();
  // One statement: nothing is recorded if the two became one home meanwhile, or are already kept apart.
  const done = await db.prepare(`INSERT INTO market_identity_separations(id,operation_id,action,left_property_id,right_property_id,actor,created_at)
    SELECT ?,?,'different_properties',?,?,?,? WHERE NOT ${keptApart}
      AND NOT EXISTS (WITH RECURSIVE ${ancestors('l')}, ${ancestors('r')} SELECT 1 FROM l JOIN r ON r.id=l.id)`)
    .bind(id, input.operation_id, first, second, actor, new Date().toISOString(), left.root, right.root, first, second).run();
  if (!done.meta.changes) conflict('That decision had already changed');
  return { decision_id: id, action: 'different_properties' };
});

// Undo a link, or reopen a refusal. Both add a row; the earlier decision stays in the history.
export const undoIdentityDecision = gated(async (env, input, actor) => {
  if (!input || !uuid(input.decision_id) || !uuid(input.operation_id)) bad();
  const db = primary(env.DB), again = await replayed(db, input.operation_id, actor, 'undo', input.decision_id);
  if (again) return again;
  const link = await db.prepare(`SELECT s.version AS source,t.version AS target FROM market_identity_decisions d
    JOIN market_properties s ON s.id=d.source_property_id JOIN market_properties t ON t.id=d.target_property_id
    WHERE d.id=? AND d.action='same_property'`).bind(input.decision_id).first();
  if (link) return undoPropertyIdentityDecisionCore(env, { decision_id: input.decision_id, operation_id: input.operation_id,
    expected_source_version: link.source, expected_target_version: link.target }, actor);
  // Reopening follows the rule of undoing a link: the sources of both homes are open now (the core checks on read).
  const refusal = await db.prepare(`SELECT left_property_id AS l,right_property_id AS r FROM market_identity_separations
    WHERE id=? AND action='different_properties'`).bind(input.decision_id).first();
  if (!refusal) conflict('That decision had already changed');
  await readPropertyIdentityCore(env, { property_id: refusal.l }, actor);
  await readPropertyIdentityCore(env, { property_id: refusal.r }, actor);
  const id = crypto.randomUUID();
  const done = await db.prepare(`INSERT INTO market_identity_separations(id,operation_id,action,left_property_id,right_property_id,reopens,actor,created_at)
    SELECT ?,?,'reopen',s.left_property_id,s.right_property_id,s.id,?,? FROM market_identity_separations s
    WHERE s.id=? AND s.action='different_properties'
      AND NOT EXISTS (SELECT 1 FROM market_identity_separations r WHERE r.reopens=s.id)`)
    .bind(id, input.operation_id, actor, new Date().toISOString(), input.decision_id).run();
  if (!done.meta.changes) conflict('That decision had already changed');
  return { decision_id: id, action: 'reopen' };
});

// BUS-07: an advert of this operation whose source is open now, by the rule BUS-10's decisions use
// (internal/market-identity-core.js): allowed or manual only with evidence and retention, review in date, read by a run
// of its kind and, for an external source, its current directory accepted; never one its source withdrew.
// Binds: the observation id, then the operation.
export const OPEN_ADVERT = `EXISTS (SELECT 1 FROM market_observations o
  JOIN market_sources s ON s.source_ref=o.source_ref AND s.channel_id=o.channel_id
  JOIN market_pages p ON p.id=o.page_id AND p.source_ref=o.source_ref AND p.channel_id=o.channel_id
  JOIN market_runs r ON r.id=p.run_id
  LEFT JOIN market_directory_manifests m ON m.revision=s.directory_revision
  WHERE o.id=? AND json_extract(o.normalized_json,'$.operation')=? AND o.deleted_tombstone=0
    AND json_extract(o.normalized_json,'$.country_code')='JE' AND json_type(o.normalized_json,'$.territory_evidence')='text'
    AND length(trim(json_extract(o.normalized_json,'$.territory_evidence')))>0
    AND s.access_status IN ('allowed','manual_only') AND s.evidence_ref IS NOT NULL AND s.retention_ref IS NOT NULL
    AND s.reviewed_at<=strftime('%Y-%m-%dT%H:%M:%fZ','now') AND s.review_due_at>strftime('%Y-%m-%dT%H:%M:%fZ','now')
    AND ((r.kind='own_pilot' AND s.source_kind='internal') OR
      (r.kind IN ('initial','daily') AND s.source_kind='external' AND m.status='accepted'))
    AND NOT EXISTS (SELECT 1 FROM market_observations old WHERE old.source_ref=o.source_ref
      AND old.channel_id=o.channel_id AND old.external_key=o.external_key AND old.deleted_tombstone=1))`;

// BUS-07: the home of the advert a person chose to link a Hampton listing to (a provisional one is opened for an
// advert nobody has decided on yet, as above). The caller checks OPEN_ADVERT before and again in its own write,
// because an advert that already has a home is returned here without its source being read.
export const homeOfObservation = gated(async (env, observationId, actor) => {
  if (!uuid(observationId)) bad();
  const { property, root } = await listingHome(env, primary(env.DB), observationId, actor);
  return { property_id: property, root_property_id: root };
});

// BUS-07: the adverts a person may link a listing of this operation to, newest reading first. Reading writes nothing.
export const readMarketPublications = gated(async (env, operation) => {
  const { results } = await primary(env.DB).prepare(`SELECT * FROM (${LATEST}) WHERE json_extract(normalized_json,'$.operation')=?
    ORDER BY json_extract(normalized_json,'$.observed_at') DESC,id LIMIT ?`).bind(operation, READ).all();
  return results.map(publication);
});

// BUS-07: for each [listing_id, property_id] linked by a person, the adverts of that home as BUS-10's same-home
// decisions stand now (its root and every home joined to it), each at its latest reading from a source open now.
export const readLinkedPublications = gated(async (env, links) => {
  if (!links.length) return new Map();
  const { results } = await primary(env.DB).prepare(`WITH RECURSIVE
      links(listing_id,id) AS (SELECT json_extract(value,'$[0]'),json_extract(value,'$[1]') FROM json_each(?)),
      up(listing_id,id) AS (SELECT listing_id,id FROM links
        UNION SELECT up.listing_id,a.target_property_id FROM market_identity_aliases a JOIN up ON a.source_property_id=up.id),
      members(listing_id,id) AS (SELECT listing_id,id FROM up
          WHERE NOT EXISTS (SELECT 1 FROM market_identity_aliases a WHERE a.source_property_id=up.id)
        UNION SELECT m.listing_id,a.source_property_id FROM market_identity_aliases a JOIN members m ON a.target_property_id=m.id)
    SELECT DISTINCT m.listing_id,latest.* FROM members m JOIN market_identity_observations io ON io.property_id=m.id
      JOIN market_observations anchor ON anchor.id=io.observation_id
      JOIN (${LATEST}) latest ON latest.source_ref=anchor.source_ref AND latest.channel_id=anchor.channel_id
        AND latest.external_key=anchor.external_key`).bind(JSON.stringify(links)).all();
  const out = new Map();
  for (const row of results) out.set(row.listing_id, [...(out.get(row.listing_id) ?? []), publication(row)]);
  for (const pubs of out.values()) pubs.sort((a, b) => (b.observed_at ?? '').localeCompare(a.observed_at ?? ''));
  return out;
});


// BUS-01 / BUS-03: the homes of the common inventory, one per operation, worked out in SQL so that a search or a page
// reads a few rows, never the whole inventory nor the history of its readings. A home is a root BUS-10's decisions stand
// for, or an advert nobody decided on yet (its own home); its adverts are their latest reading (market_latest_observations,
// 0083, the same rule as LATEST) from a source open now. A home is commercial when any of its adverts says so (BUS-12):
// an advert that states no use is residential, so a home search is never offered one an advert calls commercial. A fact counts when the dated readings that state it agree;
// <fact>_disagree when they do not. A parish outside the twelve reads '?', so it disagrees with any other.
// listing_id: the Hampton listing a person linked the home to (BUS-07), matched instead.
// A parish as plain() compares it: lower case, "saint" as "st", punctuation as spaces, spaces collapsed.
const NORMAL = c => {
  let s = `' '||lower(${c})||' '`;
  for (const mark of ['.', '-', ',', "''", '’', '(', ')', '/']) s = `replace(${s},'${mark}',' ')`;
  for (let i = 0; i < 4; i++) s = `replace(${s},'  ',' ')`;
  return `trim(replace(${s},' saint ',' st '))`;
};
const PARISHES = `(VALUES ${OPTIONS.parishes.map(([p]) => `('${p.toLowerCase()}','${p}')`).join(',')})`;
const N = path => `json_extract(lt.normalized_json,'$.${path}')`;
const MONTHLY_KNOWN = `lt.op='rent' AND ${N('monthly_rent_minor')} IS NOT NULL`;
// As publication() reads it: the one stated term of the operation, a rent as its monthly figure when known.
const PRICE = `(SELECT CASE WHEN COUNT(*)=1 THEN json_array(CASE WHEN ${MONTHLY_KNOWN} THEN ${N('monthly_rent_minor')}
    ELSE MAX(json_extract(t.value,'$.amount_minor')) END,MAX(json_extract(t.value,'$.currency')),
    CASE WHEN ${MONTHLY_KNOWN} THEN 'month' ELSE MAX(json_extract(t.value,'$.period')) END) END
  FROM json_each(lt.normalized_json,'$.financial_terms') t
  WHERE json_extract(t.value,'$.kind')=CASE lt.op WHEN 'sale' THEN 'sale_price' WHEN 'rent' THEN 'rent' ELSE 'business_price' END
    AND json_extract(t.value,'$.amount_minor') IS NOT NULL AND json_extract(t.value,'$.currency') IS NOT NULL)`;
const agree = f => `CASE WHEN COUNT(DISTINCT CASE WHEN observed_at IS NOT NULL THEN ${f} END)=1
    THEN MAX(CASE WHEN observed_at IS NOT NULL THEN ${f} END) END AS ${f},
  COUNT(DISTINCT CASE WHEN observed_at IS NOT NULL THEN ${f} END)>1 AS ${f}_disagree`;
// BUS-09 (MARKET_AUTO_WITHDRAW_READY): an advert missing from two complete passes of its channel (initial or daily, none
// with adverts left out, each with some advert read) begun after its latest reading was recorded, in another run.
// Derived, never stored: nothing is deleted and a new reading brings it back. o: that reading.
// A pass that read no advert says nothing of any (a Hermes sub-channel completed empty); on a market_source_runs row.
export const READ_SOME = r => `EXISTS (SELECT 1 FROM market_pages rp JOIN market_observations ro ON ro.page_id=rp.id
  WHERE rp.run_id=${r}.run_id AND rp.source_ref=${r}.source_ref AND rp.channel_id=${r}.channel_id)`;
export const autoWithdrawReady = env => env?.MARKET_AUTO_WITHDRAW_READY === '1';
export const withdrawnSql = o => `(SELECT COUNT(*) FROM market_source_runs wr JOIN market_runs wk ON wk.id=wr.run_id
  JOIN market_pages wp ON wp.id=${o}.page_id WHERE wr.source_ref=${o}.source_ref AND wr.channel_id=${o}.channel_id
    AND wr.status='complete' AND wk.kind IN ('initial','daily') AND wr.run_id<>wp.run_id
    AND (SELECT MIN(f.committed_at) FROM market_pages f WHERE f.run_id=wr.run_id AND f.source_ref=wr.source_ref
      AND f.channel_id=wr.channel_id)>wp.committed_at
    AND NOT EXISTS (SELECT 1 FROM market_sweep_attempts a WHERE a.run_id=wr.run_id AND a.source_ref=wr.source_ref
      AND a.channel_id=wr.channel_id AND a.skipped>0)
    AND ${READ_SOME('wr')})>=2`;
// Each advert once, at its latest reading, from a source open now; never one its source withdrew.
const current = withdraw => `SELECT obs.id,obs.source_ref,obs.channel_id,obs.external_key,obs.normalized_json,
    json_extract(obs.raw_json,'$.listing_url') AS listing_url,json_extract(obs.normalized_json,'$.operation') AS op
  FROM market_latest_observations x JOIN market_sources s ON s.source_ref=x.source_ref AND s.channel_id=x.channel_id
    AND s.access_status IN ('allowed','manual_only') AND s.reviewed_at<=strftime('%Y-%m-%dT%H:%M:%fZ','now')
    AND s.review_due_at>strftime('%Y-%m-%dT%H:%M:%fZ','now') AND (s.source_kind='internal' OR EXISTS (SELECT 1
      FROM market_directory_manifests m WHERE m.revision=s.directory_revision AND m.status='accepted'))
  JOIN market_observations obs ON obs.id=x.observation_id WHERE x.gone=0${withdraw ? ` AND NOT ${withdrawnSql('obs')}` : ''}`;
const homesSql = (withdraw = false) => `WITH RECURSIVE
  up(start,id) AS (SELECT property_id,property_id FROM market_identity_observations
    UNION SELECT up.start,a.target_property_id FROM market_identity_aliases a JOIN up ON a.source_property_id=up.id),
  roots(start,id) AS (SELECT start,id FROM up WHERE NOT EXISTS (SELECT 1 FROM market_identity_aliases a WHERE a.source_property_id=up.id)),
  parishes(k,v) AS ${PARISHES},
  decided AS (SELECT a.source_ref,a.channel_id,a.external_key,l.operation,io.property_id
    FROM market_listings l JOIN market_observations a ON a.id=l.anchor_observation_id
    JOIN market_identity_observations io ON io.observation_id=a.id),
  adverts AS MATERIALIZED (SELECT lt.id,lt.source_ref,lt.channel_id,lt.external_key,lt.listing_url,lt.normalized_json,lt.op AS operation,
      ${N('observed_at')} AS observed_at,
      CASE WHEN ${N('fields.parish')} IS NOT NULL THEN COALESCE((SELECT v FROM parishes WHERE k=${NORMAL(N('fields.parish'))}),'?') END AS parish,
      ${N('fields.bedrooms')} AS bedrooms,${N('fields.bathrooms')} AS bathrooms,${N('fields.pets')} AS pets,${N('fields.parking')} AS parking,
      ${N('fields.use')} IS 'commercial' AS commercial,${N('fields.area_sqft')} AS area_sqft,
      ${PRICE} AS price,COALESCE(r.id,json_array(lt.source_ref,lt.channel_id,lt.external_key,lt.op)) AS home
    FROM (${current(withdraw)}) lt
    LEFT JOIN decided d ON d.source_ref=lt.source_ref AND d.channel_id=lt.channel_id AND d.external_key=lt.external_key AND d.operation=lt.op
    LEFT JOIN roots r ON r.start=d.property_id),
  homes AS MATERIALIZED (SELECT home,operation,MAX(observed_at) AS observed_at,COUNT(*) AS adverts,
      json_group_array(json_array(source_ref,channel_id,external_key)) AS members,
      ${['parish', 'bedrooms', 'bathrooms', 'pets', 'parking', 'price', 'area_sqft'].map(agree).join(',')},
      MAX(commercial) AS commercial,
      (SELECT k.listing_id FROM listing_market_links k JOIN roots r ON r.start=k.property_id WHERE r.id=adverts.home
        AND k.action='link' AND NOT EXISTS (SELECT 1 FROM listing_market_links u WHERE u.undoes=k.id)
        ORDER BY k.created_at DESC LIMIT 1) AS listing_id
    FROM adverts GROUP BY home,operation)`;
const HOMES = homesSql();
const OPEN_SOURCES = `SELECT COUNT(*) AS n FROM market_sources s LEFT JOIN market_directory_manifests m ON m.revision=s.directory_revision
  WHERE s.access_status IN ('allowed','manual_only') AND s.reviewed_at<=strftime('%Y-%m-%dT%H:%M:%fZ','now')
    AND s.review_due_at>strftime('%Y-%m-%dT%H:%M:%fZ','now') AND (s.source_kind='internal' OR m.status='accepted')`;
// The monthly figure in GBP a budget is compared with, as evaluate() reads it; NULL when it cannot be compared.
const MONTHLY = `CASE WHEN json_extract(price,'$[1]')='GBP' THEN CASE WHEN operation<>'rent' THEN json_extract(price,'$[0]')/100.0
  WHEN json_extract(price,'$[2]')='month' THEN json_extract(price,'$[0]')/100.0
  WHEN json_extract(price,'$[2]')='year' THEN json_extract(price,'$[0]')/1200.0 END END`;
const number = v => v != null && v !== '' && Number.isFinite(Number(v)) ? String(Number(v)) : 'NULL';

// BUS-01: the homes a search may be offered, at most limit, best fitting first. Left out only what evaluate() excludes
// anyway: another operation, a home linked to a listing, an excluded parish, refused pets for a household with pets
// and, for a search without priorities (hard filters there), a stated price over its top or rooms out of range.
// The order approximates what evaluate() rewards, with known data only: fewest must-haves known to fail, then most
// must-haves known to be met, a known parish, most criteria known to be met, and only then the newest reading. A home
// that meets every must-have therefore comes before any that fails one or leaves one unknown. fit: the search's own
// terms (numbers, the wanted and excluded parishes as lists, the must-have keys). commercial: offer the commercial homes
// instead of the residential ones (BUS-12). open_sources 0: no source is open,
// which is not an empty market. Reading writes nothing.
export const readMarketCandidates = gated(async (env, { operation, commercial = false, legacy, fit, limit }) => {
  const db = primary(env.DB), top = number(fit.top), min = number(fit.bedrooms_min), max = number(fit.bedrooms_max);
  const baths = number(fit.bathrooms_min), spaces = number(fit.parking_spaces), fmin = number(fit.floor_min), fmax = number(fit.floor_max);
  const small = `(${fmin} IS NOT NULL AND area_sqft<${fmin}) OR (${fmax} IS NOT NULL AND area_sqft>${fmax})`;
  // [known to fail, known to be met] per criterion the search states; NULL (data unknown) counts as neither.
  const rule = {
    budget: fit.top != null && [`monthly>${top}`, `monthly<=${top}`],
    bedrooms: (fit.bedrooms_min != null || fit.bedrooms_max != null) &&
      [`(${min} IS NOT NULL AND bedrooms<${min}) OR (${max} IS NOT NULL AND bedrooms>${max})`,
        `bedrooms IS NOT NULL AND NOT ((${min} IS NOT NULL AND bedrooms<${min}) OR (${max} IS NOT NULL AND bedrooms>${max}))`],
    bathrooms: fit.bathrooms_min != null && [`bathrooms<${baths}`, `bathrooms>=${baths}`],
    area: fit.area && [`parish<>'?' AND parish NOT IN (SELECT v FROM wanted)`, `parish IN (SELECT v FROM wanted)`],
    pets: fit.pets && ['pets=0', 'pets=1'],
    parking: Number(fit.parking_spaces) > 0 && ['parking=0', `parking=1 AND ${spaces}<=1`],
    floor: (fit.floor_min != null || fit.floor_max != null) && [small, `area_sqft IS NOT NULL AND NOT (${small})`],
  };
  const stated = Object.keys(rule).filter(k => rule[k]), must = stated.filter(k => fit.must.includes(k));
  // NULL when nothing to add: a bare 0 in ORDER BY would name a column.
  const sum = (keys, i) => keys.length ? keys.map(k => `COALESCE((${rule[k][i]}),0)`).join('+') : 'NULL';
  const known = k => `NOT COALESCE((${rule[k][0]}),0)`;
  const [homes, open] = await db.batch([
    db.prepare(`${homesSql(autoWithdrawReady(env))}, wanted(v) AS (SELECT value FROM json_each(?)), unwanted(v) AS (SELECT value FROM json_each(?))
      SELECT * FROM (SELECT h.*,${MONTHLY} AS monthly FROM homes h WHERE h.operation=? AND h.commercial=? AND h.listing_id IS NULL) c
      WHERE (parish IS NULL OR parish NOT IN (SELECT v FROM unwanted)) ${fit.pets ? 'AND COALESCE(pets,1)<>0' : ''}
        ${legacy ? ['budget', 'bedrooms', 'bathrooms'].filter(k => rule[k]).map(k => `AND ${known(k)}`).join(' ') : ''}
      ORDER BY ${sum(must, 0)},${sum(must, 1)} DESC,(parish IS NOT NULL AND parish<>'?') DESC,${sum(stated, 1)} DESC,
        observed_at DESC,home,operation LIMIT ?`)
      .bind(JSON.stringify(fit.wanted), JSON.stringify(fit.excluded), operation, commercial ? 1 : 0, limit),
    db.prepare(OPEN_SOURCES),
  ]);
  return { homes: homes.results, open_sources: open.results[0].n };
});

// BUS-03: a page of homes, newest reading first, with their adverts as publication() shows them. after: the last
// home of the previous page as [observed_at, home, operation]. Reading writes nothing.
export const readMarketHomesPage = gated(async (env, after, limit) => {
  const db = primary(env.DB), [at, home, operation] = after ?? [null, null, null];
  const [page, open] = await db.batch([
    db.prepare(`${HOMES} SELECT * FROM homes WHERE ? IS NULL OR COALESCE(observed_at,'')<? OR (COALESCE(observed_at,'')=?
      AND (home>? OR (home=? AND operation>?))) ORDER BY COALESCE(observed_at,'') DESC,home,operation LIMIT ?`)
      .bind(at, at, at, home, home, operation, limit + 1),
    db.prepare(OPEN_SOURCES),
  ]);
  const shown = page.results.slice(0, limit), pubs = new Map();
  if (shown.length) {
    const { results } = await db.prepare(`${HOMES} SELECT * FROM adverts WHERE (home,operation) IN
      (SELECT json_extract(value,'$[0]'),json_extract(value,'$[1]') FROM json_each(?)) ORDER BY observed_at DESC,id`)
      .bind(JSON.stringify(shown.map(h => [h.home, h.operation]))).all();
    for (const row of results) {
      const key = JSON.stringify([row.home, row.operation]);
      pubs.set(key, [...(pubs.get(key) ?? []), publication(row)]);
    }
  }
  return { homes: shown.map(h => ({ ...h, publications: pubs.get(JSON.stringify([h.home, h.operation])) ?? [] })),
    open_sources: open.results[0].n, more: page.results.length > limit };
});

