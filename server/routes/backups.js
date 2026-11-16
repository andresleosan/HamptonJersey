import { json } from "../http.js";
import { currentAdmin } from "../auth.js";
import { listOpenWritePermits, reconcileWritePermit } from "../backup-write-gate.js";

// PRE-14: mounted by server/api.js only when BACKUP_READY is '1', and outside the write gate, so a person can close an
// orphan permit while the weekly backup is waiting for it. The reviewer is the admin of this request's session.
const list = async ({ env }) => json({ permits: await listOpenWritePermits(env) });
const reconcile = async ({ request, env, params: [id] }) => {
  return json({ result: await reconcileWritePermit(env, { id, proof: { kind: "authorized_review", request }, currentAdmin }) });
};

export const BACKUP_ADMIN = /^\/admin\/backups\//;
export default [
  ["GET", /^\/admin\/backups\/permits$/, list, true],
  ["POST", /^\/admin\/backups\/permits\/([0-9a-f-]{36})\/reconcile$/, reconcile, true],
];
