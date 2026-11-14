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
  // Aplazada a una fase posterior por el plan maestro: ni se construye ni bloquea a nadie.
  const later = t => t?.executionEligibility === 'deferred_later_phase';
  const isOpen = id => OPEN.has(byId.get(id)?.estado) && !later(byId.get(id));
  const openDeps = t => (t.dependencies || []).filter(d => isOpen(d.id));
  const pending = t => openDeps(t).map(d => d.id);
  // Plan maestro (TP-05): una dependencia es un componente que el consumidor necesita, no la tarea padre entera.
  // Solo bloquea la `whole` cuyo productor no ha empezado, o que exige activación, decisión o investigación aceptada.
  // ponytail: «parcial» se toma como «el componente probablemente está en main»; quien toma la tarea lo comprueba.
  const hard = d => (d.scope ?? 'whole') === 'whole'
    && !(byId.get(d.id).estado === 'parcial' && ['integrated', 'design'].includes(d.requires));

  // Cuántas tareas abiertas esperan, directa o indirectamente, a cada una.
  const waiters = new Map(open.map(t => [t.id, []]));
  for (const t of open) for (const id of pending(t)) waiters.get(id).push(t.id);
  const unlocks = id => {
    const seen = new Set(), stack = [...waiters.get(id)];
    while (stack.length) { const x = stack.pop(); if (!seen.has(x)) { seen.add(x); stack.push(...waiters.get(x)); } }
    return seen.size;
  };

  const row = t => {
    const text = `${t.falta || ''} ${t.nextStep || ''}`, deps = openDeps(t).filter(hard).map(d => d.id);
    const comprobar = openDeps(t).filter(d => !hard(d)).map(d => d.id);
    const own = new Set([t.id, ...(t.dependencies || []).map(d => d.id)]);
    // Menciona tareas abiertas que no son dependencias suyas: suele esperar a consumidores (cierre por aceptación propia).
    const consumidores = [...new Set(text.match(CODE) || [])].filter(id => !own.has(id) && isOpen(id));
    return {id: t.id, estado: t.estado, responsable: t.responsable, titulo: t.titulo, desbloquea: unlocks(t.id),
      espera: deps, comprobar, apagada: APAGADA.test(text), consumidores, externo: t.externalBlocker || t.bloqueo || ''};
  };
  const rank = (a, b) => b.desbloquea - a.desbloquea || (a.estado === 'parcial' ? 0 : 1) - (b.estado === 'parcial' ? 0 : 1) || a.id.localeCompare(b.id);

  const rows = open.filter(t => !later(t)).map(row);
  const dev = rows.filter(r => DEV.has(r.responsable));
  const ahora = dev.filter(r => !r.espera.length).sort(rank);
  const ready = new Set(ahora.map(r => r.id));
  const despues = dev.filter(r => r.espera.length && r.espera.every(id => ready.has(id))).sort(rank);
  const placed = new Set([...ready, ...despues.map(r => r.id)]);
  const masAdelante = dev.filter(r => !placed.has(r.id)).sort(rank);
  const luis = rows.filter(r => !DEV.has(r.responsable)).sort(rank);
  const aplazadas = open.filter(later).map(t => ({id: t.id, estado: t.estado, titulo: t.titulo}));
  const aplicables = catalog.tasks.filter(t => !OUT.has(t.estado)).length;
  const hechas = catalog.tasks.filter(t => t.estado === 'hecho').length;
  return {hechas, aplicables, porcentaje: +(100 * hechas / aplicables).toFixed(2), ahora, despues, masAdelante, luis, aplazadas};
}

function print(r, top) {
  const line = x => `  ${x.id} [${x.estado}] desbloquea ${x.desbloquea}` +
    (x.apagada ? ' · apagada' : '') + (x.consumidores.length ? ` · espera consumidores ${x.consumidores.join(',')}` : '') +
    (x.espera.length ? ` · tras ${x.espera.join(',')}` : '') +
    (x.comprobar.length ? ` · comprobar componentes ${x.comprobar.join(',')}` : '') + ` · ${x.titulo.slice(0, 70)}`;
  const block = (title, list) => console.log(`\n${title} (${list.length})\n` + list.slice(0, top).map(line).join('\n'));
  console.log(`Progreso: ${r.hechas} de ${r.aplicables} · ${r.porcentaje} %`);
  block('1. Construibles ahora (ninguna dependencia las bloquea)', r.ahora);
  block('2. Siguiente ola (solo esperan a tareas del bloque 1)', r.despues);
  block('3. Cola de Luis, Hampton o terceros (lo que más desbloquea primero)', r.luis);
  block('4. Más adelante (esperan a otras tareas o a la cola)', r.masAdelante);
  console.log(`\n5. Aplazadas por el plan maestro, no se construyen (${r.aplazadas.length})\n  ${r.aplazadas.map(x => x.id).join(' ')}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const r = ruta(JSON.parse(readFileSync(resolve(root, 'docs/roadmap/catalog.json'), 'utf8')));
  const top = Number(process.argv[process.argv.indexOf('--top') + 1]) || 15;
  if (process.argv.includes('--json')) console.log(JSON.stringify(r)); else print(r, top);
}
