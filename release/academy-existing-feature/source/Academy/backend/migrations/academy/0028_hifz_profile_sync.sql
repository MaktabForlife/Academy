-- Durable one-way delivery metadata; account/contact/credential tables remain intact.
CREATE TABLE hifz_profile_sync (
 account_id TEXT PRIMARY KEY COLLATE NOCASE NOT NULL REFERENCES accounts(account_id),
 revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>=1),
 delivered_revision INTEGER NOT NULL DEFAULT 0 CHECK(delivered_revision>=0),
 pin_reset_version INTEGER NOT NULL DEFAULT 0 CHECK(pin_reset_version>=0),
 attempts INTEGER NOT NULL DEFAULT 0,
 next_attempt_at INTEGER NOT NULL DEFAULT 0,
 last_error_code TEXT,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX hifz_profile_sync_pending ON hifz_profile_sync(next_attempt_at) WHERE revision>delivered_revision;
INSERT INTO academy_settings(setting_key,setting_value) VALUES('HifzProfileActivityKey','PROGRAM:PRG-3d6b7972-644c-4f81-b95c-8d6c7ffb8227');

-- Global Admin inherits Program Admin. Access follows Academy's effective Hifz roles.
CREATE VIEW hifz_profile_sync_projection AS
SELECT a.account_id,a.display_name,a.login_link_id,
 COALESCE(c.whatsapp_number,'') AS whatsapp_number,
 CASE WHEN EXISTS(SELECT 1 FROM global_role_assignments g WHERE g.account_id=a.account_id AND g.active=1 AND g.role='GLOBAL_ADMIN' AND g.review_state='CONFIRMED')
   OR EXISTS(SELECT 1 FROM effective_activity_roles r WHERE r.account_id=a.account_id AND r.activity_key=s.setting_value AND r.role='PROGRAM_ADMIN') THEN 'admin'
  WHEN EXISTS(SELECT 1 FROM effective_activity_roles r WHERE r.account_id=a.account_id AND r.activity_key=s.setting_value AND r.role='TEACHER') THEN 'teacher'
  ELSE 'student' END AS role,
 CASE WHEN a.active=1 AND EXISTS(SELECT 1 FROM activities x WHERE x.activity_key=s.setting_value AND x.active=1 AND x.lifecycle='ACTIVE') AND
  (EXISTS(SELECT 1 FROM global_role_assignments g WHERE g.account_id=a.account_id AND g.active=1 AND g.role='GLOBAL_ADMIN' AND g.review_state='CONFIRMED') OR
   EXISTS(SELECT 1 FROM effective_activity_roles r WHERE r.account_id=a.account_id AND r.activity_key=s.setting_value AND r.role IN('STUDENT','TEACHER','PROGRAM_ADMIN'))) THEN 1 ELSE 0 END AS active
FROM accounts a JOIN academy_settings s ON s.setting_key='HifzProfileActivityKey'
LEFT JOIN account_contact_details c USING(account_id);

-- Existing links are seeded only after exact identity reconciliation.
-- Subsequent Hifz grants can provision a new profile through the receiver.
CREATE TRIGGER hifz_sync_account AFTER UPDATE OF display_name,login_link_id,active,revision ON accounts BEGIN
INSERT INTO hifz_profile_sync(account_id)
 SELECT NEW.account_id WHERE (1) AND
 (EXISTS(SELECT 1 FROM hifz_profile_sync q WHERE q.account_id=NEW.account_id) OR
  EXISTS(SELECT 1 FROM hifz_profile_sync_projection p WHERE p.account_id=NEW.account_id AND p.active=1))
 ON CONFLICT(account_id) DO UPDATE SET revision=revision+1,attempts=0,next_attempt_at=0,last_error_code=NULL,updated_at=CURRENT_TIMESTAMP;
END;
CREATE TRIGGER hifz_sync_account_contact_details_insert AFTER INSERT ON account_contact_details BEGIN
INSERT INTO hifz_profile_sync(account_id)
 SELECT NEW.account_id WHERE (1) AND
 (EXISTS(SELECT 1 FROM hifz_profile_sync q WHERE q.account_id=NEW.account_id) OR
  EXISTS(SELECT 1 FROM hifz_profile_sync_projection p WHERE p.account_id=NEW.account_id AND p.active=1))
 ON CONFLICT(account_id) DO UPDATE SET revision=revision+1,attempts=0,next_attempt_at=0,last_error_code=NULL,updated_at=CURRENT_TIMESTAMP;
