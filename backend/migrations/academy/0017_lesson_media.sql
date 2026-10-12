-- Controlled lesson media pilot. This does not grant Module lifetime entitlements.
CREATE TABLE lesson_media_lessons (
 lesson_id TEXT PRIMARY KEY, activity_key TEXT NOT NULL REFERENCES activities(activity_key),
 class_id TEXT NOT NULL, lesson_date TEXT NOT NULL, title TEXT NOT NULL,
 start_time TEXT NOT NULL, end_time TEXT NOT NULL, teacher_id TEXT REFERENCES accounts(account_id), teacher_name TEXT NOT NULL,
 summary TEXT NOT NULL DEFAULT '', state TEXT NOT NULL CHECK(state IN('DRAFT','PUBLISHED','HIDDEN')),
 comments_closed INTEGER NOT NULL DEFAULT 0 CHECK(comments_closed IN(0,1)), revision INTEGER NOT NULL DEFAULT 1,
 source_publication_id TEXT, source_lessons_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(source_lessons_json)),
 updated_at TEXT NOT NULL, FOREIGN KEY(activity_key,class_id) REFERENCES classes(activity_key,class_id)
);
CREATE INDEX lesson_media_by_program_date ON lesson_media_lessons(activity_key,state,lesson_date,lesson_id);
CREATE TABLE lesson_media_assets (
 asset_id TEXT PRIMARY KEY, activity_key TEXT NOT NULL REFERENCES activities(activity_key), kind TEXT NOT NULL CHECK(kind IN('YOUTUBE','PDF')),
 youtube_id TEXT, object_key TEXT UNIQUE, filename TEXT NOT NULL DEFAULT '', byte_size INTEGER,
 created_at TEXT NOT NULL, CHECK((kind='YOUTUBE' AND youtube_id IS NOT NULL AND object_key IS NULL) OR (kind='PDF' AND youtube_id IS NULL AND object_key IS NOT NULL))
);
CREATE TABLE lesson_media_links (
 lesson_id TEXT NOT NULL REFERENCES lesson_media_lessons(lesson_id), asset_id TEXT NOT NULL REFERENCES lesson_media_assets(asset_id),
 PRIMARY KEY(lesson_id,asset_id)
);
CREATE INDEX lesson_media_links_asset ON lesson_media_links(asset_id,lesson_id);
CREATE TABLE lesson_media_comments (
 comment_id TEXT PRIMARY KEY, lesson_id TEXT NOT NULL REFERENCES lesson_media_lessons(lesson_id),
 account_id TEXT NOT NULL REFERENCES accounts(account_id), parent_id TEXT, body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 2000),
 state TEXT NOT NULL CHECK(state IN('PENDING','APPROVED','HIDDEN','DELETED')), staff INTEGER NOT NULL CHECK(staff IN(0,1)),
 pinned INTEGER NOT NULL DEFAULT 0 CHECK(pinned IN(0,1)), revision INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 UNIQUE(lesson_id,comment_id), FOREIGN KEY(lesson_id,parent_id) REFERENCES lesson_media_comments(lesson_id,comment_id)
);
CREATE INDEX lesson_media_comments_by_lesson ON lesson_media_comments(lesson_id,state,created_at,comment_id);
CREATE INDEX lesson_media_comments_by_author ON lesson_media_comments(lesson_id,account_id,created_at);
-- A bounded historical projection of an immutable weekly publication. Lower
-- priority than the real publication, and never changes its snapshot or dates.
CREATE TABLE program_historical_extensions (
 extension_id TEXT PRIMARY KEY, activity_key TEXT NOT NULL REFERENCES activities(activity_key),
 publication_id TEXT NOT NULL, start_date TEXT NOT NULL, end_date TEXT NOT NULL CHECK(end_date>=start_date),
 reason TEXT NOT NULL, created_at TEXT NOT NULL,
 FOREIGN KEY(activity_key,publication_id) REFERENCES timetable_publications(activity_key,publication_id)
);
CREATE INDEX historical_extensions_dates ON program_historical_extensions(start_date,end_date,activity_key);
INSERT INTO academy_settings(setting_key,setting_value) VALUES('LessonMediaPilot','1');
