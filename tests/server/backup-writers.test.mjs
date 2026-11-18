// PRE-14 · Task 1: cada entrada de docs/roadmap/work/PRE-14/writer-coverage.md, con la compuerta de escrituras.
// Apagada (BACKUP_READY ausente o "0") todo responde igual y nada toca las tablas de la migración 0094.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {makeEnv, seedListing, seedMedia, adminCookie, ORIGIN} from './helpers.mjs';
import {emailEnv, TS} from './email-helpers.mjs';
import {handleApi, gated} from '../../server/api.js';
import {closeWriteGate, openWriteGate, drainState} from '../../server/backup-write-gate.js';
import jobs from '../../server/jobs.js';
import {EMAIL_REPLY_TO} from '../../server/email.js';
import {onRequestGet as mediaFn} from '../../functions/media/[id].js';
import {onRequestGet as listingFn, onRequestHead as listingHead} from '../../functions/p/[id].js';
import {onRequestGet as propertiesFn} from '../../functions/properties.js';
import {onRequestGet as sitemapFn} from '../../functions/sitemap.xml.js';
import {onRequestGet as robotsFn} from '../../functions/robots.txt.js';
import {onRequest as panelFn} from '../../functions/admin/_middleware.js';

const KEY = 'hermes-test-key-hermes-test-key-0123456789';
const RUN = '11111111-1111-4111-8111-111111111111';
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return {promise, resolve}; };
const permits = env => env.DB.raw.prepare('SELECT operation, closed_at FROM backup_writers ORDER BY started_at').all()
  .map(r => ({operation: r.operation, open: r.closed_at === null}));
const setting = (env, key) => env.DB.raw.prepare('SELECT value FROM app_settings WHERE key = ?').get(key)?.value ?? null;
// Una base sin la migración 0094, como producción hoy.
const without0094 = env => { env.DB.raw.exec('DROP TABLE backup_writers; DROP TABLE backup_write_gate; DROP TABLE backup_runs'); return env; };
// Todo el SQL que corre, para comprobar que nada toca backup_*.
const sqlLog = env => {
  const seen = [], prepare = env.DB.prepare.bind(env.DB), batch = env.DB.batch.bind(env.DB);
  env.DB.prepare = sql => { seen.push(sql); return prepare(sql); };
  env.DB.batch = stmts => { seen.push(...stmts.map(s => s.sql)); return batch(stmts); };
  return seen;
};
const apiEnv = ready => {
  const env = {...makeEnv(), HERMES_KEY: KEY};
  if (ready !== undefined) env.BACKUP_READY = ready;
  seedListing(env);
  return env;
};
// La petición como la manda Pages; devuelve la respuesta en cuanto existe y, aparte, el trabajo de waitUntil.
const request = async (env, method, path, {body, cookie, bearer, origin = ORIGIN} = {}) => {
  const headers = new Headers();
  if (origin && method !== 'GET') headers.set('origin', origin);
  if (cookie) headers.set('cookie', cookie);
  if (bearer) headers.set('authorization', `Bearer ${bearer}`);
  if (body !== undefined) headers.set('content-type', 'application/json');
  const req = new Request(`${ORIGIN}/api${path}`, {method, headers, body: body === undefined ? undefined : JSON.stringify(body)});
  const later = [];
  const res = await handleApi(req, env, path.split('?')[0].slice(1).split('/'), p => later.push(p));
  return {req, res, later};
};
const settle = async ({res, later}) => {
  await Promise.all(later);
  const text = await res.text();
  return {status: res.status, cache: res.headers.get('cache-control'), retry: res.headers.get('retry-after'), text};
};
const SAMPLE = async () => [
  ['GET', '/listings'],
  ['GET', '/admin/notifications/counts', {cookie: await adminCookie()}], // un GET que escribe con waitUntil (retención)
  ['POST', '/admin/outbound/pause', {cookie: await adminCookie(), body: {}}],
  ['POST', '/hermes/pause', {bearer: KEY, origin: null}], // la rama Hermes
  ['POST', '/admin/outbound/pause', {cookie: await adminCookie(), body: {}, origin: 'https://evil.test'}],
  ['GET', '/nothing-here'],
];