END;
CREATE TRIGGER hifz_sync_account_contact_details_update AFTER UPDATE ON account_contact_details BEGIN
INSERT INTO hifz_profile_sync(account_id)
 SELECT NEW.account_id WHERE (1) AND
 (EXISTS(SELECT 1 FROM hifz_profile_sync q WHERE q.account_id=NEW.account_id) OR
  EXISTS(SELECT 1 FROM hifz_profile_sync_projection p WHERE p.account_id=NEW.account_id AND p.active=1))
 ON CONFLICT(account_id) DO UPDATE SET revision=revision+1,attempts=0,next_attempt_at=0,last_error_code=NULL,updated_at=CURRENT_TIMESTAMP;
INSERT INTO hifz_profile_sync(account_id)
 SELECT OLD.account_id WHERE (OLD.account_id<>NEW.account_id) AND (1) AND
 (EXISTS(SELECT 1 FROM hifz_profile_sync q WHERE q.account_id=OLD.account_id) OR
  EXISTS(SELECT 1 FROM hifz_profile_sync_projection p WHERE p.account_id=OLD.account_id AND p.active=1))
 ON CONFLICT(account_id) DO UPDATE SET revision=revision+1,attempts=0,next_attempt_at=0,last_error_code=NULL,updated_at=CURRENT_TIMESTAMP;
END;
CREATE TRIGGER hifz_sync_account_contact_details_delete AFTER DELETE ON account_contact_details BEGIN
INSERT INTO hifz_profile_sync(account_id)
 SELECT OLD.account_id WHERE (1) AND
 (EXISTS(SELECT 1 FROM hifz_profile_sync q WHERE q.account_id=OLD.account_id) OR
  EXISTS(SELECT 1 FROM hifz_profile_sync_projection p WHERE p.account_id=OLD.account_id AND p.active=1))
 ON CONFLICT(account_id) DO UPDATE SET revision=revision+1,attempts=0,next_attempt_at=0,last_error_code=NULL,updated_at=CURRENT_TIMESTAMP;
END;
CREATE TRIGGER hifz_sync_role_assignments_insert AFTER INSERT ON role_assignments BEGIN
INSERT INTO hifz_profile_sync(account_id)
 SELECT NEW.account_id WHERE (NEW.activity_key=(SELECT setting_value FROM academy_settings WHERE setting_key='HifzProfileActivityKey')) AND
 (EXISTS(SELECT 1 FROM hifz_profile_sync q WHERE q.account_id=NEW.account_id) OR
  EXISTS(SELECT 1 FROM hifz_profile_sync_projection p WHERE p.account_id=NEW.account_id AND p.active=1))
 ON CONFLICT(account_id) DO UPDATE SET revision=revision+1,attempts=0,next_attempt_at=0,last_error_code=NULL,updated_at=CURRENT_TIMESTAMP;
END;
CREATE TRIGGER hifz_sync_role_assignments_update AFTER UPDATE ON role_assignments BEGIN
INSERT INTO hifz_profile_sync(account_id)
 SELECT NEW.account_id WHERE (NEW.activity_key=(SELECT setting_value FROM academy_settings WHERE setting_key='HifzProfileActivityKey')) AND
 (EXISTS(SELECT 1 FROM hifz_profile_sync q WHERE q.account_id=NEW.account_id) OR
  EXISTS(SELECT 1 FROM hifz_profile_sync_projection p WHERE p.account_id=NEW.account_id AND p.active=1))
 ON CONFLICT(account_id) DO UPDATE SET revision=revision+1,attempts=0,next_attempt_at=0,last_error_code=NULL,updated_at=CURRENT_TIMESTAMP;
