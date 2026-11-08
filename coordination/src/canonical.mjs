import { validateCatalog } from '../catalog.mjs';
import { fail, gitSha, requireThat } from './errors.mjs';
export const CANONICAL_REPO='andresleosan/HamptonJersey';
const BASE=`https://api.github.com/repos/${CANONICAL_REPO}`;
async function github(env,path,{raw=false,maxBytes=2_000_000}={}) {
  const headers={'User-Agent':'Hampton-Team-Coordinator','Accept':raw?'application/vnd.github.raw+json':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'};
  if(env.COORDINATION_GITHUB_TOKEN)headers.Authorization=`Bearer ${env.COORDINATION_GITHUB_TOKEN}`;
  let response;
  try {response=await fetch(`${BASE}${path}`,{headers,redirect:'manual',signal:AbortSignal.timeout(8000)});}catch{fail(503,'CANONICAL_UNAVAILABLE','Canonical repository verification is unavailable.');}
  if(!response.ok)fail(503,'CANONICAL_UNAVAILABLE','Canonical repository verification is unavailable.');
  const reader=response.body?.getReader();if(!reader)fail(503,'CANONICAL_UNAVAILABLE','Canonical repository returned no data.');
  const chunks=[];let bytes=0;
  try {while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>maxBytes){await reader.cancel();fail(503,'CANONICAL_UNAVAILABLE','Canonical response exceeds the allowed size.');}chunks.push(value);}}
  finally {reader.releaseLock();}
  const data=new Uint8Array(bytes);let offset=0;for(const chunk of chunks){data.set(chunk,offset);offset+=chunk.length;}
  try {return JSON.parse(new TextDecoder().decode(data));}catch{fail(503,'CANONICAL_UNAVAILABLE','Canonical repository returned invalid data.');}
}
export async function verifyMain(env,sha) {
  sha=gitSha(sha);const main=await github(env,'/git/ref/heads/main',{maxBytes:32000});
  requireThat(main.object?.sha===sha,'MAIN_SHA_MISMATCH','SHA is not the current canonical main.');return sha;
}
export async function importCanonicalCatalog(env,sha) {
  sha=await verifyMain(env,sha);
  const catalog=await github(env,`/contents/docs/roadmap/catalog.json?ref=${sha}`,{raw:true});
  const errors=validateCatalog(catalog);
  if(errors.length)fail(409,'INVALID_CATALOG','Canonical catalogue failed validation.',{errors:errors.slice(0,20)});
  // Refuse a snapshot if main changed while fetching its immutable catalogue.
  await verifyMain(env,sha);return catalog;
}
export async function verifyIntegrated(env,sha) {
  sha=gitSha(sha);
  const comparison=await github(env,`/compare/${sha}...main`,{maxBytes:1_000_000});
  requireThat(['ahead','identical'].includes(comparison.status)&&comparison.merge_base_commit?.sha===sha,'COMMIT_NOT_ON_MAIN','Integrated evidence SHA must be an ancestor of canonical main.');
  return sha;
}
