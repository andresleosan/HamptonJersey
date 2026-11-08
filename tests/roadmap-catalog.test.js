const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
let api, shared;
test.before(async () => {
  api = await import('../scripts/roadmap-catalog.mjs');
  shared = await import('../coordination/catalog.mjs');
});
const root = path.resolve(__dirname, '..');
test('all checklist points retain every field and exactly one owner, with deterministic generated output', () => {
  const allocation = JSON.parse(fs.readFileSync(path.join(root, 'docs/roadmap/reparto-equipo.json')));
  const catalog = api.catalogFromAllocation(allocation);
  assert.deepEqual(shared.validateCatalog(catalog), []);
  assert.equal(catalog.tasks.length, 250);
  assert.equal(catalog.units.length, 250);
  for (const item of allocation.items) {
    const task = catalog.tasks.find(t => t.id === item.id);
    assert.deepEqual(task, item);
    assert.ok(catalog.units.some(u => u.parentTaskId === task.id));
  }
  assert.deepEqual(catalog, api.catalogFromAllocation(allocation));
  assert.deepEqual(catalog.slots.map(s => catalog.tasks.filter(t => t.assignedSlot === s.id).length), [59,61,65,65]);
});
test('rejects missing allocation, duplicate IDs, dangling dependencies, cycles and uncovered tasks', () => {
  const make = () => api.catalogFromAllocation(JSON.parse(fs.readFileSync(path.join(root, 'docs/roadmap/reparto-equipo.json'))));
  let c = make(); delete c.tasks[0].assignedSlot;
  assert.ok(shared.validateCatalog(c).some(e => e.includes('assignedSlot')));
  c = make(); c.tasks.push(c.tasks[0]); assert.ok(shared.validateCatalog(c).some(e => e.includes('Duplicate')));
  c = make(); c.units[0].dependencies = [{unitId:'MISSING',requiredEvidence:'integrated'}];
  assert.ok(shared.validateCatalog(c).some(e => e.includes('Unknown dependency')));
  c = make(); c.units[0].dependencies = [{unitId:c.units[1].id,requiredEvidence:'design'}]; c.units[1].dependencies = [{unitId:c.units[0].id,requiredEvidence:'design'}];
  assert.ok(shared.validateCatalog(c).some(e => e.includes('cycle')));
  c = make(); c.units.splice(0, 1); assert.ok(shared.validateCatalog(c).some(e => e.includes('No unit')));
});
test('historical and externally controlled work never becomes runnable by assignment', () => {
  const c = api.catalogFromAllocation(JSON.parse(fs.readFileSync(path.join(root, 'docs/roadmap/reparto-equipo.json'))));
  for (const task of c.tasks) {
    const unit = c.units.find(u => u.parentTaskId === task.id);
    if (['hecho','descartado','replanteado'].includes(task.estado)) assert.equal(unit.enabled, false);
    if (task.responsable !== 'desarrollo') assert.equal(unit.reviewRequired, true);
  }
  assert.equal(c.units.find(u => u.id === 'BUS-21').kind, 'research');
  assert.deepEqual(c.units.find(u => u.id === 'BUS-22').dependencies, [{unitId:'BUS-21',requiredEvidence:'research_accepted'}]);
  assert.equal(c.units.find(u => u.id === 'BUS-14').reviewRequired, true);
});
test('resource boundaries reject ambiguous paths and compare directories and read/write modes', () => {
  const resource = (key,mode='write') => shared.normalizeResource({key,mode});
  for (const key of ['path:../secret','path:/root/.env','path:server//file','path:server/./file','path:server\\file','path:*.js','path:server/%2e%2e/x','']) {
    assert.throws(() => resource(key), undefined, key);
  }
  assert.equal(shared.resourcesConflict(resource('path:server/'),resource('path:server/matching.js')),true);
  assert.equal(shared.resourcesConflict(resource('path:server/'),resource('path:server-other/a')),false);
  assert.equal(shared.resourcesConflict(resource('notifications-schema','read'),resource('notifications-schema','write')),true);
  assert.equal(shared.resourcesConflict(resource('notifications-schema','read'),resource('notifications-schema','read')),false);
});
test('extract/generate is lossless and never replaces shared editorial text or executable script', () => {
  const html = '<h1>Editorial</h1><script>const retained = true;</script><script type="application/json" id="datos">{"actualizado":"today","items":[]}</script><footer>Keep</footer>';
  const data = {actualizado:'today',items:[{id:'X-01',titulo:'</script><img src=x onerror=1>'}]};
  const changed = api.renderChecklist(html,data);
  assert.deepEqual(api.extractChecklist(changed),data);
  assert.ok(changed.includes('<h1>Editorial</h1><script>const retained = true;</script>'));
  assert.ok(changed.endsWith('<footer>Keep</footer>'));
  assert.ok(!changed.includes('<img src=x'));
  assert.equal(api.renderChecklist(changed,data),changed);
});
test('task file updates are authoritative and an unassigned new task fails validation', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(),'team-catalog-'));
  try {
    const allocation = JSON.parse(fs.readFileSync(path.join(root,'docs/roadmap/reparto-equipo.json')));
    api.writeTaskSources(dir,allocation);
    const f = path.join(dir,'docs/roadmap/tasks/BUS-21.json');
    const task = JSON.parse(fs.readFileSync(f)); task.falta = 'Updated by this task owner'; fs.writeFileSync(f,JSON.stringify(task));
    assert.equal(api.loadCatalog(dir).tasks.find(t=>t.id==='BUS-21').falta,task.falta);
    fs.writeFileSync(path.join(dir,'docs/roadmap/tasks/NEW-01.json'),JSON.stringify({id:'NEW-01',titulo:'New'}));
    assert.throws(()=>api.loadCatalog(dir),/assignedSlot|No unit/);
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
});
test('generated tasks and board share one catalogue and stale output is rejected', async () => {
  const {renderRoadmap}=await import('../scripts/render-roadmap.mjs');
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'team-render-'));
  try{
    const allocation=JSON.parse(fs.readFileSync(path.join(root,'docs/roadmap/reparto-equipo.json')));
    api.writeTaskSources(dir,allocation);
    for(const name of ['reparto-equipo.json','reparto-equipo.html','checklist-hampton-app.html'])fs.copyFileSync(path.join(root,'docs/roadmap',name),path.join(dir,'docs/roadmap',name));
    renderRoadmap(dir);renderRoadmap(dir,{check:true});
    const taskFile=path.join(dir,'docs/roadmap/tasks/BUS-21.json');const task=JSON.parse(fs.readFileSync(taskFile));task.titulo='Changed research title';fs.writeFileSync(taskFile,JSON.stringify(task));
    assert.throws(()=>renderRoadmap(dir,{check:true}),/stale/);
    renderRoadmap(dir);
    const html=fs.readFileSync(path.join(dir,'docs/roadmap/checklist-hampton-app.html'),'utf8');
    assert.equal(api.extractChecklist(html).items.find(t=>t.id==='BUS-21').titulo,task.titulo);
    for(const original of allocation.items){
      const generated=api.extractChecklist(html).items.find(t=>t.id===original.id);
      for(const field of ['criterio_aceptacion','deps','modulo'])if(Object.hasOwn(original,field))assert.deepEqual(generated[field],original[field]);
    }
    assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'docs/roadmap/reparto-equipo.json'))).items.find(t=>t.id==='BUS-21').titulo,task.titulo);
    renderRoadmap(dir,{check:true});
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('slot capacities preserve explicit Hermes two and default omitted legacy capacity to one',()=>{
  const allocation=JSON.parse(fs.readFileSync(path.join(root,'docs/roadmap/reparto-equipo.json')));
  for(const slot of allocation.slots)delete slot.capacity;
  let catalog=api.catalogFromAllocation(allocation);
  assert.equal(shared.slotCapacity(catalog,'hermes'),1);
  allocation.slots.find(slot=>slot.id==='hermes').capacity=2;
  catalog=api.catalogFromAllocation(allocation);
  assert.equal(catalog.slots.find(slot=>slot.id==='hermes').capacity,2);
  assert.equal(shared.slotCapacity(catalog,'hermes'),2);
  assert.equal(shared.slotCapacity(catalog,'vps'),1);
  assert.deepEqual(shared.validateCatalog(catalog),[]);
});

test('catalogue rejects noninteger and out-of-range slot capacities',()=>{
  for(const capacity of [0,3,-1,1.5,'2',null,true]){
    const allocation=JSON.parse(fs.readFileSync(path.join(root,'docs/roadmap/reparto-equipo.json')));
    allocation.slots.find(slot=>slot.id==='hermes').capacity=capacity;
    assert.throws(()=>api.catalogFromAllocation(allocation),/capacity/i);
  }
});
