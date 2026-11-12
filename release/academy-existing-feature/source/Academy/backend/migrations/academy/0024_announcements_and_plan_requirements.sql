CREATE TABLE academy_announcements (
 announcement_id TEXT PRIMARY KEY,
 title TEXT NOT NULL, message TEXT NOT NULL,
 active INTEGER NOT NULL CHECK(active IN (0,1)), display_order INTEGER NOT NULL,
 image_key TEXT, image_name TEXT, image_type TEXT, image_bytes INTEGER,
 image_alt TEXT NOT NULL DEFAULT '',
 revision INTEGER NOT NULL CHECK(revision>0),
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 updated_by TEXT NOT NULL COLLATE NOCASE REFERENCES accounts(account_id), deleted_at TEXT
);
CREATE INDEX academy_announcements_public ON academy_announcements(active,deleted_at,display_order,created_at);
CREATE TABLE lesson_plan_requirements (
 activity_key TEXT PRIMARY KEY COLLATE NOCASE REFERENCES activities(activity_key),
 plans_required INTEGER NOT NULL DEFAULT 1 CHECK(plans_required IN (0,1))
);
