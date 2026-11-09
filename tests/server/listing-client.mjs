// Existing workflows act on the version just read, like the updated panel.
// Stale/missing-version contract tests use helpers.mjs directly.
export * from './helpers.mjs';
import {call as rawCall} from './helpers.mjs';
export function call(env,method,path,options={}) {
  const match=method==='POST'&&/^\/admin\/listings\/(HE-[A-Z]\d{3,})\/(publish|unpublish|archive|restore)$/.exec(path);
  if(match&&options.body===undefined)options={...options,body:{updated_at:
    env.DB.raw.prepare('SELECT updated_at FROM listings WHERE id=?').get(match[1])?.updated_at??''}};
  const queue=method==='POST'&&/^\/admin\/queue\/(\d+)\/approve$/.exec(path);
  if(queue&&options.body===undefined)options={...options,body:{updated_at:
    env.DB.raw.prepare('SELECT l.updated_at FROM listings l JOIN drive_imports d ON d.listing_id=l.id WHERE d.id=?').get(+queue[1])?.updated_at??''}};
  return rawCall(env,method,path,options);
}
