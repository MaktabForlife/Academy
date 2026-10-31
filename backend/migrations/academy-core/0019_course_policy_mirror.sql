-- Trusted target acknowledgement only, not participant entitlement data.
CREATE TABLE website_platform_course_policy_mirror(activity_key TEXT PRIMARY KEY COLLATE NOCASE REFERENCES activities(activity_key),access_model TEXT NOT NULL CHECK(access_model IN('FREE','PAID')),revision INTEGER NOT NULL CHECK(revision>0));
CREATE INDEX website_platform_ownership_nocase ON website_platform_access_ownership(activity_key COLLATE NOCASE);
DROP TRIGGER studio_access_policy_course;
CREATE TRIGGER studio_access_policy_course BEFORE UPDATE OF legacy_access_model,policy_review_state ON course_settings
WHEN (OLD.legacy_access_model<>NEW.legacy_access_model OR OLD.policy_review_state<>NEW.policy_review_state)
AND EXISTS(SELECT 1 FROM website_platform_access_ownership o WHERE o.activity_key=NEW.activity_key AND o.state<>'ACADEMY')
AND NOT EXISTS(SELECT 1 FROM website_platform_course_policy_mirror m JOIN website_platform_access_ownership o USING(activity_key) WHERE m.activity_key=NEW.activity_key AND o.state='STUDIO' AND m.access_model=NEW.legacy_access_model AND NEW.policy_review_state='CONFIRMED')
BEGIN SELECT RAISE(ABORT,'STUDIO_ACCESS_MANAGED'); END;