INSERT INTO hifz_profile_sync(account_id)
 SELECT OLD.account_id WHERE (OLD.account_id<>NEW.account_id OR OLD.activity_key<>NEW.activity_key) AND (OLD.activity_key=(SELECT setting_value FROM academy_settings WHERE setting_key='HifzProfileActivityKey')) AND
 (EXISTS(SELECT 1 FROM hifz_profile_sync q WHERE q.account_id=OLD.account_id) OR
  EXISTS(SELECT 1 FROM hifz_profile_sync_projection p WHERE p.account_id=OLD.account_id AND p.active=1))
 ON CONFLICT(account_id) DO UPDATE SET revision=revision+1,attempts=0,next_attempt_at=0,last_error_code=NULL,updated_at=CURRENT_TIMESTAMP;
END;
CREATE TRIGGER hifz_sync_role_assignments_delete AFTER DELETE ON role_assignments BEGIN
INSERT INTO hifz_profile_sync(account_id)
 SELECT OLD.account_id WHERE (OLD.activity_key=(SELECT setting_value FROM academy_settings WHERE setting_key='HifzProfileActivityKey')) AND
 (EXISTS(SELECT 1 FROM hifz_profile_sync q WHERE q.account_id=OLD.account_id) OR
  EXISTS(SELECT 1 FROM hifz_profile_sync_projection p WHERE p.account_id=OLD.account_id AND p.active=1))
 ON CONFLICT(account_id) DO UPDATE SET revision=revision+1,attempts=0,next_attempt_at=0,last_error_code=NULL,updated_at=CURRENT_TIMESTAMP;
END;
CREATE TRIGGER hifz_sync_global_role_assignments_insert AFTER INSERT ON global_role_assignments BEGIN
INSERT INTO hifz_profile_sync(account_id)
 SELECT NEW.account_id WHERE (1) AND
 (EXISTS(SELECT 1 FROM hifz_profile_sync q WHERE q.account_id=NEW.account_id) OR
  EXISTS(SELECT 1 FROM hifz_profile_sync_projection p WHERE p.account_id=NEW.account_id AND p.active=1))
 ON CONFLICT(account_id) DO UPDATE SET revision=revision+1,attempts=0,next_attempt_at=0,last_error_code=NULL,updated_at=CURRENT_TIMESTAMP;
END;
CREATE TRIGGER hifz_sync_global_role_assignments_update AFTER UPDATE ON global_role_assignments BEGIN
INSERT INTO hifz_profile_sync(account_id)
 SELECT NEW.account_id WHERE (1) AND
 (EXISTS(SELECT 1 FROM hifz_profile_sync q WHERE q.account_id=NEW.account_id) OR
  EXISTS(SELECT 1 FROM hifz_profile_sync_projection p WHERE p.account_id=NEW.account_id AND p.active=1))
 ON CONFLICT(account_id) DO UPDATE SET revision=revision+1,attempts=0,next_attempt_at=0,last_error_code=NULL,updated_at=CURRENT_TIMESTAMP;
INSERT INTO hifz_profile_sync(account_id)
 SELECT OLD.account_id WHERE (OLD.account_id<>NEW.account_id) AND (1) AND
 (EXISTS(SELECT 1 FROM hifz_profile_sync q WHERE q.account_id=OLD.account_id) OR
  EXISTS(SELECT 1 FROM hifz_profile_sync_projection p WHERE p.account_id=OLD.account_id AND p.active=1))
 ON CONFLICT(account_id) DO UPDATE SET revision=revision+1,attempts=0,next_attempt_at=0,last_error_code=NULL,updated_at=CURRENT_TIMESTAMP;
END;
CREATE TRIGGER hifz_sync_global_role_assignments_delete AFTER DELETE ON global_role_assignments BEGIN
INSERT INTO hifz_profile_sync(account_id)
 SELECT OLD.account_id WHERE (1) AND
 (EXISTS(SELECT 1 FROM hifz_profile_sync q WHERE q.account_id=OLD.account_id) OR
  EXISTS(SELECT 1 FROM hifz_profile_sync_projection p WHERE p.account_id=OLD.account_id AND p.active=1))
 ON CONFLICT(account_id) DO UPDATE SET revision=revision+1,attempts=0,next_attempt_at=0,last_error_code=NULL,updated_at=CURRENT_TIMESTAMP;
