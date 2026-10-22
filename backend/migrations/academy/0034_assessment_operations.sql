-- Preserve all identifiers and child references while allowing a real null duration.
-- Apply as one D1 transaction. Local rehearsal must wrap this file in BEGIN/COMMIT.
PRAGMA defer_foreign_keys=ON;
CREATE TABLE assessments_next (
 assessment_id TEXT PRIMARY KEY, activity_key TEXT NOT NULL REFERENCES activities(activity_key), class_id TEXT NOT NULL,
 title TEXT NOT NULL, subject TEXT NOT NULL, exam_date TEXT, duration_minutes INTEGER CHECK(duration_minutes IS NULL OR duration_minutes BETWEEN 1 AND 1440),
 maximum_mark REAL NOT NULL CHECK(maximum_mark>0), schedule_published INTEGER NOT NULL DEFAULT 0 CHECK(schedule_published IN(0,1)),
 examiner_id TEXT REFERENCES accounts(account_id), paper_file_id TEXT, paper_state TEXT NOT NULL DEFAULT 'DRAFT' CHECK(paper_state IN('DRAFT','IN_REVIEW','RETURNED','APPROVED')),
 paper_comment TEXT NOT NULL DEFAULT '', paper_released_at TEXT, revision INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL, created_by TEXT NOT NULL REFERENCES accounts(account_id), updated_at TEXT NOT NULL, phase_id TEXT REFERENCES assessment_phases(phase_id), subject_descriptor TEXT NOT NULL DEFAULT '', register_id TEXT REFERENCES assessment_registers(register_id), deleted_at TEXT, deleted_by TEXT REFERENCES accounts(account_id), ready_for_assessment_at TEXT, ready_for_assessment_by TEXT REFERENCES accounts(account_id),
 assessment_kind TEXT NOT NULL DEFAULT 'EXAM' CHECK(assessment_kind IN('EXAM','ASSIGNMENT')),
 timing_mode TEXT NOT NULL DEFAULT 'TIMED' CHECK(timing_mode IN('TIMED','UNTIMED')),
 timezone TEXT NOT NULL DEFAULT 'Africa/Johannesburg', available_from TEXT, due_at TEXT, exam_cutoff TEXT,
 allowance_minutes INTEGER DEFAULT 15 CHECK(allowance_minutes IS NULL OR allowance_minutes BETWEEN 0 AND 1440),
 FOREIGN KEY(activity_key,class_id) REFERENCES classes(activity_key,class_id),
 CHECK((timing_mode='UNTIMED' AND duration_minutes IS NULL AND allowance_minutes IS NULL) OR (timing_mode='TIMED' AND duration_minutes IS NOT NULL AND allowance_minutes IS NOT NULL)),
 CHECK((assessment_kind='EXAM' AND exam_date IS NOT NULL) OR assessment_kind='ASSIGNMENT')
);
INSERT INTO assessments_next(assessment_id,activity_key,class_id,title,subject,exam_date,duration_minutes,maximum_mark,schedule_published,examiner_id,paper_file_id,paper_state,paper_comment,paper_released_at,revision,created_at,created_by,updated_at,phase_id,subject_descriptor,register_id,deleted_at,deleted_by,ready_for_assessment_at,ready_for_assessment_by) SELECT assessment_id,activity_key,class_id,title,subject,exam_date,duration_minutes,maximum_mark,schedule_published,examiner_id,paper_file_id,paper_state,paper_comment,paper_released_at,revision,created_at,created_by,updated_at,phase_id,subject_descriptor,register_id,deleted_at,deleted_by,ready_for_assessment_at,ready_for_assessment_by FROM assessments;
DROP TABLE assessments;
ALTER TABLE assessments_next RENAME TO assessments;
CREATE INDEX assessments_class_date ON assessments(activity_key,class_id,exam_date);
CREATE INDEX assessments_phase_date ON assessments(phase_id,exam_date);
CREATE TRIGGER assessments_phase_scope_insert BEFORE INSERT ON assessments
 WHEN NEW.phase_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM assessment_phases WHERE phase_id=NEW.phase_id AND activity_key=NEW.activity_key)
 BEGIN SELECT RAISE(ABORT,'assessment_phase_scope'); END;
