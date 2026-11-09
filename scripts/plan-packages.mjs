import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{validatePackages,taskAdvice,progress}=require('../docs/roadmap/tablero-publico.js');
// This is a local planning view. It never loads team sessions or contacts the coordinator.
try {
 const manifest=validatePackages(JSON.parse(readFileSync(new URL('../docs/roadmap/paquetes.json',import.meta.url),'utf8')));
 const catalog=JSON.parse(readFileSync(new URL('../docs/roadmap/catalog.json',import.meta.url),'utf8'));
 const all=manifest.packages.flatMap(p=>p.stages.flatMap(s=>s.tasks)),ids=catalog.tasks.map(t=>t.id);
 if(all.length!==ids.length||ids.some(code=>!all.includes(code)))throw Error('Package coverage differs from the current catalog. Reconcile the manifest before selecting work.');
 const args=process.argv.slice(2),options={};
 for(let i=0;i<args.length;i++){
  if(args[i]==='--check'){options.check=true;continue;}
  if(!['--package','--task','--list'].includes(args[i])||!args[i+1]||args[i+1].startsWith('--'))throw Error('Use --check, --package PAQ-01, --task CODE or --list 1..4.');
  const key=args[i].slice(2);if(options[key])throw Error('Repeated option.');options[key]=args[++i];
 }
 if(options.list&&!/^[1-4]$/.test(options.list))throw Error('List must be 1..4.');
 if(options.package&&!manifest.packages.some(p=>p.id===options.package))throw Error('Unknown package.');
 if(options.task&&!ids.includes(options.task))throw Error('Unknown task.');
 const slots=catalog.slots.map(s=>s.id),byCode=new Map(catalog.tasks.map(t=>[t.id,t]));
 const selected=manifest.packages.filter(p=>(!options.package||p.id===options.package)&&(!options.task||p.stages.some(s=>s.tasks.includes(options.task)))&&(!options.list||p.stages.some(s=>s.tasks.some(code=>byCode.get(code).assignedSlot===slots[Number(options.list)-1]))));
 if(!selected.length)throw Error('Task, package and list do not match.');
 const result=options.check?{packages:manifest.packages.length,tasks:all.length,coverage:'exact'}:{
  reserved:false,buildAuthorized:false,scope:options.task?'explicit_task':'package_stages',engines:manifest.engines,defaultOrder:manifest.defaultOrder,
  packages:selected.map(p=>({...p,progress:progress(p.stages.flatMap(s=>s.tasks).map(code=>({state:byCode.get(code).estado}))),stages:p.stages.map(s=>({...s,tasks:s.tasks.map(code=>{const t=byCode.get(code);return {code,title:t.titulo,state:t.estado,list:slots.indexOf(t.assignedSlot)+1,dependencies:t.dependencies,recommendation:taskAdvice(code,manifest)};})}))}))
 };
 console.log(JSON.stringify(result,null,2));
} catch(error){console.error(error.message);process.exitCode=1;}
