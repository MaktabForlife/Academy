-- Group schedules by assessment phase without inventing phases for existing entries.
CREATE TABLE assessment_phases (
 phase_id TEXT PRIMARY KEY,
 activity_key TEXT NOT NULL REFERENCES activities(activity_key),
 name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 160),
 name_normalised TEXT NOT NULL,
 created_at TEXT NOT NULL,
 created_by TEXT NOT NULL REFERENCES accounts(account_id),
 UNIQUE(activity_key,name_normalised)
);
ALTER TABLE assessments ADD COLUMN phase_id TEXT REFERENCES assessment_phases(phase_id);
ALTER TABLE assessments ADD COLUMN subject_descriptor TEXT NOT NULL DEFAULT '';
CREATE INDEX assessments_phase_date ON assessments(phase_id,exam_date);
CREATE TRIGGER assessments_phase_scope_insert BEFORE INSERT ON assessments
 WHEN NEW.phase_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM assessment_phases WHERE phase_id=NEW.phase_id AND activity_key=NEW.activity_key)
 BEGIN SELECT RAISE(ABORT,'assessment_phase_scope'); END;
CREATE TRIGGER assessments_phase_scope_update BEFORE UPDATE OF phase_id,activity_key ON assessments
 WHEN NEW.phase_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM assessment_phases WHERE phase_id=NEW.phase_id AND activity_key=NEW.activity_key)
 BEGIN SELECT RAISE(ABORT,'assessment_phase_scope'); END;
