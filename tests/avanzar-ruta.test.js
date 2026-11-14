const test = require('node:test');
const assert = require('node:assert/strict');

const task = (id, estado, deps = [], extra = {}) => ({id, estado, responsable: 'desarrollo', titulo: id, falta: '', nextStep: '',
  dependencies: deps.map(d => ({id: d})), ...extra});

test('ruta ranks closable work by what it unblocks and separates the owner queue', async () => {
  const {ruta} = await import('../scripts/avanzar-ruta.mjs');
  const r = ruta({tasks: [
    task('AAA-01', 'hecho'),
    task('AAA-02', 'parcial', ['AAA-01'], {falta: 'Aplicar la migración 0044; BBB-02 debe consumirla.'}),
    task('AAA-03', 'pendiente', ['AAA-01']),
    task('BBB-01', 'pendiente', ['AAA-02']),
    task('BBB-02', 'pendiente', ['BBB-01']),
    task('CCC-01', 'bloqueado', [], {responsable: 'Luis'}),
    task('CCC-02', 'parcial', ['CCC-01']),
    task('DDD-01', 'descartado'),
  ]});
  assert.deepEqual([r.hechas, r.aplicables, r.porcentaje], [1, 7, 14.29]);
  assert.deepEqual(r.ahora.map(x => x.id), ['AAA-02', 'AAA-03']);
  assert.deepEqual([r.ahora[0].desbloquea, r.ahora[0].apagada, r.ahora[0].consumidores], [2, true, ['BBB-02']]);
  assert.deepEqual(r.despues.map(x => x.id), ['BBB-01']);
  assert.deepEqual(r.luis.map(x => [x.id, x.desbloquea]), [['CCC-01', 1]]);
});

// Plan maestro (TP-05): a dependency is a component the consumer needs, not the whole parent task.
test('ruta follows the master plan: components do not block, later-phase tasks are set aside, nothing is hidden', async () => {
  const {ruta} = await import('../scripts/avanzar-ruta.mjs');
  const dep = (id, requires, scope) => ({id, requires, scope});
  const t = (id, estado, dependencies = [], extra = {}) => ({...task(id, estado), dependencies, ...extra});
  const r = ruta({tasks: [
    t('LUI-01', 'parcial', [], {responsable: 'Luis'}),
    t('PRO-01', 'parcial'),                                            // producer with code in main
    t('PRO-02', 'pendiente'),                                          // producer not started
    t('CON-01', 'parcial', [dep('LUI-01', 'activated', 'partial')]),   // only one part waits for Luis
    t('CON-02', 'pendiente', [dep('PRO-01', 'integrated', 'whole')]),  // component probably in main: check it
    t('CON-03', 'pendiente', [dep('PRO-02', 'integrated', 'whole')]),  // nothing to consume yet
    t('CON-04', 'pendiente', [dep('LUI-01', 'activated', 'whole')]),   // needs the real service
    t('CON-05', 'pendiente', [dep('PRO-01', 'integrated', 'component:store')]),
    t('CON-06', 'pendiente', [dep('CON-04', 'integrated', 'whole')]),
    t('LAT-01', 'pendiente', [], {executionEligibility: 'deferred_later_phase'}),
    t('CON-07', 'parcial', [dep('LAT-01', 'activated', 'whole')]),     // a deferred task never blocks
  ]});
  assert.deepEqual(r.ahora.map(x => x.id).sort(), ['CON-01', 'CON-02', 'CON-05', 'CON-07', 'PRO-01', 'PRO-02']);
  assert.deepEqual(r.ahora.find(x => x.id === 'CON-01').comprobar, ['LUI-01']);
  assert.deepEqual(r.ahora.find(x => x.id === 'CON-02').comprobar, ['PRO-01']);
  assert.deepEqual(r.ahora.find(x => x.id === 'CON-07').comprobar, []);
  assert.deepEqual(r.despues.map(x => [x.id, x.espera]), [['CON-03', ['PRO-02']]]);
  assert.deepEqual(r.masAdelante.map(x => [x.id, x.espera]), [['CON-04', ['LUI-01']], ['CON-06', ['CON-04']]]);
  assert.deepEqual(r.luis.map(x => x.id), ['LUI-01']);
  assert.deepEqual(r.aplazadas.map(x => x.id), ['LAT-01']);
  assert.equal(r.ahora.length + r.despues.length + r.masAdelante.length + r.luis.length + r.aplazadas.length, 11);
});
