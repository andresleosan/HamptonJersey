import { json, fail } from "../http.js";
import { currentAdmin } from "../auth.js";
import { listOpenWritePermits, reconcileWritePermit } from "../backup-write-gate.js";

// PRE-14: mounted by server/api.js only when BACKUP_READY is '1', and outside the write gate, so a person can close an
// orphan permit while the weekly backup is waiting for it. The reviewer is the admin of this request's session.
const list = async ({ env }) => json({ permits: await listOpenWritePermits(env) });
const reconcile = async ({ request, env, params: [id] }) => {
  return json({ result: await reconcileWritePermit(env, { id, proof: { kind: "authorized_review", request }, currentAdmin }) });
};

// GET /admin/backups/:id: the summary the Inbox notice links to. Never keys, hashes, the seal or the bucket.
const run = async ({ env, params: [id] }) => {
  const row = await env.DB.prepare(`SELECT id, week_start, status, attempt, reason_code, started_at, sealed_at, expires_at,
    recovery_hold FROM backup_runs WHERE id = ?1`).bind(id).first();
  if (!row) fail(404, "Backup not found");
  return json({ run: row });
};

export const BACKUP_ADMIN = /^\/admin\/backups\//;
export default [
  ["GET", /^\/admin\/backups\/permits$/, list, true],
  ["GET", /^\/admin\/backups\/([0-9a-f-]{36})$/, run, true],
  ["POST", /^\/admin\/backups\/permits\/([0-9a-f-]{36})\/reconcile$/, reconcile, true],
];
