// PRE-14 · Task 4/5: dobles para las pruebas del Workflow semanal. D1 en node:sqlite (makeDb), R2 simulado con put
// condicional (If-None-Match: * y etagMatches), API de exportación de D1 simulada y claves de prueba generadas aquí.
// Nada toca Cloudflare ni se guarda una clave en un archivo versionado.
import {webcrypto as crypto, createHash} from 'node:crypto';
import {makeDb, T0, dumpD1} from './helpers.mjs';

export const API = 'https://api.cloudflare.com/client/v4/accounts/acct-test/d1/database/db-test/export';
const recovery = await crypto.subtle.generateKey(
  {name: 'RSA-OAEP', modulusLength: 3072, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256'}, true, ['wrapKey', 'unwrapKey']);
const signing = await crypto.subtle.generateKey({name: 'Ed25519'}, true, ['sign', 'verify']);
const b64 = async (fmt, key) => Buffer.from(await crypto.subtle.exportKey(fmt, key)).toString('base64');
export const TOKEN = `token-${crypto.randomUUID()}`;
const KEYS = {BACKUP_RECOVERY_PUBLIC_KEY: await b64('spki', recovery.publicKey),
  BACKUP_SIGNING_KEY: await b64('pkcs8', signing.privateKey), BACKUP_SIGNING_KEY_ID: 'sign-test'};

export function bucket() {
  const m = new Map();
  const b = {
    m, hooks: {},
    async put(key, body, opts = {}) {
      const c = opts.onlyIf;
      if (c instanceof Headers && c.get('if-none-match') === '*' && m.has(key)) return null;
      if (c && !(c instanceof Headers) && c.etagMatches !== undefined && m.get(key)?.etag !== c.etagMatches) return null;
      const data = typeof body === 'string' ? new TextEncoder().encode(body) : new Uint8Array(body).slice();
      const etag = createHash('md5').update(data).update(String(Math.random())).digest('hex');
      m.set(key, {data, etag, httpMetadata: opts.httpMetadata ?? {}, customMetadata: opts.customMetadata ?? {}, checksums: {}});
      return {key, etag, size: data.length};
    },
    async get(key) {
      await b.hooks.get?.(key);
      const o = m.get(key);
      if (!o) return null;
      const data = o.data.slice();
      return {key, size: data.length, etag: o.etag, httpMetadata: o.httpMetadata, customMetadata: o.customMetadata,
        checksums: o.checksums, body: new Blob([data]).stream(), arrayBuffer: async () => data.buffer,
        text: async () => new TextDecoder().decode(data)};
    },
    async list({prefix = '', cursor} = {}) {
      const keys = [...m.keys()].filter(k => k.startsWith(prefix)).sort(), start = Number(cursor ?? 0);
      const truncated = start + 2 < keys.length;
      return {objects: keys.slice(start, start + 2).map(k => ({key: k, size: m.get(k).data.length, etag: m.get(k).etag})),
        truncated, ...(truncated ? {cursor: String(start + 2)} : {})};
    },
    async delete(keys) { for (const k of [].concat(keys)) m.delete(k); },
  };
  return b;
}

// Un entorno del worker de respaldo con una propiedad, una foto y su miniatura.
export async function backupEnv() {
  const env = {DB: makeDb(), MEDIA: bucket(), BACKUPS: bucket(), BACKUP_READY: '1', CF_ACCOUNT_ID: 'acct-test',
    D1_DATABASE_ID: 'db-test', D1_EXPORT_TOKEN: TOKEN, ...KEYS};
  const db = env.DB.raw;
  db.prepare(`INSERT INTO listings (id, use, title, operation, availability, created_at, updated_at)
    VALUES ('HE-T001', 'residential', 'Test cottage', 'rent', 'to_let', ?, ?)`).run(T0, T0);
  db.prepare(`INSERT INTO media (id, listing_id, r2_key, thumb_key, origin, kind, created_at)
    VALUES ('m1', 'HE-T001', 'media/a.jpg', 'thumbs/a.jpg', 'upload', 'photo', ?)`).run(T0);
  await env.MEDIA.put('media/a.jpg', new Uint8Array(150).fill(7));
  await env.MEDIA.put('thumbs/a.jpg', new Uint8Array(40).fill(9));
  return env;
}

// API de exportación: s.hang deja el polling colgado (el paso muere a mitad de la exportación).
export function exportApi(env, s = {}) {
  const signedUrl = `https://export.test/dl/${crypto.randomUUID()}?X-Amz-Signature=${crypto.randomUUID()}`;
  const ok = result => new Response(JSON.stringify({success: true, errors: [], result}), {status: 200});
  const state = {calls: [], signedUrl, exporting: false};
  state.fetch = async (url, init = {}) => {
    url = String(url);
    state.calls.push({url, body: init.body ? JSON.parse(init.body) : null});
    if (url === signedUrl) {
      const sql = new TextEncoder().encode(dumpD1(env.DB.raw));
      state.exporting = false;
      return new Response(sql, {status: 200, headers: {'content-length': String(sql.length)}});
    }
    if (!JSON.parse(init.body).current_bookmark) {
      state.exporting = true;
      return ok({at_bookmark: 'bm-1', status: 'active'});
    }
    return ok({at_bookmark: 'bm-1', status: 'complete', result: {signed_url: signedUrl}});
  };
  state.starts = () => state.calls.filter(c => c.url === API && !c.body.current_bookmark).length;
  return state;
}

// Reloj de la captura: los plazos del Worker avanzan sin esperar; hang() cuelga la siguiente espera (proceso muerto).
export function fakeClock() {
  let t = 0, hang = null;
  return {now: () => null, ms: () => t, hang: when => { hang = when; },
    sleep: async ms => { if (hang?.()) return new Promise(() => {}); t += ms; }};
}

// Paso de Workflow simulado: retries.limit como Cloudflare (limit 0 = un solo intento), resultados serializables,
// sleepUntil registrado. kill[name] sustituye la ejecución del paso (p. ej. muere a medias); onRetry simula el tiempo.
export function fakeStep({kill = {}, onRetry} = {}) {
  const log = [];
  return {
    log,
    async do(name, config, fn) {
      if (typeof config === 'function') [config, fn] = [{}, config];
      const limit = config.retries?.limit ?? 5;
      for (let i = 0; ; i++) {
        try {
          const r = await (kill[name] ? kill[name](fn) : fn());
          log.push({name, config, result: r});
          return r === undefined ? r : structuredClone(r);
        } catch (e) {
          if (i >= limit) { log.push({name, config, error: e.message}); throw e; }
          await onRetry?.(name, i);
        }
      }
    },
    async sleepUntil(name, when) { log.push({name, sleepUntil: new Date(when).toISOString()}); },
  };
}

// El paso muere: la captura sigue colgada en segundo plano y el motor de Workflows ve un fallo.
export const dies = fn => { fn().catch(() => {}); return new Promise((_, reject) => setTimeout(() => reject(new Error('killed')), 20)); };
