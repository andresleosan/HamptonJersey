const LISTS=['vps','hermes','vscode','codex-desktop'];
const OPEN=new Set(['active','paused','stale','submitted']);
// Task details come from the public checklist; contact addresses are unnecessary here.
const publicText=value=>typeof value==='string'?value.replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g,'[correo del equipo]'):'';
export function publicBoard(board) {
  const lists=LISTS.map((id,index)=>{const slot=board.slots.find(s=>s.id===id);return {number:index+1,name:`Lista ${index+1}`,capacity:slot.capacity||1,activeCount:board.claims.filter(c=>c.slot===slot.id&&OPEN.has(c.status)).length};});
  const tasks=board.tasks.map(task=>{
    const units=board.units.filter(u=>u.parentTaskId===task.id),ids=new Set(units.map(u=>u.id));
    const held=board.claims.find(c=>ids.has(c.unitId)&&OPEN.has(c.status));
    const finished=u=>board.claims.some(c=>c.unitId===u.id&&c.status==='completed'&&c.mode==='build'&&c.completionCurrent!==false);
    const currentWork=units.filter(u=>u.enabled||finished(u));
    const completed=task.estado==='hecho'||currentWork.length>0&&currentWork.every(finished);
    const activity=held?(held.status==='active'?(held.mode==='plan'?'planning':'active'):held.status):completed?'completed':'unreserved';
    const details={done:publicText(task.hecho),pending:publicText(task.falta),nextStep:publicText(task.nextStep),dependencies:[...new Set((task.dependencies||[]).map(d=>d?.id).filter(id=>typeof id==='string'&&/^[A-Z0-9]+-\d+$/.test(id)))]};
    return {code:task.id,title:task.titulo,list:LISTS.indexOf(task.assignedSlot)+1,state:task.estado,activity,details};
  });
  return {schemaVersion:1,revision:board.revision,updatedAt:board.serverTime,lists,tasks};
}
