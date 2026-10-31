-- Operational monthly bridge policy only. No native media policy, identity,
-- role, paid month, grant, media, timetable or live ownership is seeded.
CREATE TABLE website_platform_programmes(
 activity_key TEXT PRIMARY KEY COLLATE NOCASE REFERENCES activities(activity_key),
 programme_key TEXT NOT NULL UNIQUE CHECK(programme_key='mothers'),
 access_model TEXT NOT NULL CHECK(access_model='MONTHLY'),
 enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN(0,1))
);
CREATE TABLE website_platform_programme_operations(operation_id TEXT PRIMARY KEY,actor_id TEXT NOT NULL,payload_hash TEXT NOT NULL,result_json TEXT NOT NULL,created_at INTEGER NOT NULL);
CREATE TRIGGER website_programme_policy_update AFTER UPDATE ON website_platform_programmes BEGIN
 INSERT INTO website_platform_access_dirty(activity_key,account_id) SELECT NEW.activity_key,'' WHERE EXISTS(SELECT 1 FROM website_platform_access_scopes WHERE activity_key=NEW.activity_key AND enabled=1) ON CONFLICT(activity_key,account_id) DO UPDATE SET revision=revision+1,next_attempt=0,last_error=NULL;
END;
