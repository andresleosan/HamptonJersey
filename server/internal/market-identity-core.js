import { HttpError } from '../http.js';

// INTERNAL, NON-AUTHORIZING TRANSACTION CORE. Never connect this module to a
// route or real consumer without the durable ADM-18 permission/session contract.
// Each observation starts as a separate provisional physical identity.
const bad = () => { throw new HttpError(400, 'Invalid identity request'); };
const conflict = () => { throw new HttpError(409, 'Identity state or access changed'); };
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const actorId = value => typeof value === 'string' && value.length > 0 && value.length <= 254 && !/[\u0000-\u001f\u007f]/.test(value);
const primary = db => typeof db.withSession === 'function' ? db.withSession('first-primary') : db;
const now = clock => {
  const date = new Date(clock());
  if (!Number.isFinite(date.getTime())) throw new Error('Invalid identity clock');
  return date.toISOString();
};

export async function resolvePropertyIdentityCore(env, input, actor, clock = () => new Date()) {
  if (!input || !uuid(input.observation_id) || !uuid(input.operation_id) || !actorId(actor)) bad();
  const db = primary(env.DB), at = now(clock);
  // The source evidence is read only to detect changes inside the transaction.
  const snapshot = await db.prepare(`SELECT o.source_ref,o.channel_id,o.external_key,o.revision,o.normalized_sha256,o.normalized_json,o.raw_json,
      json_extract(o.normalized_json,'$.operation') AS operation,s.policy_version,a.added_at AS actor_added_at
    FROM market_observations o JOIN market_sources s ON s.source_ref=o.source_ref AND s.channel_id=o.channel_id
    JOIN admins a ON a.email=? WHERE o.id=?`).bind(actor,input.observation_id).first();
  if (!snapshot || !['sale','rent','business'].includes(snapshot.operation)) conflict();
  const guardId=crypto.randomUUID(), scopeGuardId=crypto.randomUUID(), propertyId=crypto.randomUUID(), listingId=crypto.randomUUID();
  const statements = [db.prepare(`INSERT INTO market_commit_guard(id,allowed)
    SELECT ?,CASE WHEN EXISTS (
      SELECT 1 FROM market_observations o
      JOIN market_sources s ON s.source_ref=o.source_ref AND s.channel_id=o.channel_id
      JOIN market_pages p ON p.id=o.page_id AND p.source_ref=o.source_ref AND p.channel_id=o.channel_id
      JOIN market_runs r ON r.id=p.run_id
      LEFT JOIN market_directory_manifests m ON m.revision=r.manifest_revision
      JOIN admins a ON a.email=? AND a.added_at=?
      WHERE o.id=? AND o.source_ref=? AND o.channel_id=? AND o.external_key=?
        AND o.revision=? AND o.normalized_sha256=? AND o.normalized_json=? AND o.raw_json=? AND o.deleted_tombstone=0
        AND json_extract(o.normalized_json,'$.country_code')='JE'
        AND json_type(o.normalized_json,'$.territory_evidence')='text'
        AND length(trim(json_extract(o.normalized_json,'$.territory_evidence')))>0
        AND json_extract(o.normalized_json,'$.operation')=?
        AND s.policy_version=? AND s.access_status IN ('allowed','manual_only')
        AND s.evidence_ref IS NOT NULL AND s.retention_ref IS NOT NULL
        AND s.reviewed_at=strftime('%Y-%m-%dT%H:%M:%fZ',s.reviewed_at,'+0 days')
        AND s.review_due_at=strftime('%Y-%m-%dT%H:%M:%fZ',s.review_due_at,'+0 days')
        AND s.reviewed_at<=? AND s.review_due_at>?
        AND s.reviewed_at<=strftime('%Y-%m-%dT%H:%M:%fZ','now')
        AND s.review_due_at>strftime('%Y-%m-%dT%H:%M:%fZ','now')
        AND ((r.kind='own_pilot' AND s.source_kind='internal') OR
          (r.kind IN ('initial','daily') AND s.source_kind='external' AND s.directory_revision=r.manifest_revision
           AND m.status='accepted' AND m.sha256=r.manifest_sha256))
        AND NOT EXISTS (SELECT 1 FROM market_observations old WHERE old.source_ref=o.source_ref
          AND old.channel_id=o.channel_id AND old.external_key=o.external_key AND old.deleted_tombstone=1)
    ) AND NOT EXISTS (SELECT 1 FROM market_identity_receipts receipt WHERE receipt.operation_id=?
      AND (receipt.observation_id<>? OR receipt.actor<>? OR receipt.actor_added_at<>?))
    THEN 1 ELSE 0 END`).bind(guardId,actor,snapshot.actor_added_at,input.observation_id,snapshot.source_ref,
      snapshot.channel_id,snapshot.external_key,snapshot.revision,snapshot.normalized_sha256,snapshot.normalized_json,snapshot.raw_json,snapshot.operation,
      snapshot.policy_version,at,at,input.operation_id,input.observation_id,actor,snapshot.actor_added_at),
    // Existing links and prospective publication anchors must still describe
    // the same source scope and operation before any identity writes occur.
    db.prepare(`INSERT INTO market_commit_guard(id,allowed)
      SELECT ?,CASE WHEN NOT EXISTS (
        SELECT 1 FROM market_identity_observations io WHERE io.observation_id=? AND NOT EXISTS (
          SELECT 1 FROM market_listings l JOIN market_observations anchor ON anchor.id=l.anchor_observation_id
          JOIN market_observations current ON current.id=io.observation_id
          WHERE l.id=io.publication_id AND l.operation=json_extract(current.normalized_json,'$.operation')
            AND l.operation=json_extract(anchor.normalized_json,'$.operation')
            AND anchor.source_ref=current.source_ref AND anchor.channel_id=current.channel_id
            AND anchor.external_key=current.external_key
        )
      ) AND NOT EXISTS (
        SELECT 1 FROM market_listings l JOIN market_observations anchor ON anchor.id=l.anchor_observation_id
        WHERE anchor.source_ref=? AND anchor.channel_id=? AND anchor.external_key=? AND l.operation=?
          AND json_extract(anchor.normalized_json,'$.operation') IS NOT l.operation
      ) THEN 1 ELSE 0 END`).bind(scopeGuardId,input.observation_id,snapshot.source_ref,snapshot.channel_id,
        snapshot.external_key,snapshot.operation),
    db.prepare(`INSERT INTO market_listings(id,anchor_observation_id,operation,created_at,created_by)
      SELECT ?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM market_listings l
        JOIN market_observations anchor ON anchor.id=l.anchor_observation_id
        WHERE anchor.source_ref=? AND anchor.channel_id=? AND anchor.external_key=? AND l.operation=?)
        AND NOT EXISTS (SELECT 1 FROM market_identity_receipts WHERE operation_id=?)`).bind(listingId,
      input.observation_id,snapshot.operation,at,actor,snapshot.source_ref,snapshot.channel_id,snapshot.external_key,
      snapshot.operation,input.operation_id),
    db.prepare(`INSERT INTO market_properties(id,created_at,created_by)
      SELECT ?,?,? WHERE NOT EXISTS (SELECT 1 FROM market_identity_observations WHERE observation_id=?)
        AND NOT EXISTS (SELECT 1 FROM market_identity_receipts WHERE operation_id=?)`)
      .bind(propertyId,at,actor,input.observation_id,input.operation_id),
    db.prepare(`INSERT INTO market_identity_observations(observation_id,property_id,publication_id,linked_at)
      SELECT ?,?,l.id,? FROM market_listings l JOIN market_observations anchor ON anchor.id=l.anchor_observation_id
      WHERE anchor.source_ref=? AND anchor.channel_id=? AND anchor.external_key=? AND l.operation=?
        AND NOT EXISTS (SELECT 1 FROM market_identity_observations WHERE observation_id=?)
        AND NOT EXISTS (SELECT 1 FROM market_identity_receipts WHERE operation_id=?)`)
      .bind(input.observation_id,propertyId,at,snapshot.source_ref,snapshot.channel_id,snapshot.external_key,
        snapshot.operation,input.observation_id,input.operation_id),
    db.prepare(`INSERT INTO market_identity_receipts(operation_id,observation_id,actor,actor_added_at,property_id,publication_id,created_at)
      SELECT ?,observation_id,?,?,property_id,publication_id,? FROM market_identity_observations
      WHERE observation_id=? AND NOT EXISTS (SELECT 1 FROM market_identity_receipts WHERE operation_id=?)`)
      .bind(input.operation_id,actor,snapshot.actor_added_at,at,input.observation_id,input.operation_id),
    db.prepare('SELECT property_id,publication_id FROM market_identity_receipts WHERE operation_id=?').bind(input.operation_id),
    db.prepare('DELETE FROM market_commit_guard WHERE id IN (?,?)').bind(guardId,scopeGuardId)];
  let result;
  try { result=await db.batch(statements); }
  catch (error) {
    if (/CHECK constraint failed: allowed\s*=\s*1|CHECK constraint failed: market_commit_guard/i.test(String(error?.message))) conflict();
    throw error;
  }
  const receipt=result.at(-2)?.results?.[0];
  if (!receipt) throw new Error('Identity transaction returned no receipt');
  return { property_id:receipt.property_id, publication_id:receipt.publication_id, method:'provisional' };
}

