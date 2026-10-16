-- A temporary manual-work inbox, independent of roles, subscriptions and fees.
CREATE TABLE IF NOT EXISTS academy_enrolment_catalogue (
 entry_id TEXT PRIMARY KEY NOT NULL,
 activity_key TEXT COLLATE NOCASE NOT NULL REFERENCES activities(activity_key),
 enrolment_year INTEGER NOT NULL CHECK(enrolment_year BETWEEN 1900 AND 2200),
 cost_text TEXT NOT NULL CHECK(length(cost_text) BETWEEN 1 AND 500),
 active INTEGER NOT NULL DEFAULT 0 CHECK(active IN (0,1)),
 display_order INTEGER NOT NULL DEFAULT 0 CHECK(display_order BETWEEN 0 AND 10000),
 revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>=1),
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 updated_by_account_id TEXT COLLATE NOCASE REFERENCES accounts(account_id),
 UNIQUE(activity_key,enrolment_year)
);
CREATE TABLE IF NOT EXISTS academy_enrolment_requests (
 request_id TEXT PRIMARY KEY NOT NULL,
 submission_key TEXT UNIQUE NOT NULL,
 payload_sha256 TEXT NOT NULL CHECK(length(payload_sha256)=64),
 account_id TEXT COLLATE NOCASE REFERENCES accounts(account_id),
 display_name TEXT NOT NULL CHECK(length(display_name) BETWEEN 1 AND 160),
 whatsapp_number TEXT NOT NULL CHECK(length(whatsapp_number) BETWEEN 7 AND 32),
 paid INTEGER NOT NULL CHECK(paid IN (0,1)),
 revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>=1),
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS enrolment_requests_newest ON academy_enrolment_requests(created_at DESC,request_id DESC);
CREATE TABLE IF NOT EXISTS academy_enrolment_request_items (
 request_id TEXT NOT NULL REFERENCES academy_enrolment_requests(request_id) ON DELETE CASCADE,
 entry_id TEXT NOT NULL REFERENCES academy_enrolment_catalogue(entry_id),
 activity_key TEXT COLLATE NOCASE NOT NULL REFERENCES activities(activity_key),
 activity_name TEXT NOT NULL, enrolment_year INTEGER NOT NULL, cost_text TEXT NOT NULL,
 PRIMARY KEY(request_id,entry_id)
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS enrolment_items_by_activity ON academy_enrolment_request_items(activity_key,request_id);
