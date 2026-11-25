// BUS-19 · 25-nov-2026, decisión de Luis «Fuera las 34»: las fuentes permitidas que están en la lista de canales
// aplazados de BUS-24 pasan a «solo manual» (access_status='manual_only', method='manual').
// Escribe las mismas filas que la revisión de un canal en el panel (server/market-source-policy.js, reviewSourceAccess):
// UPDATE con versión +1 y una fila de historial por canal, con su request_sha256 y snapshot_json.
//
// 1) Estado de producción (solo lectura) y su copia mínima, sin datos de personas:
//   npx wrangler d1 execute hampton --remote --json --command "SELECT source_ref,channel_id,directory_revision,
//     source_kind,source_class,access_status,method,policy_version,allowed_hosts,allowed_redirect_hosts,review_due_at,
//     retention_ref,min_interval_s FROM market_sources ORDER BY source_ref,channel_id" > fuentes.json
//   npx wrangler d1 execute hampton --remote --json --command "SELECT source_ref,channel_id,decision_version,
//     operation_id FROM market_source_policy_history ORDER BY source_ref,channel_id,decision_version" > historial.json
//   node docs/roadmap/work/BUS-19/generar-aplazados-2026-11-25.mjs --estado fuentes.json historial.json
// 2) Archivos de la decisión (deterministas: mismo estado, mismos bytes):
//   node docs/roadmap/work/BUS-19/generar-aplazados-2026-11-25.mjs
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const here = new URL('./', import.meta.url);
const ESTADO = new URL('estado-fuentes-2026-11-25.json', here);
const LISTA = new URL('../BUS-24/canales-aplazados.md', here);
const ACTOR = 'claude-por-encargo-de-luis';
const REVIEWED_AT = '2026-11-25T05:30:00.000Z'; // anterior a la aplicación: el panel no la mostraría como pendiente
const EVIDENCE = domain => `BUS-24/canales-aplazados-2026-11-20/${domain}`;
const MOTIVO = {
  A: 'prohibido por sus términos o su robots.txt',
  B: 'limitan copiar o el uso comercial',
  D: 'no se pudo leer (web caída o términos con JavaScript)',
  E: 'no es agencia o queda fuera por política',
};