const version = n => Number.isSafeInteger(n) && n > 0;
const groupMembers = `WITH RECURSIVE members(id) AS (
  SELECT ? UNION SELECT ? UNION
  SELECT a.source_property_id FROM market_identity_aliases a JOIN members m ON a.target_property_id=m.id
)`;

// Evidence is compared in memory only and is never persisted in the identity tables.
async function scopeSnapshot(db, first, second) {
  const result=await db.prepare(`${groupMembers}
    SELECT m.id,o.revision,o.normalized_sha256,o.normalized_json,o.raw_json,o.source_ref,o.channel_id,
      o.external_key,o.page_id,s.policy_version
    FROM members m LEFT JOIN market_identity_observations io ON io.property_id=m.id
    LEFT JOIN market_observations o ON o.id=io.observation_id
    LEFT JOIN market_sources s ON s.source_ref=o.source_ref AND s.channel_id=o.channel_id`)
    .bind(first,second).all();
  const rows=result.results;
  if (!rows || rows.length < 1 || rows.length > 50 || rows.some(row =>
    !row.revision || !row.normalized_sha256 || !row.policy_version)) conflict();
  const snapshot=JSON.stringify(rows);
  if (new TextEncoder().encode(snapshot).byteLength > 524288) conflict();
  return snapshot;
}
async function adminGeneration(db, actor) {
  const row=await db.prepare('SELECT added_at FROM admins WHERE email=?').bind(actor).first();
  if (!row) conflict();
  return row.added_at;
}
async function rootOf(db, propertyId) {
  return db.prepare(`WITH RECURSIVE parents(id) AS (
      SELECT id FROM market_properties WHERE id=? UNION
      SELECT a.target_property_id FROM market_identity_aliases a JOIN parents p ON a.source_property_id=p.id
    ) SELECT p.id FROM parents p WHERE NOT EXISTS
      (SELECT 1 FROM market_identity_aliases a WHERE a.source_property_id=p.id)`)
    .bind(propertyId).first();
}
const groupAllowed = `EXISTS (${groupMembers}
  SELECT 1 WHERE (SELECT count(*) FROM members) BETWEEN 1 AND 50
    AND (SELECT count(*) FROM members)=json_array_length(?)
    AND NOT EXISTS (SELECT 1 FROM members member WHERE NOT EXISTS (
      SELECT 1 FROM market_identity_observations io
      JOIN market_observations o ON o.id=io.observation_id
      JOIN market_listings l ON l.id=io.publication_id AND l.operation=json_extract(o.normalized_json,'$.operation')
      JOIN market_observations anchor ON anchor.id=l.anchor_observation_id AND anchor.source_ref=o.source_ref
        AND anchor.channel_id=o.channel_id AND anchor.external_key=o.external_key
      JOIN market_sources s ON s.source_ref=o.source_ref AND s.channel_id=o.channel_id
      JOIN market_pages p ON p.id=o.page_id AND p.source_ref=o.source_ref AND p.channel_id=o.channel_id
      JOIN market_runs r ON r.id=p.run_id
      LEFT JOIN market_directory_manifests m ON m.revision=r.manifest_revision
      JOIN json_each(?) snap ON json_extract(snap.value,'$.id')=member.id
        AND (o.revision,o.normalized_sha256,o.normalized_json,o.raw_json,o.source_ref,o.channel_id,
          o.external_key,o.page_id,s.policy_version) =
          (json_extract(snap.value,'$.revision'),json_extract(snap.value,'$.normalized_sha256'),
           json_extract(snap.value,'$.normalized_json'),json_extract(snap.value,'$.raw_json'),
           json_extract(snap.value,'$.source_ref'),json_extract(snap.value,'$.channel_id'),
           json_extract(snap.value,'$.external_key'),json_extract(snap.value,'$.page_id'),
           json_extract(snap.value,'$.policy_version'))
      WHERE (io.property_id=member.id AND o.deleted_tombstone=0
        AND json_extract(o.normalized_json,'$.country_code')='JE'
        AND json_type(o.normalized_json,'$.territory_evidence')='text'
        AND length(trim(json_extract(o.normalized_json,'$.territory_evidence')))>0)
        AND (s.access_status IN ('allowed','manual_only') AND s.evidence_ref IS NOT NULL AND s.retention_ref IS NOT NULL)
        AND (s.reviewed_at=strftime('%Y-%m-%dT%H:%M:%fZ',s.reviewed_at,'+0 days')
          AND s.review_due_at=strftime('%Y-%m-%dT%H:%M:%fZ',s.review_due_at,'+0 days')
          AND s.reviewed_at<=? AND s.review_due_at>?
          AND s.reviewed_at<=strftime('%Y-%m-%dT%H:%M:%fZ','now')
          AND s.review_due_at>strftime('%Y-%m-%dT%H:%M:%fZ','now'))
        AND ((r.kind='own_pilot' AND s.source_kind='internal') OR
          (r.kind IN ('initial','daily') AND s.source_kind='external' AND s.directory_revision=r.manifest_revision
            AND m.status='accepted' AND m.sha256=r.manifest_sha256))
        AND NOT EXISTS (SELECT 1 FROM market_observations old WHERE old.source_ref=o.source_ref
          AND old.channel_id=o.channel_id AND old.external_key=o.external_key AND old.deleted_tombstone=1)
    )))`;
