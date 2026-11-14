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
