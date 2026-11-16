-- PRE-14 · Task 1: control de la copia semanal y compuerta de escrituras (spec TP-01 «Estado y contratos» y
-- complemento de tanda 8 §4). Aditiva: tres tablas nuevas, un índice y la fila fija de la compuerta, que nace
-- abierta. Sin cuerpos, claves, URLs firmadas ni rutas de archivos: solo UUID, hashes, fechas y estados.
-- No hace nada mientras BACKUP_READY = "0".
CREATE TABLE backup_runs (
  id TEXT PRIMARY KEY CHECK (length(id) = 36),
  week_start TEXT NOT NULL UNIQUE,
  policy_hash TEXT NOT NULL CHECK (length(policy_hash) = 64),
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','draining','capturing','sealed','complete','failed','unknown')),
  attempt INTEGER NOT NULL DEFAULT 0 CHECK (attempt BETWEEN 0 AND 3),
  attempt_id TEXT CHECK (attempt_id IS NULL OR length(attempt_id) = 36),
  fence_epoch INTEGER,
  started_at TEXT,
  expires_at TEXT,
  -- Sello durable (tanda 8 §4): lo que hace falta para reconstruir el certificado canónico sin otra exportación.
  sealed_at TEXT,
  format TEXT CHECK (format IS NULL OR format = 'HamptonBackupV1'),
  cutoff TEXT,
  manifest_key TEXT CHECK (manifest_key IS NULL OR length(manifest_key) = 36),
  manifest_cipher_hash TEXT CHECK (manifest_cipher_hash IS NULL OR length(manifest_cipher_hash) = 64),
  inventory_key TEXT CHECK (inventory_key IS NULL OR length(inventory_key) = 36),
  inventory_sha256 TEXT CHECK (inventory_sha256 IS NULL OR length(inventory_sha256) = 64),
  signing_key_id TEXT,
  recovery_key_id TEXT,
  reason_code TEXT CHECK (reason_code IS NULL OR length(reason_code) <= 64),
  version INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE backup_write_gate (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  epoch INTEGER NOT NULL DEFAULT 0,
  state TEXT NOT NULL DEFAULT 'open' CHECK (state IN ('open','closed')),
  run_id TEXT,
  deadline TEXT,
  updated_at TEXT NOT NULL,
  CHECK ((state = 'open' AND run_id IS NULL AND deadline IS NULL) OR (state = 'closed' AND run_id IS NOT NULL AND deadline IS NOT NULL))
);
INSERT INTO backup_write_gate (id, epoch, state, updated_at) VALUES (1, 0, 'open', '2026-11-16T00:00:00.000Z');

-- Un permiso por operación que escribe en D1 o R2. Solo se cierra al terminar, al fallar su propia admisión o por
-- conciliación autorizada; nunca por antigüedad.
CREATE TABLE backup_writers (
  id TEXT PRIMARY KEY CHECK (length(id) = 36),
  epoch INTEGER NOT NULL,
  operation TEXT NOT NULL CHECK (length(operation) BETWEEN 1 AND 80),
  started_at TEXT NOT NULL,
  closed_at TEXT,
  close_reason TEXT CHECK (close_reason IS NULL OR close_reason IN ('finished','reconciled','admission_failed')),
  reconciled_by TEXT,
  CHECK ((closed_at IS NULL) = (close_reason IS NULL))
);
CREATE INDEX backup_writers_open ON backup_writers(epoch) WHERE closed_at IS NULL;
-- drainState busca permisos del epoch cerrado, también cerrados: sin este índice recorrería la tabla entera.
CREATE INDEX backup_writers_epoch ON backup_writers(epoch);
