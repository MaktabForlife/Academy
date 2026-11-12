-- Indexed metadata-only discovery and shared-PDF reference checks.
CREATE INDEX IF NOT EXISTS lesson_media_retention_created ON lesson_media_assets(kind,created_at,asset_id);
CREATE INDEX IF NOT EXISTS lesson_media_retention_hash ON lesson_media_assets(substr(object_key,-68)) WHERE kind='PDF';
