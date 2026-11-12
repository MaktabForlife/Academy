-- Retention applies to saved Class Notes and session PDF notes only.
CREATE TABLE note_retention_policy (
 singleton INTEGER PRIMARY KEY CHECK(singleton=1),months INTEGER NOT NULL DEFAULT 3 CHECK(months BETWEEN 1 AND 120),
 warning_days INTEGER NOT NULL DEFAULT 7 CHECK(warning_days BETWEEN 1 AND 90 AND warning_days<months*28),enabled_at TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 1
);
INSERT INTO note_retention_policy(singleton,enabled_at) VALUES(1,strftime('%Y-%m-%dT%H:%M:%fZ','now'));
CREATE TABLE note_retention_items (
 item_id TEXT PRIMARY KEY,kind TEXT NOT NULL CHECK(kind IN('CLASS_NOTE','PDF_NOTE','SESSION_PDF')),ref_id TEXT NOT NULL,
 activity_key TEXT NOT NULL,class_ids_json TEXT NOT NULL CHECK(json_valid(class_ids_json)),lesson_date TEXT NOT NULL,label TEXT NOT NULL,
 created_at TEXT NOT NULL,next_check TEXT NOT NULL,delete_after TEXT NOT NULL,warned_at TEXT,
 state TEXT NOT NULL DEFAULT 'TRACKED' CHECK(state IN('TRACKED','WARNED','PURGING','DELETED','EXEMPT')),deleted_at TEXT,
 UNIQUE(kind,ref_id)
);
CREATE INDEX note_retention_due ON note_retention_items(state,next_check,item_id);
CREATE TABLE note_retention_recipients (
 item_id TEXT NOT NULL REFERENCES note_retention_items(item_id),account_id TEXT NOT NULL,
 first_opened_at TEXT,unread INTEGER NOT NULL DEFAULT 1 CHECK(unread IN(0,1)),archived_at TEXT,PRIMARY KEY(item_id,account_id)
);
CREATE INDEX note_retention_inbox ON note_retention_recipients(account_id,item_id);
CREATE TABLE note_retention_objects(object_key TEXT PRIMARY KEY,state TEXT NOT NULL CHECK(state IN('PENDING','DELETING','DELETED')),updated_at TEXT NOT NULL);
CREATE INDEX note_retention_object_queue ON note_retention_objects(state,updated_at,object_key);
CREATE INDEX class_notes_retention_created ON class_notes(created_at,note_id);
CREATE INDEX lesson_notes_retention_created ON lesson_note_entries(created_at,note_id);
-- Deletion remains forbidden outside a specific, scheduled retention transaction.
DROP TRIGGER class_note_version_immutable_delete;
CREATE TRIGGER class_note_version_immutable_delete BEFORE DELETE ON class_note_versions
 WHEN NOT EXISTS(SELECT 1 FROM note_retention_items WHERE kind='CLASS_NOTE' AND ref_id=OLD.note_id AND state='PURGING')
 BEGIN SELECT RAISE(ABORT,'class_note_version_immutable'); END;
DROP TRIGGER class_note_retained;
CREATE TRIGGER class_note_retained BEFORE DELETE ON class_notes
 WHEN NOT EXISTS(SELECT 1 FROM note_retention_items WHERE kind='CLASS_NOTE' AND ref_id=OLD.note_id AND state='PURGING')
 BEGIN SELECT RAISE(ABORT,'class_note_retained'); END;
DROP TRIGGER lesson_note_version_immutable_delete;
CREATE TRIGGER lesson_note_version_immutable_delete BEFORE DELETE ON lesson_note_versions
 WHEN NOT EXISTS(SELECT 1 FROM note_retention_items WHERE kind='PDF_NOTE' AND ref_id=OLD.note_id AND state='PURGING')
 BEGIN SELECT RAISE(ABORT,'lesson_note_version_immutable'); END;
