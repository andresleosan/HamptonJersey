const LISTS=['vps','hermes','vscode','codex-desktop'];
import {publicActivities} from './activity.mjs';
const OPEN=new Set(['active','paused','stale','submitted']);
// Task details come from the public checklist; contact addresses are unnecessary here.
const publicText=value=>typeof value==='string'?value.replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g,'[correo del equipo]'):'';
export function publicBoard(board) {
  const work=Array.isArray(board.work)?publicActivities(board.work):null;
  const lists=LISTS.map((id,index)=>{const slot=board.slots.find(s=>s.id===id);return {number:index+1,name:`Lista ${index+1}`,capacity:slot.capacity||1,activeCount:work?work.filter(r=>r.mode==='build'&&r.list===index+1&&['active','paused','review','built'].includes(r.status)).length:board.claims.filter(c=>c.slot===slot.id&&OPEN.has(c.status)).length};});
  const tasks=board.tasks.map(task=>{
    const units=board.units.filter(u=>u.parentTaskId===task.id),ids=new Set(units.map(u=>u.id));
    const held=board.claims.find(c=>ids.has(c.unitId)&&OPEN.has(c.status));
    const finished=u=>board.claims.some(c=>c.unitId===u.id&&c.status==='completed'&&c.mode==='build'&&c.completionCurrent!==false);
    const currentWork=units.filter(u=>u.enabled||finished(u));
    const completed=task.estado==='hecho'||currentWork.length>0&&currentWork.every(finished);
    let activity=held?(held.status==='active'?(held.mode==='plan'?'planning':'active'):held.status):completed?'completed':'unreserved';
    const records=work?.filter(r=>r.task===task.id),build=records?.filter(r=>r.mode==='build').at(-1)||null;
    const plans=records?.filter(r=>r.mode==='plan'&&!records.some(other=>other.mode==='plan'&&other.team===r.team&&other.updatedAt>r.updatedAt))||[];
    if(work)activity=build?.status||plans.at(-1)?.status||(task.estado==='hecho'?'completed':'unreserved');
    const details={done:publicText(task.hecho),pending:publicText(task.falta),nextStep:publicText(task.nextStep),dependencies:[...new Set((task.dependencies||[]).map(d=>d?.id).filter(id=>typeof id==='string'&&/^[A-Z0-9]+-\d+$/.test(id)))]};
    const delivery=records?.filter(r=>r.mode==='build'&&r.status==='published').at(-1)||null;
    return {code:task.id,title:task.titulo,list:LISTS.indexOf(task.assignedSlot)+1,state:task.estado,activity,details,...(work?{work:{build,plans,delivery}}:{})};
  });
  return {schemaVersion:1,revision:board.revision+(board.activityRevision||0),updatedAt:board.serverTime,lists,tasks};
}
