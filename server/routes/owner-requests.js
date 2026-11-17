import {json,fail,readJson,now} from '../http.js';
import {ownerPolicy,ownerSchemaAvailable,ownerStorageAvailable,createOwnerRequest} from '../owner-requests.js';
const UUID='[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}';
const headers={'cache-control':'no-store'};
const STATUSES=['new','contacted','closed'];
const primary=env=>typeof env.DB.withSession==='function'?env.DB.withSession('first-primary'):env.DB;
async function availability({env}){
 const version=await ownerPolicy(env);return json({available:!!version&&await ownerSchemaAvailable(env),...(version&&await ownerSchemaAvailable(env)?{privacy_version:version}:{})},200,headers);
}
async function submit({env,request}){
 const body=await readJson(request,8192),result=await createOwnerRequest(env,request,body);
 if(result.errors)return json({error:'Please check the highlighted fields.',fields:result.errors},400,headers);
 return json({ok:true},result.replayed?200:201,headers);
}
// Staff reads and acts on earlier requests even with intake closed. related: other requests with the same email or
// phone, so the team can reconcile duplicates or erase everything one person sent.
async function detail({env,params:[id]}){
 if(!await ownerStorageAvailable(env))fail(404,'Not found');
 const db=primary(env);
 const owner=await db.prepare('SELECT id,name,phone,email,address,operation,valuation_requested,status,created_at,updated_at FROM owner_requests WHERE id=?').bind(id).first();
 if(!owner)fail(404,'Not found');
 const {results:related}=await db.prepare('SELECT id,status,created_at FROM owner_requests WHERE id<>? AND (email=? OR phone=?) ORDER BY created_at DESC,id LIMIT 20').bind(id,owner.email,owner.phone).all();
 return json({owner,related},200,headers);
}
async function setStatus({env,request,admin,params:[id]}){
 if(!await ownerStorageAvailable(env))fail(404,'Not found');
 const b=await readJson(request);
 if(!STATUSES.includes(b?.status))fail(400,'Choose a status');
 if(typeof b.updated_at!=='string')fail(400,'Reload the request first');
 const ts=now(),db=primary(env);
 const [u]=await db.batch([
  db.prepare('UPDATE owner_requests SET status=?,updated_at=? WHERE id=? AND updated_at=?').bind(b.status,ts,id,b.updated_at),
  db.prepare("INSERT INTO events(at,actor,entity_type,entity_id,type,data) SELECT ?,?,'collection','owner-request:'||id,'owner.status_changed',json_object('status',status) FROM owner_requests WHERE id=? AND changes()=1").bind(ts,admin,id),
 ]);
 if(!u.meta.changes)fail((await db.prepare('SELECT 1 FROM owner_requests WHERE id=?').bind(id).first())?409:404,'Someone else changed this request. Reload it.');
 return detail({env,params:[id]});
}
// Erasure: the request and its receipt go; an event with the actor and no personal data records it, and the trigger
// of migration 0118 closes its Inbox task.
async function erase({env,admin,params:[id]}){
 if(!await ownerStorageAvailable(env))fail(404,'Not found');
 const db=primary(env);
 const [,d]=await db.batch([
  db.prepare("INSERT INTO events(at,actor,entity_type,entity_id,type,data) SELECT ?,?,'collection','owner-request:'||id,'owner.erased','{}' FROM owner_requests WHERE id=?").bind(now(),admin,id),
  db.prepare('DELETE FROM owner_requests WHERE id=?').bind(id),
 ]);
 if(!d.meta.changes)fail(404,'Not found');
 return json({ok:true},200,headers);
}
const staff=new RegExp(`^/admin/owner-requests/(${UUID})$`);
export default [['GET',/^\/owner-requests\/availability$/,availability],['POST',/^\/owner-requests$/,submit],['GET',staff,detail,true],['PUT',staff,setStatus,true],['DELETE',staff,erase,true]];
