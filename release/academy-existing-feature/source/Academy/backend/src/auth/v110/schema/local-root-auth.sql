-- LOCAL INTEGRATION SOURCE DRAFT. Fresh isolated synthetic databases ONLY.
-- No application imports/installs this DDL; final native recipe review required.
-- Not a hosted migration or existing-store upgrade.

-- Owning source provenance: tests/fixtures/jwt-v110-auth-only.sql
PRAGMA foreign_keys = ON;
CREATE TABLE jwt_v110_accounts (
 account_id TEXT PRIMARY KEY, credential_epoch INTEGER NOT NULL,
 permission_version INTEGER NOT NULL, active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE jwt_v110_browser_heads (
 browser_id TEXT PRIMARY KEY, generation INTEGER NOT NULL, last_operation_id TEXT NOT NULL DEFAULT ''
);
CREATE TABLE jwt_v110_parent_tombstones (
 parent_session_id TEXT PRIMARY KEY, expires_at_s INTEGER NOT NULL
);
CREATE TABLE jwt_v110_families (
 family_id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES jwt_v110_accounts(account_id),
 parent_session_id TEXT NOT NULL, browser_id TEXT NOT NULL REFERENCES jwt_v110_browser_heads(browser_id),
 browser_generation INTEGER NOT NULL, credential_epoch INTEGER NOT NULL, permission_version INTEGER NOT NULL,
 unlock_generation INTEGER NOT NULL DEFAULT 0, refresh_generation INTEGER NOT NULL DEFAULT 0,
 refresh_fp TEXT NOT NULL UNIQUE, previous_fp TEXT,
 original_signed_in_at_s INTEGER NOT NULL, original_expires_at_s INTEGER NOT NULL,
 last_fg_refresh_s INTEGER NOT NULL,
 rotated_at_s INTEGER NOT NULL, rotation_operation_id TEXT NOT NULL DEFAULT '',
 revoked INTEGER NOT NULL DEFAULT 0,
 CHECK(typeof(original_signed_in_at_s)='integer' AND typeof(original_expires_at_s)='integer' AND original_signed_in_at_s>=0 AND original_expires_at_s>original_signed_in_at_s AND original_expires_at_s-original_signed_in_at_s<=604800)
);
CREATE INDEX jwt_v110_previous_fp ON jwt_v110_families(previous_fp);
CREATE TABLE jwt_v110_security_audit (
 operation_id TEXT PRIMARY KEY, family_id TEXT NOT NULL,
 event_type TEXT NOT NULL, occurred_at_s INTEGER NOT NULL
);

CREATE TRIGGER jwt_v110_family_binding_immutable BEFORE UPDATE OF account_id,parent_session_id,browser_id,browser_generation,credential_epoch,original_signed_in_at_s,original_expires_at_s ON jwt_v110_families
WHEN NEW.account_id IS NOT OLD.account_id OR NEW.parent_session_id IS NOT OLD.parent_session_id OR NEW.browser_id IS NOT OLD.browser_id OR NEW.browser_generation IS NOT OLD.browser_generation OR NEW.credential_epoch IS NOT OLD.credential_epoch OR NEW.original_signed_in_at_s IS NOT OLD.original_signed_in_at_s OR NEW.original_expires_at_s IS NOT OLD.original_expires_at_s
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_REFRESH_FAMILY_BINDING'); END;

CREATE INDEX jwt_v110_family_account_expiry ON jwt_v110_families(account_id,original_expires_at_s);

-- Owning source provenance: tests/fixtures/jwt-v110-master-account-outbox.sql
CREATE TABLE jwt_v110_master_streams (
 target_app TEXT NOT NULL CHECK(target_app IN('studio','hifz')),
 kind TEXT NOT NULL CHECK(kind IN('authority-updated','account-security')),
 parent_account_id TEXT NOT NULL,
 version INTEGER NOT NULL DEFAULT 0 CHECK(typeof(version)='integer' AND version BETWEEN 0 AND 9007199254740991),
 PRIMARY KEY(target_app,kind,parent_account_id)
);
CREATE TABLE jwt_v110_master_outbox (
 event_id TEXT PRIMARY KEY,target_app TEXT NOT NULL,kind TEXT NOT NULL,parent_account_id TEXT NOT NULL,
 version INTEGER NOT NULL CHECK(typeof(version)='integer' AND version BETWEEN 1 AND 9007199254740991),operation_id TEXT NOT NULL,issued_at_s INTEGER NOT NULL,retain_until_s INTEGER NOT NULL,
 facts_json TEXT NOT NULL CHECK(length(facts_json)<=1024),
 wire_json TEXT,payload_digest TEXT,
 attempts INTEGER NOT NULL DEFAULT 0,next_attempt_at_s INTEGER NOT NULL DEFAULT 0,delivered_at_s INTEGER,
 UNIQUE(target_app,kind,parent_account_id,version),
 UNIQUE(target_app,kind,parent_account_id,operation_id),
 FOREIGN KEY(target_app,kind,parent_account_id) REFERENCES jwt_v110_master_streams(target_app,kind,parent_account_id),
 CHECK(retain_until_s>issued_at_s AND retain_until_s-issued_at_s<=604800),
 CHECK((wire_json IS NULL AND payload_digest IS NULL) OR (wire_json IS NOT NULL AND length(payload_digest)=64))
);
CREATE INDEX jwt_v110_master_pending ON jwt_v110_master_outbox(delivered_at_s,next_attempt_at_s,target_app,kind,parent_account_id,version);
CREATE TRIGGER jwt_v110_master_facts_immutable BEFORE UPDATE OF event_id,target_app,kind,parent_account_id,version,operation_id,issued_at_s,retain_until_s,facts_json ON jwt_v110_master_outbox
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_MASTER_EVENT'); END;
CREATE TRIGGER jwt_v110_master_wire_immutable BEFORE UPDATE OF wire_json,payload_digest ON jwt_v110_master_outbox
WHEN OLD.wire_json IS NOT NULL AND (NEW.wire_json IS NOT OLD.wire_json OR NEW.payload_digest IS NOT OLD.payload_digest)
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_MASTER_WIRE'); END;

-- Owning source provenance: tests/fixtures/jwt-v110-master-lifecycle-outbox.sql
CREATE TABLE jwt_v110_master_lifecycle_streams (
 target_app TEXT NOT NULL CHECK(target_app IN('studio','hifz')),
 kind TEXT NOT NULL CHECK(kind IN('parent-revoked','browser-superseded')),
 subject_id TEXT NOT NULL,
 version INTEGER NOT NULL DEFAULT 0 CHECK(typeof(version)='integer' AND version BETWEEN 0 AND 9007199254740991),
 PRIMARY KEY(target_app,kind,subject_id)
);
CREATE TABLE jwt_v110_master_lifecycle_outbox (
 event_id TEXT PRIMARY KEY,target_app TEXT NOT NULL,kind TEXT NOT NULL,subject_id TEXT NOT NULL,parent_account_id TEXT NOT NULL,
 version INTEGER NOT NULL CHECK(typeof(version)='integer' AND version BETWEEN 1 AND 9007199254740991),
 operation_id TEXT NOT NULL,issued_at_s INTEGER NOT NULL,retain_until_s INTEGER NOT NULL,
 facts_json TEXT NOT NULL CHECK(length(facts_json)<=1024),
 wire_json TEXT,payload_digest TEXT,attempts INTEGER NOT NULL DEFAULT 0,next_attempt_at_s INTEGER NOT NULL DEFAULT 0,delivered_at_s INTEGER,
 UNIQUE(target_app,kind,subject_id,version),UNIQUE(target_app,kind,subject_id,operation_id),
 FOREIGN KEY(target_app,kind,subject_id) REFERENCES jwt_v110_master_lifecycle_streams(target_app,kind,subject_id),
 CHECK(retain_until_s>issued_at_s AND retain_until_s-issued_at_s<=604800),
 CHECK((wire_json IS NULL AND payload_digest IS NULL) OR (wire_json IS NOT NULL AND length(payload_digest)=64))
);
CREATE INDEX jwt_v110_master_lifecycle_pending ON jwt_v110_master_lifecycle_outbox(delivered_at_s,next_attempt_at_s,target_app,kind,subject_id,version);
CREATE TRIGGER jwt_v110_master_lifecycle_facts_immutable BEFORE UPDATE OF event_id,target_app,kind,subject_id,parent_account_id,version,operation_id,issued_at_s,retain_until_s,facts_json ON jwt_v110_master_lifecycle_outbox
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_MASTER_LIFECYCLE'); END;
CREATE TRIGGER jwt_v110_master_lifecycle_wire_immutable BEFORE UPDATE OF wire_json,payload_digest ON jwt_v110_master_lifecycle_outbox
WHEN OLD.wire_json IS NOT NULL AND (NEW.wire_json IS NOT OLD.wire_json OR NEW.payload_digest IS NOT OLD.payload_digest)
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_MASTER_LIFECYCLE_WIRE'); END;

-- Owning source provenance: tests/fixtures/jwt-v110-root-child-pin-proofs.sql
CREATE TABLE jwt_v110_root_child_pin_proofs (
 app TEXT NOT NULL CHECK(app IN('studio','hifz')),intent_id TEXT NOT NULL,
 intent_digest TEXT NOT NULL CHECK(length(intent_digest)=64),
 parent_family_id TEXT NOT NULL REFERENCES jwt_v110_families(family_id),
 parent_account_id TEXT NOT NULL,
 code_hash TEXT NOT NULL UNIQUE CHECK(length(code_hash)=64),
 reply_json TEXT NOT NULL CHECK(length(reply_json)<=6144),
 reply_signature TEXT NOT NULL CHECK(length(reply_signature)=64),
 reply_digest TEXT NOT NULL CHECK(length(reply_digest)=64),
 pin_verified_at_s INTEGER NOT NULL,issued_at_s INTEGER NOT NULL,expires_at_s INTEGER NOT NULL,
 delivery_confirmed_at_s INTEGER,
 PRIMARY KEY(app,intent_id),
 CHECK(pin_verified_at_s<=issued_at_s AND issued_at_s-pin_verified_at_s<=5),
 CHECK(expires_at_s>issued_at_s AND expires_at_s-pin_verified_at_s<=60)
);
CREATE TRIGGER jwt_v110_root_child_pin_immutable BEFORE UPDATE OF app,intent_id,intent_digest,parent_family_id,parent_account_id,code_hash,reply_json,reply_signature,reply_digest,pin_verified_at_s,issued_at_s,expires_at_s ON jwt_v110_root_child_pin_proofs
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_ROOT_CHILD_PIN_PROOF'); END;