CREATE TRIGGER split_fence_note_retention_policy_insert BEFORE INSERT ON note_retention_policy WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;
CREATE TRIGGER split_epoch_note_retention_policy_insert AFTER INSERT ON note_retention_policy BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;
CREATE TRIGGER split_fence_note_retention_policy_update BEFORE UPDATE ON note_retention_policy WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;
CREATE TRIGGER split_epoch_note_retention_policy_update AFTER UPDATE ON note_retention_policy BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;
CREATE TRIGGER split_fence_note_retention_policy_delete BEFORE DELETE ON note_retention_policy WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;
CREATE TRIGGER split_epoch_note_retention_policy_delete AFTER DELETE ON note_retention_policy BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;
CREATE TRIGGER split_fence_note_retention_items_insert BEFORE INSERT ON note_retention_items WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;
CREATE TRIGGER split_epoch_note_retention_items_insert AFTER INSERT ON note_retention_items BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;
CREATE TRIGGER split_fence_note_retention_items_update BEFORE UPDATE ON note_retention_items WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;
CREATE TRIGGER split_epoch_note_retention_items_update AFTER UPDATE ON note_retention_items BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;
CREATE TRIGGER split_fence_note_retention_items_delete BEFORE DELETE ON note_retention_items WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;
CREATE TRIGGER split_epoch_note_retention_items_delete AFTER DELETE ON note_retention_items BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;
CREATE TRIGGER split_fence_note_retention_recipients_insert BEFORE INSERT ON note_retention_recipients WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;
CREATE TRIGGER split_epoch_note_retention_recipients_insert AFTER INSERT ON note_retention_recipients BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;
CREATE TRIGGER split_fence_note_retention_recipients_update BEFORE UPDATE ON note_retention_recipients WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;
CREATE TRIGGER split_epoch_note_retention_recipients_update AFTER UPDATE ON note_retention_recipients BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;
CREATE TRIGGER split_fence_note_retention_recipients_delete BEFORE DELETE ON note_retention_recipients WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;
CREATE TRIGGER split_epoch_note_retention_recipients_delete AFTER DELETE ON note_retention_recipients BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;
CREATE TRIGGER split_fence_note_retention_objects_insert BEFORE INSERT ON note_retention_objects WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;
CREATE TRIGGER split_epoch_note_retention_objects_insert AFTER INSERT ON note_retention_objects BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;
CREATE TRIGGER split_fence_note_retention_objects_update BEFORE UPDATE ON note_retention_objects WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;
CREATE TRIGGER split_epoch_note_retention_objects_update AFTER UPDATE ON note_retention_objects BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;
CREATE TRIGGER split_fence_note_retention_objects_delete BEFORE DELETE ON note_retention_objects WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;
CREATE TRIGGER split_epoch_note_retention_objects_delete AFTER DELETE ON note_retention_objects BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

-- Expired session PDFs no longer consume the ten-file publication allowance.
DROP TRIGGER IF EXISTS lesson_media_accepted_pdf_limit_insert;

CREATE TRIGGER lesson_media_accepted_pdf_limit_insert BEFORE INSERT ON setup_head_state
 WHEN EXISTS(WITH parents AS MATERIALIZED (SELECT json_extract(row.value,'$.lesson_id') id,json_extract(row.value,'$.activity_key') activity_key,json_extract(row.value,'$.session_key') session_key FROM setup_head_components h JOIN setup_components c USING(component_id),json_each(c.rows_json) row WHERE h.head_id=NEW.head_id AND h.table_name='lesson_media_lessons' AND json_extract(row.value,'$.state')='PUBLISHED' AND coalesce(json_extract(row.value,'$.media_scope'),'SESSION')='SESSION'), links AS MATERIALIZED (SELECT json_extract(row.value,'$.lesson_id') lesson_id,json_extract(row.value,'$.asset_id') asset_id FROM setup_head_components h JOIN setup_components c USING(component_id),json_each(c.rows_json) row WHERE h.head_id=NEW.head_id AND h.table_name='lesson_media_links'), assets AS MATERIALIZED (SELECT json_extract(row.value,'$.asset_id') asset_id FROM setup_head_components h JOIN setup_components c USING(component_id),json_each(c.rows_json) row WHERE h.head_id=NEW.head_id AND h.table_name='lesson_media_assets' AND json_extract(row.value,'$.kind')='PDF' AND NOT EXISTS(SELECT 1 FROM note_retention_items expiry WHERE expiry.kind='SESSION_PDF' AND expiry.ref_id=json_extract(row.value,'$.asset_id') AND expiry.state IN('PURGING','DELETED'))) SELECT 1 FROM parents p WHERE (SELECT count(*) FROM links l JOIN assets a USING(asset_id) WHERE l.lesson_id=p.id)+(SELECT count(*) FROM lesson_note_entries n WHERE n.activity_key=p.activity_key AND n.session_key=p.session_key AND n.state='ACTIVE')>10)
 BEGIN SELECT RAISE(ABORT,'lesson_media_pdf_limit'); END;

