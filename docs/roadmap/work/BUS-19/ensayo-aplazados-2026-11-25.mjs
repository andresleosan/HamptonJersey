// BUS-19 · 25-nov-2026: ensayo local de decisiones-2026-11-25.sql, sin red y sin producción.
// Dos D1 locales (Miniflare) con todas las migraciones y el estado mínimo de estado-fuentes-2026-11-25.json:
// en una se aplica el SQL dos veces; en la otra, el código del panel (reviewSourceAccess) toma las mismas decisiones.
// Ambas deben quedar idénticas en market_sources y market_source_policy_history.
//   node docs/roadmap/work/BUS-19/ensayo-aplazados-2026-11-25.mjs
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { getSourceAccess, reviewSourceAccess } from '../../../../server/market-source-policy.js';

const require = createRequire(import.meta.url);
const { Miniflare, convertV4MiniflareOptions } = require('miniflare');
const { unstable_splitSqlQuery } = require('wrangler');
const here = new URL('./', import.meta.url), migrations = new URL('../../../../migrations/', import.meta.url);
const estado = JSON.parse(readFileSync(new URL('estado-fuentes-2026-11-25.json', here), 'utf8'));
const salida = JSON.parse(readFileSync(new URL('decisiones-2026-11-25.json', here), 'utf8'));
const sql = unstable_splitSqlQuery(readFileSync(new URL('decisiones-2026-11-25.sql', here), 'utf8'));
const SEED_AT = '2026-11-16T12:00:00.000Z';

async function seeded(db) {
  for (const name of readdirSync(migrations).filter(n => n.endsWith('.sql')).sort())
    await db.batch(unstable_splitSqlQuery(readFileSync(new URL(name, migrations), 'utf8')).map(s => db.prepare(s)));
  for (const rev of new Set(estado.sources.map(s => s.directory_revision).filter(Boolean)))
    await db.prepare("INSERT INTO market_directory_manifests VALUES (?,?,?,?,'accepted')").bind(rev, 'a'.repeat(64), SEED_AT, 'ensayo').run();
  for (const s of estado.sources) await db.prepare(`INSERT INTO market_sources(source_ref,channel_id,directory_revision,source_kind,
    source_class,access_status,method,policy_version,evidence_ref,reviewed_at,review_due_at,allowed_hosts,allowed_redirect_hosts,
    retention_ref,min_interval_s) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(s.source_ref, s.channel_id, s.directory_revision,
    s.source_kind, s.source_class, s.access_status, s.method, s.policy_version, 'ensayo', SEED_AT, s.review_due_at,
    JSON.stringify(s.allowed_hosts), JSON.stringify(s.allowed_redirect_hosts), s.retention_ref, s.min_interval_s).run();
  // Historial existente (versiones e identificadores reales): un choque de clave o de operation_id saldría aquí.
  for (const h of estado.history) await db.prepare(`INSERT INTO market_source_policy_history(source_ref,channel_id,decision_version,
    operation_id,request_sha256,snapshot_json,actor,reviewed_at) VALUES (?,?,?,?,?,'{}','ensayo',?)`)
    .bind(h.source_ref, h.channel_id, h.decision_version, h.operation_id, 'b'.repeat(64), SEED_AT).run();
}
const dump = async db => ({
  sources: (await db.prepare('SELECT * FROM market_sources ORDER BY source_ref,channel_id').all()).results,
  history: (await db.prepare('SELECT * FROM market_source_policy_history ORDER BY source_ref,channel_id,decision_version').all()).results,
});
const counts = async db => db.prepare(`SELECT
  (SELECT COUNT(DISTINCT source_ref) FROM market_sources WHERE access_status='allowed') AS fuentes_permitidas,
  (SELECT COUNT(*) FROM market_sources WHERE access_status='allowed') AS canales_permitidos,
  (SELECT COUNT(DISTINCT source_ref) FROM market_sources WHERE access_status='manual_only') AS fuentes_manuales,
  (SELECT COUNT(*) FROM market_source_policy_history) AS historial`).first();

const mf = new Miniflare(convertV4MiniflareOptions({ modules: true, script: "export default {fetch(){return new Response('x')}}",
  compatibilityDate: '2025-10-01', host: '127.0.0.1', port: 0, d1Databases: { SQL: 'ensayo-sql', PANEL: 'ensayo-panel' } }));
try {
  const a = await mf.getD1Database('SQL'), b = await mf.getD1Database('PANEL');
  await seeded(a); await seeded(b);
  const antes = await counts(a);
  console.log('antes', antes);

  const primera = await a.batch(sql.map(s => a.prepare(s)));
  const escritas = primera.reduce((n, r) => n + r.meta.changes, 0);
  const despues = await counts(a);
  console.log('después', despues, 'filas escritas', escritas);
  assert.equal(escritas, 2 * salida.decisions.length);
  assert.deepEqual({ f: despues.fuentes_permitidas, c: despues.canales_permitidos, h: despues.historial },
    { f: salida.resumen.despues.fuentes_permitidas, c: salida.resumen.despues.canales_permitidos,
      h: antes.historial + salida.decisions.length });

  const segunda = await a.batch(sql.map(s => a.prepare(s)));
  assert.equal(segunda.reduce((n, r) => n + r.meta.changes, 0), 0, 'la segunda aplicación no escribe nada');
  assert.deepEqual(await counts(a), despues);

  const clock = () => new Date(salida.reviewed_at);
  for (const d of salida.decisions) {
    const s = estado.sources.find(x => x.source_ref === d.source_ref && x.channel_id === d.channel_id);
    const receipt = await reviewSourceAccess({ DB: b }, { source_ref: d.source_ref, channel_id: d.channel_id,
      operation_id: d.operation_id, source_class: 'general', status: 'manual_only', method: 'manual', allowed_hosts: [],
      allowed_paths: [], allowed_redirect_hosts: [], min_interval_s: s.min_interval_s, evidence_ref: d.evidencia,
      retention_ref: s.retention_ref, review_due_at: s.review_due_at }, salida.actor, d.version_antes, clock);
    assert.equal(receipt.version, d.version_despues);
  }
  assert.deepEqual(await dump(a), await dump(b), 'el SQL deja las mismas filas que el panel');

  for (const d of salida.decisions) {
    const visto = await getSourceAccess({ DB: a }, d.source_ref, d.channel_id);
    assert.equal(visto.status, 'manual_only'); assert.equal(visto.method, 'manual'); assert.equal(visto.version, d.version_despues);
  }
  assert.deepEqual((await a.prepare('PRAGMA foreign_key_check').all()).results, []);
  console.log(`OK: ${salida.decisions.length} canales; SQL = panel; segunda aplicación sin cambios; el panel los ve como manual_only`);
} finally { await mf.dispose(); }
