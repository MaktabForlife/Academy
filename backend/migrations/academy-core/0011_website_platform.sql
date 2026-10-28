-- Local feature-branch preparation only. No accounts or admissions are seeded.
CREATE TABLE website_platform_admissions(account_id TEXT PRIMARY KEY REFERENCES accounts(account_id),active INTEGER NOT NULL CHECK(active IN(0,1)));
CREATE TABLE website_platform_streams(stream TEXT PRIMARY KEY,version INTEGER NOT NULL);
CREATE TABLE website_platform_outbox(operation_id TEXT PRIMARY KEY,stream TEXT NOT NULL,version INTEGER NOT NULL,event_json TEXT NOT NULL,acknowledged INTEGER NOT NULL DEFAULT 0,attempts INTEGER NOT NULL DEFAULT 0,next_attempt INTEGER NOT NULL DEFAULT 0,UNIQUE(stream,version));
CREATE INDEX website_platform_pending ON website_platform_outbox(acknowledged,next_attempt,stream,version);
CREATE INDEX website_platform_account_pending ON website_platform_outbox(stream,acknowledged,version);
CREATE TABLE website_platform_sessions(source_ref TEXT PRIMARY KEY,account_id TEXT NOT NULL REFERENCES accounts(account_id),session_id TEXT NOT NULL,epoch INTEGER NOT NULL,context_json TEXT NOT NULL,expires_at INTEGER NOT NULL,challenge TEXT,state TEXT);
CREATE INDEX website_platform_sessions_source ON website_platform_sessions(session_id);
CREATE TABLE website_platform_return_codes(code_hash TEXT PRIMARY KEY,source_ref TEXT NOT NULL REFERENCES website_platform_sessions(source_ref),challenge TEXT NOT NULL,state TEXT NOT NULL,expires_at INTEGER NOT NULL,used INTEGER NOT NULL DEFAULT 0);
CREATE TABLE website_platform_provisioning(operation_id TEXT PRIMARY KEY,actor_id TEXT NOT NULL,payload_hash TEXT NOT NULL,account_id TEXT NOT NULL REFERENCES accounts(account_id),event_json TEXT);
CREATE TABLE website_platform_guards(guard_id TEXT PRIMARY KEY,accepted INTEGER NOT NULL CHECK(accepted=1));
CREATE VIEW website_platform_account_state AS SELECT a.account_id,a.display_name,a.active,c.credential_epoch epoch,
 COALESCE((SELECT active FROM website_platform_admissions x WHERE x.account_id=a.account_id),1) admitted,
 EXISTS(SELECT 1 FROM global_role_assignments g WHERE g.account_id=a.account_id AND g.role='GLOBAL_ADMIN' AND g.active=1 AND g.review_state='CONFIRMED') global_admin
 FROM accounts a JOIN account_credentials c USING(account_id);

CREATE TABLE website_platform_control(singleton INTEGER PRIMARY KEY CHECK(singleton=1),enabled INTEGER NOT NULL CHECK(enabled IN(0,1)));
INSERT INTO website_platform_control VALUES(1,0);
CREATE TRIGGER website_platform_accounts_update AFTER UPDATE OF active,display_name ON accounts WHEN (SELECT enabled FROM website_platform_control WHERE singleton=1)=1 BEGIN
 INSERT INTO website_platform_streams VALUES('account:'||NEW.account_id,1) ON CONFLICT(stream) DO UPDATE SET version=version+1;
 INSERT INTO website_platform_outbox(operation_id,stream,version,event_json)
 SELECT lower(hex(randomblob(16))),'account:'||a.account_id,v.version,
 json_object('type','account','account',json_object('accountId',a.account_id,'displayName',a.display_name,'active',json(CASE a.active WHEN 1 THEN 'true' ELSE 'false' END),'admitted',json(CASE a.admitted WHEN 1 THEN 'true' ELSE 'false' END),'epoch',a.epoch,'globalAdmin',json(CASE a.global_admin WHEN 1 THEN 'true' ELSE 'false' END),'verifiedAt',CAST(strftime('%s','now') AS INTEGER)*1000+CAST(substr(strftime('%f','now'),4,3) AS INTEGER)))
 FROM website_platform_account_state a JOIN website_platform_streams v ON v.stream='account:'||a.account_id WHERE a.account_id=NEW.account_id;
 INSERT INTO academy_settings(setting_key,setting_value,updated_at) VALUES('AcademySnapshot:authority:'||upper(NEW.account_id),'1',strftime('%Y-%m-%dT%H:%M:%fZ','now')) ON CONFLICT(setting_key) DO UPDATE SET setting_value=CAST(setting_value AS INTEGER)+1;
 END;
