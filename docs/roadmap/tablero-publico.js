(function(root){
 'use strict';
 const STATES={hecho:'Hecho',parcial:'Parcial',pendiente:'Pendiente',bloqueado:'Bloqueado',replanteado:'Replanteado',descartado:'Descartado'};
 const ACTIVITY={planning:'Planificando',planned:'Plan preparado',active:'En curso',paused:'Pausada',stale:'Sin contacto',submitted:'En revisión',review:'En revisión',built:'Construida · pendiente de publicar',published:'Publicada en main',completed:'Trabajo completado',unreserved:'Sin actividad registrada'};
 const MILESTONES={plan:'Plan preparado',implementation:'Implementación',tests:'Pruebas',review:'Revisión',release:'Publicación',verification:'Comprobación'};
 const NEXT_STEPS={review:'Revisar la entrega',build:'Construir el plan',validate:'Completar comprobaciones',publish:'Publicar con autorización',dependency:'Resolver dependencia',decision:'Decisión pendiente',access:'Acceso pendiente',resume:'Retomar el trabajo',done:'Tramo terminado'};
 function validReference(v){return typeof v==='string'&&v.length<=300&&(/^https:\/\/github\.com\/andresleosan\/HamptonJersey\/commit\/[a-f0-9]{40}$/.test(v)||/^docs\/(?:superpowers\/(?:plans|specs)|roadmap\/work\/[A-Z0-9]+-\d+)\/[A-Za-z0-9_/-]+\.md$/.test(v)&&!v.split('/').some(p=>p==='..'||p==='.'||!p));}
 function validateWork(r,task,mode){
  const keys=['task','packageId','mode','status','team','list','milestone','next','reference','sha','updatedAt','basedOn'];
  if(!r||Object.keys(r).some(k=>!keys.includes(k))||r.task!==task||r.mode!==mode||!/^PAQ-\d{2}$/.test(r.packageId)||!['plan','build'].includes(mode)||!(mode==='plan'?['planning','paused','planned']:['active','paused','review','built','published']).includes(r.status)
   ||! /^(Codex|Hermes 1|Hermes 2|Equipo) · [a-f0-9]{8}$/.test(r.team)||![1,2,3,4].includes(r.list)||!Object.hasOwn(MILESTONES,r.milestone)||!Object.hasOwn(NEXT_STEPS,r.next)||!Number.isFinite(Date.parse(r.updatedAt))||r.reference!==null&&!validReference(r.reference)||r.sha!==null&&!/^[a-f0-9]{40}$/.test(r.sha)||r.status==='published'&&!r.sha)throw Error('Actividad incompatible');
  if(r.basedOn!==undefined&&r.basedOn!==null){const b=r.basedOn;if(Object.keys(b).some(k=>!['sha','reference','next'].includes(k))||!/^[a-f0-9]{40}$/.test(b.sha)||!validReference(b.reference)||!Object.hasOwn(NEXT_STEPS,b.next))throw Error('Actividad incompatible');}
 }
 const AREAS=['Aplicantes, requisitos, matching y estados','Fuentes, agencias, integraciones y automatizaciones','Inbox, visitas, alquileres y ofertas','Propiedades, publicación, tours y analítica'];
 const EXCLUDED=new Set(['replanteado','descartado']);
 const PERCENT=new Intl.NumberFormat('es-ES',{minimumFractionDigits:2,maximumFractionDigits:2});
 function progress(tasks){
  const current=tasks.filter(t=>!EXCLUDED.has(t.state)),done=current.filter(t=>t.state==='hecho').length;
  return {done,total:current.length,partial:current.filter(t=>t.state==='parcial').length,blocked:current.filter(t=>t.state==='bloqueado').length,excluded:tasks.length-current.length,percent:current.length?done/current.length*100:0};
 }
 function validAdvice(r){return r&&['Hermes','VPS','VS Code'].includes(r.environment)&&['Baja','Media','Alta'].includes(r.difficulty)&&['reason','needs'].every(k=>typeof r[k]==='string'&&r[k].trim());}
 function validatePackages(m){
  if(!m||m.schemaVersion!==1||!Array.isArray(m.packages)||!m.packages.length||!Array.isArray(m.defaultOrder)||!m.recommendations||typeof m.recommendations!=='object')throw Error('Paquetes incompatibles');
  const ids=new Set(),codes=new Set();
  for(const p of m.packages){
   if(!p||!/^PAQ-\d{2}$/.test(p.id)||ids.has(p.id)||typeof p.title!=='string'||!p.title.trim()||typeof p.goal!=='string'||!validAdvice(p.recommendation)||!Array.isArray(p.stages)||!p.stages.length)throw Error('Paquete incompatible');ids.add(p.id);
   for(const stage of p.stages){if(!stage||typeof stage.title!=='string'||!Array.isArray(stage.tasks)||!stage.tasks.length)throw Error('Etapa incompatible');for(const code of stage.tasks){if(typeof code!=='string'||!/^[A-Z0-9]+-\d+$/.test(code)||codes.has(code))throw Error('Código de paquete incompatible');codes.add(code);}}
  }
  if(new Set(m.defaultOrder).size!==m.defaultOrder.length||m.defaultOrder.some(id=>!ids.has(id)))throw Error('Orden incompatible');
  for(const [code,advice] of Object.entries(m.recommendations))if(!codes.has(code)||!validAdvice(advice))throw Error('Recomendación incompatible');
  return m;
 }
 function taskAdvice(code,m){
  if(!m)return null;
  return m.recommendations[code]||m.packages.find(p=>p.stages.some(s=>s.tasks.includes(code)))?.recommendation||null;
 }
 function validateBoard(b){
  if(!b||b.schemaVersion!==1||!Number.isSafeInteger(b.revision)||b.revision<0||!Number.isFinite(Date.parse(b.updatedAt))||!Array.isArray(b.lists)||!Array.isArray(b.tasks))throw Error('Respuesta incompatible');
  if(b.lists.length!==4||new Set(b.lists.map(l=>l.number)).size!==4||b.lists.some(l=>![1,2,3,4].includes(l.number)||l.name!=='Lista '+l.number||!Number.isInteger(l.capacity)||l.capacity<1||l.capacity>2||!Number.isInteger(l.activeCount)||l.activeCount<0))throw Error('Listas incompatibles');
  const ids=new Set();for(const t of b.tasks){if(!t||typeof t.code!=='string'||! /^[A-Z0-9]+-\d+$/.test(t.code)||ids.has(t.code)||typeof t.title!=='string'||!t.title.trim()||![1,2,3,4].includes(t.list)||!Object.hasOwn(STATES,t.state)||!Object.hasOwn(ACTIVITY,t.activity))throw Error('Tarea incompatible');ids.add(t.code);
   if(t.details!==undefined){const d=t.details;if(!d||['done','pending','nextStep'].some(k=>typeof d[k]!=='string')||!Array.isArray(d.dependencies)||d.dependencies.some(code=>typeof code!=='string'||!/^[A-Z0-9]+-\d+$/.test(code)))throw Error('Detalle incompatible');}
   if(t.work!==undefined){if(!t.work||Object.keys(t.work).some(k=>!['build','plans','delivery'].includes(k))||!Array.isArray(t.work.plans)||t.work.plans.length>256)throw Error('Actividad incompatible');if(t.work.build!==null)validateWork(t.work.build,t.code,'build');for(const p of t.work.plans)validateWork(p,t.code,'plan');if(t.work.delivery){validateWork(t.work.delivery,t.code,'build');if(t.work.delivery.status!=='published')throw Error('Actividad incompatible');}}
  }
  return b;
 }
 function mount(doc,win){
  const $=id=>doc.getElementById(id),el=(tag,text,cls)=>{const n=doc.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
  const cards=new Map(),columns=new Map(),packageCards=new Map(),packageByTask=new Map();let board=null,packages=null,packageLoading=false,lastSuccess=null,inFlight=false,stopped=false,poll=null,failures=0;
  for(let number=1;number<=4;number++){const node=el('section',undefined,'column'),head=el('div',undefined,'column-head'),title=el('h2','Lista '+number),area=el('p',AREAS[number-1],'area muted'),count=el('p','','count'),presence=el('p','Consultando…','presence'),tasks=el('div',undefined,'tasks'),empty=el('p','No hay tareas con estos filtros.','empty'),bar=el('progress'),completion=el('p','','muted');bar.max=1;bar.value=0;bar.setAttribute('aria-label','Progreso de Lista '+number);head.append(title,area,bar,completion,count,presence);node.append(head,tasks,empty);$('columns').append(node);columns.set(number,{node,count,presence,tasks,empty,bar,completion});}
  function renderDetail(c,t){
   const advice=taskAdvice(t.code,packages),pkg=packageByTask.get(t.code);const signature=JSON.stringify([t.details,t.state,t.work,advice,pkg?.id]);if(c.detailSignature===signature)return;c.detailSignature=signature;
   const focusedJump=c.detail.contains(doc.activeElement)?doc.activeElement.dataset.jump:null;
   const focusedWork=c.detail.contains(doc.activeElement)?doc.activeElement.dataset.workKey:null;
   c.detail.replaceChildren();const block=(title,text)=>c.detail.append(el('h3',title),el('p',text));
   if(t.work){
    c.detail.append(el('h3','Trabajo registrado'));
    const records=[t.work.build,...t.work.plans,...(t.work.delivery&&t.work.build?.status!=='published'?[t.work.delivery]:[])].filter(Boolean);
    if(!records.length)c.detail.append(el('p','Sin actividad actual registrada. Las reservas antiguas no indican quién trabaja ahora.'));
    for(const work of records){
     c.detail.append(el('p',ACTIVITY[work.status]+' · '+work.team),el('p','Último avance: '+new Date(work.updatedAt).toLocaleString('es')+' · '+MILESTONES[work.milestone]+'\nSiguiente paso: '+NEXT_STEPS[work.next]));
     if(work.basedOn)c.detail.append(el('p','Continúa la entrega '+work.basedOn.sha.slice(0,7)+' · pendiente anterior: '+NEXT_STEPS[work.basedOn.next],'muted'));
     if(work.reference){
      if(work.status==='published'&&work.sha){const a=el('a','Ver entrega publicada');a.href=work.reference.startsWith('https:')?work.reference:'https://github.com/andresleosan/HamptonJersey/blob/'+work.sha+'/'+work.reference;a.dataset.workKey=work.mode+'-'+work.team;c.detail.append(a);}
      else c.detail.append(el('p','Referencia de entrega (publicación sin verificar): '+work.reference,'muted'));
     }
     if(work.mode==='plan')c.detail.append(el('p','Planificación únicamente. La construcción sigue pendiente y no está reservada por este plan.','muted'));
    }
   }
   const d=t.details;
   if(d){
    block('Siguiente paso',d.nextStep||'Sin siguiente paso documentado. Consulta esta tarea con /avanzar.');
    block('Qué está hecho',d.done||'No hay trabajo completado documentado en el checklist.');
    block('Qué falta',d.pending||'No hay trabajo pendiente documentado en el checklist.');
    c.detail.append(el('h3','Dependencias entre tareas'));
    if(!d.dependencies.length)c.detail.append(el('p','Sin dependencia documentada entre códigos. /avanzar comprueba las dependencias y quién está construyendo.'));
    for(const code of d.dependencies){const p=el('p'),link=el('a',code);link.href='#task-'+code;link.dataset.jump=code;p.append(link);c.detail.append(p);}
   }else c.detail.append(el('p','El detalle del checklist aparecerá en la próxima actualización automática.'));
   c.detail.append(el('h3','Dónde conviene hacerla'));
   if(advice){c.detail.append(el('p','Dificultad orientativa: '+advice.difficulty+' · Entorno recomendado: '+advice.environment),el('p',advice.reason),el('p',advice.needs));
    if(pkg)c.detail.append(el('p','Paquete: '+pkg.id+' · '+pkg.title));
    if(t.state==='hecho')c.detail.append(el('p','Esta tarea figura como hecha: comprobar y reutilizar la entrega, sin reconstruirla.'));
    if(EXCLUDED.has(t.state))c.detail.append(el('p','Fuera del alcance vigente. No se retoma automáticamente.'));
   }else c.detail.append(el('p','La recomendación aparecerá cuando se cargue la agrupación.'));
   block('Trabajar esta tarea','/avanzar '+t.code);
   c.detail.append(el('p','El detalle corresponde al checklist. /avanzar registra planificación o construcción y comprueba las dependencias técnicas.'));
   if(focusedJump)c.detail.querySelector('a[data-jump="'+focusedJump+'"]')?.focus({preventScroll:true});
   if(focusedWork)Array.from(c.detail.querySelectorAll('[data-work-key]')).find(n=>n.dataset.workKey===focusedWork)?.focus({preventScroll:true});
  }
  function freshness(){
   const stale=failures>0||lastSuccess===null||Date.now()-lastSuccess>=45000;
   $('connection').dataset.state=stale?'stale':'live';
   $('connection').textContent=failures>0?'No se pudo actualizar. Reintentaremos automáticamente; se conserva el último dato válido.':lastSuccess===null?'Esperando la primera actualización.':stale?'Sin contacto. Se conserva la última actualización.':'En vivo · solo consulta · actualización automática.';
   $('updated').textContent=board?'Última respuesta válida: '+new Date(lastSuccess).toLocaleTimeString('es')+' · revisión '+board.revision:'';
  }
  function describe(p){return p.total?p.done+' de '+p.total+' tareas hechas · '+PERCENT.format(p.percent)+'%':'Sin tareas de alcance vigente';}
  function updateBar(bar,p){bar.max=p.total||1;bar.value=p.done;bar.setAttribute('aria-valuetext',describe(p));}
  function matches(t){
   const q=$('search').value.trim().toLocaleLowerCase(),list=$('list').value,activity=$('activity').value,state=$('state').value,environment=$('environment').value;
   const pkg=packageByTask.get(t.code),text=[t.code,t.title,pkg?.id,pkg?.title].join(' ').toLocaleLowerCase();
   return (!q||text.includes(q))&&(!list||Number(list)===t.list)&&(!activity||activity===t.activity)&&(!state||state===t.state)&&(!environment||taskAdvice(t.code,packages)?.environment===environment);
  }
  function renderPackages(){
   if(!packages||!board)return;
   const byCode=new Map(board.tasks.map(t=>[t.code,t]));let shown=0;
   for(const p of packages.packages){
    let c=packageCards.get(p.id);
    if(!c){const node=el('details',undefined,'package'),summary=el('summary'),heading=el('span',p.id+' · '+p.title,'package-title'),bar=el('progress'),label=el('span','','package-count'),work=el('span','','muted package-work'),body=el('div',undefined,'package-detail'),stageNodes=new Map();
     node.id='package-'+p.id;bar.setAttribute('aria-label','Progreso de '+p.title);summary.append(heading,label,bar,work);body.append(el('p',p.goal),el('p','Avanzar por etapas: cada una conserva sus dependencias y comprobaciones.'));
     for(const [index,stage] of p.stages.entries()){const section=el('section',undefined,'stage'),h=el('h3',(index+1)+'. '+stage.title),links=el('ul',undefined,'stage-tasks');
      for(const code of stage.tasks){const item=el('li'),link=el('a',code),state=el('span','','muted');link.href='#task-'+code;link.dataset.jump=code;item.append(link,state);links.append(item);stageNodes.set(code,{item,state});}
      section.append(h,links);body.append(section);
     }
     body.append(el('p','Continuar este paquete:', 'muted'),el('code','/avanzar '+p.id),el('p','La elección del entorno es orientativa. Hermes programa con GPT Sol en Codex; al perder acceso a GPT usa DeepSeek v4 max en OpenCode.','muted'));
     node.append(summary,body);$('packages').append(node);c={node,bar,label,work,stageNodes};packageCards.set(p.id,c);
    }
    const tasks=p.stages.flatMap(s=>s.tasks).map(code=>byCode.get(code)).filter(Boolean),stats=progress(tasks);
    updateBar(c.bar,stats);c.label.textContent=describe(stats);
    c.work.textContent=stats.partial+' parciales · '+stats.blocked+' bloqueadas'+(stats.excluded?' · '+stats.excluded+' fuera de alcance':'');
    c.node.hidden=!tasks.some(matches);if(!c.node.hidden)shown++;
    for(const [code,row] of c.stageNodes){const t=byCode.get(code),work=t?.work?.build||t?.work?.plans.at(-1);row.state.textContent=t?STATES[t.state]+(work?' · '+ACTIVITY[t.activity]+' · '+work.team:''):'Sin dato en este catálogo';row.item.dataset.state=t?.state||'unknown';}
   }
   $('packages-empty').hidden=shown>0;$('packages-empty').textContent='Ningún paquete coincide. Prueba otro filtro o pulsa Mostrar todas.';
   const missing=board.tasks.filter(t=>!packageByTask.has(t.code));$('package-coverage').textContent=missing.length?missing.length+' tareas todavía sin agrupar. Consulta la vista Por listas para verlas.':'';
  }
  function render(){
   if(!board)return;
   let visible=0;const ids=new Set(board.tasks.map(t=>t.code));for(const [id,c] of cards)if(!ids.has(id)){c.node.remove();cards.delete(id);}
   for(const l of board.lists){const col=columns.get(l.number);col.node.hidden=Boolean($('list').value&&Number($('list').value)!==l.number);const tasks=board.tasks.filter(t=>t.list===l.number);let shown=0;
    const stats=progress(tasks);updateBar(col.bar,stats);col.completion.textContent=describe(stats);
    for(const [index,t] of tasks.entries()){let c=cards.get(t.code);if(!c){const node=el('details',undefined,'task'),summary=el('summary'),code=el('span',t.code,'code'),state=el('span','','state'),title=el('span','','title'),status=el('span','','activity'),detail=el('div',undefined,'detail');summary.append(code,state,title,status);node.id='task-'+t.code;node.append(summary,detail);c={node,state,title,status,detail,detailSignature:null};cards.set(t.code,c);}
     const work=t.work?.build||t.work?.plans.at(-1);c.title.textContent=t.title;c.state.textContent=STATES[t.state];c.status.textContent=ACTIVITY[t.activity]+(work?' · '+work.team:'');c.node.dataset.activity=t.activity;c.node.dataset.state=t.state;
     renderDetail(c,t);if(col.tasks.children[index]!==c.node)col.tasks.insertBefore(c.node,col.tasks.children[index]||null);
     c.node.hidden=!matches(t);if(!c.node.hidden)shown++;
    }
    col.count.textContent=shown+' visibles de '+tasks.length;col.presence.textContent=l.activeCount+' construcciones registradas';col.empty.hidden=shown>0;visible+=shown;
   }
   const p=progress(board.tasks);updateBar($('overall-progress'),p);$('progress-label').textContent=describe(p);
   $('progress-breakdown').textContent=p.partial+' parciales · '+p.blocked+' bloqueadas · '+(p.total-p.done-p.partial-p.blocked)+' pendientes · '+p.excluded+' replanteadas o descartadas';
   $('totals').textContent=board.tasks.length+' tareas registradas'+(packages?' en '+packages.packages.length+' paquetes':'')+'. Los filtros solo cambian lo que ves.';
   $('result').textContent=visible+' de '+board.tasks.length+' tareas visibles.';
   const grouped=$('view').value==='packages';$('package-view').hidden=!grouped;$('list-view').hidden=grouped;
   renderPackages();
  }
  async function loadPackages(){
   if(stopped||packages||packageLoading)return;packageLoading=true;
   const controller=new AbortController(),timeout=win.setTimeout(()=>controller.abort(),10000);
   try{const response=await win.fetch('/paquetes.json',{method:'GET',credentials:'omit',redirect:'error',cache:'no-store',signal:controller.signal});if(!response.ok)throw Error('No disponible');const next=validatePackages(await response.json());if(stopped)return;
    packages=next;for(const p of packages.packages)for(const s of p.stages)for(const code of s.tasks)packageByTask.set(code,p);
    $('package-status').textContent='';render();
   }catch{if(!stopped){$('package-status').textContent='No se pudo cargar la agrupación. Puedes consultar las listas; Actualizar ahora vuelve a intentarlo.';$('view').value='lists';render();}}
   finally{packageLoading=false;win.clearTimeout(timeout);}
  }
  function applyBoard(value){const next=validateBoard(value);if(board&&(next.revision<board.revision||(next.revision===board.revision&&Date.parse(next.updatedAt)<Date.parse(board.updatedAt))))throw Error('Respuesta anterior');board=next;lastSuccess=Date.now();failures=0;render();freshness();}
  function schedule(){win.clearTimeout(poll);if(!stopped&&!doc.hidden)poll=win.setTimeout(refresh,Math.min(60000,15000*2**Math.min(failures,2)));}
  async function refresh(){if(stopped||doc.hidden||inFlight)return;loadPackages();inFlight=true;win.clearTimeout(poll);const controller=new AbortController(),timeout=win.setTimeout(()=>controller.abort(),10000);
   try{const r=await win.fetch('/v1/board',{method:'GET',credentials:'omit',redirect:'error',cache:'no-store',headers:{Accept:'application/json'},signal:controller.signal});if(!r.ok)throw Error('No disponible');applyBoard(await r.json());}
   catch{failures++;freshness();}
   finally{inFlight=false;win.clearTimeout(timeout);schedule();}
  }
  for(const id of ['search','list','activity','state','environment','view'])$(id).addEventListener(id==='search'?'input':'change',render);
  function clearFilters(){for(const id of ['search','list','activity','state','environment'])$(id).value='';}
  doc.addEventListener('click',event=>{const link=event.target.closest?.('a[data-jump]'),target=link&&cards.get(link.dataset.jump);if(!target)return;event.preventDefault();clearFilters();$('view').value='lists';render();target.node.open=true;target.node.scrollIntoView?.({block:'start'});target.node.querySelector('summary').focus({preventScroll:true});});
  $('reset').addEventListener('click',()=>{clearFilters();render();});$('refresh').addEventListener('click',refresh);
  doc.addEventListener('visibilitychange',()=>{win.clearTimeout(poll);freshness();if(!doc.hidden)refresh();});win.addEventListener('focus',()=>{if(!doc.hidden)refresh();});
  const age=win.setInterval(freshness,5000);refresh();
  return {applyBoard,refresh,getBoard:()=>board,stop(){stopped=true;win.clearTimeout(poll);win.clearInterval(age);}};
 }
 const api={validateBoard,validatePackages,progress,taskAdvice,mount};if(typeof module!=='undefined'&&module.exports)module.exports=api;
 if(root&&root.document)root.HamptonPublicBoard={...api,...mount(root.document,root)};
})(typeof window==='undefined'?null:window);
