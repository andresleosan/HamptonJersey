// Ruta de /avanzar: ordena las tareas abiertas del catálogo por lo que más acerca cierres.
// Uso: node scripts/avanzar-ruta.mjs [--top N] [--json]
import {readFileSync} from 'node:fs';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {resolve} from 'node:path';

const OPEN = new Set(['parcial', 'pendiente', 'bloqueado']);
const OUT = new Set(['descartado', 'replanteado']);
const DEV = new Set(['desarrollo', '—']);
// ponytail: pistas por texto de la ficha, no hechos; quien toma la tarea lo comprueba en su ficha.
const APAGADA = /migraci|activar|activaci|gate|esquema (real|remoto|propuesto)|SQL (es|propuesto)/i;
const CODE = /\b[A-Z]{3}-\d{2}\b/g;

export function ruta(catalog) {
  const byId = new Map(catalog.tasks.map(t => [t.id, t]));
  const open = catalog.tasks.filter(t => OPEN.has(t.estado));
  const isOpen = id => OPEN.has(byId.get(id)?.estado);
  const pending = t => (t.dependencies || []).map(d => d.id).filter(isOpen);

  // Cuántas tareas abiertas esperan, directa o indirectamente, a cada una.
  const waiters = new Map(open.map(t => [t.id, []]));
  for (const t of open) for (const id of pending(t)) waiters.get(id).push(t.id);
  const unlocks = id => {
    const seen = new Set(), stack = [...waiters.get(id)];
    while (stack.length) { const x = stack.pop(); if (!seen.has(x)) { seen.add(x); stack.push(...waiters.get(x)); } }
    return seen.size;
  };

  const row = t => {
    const text = `${t.falta || ''} ${t.nextStep || ''}`, deps = pending(t);
    const own = new Set([t.id, ...(t.dependencies || []).map(d => d.id)]);
    // Menciona tareas abiertas que no son dependencias suyas: suele esperar a consumidores (cierre por aceptación propia).
    const consumidores = [...new Set(text.match(CODE) || [])].filter(id => !own.has(id) && isOpen(id));
    return {id: t.id, estado: t.estado, responsable: t.responsable, titulo: t.titulo, desbloquea: unlocks(t.id),
      espera: deps, apagada: APAGADA.test(text), consumidores, externo: t.externalBlocker || t.bloqueo || ''};
  };
  const rank = (a, b) => b.desbloquea - a.desbloquea || (a.estado === 'parcial' ? 0 : 1) - (b.estado === 'parcial' ? 0 : 1) || a.id.localeCompare(b.id);

  const rows = open.map(row);
  const dev = rows.filter(r => DEV.has(r.responsable));
  const ahora = dev.filter(r => !r.espera.length).sort(rank);
  const ready = new Set(ahora.map(r => r.id));
  const despues = dev.filter(r => r.espera.length && r.espera.every(id => ready.has(id))).sort(rank);
  const luis = rows.filter(r => !DEV.has(r.responsable)).sort(rank);
  const aplicables = catalog.tasks.filter(t => !OUT.has(t.estado)).length;
  const hechas = catalog.tasks.filter(t => t.estado === 'hecho').length;
  return {hechas, aplicables, porcentaje: +(100 * hechas / aplicables).toFixed(2), ahora, despues, luis};
}

function print(r, top) {
  const line = x => `  ${x.id} [${x.estado}] desbloquea ${x.desbloquea}` +
    (x.apagada ? ' · apagada' : '') + (x.consumidores.length ? ` · espera consumidores ${x.consumidores.join(',')}` : '') +
    (x.espera.length ? ` · tras ${x.espera.join(',')}` : '') + ` · ${x.titulo.slice(0, 70)}`;
  const block = (title, list) => console.log(`\n${title} (${list.length})\n` + list.slice(0, top).map(line).join('\n'));
  console.log(`Progreso: ${r.hechas} de ${r.aplicables} · ${r.porcentaje} %`);
  block('1. Cerrables ahora (sin dependencias abiertas)', r.ahora);
  block('2. Siguiente ola (solo esperan a tareas del bloque 1)', r.despues);
  block('3. Cola de Luis, Hampton o terceros (lo que más desbloquea primero)', r.luis);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const r = ruta(JSON.parse(readFileSync(resolve(root, 'docs/roadmap/catalog.json'), 'utf8')));
  const top = Number(process.argv[process.argv.indexOf('--top') + 1]) || 15;
  if (process.argv.includes('--json')) console.log(JSON.stringify(r)); else print(r, top);
}