CREATE TRIGGER website_platform_account_credentials_update AFTER UPDATE OF credential_epoch ON account_credentials WHEN (SELECT enabled FROM website_platform_control WHERE singleton=1)=1 BEGIN
 INSERT INTO website_platform_streams VALUES('account:'||NEW.account_id,1) ON CONFLICT(stream) DO UPDATE SET version=version+1;
 INSERT INTO website_platform_outbox(operation_id,stream,version,event_json)
 SELECT lower(hex(randomblob(16))),'account:'||a.account_id,v.version,
 json_object('type','account','account',json_object('accountId',a.account_id,'displayName',a.display_name,'active',json(CASE a.active WHEN 1 THEN 'true' ELSE 'false' END),'admitted',json(CASE a.admitted WHEN 1 THEN 'true' ELSE 'false' END),'epoch',a.epoch,'globalAdmin',json(CASE a.global_admin WHEN 1 THEN 'true' ELSE 'false' END),'verifiedAt',CAST(strftime('%s','now') AS INTEGER)*1000+CAST(substr(strftime('%f','now'),4,3) AS INTEGER)))
 FROM website_platform_account_state a JOIN website_platform_streams v ON v.stream='account:'||a.account_id WHERE a.account_id=NEW.account_id;
 INSERT INTO academy_settings(setting_key,setting_value,updated_at) VALUES('AcademySnapshot:authority:'||upper(NEW.account_id),'1',strftime('%Y-%m-%dT%H:%M:%fZ','now')) ON CONFLICT(setting_key) DO UPDATE SET setting_value=CAST(setting_value AS INTEGER)+1;
 END;
CREATE TRIGGER website_platform_website_platform_admissions_insert AFTER INSERT ON website_platform_admissions WHEN (SELECT enabled FROM website_platform_control WHERE singleton=1)=1 BEGIN
 INSERT INTO website_platform_streams VALUES('account:'||NEW.account_id,1) ON CONFLICT(stream) DO UPDATE SET version=version+1;
 INSERT INTO website_platform_outbox(operation_id,stream,version,event_json)
 SELECT lower(hex(randomblob(16))),'account:'||a.account_id,v.version,
 json_object('type','account','account',json_object('accountId',a.account_id,'displayName',a.display_name,'active',json(CASE a.active WHEN 1 THEN 'true' ELSE 'false' END),'admitted',json(CASE a.admitted WHEN 1 THEN 'true' ELSE 'false' END),'epoch',a.epoch,'globalAdmin',json(CASE a.global_admin WHEN 1 THEN 'true' ELSE 'false' END),'verifiedAt',CAST(strftime('%s','now') AS INTEGER)*1000+CAST(substr(strftime('%f','now'),4,3) AS INTEGER)))
 FROM website_platform_account_state a JOIN website_platform_streams v ON v.stream='account:'||a.account_id WHERE a.account_id=NEW.account_id;
 INSERT INTO academy_settings(setting_key,setting_value,updated_at) VALUES('AcademySnapshot:authority:'||upper(NEW.account_id),'1',strftime('%Y-%m-%dT%H:%M:%fZ','now')) ON CONFLICT(setting_key) DO UPDATE SET setting_value=CAST(setting_value AS INTEGER)+1;
 END;
