import { json, fail, readJson, now } from '../http.js';
import { jerseyToday, EMAIL } from '../viewings.js';

class FieldError extends Error { constructor(field, message) { super(message); this.field = field; } }
const validateResponse = e => { if (e instanceof FieldError) return json({ error: e.message, fields: { [e.field]: e.message } }, 400); throw e; };
const clean = (v, label, max, required = false) => {
  if (typeof v !== 'string') { if (!required && v == null) return ''; fail(400, `Enter ${label} as text`); }
  v = v.trim();
  if (v.length > max || (required && !v)) fail(400, `Enter ${label} (up to ${max} characters)`);
  return v;
};
const list = (v, label, max = 40) => { if (!Array.isArray(v) || v.length > max) fail(400, `Invalid ${label}`); return v; };
function validate(b) {
  if (!b || typeof b !== 'object') fail(400, 'Invalid advertiser');
  const name = clean(b.name, 'name', 200, true), kind = b.kind;
  if (!['agency', 'entity', 'individual'].includes(kind)) fail(400, 'Choose a type');
  const contacts = list(b.contacts, 'contacts').map(c => ({
    name: clean(c?.name, 'contact name', 200, true), email: clean(c?.email, 'email', 254),
    phones: list(c?.phones, 'phones').map(p => ({ label: clean(p?.label, 'phone label', 80, true), number: clean(p?.number, 'phone number', 80, true) }))
  }));
  const invalidEmail = contacts.findIndex(c => c.email && !EMAIL.test(c.email));
  if (invalidEmail >= 0) throw new FieldError(`contacts.${invalidEmail}.email`, 'Enter a valid email');
  const channels = list(b.channels, 'channels').map((c, index) => {
    const url = clean(c?.url, 'URL', 2048, true);
    try { const u = new URL(url); if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password) throw Error(); } catch { throw new FieldError(`channels.${index}.url`, 'Enter an http or https URL'); }
    return { label: clean(c?.label, 'channel label', 100, true), url };
  });
  const ids = (v, label) => [...new Set(list(v, label, 100).map(x => clean(x, label, 100)).filter(Boolean))];
  return { name, kind, details: { contacts, channels, source_ids: ids(b.source_ids, 'source'), listing_ids: ids(b.listing_ids, 'listing'), commission: clean(b.commission, 'commission', 2000), photo_permission: clean(b.photo_permission, 'photo permission', 2000) } };
}
function monthAfter(date, months) {
  const [y, m, d] = date.split('-').map(Number), base = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0)).getUTCDate();
  base.setUTCDate(Math.min(d, last)); return base.toISOString().slice(0, 10);
}
function output(r) { const d = JSON.parse(r.details); return { ...r, details: undefined, ...d, review_on: monthAfter(r.activity_on, 11), due_on: monthAfter(r.activity_on, 12), today: jerseyToday() }; }
const columns = `a.*, (SELECT r.action FROM advertiser_reviews r WHERE r.advertiser_id=a.id ORDER BY r.id DESC LIMIT 1) AS last_review_action, (SELECT r.on_date FROM advertiser_reviews r WHERE r.advertiser_id=a.id ORDER BY r.id DESC LIMIT 1) AS last_review_on`;
async function get(env, id) { const r = await env.DB.prepare(`SELECT ${columns} FROM advertisers a WHERE a.id = ?`).bind(id).first(); if (!r) fail(404, 'Advertiser not found'); return r; }
async function refs(env, d, previous = []) {
  for (const id of d.source_ids) if (!await env.DB.prepare('SELECT source_id FROM research_sources WHERE source_id = ?').bind(id).first()) throw new FieldError('source_ids', 'Source not found');
  for (const id of d.listing_ids) {
    if (await env.DB.prepare('SELECT id FROM listings WHERE id = ?').bind(id).first()) continue;
    if (previous.includes(id) && await env.DB.prepare('SELECT id FROM deleted_listings WHERE id = ?').bind(id).first()) continue;
    throw new FieldError('listing_ids', 'Listing not found');
  }
}
async function all({ env, request }) {
  const p = new URL(request.url).searchParams, offset = Math.max(0, Math.min(100000, Number.parseInt(p.get('offset'), 10) || 0));
  const listing = clean(p.get('listing_id') ?? '', 'listing', 100), property = clean(p.get('property_id') ?? '', 'property', 100);
  const rows = (await env.DB.prepare(`SELECT ${columns} FROM advertisers a WHERE (? = '' OR EXISTS
    (SELECT 1 FROM json_each(a.details, '$.listing_ids') j WHERE j.value = ?)) AND (? = '' OR EXISTS
    (SELECT 1 FROM json_each(a.details, '$.source_ids') j JOIN research_sources s ON s.source_id = j.value WHERE s.property_id = ?))
    ORDER BY activity_on, name COLLATE NOCASE, id LIMIT 51 OFFSET ?`).bind(listing,listing,property,property,offset).all()).results;
  return json({ advertisers: rows.slice(0, 50).map(output), more: rows.length > 50, offset });
}
async function withHistory(env, row) {
  const a = output(row); a.deleted_listing_ids = [];
  for (const id of a.listing_ids) if (await env.DB.prepare('SELECT id FROM deleted_listings WHERE id = ?').bind(id).first()) a.deleted_listing_ids.push(id);
  return a;
}
async function one({ env, params: [id] }) {
  const a = await withHistory(env, await get(env, id));
  const reviews = (await env.DB.prepare('SELECT action, reason, actor, created_at FROM advertiser_reviews WHERE advertiser_id = ? ORDER BY id DESC LIMIT 100').bind(id).all()).results;
  return json({ advertiser: a, reviews });
}
async function create({ request, env, admin }) {
  let v; try { v = validate(await readJson(request)); } catch (e) { return validateResponse(e); } try { await refs(env, v.details); } catch (e) { return validateResponse(e); } const t = now();
  const r = await env.DB.prepare('INSERT INTO advertisers(name,kind,details,activity_on,created_at,updated_at,updated_by) VALUES(?,?,?,?,?,?,?)').bind(v.name,v.kind,JSON.stringify(v.details),jerseyToday(),t,t,admin).run();
  return json({ advertiser: output(await get(env,r.meta.last_row_id)) },201);
}
async function update({ request, env, admin, params: [id] }) {
  const body = await readJson(request); let v;
  try { v = validate(body); } catch (e) { return validateResponse(e); }
  if (!Number.isInteger(body.version)) fail(400, 'Send version');
  const old = await get(env, id);
  if (old.version !== body.version) fail(409, 'This record changed. Reload before saving.');
  try { await refs(env, v.details, JSON.parse(old.details).listing_ids); } catch (e) { return validateResponse(e); }
  const r = await env.DB.prepare('UPDATE advertisers SET name=?,kind=?,details=?,updated_at=?,updated_by=?,version=version+1 WHERE id=? AND version=?').bind(v.name,v.kind,JSON.stringify(v.details),now(),admin,id,body.version).run();
  if (!r.meta.changes) { await get(env,id); fail(409,'This record changed. Reload before saving.'); }
  return json({ advertiser: await withHistory(env, await get(env,id)) });
}
async function act({ request, env, admin, params: [id, action] }) {
  const b = await readJson(request); if (!Number.isInteger(b?.version)) fail(400,'Send version');
  const reason = action === 'retain' ? clean(b.reason,'reason',1000,true) : null;
  const old = await get(env,id); if (old.version !== b.version) fail(409,'This record changed. Reload before continuing.');
  const t = now();
  const sql = 'UPDATE advertisers SET activity_on=?,updated_at=?,updated_by=?,version=version+1 WHERE id=? AND version=?';
  const result = await env.DB.batch([
    env.DB.prepare(sql).bind(action === 'activity' ? jerseyToday() : old.activity_on,t,admin,id,b.version),
    env.DB.prepare('INSERT INTO advertiser_reviews(advertiser_id,action,reason,on_date,actor,created_at) SELECT ?,?,?,?,?,? WHERE changes() = 1').bind(id,action === 'retain' ? 'retained' : 'activity',reason,jerseyToday(),admin,t)
  ]);
  if (!result[0].meta.changes) fail(409,'This record changed. Reload before continuing.');
  return json({ advertiser: output(await get(env,id)) });
}
export default [
  ['GET', /^\/admin\/advertisers$/, all, true], ['POST', /^\/admin\/advertisers$/, create, true],
  ['GET', /^\/admin\/advertisers\/(\d+)$/, one, true], ['PUT', /^\/admin\/advertisers\/(\d+)$/, update, true],
  ['POST', /^\/admin\/advertisers\/(\d+)\/(retain|activity)$/, act, true],
];
