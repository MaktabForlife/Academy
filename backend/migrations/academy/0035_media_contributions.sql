-- Core authorship and immutable file versions for narrow own-note contribution.
-- Existing official assets, comments/history and R2 objects remain in place.
CREATE TABLE lesson_note_entries (
 note_id TEXT PRIMARY KEY,activity_key TEXT NOT NULL REFERENCES activities(activity_key),session_key TEXT NOT NULL,
 container_id TEXT NOT NULL,owner_id TEXT NOT NULL REFERENCES accounts(account_id),current_version_id TEXT,
 state TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(state IN('ACTIVE','WITHDRAWN')),revision INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL,created_by TEXT NOT NULL REFERENCES accounts(account_id)
);
CREATE INDEX lesson_notes_session ON lesson_note_entries(activity_key,session_key,state);
CREATE INDEX lesson_notes_owner ON lesson_note_entries(owner_id,activity_key,state);
CREATE TABLE lesson_note_versions (
 version_id TEXT PRIMARY KEY,note_id TEXT NOT NULL REFERENCES lesson_note_entries(note_id),object_key TEXT NOT NULL UNIQUE,
 filename TEXT NOT NULL,display_name TEXT NOT NULL DEFAULT '',byte_size INTEGER NOT NULL CHECK(byte_size BETWEEN 5 AND 16777216),
 sha256 TEXT NOT NULL CHECK(length(sha256)=64),source_head TEXT NOT NULL REFERENCES setup_heads(head_id),
 source_json TEXT NOT NULL CHECK(json_valid(source_json)),uploaded_by TEXT NOT NULL REFERENCES accounts(account_id),uploaded_at TEXT NOT NULL
);
CREATE TRIGGER lesson_note_owner_immutable BEFORE UPDATE OF activity_key,session_key,container_id,owner_id ON lesson_note_entries
 BEGIN SELECT RAISE(ABORT,'lesson_note_identity_immutable'); END;
CREATE TRIGGER lesson_note_version_immutable_update BEFORE UPDATE ON lesson_note_versions BEGIN SELECT RAISE(ABORT,'lesson_note_version_immutable'); END;
CREATE TRIGGER lesson_note_version_immutable_delete BEFORE DELETE ON lesson_note_versions BEGIN SELECT RAISE(ABORT,'lesson_note_version_immutable'); END;
CREATE TRIGGER lesson_note_pointer BEFORE UPDATE OF current_version_id ON lesson_note_entries
 WHEN NEW.current_version_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM lesson_note_versions v WHERE v.version_id=NEW.current_version_id AND v.note_id=NEW.note_id)
 BEGIN SELECT RAISE(ABORT,'lesson_note_version_mismatch'); END;
CREATE TABLE lesson_media_visibility (
 lesson_id TEXT PRIMARY KEY REFERENCES lesson_media_lessons(lesson_id),visible INTEGER NOT NULL CHECK(visible IN(0,1)),
 updated_at TEXT NOT NULL,updated_by TEXT REFERENCES accounts(account_id)
);
INSERT INTO lesson_media_visibility(lesson_id,visible,updated_at) SELECT lesson_id,0,updated_at FROM lesson_media_lessons WHERE state='HIDDEN';

CREATE TRIGGER lesson_media_accepted_pdf_limit_insert BEFORE INSERT ON setup_head_state
 WHEN EXISTS(WITH parents AS(SELECT json_extract(row.value,'$.lesson_id') id,json_extract(row.value,'$.activity_key') activity_key,json_extract(row.value,'$.session_key') session_key FROM setup_head_components h JOIN setup_components c USING(component_id),json_each(c.rows_json) row WHERE h.head_id=NEW.head_id AND h.table_name='lesson_media_lessons' AND json_extract(row.value,'$.state')='PUBLISHED' AND coalesce(json_extract(row.value,'$.media_scope'),'SESSION')='SESSION'), links AS(SELECT json_extract(row.value,'$.lesson_id') lesson_id,json_extract(row.value,'$.asset_id') asset_id FROM setup_head_components h JOIN setup_components c USING(component_id),json_each(c.rows_json) row WHERE h.head_id=NEW.head_id AND h.table_name='lesson_media_links'), assets AS(SELECT json_extract(row.value,'$.asset_id') asset_id FROM setup_head_components h JOIN setup_components c USING(component_id),json_each(c.rows_json) row WHERE h.head_id=NEW.head_id AND h.table_name='lesson_media_assets' AND json_extract(row.value,'$.kind')='PDF') SELECT 1 FROM parents p WHERE (SELECT count(*) FROM links l JOIN assets a USING(asset_id) WHERE l.lesson_id=p.id)+(SELECT count(*) FROM lesson_note_entries n WHERE n.activity_key=p.activity_key AND n.session_key=p.session_key AND n.state='ACTIVE')>10)
 BEGIN SELECT RAISE(ABORT,'lesson_media_pdf_limit'); END;

CREATE TRIGGER lesson_media_accepted_pdf_limit_update BEFORE UPDATE ON setup_head_state
 WHEN EXISTS(WITH parents AS(SELECT json_extract(row.value,'$.lesson_id') id,json_extract(row.value,'$.activity_key') activity_key,json_extract(row.value,'$.session_key') session_key FROM setup_head_components h JOIN setup_components c USING(component_id),json_each(c.rows_json) row WHERE h.head_id=NEW.head_id AND h.table_name='lesson_media_lessons' AND json_extract(row.value,'$.state')='PUBLISHED' AND coalesce(json_extract(row.value,'$.media_scope'),'SESSION')='SESSION'), links AS(SELECT json_extract(row.value,'$.lesson_id') lesson_id,json_extract(row.value,'$.asset_id') asset_id FROM setup_head_components h JOIN setup_components c USING(component_id),json_each(c.rows_json) row WHERE h.head_id=NEW.head_id AND h.table_name='lesson_media_links'), assets AS(SELECT json_extract(row.value,'$.asset_id') asset_id FROM setup_head_components h JOIN setup_components c USING(component_id),json_each(c.rows_json) row WHERE h.head_id=NEW.head_id AND h.table_name='lesson_media_assets' AND json_extract(row.value,'$.kind')='PDF') SELECT 1 FROM parents p WHERE (SELECT count(*) FROM links l JOIN assets a USING(asset_id) WHERE l.lesson_id=p.id)+(SELECT count(*) FROM lesson_note_entries n WHERE n.activity_key=p.activity_key AND n.session_key=p.session_key AND n.state='ACTIVE')>10)
 BEGIN SELECT RAISE(ABORT,'lesson_media_pdf_limit'); END;
