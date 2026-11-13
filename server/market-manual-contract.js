import { HttpError } from './http.js';
import { normalizeObservation } from './market-extraction.js';

// This validates a private, already supplied observation page; it does not fetch or authorize a source.
const bad=()=>{throw new HttpError(400,'Invalid manual observation page');};
const reference=value=>typeof value==='string' && /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$/.test(value);
const token=value=>typeof value==='string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$/.test(value);
const timestamp=value=>typeof value==='string' && value.length===24 && Number.isFinite(Date.parse(value)) && new Date(value).toISOString()===value;
const has=(object,key)=>Object.prototype.hasOwnProperty.call(object,key);

function object(value,allowed) {
  if (!value || typeof value!=='object' || Array.isArray(value) ||
      ![Object.prototype,null].includes(Object.getPrototypeOf(value)) || Object.getOwnPropertySymbols(value).length) bad();
  const out={};
  for (const [key,descriptor] of Object.entries(Object.getOwnPropertyDescriptors(value))) {
    if (!allowed.includes(key) || !descriptor.enumerable || !has(descriptor,'value') || descriptor.value===undefined) bad();
    out[key]=descriptor.value;
  }
  return out;
}
function array(value,max) {
  if (!Array.isArray(value) || value.length>max || Object.getOwnPropertySymbols(value).length) bad();
  const descriptors=Object.getOwnPropertyDescriptors(value), keys=Object.keys(descriptors).filter(k=>k!=='length');
  if (keys.length!==value.length || keys.some((key,index)=>key!==String(index) || !descriptors[key].enumerable ||
      !has(descriptors[key],'value') || descriptors[key].value===undefined)) bad();
  return keys.map(key=>descriptors[key].value);
}
function observation(value) {
  const out=object(value,['country_code','territory_evidence','operation','observed_at','title','parish','bedrooms',
    'bathrooms','pets','parking','financial_terms']);
  for (const [key,item] of Object.entries(out)) {
    if (key==='financial_terms') {
      if (item!==null) out[key]=array(item,50).map(term=>object(term,['kind','amount_minor','currency','period','raw_text','evidence_ref']));
    } else if (item!==null && !['string','number','boolean'].includes(typeof item)) bad();
  }
  if (typeof out.territory_evidence!=='string' || /[?#@\\\u0000-\u001f\u007f]/.test(out.territory_evidence)) bad();
  for (const term of out.financial_terms ?? []) for (const [key,value] of Object.entries(term)) {
    if (value!==null && !['string','number'].includes(typeof value)) bad();
    if (typeof value==='string' && /[\u0000-\u001f\u007f]/.test(value)) bad();
    if (key==='evidence_ref' && value!==null && (value.length>1024 || /[?#@\\]/.test(value))) bad();
  }
  return out;
}

function canonicalUrl(value) {
  if (typeof value!=='string' || value.length>2048 || /[%?#\\\u0000-\u0020\u007f]/.test(value)) bad();
  let url;try {url=new URL(value);} catch {bad();}
  if (url.protocol!=='https:' || url.username || url.password || url.port || url.href!==value ||
      url.pathname.startsWith('//') || url.pathname.split('/').some(part=>part==='.'||part==='..')) bad();
  return url;
}
const host=value=>typeof value==='string' && value.length<=253 && value===value.toLowerCase() &&
  /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(value) && !/(^|\.)(localhost|local|internal)(\.|$)/.test(value);
const path=value=>typeof value==='string' && value.length<=1024 && value.startsWith('/') && !value.startsWith('//') &&
  !/[?#%\\\u0000-\u001f\u007f]/.test(value) && !value.split('/').some(part=>part==='.'||part==='..');

// Exact reviewed hosts and path segments only. No query, fragment, encoded path or userinfo is accepted.
export function manualScopeAllows(hostsJson,pathsJson,urls) {
  try {
    if (typeof hostsJson!=='string' || hostsJson.length>8192 || typeof pathsJson!=='string' || pathsJson.length>32768) return false;
    const hosts=JSON.parse(hostsJson),paths=JSON.parse(pathsJson);
    if (!Array.isArray(hosts) || !hosts.length || hosts.length>25 || !hosts.every(host) ||
        !Array.isArray(paths) || !paths.length || paths.length>25 || !paths.every(path) || !Array.isArray(urls)) return false;
    return urls.every(value=>{
      const url=canonicalUrl(value);
      return hosts.includes(url.hostname) && paths.some(prefix=>prefix==='/' || url.pathname===prefix ||
        url.pathname.startsWith(prefix.endsWith('/')?prefix:`${prefix}/`));
    });
  } catch { return false; }
}

function freeze(value) {
  if (value && typeof value==='object') { for (const child of Object.values(value)) freeze(child);Object.freeze(value); }
  return value;
}

export function prepareManualObservationPage(input) {
  const p=object(input,['page_key','cursor','next_cursor','exhausted','observed_at','records']);
  if (!token(p.page_key) || (p.cursor!==null && !token(p.cursor)) || !token(p.next_cursor) || p.cursor===p.next_cursor ||
      p.exhausted!==false || !timestamp(p.observed_at)) bad();
  const records=array(p.records,10);
  if (!records.length) bad();
  const keys=new Set(), prepared=records.map(item=>{
    const r=object(item,['external_key','source_at','listing_url','observation']);
    if (!reference(r.external_key) || keys.has(r.external_key) || !timestamp(r.source_at)) bad();
    keys.add(r.external_key);canonicalUrl(r.listing_url);
    const original=observation(r.observation);
    if (!timestamp(original.observed_at) || r.source_at>original.observed_at || original.observed_at>p.observed_at) bad();
    let normalized;try {normalized=normalizeObservation(original);} catch {bad();}
    return {external_key:r.external_key,source_at:r.source_at,raw:{listing_url:r.listing_url,observation:original},normalized};
  });
  const page={page_key:p.page_key,cursor:p.cursor,next_cursor:p.next_cursor,exhausted:false,observed_at:p.observed_at,records:prepared};
  if (new TextEncoder().encode(JSON.stringify(page)).byteLength>131072) throw new HttpError(413,'Inventory page is too large');
  return freeze(page);
}

// Reconstruct and recompute the normalized values at the storage boundary.
export function verifyPreparedManualPage(page) {
  const p=object(page,['page_key','cursor','next_cursor','exhausted','observed_at','records']);
  const records=array(p.records,10).map(item=>{
    const r=object(item,['external_key','source_at','raw','normalized']);
    const raw=object(r.raw,['listing_url','observation']);
    return {external_key:r.external_key,source_at:r.source_at,listing_url:raw.listing_url,observation:raw.observation};
  });
  return prepareManualObservationPage({...p,records});
}
