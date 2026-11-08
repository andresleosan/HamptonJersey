import { createRemoteJWKSet, jwtVerify } from 'jose';
import { fail, identifier } from './errors.mjs';
const slots=new Set(['vps','hermes','vscode','codex-desktop']);
const keySets=new Map();
export function identityConfiguration(env) {
  let identities;
  try { identities=JSON.parse(env.TEAM_IDENTITIES_JSON); } catch {fail(503,'AUTH_CONFIGURATION','Identity mapping is not configured.');}
  if(!identities||typeof identities!=='object'||Array.isArray(identities)||!Object.keys(identities).length||Object.keys(identities).length>100)fail(503,'AUTH_CONFIGURATION','Identity mapping is invalid.');
  for(const [key,value] of Object.entries(identities)) {
    if(!key||key.length>300||!value||!['executor','coordinator','viewer'].includes(value.role)||!Array.isArray(value.slots)||value.slots.some(slot=>!slots.has(slot))||new Set(value.slots).size!==value.slots.length)fail(503,'AUTH_CONFIGURATION','Identity mapping is invalid.');
    try {identifier(value.actorId,'actorId');}catch{fail(503,'AUTH_CONFIGURATION','Identity mapping is invalid.');}
    if(key.includes('@')&&value.role!=='viewer')fail(503,'AUTH_CONFIGURATION','Human identities must be read only.');
    if(value.role!=='viewer'&&!value.slots.length)fail(503,'AUTH_CONFIGURATION','Service identity needs an authorized slot.');
  }
  return identities;
}
export async function authenticate(request,env) {
  const identities=identityConfiguration(env);
  const domain=typeof env.ACCESS_TEAM_DOMAIN==='string'?env.ACCESS_TEAM_DOMAIN.replace(/^https:\/\//,'').replace(/\/$/,''):'';
  if(!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.cloudflareaccess\.com$/.test(domain)||typeof env.ACCESS_AUD!=='string'||!env.ACCESS_AUD.trim())fail(503,'AUTH_CONFIGURATION','Cloudflare Access issuer and audience are not configured.');
  const token=request.headers.get('Cf-Access-Jwt-Assertion');
  if(!token||token.length>16384)fail(401,'UNAUTHENTICATED','A verified Cloudflare Access JWT is required.');
  const issuer=`https://${domain}`;
  let keys=keySets.get(issuer);
  if(!keys){keys=createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`),{timeoutDuration:5000,cooldownDuration:30000});keySets.set(issuer,keys);}
  let payload;
  try {({payload}=await jwtVerify(token,keys,{issuer,audience:env.ACCESS_AUD,algorithms:['RS256'],requiredClaims:['exp','iat','sub'],clockTolerance:0}));}
  catch(error) {
    if(['ERR_JWKS_TIMEOUT','ERR_JWKS_INVALID'].includes(error.code)||(!error.code&&error instanceof TypeError))fail(503,'AUTH_UNAVAILABLE','Access verification is unavailable.');
    fail(401,'INVALID_JWT','Cloudflare Access JWT is invalid or expired.');
  }
  // Human JWTs can never gain executor authority through a service subject mapping.
  if(typeof payload.email==='string') {
    const mapping=Object.hasOwn(identities,payload.email)?identities[payload.email]:null;
    if(!mapping||mapping.role!=='viewer')fail(403,'IDENTITY_FORBIDDEN','Human identity is not authorized for this board.');
    return {...mapping,role:'viewer',slots:[]};
  }
  const mapping=(typeof payload.common_name==='string'&&Object.hasOwn(identities,payload.common_name)&&identities[payload.common_name])||(Object.hasOwn(identities,payload.sub)?identities[payload.sub]:null);
  if(!mapping||mapping.role==='viewer')fail(403,'IDENTITY_FORBIDDEN','Service identity is not authorized.');
  return {actorId:mapping.actorId,slots:mapping.slots,role:mapping.role};
}
export function authorizedTarget(env,target) {
  if(!target||typeof target!=='object')return false;
  return Object.values(identityConfiguration(env)).some(identity=>identity.actorId===target.actorId&&identity.role!=='viewer'&&identity.slots.includes(target.slot));
}
