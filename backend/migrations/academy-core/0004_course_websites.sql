-- Additive core course website upgrade. Preserve all existing records and accepted heads.
CREATE TABLE course_website_documents(
 activity_key TEXT PRIMARY KEY COLLATE NOCASE REFERENCES activities(activity_key),
 document_json TEXT  CHECK(document_json IS NULL OR json_valid(document_json)),
 schema_version INTEGER  DEFAULT 1,
 source_kind TEXT  DEFAULT 'TEMPLATE' CHECK(source_kind IS NULL OR source_kind IN('TEMPLATE','KAHF')),
 revision INTEGER  DEFAULT 1,
 enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN(0,1)),
 updated_at TEXT ,
 updated_by TEXT NOT NULL REFERENCES actor_refs(account_id));

CREATE TABLE course_website_assets(
 asset_id TEXT PRIMARY KEY,
 activity_key TEXT NOT NULL COLLATE NOCASE REFERENCES activities(activity_key),
 object_key TEXT  UNIQUE,
 filename TEXT ,
 mime_type TEXT  CHECK(mime_type IS NULL OR mime_type IN('application/pdf','image/png','image/jpeg','image/webp')),
 byte_size INTEGER  CHECK(byte_size IS NULL OR byte_size BETWEEN 1 AND 16777216),
 sha256 TEXT ,
 created_at TEXT ,
 created_by TEXT NOT NULL REFERENCES actor_refs(account_id));

CREATE INDEX course_website_assets_scope ON course_website_assets(activity_key,asset_id);

CREATE TRIGGER split_fence_course_website_documents_insert BEFORE INSERT ON "course_website_documents" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_epoch_course_website_documents_insert AFTER INSERT ON "course_website_documents" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_fence_course_website_documents_update BEFORE UPDATE ON "course_website_documents" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_epoch_course_website_documents_update AFTER UPDATE ON "course_website_documents" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_fence_course_website_documents_delete BEFORE DELETE ON "course_website_documents" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_epoch_course_website_documents_delete AFTER DELETE ON "course_website_documents" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_fence_course_website_assets_insert BEFORE INSERT ON "course_website_assets" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_epoch_course_website_assets_insert AFTER INSERT ON "course_website_assets" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_fence_course_website_assets_update BEFORE UPDATE ON "course_website_assets" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_epoch_course_website_assets_update AFTER UPDATE ON "course_website_assets" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_fence_course_website_assets_delete BEFORE DELETE ON "course_website_assets" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_epoch_course_website_assets_delete AFTER DELETE ON "course_website_assets" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;
