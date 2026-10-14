-- Additive Program workspace and teacher calendar data. Apply only this file after schema review.
ALTER TABLE program_settings ADD COLUMN public_card_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(public_card_json));
CREATE TABLE teacher_availability (
 account_id TEXT COLLATE NOCASE PRIMARY KEY REFERENCES accounts(account_id),
 ranges_json TEXT NOT NULL CHECK(json_valid(ranges_json)),
 revision INTEGER NOT NULL CHECK(revision>0), updated_at TEXT NOT NULL
);
CREATE TABLE teacher_availability_changes (
 change_id TEXT PRIMARY KEY, account_id TEXT COLLATE NOCASE NOT NULL REFERENCES accounts(account_id),
 previous_json TEXT NOT NULL CHECK(json_valid(previous_json)), ranges_json TEXT NOT NULL CHECK(json_valid(ranges_json)),
 changed_at TEXT NOT NULL
);
CREATE TABLE teacher_availability_notices (
 account_id TEXT COLLATE NOCASE NOT NULL REFERENCES accounts(account_id), change_id TEXT NOT NULL REFERENCES teacher_availability_changes(change_id),
 PRIMARY KEY(account_id,change_id)
);
CREATE TABLE program_timetable_records (
 timetable_id TEXT PRIMARY KEY, activity_key TEXT COLLATE NOCASE NOT NULL REFERENCES activities(activity_key),
 draft_json TEXT NOT NULL CHECK(json_valid(draft_json)), status TEXT NOT NULL CHECK(status IN ('DRAFT','VALID','PUBLISHED','ARCHIVED','CANCELLED')),
 source_id TEXT, publication_id TEXT COLLATE NOCASE, validation_hash TEXT, updated_at TEXT NOT NULL,
 FOREIGN KEY(activity_key,publication_id) REFERENCES timetable_publications(activity_key,publication_id)
);
CREATE INDEX program_timetable_records_by_activity ON program_timetable_records(activity_key,updated_at);
CREATE TABLE program_publication_lifecycle (
 activity_key TEXT COLLATE NOCASE NOT NULL, publication_id TEXT COLLATE NOCASE NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('ARCHIVED','CANCELLED')), changed_at TEXT NOT NULL,
 PRIMARY KEY(activity_key,publication_id),
 FOREIGN KEY(activity_key,publication_id) REFERENCES timetable_publications(activity_key,publication_id)
);
INSERT INTO academy_settings(setting_key,setting_value) VALUES('ProgramWorkspace','1');
