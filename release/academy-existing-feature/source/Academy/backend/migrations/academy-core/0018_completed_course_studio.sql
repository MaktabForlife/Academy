-- Explicit historical registrations only. No Course, rights or timetable seeded.
CREATE TABLE website_platform_completed_courses(
 activity_key TEXT PRIMARY KEY COLLATE NOCASE REFERENCES activities(activity_key),
 registration_id TEXT NOT NULL UNIQUE,
 website_id TEXT NOT NULL UNIQUE,
 package_sha256 TEXT NOT NULL CHECK(length(package_sha256)=64),
 title TEXT NOT NULL,
 timezone TEXT NOT NULL,
 registered_at INTEGER NOT NULL
);
