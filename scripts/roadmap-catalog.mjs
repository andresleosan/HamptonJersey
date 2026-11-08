import {readFileSync,writeFileSync,mkdirSync,readdirSync,existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {validateCatalog} from '../coordination/catalog.mjs';

const HISTORICAL = new Set(['hecho','replanteado','descartado']);
const DATA = /(<script\s+type="application\/json"\s+id="datos">)([\s\S]*?)(<\/script>)/;
const json = value => JSON.stringify(value,null,2)+'\n';
export function extractChecklist(html) {
  const match = DATA.exec(html);
  if (!match) throw new Error('Missing checklist datos');
  return JSON.parse(match[2]);
}
export function renderChecklist(html, data) {
  if (!DATA.test(html)) throw new Error('Missing checklist datos');
  const encoded = (JSON.stringify(data,null,1)+'\n').replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
  return html.replace(DATA,(_,start,body,end)=>start+'\n'+encoded+end);
}
export function catalogFromAllocation(allocation) {
  if (!Array.isArray(allocation?.items) || !Array.isArray(allocation.slots)) throw new Error('Invalid allocation');
  const tasks = structuredClone(allocation.items);
  const units = tasks.map((task,index) => {
    const research = /^BUS-2[123]$/.test(task.id);
    const dependencies = (task.dependencies || []).filter(d=>d.scope==='whole'&&d.basis==='explicit').map(d=>({unitId:d.id,requiredEvidence:d.requires}));
    const resources = [...new Set(task.resources || [])].map(key=>({key,mode:'write'}));
    resources.push({key:`path:docs/roadmap/tasks/${task.id}.json`,mode:'write'},{key:`path:docs/roadmap/work/${task.id}/`,mode:'write'});
    return {id:task.id,parentTaskId:task.id,title:task.titulo,preferredSlot:task.assignedSlot,
      priority:task.id==='BUS-14'?10:research?20+Number(task.id.slice(-2)):task.id==='NOT-11'?30:100+index,
      kind:research?'research':task.id.startsWith('PRE-')||task.responsable!=='desarrollo'?'decision':'development',
      enabled:!HISTORICAL.has(task.estado),reviewRequired:!research,
      dependencies,resources,acceptance:[task.nextStep || task.falta || 'Conservar la evidencia histórica.']};
  });
  const result = {schemaVersion:1,project:'hampton',slots:allocation.slots.map(({id,name,area})=>({id,name,area})),tasks,units};
  const errors = validateCatalog(result);
  if (errors.length) throw new Error(errors.join('; '));
  return result;
}
export function writeTaskSources(root, allocation) {
  const c = catalogFromAllocation(allocation), folder = join(root,'docs/roadmap');
  mkdirSync(join(folder,'tasks'),{recursive:true});
  for (const task of c.tasks) {
    const file = join(folder,'tasks',task.id+'.json');
    if (existsSync(file)) throw new Error(`Task source already exists: ${task.id}`);
    writeFileSync(file,json(task));
  }
  writeFileSync(join(folder,'work-units.json'),json({schemaVersion:1,project:'hampton',slots:c.slots,units:c.units}));
}
export function loadCatalog(root) {
  const folder = join(root,'docs/roadmap');
  const definitions = JSON.parse(readFileSync(join(folder,'work-units.json'),'utf8'));
  const tasks = readdirSync(join(folder,'tasks')).filter(name=>name.endsWith('.json')).sort().map(name=>{
    const value = JSON.parse(readFileSync(join(folder,'tasks',name),'utf8'));
    if (name !== value.id+'.json') throw new Error(`Task filename mismatch: ${name}`);
    return value;
  });
  // Keep stable editorial order from the units instead of filesystem order.
  const order = new Map(definitions.units.map((u,i)=>[u.parentTaskId,i]));
  tasks.sort((a,b)=>(order.get(a.id)??Infinity)-(order.get(b.id)??Infinity)||a.id.localeCompare(b.id));
  const catalog = {...definitions,tasks};
  const errors = validateCatalog(catalog);
  if (errors.length) throw new Error(errors.join('; '));
  return catalog;
}
export function buildCatalog(root,{check=false}={}) {
  const catalog = loadCatalog(root), path = join(root,'docs/roadmap/catalog.json'), encoded = json(catalog);
  if (check) {
    if (!existsSync(path)||readFileSync(path,'utf8')!==encoded) throw new Error('catalog.json is stale; run npm run team:catalog');
  } else writeFileSync(path,encoded);
  return catalog;
}
if (process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const root = fileURLToPath(new URL('..',import.meta.url));
    if (process.argv.includes('--init')) writeTaskSources(root,JSON.parse(readFileSync(join(root,'docs/roadmap/reparto-equipo.json'),'utf8')));
    const catalog = buildCatalog(root,{check:process.argv.includes('--check')});
    console.log(JSON.stringify({tasks:catalog.tasks.length,units:catalog.units.length,slots:catalog.slots.map(s=>({id:s.id,count:catalog.tasks.filter(t=>t.assignedSlot===s.id).length}))}));
  } catch (error) { console.error(error.message); process.exitCode=1; }
}
