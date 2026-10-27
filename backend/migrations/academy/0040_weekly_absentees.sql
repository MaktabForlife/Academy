-- Private weekly absentee snapshots and account-specific inbox receipts.
CREATE TABLE weekly_absentee_reports (
 week_start TEXT PRIMARY KEY, week_end TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE weekly_absentee_rows (
 week_start TEXT NOT NULL REFERENCES weekly_absentee_reports(week_start),
 activity_key TEXT NOT NULL COLLATE NOCASE, series_id TEXT NOT NULL,
 account_id TEXT NOT NULL COLLATE NOCASE, display_name TEXT NOT NULL,
 attendance_date TEXT NOT NULL, lesson_json TEXT NOT NULL CHECK(json_valid(lesson_json)),
 PRIMARY KEY(week_start,series_id,account_id)
);
CREATE INDEX weekly_absentee_scope ON weekly_absentee_rows(week_start,activity_key,attendance_date,account_id);
CREATE TABLE weekly_absentee_recipients (
 week_start TEXT NOT NULL REFERENCES weekly_absentee_reports(week_start),
 account_id TEXT NOT NULL COLLATE NOCASE REFERENCES accounts(account_id),
 first_opened_at TEXT, unread INTEGER NOT NULL DEFAULT 1 CHECK(unread IN(0,1)), archived_at TEXT,
 PRIMARY KEY(week_start,account_id)
);
CREATE INDEX weekly_absentee_inbox ON weekly_absentee_recipients(account_id,archived_at,week_start);
CREATE INDEX attendance_weekly_dates ON attendance_days(attendance_date,day_id);
