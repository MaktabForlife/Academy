-- Fresh native attendance generation. Do not copy or convert legacy registers.
CREATE TABLE attendance_generation (
 singleton INTEGER PRIMARY KEY CHECK(singleton=1), generation TEXT NOT NULL,
 started_at TEXT NOT NULL
);
INSERT INTO attendance_generation VALUES(1,'NATIVE_V1',strftime('%Y-%m-%dT%H:%M:%fZ','now'));
CREATE TABLE attendance_days (
 day_id TEXT PRIMARY KEY, activity_key TEXT NOT NULL COLLATE NOCASE REFERENCES activities(activity_key),
 attendance_date TEXT NOT NULL, timezone TEXT NOT NULL, setup_head TEXT NOT NULL,
 created_at TEXT NOT NULL, UNIQUE(activity_key,attendance_date)
);
CREATE TABLE attendance_roster_versions (
 roster_id TEXT PRIMARY KEY, activity_key TEXT NOT NULL COLLATE NOCASE REFERENCES activities(activity_key),
 roster_hash TEXT NOT NULL, member_count INTEGER NOT NULL CHECK(member_count>=0), created_at TEXT NOT NULL,
 UNIQUE(activity_key,roster_hash)
);
CREATE TABLE attendance_roster_members (
 roster_id TEXT NOT NULL REFERENCES attendance_roster_versions(roster_id), account_id TEXT NOT NULL COLLATE NOCASE REFERENCES accounts(account_id),
 display_name TEXT NOT NULL, PRIMARY KEY(roster_id,account_id)
);
CREATE TABLE attendance_series (
 series_id TEXT PRIMARY KEY, day_id TEXT NOT NULL REFERENCES attendance_days(day_id),
 stable_key TEXT NOT NULL, latest_version_id TEXT, UNIQUE(day_id,stable_key)
);
CREATE TABLE attendance_series_aliases (
 activity_key TEXT NOT NULL COLLATE NOCASE, attendance_date TEXT NOT NULL,
 publication_id TEXT NOT NULL, lesson_anchor TEXT NOT NULL, class_id TEXT NOT NULL COLLATE NOCASE,
 series_id TEXT NOT NULL REFERENCES attendance_series(series_id),
 PRIMARY KEY(activity_key,attendance_date,publication_id,lesson_anchor,class_id)
);
CREATE TABLE attendance_day_contexts (
 context_id TEXT PRIMARY KEY, day_id TEXT NOT NULL REFERENCES attendance_days(day_id),
 series_id TEXT NOT NULL UNIQUE REFERENCES attendance_series(series_id), class_id TEXT NOT NULL COLLATE NOCASE,
 run_id TEXT, lesson_json TEXT NOT NULL CHECK(json_valid(lesson_json)),
 roster_id TEXT REFERENCES attendance_roster_versions(roster_id), required INTEGER NOT NULL DEFAULT 1 CHECK(required IN(0,1))
);
CREATE INDEX attendance_context_day ON attendance_day_contexts(day_id,class_id,required);
CREATE TABLE attendance_register_versions (
 version_id TEXT PRIMARY KEY, series_id TEXT NOT NULL REFERENCES attendance_series(series_id),
 previous_version_id TEXT REFERENCES attendance_register_versions(version_id), roster_id TEXT NOT NULL REFERENCES attendance_roster_versions(roster_id),
 absence_count INTEGER NOT NULL CHECK(absence_count>=0), submitted_at TEXT NOT NULL,
 submitted_by TEXT NOT NULL COLLATE NOCASE REFERENCES accounts(account_id), operation_id TEXT NOT NULL,
 generation TEXT NOT NULL CHECK(generation='NATIVE_V1'), UNIQUE(series_id,operation_id), UNIQUE(version_id,roster_id)
);
CREATE INDEX attendance_versions_series ON attendance_register_versions(series_id,submitted_at);
CREATE TABLE attendance_absences (
 version_id TEXT NOT NULL, roster_id TEXT NOT NULL, account_id TEXT NOT NULL COLLATE NOCASE,
 PRIMARY KEY(version_id,account_id),
 FOREIGN KEY(version_id,roster_id) REFERENCES attendance_register_versions(version_id,roster_id),
 FOREIGN KEY(roster_id,account_id) REFERENCES attendance_roster_members(roster_id,account_id)
);
CREATE TABLE attendance_substitutes (
 assignment_id TEXT PRIMARY KEY, activity_key TEXT NOT NULL COLLATE NOCASE REFERENCES activities(activity_key),
 attendance_date TEXT NOT NULL, stable_key TEXT NOT NULL, account_id TEXT NOT NULL COLLATE NOCASE REFERENCES accounts(account_id),
 starts_at TEXT NOT NULL, first_until TEXT NOT NULL, correction_until TEXT NOT NULL,
 correction_reopen_until TEXT, revoked_at TEXT, revision INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL, created_by TEXT NOT NULL COLLATE NOCASE REFERENCES accounts(account_id),
 CHECK(first_until<=correction_until)
);
CREATE UNIQUE INDEX attendance_substitute_current ON attendance_substitutes(activity_key,attendance_date,stable_key) WHERE revoked_at IS NULL;
CREATE INDEX attendance_substitute_actor ON attendance_substitutes(account_id,revoked_at,correction_until);
CREATE INDEX attendance_substitute_session ON attendance_substitutes(activity_key,attendance_date,stable_key,revoked_at);
CREATE TABLE attendance_delivery_rosters (
 activity_key TEXT NOT NULL COLLATE NOCASE, run_id TEXT NOT NULL, revision INTEGER NOT NULL,
 reviewed_at TEXT NOT NULL, reviewed_by TEXT NOT NULL COLLATE NOCASE REFERENCES accounts(account_id),
 PRIMARY KEY(activity_key,run_id), FOREIGN KEY(activity_key,run_id) REFERENCES course_runs(activity_key,run_id)
);
CREATE TABLE attendance_delivery_members (
 interval_id TEXT PRIMARY KEY, activity_key TEXT NOT NULL COLLATE NOCASE, run_id TEXT NOT NULL,
 account_id TEXT NOT NULL COLLATE NOCASE REFERENCES accounts(account_id), join_date TEXT NOT NULL, leave_date TEXT,
 state TEXT NOT NULL DEFAULT 'VALID' CHECK(state IN('VALID','VOID')), revision INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL, created_by TEXT NOT NULL COLLATE NOCASE REFERENCES accounts(account_id),
 CHECK(leave_date IS NULL OR leave_date>=join_date),
 FOREIGN KEY(activity_key,run_id) REFERENCES attendance_delivery_rosters(activity_key,run_id)
);
CREATE INDEX attendance_delivery_dates ON attendance_delivery_members(activity_key,run_id,state,join_date,leave_date);
CREATE TRIGGER attendance_interval_overlap_insert BEFORE INSERT ON attendance_delivery_members WHEN NEW.state='VALID' AND EXISTS(
 SELECT 1 FROM attendance_delivery_members m WHERE m.activity_key=NEW.activity_key AND m.run_id=NEW.run_id AND m.account_id=NEW.account_id AND m.state='VALID'
 AND COALESCE(m.leave_date,'9999-12-31')>=NEW.join_date AND COALESCE(NEW.leave_date,'9999-12-31')>=m.join_date
) BEGIN SELECT RAISE(ABORT,'attendance_interval_overlap'); END;
CREATE TRIGGER attendance_interval_overlap_update BEFORE UPDATE ON attendance_delivery_members WHEN NEW.state='VALID' AND EXISTS(
 SELECT 1 FROM attendance_delivery_members m WHERE m.interval_id<>NEW.interval_id AND m.activity_key=NEW.activity_key AND m.run_id=NEW.run_id AND m.account_id=NEW.account_id AND m.state='VALID'
 AND COALESCE(m.leave_date,'9999-12-31')>=NEW.join_date AND COALESCE(NEW.leave_date,'9999-12-31')>=m.join_date
) BEGIN SELECT RAISE(ABORT,'attendance_interval_overlap'); END;
CREATE TRIGGER attendance_roster_version_update BEFORE UPDATE ON attendance_roster_versions BEGIN SELECT RAISE(ABORT,'attendance_roster_immutable'); END;
CREATE TRIGGER attendance_roster_version_delete BEFORE DELETE ON attendance_roster_versions BEGIN SELECT RAISE(ABORT,'attendance_roster_immutable'); END;
CREATE TRIGGER attendance_roster_member_update BEFORE UPDATE ON attendance_roster_members BEGIN SELECT RAISE(ABORT,'attendance_roster_immutable'); END;
CREATE TRIGGER attendance_roster_member_delete BEFORE DELETE ON attendance_roster_members BEGIN SELECT RAISE(ABORT,'attendance_roster_immutable'); END;
CREATE TRIGGER attendance_register_version_update BEFORE UPDATE ON attendance_register_versions BEGIN SELECT RAISE(ABORT,'attendance_register_append_only'); END;
CREATE TRIGGER attendance_register_version_delete BEFORE DELETE ON attendance_register_versions BEGIN SELECT RAISE(ABORT,'attendance_register_append_only'); END;
CREATE TRIGGER attendance_absence_update BEFORE UPDATE ON attendance_absences BEGIN SELECT RAISE(ABORT,'attendance_absence_append_only'); END;
CREATE TRIGGER attendance_absence_delete BEFORE DELETE ON attendance_absences BEGIN SELECT RAISE(ABORT,'attendance_absence_append_only'); END;
CREATE TRIGGER attendance_roster_member_sealed BEFORE INSERT ON attendance_roster_members WHEN
 EXISTS(SELECT 1 FROM attendance_day_contexts WHERE roster_id=NEW.roster_id) OR EXISTS(SELECT 1 FROM attendance_register_versions WHERE roster_id=NEW.roster_id)
 BEGIN SELECT RAISE(ABORT,'attendance_roster_immutable'); END;
CREATE TRIGGER attendance_context_identity BEFORE UPDATE ON attendance_day_contexts WHEN
 NEW.day_id<>OLD.day_id OR NEW.series_id<>OLD.series_id OR NEW.class_id<>OLD.class_id OR NEW.run_id IS NOT OLD.run_id OR NEW.lesson_json<>OLD.lesson_json OR
 (OLD.roster_id IS NOT NULL AND NEW.roster_id IS NOT OLD.roster_id)
 BEGIN SELECT RAISE(ABORT,'attendance_context_sealed'); END;
CREATE TRIGGER attendance_series_accept BEFORE UPDATE OF latest_version_id ON attendance_series WHEN NEW.latest_version_id IS NOT NULL AND NOT EXISTS(
 SELECT 1 FROM attendance_register_versions v JOIN attendance_roster_versions r USING(roster_id)
 WHERE v.version_id=NEW.latest_version_id AND v.series_id=NEW.series_id
 AND r.member_count=(SELECT count(*) FROM attendance_roster_members m WHERE m.roster_id=r.roster_id)
 AND v.absence_count=(SELECT count(*) FROM attendance_absences a WHERE a.version_id=v.version_id)
) BEGIN SELECT RAISE(ABORT,'attendance_evidence_mismatch'); END;
