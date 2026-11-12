-- Extend session attachments without changing existing IDs, links or files.
-- Monolithic schema only. For split Core/Admin stores, generate a migration
-- from each actual schema with tools/academy-session-video-migration.mjs.
-- Apply within one transaction, before resuming writes.
PRAGMA defer_foreign_keys = ON;
CREATE TABLE lesson_media_assets_next (
 asset_id TEXT PRIMARY KEY, activity_key TEXT NOT NULL REFERENCES activities(activity_key),
 kind TEXT NOT NULL CHECK(kind IN('YOUTUBE','PDF','MP4')),
 youtube_id TEXT, object_key TEXT UNIQUE, filename TEXT NOT NULL DEFAULT '', byte_size INTEGER,
 created_at TEXT NOT NULL, display_name TEXT NOT NULL DEFAULT '',
 CHECK((kind='YOUTUBE' AND youtube_id IS NOT NULL AND object_key IS NULL)
 OR (kind IN('PDF','MP4') AND youtube_id IS NULL AND object_key IS NOT NULL))
);
INSERT INTO lesson_media_assets_next SELECT * FROM lesson_media_assets;
DROP TABLE lesson_media_assets;
ALTER TABLE lesson_media_assets_next RENAME TO lesson_media_assets;
PRAGMA defer_foreign_keys = OFF;
