-- Permanent Program/Course session media. Preserve all pilot lessons, files,
-- links and discussions while allowing Course sessions without a Program class.
PRAGMA defer_foreign_keys = ON;
CREATE TABLE lesson_media_lessons_next (
 lesson_id TEXT PRIMARY KEY, activity_key TEXT NOT NULL REFERENCES activities(activity_key),
 class_id TEXT, lesson_date TEXT NOT NULL, title TEXT NOT NULL,
 start_time TEXT NOT NULL, end_time TEXT NOT NULL, teacher_id TEXT REFERENCES accounts(account_id), teacher_name TEXT NOT NULL,
 summary TEXT NOT NULL DEFAULT '', state TEXT NOT NULL CHECK(state IN('DRAFT','PUBLISHED','HIDDEN')),
 comments_closed INTEGER NOT NULL DEFAULT 0 CHECK(comments_closed IN(0,1)), revision INTEGER NOT NULL DEFAULT 1,
 source_publication_id TEXT, source_lessons_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(source_lessons_json)),
 updated_at TEXT NOT NULL, session_key TEXT, run_id TEXT NOT NULL DEFAULT '',
 teacher_ids_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(teacher_ids_json)),
 FOREIGN KEY(activity_key,class_id) REFERENCES classes(activity_key,class_id)
);
INSERT INTO lesson_media_lessons_next
SELECT l.*,NULL,'',CASE WHEN teacher_id IS NULL THEN '[]' ELSE json_array(teacher_id) END FROM lesson_media_lessons l;
DROP TABLE lesson_media_lessons;
ALTER TABLE lesson_media_lessons_next RENAME TO lesson_media_lessons;
CREATE INDEX lesson_media_by_program_date ON lesson_media_lessons(activity_key,state,lesson_date,lesson_id);
CREATE UNIQUE INDEX lesson_media_session_key ON lesson_media_lessons(activity_key,session_key) WHERE session_key IS NOT NULL;
CREATE INDEX lesson_media_by_run ON lesson_media_lessons(activity_key,run_id,lesson_date,lesson_id);
INSERT INTO academy_settings(setting_key,setting_value) VALUES('LessonMediaEnabled','1')
ON CONFLICT(setting_key) DO UPDATE SET setting_value='1';
PRAGMA defer_foreign_keys = OFF;
