-- Inert until ACADEMY_COURSE_STUDIO_PUBLICATION=1. No historical Course is seeded.
CREATE TABLE website_platform_new_courses(activity_key TEXT PRIMARY KEY COLLATE NOCASE REFERENCES activities(activity_key),created_operation TEXT NOT NULL UNIQUE,published_title TEXT NOT NULL DEFAULT '',published_timezone TEXT NOT NULL DEFAULT 'UTC');
CREATE TABLE website_platform_course_jobs(
 activity_key TEXT PRIMARY KEY COLLATE NOCASE REFERENCES website_platform_new_courses(activity_key),
 offering_id TEXT NOT NULL UNIQUE,registration_id TEXT NOT NULL UNIQUE,run_id TEXT NOT NULL,publication_id TEXT NOT NULL,
 access_model TEXT NOT NULL CHECK(access_model IN('FREE','PAID')),phase TEXT NOT NULL CHECK(phase IN('REGISTER','RECONCILE','HANDOVER','COMPLETE')),
 next_attempt INTEGER NOT NULL DEFAULT 0,attempts INTEGER NOT NULL DEFAULT 0,last_error TEXT,created_at INTEGER NOT NULL
);
CREATE INDEX website_platform_course_jobs_due ON website_platform_course_jobs(next_attempt,activity_key) WHERE phase<>'COMPLETE';
