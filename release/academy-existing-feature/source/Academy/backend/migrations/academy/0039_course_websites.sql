-- Course website drafts and immutable file references. Publication uses accepted setup.
CREATE TABLE course_website_documents(
 activity_key TEXT PRIMARY KEY COLLATE NOCASE REFERENCES activities(activity_key),
 document_json TEXT NOT NULL CHECK(document_json IS NULL OR json_valid(document_json)),
 schema_version INTEGER NOT NULL DEFAULT 1,
 source_kind TEXT NOT NULL DEFAULT 'TEMPLATE' CHECK(source_kind IS NULL OR source_kind IN('TEMPLATE','KAHF')),
 revision INTEGER NOT NULL DEFAULT 1,
 enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN(0,1)),
 updated_at TEXT NOT NULL,
 updated_by TEXT NOT NULL REFERENCES accounts(account_id)
);
CREATE TABLE course_website_assets(
 asset_id TEXT PRIMARY KEY,
 activity_key TEXT NOT NULL COLLATE NOCASE REFERENCES activities(activity_key),
 object_key TEXT NOT NULL UNIQUE,
 filename TEXT NOT NULL,
 mime_type TEXT NOT NULL CHECK(mime_type IS NULL OR mime_type IN('application/pdf','image/png','image/jpeg','image/webp')),
 byte_size INTEGER NOT NULL CHECK(byte_size IS NULL OR byte_size BETWEEN 1 AND 16777216),
 sha256 TEXT NOT NULL,
 created_at TEXT NOT NULL,
 created_by TEXT NOT NULL REFERENCES accounts(account_id)
);
CREATE INDEX course_website_assets_scope ON course_website_assets(activity_key,asset_id);
