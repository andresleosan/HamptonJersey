import { jerseyToday } from './viewings.js';
import { prunePrivateDemandMatrices } from './public-demand.js';

// A separate lease and record prevent failures or retries from altering the established retention pass.
export async function demandRetentionPass(env,ts) {
  if(env.DEMAND_INTERNAL_READY!=='1') return;
  const date=jerseyToday(new Date(ts)), token=crypto.randomUUID();
  try {
    const claim=await env.DB.prepare(`INSERT INTO app_settings(key,value,updated_at,updated_by)
      VALUES('demand_retention_run',json_object('date',?,'ok',json('false'),'attempts',1,'token',?,
        'lease_until',strftime('%Y-%m-%dT%H:%M:%fZ','now','+5 minutes')),strftime('%Y-%m-%dT%H:%M:%fZ','now'),'system')
      ON CONFLICT(key) DO UPDATE SET value=json_object('date',?, 'ok',json('false'),
        'attempts',CASE WHEN json_extract(value,'$.date')=? THEN json_extract(value,'$.attempts')+1 ELSE 1 END,
        'token',?, 'lease_until',strftime('%Y-%m-%dT%H:%M:%fZ','now','+5 minutes')),
        updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),updated_by='system'
      WHERE json_extract(value,'$.date')<? OR (json_extract(value,'$.date')=? AND NOT json_extract(value,'$.ok')
        AND json_extract(value,'$.attempts')<3 AND json_extract(value,'$.lease_until')<=strftime('%Y-%m-%dT%H:%M:%fZ','now'))`)
      .bind(date,token,date,date,token,date,date).run();
    if(claim.meta.changes!==1) return;
    const result=await prunePrivateDemandMatrices(env);
    await env.DB.prepare(`UPDATE app_settings SET value=json_set(value,'$.ok',json('true'),'$.purged',?),
      updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE key='demand_retention_run'
      AND json_extract(value,'$.date')=? AND json_extract(value,'$.token')=?`)
      .bind(result.meta.changes,date,token).run();
  } catch { console.error('Demand retention pass failed'); }
}
