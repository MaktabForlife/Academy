-- Private surah website drafts and files. Completion dates remain in Core.
CREATE TABLE program_surah_website_documents(
 surah_id TEXT PRIMARY KEY,
 activity_key TEXT NOT NULL COLLATE NOCASE REFERENCES activities(activity_key),
 document_json TEXT NOT NULL CHECK(document_json IS NULL OR json_valid(document_json)),
 schema_version INTEGER NOT NULL DEFAULT 1,
 source_kind TEXT NOT NULL DEFAULT 'TEMPLATE',
 revision INTEGER NOT NULL DEFAULT 1,
 updated_at TEXT NOT NULL,
 updated_by TEXT NOT NULL REFERENCES identity_refs(account_id));
CREATE TABLE program_surah_website_assets(
 asset_id TEXT PRIMARY KEY,
 surah_id TEXT NOT NULL,
 activity_key TEXT NOT NULL COLLATE NOCASE REFERENCES activities(activity_key),
 object_key TEXT NOT NULL UNIQUE,
 filename TEXT NOT NULL,
 mime_type TEXT NOT NULL CHECK(mime_type IS NULL OR mime_type IN('application/pdf','image/png','image/jpeg','image/webp')),
 byte_size INTEGER NOT NULL CHECK(byte_size IS NULL OR byte_size BETWEEN 1 AND 16777216),
 sha256 TEXT NOT NULL,
 created_at TEXT NOT NULL,
 created_by TEXT NOT NULL REFERENCES identity_refs(account_id));
CREATE INDEX program_surah_website_assets_scope ON program_surah_website_assets(surah_id,asset_id);