CREATE TRIGGER assessments_phase_scope_update BEFORE UPDATE OF phase_id,activity_key ON assessments
 WHEN NEW.phase_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM assessment_phases WHERE phase_id=NEW.phase_id AND activity_key=NEW.activity_key)
 BEGIN SELECT RAISE(ABORT,'assessment_phase_scope'); END;
CREATE INDEX assessments_register_date ON assessments(register_id,exam_date);
PRAGMA defer_foreign_keys=OFF;

CREATE TABLE assessment_collection (
 assessment_id TEXT PRIMARY KEY REFERENCES assessments(assessment_id), effective_due_at TEXT, closed_at TEXT,
 revision INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL, updated_by TEXT NOT NULL REFERENCES accounts(account_id)
);
CREATE TABLE assessment_attempts (
 assessment_id TEXT NOT NULL REFERENCES assessments(assessment_id),account_id TEXT NOT NULL REFERENCES accounts(account_id),
 first_accessed_at TEXT NOT NULL,timing_mode TEXT NOT NULL CHECK(timing_mode IN('TIMED','UNTIMED')),
 duration_minutes INTEGER,allowance_minutes INTEGER,deadline_at TEXT,timezone TEXT NOT NULL,definition_revision INTEGER NOT NULL,
 PRIMARY KEY(assessment_id,account_id),
 CHECK((timing_mode='UNTIMED' AND duration_minutes IS NULL AND allowance_minutes IS NULL AND deadline_at IS NULL) OR (timing_mode='TIMED' AND duration_minutes>0 AND allowance_minutes>=0 AND deadline_at IS NOT NULL))
);
ALTER TABLE assessment_submissions ADD COLUMN is_late INTEGER NOT NULL DEFAULT 0 CHECK(is_late IN(0,1));
ALTER TABLE assessment_submissions ADD COLUMN deadline_used TEXT;
ALTER TABLE assessment_submissions ADD COLUMN collection_revision INTEGER;
CREATE TABLE assessment_file_integrity (
 file_id TEXT PRIMARY KEY REFERENCES assessment_files(file_id),sha256 TEXT NOT NULL CHECK(length(sha256)=64)
);
CREATE TABLE assessment_paper_review (
 file_id TEXT PRIMARY KEY REFERENCES assessment_files(file_id),assessment_id TEXT NOT NULL REFERENCES assessments(assessment_id),
 sha256 TEXT,definition_revision INTEGER NOT NULL,reviewed_at TEXT NOT NULL,reviewed_by TEXT NOT NULL REFERENCES accounts(account_id)
);
CREATE TABLE assessment_report_evidence (
 report_id TEXT PRIMARY KEY REFERENCES assessment_reports(report_id),sha256 TEXT NOT NULL,
 source_json TEXT NOT NULL CHECK(json_valid(source_json)),template_id TEXT REFERENCES assessment_report_templates(template_id),template_revision INTEGER,
 layout_json TEXT NOT NULL CHECK(json_valid(layout_json)),background_file_id TEXT REFERENCES assessment_files(file_id),reviewed_at TEXT NOT NULL,reviewed_by TEXT NOT NULL REFERENCES accounts(account_id)
);
CREATE TRIGGER assessment_attempt_immutable_update BEFORE UPDATE ON assessment_attempts BEGIN SELECT RAISE(ABORT,'assessment_attempt_immutable'); END;
CREATE TRIGGER assessment_attempt_immutable_delete BEFORE DELETE ON assessment_attempts BEGIN SELECT RAISE(ABORT,'assessment_attempt_immutable'); END;
CREATE TRIGGER assessment_file_integrity_immutable BEFORE UPDATE ON assessment_file_integrity BEGIN SELECT RAISE(ABORT,'assessment_file_integrity_immutable'); END;

CREATE TABLE assessment_script_sources (
 file_id TEXT PRIMARY KEY REFERENCES assessment_files(file_id),submission_id TEXT NOT NULL REFERENCES assessment_submissions(submission_id),
 paper_file_id TEXT REFERENCES assessment_files(file_id),maximum_mark REAL NOT NULL
);
