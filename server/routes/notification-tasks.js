import {json,fail,readJson} from '../http.js';
import {getTask,mutateTask,createTask} from '../notification-tasks.js';
import {TASK_CATEGORIES} from '../notification-query.js';

function taskId(value) {
  const id=Number(value);if(!Number.isSafeInteger(id)||id<1)fail(400,'Invalid task ID');return id;
}
async function detail({env,admin,params:[value]}) {
  const id=taskId(value),task=await getTask(env,id,admin);
  const {results:history}=await env.DB.prepare(
    'SELECT revision,at,actor,action FROM notification_task_history WHERE task_id=? ORDER BY revision DESC LIMIT 50').bind(id).all();
  return json({task,history});
}
async function update({env,admin,request,params:[id]}) {
  return json(await mutateTask(env,taskId(id),admin,await readJson(request,8192)));
}
async function create({env,admin,request}) {
  const result=await createTask(env,admin,await readJson(request,8192));return json(result,result.replayed?200:201);
}
async function read({env,admin,request,params:[value]}) {
  const id=taskId(value),body=await readJson(request,2048);
  if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).length!==1
    ||!Number.isSafeInteger(body.revision)||body.revision<1)fail(400,'Send the revision you read');
  await getTask(env,id,admin);
  const r=await env.DB.prepare(`INSERT INTO notification_reads(admin,notification_id,read_revision)
    SELECT ?,id,revision FROM notifications WHERE id=? AND revision=?
    ON CONFLICT(admin,notification_id) DO UPDATE SET read_revision=MAX(notification_reads.read_revision,excluded.read_revision)`)
    .bind(admin,id,body.revision).run();
  if(!r.meta.changes)fail(409,'This task has newer context. Reload before marking it read.');
  return json({ok:true,revision:body.revision});
}
async function getPreferences({env,admin}) {
  const row=await env.DB.prepare('SELECT revision,feed_categories FROM notification_preferences WHERE admin=?').bind(admin).first();
  return json(row?{revision:row.revision,feed_categories:JSON.parse(row.feed_categories)}:{revision:0,feed_categories:TASK_CATEGORIES});
}
async function savePreferences({env,admin,request}) {
  const body=await readJson(request,2048);
  if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!['revision','feed_categories'].includes(k))
    ||!Number.isSafeInteger(body.revision)||body.revision<0||!Array.isArray(body.feed_categories)
    ||body.feed_categories.some(c=>!TASK_CATEGORIES.includes(c))||new Set(body.feed_categories).size!==body.feed_categories.length)
    fail(400,'Send a valid preference revision and feed categories');
  const categories=TASK_CATEGORIES.filter(c=>body.feed_categories.includes(c));
  const r=await env.DB.prepare(`INSERT INTO notification_preferences(admin,revision,feed_categories)
    SELECT ?,1,? WHERE ?=0 OR EXISTS(SELECT 1 FROM notification_preferences WHERE admin=?)
    ON CONFLICT(admin) DO UPDATE SET revision=notification_preferences.revision+1,feed_categories=excluded.feed_categories
    WHERE notification_preferences.revision=?`).bind(admin,JSON.stringify(categories),body.revision,admin,body.revision).run();
  if(!r.meta.changes)fail(409,'Preferences changed in another tab. Reload before saving.');
  return json({revision:body.revision+1,feed_categories:categories});
}

export default [
  ['POST',/^\/admin\/notification-tasks$/,create,true],
  ['GET',/^\/admin\/notification-tasks\/(\d+)$/,detail,true],
  ['PUT',/^\/admin\/notification-tasks\/(\d+)$/,update,true],
  ['PUT',/^\/admin\/notification-tasks\/(\d+)\/read$/,read,true],
  ['GET',/^\/admin\/notification-preferences$/,getPreferences,true],
  ['PUT',/^\/admin\/notification-preferences$/,savePreferences,true],
];
