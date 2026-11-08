import {readFileSync,writeFileSync,mkdirSync,copyFileSync,existsSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {loadCatalog,extractChecklist,renderChecklist,buildCatalog} from './roadmap-catalog.mjs';

const sourceRoot = fileURLToPath(new URL('..',import.meta.url));
const allocationFields = new Set(['allocationStatus','assignedSlot','assignmentRole','executionEligibility','dependencies','externalBlocker','resources','nextStep']);
export function renderRoadmap(root,{check=false,assets=false}={}) {
  const catalog = buildCatalog(root,{check});
  const dir = join(root,'docs/roadmap');
  const checklistPath = join(dir,'checklist-hampton-app.html');
  const previous = readFileSync(checklistPath,'utf8');
  const data = extractChecklist(previous);
  data.items = catalog.tasks.map(task=>Object.fromEntries(Object.entries(task).filter(([key])=>!allocationFields.has(key))));
  const checklist = renderChecklist(previous,data);
  const slotStats = catalog.slots.map(slot=>{
    const tasks = catalog.tasks.filter(t=>t.assignedSlot===slot.id);
    return {...slot,count:tasks.length,openCount:tasks.filter(t=>['parcial','pendiente','bloqueado'].includes(t.estado)).length,
      states:tasks.reduce((counts,t)=>(counts[t.estado]=(counts[t.estado]||0)+1,counts),{})};
  });
  const allocationPath=join(dir,'reparto-equipo.json');
  const previousAllocation = JSON.parse(readFileSync(allocationPath,'utf8'));
  const allocation = {...previousAllocation,slots:slotStats,items:catalog.tasks};
  allocation.source.itemCount=catalog.tasks.length;
  const boardPath=join(dir,'reparto-equipo.html'),previousBoard=readFileSync(boardPath,'utf8');
  const encoded=JSON.stringify(allocation).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
  const regex=/(<script\s+type="application\/json"\s+id="allocation">)[\s\S]*?(<\/script>)/;
  if(!regex.test(previousBoard))throw new Error('Missing board allocation block');
  const board=previousBoard.replace(regex,(_,start,end)=>start+encoded+end);
  for(const [file,content] of [[checklistPath,checklist],[allocationPath,JSON.stringify(allocation,null,2)+'\n'],[boardPath,board]]){
    if(check){if(readFileSync(file,'utf8')!==content)throw new Error('Generated roadmap stale: '+file);}
    else if(readFileSync(file,'utf8')!==content)writeFileSync(file,content);
  }
  if(assets){
    const output=join(root,'coordination/public');mkdirSync(output,{recursive:true});
    // Explicit public allowlist: never copy a repository tree or private handoff.
    const files=['reparto-equipo.html','reparto-equipo.json','checklist-hampton-app.html','equipo.js','equipo.css'];
    for(const name of files){if(!existsSync(join(dir,name)))throw new Error('Missing board asset: '+name);copyFileSync(join(dir,name),join(output,name));}
    copyFileSync(join(dir,'reparto-equipo.html'),join(output,'index.html'));
  }
  return {tasks:catalog.tasks.length,units:catalog.units.length,assets};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  try{console.log(JSON.stringify(renderRoadmap(sourceRoot,{check:process.argv.includes('--check'),assets:process.argv.includes('--assets')})));}
  catch(error){console.error(error.message);process.exitCode=1;}
}
