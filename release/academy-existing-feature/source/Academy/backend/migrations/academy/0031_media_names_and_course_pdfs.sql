-- Preserve original filenames, storage keys, links and discussion history.
ALTER TABLE lesson_media_assets ADD COLUMN display_name TEXT NOT NULL DEFAULT '';
ALTER TABLE lesson_media_lessons ADD COLUMN media_scope TEXT NOT NULL DEFAULT 'SESSION' CHECK(media_scope IN('SESSION','COURSE'));
-- A dateless Course collection is separate from every dated session/offering.
CREATE UNIQUE INDEX lesson_media_course_pdfs ON lesson_media_lessons(activity_key) WHERE media_scope='COURSE';
