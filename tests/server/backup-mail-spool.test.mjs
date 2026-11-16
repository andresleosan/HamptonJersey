// PRE-14 · Task 5: correo entrante durante la copia semanal, cifrado en un spool R2 y procesado al reabrir.
import test from 'node:test';
import assert from 'node:assert/strict';
import {emailEnv} from './email-helpers.mjs';
import {EMAIL_REPLY_TO} from '../../server/email.js';
import {stageInboundDuringBackup, replayBackupInbound, spoolReady} from '../../server/backup-mail-spool.js';

const message = (raw, over = {}) => {
  const bytes = new TextEncoder().encode(raw);
  return {from: 'team@example.test', to: EMAIL_REPLY_TO, rawSize: bytes.length,
    raw: new ReadableStream({start(c) { c.enqueue(bytes); c.close(); }}), setReject() {}, ...over};
};
const KEY = Buffer.alloc(32, 7).toString('base64');
const AT = '2026-11-15T02:05:00.000Z';
const spool = () => {
  const store = new Map();
  return {store,
    async put(k, body) { store.set(k, new Uint8Array(body)); },
    async get(k) { const b = store.get(k); return b && {arrayBuffer: async () => b.slice().buffer}; },
    async delete(k) { store.delete(k); },
    async list({limit = 1000, prefix = ''} = {}) {
      const objects = [...store.keys()].filter(k => k.startsWith(prefix)).sort().map(key => ({key, size: store.get(key).byteLength}));
      return {objects: objects.slice(0, limit), truncated: objects.length > limit};
    }};
};
const env = over => ({...emailEnv(), INBOUND_SPOOL: spool(), BACKUP_SPOOL_KEY: KEY, ...over});
const mime = (text = 'Reply during backup') => `From: Person <team@example.test>\r\nTo: ${EMAIL_REPLY_TO}\r\nSubject: Hi\r\n`
  + `Message-ID: <spool@example.test>\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${text}`;
const inbox = e => e.DB.raw.prepare('SELECT text, received_at FROM email_inbound').all();

test('sin bucket o sin clave no hay spool y nada se acepta', async () => {
  for (const over of [{INBOUND_SPOOL: undefined}, {BACKUP_SPOOL_KEY: undefined}, {BACKUP_SPOOL_KEY: 'short'}]) {
    const e = env(over);
    assert.equal(spoolReady(e), false);
    assert.equal(await stageInboundDuringBackup(message(mime()), e, AT), 'spool_unavailable');
  }
});

test('se guarda cifrado, sin datos en claro, y al reabrir entra una vez con su hora de llegada', async () => {
  const e = env();
  assert.equal(await stageInboundDuringBackup(message(mime()), e, AT), 'staged');
  const [[k, body]] = [...e.INBOUND_SPOOL.store];
  assert.match(k, /^mail\/2026-11-15T02:05:00\.000Z\/[0-9a-f-]{36}$/);
  const plain = Buffer.from(body).toString('latin1');
  for (const s of ['team@example.test', 'Reply during backup', EMAIL_REPLY_TO]) assert.ok(!plain.includes(s), s);
  assert.equal(inbox(e).length, 0);
  assert.deepEqual(await replayBackupInbound(e), {stored: 1, rejected: 0, failed: 0});
  assert.equal(e.INBOUND_SPOOL.store.size, 0);
  assert.deepEqual(inbox(e).map(r => [r.text.trimEnd(), r.received_at]), [['Reply during backup', AT]]);
});

test('si D1 falla al procesar, el mensaje se queda; el reintento no lo duplica', async () => {
  const e = env();
  await stageInboundDuringBackup(message(mime()), e, AT);
  const batch = e.DB.batch.bind(e.DB);
  e.DB.batch = async s => { await batch(s); throw new Error('uncertain'); };
  assert.deepEqual(await replayBackupInbound(e), {stored: 0, rejected: 0, failed: 1});
  assert.equal(e.INBOUND_SPOOL.store.size, 1);
  e.DB.batch = batch;
  assert.deepEqual(await replayBackupInbound(e), {stored: 1, rejected: 0, failed: 0});
  assert.equal(inbox(e).length, 1);
});

test('lo que no se aceptaría fuera de la copia tampoco se acepta, ni pasado de 1 MiB ni con el spool lleno', async () => {
  assert.equal(await stageInboundDuringBackup(message(mime(), {to: 'other@example.test'}), env(), AT), 'not_accepted');
  const big = 'x'.repeat(1024 * 1024 + 1);
  assert.equal(await stageInboundDuringBackup(message(big, {rawSize: 10}), env(), AT), 'too_large');
  const e = env();
  for (let i = 0; i < 1000; i++) e.INBOUND_SPOOL.store.set(`k${String(i).padStart(4, '0')}`, new Uint8Array(1));
  assert.equal(await stageInboundDuringBackup(message(mime()), e, AT), 'spool_full');
  const e2 = env(), put = e2.INBOUND_SPOOL.put;
  e2.INBOUND_SPOOL.put = async () => { throw new Error('r2 down'); };
  await assert.rejects(stageInboundDuringBackup(message(mime()), e2, AT));
  e2.INBOUND_SPOOL.put = put;
});

const keys = e => [...e.INBOUND_SPOOL.store.keys()].map(k => k.split('/')[0]);
test('ilegible o rechazado al procesar: pasa cifrado a refused/, nunca se borra ni bloquea la cola', async () => {
  const e = env();
  await stageInboundDuringBackup(message(mime()), e, AT);
  e.BACKUP_SPOOL_KEY = Buffer.alloc(32, 9).toString('base64');
  assert.deepEqual(await replayBackupInbound(e), {stored: 0, rejected: 0, failed: 1});
  assert.deepEqual(keys(e), ['refused']);
  assert.deepEqual(await replayBackupInbound(e), {stored: 0, rejected: 0, failed: 0}, 'ya no está en la cola');

  const e2 = env();
  await stageInboundDuringBackup(message('not a mime message at all \u0000', {}), e2, AT);
  const r = await replayBackupInbound(e2);
  assert.equal(r.stored + r.rejected, 1);
  if (r.rejected) assert.deepEqual(keys(e2), ['refused']);
});

test('con el servicio de correo apagado al reabrir no se procesa nada y todo se queda', async () => {
  const e = env();
  await stageInboundDuringBackup(message(mime()), e, AT);
  e.EMAIL_SERVICE_READY = 'false';
  assert.deepEqual(await replayBackupInbound(e), {stored: 0, rejected: 0, failed: 0});
  assert.deepEqual(keys(e), ['mail']);
});