CREATE TRIGGER website_platform_website_platform_admissions_update AFTER UPDATE OF active ON website_platform_admissions WHEN (SELECT enabled FROM website_platform_control WHERE singleton=1)=1 BEGIN
 INSERT INTO website_platform_streams VALUES('account:'||NEW.account_id,1) ON CONFLICT(stream) DO UPDATE SET version=version+1;
 INSERT INTO website_platform_outbox(operation_id,stream,version,event_json)
 SELECT lower(hex(randomblob(16))),'account:'||a.account_id,v.version,
 json_object('type','account','account',json_object('accountId',a.account_id,'displayName',a.display_name,'active',json(CASE a.active WHEN 1 THEN 'true' ELSE 'false' END),'admitted',json(CASE a.admitted WHEN 1 THEN 'true' ELSE 'false' END),'epoch',a.epoch,'globalAdmin',json(CASE a.global_admin WHEN 1 THEN 'true' ELSE 'false' END),'verifiedAt',CAST(strftime('%s','now') AS INTEGER)*1000+CAST(substr(strftime('%f','now'),4,3) AS INTEGER)))
 FROM website_platform_account_state a JOIN website_platform_streams v ON v.stream='account:'||a.account_id WHERE a.account_id=NEW.account_id;
 INSERT INTO academy_settings(setting_key,setting_value,updated_at) VALUES('AcademySnapshot:authority:'||upper(NEW.account_id),'1',strftime('%Y-%m-%dT%H:%M:%fZ','now')) ON CONFLICT(setting_key) DO UPDATE SET setting_value=CAST(setting_value AS INTEGER)+1;
 END;
CREATE TRIGGER website_platform_website_platform_admissions_delete AFTER DELETE ON website_platform_admissions WHEN (SELECT enabled FROM website_platform_control WHERE singleton=1)=1 BEGIN
 INSERT INTO website_platform_streams VALUES('account:'||OLD.account_id,1) ON CONFLICT(stream) DO UPDATE SET version=version+1;
 INSERT INTO website_platform_outbox(operation_id,stream,version,event_json)
 SELECT lower(hex(randomblob(16))),'account:'||a.account_id,v.version,
 json_object('type','account','account',json_object('accountId',a.account_id,'displayName',a.display_name,'active',json(CASE a.active WHEN 1 THEN 'true' ELSE 'false' END),'admitted',json(CASE a.admitted WHEN 1 THEN 'true' ELSE 'false' END),'epoch',a.epoch,'globalAdmin',json(CASE a.global_admin WHEN 1 THEN 'true' ELSE 'false' END),'verifiedAt',CAST(strftime('%s','now') AS INTEGER)*1000+CAST(substr(strftime('%f','now'),4,3) AS INTEGER)))
 FROM website_platform_account_state a JOIN website_platform_streams v ON v.stream='account:'||a.account_id WHERE a.account_id=OLD.account_id;
 INSERT INTO academy_settings(setting_key,setting_value,updated_at) VALUES('AcademySnapshot:authority:'||upper(OLD.account_id),'1',strftime('%Y-%m-%dT%H:%M:%fZ','now')) ON CONFLICT(setting_key) DO UPDATE SET setting_value=CAST(setting_value AS INTEGER)+1;
 END;
CREATE TRIGGER website_platform_global_role_assignments_insert AFTER INSERT ON global_role_assignments WHEN (SELECT enabled FROM website_platform_control WHERE singleton=1)=1 BEGIN
 INSERT INTO website_platform_streams VALUES('account:'||NEW.account_id,1) ON CONFLICT(stream) DO UPDATE SET version=version+1;
 INSERT INTO website_platform_outbox(operation_id,stream,version,event_json)
 SELECT lower(hex(randomblob(16))),'account:'||a.account_id,v.version,
 json_object('type','account','account',json_object('accountId',a.account_id,'displayName',a.display_name,'active',json(CASE a.active WHEN 1 THEN 'true' ELSE 'false' END),'admitted',json(CASE a.admitted WHEN 1 THEN 'true' ELSE 'false' END),'epoch',a.epoch,'globalAdmin',json(CASE a.global_admin WHEN 1 THEN 'true' ELSE 'false' END),'verifiedAt',CAST(strftime('%s','now') AS INTEGER)*1000+CAST(substr(strftime('%f','now'),4,3) AS INTEGER)))
 FROM website_platform_account_state a JOIN website_platform_streams v ON v.stream='account:'||a.account_id WHERE a.account_id=NEW.account_id;
 INSERT INTO academy_settings(setting_key,setting_value,updated_at) VALUES('AcademySnapshot:authority:'||upper(NEW.account_id),'1',strftime('%Y-%m-%dT%H:%M:%fZ','now')) ON CONFLICT(setting_key) DO UPDATE SET setting_value=CAST(setting_value AS INTEGER)+1;
 END;
