import { HttpError } from './http.js';
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

function price(n) {
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
    bathrooms: f.bathrooms ?? null, price: price(n), location: n.territory_evidence ?? null, observed_at: n.observed_at ?? null };
}
const pair = (a, b) => a < b ? `${a}|${b}` : `${b}|${a}`;

// The review a person works from: possible duplicates, homes already linked and pairs kept apart.
// Reading it writes nothing. A pair is proposed only when operation, parish and bedrooms are known and equal
// and the price or the title is equal too; anything less is left alone rather than guessed.
export const readIdentityReview = gated(async env => {
  const db = primary(env.DB);
  const [latest, linked, aliases, apart] = await db.batch([
    db.prepare(`SELECT id,source_ref,channel_id,external_key,normalized_json,json_extract(raw_json,'$.listing_url') AS listing_url FROM (
        SELECT o.id,o.source_ref,o.channel_id,o.external_key,o.normalized_json,o.raw_json,
          ROW_NUMBER() OVER (PARTITION BY o.source_ref,o.channel_id,o.external_key ORDER BY o.source_at DESC,o.sequence DESC) AS n,
          MAX(o.deleted_tombstone) OVER (PARTITION BY o.source_ref,o.channel_id,o.external_key) AS gone
        FROM market_observations o JOIN market_sources s ON s.source_ref=o.source_ref AND s.channel_id=o.channel_id
          AND s.access_status IN ('allowed','manual_only') AND s.reviewed_at<=strftime('%Y-%m-%dT%H:%M:%fZ','now')
          AND s.review_due_at>strftime('%Y-%m-%dT%H:%M:%fZ','now') AND (s.source_kind='internal' OR EXISTS (SELECT 1
            FROM market_directory_manifests m WHERE m.revision=s.directory_revision AND m.status='accepted')))
      WHERE n=1 AND gone=0 ORDER BY source_ref,channel_id,external_key LIMIT ?`).bind(READ + 1),
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