END;
CREATE TRIGGER hifz_sync_role_import_reviews_insert AFTER INSERT ON role_import_reviews BEGIN
INSERT INTO hifz_profile_sync(account_id)
 SELECT NEW.account_id WHERE (NEW.activity_key=(SELECT setting_value FROM academy_settings WHERE setting_key='HifzProfileActivityKey')) AND
 (EXISTS(SELECT 1 FROM hifz_profile_sync q WHERE q.account_id=NEW.account_id) OR
  EXISTS(SELECT 1 FROM hifz_profile_sync_projection p WHERE p.account_id=NEW.account_id AND p.active=1))
 ON CONFLICT(account_id) DO UPDATE SET revision=revision+1,attempts=0,next_attempt_at=0,last_error_code=NULL,updated_at=CURRENT_TIMESTAMP;
END;
CREATE TRIGGER hifz_sync_role_import_reviews_update AFTER UPDATE ON role_import_reviews BEGIN
INSERT INTO hifz_profile_sync(account_id)
 SELECT NEW.account_id WHERE (NEW.activity_key=(SELECT setting_value FROM academy_settings WHERE setting_key='HifzProfileActivityKey')) AND
 (EXISTS(SELECT 1 FROM hifz_profile_sync q WHERE q.account_id=NEW.account_id) OR
  EXISTS(SELECT 1 FROM hifz_profile_sync_projection p WHERE p.account_id=NEW.account_id AND p.active=1))
 ON CONFLICT(account_id) DO UPDATE SET revision=revision+1,attempts=0,next_attempt_at=0,last_error_code=NULL,updated_at=CURRENT_TIMESTAMP;
INSERT INTO hifz_profile_sync(account_id)
 SELECT OLD.account_id WHERE (OLD.account_id<>NEW.account_id OR OLD.activity_key<>NEW.activity_key) AND (OLD.activity_key=(SELECT setting_value FROM academy_settings WHERE setting_key='HifzProfileActivityKey')) AND
 (EXISTS(SELECT 1 FROM hifz_profile_sync q WHERE q.account_id=OLD.account_id) OR
  EXISTS(SELECT 1 FROM hifz_profile_sync_projection p WHERE p.account_id=OLD.account_id AND p.active=1))
 ON CONFLICT(account_id) DO UPDATE SET revision=revision+1,attempts=0,next_attempt_at=0,last_error_code=NULL,updated_at=CURRENT_TIMESTAMP;
END;
CREATE TRIGGER hifz_sync_role_import_reviews_delete AFTER DELETE ON role_import_reviews BEGIN
INSERT INTO hifz_profile_sync(account_id)
 SELECT OLD.account_id WHERE (OLD.activity_key=(SELECT setting_value FROM academy_settings WHERE setting_key='HifzProfileActivityKey')) AND
 (EXISTS(SELECT 1 FROM hifz_profile_sync q WHERE q.account_id=OLD.account_id) OR
  EXISTS(SELECT 1 FROM hifz_profile_sync_projection p WHERE p.account_id=OLD.account_id AND p.active=1))
 ON CONFLICT(account_id) DO UPDATE SET revision=revision+1,attempts=0,next_attempt_at=0,last_error_code=NULL,updated_at=CURRENT_TIMESTAMP;
END;
CREATE TRIGGER hifz_sync_legacy_access_evidence_insert AFTER INSERT ON legacy_access_evidence BEGIN
INSERT INTO hifz_profile_sync(account_id)
 SELECT NEW.account_id WHERE (NEW.activity_key=(SELECT setting_value FROM academy_settings WHERE setting_key='HifzProfileActivityKey')) AND
 (EXISTS(SELECT 1 FROM hifz_profile_sync q WHERE q.account_id=NEW.account_id) OR
  EXISTS(SELECT 1 FROM hifz_profile_sync_projection p WHERE p.account_id=NEW.account_id AND p.active=1))
 ON CONFLICT(account_id) DO UPDATE SET revision=revision+1,attempts=0,next_attempt_at=0,last_error_code=NULL,updated_at=CURRENT_TIMESTAMP;
