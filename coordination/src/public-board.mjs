const LISTS=['vps','hermes','vscode','codex-desktop'];
const OPEN=new Set(['active','paused','stale','submitted']);
export function publicBoard(board) {
  const lists=LISTS.map((id,index)=>{const slot=board.slots.find(s=>s.id===id);return {number:index+1,name:`Lista ${index+1}`,capacity:slot.capacity||1,activeCount:board.claims.filter(c=>c.slot===slot.id&&OPEN.has(c.status)).length};});
  const tasks=board.tasks.map(task=>{
    const units=board.units.filter(u=>u.parentTaskId===task.id),ids=new Set(units.map(u=>u.id));
    const held=board.claims.find(c=>ids.has(c.unitId)&&OPEN.has(c.status));
    const finished=u=>board.claims.some(c=>c.unitId===u.id&&c.status==='completed'&&c.mode==='build'&&c.completionCurrent!==false);
    const currentWork=units.filter(u=>u.enabled||finished(u));
    const completed=task.estado==='hecho'||currentWork.length>0&&currentWork.every(finished);
    const activity=held?(held.status==='active'?(held.mode==='plan'?'planning':'active'):held.status):completed?'completed':'unreserved';
    return {code:task.id,title:task.titulo,list:LISTS.indexOf(task.assignedSlot)+1,state:task.estado,activity};
  });
  return {schemaVersion:1,revision:board.revision,updatedAt:board.serverTime,lists,tasks};
}