const rootIs = `EXISTS (WITH RECURSIVE parents(id) AS (
  SELECT id FROM market_properties WHERE id=? UNION
  SELECT a.target_property_id FROM market_identity_aliases a JOIN parents p ON a.source_property_id=p.id
) SELECT 1 FROM parents WHERE id=? AND NOT EXISTS
  (SELECT 1 FROM market_identity_aliases a WHERE a.source_property_id=parents.id))`;
const containsEvidence = `EXISTS (WITH RECURSIVE members(id) AS (
  SELECT ? UNION SELECT a.source_property_id FROM market_identity_aliases a JOIN members m ON a.target_property_id=m.id
) SELECT 1 FROM members JOIN market_identity_observations io ON io.property_id=members.id WHERE io.observation_id=?)`;
const groupArgs = (first, second, snapshot, at) => [first,second,snapshot,snapshot,at,at];
async function executeIdentityBatch(db, statements) {
  try { return await db.batch(statements); }
  catch (error) {
    if (/CHECK constraint failed: allowed\s*=\s*1|CHECK constraint failed: market_commit_guard/i.test(String(error?.message))) conflict();
    throw error;
  }
}
const guard = (db, guardId, actor, generation, condition, args) => db.prepare(`INSERT INTO market_commit_guard(id,allowed)
  SELECT ?,CASE WHEN EXISTS (SELECT 1 FROM admins WHERE email=? AND added_at=?) AND ${condition}
  THEN 1 ELSE 0 END`).bind(guardId,actor,generation,...args);
