import {json,fail,readJson} from '../http.js';
import {ownerPolicy,ownerSchemaAvailable,ownerStorageAvailable,createOwnerRequest} from '../owner-requests.js';
const UUID='[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}';
const headers={'cache-control':'no-store'};
async function availability({env}){
 const version=await ownerPolicy(env);return json({available:!!version&&await ownerSchemaAvailable(env),...(version&&await ownerSchemaAvailable(env)?{privacy_version:version}:{})},200,headers);
}
async function submit({env,request}){
 const body=await readJson(request,8192),result=await createOwnerRequest(env,request,body);
 if(result.errors)return json({error:'Please check the highlighted fields.',fields:result.errors},400,headers);
 return json({ok:true},result.replayed?200:201,headers);
}
async function detail({env,params:[id]}){
 if(!await ownerStorageAvailable(env))fail(404,'Not found');
 const db=typeof env.DB.withSession==='function'?env.DB.withSession('first-primary'):env.DB;
 const owner=await db.prepare('SELECT id,name,phone,email,address,operation,valuation_requested,status,created_at,updated_at FROM owner_requests WHERE id=?').bind(id).first();
 if(!owner)fail(404,'Not found');return json({owner},200,headers);
}
export default [['GET',/^\/owner-requests\/availability$/,availability],['POST',/^\/owner-requests$/,submit],['GET',new RegExp(`^/admin/owner-requests/(${UUID})$`),detail,true]];