test('apagada: mismas respuestas con BACKUP_READY ausente, "0" o "1" con la compuerta abierta; sin 0094 nada toca backup_*', async t => {
  t.mock.timers.enable({apis: ['Date'], now: Date.parse('2026-11-16T10:00:00.000Z')});
  t.mock.method(console, 'log', () => {});
  const answers = {};
  for (const ready of [undefined, '0', '1']) {
    const env = ready === '1' ? apiEnv(ready) : without0094(apiEnv(ready)), seen = sqlLog(env);
    answers[ready] = [];
    for (const [method, path, opts] of await SAMPLE()) answers[ready].push(await settle(await request(env, method, path, opts)));
    if (ready !== '1') assert.ok(!seen.some(s => /backup_/.test(s)), `BACKUP_READY=${ready}: ninguna consulta a backup_*`);
    else assert.deepEqual(permits(env).map(p => p.open), Array(5).fill(false), 'encendida: un permiso por petición salvo GET /listings, cerrados');
  }
  assert.deepEqual(answers['0'], answers[undefined]);
  assert.deepEqual(answers['1'], answers[undefined]);
  assert.deepEqual(answers[undefined].map(a => a.status), [200, 200, 200, 200, 403, 404]);
});

test('apagada: el waitUntil de la ruta llega tal cual a Pages, sin permiso que lo envuelva', async () => {
  const env = without0094(apiEnv('0')), gate = deferred();
  const original = env.DB.prepare.bind(env.DB);
  env.DB.prepare = sql => /retention/i.test(sql) ? {...original(sql), bind: (...a) => {
    const st = original(sql).bind(...a);
    return {...st, run: async () => { await gate.promise; return st.run(); }, first: async () => { await gate.promise; return st.first(); }};
  }} : original(sql);
  const r = await request(env, 'GET', '/admin/notifications/counts', {cookie: await adminCookie()});
  assert.equal(r.res.status, 200);
  assert.equal(r.later.length, 1, 'solo la promesa de retención de la ruta');
  gate.resolve();
  await Promise.all(r.later);
});

test('compuerta cerrada: /api, la rama Hermes y los GET que escriben responden 503 sin correr ni leer el cuerpo', async t => {
  t.mock.method(console, 'log', () => {});
  const env = apiEnv('1');
  await closeWriteGate(env, {run_id: RUN});
  const before = env.DB.raw.prepare('SELECT count(*) AS n FROM app_settings').get().n;
  for (const [method, path, opts] of (await SAMPLE()).filter(([, path]) => path !== '/listings')) { // lectura pública: abajo
    const r = await request(env, method, path, opts), out = await settle(r);
    assert.equal(out.status, 503, `${method} ${path}`);
    assert.equal(out.retry, '60');
    assert.equal(JSON.parse(out.text).code, 'backup_maintenance');
    assert.equal(r.req.bodyUsed, false, 'el cuerpo queda intacto para reintentar');
    if (/admin|hermes/.test(path)) assert.equal(out.cache, 'no-store');
  }
  assert.equal(setting(env, 'hermes'), null, 'Hermes no dejó su hora');
  assert.equal(env.DB.raw.prepare('SELECT count(*) AS n FROM app_settings').get().n, before);
  assert.deepEqual(permits(env), []);
});

