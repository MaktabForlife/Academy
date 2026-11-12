-- Operational Core authority. No Program is opted in and no student is granted access by this migration.
CREATE TABLE program_monthly_media_policies (
 activity_key TEXT PRIMARY KEY COLLATE NOCASE REFERENCES activities(activity_key),
 enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN(0,1)),
 retain_recordings INTEGER NOT NULL DEFAULT 1 CHECK(retain_recordings=1),
 revision INTEGER NOT NULL DEFAULT 1,
 updated_at TEXT NOT NULL,
 updated_by_account_id TEXT NOT NULL REFERENCES accounts(account_id)
);
CREATE TABLE program_monthly_subscriptions (
 activity_key TEXT NOT NULL COLLATE NOCASE REFERENCES program_monthly_media_policies(activity_key),
 account_id TEXT NOT NULL COLLATE NOCASE REFERENCES accounts(account_id),
 lesson_month TEXT NOT NULL CHECK(length(lesson_month)=7 AND lesson_month GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]' AND substr(lesson_month,6,2) BETWEEN '01' AND '12'),
 active INTEGER NOT NULL CHECK(active IN(0,1)),
 class_ids_json TEXT NOT NULL CHECK(json_valid(class_ids_json) AND json_type(class_ids_json)='array'),
 payment_date TEXT NOT NULL DEFAULT '', payment_reference TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '',
 revision INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL,
 updated_by_account_id TEXT NOT NULL REFERENCES accounts(account_id),
 PRIMARY KEY(activity_key,account_id,lesson_month)
);
CREATE INDEX program_monthly_register ON program_monthly_subscriptions(activity_key,lesson_month,account_id);
CREATE INDEX program_monthly_own ON program_monthly_subscriptions(account_id,active,activity_key,lesson_month);

CREATE TRIGGER IF NOT EXISTS academy_snapshot_program_monthly_media_policies_insert AFTER INSERT ON "program_monthly_media_policies" BEGIN INSERT INTO academy_settings(setting_key,setting_value,updated_at,updated_by_account_id) VALUES('AcademySnapshot:authority:'||'GLOBAL','1',strftime('%Y-%m-%dT%H:%M:%fZ','now'),NULL) ON CONFLICT(setting_key) DO UPDATE SET setting_value=CAST(setting_value AS INTEGER)+1,updated_at=excluded.updated_at; END;
CREATE TRIGGER IF NOT EXISTS academy_snapshot_program_monthly_media_policies_update AFTER UPDATE ON "program_monthly_media_policies" BEGIN INSERT INTO academy_settings(setting_key,setting_value,updated_at,updated_by_account_id) VALUES('AcademySnapshot:authority:'||'GLOBAL','1',strftime('%Y-%m-%dT%H:%M:%fZ','now'),NULL) ON CONFLICT(setting_key) DO UPDATE SET setting_value=CAST(setting_value AS INTEGER)+1,updated_at=excluded.updated_at; END;
CREATE TRIGGER IF NOT EXISTS academy_snapshot_program_monthly_media_policies_delete AFTER DELETE ON "program_monthly_media_policies" BEGIN INSERT INTO academy_settings(setting_key,setting_value,updated_at,updated_by_account_id) VALUES('AcademySnapshot:authority:'||'GLOBAL','1',strftime('%Y-%m-%dT%H:%M:%fZ','now'),NULL) ON CONFLICT(setting_key) DO UPDATE SET setting_value=CAST(setting_value AS INTEGER)+1,updated_at=excluded.updated_at; END;
CREATE TRIGGER IF NOT EXISTS academy_snapshot_program_monthly_subscriptions_insert AFTER INSERT ON "program_monthly_subscriptions" BEGIN INSERT INTO academy_settings(setting_key,setting_value,updated_at,updated_by_account_id) VALUES('AcademySnapshot:authority:'||upper(NEW.account_id),'1',strftime('%Y-%m-%dT%H:%M:%fZ','now'),NULL) ON CONFLICT(setting_key) DO UPDATE SET setting_value=CAST(setting_value AS INTEGER)+1,updated_at=excluded.updated_at; END;
CREATE TRIGGER IF NOT EXISTS academy_snapshot_program_monthly_subscriptions_update AFTER UPDATE ON "program_monthly_subscriptions" BEGIN INSERT INTO academy_settings(setting_key,setting_value,updated_at,updated_by_account_id) VALUES('AcademySnapshot:authority:'||upper(OLD.account_id),'1',strftime('%Y-%m-%dT%H:%M:%fZ','now'),NULL) ON CONFLICT(setting_key) DO UPDATE SET setting_value=CAST(setting_value AS INTEGER)+1,updated_at=excluded.updated_at;
INSERT INTO academy_settings(setting_key,setting_value,updated_at,updated_by_account_id) VALUES('AcademySnapshot:authority:'||upper(NEW.account_id),'1',strftime('%Y-%m-%dT%H:%M:%fZ','now'),NULL) ON CONFLICT(setting_key) DO UPDATE SET setting_value=CAST(setting_value AS INTEGER)+1,updated_at=excluded.updated_at; END;
CREATE TRIGGER IF NOT EXISTS academy_snapshot_program_monthly_subscriptions_delete AFTER DELETE ON "program_monthly_subscriptions" BEGIN INSERT INTO academy_settings(setting_key,setting_value,updated_at,updated_by_account_id) VALUES('AcademySnapshot:authority:'||upper(OLD.account_id),'1',strftime('%Y-%m-%dT%H:%M:%fZ','now'),NULL) ON CONFLICT(setting_key) DO UPDATE SET setting_value=CAST(setting_value AS INTEGER)+1,updated_at=excluded.updated_at; END;
INSERT INTO academy_settings(setting_key,setting_value,updated_at,updated_by_account_id) VALUES('AcademySnapshot:Schema','1',strftime('%Y-%m-%dT%H:%M:%fZ','now'),NULL) ON CONFLICT(setting_key) DO NOTHING;