const dropGuards = (db, ...guardIds) => db.prepare(`DELETE FROM market_commit_guard WHERE id IN (${guardIds.map(() => '?').join(',')})`).bind(...guardIds);
const decisionByOperation = (db, operationId) => db.prepare(`SELECT * FROM market_identity_decisions WHERE operation_id=?`).bind(operationId).first();

// Replays return only the immutable event receipt. They still check the live
// membership and current access to every source in both current components.
async function replayDecision(db, existing, actor, generation, at) {
  const sourceRoot=await rootOf(db,existing.source_property_id), targetRoot=await rootOf(db,existing.target_property_id);
  if (!sourceRoot || !targetRoot) conflict();
  const snapshot=await scopeSnapshot(db,sourceRoot.id,targetRoot.id), guardId=crypto.randomUUID(),policyGuardId=crypto.randomUUID();
  const results=await executeIdentityBatch(db,[
    guard(db,policyGuardId,actor,generation,groupAllowed,groupArgs(sourceRoot.id,targetRoot.id,snapshot,at)),
    guard(db,guardId,actor,generation,`${rootIs} AND ${rootIs} AND EXISTS
      (SELECT 1 FROM market_identity_decisions WHERE id=? AND actor=? AND actor_added_at=?)`,
    [existing.source_property_id,sourceRoot.id,existing.target_property_id,targetRoot.id,existing.id,actor,generation]),
    db.prepare('SELECT id,action FROM market_identity_decisions WHERE id=?').bind(existing.id),dropGuards(db,guardId,policyGuardId)]);
  const row=results.at(-2)?.results?.[0];
  if (!row) throw new Error('Identity decision receipt missing');
  return { decision_id:row.id, action:row.action };
}

