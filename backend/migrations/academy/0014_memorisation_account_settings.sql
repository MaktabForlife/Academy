-- Personal card visibility is separate from account access and saved progress.
CREATE TABLE memorisation_account_settings (
  account_id TEXT PRIMARY KEY COLLATE NOCASE NOT NULL REFERENCES accounts(account_id),
  active INTEGER NOT NULL CHECK(active IN (0,1)),
  revision INTEGER NOT NULL CHECK(revision>=1),
  updated_at TEXT NOT NULL,
  updated_by TEXT COLLATE NOCASE NOT NULL REFERENCES accounts(account_id)
);
-- No assignment rows means public. Assignments limit a module to those areas.
CREATE TABLE memorisation_module_activities (
  module_id TEXT NOT NULL REFERENCES memorisation_modules(module_id),
  activity_key TEXT NOT NULL COLLATE NOCASE REFERENCES activities(activity_key),
  PRIMARY KEY(module_id,activity_key)
);
CREATE TABLE memorisation_activity_settings (
  activity_key TEXT PRIMARY KEY COLLATE NOCASE NOT NULL REFERENCES activities(activity_key),
  learners_per_card INTEGER NOT NULL DEFAULT 20 CHECK(learners_per_card BETWEEN 5 AND 50),
  active INTEGER NOT NULL CHECK(active IN (0,1)),
  revision INTEGER NOT NULL CHECK(revision>=1),
  updated_at TEXT NOT NULL,
  updated_by TEXT COLLATE NOCASE NOT NULL REFERENCES accounts(account_id)
);
INSERT INTO academy_settings(setting_key,setting_value) VALUES('PersonalMemorisationCards','1')
  ON CONFLICT(setting_key) DO UPDATE SET setting_value=excluded.setting_value;
UPDATE academy_write_state SET version=version+1 WHERE singleton=1;
