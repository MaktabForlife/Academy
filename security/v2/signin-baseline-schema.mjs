// Install only in the explicit Stage 2 migration. Existing streams and snapshots are retained.
export const signInBaselineSchemaSQL = `
CREATE TABLE IF NOT EXISTS jwt_v2_signin_baseline_jobs (
 ordinal INTEGER PRIMARY KEY AUTOINCREMENT,
 operation_id TEXT NOT NULL,
 recipient TEXT NOT NULL CHECK(recipient IN('studio','hifz')),
 sid TEXT NOT NULL, sub TEXT NOT NULL, ce INTEGER NOT NULL, ae INTEGER NOT NULL,
 generation TEXT NOT NULL, expires_at INTEGER NOT NULL,
 attempts INTEGER NOT NULL DEFAULT 0, lease_until INTEGER NOT NULL DEFAULT 0,
 proof TEXT, receipt TEXT, status TEXT NOT NULL DEFAULT 'PENDING'
  CHECK(status IN('PENDING','APPLIED','REUSED','INELIGIBLE')),
 UNIQUE(operation_id,recipient)
);
CREATE INDEX IF NOT EXISTS jwt_v2_signin_baseline_reuse
 ON jwt_v2_signin_baseline_jobs(sub,recipient,ce,ae,generation,status,ordinal DESC);
CREATE INDEX IF NOT EXISTS jwt_v2_signin_source_revision ON jwt_v2_authority_changes(sub,source_table,change_id DESC);
CREATE INDEX IF NOT EXISTS jwt_v2_signin_pending_source
 ON jwt_v2_native_outbox(target_app,change_id) WHERE event_json IS NULL;
`;
