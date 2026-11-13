import {fail,sha256} from './http.js';
import {normalizePhone} from './applicants.js';
import {verifyTurnstile} from './turnstile.js';
import {EMAIL} from './viewings.js';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const keys=['request_id','name','phone','email','address','operation','valuation_requested','privacy_version','token'];
// No policy reference or deployment flag substitutes for a working erasure/reconciliation workflow.
const OWNER_ERASURE_WORKFLOW_IMPLEMENTED=false;
const clean=(v,max)=>typeof v==='string'&&v.trim().length>0&&v.trim().length<=max?v.trim():null;
export function validateOwnerRequest(input){
 const errors={};if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!keys.includes(k)))return {errors:{form:'Invalid request'}};
 const name=clean(input.name,120), rawPhone=clean(input.phone,40), digits=rawPhone?.replace(/[\s\-.()]/g,'');
 const phone=normalizePhone(rawPhone)??(/^[0-9]{5,7}$/.test(digits??'')?digits:null),email=clean(input.email,254)?.toLowerCase(),address=clean(input.address,400);
 if(!name)errors.name='Enter your name';if(!phone)errors.phone='Enter a valid telephone number';if(!email||!EMAIL.test(email))errors.email='Enter a valid email address';if(!address||address.length<5)errors.address='Enter the property address';
 if(!['sale','rent'].includes(input.operation))errors.operation='Choose to sell or let';if(typeof input.valuation_requested!=='boolean')errors.valuation_requested='Choose whether to request a valuation';
 if(!UUID.test(input.request_id??''))errors.request_id='Invalid request';if(!clean(input.privacy_version,120))errors.privacy_version='Privacy notice unavailable';
 if(Object.keys(errors).length)return {errors};
 return {value:{request_id:input.request_id.toLowerCase(),name,phone,email,address,operation:input.operation,valuation_requested:input.valuation_requested,privacy_version:input.privacy_version.trim(),token:input.token}};
}
export const ownerRequestHash=v=>sha256(JSON.stringify({name:v.name,phone:v.phone,email:v.email,address:v.address,operation:v.operation,valuation_requested:v.valuation_requested,privacy_version:v.privacy_version}));
export async function ownerPolicy(env){
 if(env.OWNER_REQUESTS_READY!=='1'||!OWNER_ERASURE_WORKFLOW_IMPLEMENTED)return null;
 const r=await env.DB.prepare("SELECT json_extract(value,'$.privacy_version') AS version FROM app_settings WHERE key='owner_enquiries' AND json_extract(value,'$.enabled')=1 AND length(json_extract(value,'$.privacy_version')) BETWEEN 1 AND 120").first();
 return r?.version?String(r.version):null;
}
export async function ownerStorageAvailable(env){
 const r=await env.DB.prepare("SELECT COUNT(*) AS n FROM sqlite_schema WHERE type='table' AND name='owner_requests'").first();return Number(r?.n)===1;
}
export async function ownerSchemaAvailable(env){
 const r=await env.DB.prepare("SELECT COUNT(*) AS n FROM sqlite_schema WHERE (type='table' AND name IN ('owner_requests','owner_request_receipts')) OR (type='trigger' AND name IN ('owner_requests_policy','owner_requests_created'))").first();return Number(r?.n)===4;
}
export async function createOwnerRequest(env,request,input,{verify=verifyTurnstile,policyReader=ownerPolicy}={}){
 const r=validateOwnerRequest(input);if(r.errors)return {errors:r.errors};const v=r.value;
 const policy=await policyReader(env);if(env.OWNER_REQUESTS_READY!=='1'||!policy||!await ownerSchemaAvailable(env))fail(503,'Owner requests are not available');
 if(v.privacy_version!==policy)fail(409,'Privacy notice changed. Please reload and review it.');
 const db=typeof env.DB.withSession==='function'?env.DB.withSession('first-primary'):env.DB,hash=await ownerRequestHash(v);
 const prior=await db.prepare('SELECT payload_hash FROM owner_request_receipts WHERE request_id=?').bind(v.request_id).first();
 if(prior){if(prior.payload_hash!==hash)fail(409,'This request has changed. Please start again.');return {replayed:true};}
 const hostname=new URL(request.url).hostname;
 if(!await verify(v.token,env.TURNSTILE_SECRET,request.headers.get('cf-connecting-ip'),hostname))fail(400,'Please complete the verification and try again.');
 const ts=new Date().toISOString(),id=crypto.randomUUID();
 try {
  const result=await db.prepare(`INSERT INTO owner_requests(id,request_id,payload_hash,name,phone,email,address,operation,valuation_requested,privacy_version,created_at,updated_at)
    SELECT ?,?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM app_settings WHERE key='owner_enquiries' AND json_extract(value,'$.enabled')=1 AND json_extract(value,'$.privacy_version')=?)
    ON CONFLICT(request_id) DO NOTHING`).bind(id,v.request_id,hash,v.name,v.phone,v.email,v.address,v.operation,Number(v.valuation_requested),v.privacy_version,ts,ts,v.privacy_version).run();
  const receipt=await db.prepare('SELECT payload_hash FROM owner_request_receipts WHERE request_id=?').bind(v.request_id).first();
  if(!receipt)fail(503,'Owner requests are not available');if(receipt.payload_hash!==hash)fail(409,'This request has changed. Please start again.');return {replayed:result.meta.changes===0};
 } catch(e){ if(e?.status)throw e;if(!(await policyReader(env)))fail(503,'Owner requests are not available');if((await policyReader(env))!==v.privacy_version)fail(409,'Privacy notice changed. Please reload and review it.');throw e; }
}