DROP TRIGGER IF EXISTS lesson_media_accepted_pdf_limit_update;

CREATE TRIGGER lesson_media_accepted_pdf_limit_update BEFORE UPDATE ON setup_head_state
 WHEN EXISTS(WITH parents AS MATERIALIZED (SELECT json_extract(row.value,'$.lesson_id') id,json_extract(row.value,'$.activity_key') activity_key,json_extract(row.value,'$.session_key') session_key FROM setup_head_components h JOIN setup_components c USING(component_id),json_each(c.rows_json) row WHERE h.head_id=NEW.head_id AND h.table_name='lesson_media_lessons' AND json_extract(row.value,'$.state')='PUBLISHED' AND coalesce(json_extract(row.value,'$.media_scope'),'SESSION')='SESSION'), links AS MATERIALIZED (SELECT json_extract(row.value,'$.lesson_id') lesson_id,json_extract(row.value,'$.asset_id') asset_id FROM setup_head_components h JOIN setup_components c USING(component_id),json_each(c.rows_json) row WHERE h.head_id=NEW.head_id AND h.table_name='lesson_media_links'), assets AS MATERIALIZED (SELECT json_extract(row.value,'$.asset_id') asset_id FROM setup_head_components h JOIN setup_components c USING(component_id),json_each(c.rows_json) row WHERE h.head_id=NEW.head_id AND h.table_name='lesson_media_assets' AND json_extract(row.value,'$.kind')='PDF' AND NOT EXISTS(SELECT 1 FROM note_retention_items expiry WHERE expiry.kind='SESSION_PDF' AND expiry.ref_id=json_extract(row.value,'$.asset_id') AND expiry.state IN('PURGING','DELETED'))) SELECT 1 FROM parents p WHERE (SELECT count(*) FROM links l JOIN assets a USING(asset_id) WHERE l.lesson_id=p.id)+(SELECT count(*) FROM lesson_note_entries n WHERE n.activity_key=p.activity_key AND n.session_key=p.session_key AND n.state='ACTIVE')>10)
 BEGIN SELECT RAISE(ABORT,'lesson_media_pdf_limit'); END;

CREATE INDEX IF NOT EXISTS note_warning_class_members ON class_memberships(activity_key,class_id,active,account_id,start_date,end_date);
CREATE INDEX IF NOT EXISTS note_warning_delivery_members ON attendance_delivery_members(activity_key,run_id,state,account_id,join_date,leave_date);

CREATE TABLE note_retention_discovery(kind TEXT PRIMARY KEY,last_created TEXT NOT NULL,last_id TEXT NOT NULL,resume_after TEXT NOT NULL,policy_revision INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS lesson_media_retention_created ON lesson_media_assets(kind,created_at,asset_id);
CREATE INDEX IF NOT EXISTS lesson_media_retention_hash ON lesson_media_assets(substr(object_key,-68)) WHERE kind='PDF';
CREATE INDEX lesson_note_retention_hash ON lesson_note_versions(sha256);
CREATE TRIGGER split_fence_note_retention_discovery_insert BEFORE INSERT ON note_retention_discovery WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;
CREATE TRIGGER split_epoch_note_retention_discovery_insert AFTER INSERT ON note_retention_discovery BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;
CREATE TRIGGER split_fence_note_retention_discovery_update BEFORE UPDATE ON note_retention_discovery WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;
CREATE TRIGGER split_epoch_note_retention_discovery_update AFTER UPDATE ON note_retention_discovery BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;
CREATE TRIGGER split_fence_note_retention_discovery_delete BEFORE DELETE ON note_retention_discovery WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;
CREATE TRIGGER split_epoch_note_retention_discovery_delete AFTER DELETE ON note_retention_discovery BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE INDEX note_warning_items_inbox ON note_retention_items(activity_key,state,delete_after,item_id);
CREATE INDEX IF NOT EXISTS note_warning_learner_inbox ON class_memberships(account_id,active,activity_key,class_id);
CREATE INDEX IF NOT EXISTS note_warning_delivery_inbox ON attendance_delivery_members(account_id,state,activity_key,run_id);

CREATE INDEX lesson_note_retention_versions ON lesson_note_versions(note_id,version_id);
