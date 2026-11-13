import { OPTIONS } from './applicants.js';
import { readDemandSearches } from './demand-query.js';

const parishes = new Set(OPTIONS.parishes.map(([value]) => value));
const band = n => n == null ? 'Any' : Number.isInteger(n) && n >= 0 ? (n >= 4 ? '4+' : String(n)) : null;
const array = value => { try { const p=JSON.parse(value); return Array.isArray(p) ? p : []; } catch { return []; } };

// IDs are private contribution evidence; callers must never serialize it to a public DTO.
export function groupDistinctDemand(rows) {
  const matched = new Set(rows.filter(r => r.matched).map(r => `${r.operation}\0${r.contact_id}`));
  const groups = new Map(); let excluded_area_rows=0, invalid_rows=0;
  for (const r of rows) {
    if (!['rent','buy'].includes(r.operation) || r.contact_id == null) { invalid_rows++; continue; }
    if (matched.has(`${r.operation}\0${r.contact_id}`)) continue;
    const areas=[...new Set(array(r.parishes_wanted).filter(p => parishes.has(p)))];
    const bedroom_band=band(r.bedrooms_min);
    if (!areas.length) { excluded_area_rows++; continue; }
    if (!bedroom_band) { invalid_rows++; continue; }
    for (const parish of areas) {
      const key=JSON.stringify([r.operation,parish,bedroom_band]);
      if (!groups.has(key)) groups.set(key,{operation:r.operation,parish,bedroom_band,contacts:new Set(),contributions:[]});
      groups.get(key).contacts.add(r.contact_id);
      if (Number.isSafeInteger(r.id)) groups.get(key).contributions.push({contact_id:r.contact_id,search_id:r.id});
    }
  }
  const cells=[...groups.values()].map(g=>({operation:g.operation,parish:g.parish,bedroom_band:g.bedroom_band,
    count:g.contacts.size,contributions:g.contributions})).sort((a,b)=>a.operation.localeCompare(b.operation)||a.parish.localeCompare(b.parish)||a.bedroom_band.localeCompare(b.bedroom_band));
  return {cells,quality:{excluded_area_rows,invalid_rows,identity_verified:false}};
}

export async function buildDemandSnapshot(env,input) {
  if (!input || Object.keys(input).length !== 1 || !['rent','buy'].includes(input.operation)) throw new TypeError('Invalid demand request');
  const result=await readDemandSearches(env,input.operation);
  const as_of=result?.[0]?.results?.[0]?.as_of, rows=result?.[1]?.results;
  if (!as_of || !Array.isArray(rows)) throw new Error('Demand snapshot unavailable');
  return {schema_version:1,operation:input.operation,as_of,definition_version:'unmet-contacts-v1',...groupDistinctDemand(rows)};
}
