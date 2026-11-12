CREATE TABLE lesson_recording_companions(
 lesson_id TEXT NOT NULL REFERENCES lesson_media_lessons(lesson_id),
 asset_id TEXT NOT NULL REFERENCES lesson_media_assets(asset_id),
 uploaded_at TEXT NOT NULL,
 source_revision TEXT NOT NULL,
 revision INTEGER NOT NULL,
 draft_key TEXT NOT NULL,
 published_key TEXT,
 index_json TEXT,
 duration_seconds INTEGER NOT NULL CHECK(duration_seconds>0 AND duration_seconds<=86400),
 PRIMARY KEY(lesson_id,asset_id)
);
CREATE INDEX lesson_recording_companions_expiry ON lesson_recording_companions(uploaded_at,lesson_id,asset_id);