async function replayMergeIfMatching(db, existing, input, actor, generation, at) {
  if (existing.action!=='same_property' || existing.actor!==actor || existing.actor_added_at!==generation ||
      existing.source_property_id!==input.source_property_id || existing.target_property_id!==input.target_property_id ||
      existing.source_evidence_observation_id!==input.source_evidence_observation_id ||
      existing.target_evidence_observation_id!==input.target_evidence_observation_id ||
      existing.expected_source_version!==input.expected_source_version || existing.expected_target_version!==input.expected_target_version) conflict();
  return replayDecision(db,existing,actor,generation,at);
}
async function replayUndoIfMatching(db, existing, input, actor, generation, at) {
  if (existing.action!=='undo' || existing.undo_of!==input.decision_id || existing.actor!==actor ||
      existing.actor_added_at!==generation || existing.expected_source_version!==input.expected_source_version ||
      existing.expected_target_version!==input.expected_target_version) conflict();
  return replayDecision(db,existing,actor,generation,at);
}

export async function mergePropertyIdentitiesCore(env, input, actor, clock = () => new Date()) {
  if (!input || !uuid(input.source_property_id) || !uuid(input.target_property_id) ||
      !uuid(input.source_evidence_observation_id) || !uuid(input.target_evidence_observation_id) ||
      !uuid(input.operation_id) || !version(input.expected_source_version) ||
      !version(input.expected_target_version) || !actorId(actor)) bad();
  if (input.source_property_id===input.target_property_id) conflict();
  const db=primary(env.DB),at=now(clock),generation=await adminGeneration(db,actor);
  const existing=await decisionByOperation(db,input.operation_id);
  if (existing) return replayMergeIfMatching(db,existing,input,actor,generation,at);
  const source=input.source_property_id,target=input.target_property_id;
  const snapshot=await scopeSnapshot(db,source,target),guardId=crypto.randomUUID(),policyGuardId=crypto.randomUUID(),decisionId=crypto.randomUUID();
  const statements=[guard(db,policyGuardId,actor,generation,groupAllowed,groupArgs(source,target,snapshot,at)),
    guard(db,guardId,actor,generation,`EXISTS (SELECT 1 FROM market_properties WHERE id=? AND version=?)
    AND EXISTS (SELECT 1 FROM market_properties WHERE id=? AND version=?)
    AND NOT EXISTS (SELECT 1 FROM market_identity_aliases WHERE source_property_id IN (?,?))
    AND ${containsEvidence} AND ${containsEvidence}
    AND NOT EXISTS (SELECT 1 FROM market_identity_decisions WHERE operation_id=?)`,
    [source,input.expected_source_version,target,input.expected_target_version,
      source,target,source,input.source_evidence_observation_id,target,input.target_evidence_observation_id,input.operation_id]),
    db.prepare(`INSERT INTO market_identity_decisions(id,operation_id,action,source_property_id,target_property_id,
      source_evidence_observation_id,target_evidence_observation_id,expected_source_version,expected_target_version,
      actor,actor_added_at,created_at) VALUES(?,?,'same_property',?,?,?,?,?,?,?,?,?)`)
      .bind(decisionId,input.operation_id,source,target,input.source_evidence_observation_id,input.target_evidence_observation_id,
        input.expected_source_version,input.expected_target_version,actor,generation,at),
    db.prepare('INSERT INTO market_identity_aliases(source_property_id,target_property_id,decision_id) VALUES(?,?,?)')
      .bind(source,target,decisionId),
    db.prepare('UPDATE market_properties SET version=version+1 WHERE id IN (?,?)').bind(source,target),
    db.prepare('SELECT id,action FROM market_identity_decisions WHERE id=?').bind(decisionId),dropGuards(db,guardId,policyGuardId)];
  let results;
  try { results=await executeIdentityBatch(db,statements); }
  catch (error) {
    if (error instanceof HttpError && error.status===409) {
      const receipt=await decisionByOperation(db,input.operation_id);
      if (receipt) return replayMergeIfMatching(db,receipt,input,actor,generation,at);
    }
    throw error;
  }
  const row=results.at(-2)?.results?.[0];
  if (!row) throw new Error('Identity decision receipt missing');
  return { decision_id:row.id,action:row.action };
}

