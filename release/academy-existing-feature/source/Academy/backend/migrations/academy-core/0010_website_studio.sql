-- Website bodies and image bytes live in private Studio R2. No legacy data changes.
CREATE TABLE website_studio_state(
 website_id TEXT PRIMARY KEY,
 activity_key TEXT NOT NULL COLLATE NOCASE REFERENCES activities(activity_key),
 surah_id TEXT,
 revision INTEGER NOT NULL CHECK(revision>=0),
 draft_key TEXT NOT NULL,draft_sha256 TEXT NOT NULL,draft_bytes INTEGER NOT NULL,
 published_key TEXT,published_sha256 TEXT,published_revision INTEGER,
 enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN(0,1)),
 source_kind TEXT NOT NULL DEFAULT 'TEMPLATE',
 migrated_at TEXT NOT NULL,updated_at TEXT NOT NULL,updated_by TEXT NOT NULL REFERENCES actor_refs(account_id)
);
CREATE INDEX website_studio_scope ON website_studio_state(activity_key,website_id);
CREATE TABLE website_studio_assets(
 asset_id TEXT PRIMARY KEY,website_id TEXT NOT NULL REFERENCES website_studio_state(website_id),
 source TEXT NOT NULL CHECK(source IN('STUDIO','ACADEMY')),
 object_key TEXT,sha256 TEXT,filename TEXT NOT NULL,mime_type TEXT NOT NULL,byte_size INTEGER NOT NULL,
 lesson_id TEXT,native_asset_id TEXT,created_at TEXT NOT NULL,created_by TEXT NOT NULL REFERENCES actor_refs(account_id)
);
CREATE INDEX website_studio_asset_scope ON website_studio_assets(website_id,asset_id);
CREATE TABLE website_studio_operations(
 website_id TEXT NOT NULL,operation_id TEXT NOT NULL,payload_sha256 TEXT NOT NULL,
 actor_account_id TEXT NOT NULL REFERENCES actor_refs(account_id),result_json TEXT NOT NULL CHECK(json_valid(result_json)),
 completed_at TEXT NOT NULL,PRIMARY KEY(website_id,operation_id)
);
CREATE TRIGGER website_studio_fence_insert BEFORE INSERT ON website_studio_state WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;
CREATE TRIGGER website_studio_fence_update BEFORE UPDATE ON website_studio_state WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;
CREATE TRIGGER website_studio_epoch_insert AFTER INSERT ON website_studio_state BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;
CREATE TRIGGER website_studio_epoch_update AFTER UPDATE ON website_studio_state BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;
CREATE TRIGGER website_studio_assets_fence_insert BEFORE INSERT ON website_studio_assets WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;
CREATE TRIGGER website_studio_assets_epoch_insert AFTER INSERT ON website_studio_assets BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;
