import { OPTIONS } from './applicants.js';
const parishes=new Set(OPTIONS.parishes.map(([name])=>name));
const bands=new Set(['0','1','2','3','4+','Any']);
const opaque=value=>typeof value==='string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(value);
const iso=x=>typeof x==='string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(x) && Number.isFinite(Date.parse(x)) && new Date(x).toISOString()===x;
export function publicCells(cells) {
  if (!Array.isArray(cells)) throw new TypeError('Invalid cells');
  const seen=new Set();
  return cells.map(c=>{
    if (!c || !parishes.has(c.parish) || !bands.has(c.bedroom_band) || !Number.isSafeInteger(c.count) || c.count<1) throw new TypeError('Invalid cell');
    const k=JSON.stringify([c.parish,c.bedroom_band]); if(seen.has(k)) throw new TypeError('Duplicate cell'); seen.add(k);
    return {parish:c.parish,bedroom_band:c.bedroom_band,display_count:c.count};
  }).filter(c=>c.display_count>=5);
}
export function isReleaseAuthorization(row,expected,now) {
  return !!(row && expected && iso(now) && iso(row.accepted_at) && iso(row.expires_at) && row.accepted_at<=now && row.expires_at>now &&
    row.revoked_at==null && row.id===expected.authorization_id && row.policy_version===expected.policy_version &&
    row.public_sha256===expected.public_sha256 && row.releases_sha256===expected.releases_sha256 &&
    row.ledger_version===expected.ledger_version && row.identity_checked===1 && row.inference_review==='accepted' &&
    opaque(row.source_ref) && opaque(row.approved_by_ref));
}
export async function readAcceptedReleaseAuthorization(env,expected,now) {
  const db=typeof env.DB.withSession==='function' ? env.DB.withSession('first-primary') : env.DB;
  const row=await db.prepare('SELECT * FROM demand_release_authorizations WHERE id=?').bind(expected.authorization_id).first();
  return isReleaseAuthorization(row,expected,now) ? row : null;
}

export function isPublicDemandPayload(value) {
  if(!value || typeof value!=='object' || Array.isArray(value) || Object.keys(value).sort().join(',')!==
    'as_of,cells,definition,definition_version,id,operation,schema_version,valid_until') return false;
  if(value.schema_version!==1 || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.id) ||
    !['rent','buy'].includes(value.operation) || value.definition_version!=='unmet-contacts-v1' ||
    value.definition!=='Registered property seekers: distinct search contacts with no eligible match, by parish and minimum bedrooms.' ||
    !iso(value.as_of) || !iso(value.valid_until) || Date.parse(value.valid_until)-Date.parse(value.as_of)!==31*86400000 ||
    !Array.isArray(value.cells) || value.cells.length>72) return false;
  const seen=new Set();
  return value.cells.every(c=>{
    if(!c || typeof c!=='object' || Array.isArray(c) || Object.keys(c).sort().join(',')!=='bedroom_band,display_count,parish' ||
      !parishes.has(c.parish) || !bands.has(c.bedroom_band) || !Number.isSafeInteger(c.display_count) || c.display_count<5) return false;
    const key=JSON.stringify([c.parish,c.bedroom_band]); if(seen.has(key)) return false; seen.add(key); return true;
  });
}