export async function undoPropertyIdentityDecisionCore(env, input, actor, clock = () => new Date()) {
  if (!input || !uuid(input.decision_id) || !uuid(input.operation_id) || !version(input.expected_source_version) ||
      !version(input.expected_target_version) || !actorId(actor)) bad();
  const db=primary(env.DB),at=now(clock),generation=await adminGeneration(db,actor);
  const existing=await decisionByOperation(db,input.operation_id);
  if (existing) return replayUndoIfMatching(db,existing,input,actor,generation,at);
  const original=await db.prepare("SELECT * FROM market_identity_decisions WHERE id=? AND action='same_property'")
    .bind(input.decision_id).first();
  if (!original) conflict();
  const source=original.source_property_id,target=original.target_property_id;
  const snapshot=await scopeSnapshot(db,source,target),guardId=crypto.randomUUID(),policyGuardId=crypto.randomUUID(),decisionId=crypto.randomUUID();
  const statements=[guard(db,policyGuardId,actor,generation,groupAllowed,groupArgs(source,target,snapshot,at)),
    guard(db,guardId,actor,generation,`EXISTS (SELECT 1 FROM market_properties WHERE id=? AND version=?)
    AND EXISTS (SELECT 1 FROM market_properties WHERE id=? AND version=?)
    AND EXISTS (SELECT 1 FROM market_identity_aliases WHERE source_property_id=? AND target_property_id=? AND decision_id=?)
    AND NOT EXISTS (SELECT 1 FROM market_identity_aliases WHERE source_property_id=?)
    AND NOT EXISTS (SELECT 1 FROM market_identity_decisions WHERE undo_of=? OR operation_id=?)`,
    [source,input.expected_source_version,target,input.expected_target_version,
      source,target,input.decision_id,target,input.decision_id,input.operation_id]),
    db.prepare(`INSERT INTO market_identity_decisions(id,operation_id,action,source_property_id,target_property_id,
      source_evidence_observation_id,target_evidence_observation_id,expected_source_version,expected_target_version,
      undo_of,actor,actor_added_at,created_at) VALUES(?,?,'undo',?,?,?,?,?,?,?,?,?,?)`)
      .bind(decisionId,input.operation_id,source,target,original.source_evidence_observation_id,original.target_evidence_observation_id,
        input.expected_source_version,input.expected_target_version,input.decision_id,actor,generation,at),
    db.prepare('DELETE FROM market_identity_aliases WHERE source_property_id=? AND target_property_id=? AND decision_id=?')
      .bind(source,target,input.decision_id),
    db.prepare('UPDATE market_properties SET version=version+1 WHERE id IN (?,?)').bind(source,target),
    db.prepare('SELECT id,action FROM market_identity_decisions WHERE id=?').bind(decisionId),dropGuards(db,guardId,policyGuardId)];
  let results;
  try { results=await executeIdentityBatch(db,statements); }
  catch (error) {
    if (error instanceof HttpError && error.status===409) {
      const receipt=await decisionByOperation(db,input.operation_id);
      if (receipt) return replayUndoIfMatching(db,receipt,input,actor,generation,at);
    }
    throw error;
  }
  const row=results.at(-2)?.results?.[0];
  if (!row) throw new Error('Identity undo receipt missing');
  return { decision_id:row.id,action:row.action };
}

