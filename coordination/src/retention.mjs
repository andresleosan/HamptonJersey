export const REPLAY_RETENTION_MS=24*60*60*1000;
export const MAX_REPLAY_RESULTS=6000;
export const MAX_EVENTS=1000;
export function pruneHistory(sql,now) {
  // Keep compact operation fingerprints after discarding response payloads: an old
  // key must never be interpreted as a new command with fresh authority.
  sql.exec('UPDATE operations SET result=NULL WHERE result IS NOT NULL AND created_at<?',now-REPLAY_RETENTION_MS);
  sql.exec('UPDATE operations SET result=NULL WHERE result IS NOT NULL AND rowid NOT IN (SELECT rowid FROM operations WHERE result IS NOT NULL ORDER BY created_at DESC,rowid DESC LIMIT ?)',MAX_REPLAY_RESULTS);
  sql.exec('DELETE FROM events WHERE id NOT IN (SELECT id FROM events ORDER BY id DESC LIMIT ?)',MAX_EVENTS);
}
export async function fingerprintOf(value) {
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonicalJson(value)));
  return Array.from(new Uint8Array(bytes),byte=>byte.toString(16).padStart(2,'0')).join('');
}
export function canonicalJson(value) {
  if(Array.isArray(value))return `[${value.map(canonicalJson).join(',')}]`;
  if(value&&typeof value==='object')return `{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
