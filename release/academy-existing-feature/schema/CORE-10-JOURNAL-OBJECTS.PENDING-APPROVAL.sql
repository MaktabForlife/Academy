-- ROOT EXACT NECESSARY JOURNAL CANDIDATE: existing JWT Feature Core ONLY.
-- No existing table/row/credential/grant change, no Admin/legacy/production action.
-- Optional existing-family performance index is EXCLUDED.
-- Do not execute without exact Root worker selection and absent-object metadata check.

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