export async function readPropertyIdentityCore(env, input, actor, clock = () => new Date()) {
  if (!input || !uuid(input.property_id) || !actorId(actor)) bad();
  const db=primary(env.DB),at=now(clock),generation=await adminGeneration(db,actor),root=await rootOf(db,input.property_id);
  if (!root) conflict();
  const snapshot=await scopeSnapshot(db,root.id,root.id),guardId=crypto.randomUUID(),policyGuardId=crypto.randomUUID();
  const results=await executeIdentityBatch(db,[
    guard(db,policyGuardId,actor,generation,groupAllowed,groupArgs(root.id,root.id,snapshot,at)),
    guard(db,guardId,actor,generation,rootIs,[input.property_id,root.id]),
    db.prepare('SELECT id,version FROM market_properties WHERE id=?').bind(input.property_id),dropGuards(db,guardId,policyGuardId)]);
  const row=results.at(-2)?.results?.[0];
  if (!row) throw new Error('Identity read missing');
  return {property_id:row.id,version:row.version,root_property_id:root.id};
}

// Candidate records below require a *proposed*, unapplied schema. They are not
// human identity decisions and must never be used to authorize a merge.
const candidateKeys = new Set(['left_property_id','right_property_id','left_evidence_observation_id',
  'right_evidence_observation_id','expected_left_version','expected_right_version',
  'expected_left_evidence_revision','expected_right_evidence_revision','signal','operation_id']);
const candidateSignals = new Set(['shared_address','shared_reference','manual_review']);
function candidateInput(input) {
  if (!input || typeof input!=='object' || Array.isArray(input) ||
      Object.keys(input).some(k=>!candidateKeys.has(k)) || !uuid(input.left_property_id) ||
      !uuid(input.right_property_id) || !uuid(input.left_evidence_observation_id) ||
      !uuid(input.right_evidence_observation_id) || !uuid(input.operation_id) ||
      !version(input.expected_left_version) || !version(input.expected_right_version) ||
      !version(input.expected_left_evidence_revision) || !version(input.expected_right_evidence_revision) ||
      !candidateSignals.has(input.signal)) bad();
  if (input.left_property_id===input.right_property_id) conflict();
  const first={property:input.left_property_id,evidence:input.left_evidence_observation_id,
    version:input.expected_left_version,evidenceVersion:input.expected_left_evidence_revision};
  const second={property:input.right_property_id,evidence:input.right_evidence_observation_id,
    version:input.expected_right_version,evidenceVersion:input.expected_right_evidence_revision};
  return {left:first.property<second.property?first:second,right:first.property<second.property?second:first,
    signal:input.signal,operationId:input.operation_id};
}
const candidateSignature = alias => `${alias}.left_property_id=? AND ${alias}.right_property_id=?
  AND ${alias}.left_evidence_observation_id=? AND ${alias}.right_evidence_observation_id=?
  AND ${alias}.expected_left_version=? AND ${alias}.expected_right_version=?
  AND ${alias}.expected_left_evidence_revision=? AND ${alias}.expected_right_evidence_revision=? AND ${alias}.signal=?`;
const candidateValues = x => [x.left.property,x.right.property,x.left.evidence,x.right.evidence,
  x.left.version,x.right.version,x.left.evidenceVersion,x.right.evidenceVersion,x.signal];

