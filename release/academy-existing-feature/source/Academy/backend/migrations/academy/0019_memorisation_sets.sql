-- Memorisation sets are independent of curriculum subjects/modules.
-- D1 runs this migration in one transaction. Retain item IDs and all progress.
PRAGMA defer_foreign_keys=ON;
CREATE TABLE memorisation_sets (
  set_id TEXT PRIMARY KEY COLLATE NOCASE NOT NULL,
  name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 160),
  name_key TEXT NOT NULL,
  subject TEXT NOT NULL CHECK(subject IN ('SURAHS','DUAS')),
  level TEXT NOT NULL CHECK(length(trim(level)) BETWEEN 1 AND 60),
  sort_order INTEGER NOT NULL,
  active INTEGER NOT NULL CHECK(active IN (0,1)),
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>=1),
  UNIQUE(subject,name_key)
);
INSERT INTO memorisation_sets(set_id,name,name_key,subject,level,sort_order,active,revision)
  SELECT m.module_id,c.name,c.name_key,m.subject,m.level,m.sort_order,
    CASE WHEN c.active=1 AND s.active=1 THEN 1 ELSE 0 END,c.revision
  FROM memorisation_modules m JOIN academy_module_catalogue c USING(module_id)
  JOIN subject_catalog s USING(subject_key);
CREATE TABLE memorisation_set_activities (
  set_id TEXT COLLATE NOCASE NOT NULL REFERENCES memorisation_sets(set_id),
  activity_key TEXT COLLATE NOCASE NOT NULL REFERENCES activities(activity_key),
  PRIMARY KEY(set_id,activity_key)
);
INSERT INTO memorisation_set_activities SELECT module_id,activity_key FROM memorisation_module_activities;
-- Keep the historical module_id storage/API alias so pending retries remain valid.
CREATE TABLE memorisation_tasks_separated (
  task_id TEXT PRIMARY KEY COLLATE NOCASE NOT NULL,
  module_id TEXT COLLATE NOCASE NOT NULL REFERENCES memorisation_sets(set_id),
  name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 240),
  sort_order INTEGER NOT NULL,
  UNIQUE(module_id,name)
);
INSERT INTO memorisation_tasks_separated SELECT * FROM memorisation_tasks;
CREATE TABLE learner_task_progress_separated (
  account_id TEXT COLLATE NOCASE NOT NULL REFERENCES accounts(account_id),
  task_id TEXT COLLATE NOCASE NOT NULL REFERENCES memorisation_tasks_separated(task_id),
  complete INTEGER NOT NULL CHECK(complete IN (0,1)),
  confirmed INTEGER NOT NULL CHECK(confirmed IN (0,1)),
  revision INTEGER NOT NULL CHECK(revision>=1),
  completed_at TEXT,
  confirmed_at TEXT,
  confirmed_by TEXT COLLATE NOCASE REFERENCES accounts(account_id),
  updated_at TEXT NOT NULL,
  CHECK((complete=1)=(completed_at IS NOT NULL)),
  CHECK((confirmed=1)=(confirmed_at IS NOT NULL AND confirmed_by IS NOT NULL)),
  PRIMARY KEY(account_id,task_id)
);
INSERT INTO learner_task_progress_separated SELECT * FROM learner_task_progress;
DROP TABLE learner_task_progress;
DROP TABLE memorisation_tasks;
ALTER TABLE memorisation_tasks_separated RENAME TO memorisation_tasks;
ALTER TABLE learner_task_progress_separated RENAME TO learner_task_progress;
CREATE INDEX learner_task_progress_task ON learner_task_progress(task_id,account_id);
CREATE INDEX memorisation_tasks_module ON memorisation_tasks(module_id,sort_order);
DROP TABLE memorisation_module_activities;
DROP TABLE memorisation_modules;
-- Remove tracker-only curriculum entries. Real curriculum links remain intact.
DELETE FROM academy_module_catalogue AS c
 WHERE EXISTS(SELECT 1 FROM memorisation_sets s WHERE s.set_id=c.module_id)
 AND NOT EXISTS(SELECT 1 FROM academy_module_usage u WHERE u.academy_module_id=c.module_id)
 AND NOT EXISTS(SELECT 1 FROM course_management_drafts d
   WHERE json_extract(d.details_json,'$.categoryKey')='MODULE:ACADEMY:'||c.module_id);
-- Remove only the empty subjects introduced by the original tracker seed.
DELETE FROM subject_catalog AS s WHERE s.subject_key IN ('ACADEMY:MEM-SURAHS','ACADEMY:MEM-DUAS')
 AND NOT EXISTS(SELECT 1 FROM academy_module_catalogue c WHERE c.subject_key=s.subject_key)
 AND NOT EXISTS(SELECT 1 FROM program_subjects p WHERE p.subject_key=s.subject_key)
 AND NOT EXISTS(SELECT 1 FROM course_management_drafts d
   WHERE json_extract(d.details_json,'$.categoryKey')='SUBJECT:'||s.subject_key);
UPDATE memorisation_catalogue_state SET revision=revision+1 WHERE singleton=1;
UPDATE academy_write_state SET version=version+1 WHERE singleton=1;