CREATE TRIGGER website_platform_global_role_assignments_update AFTER UPDATE OF active,review_state ON global_role_assignments WHEN (SELECT enabled FROM website_platform_control WHERE singleton=1)=1 BEGIN
 INSERT INTO website_platform_streams VALUES('account:'||NEW.account_id,1) ON CONFLICT(stream) DO UPDATE SET version=version+1;
 INSERT INTO website_platform_outbox(operation_id,stream,version,event_json)
 SELECT lower(hex(randomblob(16))),'account:'||a.account_id,v.version,
 json_object('type','account','account',json_object('accountId',a.account_id,'displayName',a.display_name,'active',json(CASE a.active WHEN 1 THEN 'true' ELSE 'false' END),'admitted',json(CASE a.admitted WHEN 1 THEN 'true' ELSE 'false' END),'epoch',a.epoch,'globalAdmin',json(CASE a.global_admin WHEN 1 THEN 'true' ELSE 'false' END),'verifiedAt',CAST(strftime('%s','now') AS INTEGER)*1000+CAST(substr(strftime('%f','now'),4,3) AS INTEGER)))
 FROM website_platform_account_state a JOIN website_platform_streams v ON v.stream='account:'||a.account_id WHERE a.account_id=NEW.account_id;
 INSERT INTO academy_settings(setting_key,setting_value,updated_at) VALUES('AcademySnapshot:authority:'||upper(NEW.account_id),'1',strftime('%Y-%m-%dT%H:%M:%fZ','now')) ON CONFLICT(setting_key) DO UPDATE SET setting_value=CAST(setting_value AS INTEGER)+1;
 END;
CREATE TRIGGER website_platform_global_role_assignments_delete AFTER DELETE ON global_role_assignments WHEN (SELECT enabled FROM website_platform_control WHERE singleton=1)=1 BEGIN
 INSERT INTO website_platform_streams VALUES('account:'||OLD.account_id,1) ON CONFLICT(stream) DO UPDATE SET version=version+1;
 INSERT INTO website_platform_outbox(operation_id,stream,version,event_json)
 SELECT lower(hex(randomblob(16))),'account:'||a.account_id,v.version,
 json_object('type','account','account',json_object('accountId',a.account_id,'displayName',a.display_name,'active',json(CASE a.active WHEN 1 THEN 'true' ELSE 'false' END),'admitted',json(CASE a.admitted WHEN 1 THEN 'true' ELSE 'false' END),'epoch',a.epoch,'globalAdmin',json(CASE a.global_admin WHEN 1 THEN 'true' ELSE 'false' END),'verifiedAt',CAST(strftime('%s','now') AS INTEGER)*1000+CAST(substr(strftime('%f','now'),4,3) AS INTEGER)))
 FROM website_platform_account_state a JOIN website_platform_streams v ON v.stream='account:'||a.account_id WHERE a.account_id=OLD.account_id;
 INSERT INTO academy_settings(setting_key,setting_value,updated_at) VALUES('AcademySnapshot:authority:'||upper(OLD.account_id),'1',strftime('%Y-%m-%dT%H:%M:%fZ','now')) ON CONFLICT(setting_key) DO UPDATE SET setting_value=CAST(setting_value AS INTEGER)+1;
 END;
CREATE TRIGGER website_platform_session_revoke AFTER UPDATE OF revoked_at ON account_sessions
 WHEN NEW.revoked_at IS NOT NULL AND OLD.revoked_at IS NULL AND (SELECT enabled FROM website_platform_control WHERE singleton=1)=1 BEGIN
 INSERT INTO website_platform_streams SELECT 'session:'||source_ref,1 FROM website_platform_sessions WHERE session_id=NEW.session_id ON CONFLICT(stream) DO UPDATE SET version=version+1;
 INSERT INTO website_platform_outbox(operation_id,stream,version,event_json)
 SELECT lower(hex(randomblob(16))),'session:'||b.source_ref,v.version,json_object('type','session-revoked','sourceRef',b.source_ref)
 FROM website_platform_sessions b JOIN website_platform_streams v ON v.stream='session:'||b.source_ref WHERE b.session_id=NEW.session_id;
 END;