END;
CREATE TRIGGER hifz_sync_legacy_access_evidence_update AFTER UPDATE ON legacy_access_evidence BEGIN
INSERT INTO hifz_profile_sync(account_id)
 SELECT NEW.account_id WHERE (NEW.activity_key=(SELECT setting_value FROM academy_settings WHERE setting_key='HifzProfileActivityKey')) AND
 (EXISTS(SELECT 1 FROM hifz_profile_sync q WHERE q.account_id=NEW.account_id) OR
  EXISTS(SELECT 1 FROM hifz_profile_sync_projection p WHERE p.account_id=NEW.account_id AND p.active=1))
 ON CONFLICT(account_id) DO UPDATE SET revision=revision+1,attempts=0,next_attempt_at=0,last_error_code=NULL,updated_at=CURRENT_TIMESTAMP;
INSERT INTO hifz_profile_sync(account_id)
 SELECT OLD.account_id WHERE (OLD.account_id<>NEW.account_id OR OLD.activity_key<>NEW.activity_key) AND (OLD.activity_key=(SELECT setting_value FROM academy_settings WHERE setting_key='HifzProfileActivityKey')) AND
 (EXISTS(SELECT 1 FROM hifz_profile_sync q WHERE q.account_id=OLD.account_id) OR
  EXISTS(SELECT 1 FROM hifz_profile_sync_projection p WHERE p.account_id=OLD.account_id AND p.active=1))
 ON CONFLICT(account_id) DO UPDATE SET revision=revision+1,attempts=0,next_attempt_at=0,last_error_code=NULL,updated_at=CURRENT_TIMESTAMP;
END;
CREATE TRIGGER hifz_sync_legacy_access_evidence_delete AFTER DELETE ON legacy_access_evidence BEGIN
INSERT INTO hifz_profile_sync(account_id)
 SELECT OLD.account_id WHERE (OLD.activity_key=(SELECT setting_value FROM academy_settings WHERE setting_key='HifzProfileActivityKey')) AND
 (EXISTS(SELECT 1 FROM hifz_profile_sync q WHERE q.account_id=OLD.account_id) OR
  EXISTS(SELECT 1 FROM hifz_profile_sync_projection p WHERE p.account_id=OLD.account_id AND p.active=1))
 ON CONFLICT(account_id) DO UPDATE SET revision=revision+1,attempts=0,next_attempt_at=0,last_error_code=NULL,updated_at=CURRENT_TIMESTAMP;
END;
CREATE TRIGGER hifz_sync_pin_reset AFTER UPDATE OF pin_setup,credential_epoch ON account_credentials
WHEN NEW.pin_setup=0 AND NEW.credential_epoch>OLD.credential_epoch
BEGIN
 UPDATE hifz_profile_sync SET revision=revision+1,pin_reset_version=pin_reset_version+1,
 attempts=0,next_attempt_at=0,last_error_code=NULL,updated_at=CURRENT_TIMESTAMP WHERE account_id=NEW.account_id;
END;
CREATE TRIGGER hifz_sync_program AFTER UPDATE OF active,lifecycle ON activities
WHEN NEW.activity_key=(SELECT setting_value FROM academy_settings WHERE setting_key='HifzProfileActivityKey')
BEGIN
 UPDATE hifz_profile_sync SET revision=revision+1,attempts=0,next_attempt_at=0,last_error_code=NULL,updated_at=CURRENT_TIMESTAMP;
END;
CREATE TRIGGER hifz_sync_role_mapping AFTER INSERT ON role_mapping_decisions
BEGIN
 UPDATE hifz_profile_sync SET revision=revision+1,attempts=0,next_attempt_at=0,last_error_code=NULL,updated_at=CURRENT_TIMESTAMP;
END;
CREATE TRIGGER hifz_sync_role_mapping_update AFTER UPDATE ON role_mapping_decisions
BEGIN
 UPDATE hifz_profile_sync SET revision=revision+1,attempts=0,next_attempt_at=0,last_error_code=NULL,updated_at=CURRENT_TIMESTAMP;
END;
CREATE TRIGGER hifz_sync_role_mapping_delete AFTER DELETE ON role_mapping_decisions
BEGIN
 UPDATE hifz_profile_sync SET revision=revision+1,attempts=0,next_attempt_at=0,last_error_code=NULL,updated_at=CURRENT_TIMESTAMP;
END;
