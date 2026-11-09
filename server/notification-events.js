import {fail} from './http.js';
import {taskStatements} from './notification-tasks.js';

// Internal contract for future producers. A fixture is not an activated producer.
export function futureTaskStatements(env,{work,phase,episode,target,...descriptor},options={}) {
  if(!['must','source','call','capture','review21','dictation'].includes(work))fail(400,'Invalid work');
  if(!['pending','resolved'].includes(phase))fail(400,'Declare a pending or resolved phase');
  if(typeof episode!=='string'||!/^[A-Za-z0-9][A-Za-z0-9:._/-]{0,79}$/.test(episode))fail(400,'Use a stable technical episode');
  return taskStatements(env,{...descriptor,target,taskKey:`work:${work}:${target.kind}:${target.id}:${episode}`,
    category:'task',requiresAction:true,resolved:phase==='resolved',preserveDone:true},options);
}
