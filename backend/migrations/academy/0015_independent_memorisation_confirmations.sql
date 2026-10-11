-- Preserve every progress row while allowing teacher confirmation independently.
CREATE TABLE learner_task_progress_independent (
  account_id TEXT COLLATE NOCASE NOT NULL REFERENCES accounts(account_id),
  task_id TEXT COLLATE NOCASE NOT NULL REFERENCES memorisation_tasks(task_id),
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
INSERT INTO learner_task_progress_independent SELECT * FROM learner_task_progress;
DROP TABLE learner_task_progress;
ALTER TABLE learner_task_progress_independent RENAME TO learner_task_progress;
CREATE INDEX learner_task_progress_task ON learner_task_progress(task_id,account_id);
UPDATE academy_write_state SET version=version+1 WHERE singleton=1;