// (d) Spec TP-01 «Frontera de escritura»: todo /api dentro de la compuerta salvo una lista de lecturas demostradas. Las
// lecturas públicas de la web se prueban aquí con un D1 que solo admite SELECT, con los interruptores apagados, los de
// producción (wrangler.toml) y los suyos encendidos: no piden permiso, así que siguen respondiendo durante la copia y
// cuando falla la escritura del permiso.
const PRODUCTION_VARS = Object.fromEntries([...readFileSync(new URL('../../wrangler.toml', import.meta.url), 'utf8')
  .matchAll(/^([A-Z0-9_]+) = "([^"]*)"$/gm)].map(m => [m[1], m[2]]));
const PUBLIC_READS = ['/listings', '/config', '/availability', '/availability?listing_id=HE-R001', '/applicants/options'];
test('las lecturas públicas de la web solo leen: fuera de la compuerta, responden con la copia en marcha', async t => {
  t.mock.method(console, 'log', () => {});
  const allOn = {...PRODUCTION_VARS, ANA10_QR_NO_STORE: '1', REG15_ALERTS_READY: '1', PRE10_PURPOSE_READY: '1',
    ANA04_SEARCH_STATS_READY: '1', PUB16_TIMED_CLOSURE_READY: '1', PUB08_CONTENT_READY: '1', VIS10_HOUSE_RULES_READY: '1'};
  for (const flags of [{}, PRODUCTION_VARS, allOn]) {
    const env = {...apiEnv('1'), ...flags, BACKUP_READY: '1'};
    await closeWriteGate(env, {run_id: RUN});
    const seen = sqlLog(env);
    for (const path of PUBLIC_READS) assert.equal((await settle(await request(env, 'GET', path))).status, 200, path);
    assert.ok(seen.length > 0 && seen.every(s => /^\s*(SELECT|WITH)\b/i.test(s) && !/backup_/.test(s)), seen.join('\n---\n'));
    assert.deepEqual(permits(env), []);
  }
});

test('una escritura del permiso que falla no tumba las lecturas públicas; el resto sigue dentro', async t => {
  t.mock.method(console, 'error', () => {});
  const env = apiEnv('1'), original = env.DB.prepare.bind(env.DB);
  env.DB.prepare = sql => /INSERT INTO backup_writers/.test(sql) ? {bind: () => ({run: async () => { throw new Error('D1 busy'); }})}
    : original(sql);
  for (const path of PUBLIC_READS) assert.equal((await settle(await request(env, 'GET', path))).status, 200, path);
  assert.equal((await settle(await request(env, 'GET', '/admin/notifications/counts', {cookie: await adminCookie()}))).status, 500);
  assert.equal((await settle(await request(env, 'HEAD', '/listings'))).status, 500, 'solo GET');
});

// (f) Un waitUntil registrado cuando el permiso de la petición ya se cerró lleva su propio permiso hasta acabar; si la
// compuerta está cerrada entra igual (ya corre) e invalida esa captura.
test('waitUntil tardío: su propio permiso hasta acabar, también con la compuerta cerrada', async () => {
  const env = apiEnv('1'), pages = [];
  let routeWaitUntil;
  const res = await gated(env, ['admin'], async wu => { routeWaitUntil = wu; return new Response('ok'); }, p => pages.push(p));
  assert.equal(res.status, 200);
  await Promise.all(pages);
  assert.deepEqual(permits(env), [{operation: 'api:admin', open: false}]);

  const late = deferred();
  routeWaitUntil(late.promise);
  assert.equal(pages.length, 2, 'Pages espera el permiso tardío');
  await new Promise(r => setImmediate(r));
  assert.deepEqual(permits(env).map(p => p.open), [false, true]);
  late.resolve();
  await Promise.all(pages);
  assert.deepEqual(permits(env).map(p => p.open), [false, false]);

  const {epoch} = await closeWriteGate(env, {run_id: RUN});
  const closed = deferred();
  routeWaitUntil(closed.promise);
  await new Promise(r => setImmediate(r));
  assert.equal(await drainState(env, {run_id: RUN, epoch}), 'invalidated', 'esa copia no sella');
  closed.resolve();
  await Promise.all(pages);
  assert.ok(permits(env).every(p => !p.open));
});

test('el permiso sigue abierto hasta que acaba el waitUntil, aunque la respuesta ya salió', async () => {
  const env = apiEnv('1'), gate = deferred();
  const original = env.DB.prepare.bind(env.DB);
  env.DB.prepare = sql => /retention/i.test(sql) ? {...original(sql), bind: (...a) => {
    const st = original(sql).bind(...a);
    return {...st, run: async () => { await gate.promise; return st.run(); }, first: async () => { await gate.promise; return st.first(); }};
  }} : original(sql);
  const r = await request(env, 'GET', '/admin/notifications/counts', {cookie: await adminCookie()});
  assert.equal(r.res.status, 200);
  assert.deepEqual(permits(env), [{operation: 'api:admin', open: true}]);
  gate.resolve();
  await Promise.all(r.later);
  assert.deepEqual(permits(env), [{operation: 'api:admin', open: false}]);
});

test('Hermes con la compuerta abierta escribe dentro de su permiso', async () => {
  const env = apiEnv('1');
  const out = await settle(await request(env, 'POST', '/hermes/pause', {bearer: KEY, origin: null}));
  assert.equal(out.status, 200);
  assert.ok(setting(env, 'hermes'));
  assert.deepEqual(permits(env), [{operation: 'api:hermes', open: false}]);
});

const tick = env => jobs.scheduled({cron: '*/10 * * * *', scheduledTime: Date.parse(TS)}, env, {waitUntil() {}});
test('reloj: apagado corre igual sin 0094; cerrada no escribe ni envía; abierta corre en un permiso', async t => {
  t.mock.method(console, 'log', () => {});
  const off = without0094(emailEnv()), seen = sqlLog(off);
  await tick(off);
  assert.ok(setting(off, 'clock'));
  assert.ok(!seen.some(s => /backup_/.test(s)));

  const closed = {...emailEnv(), BACKUP_READY: '1'};
  await closeWriteGate(closed, {run_id: RUN});
  const wrote = sqlLog(closed);
  await tick(closed);
  assert.equal(setting(closed, 'clock'), null);
  assert.equal(closed.sent.length, 0);
  assert.ok(wrote.every(s => /backup_writers/.test(s)), 'solo intentó su permiso');

  const open = {...emailEnv(), BACKUP_READY: '1'};
  await tick(open);
  assert.ok(setting(open, 'clock'));
  assert.deepEqual(permits(open), [{operation: 'jobs:scheduled', open: false}]);
});

const mail = () => {
  const bytes = new TextEncoder().encode(`From: Person <team@example.test>\r\nTo: ${EMAIL_REPLY_TO}\r\nSubject: Hi\r\n` +
    'Message-ID: <a@example.test>\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nHello');
  return {from: 'team@example.test', to: EMAIL_REPLY_TO, rawSize: bytes.length, rejected: null,
    raw: new ReadableStream({start(c) { c.enqueue(bytes); c.close(); }}), setReject(reason) { this.rejected = reason; }};
};
const inbox = env => env.DB.raw.prepare('SELECT count(*) AS n FROM email_inbound').get().n;
test('correo entrante: apagado igual sin 0094; cerrada lo rechaza sin guardar; abierta lo guarda en un permiso', async () => {
  const off = without0094(emailEnv()), m0 = mail(), seen = sqlLog(off);
  await jobs.email(m0, off);
  assert.equal(m0.rejected, null);
  assert.equal(inbox(off), 1);
  assert.ok(!seen.some(s => /backup_/.test(s)));

  const closed = {...emailEnv(), BACKUP_READY: '1'}, m1 = mail();
  await closeWriteGate(closed, {run_id: RUN});
  await jobs.email(m1, closed);
  assert.match(m1.rejected, /backup/i);
  assert.equal(inbox(closed), 0);

  const open = {...emailEnv(), BACKUP_READY: '1'}, m2 = mail();
  await jobs.email(m2, open);
  assert.equal(m2.rejected, null);
  assert.equal(inbox(open), 1);
  assert.deepEqual(permits(open), [{operation: 'jobs:email', open: false}]);
});

test('con spool, el correo durante la copia se guarda cifrado y el primer tick con la compuerta abierta lo procesa', async () => {
  const objects = new Map();
  const INBOUND_SPOOL = {async put(k, b) { objects.set(k, b); }, async get(k) { const b = objects.get(k); return b && {arrayBuffer: async () => b.slice().buffer}; },
    async delete(k) { objects.delete(k); },
    async list() { return {objects: [...objects.keys()].sort().map(key => ({key, size: objects.get(key).byteLength})), truncated: false}; }};
  const env = {...emailEnv(), BACKUP_READY: '1', INBOUND_SPOOL, BACKUP_SPOOL_KEY: Buffer.alloc(32, 3).toString('base64')}, m = mail();
  await closeWriteGate(env, {run_id: RUN});
  await jobs.email(m, env);
  assert.equal(m.rejected, null, 'aceptado: queda en el spool');
  assert.equal([objects.size, inbox(env)].join(), '1,0');
  await tick(env);
  assert.equal(inbox(env), 0, 'cerrada: el tick no procesa nada');
  await openWriteGate(env, {run_id: RUN, epoch: 1, now: new Date().toISOString()});
  await tick(env);
  assert.equal([objects.size, inbox(env)].join(), '0,1');
});

// media.js y seo.js quedan fuera de la compuerta: solo leen. Se comprueba con un D1 que solo admite SELECT y un R2 que
// solo admite get/head, con la compuerta cerrada (siguen sirviendo durante la copia).
test('media, ficha /p, /properties, sitemap y robots solo leen: excluidas de la compuerta', async t => {
  // HTMLRewriter es de Workers; aquí solo importa qué datos se leen, no la reescritura.
  globalThis.HTMLRewriter = class { on() { return this; } transform(response) { return response; } };
  t.after(() => { delete globalThis.HTMLRewriter; });
  const env = {...makeEnv(), BACKUP_READY: '1', SITE_URL: 'https://www.hamptonestatesjersey.com',
    ASSETS: {fetch: async () => new Response('<!doctype html><head><title>spa</title></head><body></body>')}};
  seedListing(env); seedMedia(env);
  seedMedia(env, {id: 'A00002', r2_key: 'docs/private.pdf', thumb_key: null, kind: 'document', public: 0, content_type: 'application/pdf'});
  await env.MEDIA.put('media/hampton/a.jpg', new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), {httpMetadata: {contentType: 'image/jpeg'}});
  await env.MEDIA.put('thumbs/hampton/a.jpg', new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), {httpMetadata: {contentType: 'image/jpeg'}});
  await env.MEDIA.put('docs/private.pdf', new TextEncoder().encode('%PDF-1.4'), {httpMetadata: {contentType: 'application/pdf'}});
  await closeWriteGate(env, {run_id: RUN});
  const seen = sqlLog(env), r2 = [], bucket = env.MEDIA;
  env.MEDIA = {get: k => { r2.push('get'); return bucket.get(k); }, head: k => { r2.push('head'); return bucket.head(k); },
    put: () => assert.fail('R2 put'), delete: () => assert.fail('R2 delete'), list: () => assert.fail('R2 list')};
  const site = 'https://www.hamptonestatesjersey.com', cookie = await adminCookie();
  const get = (path, headers = {}) => new Request(site + path, {headers});
  const answers = [
    await mediaFn({request: get('/media/A00001'), env, params: {id: 'A00001'}}),
    await mediaFn({request: get('/media/A00001?thumb'), env, params: {id: 'A00001'}}),
    await mediaFn({request: get('/media/A00002', {cookie}), env, params: {id: 'A00002'}}),
    await mediaFn({request: get('/media/A00002'), env, params: {id: 'A00002'}}),
    await listingFn({request: get('/p/HE-R001?src=qr'), env, params: {id: 'HE-R001'}}),
    await listingHead({request: get('/p/HE-R001'), env, params: {id: 'HE-R001'}}),
    await listingFn({request: get('/p/HE-X999'), env, params: {id: 'HE-X999'}}),
    await propertiesFn({request: get('/properties'), env}),
    await sitemapFn({request: get('/sitemap.xml'), env}),
    await robotsFn({request: get('/robots.txt'), env}),
  ];
  assert.deepEqual(answers.map(r => r.status), [200, 200, 200, 404, 200, 200, 404, 200, 200, 200]);
  assert.ok(seen.length > 0 && seen.every(s => /^\s*(SELECT|WITH)\b/i.test(s) && !/backup_/.test(s)), seen.join('\n---\n'));
  assert.ok(r2.length > 0);
  assert.deepEqual(permits(env), []);
});

