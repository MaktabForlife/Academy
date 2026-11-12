CREATE TABLE assessment_registers (
 register_id TEXT PRIMARY KEY,
 name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 160),
 class_mode TEXT NOT NULL CHECK(class_mode IN('ONE','ALL')),
 class_activity_key TEXT REFERENCES activities(activity_key),
 class_id TEXT,
 status TEXT NOT NULL CHECK(status IN('REGISTERED','DRAFT','SCHEDULED','SCHEDULE_RELEASED','AWAITING_MODERATION','APPROVED','PUBLISHED','IN_PROGRESS','READY_FOR_ASSESSMENT','ASSESSED','MODERATED','READY_FOR_RELEASE','RELEASED','COMPLETE','ARCHIVED','CANCELLED')),
 revision INTEGER NOT NULL DEFAULT 1,
 legacy_phase_id TEXT UNIQUE REFERENCES assessment_phases(phase_id),
 created_at TEXT NOT NULL, created_by TEXT NOT NULL REFERENCES accounts(account_id), updated_at TEXT NOT NULL,
 CHECK((class_mode='ALL' AND class_activity_key IS NULL AND class_id IS NULL) OR (class_mode='ONE' AND class_activity_key IS NOT NULL AND class_id IS NOT NULL)),
 FOREIGN KEY(class_activity_key,class_id) REFERENCES classes(activity_key,class_id)
);
CREATE TABLE assessment_register_areas (
 register_id TEXT NOT NULL REFERENCES assessment_registers(register_id),
 activity_key TEXT NOT NULL REFERENCES activities(activity_key),
 PRIMARY KEY(register_id,activity_key)
);
ALTER TABLE assessments ADD COLUMN register_id TEXT REFERENCES assessment_registers(register_id);
ALTER TABLE assessments ADD COLUMN deleted_at TEXT;
ALTER TABLE assessments ADD COLUMN deleted_by TEXT REFERENCES accounts(account_id);
CREATE INDEX assessments_register_date ON assessments(register_id,exam_date);

-- Preserve existing identifiers, dates, papers and results while giving each schedule a register row.
INSERT INTO assessment_registers(register_id,name,class_mode,status,legacy_phase_id,created_at,created_by,updated_at)
 SELECT phase_id,name,'ALL',CASE WHEN EXISTS(SELECT 1 FROM assessments x WHERE x.phase_id=ph.phase_id) AND NOT EXISTS(SELECT 1 FROM assessments x WHERE x.phase_id=ph.phase_id AND x.schedule_published=0) THEN 'SCHEDULE_RELEASED' WHEN EXISTS(SELECT 1 FROM assessments x WHERE x.phase_id=ph.phase_id) THEN 'SCHEDULED' ELSE 'REGISTERED' END,phase_id,created_at,created_by,created_at FROM assessment_phases ph;
INSERT INTO assessment_register_areas SELECT phase_id,activity_key FROM assessment_phases;
UPDATE assessments SET register_id=phase_id WHERE phase_id IS NOT NULL;

CREATE TABLE assessment_register_import (
 register_id TEXT PRIMARY KEY,activity_key TEXT,class_id TEXT,name TEXT,status TEXT,created_at TEXT,created_by TEXT,updated_at TEXT
);
INSERT INTO assessment_register_import
 SELECT 'EARLIER:'||lower(hex(randomblob(16))),activity_key,class_id,title,CASE WHEN min(schedule_published)=1 THEN 'SCHEDULE_RELEASED' ELSE 'SCHEDULED' END,min(created_at),min(created_by),max(updated_at)
 FROM assessments WHERE phase_id IS NULL GROUP BY activity_key,class_id,title;
INSERT INTO assessment_registers(register_id,name,class_mode,class_activity_key,class_id,status,created_at,created_by,updated_at)
 SELECT register_id,name,'ONE',activity_key,class_id,status,created_at,created_by,updated_at FROM assessment_register_import;
INSERT INTO assessment_register_areas SELECT register_id,activity_key FROM assessment_register_import;
UPDATE assessments SET register_id=(SELECT r.register_id FROM assessment_register_import r WHERE r.activity_key=assessments.activity_key AND r.class_id=assessments.class_id AND r.name=assessments.title) WHERE phase_id IS NULL;
DROP TABLE assessment_register_import;
