export const SLOT_IDS = ['vps', 'hermes', 'vscode', 'codex-desktop'];
export const EVIDENCE_KINDS = ['design','integrated','research_accepted','activated','decision'];
const ID = /^[A-Z][A-Z0-9]*-\d{2,}(?:\/[a-z0-9-]+)?$/;

export function normalizeResource(resource) {
  if (!resource || !['read','write'].includes(resource.mode) || typeof resource.key !== 'string') throw new Error('Invalid resource');
  const {key,mode} = resource;
  if (key.length > 300 || !key.length) throw new Error('Invalid resource key');
  if (key.startsWith('path:')) {
    const path = key.slice(5);
    if (!path || path.startsWith('/') || /[\\%*?\[\]\x00-\x20:]/.test(path) || path.includes('//') || path.split('/').some(p=>p==='.'||p==='..')) throw new Error('Invalid resource path');
  } else if (!/^[a-z0-9][a-z0-9:._-]*$/.test(key)) throw new Error('Invalid logical resource');
  return {key,mode};
}

export function resourcesConflict(left, right) {
  const a = normalizeResource(left), b = normalizeResource(right);
  if (a.mode === 'read' && b.mode === 'read') return false;
  if (a.key === b.key) return true;
  if (!a.key.startsWith('path:') || !b.key.startsWith('path:')) return false;
  return (a.key.endsWith('/') && b.key.startsWith(a.key)) || (b.key.endsWith('/') && a.key.startsWith(b.key));
}

export function validateCatalog(catalog) {
  const errors = [];
  if (!catalog || catalog.schemaVersion !== 1 || catalog.project !== 'hampton') return ['Invalid catalogue version/project'];
  if (!Array.isArray(catalog.tasks) || !Array.isArray(catalog.units) || !Array.isArray(catalog.slots)) return ['Missing catalogue arrays'];
  if (catalog.tasks.length > 2000 || catalog.units.length > 5000) return ['Catalogue too large'];
  const slots = catalog.slots.map(s=>s?.id);
  if (slots.length !== SLOT_IDS.length || new Set(slots).size !== SLOT_IDS.length || SLOT_IDS.some(id=>!slots.includes(id))) errors.push('Invalid slots');
  const tasks = new Map(), units = new Map(), covered = new Set();
  for (const task of catalog.tasks) {
    if (!task || !ID.test(task.id) || task.id.includes('/')) { errors.push('Invalid task ID'); continue; }
    if (tasks.has(task.id)) errors.push(`Duplicate task ${task.id}`);
    tasks.set(task.id,task);
    if (!SLOT_IDS.includes(task.assignedSlot)) errors.push(`Invalid assignedSlot for ${task.id}`);
    if (typeof task.titulo !== 'string' || !task.titulo.trim()) errors.push(`Missing task title ${task.id}`);
    if (!['hecho','parcial','pendiente','bloqueado','replanteado','descartado'].includes(task.estado)) errors.push(`Invalid state ${task.id}`);
  }
  for (const unit of catalog.units) {
    if (!unit || !ID.test(unit.id)) {errors.push('Invalid unit ID'); continue;}
    if (units.has(unit.id)) errors.push(`Duplicate unit ${unit.id}`);
    units.set(unit.id,unit);
    const task = tasks.get(unit.parentTaskId);
    if (!task) errors.push(`Unknown parent for ${unit.id}`); else covered.add(task.id);
    if (!SLOT_IDS.includes(unit.preferredSlot) || unit.preferredSlot !== task?.assignedSlot) errors.push(`Invalid preferredSlot ${unit.id}`);
    if (!Number.isSafeInteger(unit.priority) || unit.priority < 0) errors.push(`Invalid priority ${unit.id}`);
    if (!['development','research','decision'].includes(unit.kind)) errors.push(`Invalid kind ${unit.id}`);
    if (typeof unit.enabled !== 'boolean' || typeof unit.reviewRequired !== 'boolean') errors.push(`Missing execution policy ${unit.id}`);
    if (['hecho','descartado','replanteado'].includes(task?.estado) && unit.enabled) errors.push(`Historical unit enabled ${unit.id}`);
    if (!Array.isArray(unit.acceptance) || !unit.acceptance.length || unit.acceptance.some(x=>typeof x !== 'string'||!x.trim())) errors.push(`Missing acceptance ${unit.id}`);
    if (!Array.isArray(unit.resources) || (unit.enabled && !unit.resources.length)) errors.push(`Missing resources ${unit.id}`);
    else {
      const keys = new Set();
      for (const r of unit.resources) {
        try { normalizeResource(r); if (keys.has(r.key)) errors.push(`Duplicate resource ${unit.id}`); keys.add(r.key); }
        catch { errors.push(`Invalid resource ${unit.id}`); }
      }
    }
    if (!Array.isArray(unit.dependencies)) errors.push(`Missing dependencies ${unit.id}`);
  }
  for (const id of tasks.keys()) if (!covered.has(id)) errors.push(`No unit for ${id}`);
  for (const unit of units.values()) for (const dep of unit.dependencies || []) {
    if (!dep || !units.has(dep.unitId)) errors.push(`Unknown dependency ${unit.id}`);
    if (!EVIDENCE_KINDS.includes(dep?.requiredEvidence)) errors.push(`Invalid dependency evidence ${unit.id}`);
  }
  const visiting = new Set(), done = new Set();
  function visit(id) {
    if (visiting.has(id)) { errors.push(`Dependency cycle at ${id}`); return; }
    if (done.has(id)) return;
    visiting.add(id);
    for (const dep of units.get(id)?.dependencies || []) if (units.has(dep?.unitId)) visit(dep.unitId);
    visiting.delete(id); done.add(id);
  }
  for (const id of units.keys()) visit(id);
  return [...new Set(errors)];
}