// PRE-06: el middleware de /admin solo mira la aserción de Access y sirve los archivos del panel: ni D1 ni R2, con el
// interruptor apagado o encendido (sin aserción, mal configurado o con una aserción que no vale).
test('functions/admin/_middleware.js no toca D1 ni R2: excluida de la compuerta', async () => {
  const untouchable = name => new Proxy({}, {get: (_, k) => assert.fail(`${name}.${String(k)}`)});
  const base = {DB: untouchable('DB'), MEDIA: untouchable('MEDIA'), BACKUP_READY: '1', SITE_URL: 'https://www.hamptonestatesjersey.com'};
  const on = {PRE06_ACCESS_READY: '1', ACCESS_TEAM_DOMAIN: 'https://pre14-panel.cloudflareaccess.com', ACCESS_STAFF_AUD: 'a'.repeat(64)};
  const statuses = [];
  for (const [env, headers] of [[base, {}], [{...base, ...on}, {}], [{...base, ...on}, {'cf-access-jwt-assertion': 'x.y.z'}],
    [{...base, PRE06_ACCESS_READY: '1'}, {}]]) {
    const request = new Request('https://www.hamptonestatesjersey.com/admin/', {headers});
    statuses.push((await panelFn({request, env, next: async () => new Response('panel')})).status);
  }
  assert.deepEqual(statuses, [200, 403, 403, 503]);
});

// hampton-jobs no empaqueta la sesión del panel (auth.js, jose): la compuerta no los importa.
test('el grafo de importación de server/jobs.js no llega a auth.js ni a jose', () => {
  const seen = new Set();
  const walk = url => {
    if (seen.has(url.href)) return;
    seen.add(url.href);
    for (const [, spec] of readFileSync(url, 'utf8').matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g))
      if (spec.startsWith('.')) walk(new URL(spec, url)); else seen.add(spec);
  };
  walk(new URL('../../server/jobs.js', import.meta.url));
  assert.ok(seen.has(new URL('../../server/backup-write-gate.js', import.meta.url).href));
  assert.deepEqual([...seen].filter(s => /\/auth\.js$|^jose/.test(s)), []);
});