const sha = text => createHash('sha256').update(text, 'utf8').digest('hex');
// UUID v5 (RFC 9562) sobre un nombre fijo por canal y versión: el validador del panel lo acepta y se repite igual.
function uuid5(name) {
  const ns = Buffer.from('6ba7b8119dad11d180b400c04fd430c8', 'hex');
  const b = createHash('sha1').update(Buffer.concat([ns, Buffer.from(name, 'utf8')])).digest().subarray(0, 16);
  b[6] = (b[6] & 0x0f) | 0x50; b[8] = (b[8] & 0x3f) | 0x80;
  const h = b.toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
const q = value => value === null ? 'NULL' : typeof value === 'number' ? String(value) : `'${String(value).replace(/'/g, "''")}'`;

if (process.argv[2] === '--estado') {
  const rows = file => JSON.parse(readFileSync(file, 'utf8')).flatMap(r => r.results ?? []);
  const sources = rows(process.argv[3]).map(r => ({ ...r, allowed_hosts: JSON.parse(r.allowed_hosts),
    allowed_redirect_hosts: JSON.parse(r.allowed_redirect_hosts) }));
  writeFileSync(ESTADO, JSON.stringify({ leido: new Date().toISOString().slice(0, 10), sources,
    history: rows(process.argv[4]) }, null, 1) + '\n');
  process.exit(0);
}

const estado = JSON.parse(readFileSync(ESTADO, 'utf8'));
const grupos = new Map(); let grupo = null;
for (const line of readFileSync(LISTA, 'utf8').split('\n')) {
  const g = line.match(/^## ([A-E]) /); if (g) { grupo = g[1]; continue; }
  const d = line.match(/^- (\S+)$/); if (d && grupo) grupos.set(d[1], grupo);
}
const onList = host => [...grupos.keys()].find(d => host === d || host.endsWith(`.${d}`));
const allowed = estado.sources.filter(s => s.access_status === 'allowed');
const channelDomain = s => [...s.allowed_hosts, ...s.allowed_redirect_hosts].map(onList).find(Boolean) ?? null;
const fuentes = [...new Set(allowed.filter(channelDomain).map(s => s.source_ref))].sort();

const decisions = [], sql = [];
for (const ref of fuentes) {
  const canales = allowed.filter(s => s.source_ref === ref);
  const fuenteDomain = canales.map(channelDomain).find(Boolean);
  for (const s of canales) {
    const domain = channelDomain(s) ?? fuenteDomain, expectedVersion = s.policy_version;
    if (s.source_kind !== 'external' || s.source_class !== 'general') throw new Error(`Clase inesperada: ${ref}`);
    const next = { source_ref: ref, channel_id: s.channel_id,
      operation_id: uuid5(`hampton/BUS-19/2026-11-25/${ref}/${s.channel_id}/${expectedVersion + 1}`),
      source_class: 'general', status: 'manual_only', method: 'manual', allowed_hosts: [], allowed_paths: [],
      allowed_redirect_hosts: [], min_interval_s: s.min_interval_s, evidence_ref: EVIDENCE(domain),
      retention_ref: s.retention_ref, review_due_at: s.review_due_at };
    const requestHash = sha(JSON.stringify({ next, actor: ACTOR, expectedVersion }));
    const snapshot = JSON.stringify({ source_ref: ref, channel_id: s.channel_id, version: expectedVersion + 1,
      source_class: 'general', status: 'manual_only', method: 'manual', allowed_hosts: [], allowed_paths: [],
      allowed_redirect_hosts: [], min_interval_s: s.min_interval_s, checked_at: REVIEWED_AT,
      review_due_at: s.review_due_at, evidence_ref: next.evidence_ref, retention_ref: s.retention_ref });
    const where = `source_ref=${q(ref)} AND channel_id=${q(s.channel_id)}`;
    sql.push(`UPDATE market_sources SET source_class='general',access_status='manual_only',method='manual',` +
      `policy_version=${expectedVersion + 1},evidence_ref=${q(next.evidence_ref)},retention_ref=${q(s.retention_ref)},` +
      `reviewed_at=${q(REVIEWED_AT)},review_due_at=${q(s.review_due_at)},allowed_hosts='[]',allowed_paths='[]',` +
      `allowed_redirect_hosts='[]',min_interval_s=${s.min_interval_s} WHERE ${where} AND policy_version=${expectedVersion}` +
      ` AND access_status='allowed';`);
    sql.push(`INSERT OR IGNORE INTO market_source_policy_history(source_ref,channel_id,decision_version,operation_id,` +
      `request_sha256,snapshot_json,actor,reviewed_at) SELECT ${q(ref)},${q(s.channel_id)},${expectedVersion + 1},` +
      `${q(next.operation_id)},${q(requestHash)},${q(snapshot)},${q(ACTOR)},${q(REVIEWED_AT)} WHERE EXISTS (SELECT 1 FROM ` +
      `market_sources WHERE ${where} AND policy_version=${expectedVersion + 1} AND reviewed_at=${q(REVIEWED_AT)});`);
    const listed = channelDomain(s) !== null;
    decisions.push({ source_ref: ref, channel_id: s.channel_id, grupo: grupos.get(domain), dominio: domain,
      dominio_del_canal_en_lista: listed, version_antes: expectedVersion, version_despues: expectedVersion + 1,
      status: 'manual_only', operation_id: next.operation_id,
      motivo: listed ? MOTIVO[grupos.get(domain)] : `${MOTIVO[grupos.get(domain)]} (otro canal de la misma fuente;` +
        ` su propio dominio no está en la lista y sale con la fuente)`,
      evidencia: next.evidence_ref });
  }
}

const otros = estado.sources.filter(s => fuentes.includes(s.source_ref) && s.access_status !== 'allowed');
const distinct = list => new Set(list.map(s => s.source_ref)).size;
const resumen = {
  fuentes: fuentes.length, canales_cambiados: decisions.length,
  canales_no_permitidos_sin_cambio: otros.map(s => ({ source_ref: s.source_ref, channel_id: s.channel_id, status: s.access_status })),
  antes: { fuentes_permitidas: distinct(allowed), canales_permitidos: allowed.length },
  despues: { fuentes_permitidas: distinct(allowed.filter(s => !fuentes.includes(s.source_ref))),
    canales_permitidos: allowed.length - decisions.length },
  dominios_de_la_lista_sin_fuente_permitida: [...grupos.keys()].filter(d => !decisions.some(x => x.dominio === d)).sort(),
};
writeFileSync(new URL('decisiones-2026-11-25.json', here), JSON.stringify({ reviewed_at: REVIEWED_AT, actor: ACTOR,
  decision: 'Luis, 25-nov-2026: «Fuera las 34»', estado_leido: estado.leido, resumen, decisions }, null, 1) + '\n');
writeFileSync(new URL('decisiones-2026-11-25.sql', here), sql.join('\n') + '\n');
console.log(JSON.stringify({ ...resumen, canales_no_permitidos_sin_cambio: otros.length }));
