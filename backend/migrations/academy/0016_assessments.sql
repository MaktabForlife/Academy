-- Assessment objects are held in a dedicated PRIVATE R2 bucket.
CREATE TABLE assessments (
 assessment_id TEXT PRIMARY KEY, activity_key TEXT NOT NULL REFERENCES activities(activity_key), class_id TEXT NOT NULL,
 title TEXT NOT NULL, subject TEXT NOT NULL, exam_date TEXT NOT NULL, duration_minutes INTEGER NOT NULL CHECK(duration_minutes BETWEEN 1 AND 1440),
 maximum_mark REAL NOT NULL CHECK(maximum_mark>0), schedule_published INTEGER NOT NULL DEFAULT 0 CHECK(schedule_published IN(0,1)),
 examiner_id TEXT REFERENCES accounts(account_id), paper_file_id TEXT, paper_state TEXT NOT NULL DEFAULT 'DRAFT' CHECK(paper_state IN('DRAFT','IN_REVIEW','RETURNED','APPROVED')),
 paper_comment TEXT NOT NULL DEFAULT '', paper_released_at TEXT, revision INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL, created_by TEXT NOT NULL REFERENCES accounts(account_id), updated_at TEXT NOT NULL,
 FOREIGN KEY(activity_key,class_id) REFERENCES classes(activity_key,class_id)
);
CREATE INDEX assessments_class_date ON assessments(activity_key,class_id,exam_date);
CREATE TABLE assessment_files (
 file_id TEXT PRIMARY KEY, assessment_id TEXT REFERENCES assessments(assessment_id), activity_key TEXT NOT NULL REFERENCES activities(activity_key),
 owner_id TEXT NOT NULL REFERENCES accounts(account_id), uploaded_by TEXT NOT NULL REFERENCES accounts(account_id),
 kind TEXT NOT NULL CHECK(kind IN('PAPER','ANSWER','SCRIPT','TEMPLATE','REPORT')), filename TEXT NOT NULL, mime_type TEXT NOT NULL,
 byte_size INTEGER NOT NULL CHECK(byte_size>0), object_key TEXT NOT NULL UNIQUE, uploaded_at TEXT NOT NULL,
 operation_id TEXT NOT NULL, UNIQUE(uploaded_by,operation_id)
);
CREATE INDEX assessment_files_assessment ON assessment_files(assessment_id,kind);
CREATE TABLE assessment_recipients (
 assessment_id TEXT NOT NULL REFERENCES assessments(assessment_id), account_id TEXT NOT NULL REFERENCES accounts(account_id), display_name TEXT NOT NULL,
 first_accessed_at TEXT, latest_submission_id TEXT, latest_mark_id TEXT, resubmit_authorised INTEGER NOT NULL DEFAULT 0 CHECK(resubmit_authorised IN(0,1)),
 released_mark_id TEXT, released_feedback_id TEXT, released_script_id TEXT, revision INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(assessment_id,account_id)
);
CREATE INDEX assessment_recipients_account ON assessment_recipients(account_id,assessment_id);
CREATE TABLE assessment_submissions (
 submission_id TEXT PRIMARY KEY, assessment_id TEXT NOT NULL REFERENCES assessments(assessment_id), account_id TEXT NOT NULL REFERENCES accounts(account_id),
 file_id TEXT NOT NULL REFERENCES assessment_files(file_id), submitted_at TEXT NOT NULL, submission_number INTEGER NOT NULL,
 UNIQUE(assessment_id,account_id,submission_number)
);
CREATE TABLE assessment_markings (
 mark_id TEXT PRIMARY KEY, assessment_id TEXT NOT NULL REFERENCES assessments(assessment_id), account_id TEXT NOT NULL REFERENCES accounts(account_id),
 submission_id TEXT NOT NULL REFERENCES assessment_submissions(submission_id), mark REAL NOT NULL CHECK(mark>=0), feedback TEXT NOT NULL DEFAULT '',
 script_file_id TEXT REFERENCES assessment_files(file_id), state TEXT NOT NULL CHECK(state IN('IN_REVIEW','RETURNED','APPROVED')),
 examiner_id TEXT NOT NULL REFERENCES accounts(account_id), created_at TEXT NOT NULL, moderator_id TEXT REFERENCES accounts(account_id), moderated_at TEXT,
 moderation_comment TEXT NOT NULL DEFAULT ''
);
CREATE TABLE assessment_events (
 event_id TEXT PRIMARY KEY, assessment_id TEXT REFERENCES assessments(assessment_id), activity_key TEXT NOT NULL REFERENCES activities(activity_key),
 actor_id TEXT NOT NULL REFERENCES accounts(account_id), action TEXT NOT NULL, account_id TEXT REFERENCES accounts(account_id),
 details_json TEXT NOT NULL, occurred_at TEXT NOT NULL
);
CREATE INDEX assessment_events_history ON assessment_events(assessment_id,occurred_at);
CREATE TABLE assessment_report_templates (
 template_id TEXT PRIMARY KEY, activity_key TEXT NOT NULL REFERENCES activities(activity_key), name TEXT NOT NULL,
 file_id TEXT REFERENCES assessment_files(file_id), layout_json TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1,
 updated_at TEXT NOT NULL, updated_by TEXT NOT NULL REFERENCES accounts(account_id)
);
CREATE TABLE assessment_reports (
 report_id TEXT PRIMARY KEY, activity_key TEXT NOT NULL REFERENCES activities(activity_key), class_id TEXT NOT NULL,
 account_id TEXT NOT NULL REFERENCES accounts(account_id), file_id TEXT NOT NULL REFERENCES assessment_files(file_id),
 source_json TEXT NOT NULL, created_at TEXT NOT NULL, created_by TEXT NOT NULL REFERENCES accounts(account_id)
);
