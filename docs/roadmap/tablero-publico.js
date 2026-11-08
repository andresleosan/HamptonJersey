(function(root){
 'use strict';
 const STATES={hecho:'Hecho',parcial:'Parcial',pendiente:'Pendiente',bloqueado:'Bloqueado',replanteado:'Replanteado',descartado:'Descartado'};
 const ACTIVITY={planning:'Planificando',active:'En curso',paused:'Pausada',stale:'Sin contacto',submitted:'En revisión',completed:'Trabajo completado',unreserved:'Sin reserva'};
 function validateBoard(b){
  if(!b||b.schemaVersion!==1||!Number.isSafeInteger(b.revision)||b.revision<0||!Number.isFinite(Date.parse(b.updatedAt))||!Array.isArray(b.lists)||!Array.isArray(b.tasks))throw Error('Respuesta incompatible');
  if(b.lists.length!==4||new Set(b.lists.map(l=>l.number)).size!==4||b.lists.some(l=>![1,2,3,4].includes(l.number)||l.name!=='Lista '+l.number||!Number.isInteger(l.capacity)||l.capacity<1||l.capacity>2||!Number.isInteger(l.activeCount)||l.activeCount<0))throw Error('Listas incompatibles');
  const ids=new Set();for(const t of b.tasks){if(!t||typeof t.code!=='string'||! /^[A-Z0-9]+-\d+$/.test(t.code)||ids.has(t.code)||typeof t.title!=='string'||!t.title.trim()||![1,2,3,4].includes(t.list)||!Object.hasOwn(STATES,t.state)||!Object.hasOwn(ACTIVITY,t.activity))throw Error('Tarea incompatible');ids.add(t.code);}
  return b;
 }
 function mount(doc,win){
  const $=id=>doc.getElementById(id),el=(tag,text,cls)=>{const n=doc.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
  const cards=new Map(),columns=new Map();let board=null,lastSuccess=null,inFlight=false,stopped=false,poll=null,failures=0;
  for(let number=1;number<=4;number++){const node=el('section',undefined,'column'),head=el('div',undefined,'column-head'),title=el('h2','Lista '+number),count=el('p','','count'),presence=el('p','Consultando…','presence'),tasks=el('div',undefined,'tasks'),empty=el('p','No hay tareas con estos filtros.','empty');head.append(title,count,presence);node.append(head,tasks,empty);$('columns').append(node);columns.set(number,{node,count,presence,tasks,empty});}
  function freshness(){
   const stale=failures>0||lastSuccess===null||Date.now()-lastSuccess>=45000;
   $('connection').dataset.state=stale?'stale':'live';
   $('connection').textContent=failures>0?'No se pudo actualizar. Reintentaremos automáticamente; se conserva el último dato válido.':lastSuccess===null?'Esperando la primera actualización.':stale?'Sin contacto. Se conserva la última actualización.':'En vivo · solo consulta · actualización automática.';
   $('updated').textContent=board?'Última respuesta válida: '+new Date(lastSuccess).toLocaleTimeString('es')+' · revisión '+board.revision:'';
  }
  function render(){
   if(!board)return;
   const q=$('search').value.trim().toLocaleLowerCase(),list=$('list').value,activity=$('activity').value;let visible=0;
   const ids=new Set(board.tasks.map(t=>t.code));for(const [id,c] of cards)if(!ids.has(id)){c.node.remove();cards.delete(id);}
   for(const l of board.lists){const col=columns.get(l.number);col.node.hidden=Boolean(list&&Number(list)!==l.number);const tasks=board.tasks.filter(t=>t.list===l.number);let shown=0;
    for(const [index,t] of tasks.entries()){let c=cards.get(t.code);if(!c){const node=el('details',undefined,'task'),summary=el('summary'),code=el('span',t.code,'code'),state=el('span','','state'),title=el('span','','title'),status=el('span','','activity'),detail=el('div',undefined,'detail');summary.append(code,state,title,status);detail.append(el('p','Gestiona esta tarea desde /avanzar. Esta página muestra su progreso y no reserva trabajo.'));node.id='task-'+t.code;node.append(summary,detail);c={node,state,title,status};cards.set(t.code,c);}
     c.title.textContent=t.title;c.state.textContent=STATES[t.state];c.status.textContent=ACTIVITY[t.activity];c.node.dataset.activity=t.activity;
     if(col.tasks.children[index]!==c.node)col.tasks.insertBefore(c.node,col.tasks.children[index]||null);
     const match=(!q||(t.code+' '+t.title).toLocaleLowerCase().includes(q))&&(!activity||activity===t.activity);c.node.hidden=!match;if(match)shown++;
    }
    col.count.textContent=shown+' visibles de '+tasks.length;col.presence.textContent=l.activeCount+' de '+l.capacity+' reservas';col.empty.hidden=shown>0;if(!col.node.hidden)visible+=shown;
   }
   $('totals').textContent=board.tasks.length+' tareas · '+board.lists.map(l=>l.name+': '+board.tasks.filter(t=>t.list===l.number).length).join(' · ');
   $('result').textContent=visible+' de '+board.tasks.length+' tareas visibles.';
  }
  function applyBoard(value){const next=validateBoard(value);if(board&&(next.revision<board.revision||(next.revision===board.revision&&Date.parse(next.updatedAt)<Date.parse(board.updatedAt))))throw Error('Respuesta anterior');board=next;lastSuccess=Date.now();failures=0;render();freshness();}
  function schedule(){win.clearTimeout(poll);if(!stopped&&!doc.hidden)poll=win.setTimeout(refresh,Math.min(60000,15000*2**Math.min(failures,2)));}
  async function refresh(){if(stopped||doc.hidden||inFlight)return;inFlight=true;win.clearTimeout(poll);const controller=new AbortController(),timeout=win.setTimeout(()=>controller.abort(),10000);
   try{const r=await win.fetch('/v1/board',{method:'GET',credentials:'omit',redirect:'error',cache:'no-store',headers:{Accept:'application/json'},signal:controller.signal});if(!r.ok)throw Error('No disponible');applyBoard(await r.json());}
   catch{failures++;freshness();}
   finally{inFlight=false;win.clearTimeout(timeout);schedule();}
  }
  for(const id of ['search','list','activity'])$(id).addEventListener(id==='search'?'input':'change',render);
  $('reset').addEventListener('click',()=>{$('search').value='';$('list').value='';$('activity').value='';render();});$('refresh').addEventListener('click',refresh);
  doc.addEventListener('visibilitychange',()=>{win.clearTimeout(poll);freshness();if(!doc.hidden)refresh();});win.addEventListener('focus',()=>{if(!doc.hidden)refresh();});
  const age=win.setInterval(freshness,5000);refresh();
  return {applyBoard,refresh,getBoard:()=>board,stop(){stopped=true;win.clearTimeout(poll);win.clearInterval(age);}};
 }
 const api={validateBoard,mount};if(typeof module!=='undefined'&&module.exports)module.exports=api;
 if(root&&root.document)root.HamptonPublicBoard={...api,...mount(root.document,root)};
})(typeof window==='undefined'?null:window);
