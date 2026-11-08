/* Equipo: same-origin, read-only projection of the coordinator. No credentials or browser storage. */
(function (root) {
 'use strict';
 const OPEN = new Set(['parcial','pendiente','bloqueado']);
 const LABELS = {hecho:'Hecho',parcial:'Parcial',pendiente:'Pendiente',bloqueado:'Bloqueado',replanteado:'Replanteado',descartado:'Descartado'};
 const REQUIRED = {design:'Contrato/diseño',integrated:'Código integrado',research_accepted:'Investigación aceptada',activated:'Activación comprobada',decision:'Decisión'};
 const listName = (board,id) => board.slots.find(s=>s.id===id)?.name || 'Lista sin identificar';
 const claimOrigin = (board,claim) => board.tasks.find(t=>t.id===board.units.find(u=>u.id===claim.unitId)?.parentTaskId)?.assignedSlot;
 const actorName = id => ({'hermes-1':'Hermes 1','hermes-2':'Hermes 2'}[id] || id || 'Responsable');
 const timestamp = value => typeof value==='number'?value:Date.parse(value);
 const current = c => !['completed','complete','abandoned','released'].includes(c.status);
 const isStale = (last,now) => last === null || now-last >= 45000;
 const retryDelay = failures => Math.min(60000,15000 * 2 ** Math.min(failures,2));
 function validateBoard(b) {
  if (!b || b.protocolVersion !== 1 || !Number.isSafeInteger(b.revision) || b.revision < 0 || !Number.isFinite(Date.parse(b.serverTime)) || (b.catalogSha !== null && typeof b.catalogSha !== 'string')) throw Error('Respuesta incompatible');
  for(const key of ['slots','tasks','units','claims','evidence','blockers']) if(!Array.isArray(b[key])) throw Error('Catálogo incompleto');
  const slots=new Set(b.slots.map(s=>s.id));
  if(b.slots.some(s=>!s||typeof s.name!=='string'||typeof s.area!=='string'||(s.capacity!==undefined&&(!Number.isInteger(s.capacity)||s.capacity<1||s.capacity>2))))throw Error('Puesto incompatible');
  if(b.slots.length!==4 || slots.size!==4 || !['vps','hermes','vscode','codex-desktop'].every(s=>slots.has(s))) throw Error('Puestos incompatibles');
  const validResource=r=>r&&typeof r.key==='string'&&['read','write'].includes(r.mode);
  const ids=new Set();
  for(const t of b.tasks) { if(!t || typeof t.id!=='string' || !/^[A-Z0-9]+-\d+$/.test(t.id) || ids.has(t.id) || !slots.has(t.assignedSlot) || (typeof t.titulo!=='string'||!t.titulo.trim()) || !Object.hasOwn(LABELS,t.estado) || (t.dependencies!==undefined&&!Array.isArray(t.dependencies)) || (t.resources!==undefined&&!Array.isArray(t.resources))) throw Error('Tarea incompatible'); if((t.dependencies||[]).some(d=>!d||typeof d.id!=='string'||!Object.hasOwn(REQUIRED,d.requires)))throw Error('Referencia de tarea incompatible');if((t.resources||[]).some(r=>typeof r!=='string'&&!validResource(r)))throw Error('Recurso de tarea incompatible');ids.add(t.id); }
  const unitIds=new Set();
  for(const u of b.units) { if(!u || typeof u.id!=='string' || unitIds.has(u.id) || !ids.has(u.parentTaskId)) throw Error('Unidad incompatible');unitIds.add(u.id); if(typeof u.enabled!=='boolean'||typeof u.reviewRequired!=='boolean'||!Array.isArray(u.dependencies)||!Array.isArray(u.resources)||u.resources.some(r=>!validResource(r)))throw Error('Política de unidad incompatible'); }
  for(const t of b.tasks)if(!b.units.some(u=>u.parentTaskId===t.id))throw Error('Tarea sin unidad');
  for(const u of b.units)for(const d of u.dependencies)if(!unitIds.has(d.unitId)||!Object.hasOwn(REQUIRED,d.requiredEvidence))throw Error('Dependencia incompatible');
  for(const c of b.claims)if(!c||(current(c)&&!unitIds.has(c.unitId))||!slots.has(c.slot)||typeof c.status!=='string'||!Array.isArray(c.resources)||!Number.isFinite(timestamp(c.expiresAt))||c.resources.some(r=>!validResource(r)))throw Error('Reserva incompatible');
  for(const e of b.evidence)if(!e||typeof e.unitId!=='string'||!Object.hasOwn(REQUIRED,e.kind))throw Error('Evidencia incompatible');
  if(b.blockers.some(x=>!x||!unitIds.has(x.unitId)||(x.reasons!==undefined&&!Array.isArray(x.reasons))||(x.dependencies!==undefined&&!Array.isArray(x.dependencies))||(x.conflicts!==undefined&&!Array.isArray(x.conflicts))))throw Error('Bloqueo incompatible');
  return b;
 }
 function resourceConflict(a,b) {
  if(!a || !b || (a.mode==='read' && b.mode==='read'))return false;
  if(a.key===b.key)return true;
  if(typeof a.key!=='string'||typeof b.key!=='string'||!a.key.startsWith('path:')||!b.key.startsWith('path:'))return false;
  return (a.key.endsWith('/')&&b.key.startsWith(a.key))||(b.key.endsWith('/')&&a.key.startsWith(b.key));
 }
 function taskActivity(t,b,now=Date.parse(b.serverTime)) {
  const units=b.units.filter(u=>u.parentTaskId===t.id),unitIds=new Set(units.map(u=>u.id));
  const claims=b.claims.filter(c=>current(c)&&unitIds.has(c.unitId));
  if(claims.length) {
   const c=claims[0]; let key=c.status==='paused'?'paused':c.status==='stale'||timestamp(c.expiresAt)<=now?'stale':c.status==='submitted'?'submitted':'active';
   return {key,label:{paused:'Pausada · conserva reserva',stale:'Sin contacto · conserva reserva',submitted:'Entrega en revisión',active:c.mode==='plan'?'Revisando alcance':'En curso'}[key],claims,reasons:[]};
  }
  if(!units.length)return {key:'review',label:'Alcance por revisar',claims:[],reasons:[]};
  // Closed planning does not finish a unit. Only a completed build for the current contract does.
  const completed=new Set(b.claims.filter(c=>c.status==='completed'&&c.mode==='build'&&c.completionCurrent!==false).map(c=>c.unitId));
  const enabled=units.filter(u=>u.enabled===true&&!completed.has(u.id));
  if(!enabled.length)return units.some(u=>u.enabled===true&&completed.has(u.id))?{key:'completed',label:'Trabajo habilitado completado',claims:[],reasons:[]}:{key:'historical',label:'Sin unidad habilitada',claims:[],reasons:[]};
  const reasons=[];let ready=false,review=false;
  for(const u of enabled) {
   if(u.reviewRequired!==false&&!b.evidence.some(e=>e.unitId===u.id&&e.kind==='design'&&e.evidenceCurrent!==false)){review=true;continue;}
   const pending=(u.dependencies||[]).filter(d=>!b.evidence.some(e=>e.unitId===d.unitId && e.kind===d.requiredEvidence&&e.evidenceCurrent!==false));
   const occupied=b.claims.filter(c=>current(c)&&!unitIds.has(c.unitId)&&(u.resources||[]).some(r=>(c.resources||[]).some(s=>resourceConflict(r,s))));
   const blocks=b.blockers.filter(x=>(x.unitId===u.id||x.taskId===t.id)&&(x.message||x.reason||x.code||(x.reasons||[]).length||(x.dependencies||[]).length||(x.conflicts||[]).length));
   if(!pending.length&&!occupied.length&&!blocks.length)ready=true;
   reasons.push(...pending.map(d=>'Falta '+(REQUIRED[d.requiredEvidence]||d.requiredEvidence)+' de '+d.unitId),...occupied.map(c=>'Conflicto de recursos con '+c.unitId+' · '+listName(b,c.slot)),...blocks.flatMap(x=>[...(x.reasons||[]).map(r=>({disabled:'Unidad deshabilitada',review_required:'Alcance por revisar'}[r]||r)),...(x.dependencies||[]).map(d=>'Falta '+(REQUIRED[d.requiredEvidence]||d.requiredEvidence)+' de '+d.unitId),...(x.conflicts||[]).map(c=>'Recurso reservado por '+c.unitId+' · '+listName(b,c.slot)),...(x.message||x.reason||x.code?[x.message||x.reason||x.code]:[])]));
  }
  return {key:ready?'ready':review?'review':'blocked',label:ready?'Lista para reservar':review?'Alcance por revisar':'Bloqueada',claims:[],reasons};
 }
 function mount(doc,win) {
  const $=id=>doc.getElementById(id),el=(tag,text,cls)=>{const n=doc.createElement(tag);if(text!==undefined)n.textContent=String(text);if(cls)n.className=cls;return n;};
  const allocation=JSON.parse($('allocation').textContent);
  let board={protocolVersion:1,revision:0,serverTime:new Date().toISOString(),catalogSha:'instantánea',slots:allocation.slots,tasks:allocation.items,units:[],claims:[],evidence:[],blockers:[],release:null};
  let lastSuccess=null,lastError='',failures=0,pollTimer=null,ageTimer=null,inFlight=false,stopped=false,unresolved=false;
  const cards=new Map(),columns=new Map();
  const online=win.location.protocol==='https:' || (win.location.protocol==='http:' && ['localhost','127.0.0.1','[::1]'].includes(win.location.hostname));
  function block(parent,title,text){parent.append(el('h3',title),el('p',text||'Sin información adicional en el checklist.'));}
  function clock(){return Date.parse(board.serverTime)+(lastSuccess===null?0:Date.now()-lastSuccess);}
  function updateCard(t) {
   let c=cards.get(t.id);
   if(!c){const node=el('details',undefined,'task');node.id='task-'+t.id;node.dataset.taskId=t.id;const summary=el('summary');summary.dataset.focusKey=t.id+':summary';c={node,summary,code:el('span',t.id,'code'),state:el('span','','state'),title:el('span','','title'),activity:el('span','','activity'),body:el('div',undefined,'detail')};summary.append(c.code,c.state,c.title,c.activity);node.append(summary,c.body);cards.set(t.id,c);}
   c.title.textContent=t.titulo;c.state.textContent=LABELS[t.estado]||t.estado||'Sin estado';const a=taskActivity(t,board,clock()),stale=lastSuccess!==null&&isStale(lastSuccess,Date.now());c.activity.textContent=lastSuccess===null?'Instantánea · sin disponibilidad verificada':stale?(a.key==='ready'?'Disponibilidad sin confirmar · última consulta: lista para reservar':'Último dato sin confirmar · '+a.label):a.label;c.node.dataset.activity=lastSuccess===null?'snapshot':a.key;c.node.dataset.freshness=lastSuccess===null?'snapshot':stale?'stale':'confirmed';
   const signature=JSON.stringify([t,a,stale,a.claims.map(claim=>listName(board,claim.slot))]);if(c.signature===signature)return c;c.signature=signature;
   c.body.replaceChildren();block(c.body,'Siguiente paso',t.nextStep);
   if(a.claims.length){for(const claim of a.claims)block(c.body,stale?'Reserva en última consulta':'Reserva actual',actorName(claim.actorId)+' · desde '+listName(board,claim.slot)+' · sesión '+(claim.sessionId||'sin identificador')+' · '+(claim.mode==='plan'?'revisión':'construcción')+' · vence '+(claim.expiresAt?new Date(timestamp(claim.expiresAt)).toLocaleString('es'):'sin fecha'));}else block(c.body,stale?'Reserva en última consulta':'Reserva actual',lastSuccess===null?'No se consultó el coordinador.':stale?'Sin reserva en la última consulta. La disponibilidad actual no está confirmada.':'Sin reserva actual. La disponibilidad depende de las unidades y su evidencia.');
   if(a.reasons.length)block(c.body,'Bloqueos y conflictos',a.reasons.join('\n'));
   block(c.body,'Responsable del checklist',t.responsable==='—'?'Historial':t.responsable);
   if(t.externalBlocker)block(c.body,'Dependencia externa',t.externalBlocker);
   c.body.append(el('h3','Dependencias entre tareas'));
   if(!(t.dependencies||[]).length)c.body.append(el('p','Sin dependencia documentada entre códigos; no acredita disponibilidad.'));
   for(const d of t.dependencies||[]){const p=el('p');const link=el('a',d.id);link.href='#task-'+encodeURIComponent(d.id);link.dataset.jump=d.id;link.dataset.focusKey=t.id+':dep:'+d.id;p.append(link,doc.createTextNode(' · '+(REQUIRED[d.requires]||d.requires||'Evidencia')+' · '+(d.scope==='partial'?'Solo un tramo':'Todo el alcance')+(d.basis==='inferred'?' · Por confirmar':'')));c.body.append(p,el('p',d.reason||''));}
   for(const u of board.units.filter(u=>u.parentTaskId===t.id)){block(c.body,'Unidad '+u.id,u.title);for(const d of u.dependencies||[])block(c.body,'Evidencia requerida',d.unitId+' · '+(REQUIRED[d.requiredEvidence]||d.requiredEvidence));}
   block(c.body,'Recursos',(t.resources||[]).map(r=>typeof r==='string'?r:r.key+' ('+r.mode+')').join(', '));block(c.body,'Qué está hecho',t.hecho);block(c.body,'Qué falta',t.falta);if(t.bloqueo)block(c.body,'Bloqueo registrado',t.bloqueo);
   const link=el('a','Ver '+t.id+' en el checklist');link.href='checklist-hampton-app.html#'+encodeURIComponent(t.id);link.dataset.focusKey=t.id+':checklist';c.body.append(link);block(c.body,'Consultar desde tu puesto','/avanzar '+t.id);return c;
  }
  function render() {
   const active=doc.activeElement,key=active&&active.dataset.focusKey,x=win.scrollX,y=win.scrollY;
   const q=$('search').value.toLocaleLowerCase().trim(),state=$('state').value,slot=$('slot').value,execution=$('activity').value;
   const known=new Set(board.tasks.map(t=>t.id));for(const [id,c] of cards)if(!known.has(id)){c.node.remove();cards.delete(id);}
   const slotSignature=JSON.stringify(board.slots.map(s=>[s.id,s.name]));if($('slot').dataset.signature!==slotSignature){$('slot').replaceChildren(el('option','Las cuatro listas'));$('slot').firstChild.value='';for(const s of board.slots){const o=el('option',s.name);o.value=s.id;$('slot').append(o);}$('slot').value=slot;$('slot').dataset.signature=slotSignature;}
   let visible=0;
   for(const s of board.slots){let col=columns.get(s.id);if(!col){col={node:el('section',undefined,'column'),head:el('div',undefined,'column-head'),name:el('h2'),area:el('p','','muted'),count:el('p','','count'),presence:el('p','','presence'),list:el('div',undefined,'tasks'),empty:el('p','No hay tareas con estos filtros. Usa «Mostrar todas» para recuperar el reparto.','empty')};col.head.append(col.name,col.area,col.count,col.presence);col.node.append(col.head,col.list,col.empty);$('columns').append(col.node);columns.set(s.id,col);}
    col.name.textContent=s.name;col.area.textContent=s.area||'';col.node.setAttribute('aria-label',s.name);col.node.hidden=Boolean(slot&&slot!==s.id);
    const assigned=board.tasks.filter(t=>t.assignedSlot===s.id);let shown=0;
    for(const [index,t] of assigned.entries()){const c=updateCard(t);if(col.list.children[index]!==c.node)col.list.insertBefore(c.node,col.list.children[index]||null);const match=(!state||t.estado===state)&&(!unresolved||OPEN.has(t.estado))&&(!execution||c.node.dataset.activity===execution)&&(!q||(t.id+' '+t.titulo+' '+(t.nextStep||'')).toLocaleLowerCase().includes(q));c.node.hidden=!match;if(match)shown++;}
    col.empty.hidden=shown>0;col.count.textContent=shown+' visibles de '+assigned.length+' · '+assigned.filter(t=>OPEN.has(t.estado)).length+' por resolver';
    const held=board.claims.filter(c=>c.slot===s.id&&current(c));col.presence.textContent=lastSuccess===null?'Ocupación sin verificar':held.length?held.map(c=>actorName(c.actorId)+' · '+c.unitId+' · '+(c.status==='paused'?'pausada':c.status==='stale'||timestamp(c.expiresAt)<=clock()?'sin contacto':c.mode==='plan'?'revisando':'en curso')+(claimOrigin(board,c)&&claimOrigin(board,c)!==s.id?' · ayudando en '+listName(board,claimOrigin(board,c)):'')).join(' / '):'Puesto sin reserva';if(lastSuccess!==null&&(s.capacity||1)>1)col.presence.textContent=held.length+' de '+s.capacity+' reservas · '+col.presence.textContent;if(lastSuccess!==null&&isStale(lastSuccess,Date.now()))col.presence.textContent='Último dato sin confirmar · '+col.presence.textContent;if(!col.node.hidden)visible+=shown;
   }
   $('totals').textContent=board.tasks.length+' puntos · '+board.slots.map(s=>s.name+': '+board.tasks.filter(t=>t.assignedSlot===s.id).length).join(' · ');
   $('reset').textContent='Mostrar todas ('+board.tasks.length+')';$('result').textContent=visible+' de '+board.tasks.length+' puntos visibles. Cada código tiene una asignación.';$('open-only').setAttribute('aria-pressed',String(unresolved));
   $('release').textContent=board.release?'Turno de publicación: '+(board.release.slot?listName(board,board.release.slot):(board.release.actorId||board.release.status||'reservado'))+' · '+({held:'reservado',uncertain:'resultado pendiente de reconciliar',synchronization_pending:'publicado, sincronización pendiente'}[board.release.status]||board.release.status||'ocupado'):(lastSuccess===null?'Turno de publicación sin consultar.':'Sin turno de publicación registrado.');
   if(key&&(!active.isConnected||doc.activeElement!==active)){const next=Array.from(doc.querySelectorAll('[data-focus-key]')).find(n=>n.dataset.focusKey===key);if(next)next.focus({preventScroll:true});}win.scrollTo(x,y);
  }
  function freshness(){
   const stale=online&&isStale(lastSuccess,Date.now());$('connection').dataset.state=!online?'offline':stale?'stale':'live';
   const status=!online?'Instantánea sin conexión. No acredita reservas ni disponibilidad.':lastSuccess===null?'Esperando una respuesta válida del coordinador.':stale?'Sin contacto con el coordinador. Se conserva la última respuesta válida.':'Conectado al coordinador · solo consulta.';
   $('connection').textContent=status+(lastError?' '+lastError:'');$('updated').textContent=lastSuccess===null?'Sin actualización en vivo.':'Última respuesta válida: '+new Date(lastSuccess).toLocaleTimeString('es')+' · revisión '+board.revision+' · catálogo '+(board.catalogSha||'sin catálogo').slice(0,12)+(doc.hidden?' · consultas pausadas mientras esta pestaña está oculta.':'');
  }
  function applyBoard(value){const b=validateBoard(value);if(lastSuccess!==null&&(b.revision<board.revision||(b.revision===board.revision&&Date.parse(b.serverTime)<Date.parse(board.serverTime))))throw Error('Revisión anterior');board=b;lastSuccess=Date.now();lastError='';failures=0;render();freshness();return true;}
  function schedule(){win.clearTimeout(pollTimer);if(!stopped&&!doc.hidden&&online)pollTimer=win.setTimeout(refresh,retryDelay(failures));}
  async function refresh(){if(stopped||!online||doc.hidden||inFlight)return;win.clearTimeout(pollTimer);inFlight=true;const controller=new AbortController(),timeout=win.setTimeout(()=>controller.abort(),10000);
   try{const response=await win.fetch('/v1/board',{method:'GET',credentials:'same-origin',redirect:'error',cache:'no-store',headers:{Accept:'application/json'},signal:controller.signal});if(!response.ok){const err=Error('request');err.status=response.status;throw err;}applyBoard(await response.json());}
   catch(e){failures++;lastError=e.status===401||e.status===403?'Permiso insuficiente. Accede con una identidad de consulta autorizada.':'No se pudo actualizar. Reintentaremos automáticamente.';freshness();}
   finally{inFlight=false;win.clearTimeout(timeout);schedule();}
  }
  function reset(){unresolved=false;$('search').value='';$('state').value='';$('slot').value='';$('activity').value='';}
  function jump(id){if(!cards.has(id))return;reset();const c=cards.get(id);c.node.open=true;render();c.node.scrollIntoView({block:'center'});c.summary.focus({preventScroll:true});}
  for(const id of ['search','state','slot','activity'])$(id).addEventListener(id==='search'?'input':'change',render);
  $('open-only').addEventListener('click',()=>{unresolved=!unresolved;render();});$('reset').addEventListener('click',()=>{reset();render();});$('refresh').addEventListener('click',refresh);
  doc.addEventListener('click',e=>{const a=e.target.closest('a[data-jump]');if(a){e.preventDefault();win.history.replaceState(null,'','#task-'+encodeURIComponent(a.dataset.jump));jump(a.dataset.jump);}});
  doc.addEventListener('visibilitychange',()=>{win.clearTimeout(pollTimer);freshness();if(!doc.hidden)refresh();});win.addEventListener('focus',()=>{if(!doc.hidden)refresh();});
  render();freshness();$('refresh').hidden=!online;$('live-link').hidden=online;
  ageTimer=win.setInterval(()=>{freshness();if(lastSuccess!==null&&!doc.hidden)render();},5000);
  if(online)refresh();if(win.location.hash.startsWith('#task-')){try{jump(decodeURIComponent(win.location.hash.slice(6)));}catch{}}
  return {applyBoard,refresh,getBoard:()=>board,stop(){stopped=true;win.clearTimeout(pollTimer);win.clearInterval(ageTimer);}};
 }
 const api={validateBoard,resourceConflict,taskActivity,isStale,retryDelay,mount};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 if(root&&root.document){root.HamptonTeamBoard={...api,...mount(root.document,root)};}
})(typeof window==='undefined'?null:window);
