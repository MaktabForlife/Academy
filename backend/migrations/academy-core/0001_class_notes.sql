-- Additive SPLIT_V1 Core upgrade; no Admin or existing learning records changed.
-- Class Notes are Core lesson records. No messaging or attention tables.
CREATE TABLE class_note_contexts (
 context_id TEXT PRIMARY KEY,
 activity_key TEXT NOT NULL COLLATE NOCASE REFERENCES activities(activity_key),
 class_id TEXT NOT NULL COLLATE NOCASE,
 lesson_date TEXT NOT NULL,
 stable_key TEXT NOT NULL,
 source_json TEXT NOT NULL CHECK(json_valid(source_json)),
 source_head TEXT NOT NULL REFERENCES setup_heads(head_id),
 created_at TEXT NOT NULL,
 UNIQUE(activity_key,class_id,lesson_date,stable_key)
);
CREATE TABLE class_notes (
 note_id TEXT PRIMARY KEY,
 activity_key TEXT NOT NULL COLLATE NOCASE REFERENCES activities(activity_key),
 context_id TEXT NOT NULL REFERENCES class_note_contexts(context_id),
 created_by TEXT NOT NULL COLLATE NOCASE REFERENCES actor_refs(account_id),
 created_at TEXT NOT NULL,
 current_version_id TEXT,
 state TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(state IN('ACTIVE','WITHDRAWN')),
 revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0),
 updated_at TEXT NOT NULL,
 updated_by TEXT NOT NULL COLLATE NOCASE REFERENCES actor_refs(account_id),
 withdrawn_at TEXT
);
CREATE INDEX class_notes_lesson ON class_notes(activity_key,context_id,state,created_at,note_id);
CREATE TABLE class_note_versions (
 version_id TEXT PRIMARY KEY,
 note_id TEXT NOT NULL REFERENCES class_notes(note_id),
 revision INTEGER NOT NULL CHECK(revision>0),
 context_id TEXT NOT NULL REFERENCES class_note_contexts(context_id),
 body TEXT NOT NULL CHECK(length(trim(body)) BETWEEN 1 AND 12000),
 due_mode TEXT NOT NULL CHECK(due_mode IN('NEXT','DATE')),
 due_date TEXT NOT NULL,
 due_context_id TEXT REFERENCES class_note_contexts(context_id),
 due_json TEXT NOT NULL CHECK(json_valid(due_json)),
 source_head TEXT NOT NULL REFERENCES setup_heads(head_id),
 previous_version_id TEXT REFERENCES class_note_versions(version_id),
 reason TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL,
 created_by TEXT NOT NULL COLLATE NOCASE REFERENCES actor_refs(account_id),
 UNIQUE(note_id,revision)
);
CREATE INDEX class_note_versions_due ON class_note_versions(due_context_id,due_date);
CREATE TRIGGER class_note_context_immutable_update BEFORE UPDATE ON class_note_contexts
 BEGIN SELECT RAISE(ABORT,'class_note_context_immutable'); END;
CREATE TRIGGER class_note_context_immutable_delete BEFORE DELETE ON class_note_contexts
 BEGIN SELECT RAISE(ABORT,'class_note_context_immutable'); END;
CREATE TRIGGER class_note_version_immutable_update BEFORE UPDATE ON class_note_versions
 BEGIN SELECT RAISE(ABORT,'class_note_version_immutable'); END;
CREATE TRIGGER class_note_version_immutable_delete BEFORE DELETE ON class_note_versions
 BEGIN SELECT RAISE(ABORT,'class_note_version_immutable'); END;
CREATE TRIGGER class_note_identity_immutable BEFORE UPDATE OF activity_key,created_by,created_at ON class_notes
 BEGIN SELECT RAISE(ABORT,'class_note_identity_immutable'); END;
CREATE TRIGGER class_note_retained BEFORE DELETE ON class_notes
 BEGIN SELECT RAISE(ABORT,'class_note_retained'); END;
CREATE TRIGGER class_note_context_scope_insert BEFORE INSERT ON class_notes
 WHEN NOT EXISTS(SELECT 1 FROM class_note_contexts c WHERE c.context_id=NEW.context_id AND c.activity_key=NEW.activity_key COLLATE NOCASE)
 BEGIN SELECT RAISE(ABORT,'class_note_context_scope'); END;
CREATE TRIGGER class_note_context_scope_update BEFORE UPDATE OF context_id ON class_notes
 WHEN NOT EXISTS(SELECT 1 FROM class_note_contexts c JOIN class_note_contexts old ON old.context_id=OLD.context_id WHERE c.context_id=NEW.context_id AND c.activity_key=NEW.activity_key COLLATE NOCASE AND c.class_id=old.class_id COLLATE NOCASE)
 BEGIN SELECT RAISE(ABORT,'class_note_context_scope'); END;
CREATE TRIGGER class_note_pointer BEFORE UPDATE OF current_version_id,context_id ON class_notes
 WHEN NEW.current_version_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM class_note_versions v WHERE v.version_id=NEW.current_version_id AND v.note_id=NEW.note_id AND v.context_id=NEW.context_id)
 BEGIN SELECT RAISE(ABORT,'class_note_version_mismatch'); END;

CREATE TRIGGER split_fence_class_note_contexts_insert BEFORE INSERT ON "class_note_contexts" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;
CREATE TRIGGER split_epoch_class_note_contexts_insert AFTER INSERT ON "class_note_contexts" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;
CREATE TRIGGER split_fence_class_note_contexts_update BEFORE UPDATE ON "class_note_contexts" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;
CREATE TRIGGER split_epoch_class_note_contexts_update AFTER UPDATE ON "class_note_contexts" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;
CREATE TRIGGER split_fence_class_note_contexts_delete BEFORE DELETE ON "class_note_contexts" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;
CREATE TRIGGER split_epoch_class_note_contexts_delete AFTER DELETE ON "class_note_contexts" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;
CREATE TRIGGER split_fence_class_notes_insert BEFORE INSERT ON "class_notes" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;
CREATE TRIGGER split_epoch_class_notes_insert AFTER INSERT ON "class_notes" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;
CREATE TRIGGER split_fence_class_notes_update BEFORE UPDATE ON "class_notes" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;
CREATE TRIGGER split_epoch_class_notes_update AFTER UPDATE ON "class_notes" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;
CREATE TRIGGER split_fence_class_notes_delete BEFORE DELETE ON "class_notes" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;
CREATE TRIGGER split_epoch_class_notes_delete AFTER DELETE ON "class_notes" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;
CREATE TRIGGER split_fence_class_note_versions_insert BEFORE INSERT ON "class_note_versions" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;
CREATE TRIGGER split_epoch_class_note_versions_insert AFTER INSERT ON "class_note_versions" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;
CREATE TRIGGER split_fence_class_note_versions_update BEFORE UPDATE ON "class_note_versions" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;
CREATE TRIGGER split_epoch_class_note_versions_update AFTER UPDATE ON "class_note_versions" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;
CREATE TRIGGER split_fence_class_note_versions_delete BEFORE DELETE ON "class_note_versions" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;
CREATE TRIGGER split_epoch_class_note_versions_delete AFTER DELETE ON "class_note_versions" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;
