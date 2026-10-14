-- Teaching plans are structured D1 records. Shared PDFs are generated on demand.
CREATE TABLE lesson_plan_policies (
 activity_key TEXT PRIMARY KEY COLLATE NOCASE REFERENCES activities(activity_key),
 weekly_day INTEGER NOT NULL CHECK(weekly_day BETWEEN 0 AND 6),
 weekly_time TEXT NOT NULL,
 course_lead_days INTEGER NOT NULL CHECK(course_lead_days BETWEEN 0 AND 90),
 revision INTEGER NOT NULL CHECK(revision>0), updated_at TEXT NOT NULL,
 updated_by TEXT COLLATE NOCASE NOT NULL REFERENCES accounts(account_id)
);
CREATE TABLE lesson_plan_preferences (
 activity_key TEXT COLLATE NOCASE NOT NULL REFERENCES activities(activity_key),
 run_id TEXT COLLATE NOCASE NOT NULL DEFAULT '',
 teacher_id TEXT COLLATE NOCASE NOT NULL REFERENCES accounts(account_id),
 period TEXT NOT NULL CHECK(period IN ('WEEKLY','ENTIRE')),
 PRIMARY KEY(activity_key,run_id,teacher_id)
);
CREATE TABLE lesson_plans (
 plan_id TEXT PRIMARY KEY,
 activity_key TEXT COLLATE NOCASE NOT NULL REFERENCES activities(activity_key),
 run_id TEXT COLLATE NOCASE NOT NULL DEFAULT '',
 teacher_id TEXT COLLATE NOCASE NOT NULL REFERENCES accounts(account_id),
 period TEXT NOT NULL CHECK(period IN ('WEEKLY','ENTIRE')),
 week_start TEXT NOT NULL,
 draft_json TEXT NOT NULL CHECK(json_valid(draft_json)),
 submitted_json TEXT CHECK(submitted_json IS NULL OR json_valid(submitted_json)),
 revision INTEGER NOT NULL CHECK(revision>0),
 submitted_revision INTEGER,
 submitted_at TEXT, last_submitted_at TEXT, submitted_due_at TEXT,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 UNIQUE(activity_key,run_id,teacher_id,period,week_start),
 CHECK(period='WEEKLY' AND length(week_start)=10 OR period='ENTIRE' AND week_start='')
);
CREATE INDEX lesson_plans_board ON lesson_plans(activity_key,period,week_start,teacher_id);
CREATE TABLE lesson_plan_revisions (
 plan_id TEXT NOT NULL REFERENCES lesson_plans(plan_id), revision INTEGER NOT NULL,
 action TEXT NOT NULL CHECK(action IN ('DRAFT','SUBMIT')),
 content_json TEXT NOT NULL CHECK(json_valid(content_json)),
 actor_id TEXT COLLATE NOCASE NOT NULL REFERENCES accounts(account_id), created_at TEXT NOT NULL,
 PRIMARY KEY(plan_id,revision)
);
CREATE TABLE lesson_plan_comments (
 comment_id TEXT PRIMARY KEY, plan_id TEXT NOT NULL REFERENCES lesson_plans(plan_id),
 submitted_revision INTEGER NOT NULL,
 actor_id TEXT COLLATE NOCASE NOT NULL REFERENCES accounts(account_id),
 body TEXT NOT NULL CHECK(length(trim(body)) BETWEEN 1 AND 4000), created_at TEXT NOT NULL,
 FOREIGN KEY(plan_id,submitted_revision) REFERENCES lesson_plan_revisions(plan_id,revision)
);
CREATE INDEX lesson_plan_comments_by_plan ON lesson_plan_comments(plan_id,created_at);
CREATE TABLE lesson_plan_deadlines (
 activity_key TEXT COLLATE NOCASE NOT NULL REFERENCES activities(activity_key),
 run_id TEXT COLLATE NOCASE NOT NULL DEFAULT '',
 teacher_id TEXT COLLATE NOCASE NOT NULL REFERENCES accounts(account_id),
 period TEXT NOT NULL CHECK(period IN ('WEEKLY','ENTIRE')), week_start TEXT NOT NULL,
 due_at TEXT NOT NULL, revision INTEGER NOT NULL CHECK(revision>0),
 reason TEXT NOT NULL, updated_at TEXT NOT NULL,
 updated_by TEXT COLLATE NOCASE NOT NULL REFERENCES accounts(account_id),
 PRIMARY KEY(activity_key,run_id,teacher_id,period,week_start)
);
CREATE TRIGGER lesson_plan_revisions_no_update BEFORE UPDATE ON lesson_plan_revisions
BEGIN SELECT RAISE(ABORT,'Plan revisions are append-only'); END;
CREATE TRIGGER lesson_plan_revisions_no_delete BEFORE DELETE ON lesson_plan_revisions
BEGIN SELECT RAISE(ABORT,'Plan revisions are append-only'); END;
CREATE TRIGGER lesson_plan_comments_no_update BEFORE UPDATE ON lesson_plan_comments
BEGIN SELECT RAISE(ABORT,'Plan comments are append-only'); END;
CREATE TRIGGER lesson_plan_comments_no_delete BEFORE DELETE ON lesson_plan_comments
BEGIN SELECT RAISE(ABORT,'Plan comments are append-only'); END;
