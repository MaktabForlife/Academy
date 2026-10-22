-- Phase 2: accepted references in the existing database. No data is moved or
-- overwritten. Only the feature Worker enables this boundary until cutover.
CREATE TABLE setup_batches (
  batch_id TEXT PRIMARY KEY,
  actor_account_id TEXT NOT NULL,
  scope_keys_json TEXT NOT NULL CHECK(json_valid(scope_keys_json)),
  source_version INTEGER NOT NULL,
  expected_head TEXT,
  digest TEXT NOT NULL,
  manifest_json TEXT NOT NULL CHECK(json_valid(manifest_json)),
  created_at TEXT NOT NULL,
  accepted_head TEXT
);
CREATE TABLE setup_components (
  component_id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL REFERENCES setup_batches(batch_id),
  table_name TEXT NOT NULL,
  scope_key TEXT NOT NULL COLLATE NOCASE,
  rows_json TEXT NOT NULL CHECK(json_valid(rows_json) AND json_type(rows_json)='array' AND length(CAST(rows_json AS BLOB))<=1500000),
  row_count INTEGER NOT NULL CHECK(row_count=json_array_length(rows_json)),
  digest TEXT NOT NULL
);
CREATE INDEX setup_components_batch ON setup_components(batch_id,table_name,scope_key);
CREATE TABLE setup_heads (
  head_id TEXT PRIMARY KEY,
  parent_head TEXT REFERENCES setup_heads(head_id),
  batch_id TEXT NOT NULL UNIQUE REFERENCES setup_batches(batch_id),
  accepted_at TEXT NOT NULL,
  accepted_by TEXT NOT NULL
);
CREATE TABLE setup_head_components (
  head_id TEXT NOT NULL REFERENCES setup_heads(head_id),
  table_name TEXT NOT NULL,
  scope_key TEXT NOT NULL COLLATE NOCASE,
  component_id TEXT NOT NULL REFERENCES setup_components(component_id),
  PRIMARY KEY(head_id,table_name,scope_key)
);
CREATE INDEX setup_vector_component ON setup_head_components(component_id,head_id);
CREATE TABLE setup_head_state (
  singleton INTEGER PRIMARY KEY CHECK(singleton=1),
  head_id TEXT NOT NULL REFERENCES setup_heads(head_id)
);
CREATE TRIGGER setup_component_immutable_update BEFORE UPDATE ON setup_components BEGIN SELECT RAISE(ABORT,'accepted_setup_component_immutable'); END;
CREATE TRIGGER setup_component_immutable_delete BEFORE DELETE ON setup_components BEGIN SELECT RAISE(ABORT,'accepted_setup_component_immutable'); END;
CREATE TRIGGER setup_head_immutable_update BEFORE UPDATE ON setup_heads BEGIN SELECT RAISE(ABORT,'accepted_setup_head_immutable'); END;
CREATE TRIGGER setup_head_immutable_delete BEFORE DELETE ON setup_heads BEGIN SELECT RAISE(ABORT,'accepted_setup_head_immutable'); END;
CREATE TRIGGER setup_vector_immutable_update BEFORE UPDATE ON setup_head_components BEGIN SELECT RAISE(ABORT,'accepted_setup_vector_immutable'); END;
CREATE TRIGGER setup_vector_immutable_delete BEFORE DELETE ON setup_head_components BEGIN SELECT RAISE(ABORT,'accepted_setup_vector_immutable'); END;
