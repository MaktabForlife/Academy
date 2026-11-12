-- Additional website grants only. This upgrade grants nobody access and changes no payment records.
CREATE TABLE program_surah_grants (
 activity_key TEXT NOT NULL COLLATE NOCASE REFERENCES activities(activity_key),
 account_id TEXT NOT NULL COLLATE NOCASE REFERENCES accounts(account_id),
 surah_id TEXT NOT NULL REFERENCES program_surahs(surah_id),
 active INTEGER NOT NULL CHECK(active IN(0,1)),
 note TEXT NOT NULL DEFAULT '' CHECK(length(note)<=500),
 revision INTEGER NOT NULL DEFAULT 1,
 updated_at TEXT NOT NULL,
 updated_by_account_id TEXT NOT NULL REFERENCES actor_refs(account_id),
 PRIMARY KEY(activity_key,account_id,surah_id)
);
CREATE INDEX program_surah_grants_own ON program_surah_grants(account_id,active,activity_key,surah_id);
CREATE TRIGGER split_fence_program_surah_grants_insert BEFORE INSERT ON program_surah_grants WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;
CREATE TRIGGER split_epoch_program_surah_grants_insert AFTER INSERT ON program_surah_grants BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;
CREATE TRIGGER split_fence_program_surah_grants_update BEFORE UPDATE ON program_surah_grants WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;
CREATE TRIGGER split_epoch_program_surah_grants_update AFTER UPDATE ON program_surah_grants BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;
CREATE TRIGGER split_fence_program_surah_grants_delete BEFORE DELETE ON program_surah_grants WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;
CREATE TRIGGER split_epoch_program_surah_grants_delete AFTER DELETE ON program_surah_grants BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;
CREATE TRIGGER IF NOT EXISTS academy_snapshot_program_surah_grants_insert AFTER INSERT ON "program_surah_grants" BEGIN INSERT INTO academy_settings(setting_key,setting_value,updated_at,updated_by_account_id) VALUES('AcademySnapshot:authority:'||upper(NEW.account_id),'1',strftime('%Y-%m-%dT%H:%M:%fZ','now'),NULL) ON CONFLICT(setting_key) DO UPDATE SET setting_value=CAST(setting_value AS INTEGER)+1,updated_at=excluded.updated_at; END;
CREATE TRIGGER IF NOT EXISTS academy_snapshot_program_surah_grants_update AFTER UPDATE ON "program_surah_grants" BEGIN INSERT INTO academy_settings(setting_key,setting_value,updated_at,updated_by_account_id) VALUES('AcademySnapshot:authority:'||upper(OLD.account_id),'1',strftime('%Y-%m-%dT%H:%M:%fZ','now'),NULL) ON CONFLICT(setting_key) DO UPDATE SET setting_value=CAST(setting_value AS INTEGER)+1,updated_at=excluded.updated_at;
INSERT INTO academy_settings(setting_key,setting_value,updated_at,updated_by_account_id) VALUES('AcademySnapshot:authority:'||upper(NEW.account_id),'1',strftime('%Y-%m-%dT%H:%M:%fZ','now'),NULL) ON CONFLICT(setting_key) DO UPDATE SET setting_value=CAST(setting_value AS INTEGER)+1,updated_at=excluded.updated_at; END;
CREATE TRIGGER IF NOT EXISTS academy_snapshot_program_surah_grants_delete AFTER DELETE ON "program_surah_grants" BEGIN INSERT INTO academy_settings(setting_key,setting_value,updated_at,updated_by_account_id) VALUES('AcademySnapshot:authority:'||upper(OLD.account_id),'1',strftime('%Y-%m-%dT%H:%M:%fZ','now'),NULL) ON CONFLICT(setting_key) DO UPDATE SET setting_value=CAST(setting_value AS INTEGER)+1,updated_at=excluded.updated_at; END;
INSERT INTO academy_settings(setting_key,setting_value,updated_at,updated_by_account_id) VALUES('AcademySnapshot:Schema','1',strftime('%Y-%m-%dT%H:%M:%fZ','now'),NULL) ON CONFLICT(setting_key) DO NOTHING;
