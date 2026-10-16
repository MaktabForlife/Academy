-- Registered users are identified by account_id. A missing profile WhatsApp
-- number must not require another form field or a fabricated contact number.
-- Copy both related tables before replacing either, preserving all requests.
CREATE TABLE academy_enrolment_requests_10689 (
 request_id TEXT PRIMARY KEY NOT NULL,
 submission_key TEXT UNIQUE NOT NULL,
 payload_sha256 TEXT NOT NULL CHECK(length(payload_sha256)=64),
 account_id TEXT COLLATE NOCASE REFERENCES accounts(account_id),
 display_name TEXT NOT NULL CHECK(length(display_name) BETWEEN 1 AND 160),
 whatsapp_number TEXT NOT NULL CHECK(length(whatsapp_number)<=32),
 paid INTEGER NOT NULL CHECK(paid IN (0,1)),
 revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>=1),
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
INSERT INTO academy_enrolment_requests_10689 SELECT * FROM academy_enrolment_requests;
CREATE TABLE academy_enrolment_request_items_10689 (
 request_id TEXT NOT NULL REFERENCES academy_enrolment_requests_10689(request_id) ON DELETE CASCADE,
 entry_id TEXT NOT NULL REFERENCES academy_enrolment_catalogue(entry_id),
 activity_key TEXT COLLATE NOCASE NOT NULL REFERENCES activities(activity_key),
 activity_name TEXT NOT NULL, enrolment_year INTEGER NOT NULL, cost_text TEXT NOT NULL,
 PRIMARY KEY(request_id,entry_id)
) WITHOUT ROWID;
INSERT INTO academy_enrolment_request_items_10689 SELECT * FROM academy_enrolment_request_items;
DROP TABLE academy_enrolment_request_items;
DROP TABLE academy_enrolment_requests;
ALTER TABLE academy_enrolment_requests_10689 RENAME TO academy_enrolment_requests;
ALTER TABLE academy_enrolment_request_items_10689 RENAME TO academy_enrolment_request_items;
CREATE INDEX enrolment_requests_newest ON academy_enrolment_requests(created_at DESC,request_id DESC);
CREATE INDEX enrolment_items_by_activity ON academy_enrolment_request_items(activity_key,request_id);
