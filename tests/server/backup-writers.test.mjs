// PRE-14 · Task 1: cada entrada de docs/roadmap/work/PRE-14/writer-coverage.md, con la compuerta de escrituras.
// Apagada (BACKUP_READY ausente o "0") todo responde igual y nada toca las tablas de la migración 0094.
import test from 'node:test';
import assert from 'node:assert/strict';
import {makeEnv, seedListing, seedMedia, adminCookie, ORIGIN} from './helpers.mjs';
import {emailEnv, TS} from './email-helpers.mjs';
import {handleApi} from '../../server/api.js';
import {closeWriteGate} from '../../server/backup-write-gate.js';
import jobs from '../../server/jobs.js';
import {EMAIL_REPLY_TO} from '../../server/email.js';
import {onRequestGet as mediaFn} from '../../functions/media/[id].js';
import {onRequestGet as listingFn, onRequestHead as listingHead} from '../../functions/p/[id].js';
import {onRequestGet as propertiesFn} from '../../functions/properties.js';
import {onRequestGet as sitemapFn} from '../../functions/sitemap.xml.js';
import {onRequestGet as robotsFn} from '../../functions/robots.txt.js';

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
    else assert.deepEqual(permits(env).map(p => p.open), Array(6).fill(false), 'encendida: un permiso por petición, cerrados');
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
  for (const [method, path, opts] of await SAMPLE()) {
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
