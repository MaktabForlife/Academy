-- Operational native Academy playlists; no legacy membership is inferred or seeded.
-- Existing lesson definitions, accepted publication and all media remain untouched.
CREATE TABLE academy_media_playlist_state(
 activity_key TEXT PRIMARY KEY COLLATE NOCASE REFERENCES activities(activity_key),
 revision INTEGER NOT NULL DEFAULT 0 CHECK(revision>=0)
);
CREATE TABLE academy_media_playlists(
 playlist_id TEXT PRIMARY KEY,
 activity_key TEXT NOT NULL COLLATE NOCASE REFERENCES activities(activity_key),
 class_id TEXT NOT NULL COLLATE NOCASE,
 name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 160),
 close_date TEXT NOT NULL DEFAULT '',
 context_json TEXT NOT NULL CHECK(json_valid(context_json)),
 revision INTEGER NOT NULL CHECK(revision>0),
 enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN(0,1)),
 published_json TEXT CHECK(published_json IS NULL OR json_valid(published_json)),
 published_revision INTEGER,
 created_at TEXT NOT NULL,
 created_by TEXT NOT NULL COLLATE NOCASE REFERENCES actor_refs(account_id),
 updated_at TEXT NOT NULL,
 updated_by TEXT NOT NULL COLLATE NOCASE REFERENCES actor_refs(account_id),
 FOREIGN KEY(activity_key,class_id) REFERENCES classes(activity_key,class_id),
 UNIQUE(activity_key,playlist_id)
);
CREATE INDEX academy_media_playlists_area ON academy_media_playlists(activity_key,created_at DESC,playlist_id DESC);
CREATE INDEX academy_media_playlists_class ON academy_media_playlists(activity_key,class_id,enabled,created_at DESC,playlist_id DESC);
CREATE TABLE academy_media_playlist_recordings(
 lesson_id TEXT PRIMARY KEY REFERENCES lesson_media_lessons(lesson_id),
 playlist_id TEXT NOT NULL REFERENCES academy_media_playlists(playlist_id),
 activity_key TEXT NOT NULL COLLATE NOCASE REFERENCES activities(activity_key),
 position INTEGER NOT NULL CHECK(position>0),
 confirmed_context_json TEXT NOT NULL CHECK(json_valid(confirmed_context_json)),
 confirmation_kind TEXT NOT NULL CHECK(confirmation_kind IN('NATIVE_MATCH','ADMIN_CONFIRMED_MISSING_CONTEXT')),
 attached_at TEXT NOT NULL,
 attached_by TEXT NOT NULL COLLATE NOCASE REFERENCES actor_refs(account_id),
 FOREIGN KEY(activity_key,playlist_id) REFERENCES academy_media_playlists(activity_key,playlist_id),
 UNIQUE(playlist_id,position)
);
CREATE INDEX academy_media_playlist_recordings_page ON academy_media_playlist_recordings(playlist_id,position,lesson_id);
CREATE INDEX academy_media_playlist_recordings_area ON academy_media_playlist_recordings(activity_key,lesson_id);
CREATE TRIGGER split_fence_academy_media_playlist_state_insert BEFORE INSERT ON academy_media_playlist_state WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;
CREATE TRIGGER split_fence_academy_media_playlist_state_update BEFORE UPDATE ON academy_media_playlist_state WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;
CREATE TRIGGER split_fence_academy_media_playlists_insert BEFORE INSERT ON academy_media_playlists WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;
CREATE TRIGGER split_fence_academy_media_playlists_update BEFORE UPDATE ON academy_media_playlists WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;
CREATE TRIGGER split_fence_academy_media_playlist_recordings_insert BEFORE INSERT ON academy_media_playlist_recordings WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;
CREATE TRIGGER split_fence_academy_media_playlist_recordings_update BEFORE UPDATE ON academy_media_playlist_recordings WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;
CREATE TRIGGER split_epoch_academy_media_playlist_state_insert AFTER INSERT ON academy_media_playlist_state BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;
CREATE TRIGGER split_epoch_academy_media_playlist_state_update AFTER UPDATE ON academy_media_playlist_state BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;
CREATE TRIGGER split_epoch_academy_media_playlists_insert AFTER INSERT ON academy_media_playlists BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;
CREATE TRIGGER split_epoch_academy_media_playlists_update AFTER UPDATE ON academy_media_playlists BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;
CREATE TRIGGER split_epoch_academy_media_playlist_recordings_insert AFTER INSERT ON academy_media_playlist_recordings BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;
CREATE TRIGGER split_epoch_academy_media_playlist_recordings_update AFTER UPDATE ON academy_media_playlist_recordings BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;
