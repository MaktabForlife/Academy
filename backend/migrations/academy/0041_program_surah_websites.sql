-- Manually maintained Tafseer completion dates. No access is granted by this migration.
CREATE TABLE program_surahs(
 surah_id TEXT PRIMARY KEY,
 activity_key TEXT NOT NULL COLLATE NOCASE REFERENCES activities(activity_key),
 name TEXT NOT NULL,
 completion_date TEXT NOT NULL CHECK(length(completion_date)=10),
 active INTEGER NOT NULL DEFAULT 1 CHECK(active IN(0,1)),
 revision INTEGER NOT NULL DEFAULT 1,
 updated_at TEXT NOT NULL,
 updated_by_account_id TEXT NOT NULL REFERENCES accounts(account_id));
CREATE INDEX program_surahs_scope ON program_surahs(activity_key,completion_date,surah_id);
CREATE TABLE program_surah_website_documents(
 surah_id TEXT PRIMARY KEY,
 activity_key TEXT NOT NULL COLLATE NOCASE REFERENCES activities(activity_key),
 document_json TEXT NOT NULL CHECK(document_json IS NULL OR json_valid(document_json)),
 schema_version INTEGER NOT NULL DEFAULT 1,
 source_kind TEXT NOT NULL DEFAULT 'TEMPLATE',
 revision INTEGER NOT NULL DEFAULT 1,
 enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN(0,1)),
 updated_at TEXT NOT NULL,
 updated_by TEXT NOT NULL REFERENCES accounts(account_id));
CREATE TABLE program_surah_website_assets(
 asset_id TEXT PRIMARY KEY,
 surah_id TEXT NOT NULL REFERENCES program_surahs(surah_id),
 activity_key TEXT NOT NULL COLLATE NOCASE REFERENCES activities(activity_key),
 object_key TEXT NOT NULL UNIQUE,
 filename TEXT NOT NULL,
 mime_type TEXT NOT NULL CHECK(mime_type IS NULL OR mime_type IN('application/pdf','image/png','image/jpeg','image/webp')),
 byte_size INTEGER NOT NULL CHECK(byte_size IS NULL OR byte_size BETWEEN 1 AND 16777216),
 sha256 TEXT NOT NULL,
 created_at TEXT NOT NULL,
 created_by TEXT NOT NULL REFERENCES accounts(account_id));
CREATE INDEX program_surah_website_assets_scope ON program_surah_website_assets(surah_id,asset_id);
CREATE TRIGGER academy_snapshot_program_surahs_insert AFTER INSERT ON program_surahs BEGIN INSERT INTO academy_settings(setting_key,setting_value,updated_at,updated_by_account_id) VALUES('AcademySnapshot:authority:GLOBAL','1',strftime('%Y-%m-%dT%H:%M:%fZ','now'),NULL) ON CONFLICT(setting_key) DO UPDATE SET setting_value=CAST(setting_value AS INTEGER)+1,updated_at=excluded.updated_at; END;
CREATE TRIGGER academy_snapshot_program_surahs_update AFTER UPDATE ON program_surahs BEGIN INSERT INTO academy_settings(setting_key,setting_value,updated_at,updated_by_account_id) VALUES('AcademySnapshot:authority:GLOBAL','1',strftime('%Y-%m-%dT%H:%M:%fZ','now'),NULL) ON CONFLICT(setting_key) DO UPDATE SET setting_value=CAST(setting_value AS INTEGER)+1,updated_at=excluded.updated_at; END;
CREATE TRIGGER academy_snapshot_program_surahs_delete AFTER DELETE ON program_surahs BEGIN INSERT INTO academy_settings(setting_key,setting_value,updated_at,updated_by_account_id) VALUES('AcademySnapshot:authority:GLOBAL','1',strftime('%Y-%m-%dT%H:%M:%fZ','now'),NULL) ON CONFLICT(setting_key) DO UPDATE SET setting_value=CAST(setting_value AS INTEGER)+1,updated_at=excluded.updated_at; END;
