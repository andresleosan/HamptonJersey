// Presence check is a deployment guard, not a substitute for migration review or policy approval.
const required=[['table','public_demand_snapshots'],['table','demand_recovery_scopes'],['table','public_demand_contributions'],
  ['table','public_demand_page_reviews'],['table','demand_release_authorizations'],['table','public_demand_pointer'],
  ['table','public_demand_releases'],['table','public_demand_release_state'],['table','public_demand_assert'],
  ['index','one_active_demand_draft_per_actor_operation'],['index','demand_applicant_contact_pair'],
  ['trigger','invalidate_demand_on_contact_delete'],['trigger','invalidate_demand_on_search_delete'],['trigger','purge_demand_contributions']];
export const DEMAND_SCHEMA_GUARD=required.map(([type,name])=>`EXISTS(SELECT 1 FROM sqlite_master WHERE type='${type}' AND name='${name}')`).join(' AND ')+
  " AND EXISTS(SELECT 1 FROM public_demand_release_state WHERE id=1)";
export async function demandSchemaReady(env) {
  const db=typeof env.DB.withSession==='function' ? env.DB.withSession('first-primary') : env.DB;
  try { return (await db.prepare(`SELECT CASE WHEN ${DEMAND_SCHEMA_GUARD} THEN 1 ELSE 0 END AS ready`).first())?.ready===1; }
  catch { return false; }
}