export async function proposePropertyIdentityCore(env,input,actor,clock = () => new Date()) {
  const x=candidateInput(input);
  if (!actorId(actor)) bad();
  const db=primary(env.DB),at=now(clock),generation=await adminGeneration(db,actor);
  const left=x.left.property,right=x.right.property,snapshot=await scopeSnapshot(db,left,right);
  const policyGuardId=crypto.randomUUID(),stateGuardId=crypto.randomUUID(),candidateId=crypto.randomUUID();
  const signature=candidateSignature('c'),values=candidateValues(x);
  const statements=[guard(db,policyGuardId,actor,generation,groupAllowed,groupArgs(left,right,snapshot,at)),
    guard(db,stateGuardId,actor,generation,`EXISTS (SELECT 1 FROM market_properties WHERE id=? AND version=?)
      AND EXISTS (SELECT 1 FROM market_properties WHERE id=? AND version=?)
      AND NOT EXISTS (SELECT 1 FROM market_identity_aliases WHERE source_property_id IN (?,?))
      AND ${containsEvidence} AND ${containsEvidence}
      AND EXISTS (SELECT 1 FROM market_observations WHERE id=? AND revision=?)
      AND EXISTS (SELECT 1 FROM market_observations WHERE id=? AND revision=?)
      AND NOT EXISTS (SELECT 1 FROM market_identity_candidates c WHERE c.left_property_id=? AND c.right_property_id=?
        AND NOT (${signature}))
      AND NOT EXISTS (SELECT 1 FROM market_identity_candidate_receipts r
        LEFT JOIN market_identity_candidates c ON c.id=r.candidate_id WHERE r.operation_id=?
          AND (r.actor<>? OR r.actor_added_at<>? OR c.id IS NULL OR NOT (${signature})))
      AND NOT EXISTS (SELECT 1 FROM market_identity_receipts WHERE operation_id=?)
      AND NOT EXISTS (SELECT 1 FROM market_identity_decisions WHERE operation_id=?)`,
    [left,x.left.version,right,x.right.version,left,right,left,x.left.evidence,right,x.right.evidence,
      x.left.evidence,x.left.evidenceVersion,x.right.evidence,x.right.evidenceVersion,left,right,...values,
      x.operationId,actor,generation,...values,x.operationId,x.operationId]),
    db.prepare(`INSERT INTO market_identity_candidates(id,left_property_id,right_property_id,left_evidence_observation_id,
      right_evidence_observation_id,expected_left_version,expected_right_version,expected_left_evidence_revision,
      expected_right_evidence_revision,signal,created_at,created_by)
      SELECT ?,?,?,?,?,?,?,?,?,?,?,? WHERE NOT EXISTS
        (SELECT 1 FROM market_identity_candidates WHERE left_property_id=? AND right_property_id=?)`)
      .bind(candidateId,...values,at,actor,left,right),
    db.prepare(`INSERT INTO market_identity_candidate_receipts(operation_id,candidate_id,actor,actor_added_at,created_at)
      SELECT ?,c.id,?,?,? FROM market_identity_candidates c WHERE ${signature}
        AND NOT EXISTS (SELECT 1 FROM market_identity_candidate_receipts WHERE operation_id=?)`)
      .bind(x.operationId,actor,generation,at,...values,x.operationId),
    db.prepare(`SELECT c.id FROM market_identity_candidate_receipts r JOIN market_identity_candidates c ON c.id=r.candidate_id
      WHERE r.operation_id=? AND r.actor=? AND r.actor_added_at=?`).bind(x.operationId,actor,generation),
    dropGuards(db,policyGuardId,stateGuardId)];
  const results=await executeIdentityBatch(db,statements), row=results.at(-2)?.results?.[0];
  if (!row) throw new Error('Identity candidate receipt missing');
  return {candidate_id:row.id,status:'pending_review',evidence_state:'revalidate_before_decision'};
}

// This examines only caller-supplied synthetic evidence. There is not yet a
// trusted match-to-market-property bridge, so even no conflict is unverified.
export function inspectHumanMatchConflictsCore(input) {
  if (!input || typeof input!=='object' || Array.isArray(input) ||
      Object.keys(input).some(k=>k!=='left'&&k!=='right') ||
      !Array.isArray(input.left) || !Array.isArray(input.right) || input.left.length>50 || input.right.length>50) bad();
  const states=new Map();
  for (const row of [...input.left,...input.right]) {
    if (!row || typeof row!=='object' || Array.isArray(row) || Object.keys(row).length!==3 ||
        Object.keys(row).some(k=>!['search_id','operation','status'].includes(k)) ||
        !Number.isSafeInteger(row.search_id) || row.search_id<1 || !['sale','rent','business'].includes(row.operation) ||
        !['found','shortlisted','rejected'].includes(row.status)) bad();
    if (row.status==='found') continue;
    const key=`${row.search_id}:${row.operation}`,bit=row.status==='shortlisted'?1:2;
    states.set(key,(states.get(key)??0)|bit);
  }
  const count=[...states.values()].filter(state=>state===3).length;
  return {status:count?'conflict_in_supplied_evidence':'unverified',conflict_count:count,can_auto_merge:false};
}
