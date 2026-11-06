CREATE TABLE academy_announcements (
 announcement_id TEXT PRIMARY KEY,
 title TEXT ,
 message TEXT ,
 active INTEGER NOT NULL CHECK(active IN (0,1)),
 display_order INTEGER ,
 image_key TEXT,
 image_name TEXT,
 image_type TEXT,
 image_bytes INTEGER,
 image_alt TEXT  DEFAULT '',
 revision INTEGER  CHECK(revision>0),
 created_at TEXT ,
 updated_at TEXT ,
 updated_by TEXT NOT NULL COLLATE NOCASE REFERENCES actor_refs(account_id),
 deleted_at TEXT);

CREATE TABLE academy_calendar_events (
 event_id TEXT PRIMARY KEY COLLATE NOCASE NOT NULL,
 event_type TEXT  CHECK(event_type IN ('TERM','ISLAMIC_DAY','PUBLIC_HOLIDAY')),
 description TEXT  CHECK(length(trim(description)) BETWEEN 1 AND 400),
 start_date TEXT ,
 end_date TEXT  CHECK(end_date>=start_date),
 alternate_date TEXT,
 teaching_impact TEXT  CHECK(teaching_impact IN ('INFORMATION','NO_TEACHING')),
 active INTEGER NOT NULL CHECK(active IN (0,1)),
 scope_key TEXT COLLATE NOCASE  DEFAULT 'ACADEMY',
 calendar_kind TEXT  DEFAULT 'REFERENCE'
 CHECK(calendar_kind IN ('REFERENCE','TERM','ACADEMY_HOLIDAY','PUBLIC_HOLIDAY')),
 revision INTEGER  DEFAULT 1 CHECK(revision>0));

CREATE TABLE academy_calendar_suppressions (
 calendar_date TEXT PRIMARY KEY NOT NULL);

CREATE TABLE academy_enrolment_catalogue (
 entry_id TEXT PRIMARY KEY NOT NULL,
 activity_key TEXT COLLATE NOCASE NOT NULL REFERENCES activities(activity_key),
 enrolment_year INTEGER  CHECK(enrolment_year BETWEEN 1900 AND 2200),
 cost_text TEXT  CHECK(length(cost_text) BETWEEN 1 AND 500),
 active INTEGER NOT NULL DEFAULT 0 CHECK(active IN (0,1)),
 display_order INTEGER  DEFAULT 0 CHECK(display_order BETWEEN 0 AND 10000),
 revision INTEGER  DEFAULT 1 CHECK(revision>=1),
 created_at TEXT ,
 updated_at TEXT ,
 updated_by_account_id TEXT COLLATE NOCASE REFERENCES actor_refs(account_id),
 UNIQUE(activity_key,enrolment_year));

CREATE TABLE "academy_enrolment_request_items" (
 request_id TEXT NOT NULL REFERENCES academy_enrolment_requests(request_id) ON DELETE CASCADE,
 entry_id TEXT NOT NULL REFERENCES academy_enrolment_catalogue(entry_id),
 activity_key TEXT COLLATE NOCASE NOT NULL REFERENCES activities(activity_key),
 activity_name TEXT NOT NULL,
 enrolment_year INTEGER NOT NULL,
 cost_text TEXT NOT NULL,
 PRIMARY KEY(request_id,entry_id)) WITHOUT ROWID;

CREATE TABLE "academy_enrolment_requests" (
 request_id TEXT PRIMARY KEY NOT NULL,
 submission_key TEXT UNIQUE NOT NULL,
 payload_sha256 TEXT NOT NULL CHECK(length(payload_sha256)=64),
 account_id TEXT COLLATE NOCASE REFERENCES accounts(account_id),
 display_name TEXT NOT NULL CHECK(length(display_name) BETWEEN 1 AND 160),
 whatsapp_number TEXT NOT NULL CHECK(length(whatsapp_number)<=32),
 paid INTEGER NOT NULL CHECK(paid IN (0,1)),
 revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>=1),
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL);

CREATE TABLE academy_media_playlist_recordings(
 lesson_id TEXT PRIMARY KEY REFERENCES lesson_media_lessons(lesson_id),
 playlist_id TEXT NOT NULL REFERENCES academy_media_playlists(playlist_id),
 activity_key TEXT NOT NULL COLLATE NOCASE REFERENCES activities(activity_key),
 position INTEGER NOT NULL CHECK(position>0),
 confirmed_context_json TEXT NOT NULL CHECK(json_valid(confirmed_context_json)),
 confirmation_kind TEXT NOT NULL CHECK(confirmation_kind IN('NATIVE_MATCH','ADMIN_CONFIRMED_MISSING_CONTEXT')),
 attached_at TEXT NOT NULL,
 attached_by TEXT NOT NULL COLLATE NOCASE REFERENCES actor_refs(account_id),
 FOREIGN KEY(activity_key,playlist_id) REFERENCES academy_media_playlists(activity_key,playlist_id),
 UNIQUE(playlist_id,position)
);

CREATE TABLE academy_media_playlist_state(
 activity_key TEXT PRIMARY KEY COLLATE NOCASE REFERENCES activities(activity_key),
 revision INTEGER NOT NULL DEFAULT 0 CHECK(revision>=0)
);

CREATE TABLE academy_media_playlists(
 playlist_id TEXT PRIMARY KEY,
 activity_key TEXT NOT NULL COLLATE NOCASE REFERENCES activities(activity_key),
 class_id TEXT NOT NULL COLLATE NOCASE,
 name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 160),
 close_date TEXT NOT NULL DEFAULT '',
 context_json TEXT NOT NULL CHECK(json_valid(context_json)),
 revision INTEGER NOT NULL CHECK(revision>0),
 enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN(0,1)),
 published_json TEXT CHECK(published_json IS NULL OR json_valid(published_json)),
 published_revision INTEGER,
 created_at TEXT NOT NULL,
 created_by TEXT NOT NULL COLLATE NOCASE REFERENCES actor_refs(account_id),
 updated_at TEXT NOT NULL,
 updated_by TEXT NOT NULL COLLATE NOCASE REFERENCES actor_refs(account_id),
 FOREIGN KEY(activity_key,class_id) REFERENCES classes(activity_key,class_id),
 UNIQUE(activity_key,playlist_id)
);

CREATE TABLE academy_module_catalogue (
 module_id TEXT PRIMARY KEY COLLATE NOCASE NOT NULL,
 subject_key TEXT COLLATE NOCASE REFERENCES subject_catalog(subject_key),
 name TEXT  CHECK(length(trim(name)) BETWEEN 1 AND 160),
 name_key TEXT ,
 active INTEGER NOT NULL CHECK(active IN (0,1)),
 revision INTEGER  DEFAULT 1 CHECK(revision>=1));

CREATE TABLE academy_module_usage (
 activity_key TEXT COLLATE NOCASE NOT NULL,
 module_id TEXT COLLATE NOCASE NOT NULL,
 academy_module_id TEXT COLLATE NOCASE NOT NULL REFERENCES academy_module_catalogue(module_id),
 PRIMARY KEY(activity_key,module_id),
 FOREIGN KEY(activity_key,module_id) REFERENCES modules(activity_key,module_id));

CREATE TABLE academy_pdf_bookmarks (
 account_id TEXT COLLATE NOCASE NOT NULL REFERENCES accounts(account_id),
 bookmark_key TEXT NOT NULL CHECK(length(bookmark_key)=64),
 file TEXT NOT NULL CHECK(length(file)<=4110),
 title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 240),
 page_number INTEGER NOT NULL CHECK(page_number BETWEEN 0 AND 100000),
 page_label TEXT NOT NULL DEFAULT '' CHECK(length(page_label)<=40),
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 PRIMARY KEY(account_id,bookmark_key)) WITHOUT ROWID;

CREATE TABLE academy_settings (
 setting_key TEXT PRIMARY KEY NOT NULL,
 setting_value TEXT ,
 updated_at TEXT,
 updated_by_account_id TEXT COLLATE NOCASE REFERENCES actor_refs(account_id));

CREATE TABLE academy_teacher_designations (
 account_id TEXT PRIMARY KEY COLLATE NOCASE NOT NULL REFERENCES accounts(account_id),
 active INTEGER NOT NULL CHECK(active IN (0,1)),
 revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>=1),
 updated_at TEXT NOT NULL,
 updated_by_account_id TEXT COLLATE NOCASE NOT NULL REFERENCES actor_refs(account_id));

CREATE TABLE academy_write_guards (
 guard_id TEXT PRIMARY KEY NOT NULL,
 accepted INTEGER NOT NULL CONSTRAINT academy_management_stale CHECK(accepted = 1));

CREATE TABLE academy_write_state (
 singleton INTEGER PRIMARY KEY CHECK(singleton = 1),
 version INTEGER NOT NULL CHECK(version >= 0));

CREATE TABLE account_contact_details (
 account_id TEXT PRIMARY KEY COLLATE NOCASE NOT NULL REFERENCES accounts(account_id),
 whatsapp_number TEXT NOT NULL DEFAULT '' CHECK (length(whatsapp_number) <= 32),
 updated_at TEXT NOT NULL,
 updated_by_account_id TEXT COLLATE NOCASE NOT NULL REFERENCES actor_refs(account_id));

CREATE TABLE account_credentials (
 account_id TEXT PRIMARY KEY COLLATE NOCASE NOT NULL REFERENCES accounts(account_id),
 pin_hash TEXT,
 pin_setup INTEGER NOT NULL DEFAULT 0 CHECK (pin_setup IN (0, 1)),
 credential_epoch INTEGER NOT NULL DEFAULT 1 CHECK (credential_epoch >= 1),
 updated_at TEXT,
 CHECK (pin_setup = 0 OR length(trim(coalesce(pin_hash, ''))) > 0));

CREATE TABLE account_sessions (
 session_id TEXT PRIMARY KEY NOT NULL,
 account_id TEXT COLLATE NOCASE NOT NULL REFERENCES accounts(account_id),
 credential_epoch INTEGER NOT NULL CHECK(credential_epoch >= 1),
 created_at TEXT NOT NULL,
 expires_at TEXT NOT NULL CHECK(expires_at > created_at),
 revoked_at TEXT);

CREATE TABLE accounts (
 account_id TEXT PRIMARY KEY COLLATE NOCASE NOT NULL CHECK (length(trim(account_id)) > 0),
 display_name TEXT NOT NULL CHECK (length(trim(display_name)) BETWEEN 1 AND 160),
 login_link_id TEXT UNIQUE COLLATE NOCASE NOT NULL CHECK (length(trim(login_link_id)) > 0),
 active INTEGER NOT NULL CHECK (active IN (0, 1)),
 last_login_at TEXT,
 created_at TEXT,
 updated_at TEXT,
 created_by_source_id TEXT,
 modified_by_source_id TEXT,
 revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1));

CREATE TABLE activities (
 activity_key TEXT PRIMARY KEY COLLATE NOCASE NOT NULL,
 activity_id TEXT COLLATE NOCASE NOT NULL CHECK (length(trim(activity_id)) > 0),
 kind TEXT NOT NULL CHECK (kind IN ('PROGRAM', 'COURSE', 'LEGACY')),
 name TEXT  CHECK (length(trim(name)) BETWEEN 1 AND 160),
 active INTEGER NOT NULL CHECK (active IN (0, 1)),
 lifecycle TEXT NOT NULL CHECK (lifecycle IN ('DRAFT', 'ACTIVE', 'ARCHIVED')),
 website_visible INTEGER NOT NULL DEFAULT 0 CHECK (website_visible IN (0, 1)),
 created_at TEXT,
 updated_at TEXT,
 revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
 UNIQUE (kind, activity_id),
 UNIQUE (activity_key, kind),
 CHECK (activity_key = kind || ':' || activity_id COLLATE NOCASE),
 CHECK (kind <> 'LEGACY' OR website_visible = 0));

CREATE TABLE actor_refs(account_id TEXT PRIMARY KEY COLLATE NOCASE);

CREATE TABLE assessment_attempts (
 assessment_id TEXT NOT NULL REFERENCES assessments(assessment_id),
 account_id TEXT NOT NULL REFERENCES accounts(account_id),
 first_accessed_at TEXT NOT NULL,
 timing_mode TEXT NOT NULL CHECK(timing_mode IN('TIMED','UNTIMED')),
 duration_minutes INTEGER,
 allowance_minutes INTEGER,
 deadline_at TEXT,
 timezone TEXT NOT NULL,
 definition_revision INTEGER NOT NULL,
 PRIMARY KEY(assessment_id,account_id),
 CHECK((timing_mode='UNTIMED' AND duration_minutes IS NULL AND allowance_minutes IS NULL AND deadline_at IS NULL) OR (timing_mode='TIMED' AND duration_minutes>0 AND allowance_minutes>=0 AND deadline_at IS NOT NULL)));

CREATE TABLE assessment_collection (
 assessment_id TEXT PRIMARY KEY REFERENCES assessments(assessment_id),
 effective_due_at TEXT,
 closed_at TEXT,
 revision INTEGER NOT NULL DEFAULT 1,
 updated_at TEXT NOT NULL,
 updated_by TEXT NOT NULL REFERENCES actor_refs(account_id));

CREATE TABLE assessment_events (
 event_id TEXT PRIMARY KEY,
 assessment_id TEXT REFERENCES assessments(assessment_id),
 activity_key TEXT NOT NULL REFERENCES activities(activity_key),
 actor_id TEXT NOT NULL REFERENCES actor_refs(account_id),
 action TEXT NOT NULL,
 account_id TEXT REFERENCES accounts(account_id),
 details_json TEXT NOT NULL,
 occurred_at TEXT NOT NULL);

CREATE TABLE assessment_file_integrity (
 file_id TEXT PRIMARY KEY REFERENCES assessment_files(file_id),
 sha256 TEXT NOT NULL CHECK(length(sha256)=64));

CREATE TABLE assessment_files (
 file_id TEXT PRIMARY KEY,
 assessment_id TEXT REFERENCES assessments(assessment_id),
 activity_key TEXT NOT NULL REFERENCES activities(activity_key),
 owner_id TEXT NOT NULL REFERENCES accounts(account_id),
 uploaded_by TEXT NOT NULL REFERENCES actor_refs(account_id),
 kind TEXT NOT NULL CHECK(kind IN('PAPER','ANSWER','SCRIPT','TEMPLATE','REPORT')),
 filename TEXT NOT NULL,
 mime_type TEXT NOT NULL,
 byte_size INTEGER NOT NULL CHECK(byte_size>0),
 object_key TEXT NOT NULL UNIQUE,
 uploaded_at TEXT NOT NULL,
 operation_id TEXT NOT NULL,
 UNIQUE(uploaded_by,operation_id));

CREATE TABLE assessment_markings (
 mark_id TEXT PRIMARY KEY,
 assessment_id TEXT NOT NULL REFERENCES assessments(assessment_id),
 account_id TEXT NOT NULL REFERENCES accounts(account_id),
 submission_id TEXT NOT NULL REFERENCES assessment_submissions(submission_id),
 mark REAL NOT NULL CHECK(mark>=0),
 feedback TEXT NOT NULL DEFAULT '',
 script_file_id TEXT REFERENCES assessment_files(file_id),
 state TEXT NOT NULL CHECK(state IN('IN_REVIEW','RETURNED','APPROVED')),
 examiner_id TEXT NOT NULL REFERENCES actor_refs(account_id),
 created_at TEXT NOT NULL,
 moderator_id TEXT REFERENCES actor_refs(account_id),
 moderated_at TEXT,
 moderation_comment TEXT NOT NULL DEFAULT '');

CREATE TABLE assessment_paper_review (
 file_id TEXT PRIMARY KEY REFERENCES assessment_files(file_id),
 assessment_id TEXT NOT NULL REFERENCES assessments(assessment_id),
 sha256 TEXT,
 definition_revision INTEGER NOT NULL,
 reviewed_at TEXT NOT NULL,
 reviewed_by TEXT NOT NULL REFERENCES actor_refs(account_id));

CREATE TABLE assessment_phases (
 phase_id TEXT PRIMARY KEY,
 activity_key TEXT NOT NULL REFERENCES activities(activity_key),
 name TEXT  CHECK(length(trim(name)) BETWEEN 1 AND 160),
 name_normalised TEXT ,
 created_at TEXT ,
 created_by TEXT NOT NULL REFERENCES actor_refs(account_id),
 UNIQUE(activity_key,name_normalised));

CREATE TABLE assessment_recipients (
 assessment_id TEXT NOT NULL REFERENCES assessments(assessment_id),
 account_id TEXT NOT NULL REFERENCES accounts(account_id),
 display_name TEXT NOT NULL,
 first_accessed_at TEXT,
 latest_submission_id TEXT,
 latest_mark_id TEXT,
 resubmit_authorised INTEGER NOT NULL DEFAULT 0 CHECK(resubmit_authorised IN(0,1)),
 released_mark_id TEXT,
 released_feedback_id TEXT,
 released_script_id TEXT,
 revision INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(assessment_id,account_id));

CREATE TABLE assessment_register_areas (
 register_id TEXT NOT NULL REFERENCES assessment_registers(register_id),
 activity_key TEXT NOT NULL REFERENCES activities(activity_key),
 PRIMARY KEY(register_id,activity_key));

CREATE TABLE assessment_registers (
 register_id TEXT PRIMARY KEY,
 name TEXT  CHECK(length(trim(name)) BETWEEN 1 AND 160),
 class_mode TEXT  CHECK(class_mode IN('ONE','ALL')),
 class_activity_key TEXT REFERENCES activities(activity_key),
 class_id TEXT,
 status TEXT NOT NULL CHECK(status IN('REGISTERED','DRAFT','SCHEDULED','SCHEDULE_RELEASED','AWAITING_MODERATION','APPROVED','PUBLISHED','IN_PROGRESS','READY_FOR_ASSESSMENT','ASSESSED','MODERATED','READY_FOR_RELEASE','RELEASED','COMPLETE','ARCHIVED','CANCELLED')),
 revision INTEGER NOT NULL DEFAULT 1,
 legacy_phase_id TEXT UNIQUE REFERENCES assessment_phases(phase_id),
 created_at TEXT ,
 created_by TEXT NOT NULL REFERENCES actor_refs(account_id),
 updated_at TEXT NOT NULL,
 CHECK((class_mode='ALL' AND class_activity_key IS NULL AND class_id IS NULL) OR (class_mode='ONE' AND class_activity_key IS NOT NULL AND class_id IS NOT NULL)),
 FOREIGN KEY(class_activity_key,class_id) REFERENCES classes(activity_key,class_id));

CREATE TABLE assessment_report_evidence (
 report_id TEXT PRIMARY KEY REFERENCES assessment_reports(report_id),
 sha256 TEXT NOT NULL,
 source_json TEXT NOT NULL CHECK(json_valid(source_json)),
 template_id TEXT REFERENCES assessment_report_templates(template_id),
 template_revision INTEGER,
 layout_json TEXT NOT NULL CHECK(json_valid(layout_json)),
 background_file_id TEXT REFERENCES assessment_files(file_id),
 reviewed_at TEXT NOT NULL,
 reviewed_by TEXT NOT NULL REFERENCES actor_refs(account_id));

CREATE TABLE assessment_report_templates (
 template_id TEXT PRIMARY KEY,
 activity_key TEXT NOT NULL REFERENCES activities(activity_key),
 name TEXT ,
 file_id TEXT REFERENCES assessment_files(file_id),
 layout_json TEXT ,
 revision INTEGER  DEFAULT 1,
 updated_at TEXT ,
 updated_by TEXT NOT NULL REFERENCES actor_refs(account_id));

CREATE TABLE assessment_reports (
 report_id TEXT PRIMARY KEY,
 activity_key TEXT NOT NULL REFERENCES activities(activity_key),
 class_id TEXT NOT NULL,
 account_id TEXT NOT NULL REFERENCES accounts(account_id),
 file_id TEXT NOT NULL REFERENCES assessment_files(file_id),
 source_json TEXT NOT NULL,
 created_at TEXT NOT NULL,
 created_by TEXT NOT NULL REFERENCES actor_refs(account_id));

CREATE TABLE assessment_script_sources (
 file_id TEXT PRIMARY KEY REFERENCES assessment_files(file_id),
 submission_id TEXT NOT NULL REFERENCES assessment_submissions(submission_id),
 paper_file_id TEXT REFERENCES assessment_files(file_id),
 maximum_mark REAL NOT NULL);

CREATE TABLE assessment_submissions (
 submission_id TEXT PRIMARY KEY,
 assessment_id TEXT NOT NULL REFERENCES assessments(assessment_id),
 account_id TEXT NOT NULL REFERENCES accounts(account_id),
 file_id TEXT NOT NULL REFERENCES assessment_files(file_id),
 submitted_at TEXT NOT NULL,
 submission_number INTEGER NOT NULL,
 confirmed_at TEXT,
 confirmed_by TEXT REFERENCES actor_refs(account_id),
 is_late INTEGER NOT NULL DEFAULT 0 CHECK(is_late IN(0,1)),
 deadline_used TEXT,
 collection_revision INTEGER,
 UNIQUE(assessment_id,account_id,submission_number));

CREATE TABLE "assessments" (
 assessment_id TEXT PRIMARY KEY,
 activity_key TEXT NOT NULL REFERENCES activities(activity_key),
 class_id TEXT NOT NULL,
 title TEXT ,
 subject TEXT ,
 exam_date TEXT,
 duration_minutes INTEGER CHECK(duration_minutes IS NULL OR duration_minutes BETWEEN 1 AND 1440),
 maximum_mark REAL  CHECK(maximum_mark>0),
 schedule_published INTEGER NOT NULL DEFAULT 0 CHECK(schedule_published IN(0,1)),
 examiner_id TEXT REFERENCES actor_refs(account_id),
 paper_file_id TEXT,
 paper_state TEXT NOT NULL DEFAULT 'DRAFT' CHECK(paper_state IN('DRAFT','IN_REVIEW','RETURNED','APPROVED')),
 paper_comment TEXT NOT NULL DEFAULT '',
 paper_released_at TEXT,
 revision INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL,
 created_by TEXT NOT NULL REFERENCES actor_refs(account_id),
 updated_at TEXT NOT NULL,
 phase_id TEXT REFERENCES assessment_phases(phase_id),
 subject_descriptor TEXT  DEFAULT '',
 register_id TEXT REFERENCES assessment_registers(register_id),
 deleted_at TEXT,
 deleted_by TEXT REFERENCES actor_refs(account_id),
 ready_for_assessment_at TEXT,
 ready_for_assessment_by TEXT REFERENCES actor_refs(account_id),
 assessment_kind TEXT  DEFAULT 'EXAM' CHECK(assessment_kind IN('EXAM','ASSIGNMENT')),
 timing_mode TEXT  DEFAULT 'TIMED' CHECK(timing_mode IN('TIMED','UNTIMED')),
 timezone TEXT  DEFAULT 'Africa/Johannesburg',
 available_from TEXT,
 due_at TEXT,
 exam_cutoff TEXT,
 allowance_minutes INTEGER DEFAULT 15 CHECK(allowance_minutes IS NULL OR allowance_minutes BETWEEN 0 AND 1440),
 FOREIGN KEY(activity_key,class_id) REFERENCES classes(activity_key,class_id),
 CHECK((timing_mode='UNTIMED' AND duration_minutes IS NULL AND allowance_minutes IS NULL) OR (timing_mode='TIMED' AND duration_minutes IS NOT NULL AND allowance_minutes IS NOT NULL)),
 CHECK((assessment_kind='EXAM' AND exam_date IS NOT NULL) OR assessment_kind='ASSIGNMENT'));

CREATE TABLE attendance_absences (
 version_id TEXT NOT NULL,
 roster_id TEXT NOT NULL,
 account_id TEXT NOT NULL COLLATE NOCASE,
 PRIMARY KEY(version_id,account_id),
 FOREIGN KEY(version_id,roster_id) REFERENCES attendance_register_versions(version_id,roster_id),
 FOREIGN KEY(roster_id,account_id) REFERENCES attendance_roster_members(roster_id,account_id));

CREATE TABLE attendance_day_contexts (
 context_id TEXT PRIMARY KEY,
 day_id TEXT NOT NULL REFERENCES attendance_days(day_id),
 series_id TEXT NOT NULL UNIQUE REFERENCES attendance_series(series_id),
 class_id TEXT NOT NULL COLLATE NOCASE,
 run_id TEXT,
 lesson_json TEXT NOT NULL CHECK(json_valid(lesson_json)),
 roster_id TEXT REFERENCES attendance_roster_versions(roster_id),
 required INTEGER NOT NULL DEFAULT 1 CHECK(required IN(0,1)));

CREATE TABLE attendance_days (
 day_id TEXT PRIMARY KEY,
 activity_key TEXT NOT NULL COLLATE NOCASE REFERENCES activities(activity_key),
 attendance_date TEXT NOT NULL,
 timezone TEXT NOT NULL,
 setup_head TEXT NOT NULL,
 created_at TEXT NOT NULL,
 UNIQUE(activity_key,attendance_date));

CREATE TABLE attendance_delivery_members (
 interval_id TEXT PRIMARY KEY,
 activity_key TEXT NOT NULL COLLATE NOCASE,
 run_id TEXT NOT NULL,
 account_id TEXT NOT NULL COLLATE NOCASE REFERENCES accounts(account_id),
 join_date TEXT NOT NULL,
 leave_date TEXT,
 state TEXT NOT NULL DEFAULT 'VALID' CHECK(state IN('VALID','VOID')),
 revision INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL,
 created_by TEXT NOT NULL COLLATE NOCASE REFERENCES actor_refs(account_id),
 CHECK(leave_date IS NULL OR leave_date>=join_date),
 FOREIGN KEY(activity_key,run_id) REFERENCES attendance_delivery_rosters(activity_key,run_id));

CREATE TABLE attendance_delivery_rosters (
 activity_key TEXT NOT NULL COLLATE NOCASE,
 run_id TEXT NOT NULL,
 revision INTEGER NOT NULL,
 reviewed_at TEXT NOT NULL,
 reviewed_by TEXT NOT NULL COLLATE NOCASE REFERENCES actor_refs(account_id),
 PRIMARY KEY(activity_key,run_id),
 FOREIGN KEY(activity_key,run_id) REFERENCES course_runs(activity_key,run_id));

CREATE TABLE attendance_generation (
 singleton INTEGER PRIMARY KEY CHECK(singleton=1),
 generation TEXT NOT NULL,
 started_at TEXT NOT NULL);

CREATE TABLE attendance_register_versions (
 version_id TEXT PRIMARY KEY,
 series_id TEXT NOT NULL REFERENCES attendance_series(series_id),
 previous_version_id TEXT REFERENCES attendance_register_versions(version_id),
 roster_id TEXT NOT NULL REFERENCES attendance_roster_versions(roster_id),
 absence_count INTEGER NOT NULL CHECK(absence_count>=0),
 submitted_at TEXT NOT NULL,
 submitted_by TEXT NOT NULL COLLATE NOCASE REFERENCES actor_refs(account_id),
 operation_id TEXT NOT NULL,
 generation TEXT NOT NULL CHECK(generation='NATIVE_V1'),
 UNIQUE(series_id,operation_id),
 UNIQUE(version_id,roster_id));

CREATE TABLE attendance_roster_members (
 roster_id TEXT NOT NULL REFERENCES attendance_roster_versions(roster_id),
 account_id TEXT NOT NULL COLLATE NOCASE REFERENCES accounts(account_id),
 display_name TEXT NOT NULL,
 PRIMARY KEY(roster_id,account_id));

CREATE TABLE attendance_roster_versions (
 roster_id TEXT PRIMARY KEY,
 activity_key TEXT NOT NULL COLLATE NOCASE REFERENCES activities(activity_key),
 roster_hash TEXT NOT NULL,
 member_count INTEGER NOT NULL CHECK(member_count>=0),
 created_at TEXT NOT NULL,
 UNIQUE(activity_key,roster_hash));

CREATE TABLE attendance_series (
 series_id TEXT PRIMARY KEY,
 day_id TEXT NOT NULL REFERENCES attendance_days(day_id),
 stable_key TEXT NOT NULL,
 latest_version_id TEXT,
 UNIQUE(day_id,stable_key));

CREATE TABLE attendance_series_aliases (
 activity_key TEXT NOT NULL COLLATE NOCASE,
 attendance_date TEXT NOT NULL,
 publication_id TEXT NOT NULL,
 lesson_anchor TEXT NOT NULL,
 class_id TEXT NOT NULL COLLATE NOCASE,
 series_id TEXT NOT NULL REFERENCES attendance_series(series_id),
 PRIMARY KEY(activity_key,attendance_date,publication_id,lesson_anchor,class_id));

CREATE TABLE attendance_substitutes (
 assignment_id TEXT PRIMARY KEY,
 activity_key TEXT NOT NULL COLLATE NOCASE REFERENCES activities(activity_key),
 attendance_date TEXT NOT NULL,
 stable_key TEXT NOT NULL,
 account_id TEXT NOT NULL COLLATE NOCASE REFERENCES accounts(account_id),
 starts_at TEXT NOT NULL,
 first_until TEXT NOT NULL,
 correction_until TEXT NOT NULL,
 correction_reopen_until TEXT,
 revoked_at TEXT,
 revision INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL,
 created_by TEXT NOT NULL COLLATE NOCASE REFERENCES actor_refs(account_id),
 CHECK(first_until<=correction_until));

CREATE TABLE audit_events (
 event_id TEXT PRIMARY KEY NOT NULL,
 occurred_at TEXT NOT NULL,
 actor_account_id TEXT COLLATE NOCASE REFERENCES actor_refs(account_id),
 actor_source_id TEXT,
 actor_name_snapshot TEXT,
 authority TEXT,
 scope_key TEXT,
 action TEXT NOT NULL,
 record_kind TEXT NOT NULL,
 record_id TEXT NOT NULL,
 changed_fields_json TEXT NOT NULL CHECK (json_valid(changed_fields_json)));

CREATE TABLE class_memberships (
 activity_key TEXT COLLATE NOCASE NOT NULL,
 enrollment_id TEXT COLLATE NOCASE NOT NULL,
 class_id TEXT COLLATE NOCASE NOT NULL,
 account_id TEXT COLLATE NOCASE NOT NULL REFERENCES accounts(account_id),
 start_date TEXT,
 end_date TEXT,
 active INTEGER NOT NULL CHECK(active IN (0,1)),
 PRIMARY KEY(activity_key, enrollment_id),
 FOREIGN KEY(activity_key, class_id) REFERENCES classes(activity_key, class_id),
 CHECK(start_date IS NULL OR end_date IS NULL OR end_date >= start_date));

CREATE TABLE class_module_progress (
 activity_key TEXT COLLATE NOCASE NOT NULL,
 progress_id TEXT COLLATE NOCASE NOT NULL,
 class_id TEXT COLLATE NOCASE NOT NULL,
 module_id TEXT COLLATE NOCASE NOT NULL,
 status TEXT  CHECK(status IN ('ACTIVE','INACTIVE','COMPLETED')),
 PRIMARY KEY(activity_key, progress_id),
 UNIQUE(activity_key, class_id, module_id),
 FOREIGN KEY(activity_key, class_id) REFERENCES classes(activity_key, class_id),
 FOREIGN KEY(activity_key, module_id) REFERENCES modules(activity_key, module_id));

CREATE TABLE class_note_contexts (
 context_id TEXT PRIMARY KEY,
 activity_key TEXT NOT NULL COLLATE NOCASE REFERENCES activities(activity_key),
 class_id TEXT NOT NULL COLLATE NOCASE,
 lesson_date TEXT NOT NULL,
 stable_key TEXT NOT NULL,
 source_json TEXT NOT NULL CHECK(json_valid(source_json)),
 source_head TEXT NOT NULL REFERENCES setup_heads(head_id),
 created_at TEXT NOT NULL,
 UNIQUE(activity_key,class_id,lesson_date,stable_key)
);

CREATE TABLE class_note_versions (
 version_id TEXT PRIMARY KEY,
 note_id TEXT NOT NULL REFERENCES class_notes(note_id),
 revision INTEGER NOT NULL CHECK(revision>0),
 context_id TEXT NOT NULL REFERENCES class_note_contexts(context_id),
 body TEXT NOT NULL CHECK(length(trim(body)) BETWEEN 1 AND 12000),
 due_mode TEXT NOT NULL CHECK(due_mode IN('NEXT','DATE')),
 due_date TEXT NOT NULL,
 due_context_id TEXT REFERENCES class_note_contexts(context_id),
 due_json TEXT NOT NULL CHECK(json_valid(due_json)),
 source_head TEXT NOT NULL REFERENCES setup_heads(head_id),
 previous_version_id TEXT REFERENCES class_note_versions(version_id),
 reason TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL,
 created_by TEXT NOT NULL COLLATE NOCASE REFERENCES actor_refs(account_id),
 UNIQUE(note_id,revision)
);

CREATE TABLE class_notes (
 note_id TEXT PRIMARY KEY,
 activity_key TEXT NOT NULL COLLATE NOCASE REFERENCES activities(activity_key),
 context_id TEXT NOT NULL REFERENCES class_note_contexts(context_id),
 created_by TEXT NOT NULL COLLATE NOCASE REFERENCES actor_refs(account_id),
 created_at TEXT NOT NULL,
 current_version_id TEXT,
 state TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(state IN('ACTIVE','WITHDRAWN')),
 revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0),
 updated_at TEXT NOT NULL,
 updated_by TEXT NOT NULL COLLATE NOCASE REFERENCES actor_refs(account_id),
 withdrawn_at TEXT
);

CREATE TABLE class_teacher_assignments (
 activity_key TEXT COLLATE NOCASE NOT NULL,
 class_id TEXT COLLATE NOCASE NOT NULL,
 account_id TEXT COLLATE NOCASE NOT NULL REFERENCES accounts(account_id),
 responsibility TEXT NOT NULL CHECK(responsibility IN ('DEFAULT','ADDITIONAL')),
 PRIMARY KEY(activity_key, class_id, account_id),
 FOREIGN KEY(activity_key, class_id) REFERENCES classes(activity_key, class_id));

CREATE TABLE classes (
 activity_key TEXT COLLATE NOCASE NOT NULL REFERENCES program_settings(activity_key),
 class_id TEXT COLLATE NOCASE NOT NULL,
 name TEXT ,
 academic_year TEXT,
 zoom_link TEXT,
 active INTEGER NOT NULL CHECK(active IN (0,1)),
 PRIMARY KEY(activity_key, class_id));

CREATE TABLE course_resources (
 activity_key TEXT COLLATE NOCASE NOT NULL REFERENCES course_settings(activity_key),
 resource_id TEXT COLLATE NOCASE NOT NULL,
 module_id TEXT COLLATE NOCASE,
 task_id TEXT COLLATE NOCASE,
 name TEXT ,
 resource_type TEXT,
 resource_format TEXT,
 description TEXT,
 resource_link TEXT,
 active INTEGER NOT NULL CHECK(active IN (0,1)),
 PRIMARY KEY(activity_key, resource_id),
 FOREIGN KEY(activity_key, module_id) REFERENCES modules(activity_key, module_id),
 FOREIGN KEY(activity_key, task_id) REFERENCES tasks(activity_key, task_id));

CREATE TABLE course_run_access (
 activity_key TEXT COLLATE NOCASE NOT NULL,
 run_id TEXT COLLATE NOCASE NOT NULL,
 access_model TEXT NOT NULL CHECK(access_model IN ('FREE','PAID')),
 PRIMARY KEY(activity_key,run_id),
 FOREIGN KEY(activity_key,run_id) REFERENCES course_runs(activity_key,run_id));

CREATE TABLE course_run_state (
 activity_key TEXT COLLATE NOCASE NOT NULL,
 run_id TEXT COLLATE NOCASE NOT NULL,
 stage TEXT,
 current_publication_id TEXT COLLATE NOCASE,
 draft_publish_start_date TEXT,
 draft_publish_end_date TEXT,
 PRIMARY KEY(activity_key, run_id),
 FOREIGN KEY(activity_key, run_id) REFERENCES course_runs(activity_key, run_id),
 FOREIGN KEY(activity_key, current_publication_id) REFERENCES timetable_publications(activity_key, publication_id));

CREATE TABLE course_runs (
 activity_key TEXT COLLATE NOCASE NOT NULL REFERENCES course_settings(activity_key),
 run_id TEXT COLLATE NOCASE NOT NULL,
 name TEXT ,
 timezone TEXT ,
 start_date TEXT,
 end_date TEXT,
 schedule_mode TEXT,
 schedule_definition TEXT,
 active INTEGER NOT NULL CHECK(active IN (0,1)),
 PRIMARY KEY(activity_key, run_id));

CREATE TABLE course_session_state (
 activity_key TEXT COLLATE NOCASE NOT NULL,
 run_id TEXT COLLATE NOCASE NOT NULL,
 session_id TEXT COLLATE NOCASE NOT NULL,
 active INTEGER NOT NULL CHECK(active IN (0,1)),
 PRIMARY KEY(activity_key,run_id,session_id));

CREATE TABLE course_settings (
 activity_key TEXT PRIMARY KEY COLLATE NOCASE NOT NULL,
 kind TEXT NOT NULL DEFAULT 'COURSE' CHECK (kind = 'COURSE'),
 legacy_access_model TEXT NOT NULL DEFAULT 'UNKNOWN' CHECK (legacy_access_model IN ('UNKNOWN', 'FREE', 'PAID')),
 policy_review_state TEXT NOT NULL DEFAULT 'REQUIRED' CHECK (policy_review_state IN ('REQUIRED', 'CONFIRMED')),
 FOREIGN KEY (activity_key, kind) REFERENCES activities(activity_key, kind));

CREATE TABLE course_subscription_decisions (
 account_id TEXT COLLATE NOCASE NOT NULL REFERENCES accounts(account_id),
 activity_key TEXT COLLATE NOCASE NOT NULL REFERENCES course_settings(activity_key),
 active INTEGER NOT NULL CHECK(active IN (0,1)),
 revision INTEGER NOT NULL DEFAULT 1 CHECK(revision >= 1),
 updated_at TEXT NOT NULL,
 updated_by_account_id TEXT COLLATE NOCASE  REFERENCES actor_refs(account_id),
 PRIMARY KEY(account_id,activity_key));

CREATE TABLE course_website_assets(
 asset_id TEXT PRIMARY KEY,
 activity_key TEXT NOT NULL COLLATE NOCASE REFERENCES activities(activity_key),
 object_key TEXT  UNIQUE,
 filename TEXT ,
 mime_type TEXT  CHECK(mime_type IS NULL OR mime_type IN('application/pdf','image/png','image/jpeg','image/webp')),
 byte_size INTEGER  CHECK(byte_size IS NULL OR byte_size BETWEEN 1 AND 16777216),
 sha256 TEXT ,
 created_at TEXT ,
 created_by TEXT NOT NULL REFERENCES actor_refs(account_id));

CREATE TABLE course_website_documents(
 activity_key TEXT PRIMARY KEY COLLATE NOCASE REFERENCES activities(activity_key),
 document_json TEXT  CHECK(document_json IS NULL OR json_valid(document_json)),
 schema_version INTEGER  DEFAULT 1,
 source_kind TEXT  DEFAULT 'TEMPLATE' CHECK(source_kind IS NULL OR source_kind IN('TEMPLATE','KAHF')),
 revision INTEGER  DEFAULT 1,
 enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN(0,1)),
 updated_at TEXT ,
 updated_by TEXT NOT NULL REFERENCES actor_refs(account_id));

CREATE TABLE global_role_assignments (
 assignment_id TEXT PRIMARY KEY NOT NULL,
 account_id TEXT COLLATE NOCASE NOT NULL REFERENCES accounts(account_id),
 role TEXT NOT NULL CHECK (role = 'GLOBAL_ADMIN'),
 active INTEGER NOT NULL CHECK (active IN (0, 1)),
 review_state TEXT NOT NULL DEFAULT 'REQUIRED' CHECK (review_state IN ('REQUIRED', 'CONFIRMED')),
 granted_at TEXT,
 granted_by_account_id TEXT COLLATE NOCASE REFERENCES actor_refs(account_id));

CREATE TABLE hifz_profile_sync (
 account_id TEXT PRIMARY KEY COLLATE NOCASE NOT NULL REFERENCES accounts(account_id),
 revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>=1),
 delivered_revision INTEGER NOT NULL DEFAULT 0 CHECK(delivered_revision>=0),
 pin_reset_version INTEGER NOT NULL DEFAULT 0 CHECK(pin_reset_version>=0),
 attempts INTEGER NOT NULL DEFAULT 0,
 next_attempt_at INTEGER NOT NULL DEFAULT 0,
 last_error_code TEXT,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);

CREATE TABLE "learner_task_progress" (
 account_id TEXT COLLATE NOCASE NOT NULL REFERENCES accounts(account_id),
 task_id TEXT COLLATE NOCASE NOT NULL REFERENCES memorisation_tasks(task_id),
 complete INTEGER NOT NULL CHECK(complete IN (0,1)),
 confirmed INTEGER NOT NULL CHECK(confirmed IN (0,1)),
 revision INTEGER NOT NULL CHECK(revision>=1),
 completed_at TEXT,
 confirmed_at TEXT,
 confirmed_by TEXT COLLATE NOCASE REFERENCES actor_refs(account_id),
 updated_at TEXT NOT NULL,
 CHECK((complete=1)=(completed_at IS NOT NULL)),
 CHECK((confirmed=1)=(confirmed_at IS NOT NULL AND confirmed_by IS NOT NULL)),
 PRIMARY KEY(account_id,task_id));

CREATE TABLE lesson_lifecycle (
 activity_key TEXT COLLATE NOCASE NOT NULL,
 lifecycle_id TEXT NOT NULL,
 publication_id TEXT COLLATE NOCASE NOT NULL,
 source_session_id TEXT NOT NULL,
 status TEXT NOT NULL,
 replacement_source_session_id TEXT,
 previous_source_session_id TEXT,
 PRIMARY KEY(activity_key, lifecycle_id),
 FOREIGN KEY(activity_key, publication_id) REFERENCES timetable_publications(activity_key, publication_id));

CREATE TABLE "lesson_media_assets" (
 asset_id TEXT PRIMARY KEY,
 activity_key TEXT NOT NULL REFERENCES activities(activity_key),
 kind TEXT  CHECK(kind IN('YOUTUBE','PDF','MP4')),
 youtube_id TEXT,
 object_key TEXT UNIQUE,
 filename TEXT  DEFAULT '',
 byte_size INTEGER,
 created_at TEXT ,
 display_name TEXT  DEFAULT '',
 CHECK(kind IS NULL OR (kind='YOUTUBE' AND youtube_id IS NOT NULL AND object_key IS NULL) OR (kind IN('PDF','MP4') AND youtube_id IS NULL AND object_key IS NOT NULL)));

CREATE TABLE "lesson_media_lessons" (
 lesson_id TEXT PRIMARY KEY,
 activity_key TEXT NOT NULL REFERENCES activities(activity_key),
 class_id TEXT,
 lesson_date TEXT ,
 title TEXT ,
 start_time TEXT ,
 end_time TEXT ,
 teacher_id TEXT REFERENCES accounts(account_id),
 teacher_name TEXT ,
 summary TEXT  DEFAULT '',
 state TEXT  CHECK(state IN('DRAFT','PUBLISHED','HIDDEN')),
 comments_closed INTEGER  DEFAULT 0 CHECK(comments_closed IN(0,1)),
 revision INTEGER NOT NULL DEFAULT 1,
 source_publication_id TEXT,
 source_lessons_json TEXT  DEFAULT '[]' CHECK(json_valid(source_lessons_json)),
 updated_at TEXT NOT NULL,
 session_key TEXT,
 run_id TEXT  DEFAULT '',
 teacher_ids_json TEXT  DEFAULT '[]' CHECK(json_valid(teacher_ids_json)),
 media_scope TEXT  DEFAULT 'SESSION' CHECK(media_scope IN('SESSION','COURSE')),
 FOREIGN KEY(activity_key,class_id) REFERENCES classes(activity_key,class_id));

CREATE TABLE lesson_media_links (
 lesson_id TEXT NOT NULL REFERENCES lesson_media_lessons(lesson_id),
 asset_id TEXT NOT NULL REFERENCES lesson_media_assets(asset_id),
 PRIMARY KEY(lesson_id,asset_id));

CREATE TABLE lesson_media_visibility (
 lesson_id TEXT PRIMARY KEY REFERENCES lesson_media_lessons(lesson_id),
 visible INTEGER NOT NULL CHECK(visible IN(0,1)),
 updated_at TEXT NOT NULL,
 updated_by TEXT REFERENCES actor_refs(account_id));

CREATE TABLE lesson_note_entries (
 note_id TEXT PRIMARY KEY,
 activity_key TEXT NOT NULL REFERENCES activities(activity_key),
 session_key TEXT NOT NULL,
 container_id TEXT NOT NULL,
 owner_id TEXT NOT NULL REFERENCES accounts(account_id),
 current_version_id TEXT,
 state TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(state IN('ACTIVE','WITHDRAWN')),
 revision INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL,
 created_by TEXT NOT NULL REFERENCES actor_refs(account_id));

CREATE TABLE lesson_note_versions (
 version_id TEXT PRIMARY KEY,
 note_id TEXT NOT NULL REFERENCES lesson_note_entries(note_id),
 object_key TEXT NOT NULL UNIQUE,
 filename TEXT NOT NULL,
 display_name TEXT NOT NULL DEFAULT '',
 byte_size INTEGER NOT NULL CHECK(byte_size BETWEEN 5 AND 16777216),
 sha256 TEXT NOT NULL CHECK(length(sha256)=64),
 source_head TEXT NOT NULL REFERENCES setup_heads(head_id),
 source_json TEXT NOT NULL CHECK(json_valid(source_json)),
 uploaded_by TEXT NOT NULL REFERENCES actor_refs(account_id),
 uploaded_at TEXT NOT NULL);

CREATE TABLE lesson_plan_comments (
 comment_id TEXT PRIMARY KEY,
 plan_id TEXT NOT NULL REFERENCES lesson_plans(plan_id),
 submitted_revision INTEGER NOT NULL,
 actor_id TEXT COLLATE NOCASE NOT NULL REFERENCES actor_refs(account_id),
 body TEXT NOT NULL CHECK(length(trim(body)) BETWEEN 1 AND 4000),
 created_at TEXT NOT NULL,
 FOREIGN KEY(plan_id,submitted_revision) REFERENCES lesson_plan_revisions(plan_id,revision));

CREATE TABLE lesson_plan_deadlines (
 activity_key TEXT COLLATE NOCASE NOT NULL REFERENCES activities(activity_key),
 run_id TEXT COLLATE NOCASE NOT NULL DEFAULT '',
 teacher_id TEXT COLLATE NOCASE NOT NULL REFERENCES accounts(account_id),
 period TEXT NOT NULL CHECK(period IN ('WEEKLY','ENTIRE')),
 week_start TEXT NOT NULL,
 due_at TEXT NOT NULL,
 revision INTEGER NOT NULL CHECK(revision>0),
 reason TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 updated_by TEXT COLLATE NOCASE NOT NULL REFERENCES actor_refs(account_id),
 PRIMARY KEY(activity_key,run_id,teacher_id,period,week_start));

CREATE TABLE lesson_plan_policies (
 activity_key TEXT PRIMARY KEY COLLATE NOCASE REFERENCES activities(activity_key),
 weekly_day INTEGER  CHECK(weekly_day BETWEEN 0 AND 6),
 weekly_time TEXT ,
 course_lead_days INTEGER  CHECK(course_lead_days BETWEEN 0 AND 90),
 revision INTEGER  CHECK(revision>0),
 updated_at TEXT ,
 updated_by TEXT COLLATE NOCASE NOT NULL REFERENCES actor_refs(account_id));

CREATE TABLE lesson_plan_preferences (
 activity_key TEXT COLLATE NOCASE NOT NULL REFERENCES activities(activity_key),
 run_id TEXT COLLATE NOCASE NOT NULL DEFAULT '',
 teacher_id TEXT COLLATE NOCASE NOT NULL REFERENCES accounts(account_id),
 period TEXT NOT NULL CHECK(period IN ('WEEKLY','ENTIRE')),
 PRIMARY KEY(activity_key,run_id,teacher_id));

CREATE TABLE lesson_plan_requirements (
 activity_key TEXT PRIMARY KEY COLLATE NOCASE REFERENCES activities(activity_key),
 plans_required INTEGER  DEFAULT 1 CHECK(plans_required IN (0,1)));

CREATE TABLE lesson_plan_revisions (
 plan_id TEXT NOT NULL REFERENCES lesson_plans(plan_id),
 revision INTEGER NOT NULL,
 action TEXT NOT NULL CHECK(action IN ('DRAFT','SUBMIT')),
 content_json TEXT NOT NULL CHECK(json_valid(content_json)),
 actor_id TEXT COLLATE NOCASE NOT NULL REFERENCES actor_refs(account_id),
 created_at TEXT NOT NULL,
 PRIMARY KEY(plan_id,revision));

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
 submitted_at TEXT,
 last_submitted_at TEXT,
 submitted_due_at TEXT,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 UNIQUE(activity_key,run_id,teacher_id,period,week_start),
 CHECK(period='WEEKLY' AND length(week_start)=10 OR period='ENTIRE' AND week_start=''));

CREATE TABLE lesson_recording_companions(
 lesson_id TEXT NOT NULL REFERENCES lesson_media_lessons(lesson_id),
 asset_id TEXT NOT NULL REFERENCES lesson_media_assets(asset_id),
 uploaded_at TEXT NOT NULL,
 source_revision TEXT NOT NULL,
 revision INTEGER NOT NULL,
 draft_key TEXT NOT NULL,
 published_key TEXT,
 index_json TEXT,
 duration_seconds INTEGER NOT NULL CHECK(duration_seconds>0 AND duration_seconds<=86400),
 PRIMARY KEY(lesson_id,asset_id)
);

CREATE TABLE management_revisions (
 activity_key TEXT PRIMARY KEY COLLATE NOCASE NOT NULL REFERENCES program_settings(activity_key),
 source_revision TEXT,
 source_sequence INTEGER NOT NULL CHECK(source_sequence >= 0),
 source_snapshot_sha256 TEXT NOT NULL CHECK(length(source_snapshot_sha256) = 64),
 modified_at TEXT,
 modified_by_source_id TEXT);

CREATE TABLE memorisation_account_settings (
 account_id TEXT PRIMARY KEY COLLATE NOCASE NOT NULL REFERENCES accounts(account_id),
 active INTEGER NOT NULL CHECK(active IN (0,1)),
 revision INTEGER NOT NULL CHECK(revision>=1),
 updated_at TEXT NOT NULL,
 updated_by TEXT COLLATE NOCASE NOT NULL REFERENCES actor_refs(account_id));

CREATE TABLE memorisation_activity_settings (
 activity_key TEXT PRIMARY KEY COLLATE NOCASE NOT NULL REFERENCES activities(activity_key),
 learners_per_card INTEGER  DEFAULT 20 CHECK(learners_per_card BETWEEN 5 AND 50),
 active INTEGER NOT NULL CHECK(active IN (0,1)),
 revision INTEGER NOT NULL CHECK(revision>=1),
 updated_at TEXT NOT NULL,
 updated_by TEXT COLLATE NOCASE NOT NULL REFERENCES actor_refs(account_id));

CREATE TABLE memorisation_catalogue_state (
 singleton INTEGER PRIMARY KEY CHECK(singleton=1),
 revision INTEGER NOT NULL CHECK(revision>=1));

CREATE TABLE memorisation_set_activities (
 set_id TEXT COLLATE NOCASE NOT NULL REFERENCES memorisation_sets(set_id),
 activity_key TEXT COLLATE NOCASE NOT NULL REFERENCES activities(activity_key),
 PRIMARY KEY(set_id,activity_key));

CREATE TABLE memorisation_sets (
 set_id TEXT PRIMARY KEY COLLATE NOCASE NOT NULL,
 name TEXT  CHECK(length(trim(name)) BETWEEN 1 AND 160),
 name_key TEXT ,
 subject TEXT  CHECK(subject IN ('SURAHS','DUAS')),
 level TEXT  CHECK(length(trim(level)) BETWEEN 1 AND 60),
 sort_order INTEGER ,
 active INTEGER NOT NULL CHECK(active IN (0,1)),
 revision INTEGER  DEFAULT 1 CHECK(revision>=1),
 UNIQUE(subject,name_key));

CREATE TABLE "memorisation_tasks" (
 task_id TEXT PRIMARY KEY COLLATE NOCASE NOT NULL,
 module_id TEXT COLLATE NOCASE NOT NULL REFERENCES memorisation_sets(set_id),
 name TEXT  CHECK(length(trim(name)) BETWEEN 1 AND 240),
 sort_order INTEGER ,
 UNIQUE(module_id,name));

CREATE TABLE messaging_drafts (
 draft_id TEXT PRIMARY KEY,
 actor_id TEXT NOT NULL COLLATE NOCASE REFERENCES accounts(account_id),
 workspace TEXT NOT NULL,
 subject TEXT NOT NULL DEFAULT '', body TEXT NOT NULL DEFAULT '',
 targets_json TEXT NOT NULL CHECK(json_valid(targets_json)),
 link_json TEXT NOT NULL DEFAULT 'null' CHECK(json_valid(link_json)),
 requires_ack INTEGER NOT NULL DEFAULT 0 CHECK(requires_ack IN(0,1)),
 schedule_local TEXT, schedule_at TEXT, timezone TEXT NOT NULL,
 revision INTEGER NOT NULL DEFAULT 1,
 state TEXT NOT NULL DEFAULT 'DRAFT' CHECK(state IN('DRAFT','SCHEDULED','SENT','CANCELLED','NEEDS_REVIEW')),
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 notice_id TEXT, previous_notice_id TEXT, last_error TEXT NOT NULL DEFAULT '',
 next_attempt_at TEXT, attempts INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE messaging_events (
 event_id TEXT PRIMARY KEY, notice_id TEXT REFERENCES messaging_notices(notice_id),
 draft_id TEXT REFERENCES messaging_drafts(draft_id),
 actor_id TEXT NOT NULL COLLATE NOCASE REFERENCES accounts(account_id),
 action TEXT NOT NULL, details_json TEXT NOT NULL CHECK(json_valid(details_json)), occurred_at TEXT NOT NULL
);

CREATE TABLE messaging_jobs (
 notice_id TEXT PRIMARY KEY REFERENCES messaging_notices(notice_id),
 position INTEGER NOT NULL DEFAULT 0, attempts INTEGER NOT NULL DEFAULT 0,
 next_attempt_at TEXT NOT NULL, last_error TEXT NOT NULL DEFAULT '',
 state TEXT NOT NULL DEFAULT 'PENDING' CHECK(state IN('PENDING','DONE'))
);

CREATE TABLE messaging_notices (
 notice_id TEXT PRIMARY KEY,
 draft_id TEXT NOT NULL UNIQUE REFERENCES messaging_drafts(draft_id),
 actor_id TEXT NOT NULL COLLATE NOCASE REFERENCES accounts(account_id),
 sender_name TEXT NOT NULL, workspace TEXT NOT NULL,
 subject TEXT NOT NULL, body TEXT NOT NULL,
 targets_json TEXT NOT NULL CHECK(json_valid(targets_json)),
 audience_json TEXT NOT NULL CHECK(json_valid(audience_json)),
 link_json TEXT NOT NULL CHECK(json_valid(link_json)),
 requires_ack INTEGER NOT NULL CHECK(requires_ack IN(0,1)),
 recipient_count INTEGER NOT NULL,
 recipients_json TEXT NOT NULL CHECK(json_valid(recipients_json)),
 created_at TEXT NOT NULL, issued_at TEXT,
 state TEXT NOT NULL CHECK(state IN('ISSUING','SENT','WITHDRAWN')),
 withdrawn_at TEXT, withdrawn_by TEXT, withdrawal_reason TEXT NOT NULL DEFAULT '',
 previous_notice_id TEXT REFERENCES messaging_notices(notice_id),
 source_head TEXT NOT NULL, scheduled_for TEXT
);

CREATE TABLE messaging_operations (
 actor_id TEXT NOT NULL COLLATE NOCASE REFERENCES accounts(account_id), operation_id TEXT NOT NULL,
 request_hash TEXT NOT NULL, result_json TEXT NOT NULL CHECK(json_valid(result_json)), created_at TEXT NOT NULL,
 PRIMARY KEY(actor_id,operation_id)
);

CREATE TABLE messaging_recipients (
 notice_id TEXT NOT NULL REFERENCES messaging_notices(notice_id),
 account_id TEXT NOT NULL COLLATE NOCASE REFERENCES accounts(account_id),
 display_name TEXT NOT NULL, delivered_at TEXT NOT NULL,
 first_opened_at TEXT, unread INTEGER NOT NULL DEFAULT 1 CHECK(unread IN(0,1)),
 acknowledged_at TEXT, archived_at TEXT,
 PRIMARY KEY(notice_id,account_id)
);

CREATE TABLE messaging_reviews (
 review_id TEXT PRIMARY KEY, draft_id TEXT NOT NULL REFERENCES messaging_drafts(draft_id),
 actor_id TEXT NOT NULL COLLATE NOCASE REFERENCES accounts(account_id),
 draft_revision INTEGER NOT NULL, digest TEXT NOT NULL, recipient_digest TEXT NOT NULL,
 source_head TEXT NOT NULL, expires_at TEXT NOT NULL, created_at TEXT NOT NULL
);

CREATE TABLE modules (
 activity_key TEXT COLLATE NOCASE NOT NULL REFERENCES activities(activity_key),
 module_id TEXT COLLATE NOCASE NOT NULL,
 program_subject_id TEXT COLLATE NOCASE,
 level_id TEXT COLLATE NOCASE,
 name TEXT ,
 sort_order INTEGER ,
 active INTEGER NOT NULL CHECK(active IN (0,1)),
 PRIMARY KEY(activity_key, module_id),
 FOREIGN KEY(activity_key, program_subject_id) REFERENCES program_subjects(activity_key, program_subject_id),
 FOREIGN KEY(activity_key, level_id, program_subject_id) REFERENCES program_levels(activity_key, level_id, program_subject_id),
 CHECK(level_id IS NULL OR program_subject_id IS NOT NULL));

CREATE TABLE note_retention_discovery(kind TEXT PRIMARY KEY,last_created TEXT NOT NULL,last_id TEXT NOT NULL,resume_after TEXT NOT NULL,policy_revision INTEGER NOT NULL);

CREATE TABLE note_retention_items (
 item_id TEXT PRIMARY KEY,kind TEXT NOT NULL CHECK(kind IN('CLASS_NOTE','PDF_NOTE','SESSION_PDF')),ref_id TEXT NOT NULL,
 activity_key TEXT NOT NULL,class_ids_json TEXT NOT NULL CHECK(json_valid(class_ids_json)),lesson_date TEXT NOT NULL,label TEXT NOT NULL,
 created_at TEXT NOT NULL,next_check TEXT NOT NULL,delete_after TEXT NOT NULL,warned_at TEXT,
 state TEXT NOT NULL DEFAULT 'TRACKED' CHECK(state IN('TRACKED','WARNED','PURGING','DELETED','EXEMPT')),deleted_at TEXT,
 UNIQUE(kind,ref_id)
);

CREATE TABLE note_retention_objects(object_key TEXT PRIMARY KEY,state TEXT NOT NULL CHECK(state IN('PENDING','DELETING','DELETED')),updated_at TEXT NOT NULL);

CREATE TABLE note_retention_policy (
 singleton INTEGER PRIMARY KEY CHECK(singleton=1),months INTEGER NOT NULL DEFAULT 3 CHECK(months BETWEEN 1 AND 120),
 warning_days INTEGER NOT NULL DEFAULT 7 CHECK(warning_days BETWEEN 1 AND 90 AND warning_days<months*28),enabled_at TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE note_retention_recipients (
 item_id TEXT NOT NULL REFERENCES note_retention_items(item_id),account_id TEXT NOT NULL,
 first_opened_at TEXT,unread INTEGER NOT NULL DEFAULT 1 CHECK(unread IN(0,1)),archived_at TEXT,PRIMARY KEY(item_id,account_id)
);

CREATE TABLE operation_receipts (
 dataset_key TEXT NOT NULL,
 scope_key TEXT NOT NULL,
 operation_id TEXT NOT NULL,
 payload_sha256 TEXT NOT NULL CHECK (length(payload_sha256) = 64),
 result_json TEXT NOT NULL CHECK (json_valid(result_json)),
 actor_account_id TEXT COLLATE NOCASE REFERENCES actor_refs(account_id),
 completed_at TEXT NOT NULL,
 PRIMARY KEY (dataset_key, scope_key, operation_id));

CREATE TABLE program_historical_extensions (
 extension_id TEXT PRIMARY KEY,
 activity_key TEXT NOT NULL REFERENCES activities(activity_key),
 publication_id TEXT NOT NULL,
 start_date TEXT NOT NULL,
 end_date TEXT NOT NULL CHECK(end_date>=start_date),
 reason TEXT NOT NULL,
 created_at TEXT NOT NULL,
 FOREIGN KEY(activity_key,publication_id) REFERENCES timetable_publications(activity_key,publication_id));

CREATE TABLE program_levels (
 activity_key TEXT COLLATE NOCASE NOT NULL,
 level_id TEXT COLLATE NOCASE NOT NULL,
 program_subject_id TEXT COLLATE NOCASE NOT NULL,
 name TEXT ,
 sort_order INTEGER ,
 active INTEGER NOT NULL CHECK(active IN (0,1)),
 PRIMARY KEY(activity_key, level_id),
 UNIQUE(activity_key, level_id, program_subject_id),
 FOREIGN KEY(activity_key, program_subject_id) REFERENCES program_subjects(activity_key, program_subject_id));

CREATE TABLE program_monthly_media_policies (
 activity_key TEXT PRIMARY KEY COLLATE NOCASE REFERENCES activities(activity_key),
 enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN(0,1)),
 retain_recordings INTEGER NOT NULL DEFAULT 1 CHECK(retain_recordings=1),
 revision INTEGER NOT NULL DEFAULT 1,
 updated_at TEXT NOT NULL,
 updated_by_account_id TEXT NOT NULL REFERENCES actor_refs(account_id)
);

CREATE TABLE program_monthly_subscriptions (
 activity_key TEXT NOT NULL COLLATE NOCASE REFERENCES program_monthly_media_policies(activity_key),
 account_id TEXT NOT NULL COLLATE NOCASE REFERENCES accounts(account_id),
 lesson_month TEXT NOT NULL CHECK(length(lesson_month)=7 AND lesson_month GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]' AND substr(lesson_month,6,2) BETWEEN '01' AND '12'),
 active INTEGER NOT NULL CHECK(active IN(0,1)),
 class_ids_json TEXT NOT NULL CHECK(json_valid(class_ids_json) AND json_type(class_ids_json)='array'),
 payment_date TEXT NOT NULL DEFAULT '', payment_reference TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '',
 revision INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL,
 updated_by_account_id TEXT NOT NULL REFERENCES actor_refs(account_id),
 PRIMARY KEY(activity_key,account_id,lesson_month)
);

CREATE TABLE program_publication_lifecycle (
 activity_key TEXT COLLATE NOCASE NOT NULL,
 publication_id TEXT COLLATE NOCASE NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('ARCHIVED','CANCELLED')),
 changed_at TEXT NOT NULL,
 PRIMARY KEY(activity_key,publication_id),
 FOREIGN KEY(activity_key,publication_id) REFERENCES timetable_publications(activity_key,publication_id));

CREATE TABLE program_publication_state (
 activity_key TEXT PRIMARY KEY COLLATE NOCASE REFERENCES program_settings(activity_key),
 latest_publication_id TEXT COLLATE NOCASE,
 FOREIGN KEY(activity_key,latest_publication_id) REFERENCES timetable_publications(activity_key,publication_id));

CREATE TABLE program_resources (
 activity_key TEXT COLLATE NOCASE NOT NULL REFERENCES program_settings(activity_key),
 resource_id TEXT COLLATE NOCASE NOT NULL,
 program_subject_id TEXT COLLATE NOCASE,
 level_id TEXT COLLATE NOCASE,
 module_id TEXT COLLATE NOCASE,
 task_id TEXT COLLATE NOCASE,
 resource_type TEXT ,
 name TEXT ,
 description TEXT,
 drive_file_id TEXT,
 metadata_json TEXT  CHECK(json_valid(metadata_json)),
 active INTEGER NOT NULL CHECK(active IN (0,1)),
 PRIMARY KEY(activity_key, resource_id),
 FOREIGN KEY(activity_key, program_subject_id) REFERENCES program_subjects(activity_key, program_subject_id),
 FOREIGN KEY(activity_key, level_id) REFERENCES program_levels(activity_key, level_id),
 FOREIGN KEY(activity_key, module_id) REFERENCES modules(activity_key, module_id),
 FOREIGN KEY(activity_key, task_id) REFERENCES tasks(activity_key, task_id));

CREATE TABLE program_settings (
 activity_key TEXT PRIMARY KEY COLLATE NOCASE NOT NULL,
 kind TEXT NOT NULL DEFAULT 'PROGRAM' CHECK (kind = 'PROGRAM'),
 duration_years INTEGER CHECK (duration_years BETWEEN 1 AND 30),
 timezone TEXT  CHECK (length(trim(timezone)) > 0),
 revision INTEGER  DEFAULT 1 CHECK (revision >= 1),
 public_card_json TEXT  DEFAULT '{}' CHECK(json_valid(public_card_json)),
 FOREIGN KEY (activity_key, kind) REFERENCES activities(activity_key, kind));

CREATE TABLE program_subjects (
 activity_key TEXT COLLATE NOCASE NOT NULL REFERENCES program_settings(activity_key),
 program_subject_id TEXT COLLATE NOCASE NOT NULL,
 subject_key TEXT COLLATE NOCASE NOT NULL REFERENCES subject_catalog(subject_key),
 active INTEGER NOT NULL CHECK(active IN (0,1)),
 PRIMARY KEY(activity_key, program_subject_id));

CREATE TABLE program_surah_grants (
 activity_key TEXT NOT NULL COLLATE NOCASE REFERENCES activities(activity_key),
 account_id TEXT NOT NULL COLLATE NOCASE REFERENCES accounts(account_id),
 surah_id TEXT NOT NULL REFERENCES program_surahs(surah_id),
 active INTEGER NOT NULL CHECK(active IN(0,1)),
 note TEXT NOT NULL DEFAULT '' CHECK(length(note)<=500),
 revision INTEGER NOT NULL DEFAULT 1,
 updated_at TEXT NOT NULL,
 updated_by_account_id TEXT NOT NULL REFERENCES actor_refs(account_id),
 PRIMARY KEY(activity_key,account_id,surah_id)
);

CREATE TABLE program_surah_website_assets(
 asset_id TEXT PRIMARY KEY,
 surah_id TEXT NOT NULL REFERENCES program_surahs(surah_id),
 activity_key TEXT NOT NULL COLLATE NOCASE REFERENCES activities(activity_key),
 object_key TEXT UNIQUE,
 filename TEXT,
 mime_type TEXT CHECK(mime_type IS NULL OR mime_type IN('application/pdf','image/png','image/jpeg','image/webp')),
 byte_size INTEGER CHECK(byte_size IS NULL OR byte_size BETWEEN 1 AND 16777216),
 sha256 TEXT,
 created_at TEXT,
 created_by TEXT NOT NULL REFERENCES actor_refs(account_id));

CREATE TABLE program_surah_website_documents(
 surah_id TEXT PRIMARY KEY,
 activity_key TEXT NOT NULL COLLATE NOCASE REFERENCES activities(activity_key),
 document_json TEXT CHECK(document_json IS NULL OR json_valid(document_json)),
 schema_version INTEGER DEFAULT 1,
 source_kind TEXT DEFAULT 'TEMPLATE',
 revision INTEGER DEFAULT 1,
 enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN(0,1)),
 updated_at TEXT,
 updated_by TEXT NOT NULL REFERENCES actor_refs(account_id));

CREATE TABLE program_surahs(
 surah_id TEXT PRIMARY KEY,
 activity_key TEXT NOT NULL COLLATE NOCASE REFERENCES activities(activity_key),
 name TEXT NOT NULL,
 card_key TEXT NOT NULL DEFAULT '',
 completion_date TEXT NOT NULL CHECK(length(completion_date)=10),
 active INTEGER NOT NULL DEFAULT 1 CHECK(active IN(0,1)),
 revision INTEGER NOT NULL DEFAULT 1,
 updated_at TEXT NOT NULL,
 updated_by_account_id TEXT NOT NULL REFERENCES actor_refs(account_id));

CREATE TABLE published_lesson_classes (
 activity_key TEXT COLLATE NOCASE NOT NULL,
 publication_id TEXT COLLATE NOCASE NOT NULL,
 lesson_anchor TEXT NOT NULL,
 class_id TEXT COLLATE NOCASE NOT NULL,
 PRIMARY KEY(activity_key, publication_id, lesson_anchor, class_id),
 FOREIGN KEY(activity_key, publication_id, lesson_anchor) REFERENCES published_lessons(activity_key, publication_id, lesson_anchor),
 FOREIGN KEY(activity_key, class_id) REFERENCES classes(activity_key, class_id));

CREATE TABLE published_lesson_teachers (
 activity_key TEXT COLLATE NOCASE NOT NULL,
 publication_id TEXT COLLATE NOCASE NOT NULL,
 lesson_anchor TEXT NOT NULL,
 account_id TEXT COLLATE NOCASE NOT NULL REFERENCES accounts(account_id),
 PRIMARY KEY(activity_key, publication_id, lesson_anchor, account_id),
 FOREIGN KEY(activity_key, publication_id, lesson_anchor) REFERENCES published_lessons(activity_key, publication_id, lesson_anchor));

CREATE TABLE published_lessons (
 activity_key TEXT COLLATE NOCASE NOT NULL,
 publication_id TEXT COLLATE NOCASE NOT NULL,
 lesson_anchor TEXT NOT NULL,
 source_rule_id TEXT,
 module_id TEXT COLLATE NOCASE,
 kind TEXT NOT NULL,
 status TEXT NOT NULL,
 weekday INTEGER CHECK(weekday BETWEEN 0 AND 6),
 lesson_date TEXT,
 start_time TEXT NOT NULL,
 end_time TEXT NOT NULL,
 timezone TEXT NOT NULL,
 title TEXT,
 zoom_link TEXT,
 snapshot_json TEXT NOT NULL CHECK(json_valid(snapshot_json)),
 PRIMARY KEY(activity_key, publication_id, lesson_anchor),
 FOREIGN KEY(activity_key, publication_id) REFERENCES timetable_publications(activity_key, publication_id),
 FOREIGN KEY(activity_key, module_id) REFERENCES modules(activity_key, module_id),
 CHECK(weekday IS NOT NULL OR lesson_date IS NOT NULL));

CREATE TABLE role_assignments (
 assignment_id TEXT PRIMARY KEY NOT NULL,
 account_id TEXT COLLATE NOCASE NOT NULL REFERENCES accounts(account_id),
 activity_key TEXT COLLATE NOCASE NOT NULL REFERENCES activities(activity_key),
 role TEXT NOT NULL CHECK (role IN ('STUDENT', 'TEACHER', 'PROGRAM_ADMIN')),
 active INTEGER NOT NULL CHECK (active IN (0, 1)),
 review_state TEXT NOT NULL DEFAULT 'REQUIRED' CHECK (review_state IN ('REQUIRED', 'CONFIRMED')),
 granted_at TEXT,
 granted_by_account_id TEXT COLLATE NOCASE REFERENCES actor_refs(account_id),
 revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
 grant_source TEXT NOT NULL DEFAULT 'EXPLICIT' CHECK(grant_source IN('EXPLICIT','LEGACY_MAPPED')),
 legacy_source_role TEXT);

CREATE TABLE setup_batches (
 batch_id TEXT PRIMARY KEY,
 actor_account_id TEXT NOT NULL,
 scope_keys_json TEXT NOT NULL CHECK(json_valid(scope_keys_json)),
 source_version INTEGER NOT NULL,
 expected_head TEXT,
 digest TEXT NOT NULL,
 manifest_json TEXT NOT NULL CHECK(json_valid(manifest_json)),
 created_at TEXT NOT NULL,
 accepted_head TEXT);

CREATE TABLE setup_components (
 component_id TEXT PRIMARY KEY,
 batch_id TEXT NOT NULL REFERENCES setup_batches(batch_id),
 table_name TEXT NOT NULL,
 scope_key TEXT NOT NULL COLLATE NOCASE,
 rows_json TEXT NOT NULL CHECK(json_valid(rows_json) AND json_type(rows_json)='array' AND length(CAST(rows_json AS BLOB))<=1500000),
 row_count INTEGER NOT NULL CHECK(row_count=json_array_length(rows_json)),
 digest TEXT NOT NULL);

CREATE TABLE setup_head_components (
 head_id TEXT NOT NULL REFERENCES setup_heads(head_id),
 table_name TEXT NOT NULL,
 scope_key TEXT NOT NULL COLLATE NOCASE,
 component_id TEXT NOT NULL REFERENCES setup_components(component_id),
 PRIMARY KEY(head_id,table_name,scope_key));

CREATE TABLE setup_head_state (
 singleton INTEGER PRIMARY KEY CHECK(singleton=1),
 head_id TEXT NOT NULL REFERENCES setup_heads(head_id));

CREATE TABLE setup_heads (
 head_id TEXT PRIMARY KEY,
 parent_head TEXT REFERENCES setup_heads(head_id),
 batch_id TEXT NOT NULL UNIQUE REFERENCES setup_batches(batch_id),
 accepted_at TEXT NOT NULL,
 accepted_by TEXT NOT NULL);

CREATE TABLE split_command_parts(command_id TEXT NOT NULL REFERENCES split_commands(command_id),part_index INTEGER NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(command_id,part_index));

CREATE TABLE split_commands(command_id TEXT PRIMARY KEY,phase TEXT NOT NULL CHECK(phase IN('PREPARING','PENDING','APPLIED','COMMITTED','ABORTING','ROLLED_BACK','ABORTED','DONE')),payload_hash TEXT NOT NULL,proof_json TEXT,created_at TEXT NOT NULL,error_code TEXT);

CREATE TABLE split_deployment_state(singleton INTEGER PRIMARY KEY CHECK(singleton=1),generation TEXT NOT NULL CHECK(generation='SPLIT_V1'),state TEXT NOT NULL CHECK(state IN('PREPARING','READY')),source_digest TEXT NOT NULL,selection_digest TEXT NOT NULL,prepared_at TEXT NOT NULL);

CREATE TABLE split_read_state(singleton INTEGER PRIMARY KEY CHECK(singleton=1),version INTEGER NOT NULL);

CREATE TABLE split_transaction_guards(guard_id TEXT PRIMARY KEY,accepted INTEGER NOT NULL CHECK(accepted=1));

CREATE TABLE split_write_fence(singleton INTEGER PRIMARY KEY CHECK(singleton=1),command_id TEXT NOT NULL UNIQUE REFERENCES split_commands(command_id),allow_write INTEGER NOT NULL DEFAULT 0 CHECK(allow_write IN(0,1)));

CREATE TABLE subject_catalog (
 subject_key TEXT PRIMARY KEY COLLATE NOCASE NOT NULL,
 source_namespace TEXT  CHECK(source_namespace IN ('ACADEMY','GLOBAL_REFERENCE')),
 subject_id TEXT COLLATE NOCASE ,
 name TEXT  CHECK(length(trim(name)) > 0),
 active INTEGER NOT NULL CHECK(active IN (0,1)),
 UNIQUE(source_namespace, subject_id));

CREATE TABLE tasks (
 activity_key TEXT COLLATE NOCASE NOT NULL REFERENCES activities(activity_key),
 task_id TEXT COLLATE NOCASE NOT NULL,
 program_subject_id TEXT COLLATE NOCASE,
 module_id TEXT COLLATE NOCASE,
 name TEXT ,
 sort_order INTEGER ,
 active INTEGER NOT NULL CHECK(active IN (0,1)),
 PRIMARY KEY(activity_key, task_id),
 FOREIGN KEY(activity_key, program_subject_id) REFERENCES program_subjects(activity_key, program_subject_id),
 FOREIGN KEY(activity_key, module_id) REFERENCES modules(activity_key, module_id));

CREATE TABLE teacher_availability (
 account_id TEXT COLLATE NOCASE PRIMARY KEY REFERENCES accounts(account_id),
 ranges_json TEXT  CHECK(json_valid(ranges_json)),
 revision INTEGER  CHECK(revision>0),
 updated_at TEXT );

CREATE TABLE timetable_publications (
 activity_key TEXT COLLATE NOCASE NOT NULL REFERENCES activities(activity_key),
 publication_id TEXT COLLATE NOCASE NOT NULL,
 scope_key TEXT NOT NULL,
 version_no INTEGER NOT NULL CHECK(version_no >= 1),
 pattern TEXT NOT NULL CHECK(pattern IN ('WEEKLY','DATED','COURSE')),
 published_at TEXT,
 published_by_source_id TEXT,
 effective_from TEXT,
 effective_until TEXT,
 timezone TEXT NOT NULL,
 snapshot_json TEXT NOT NULL CHECK(json_valid(snapshot_json)),
 source_snapshot_sha256 TEXT NOT NULL CHECK(length(source_snapshot_sha256) = 64),
 conversion TEXT NOT NULL CHECK(conversion IN ('EXACT','ACTIVE_ONLY')),
 PRIMARY KEY(activity_key, publication_id),
 UNIQUE(activity_key, scope_key, version_no));

CREATE TABLE website_platform_access_cancellations(transfer_id TEXT PRIMARY KEY,activity_key TEXT NOT NULL REFERENCES activities(activity_key),cancelled_at INTEGER NOT NULL);

CREATE TABLE website_platform_access_dirty(activity_key TEXT NOT NULL COLLATE NOCASE,account_id TEXT NOT NULL COLLATE NOCASE,revision INTEGER NOT NULL DEFAULT 1,exported_revision INTEGER NOT NULL DEFAULT 0,generation INTEGER NOT NULL DEFAULT 0,next_attempt INTEGER NOT NULL DEFAULT 0,last_error TEXT,PRIMARY KEY(activity_key,account_id));

CREATE TABLE website_platform_access_imports(activity_key TEXT NOT NULL COLLATE NOCASE,dataset TEXT NOT NULL,cursor TEXT NOT NULL DEFAULT '' COLLATE NOCASE,done INTEGER NOT NULL DEFAULT 0,generation INTEGER NOT NULL,PRIMARY KEY(activity_key,dataset));

CREATE TABLE website_platform_access_ownership(activity_key TEXT PRIMARY KEY REFERENCES activities(activity_key),state TEXT NOT NULL CHECK(state IN('ACADEMY','FROZEN','STUDIO')),transfer_id TEXT UNIQUE,generation INTEGER,source_version INTEGER,cursor TEXT NOT NULL DEFAULT '',checked INTEGER NOT NULL DEFAULT 0,updated_at INTEGER NOT NULL);

CREATE TABLE website_platform_access_scopes(activity_key TEXT PRIMARY KEY COLLATE NOCASE REFERENCES website_platform_timetable_scopes(activity_key),enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN(0,1)),purchase_model TEXT NOT NULL DEFAULT 'UNREVIEWED' CHECK(purchase_model IN('UNREVIEWED','CONFIRMED_SUBSCRIPTION')),revision INTEGER NOT NULL DEFAULT 1);

CREATE TABLE website_platform_admissions(account_id TEXT PRIMARY KEY REFERENCES accounts(account_id),active INTEGER NOT NULL CHECK(active IN(0,1)));

CREATE TABLE website_platform_completed_courses(
 activity_key TEXT PRIMARY KEY COLLATE NOCASE REFERENCES activities(activity_key),
 registration_id TEXT NOT NULL UNIQUE,
 website_id TEXT NOT NULL UNIQUE,
 package_sha256 TEXT NOT NULL CHECK(length(package_sha256)=64),
 title TEXT NOT NULL,
 timezone TEXT NOT NULL,
 registered_at INTEGER NOT NULL
);

CREATE TABLE website_platform_control(singleton INTEGER PRIMARY KEY CHECK(singleton=1),enabled INTEGER NOT NULL CHECK(enabled IN(0,1)));

CREATE TABLE website_platform_course_jobs(
 activity_key TEXT PRIMARY KEY COLLATE NOCASE REFERENCES website_platform_new_courses(activity_key),
 offering_id TEXT NOT NULL UNIQUE,registration_id TEXT NOT NULL UNIQUE,run_id TEXT NOT NULL,publication_id TEXT NOT NULL,
 access_model TEXT NOT NULL CHECK(access_model IN('FREE','PAID')),phase TEXT NOT NULL CHECK(phase IN('REGISTER','RECONCILE','HANDOVER','COMPLETE')),
 next_attempt INTEGER NOT NULL DEFAULT 0,attempts INTEGER NOT NULL DEFAULT 0,last_error TEXT,created_at INTEGER NOT NULL
);

CREATE TABLE website_platform_course_policy_mirror(activity_key TEXT PRIMARY KEY COLLATE NOCASE REFERENCES activities(activity_key),access_model TEXT NOT NULL CHECK(access_model IN('FREE','PAID')),revision INTEGER NOT NULL CHECK(revision>0));

CREATE TABLE website_platform_guards(guard_id TEXT PRIMARY KEY,accepted INTEGER NOT NULL CHECK(accepted=1));

CREATE TABLE website_platform_live_operations(operation_id TEXT PRIMARY KEY,actor_id TEXT NOT NULL,payload_hash TEXT NOT NULL,result_json TEXT NOT NULL,created_at INTEGER NOT NULL);

CREATE TABLE website_platform_new_courses(activity_key TEXT PRIMARY KEY COLLATE NOCASE REFERENCES activities(activity_key),created_operation TEXT NOT NULL UNIQUE,published_title TEXT NOT NULL DEFAULT '',published_timezone TEXT NOT NULL DEFAULT 'UTC');

CREATE TABLE website_platform_outbox(operation_id TEXT PRIMARY KEY,stream TEXT NOT NULL,version INTEGER NOT NULL,event_json TEXT NOT NULL,acknowledged INTEGER NOT NULL DEFAULT 0,attempts INTEGER NOT NULL DEFAULT 0,next_attempt INTEGER NOT NULL DEFAULT 0, access_scope TEXT, access_account TEXT, access_revision INTEGER,UNIQUE(stream,version));

CREATE TABLE website_platform_programme_operations(operation_id TEXT PRIMARY KEY,actor_id TEXT NOT NULL,payload_hash TEXT NOT NULL,result_json TEXT NOT NULL,created_at INTEGER NOT NULL);

CREATE TABLE website_platform_programmes(
 activity_key TEXT PRIMARY KEY COLLATE NOCASE REFERENCES activities(activity_key),
 programme_key TEXT NOT NULL UNIQUE CHECK(programme_key='mothers'),
 access_model TEXT NOT NULL CHECK(access_model='MONTHLY'),
 enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN(0,1))
);

CREATE TABLE website_platform_provisioning(operation_id TEXT PRIMARY KEY,actor_id TEXT NOT NULL,payload_hash TEXT NOT NULL,account_id TEXT NOT NULL REFERENCES accounts(account_id),event_json TEXT);

CREATE TABLE website_platform_return_codes(code_hash TEXT PRIMARY KEY,source_ref TEXT NOT NULL REFERENCES website_platform_sessions(source_ref),challenge TEXT NOT NULL,state TEXT NOT NULL,expires_at INTEGER NOT NULL,used INTEGER NOT NULL DEFAULT 0, return_context TEXT);

CREATE TABLE website_platform_sessions(source_ref TEXT PRIMARY KEY,account_id TEXT NOT NULL REFERENCES accounts(account_id),session_id TEXT NOT NULL,epoch INTEGER NOT NULL,context_json TEXT NOT NULL,expires_at INTEGER NOT NULL,challenge TEXT,state TEXT);

CREATE TABLE website_platform_streams(stream TEXT PRIMARY KEY,version INTEGER NOT NULL);

CREATE TABLE website_platform_surah_maps(activity_key TEXT NOT NULL COLLATE NOCASE REFERENCES website_platform_access_scopes(activity_key),surah_id TEXT NOT NULL REFERENCES program_surahs(surah_id),website_id TEXT NOT NULL UNIQUE,PRIMARY KEY(activity_key,surah_id));

CREATE TABLE website_platform_timetable_scopes(
 activity_key TEXT PRIMARY KEY COLLATE NOCASE REFERENCES activities(activity_key),
 offering_id TEXT NOT NULL UNIQUE, kind TEXT NOT NULL CHECK(kind IN ('COURSE','TAFSEER','ACADEMY')),
 revision INTEGER NOT NULL DEFAULT 1, exported_revision INTEGER NOT NULL DEFAULT 0,
 next_attempt INTEGER NOT NULL DEFAULT 0, attempts INTEGER NOT NULL DEFAULT 0, last_error TEXT
);

CREATE TABLE website_studio_assets(
 asset_id TEXT PRIMARY KEY,website_id TEXT NOT NULL REFERENCES website_studio_state(website_id),
 source TEXT NOT NULL CHECK(source IN('STUDIO','ACADEMY')),
 object_key TEXT,sha256 TEXT,filename TEXT NOT NULL,mime_type TEXT NOT NULL,byte_size INTEGER NOT NULL,
 lesson_id TEXT,native_asset_id TEXT,created_at TEXT NOT NULL,created_by TEXT NOT NULL REFERENCES actor_refs(account_id)
);

CREATE TABLE website_studio_operations(
 website_id TEXT NOT NULL,operation_id TEXT NOT NULL,payload_sha256 TEXT NOT NULL,
 actor_account_id TEXT NOT NULL REFERENCES actor_refs(account_id),result_json TEXT NOT NULL CHECK(json_valid(result_json)),
 completed_at TEXT NOT NULL,PRIMARY KEY(website_id,operation_id)
);

CREATE TABLE website_studio_state(
 website_id TEXT PRIMARY KEY,
 activity_key TEXT NOT NULL COLLATE NOCASE REFERENCES activities(activity_key),
 surah_id TEXT,
 revision INTEGER NOT NULL CHECK(revision>=0),
 draft_key TEXT NOT NULL,draft_sha256 TEXT NOT NULL,draft_bytes INTEGER NOT NULL,
 published_key TEXT,published_sha256 TEXT,published_revision INTEGER,
 enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN(0,1)),
 source_kind TEXT NOT NULL DEFAULT 'TEMPLATE',
 migrated_at TEXT NOT NULL,updated_at TEXT NOT NULL,updated_by TEXT NOT NULL REFERENCES actor_refs(account_id)
);

CREATE TABLE weekly_absentee_recipients (
 week_start TEXT NOT NULL REFERENCES weekly_absentee_reports(week_start),
 account_id TEXT NOT NULL COLLATE NOCASE REFERENCES accounts(account_id),
 first_opened_at TEXT, unread INTEGER NOT NULL DEFAULT 1 CHECK(unread IN(0,1)), archived_at TEXT,
 PRIMARY KEY(week_start,account_id)
);

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

CREATE VIEW effective_activity_roles AS SELECT r.assignment_id,r.account_id,r.activity_key,r.role FROM role_assignments r JOIN accounts a USING(account_id) WHERE a.active=1 AND r.active=1 AND r.review_state='CONFIRMED' AND r.grant_source='EXPLICIT';

CREATE VIEW effective_course_subscriptions AS SELECT account_id,activity_key FROM course_subscription_decisions WHERE active=1;

CREATE VIEW hifz_profile_sync_projection AS
SELECT a.account_id,a.display_name,a.login_link_id,
 COALESCE(c.whatsapp_number,'') AS whatsapp_number,
 CASE WHEN EXISTS(SELECT 1 FROM global_role_assignments g WHERE g.account_id=a.account_id AND g.active=1 AND g.role='GLOBAL_ADMIN' AND g.review_state='CONFIRMED')
   OR EXISTS(SELECT 1 FROM effective_activity_roles r WHERE r.account_id=a.account_id AND r.activity_key=s.setting_value AND r.role='PROGRAM_ADMIN') THEN 'admin'
  WHEN EXISTS(SELECT 1 FROM effective_activity_roles r WHERE r.account_id=a.account_id AND r.activity_key=s.setting_value AND r.role='TEACHER') THEN 'teacher'
  ELSE 'student' END AS role,
 CASE WHEN a.active=1 AND EXISTS(SELECT 1 FROM activities x WHERE x.activity_key=s.setting_value AND x.active=1 AND x.lifecycle='ACTIVE') AND
  (EXISTS(SELECT 1 FROM global_role_assignments g WHERE g.account_id=a.account_id AND g.active=1 AND g.role='GLOBAL_ADMIN' AND g.review_state='CONFIRMED') OR
   EXISTS(SELECT 1 FROM effective_activity_roles r WHERE r.account_id=a.account_id AND r.activity_key=s.setting_value AND r.role IN('STUDENT','TEACHER','PROGRAM_ADMIN'))) THEN 1 ELSE 0 END AS active
FROM accounts a JOIN academy_settings s ON s.setting_key='HifzProfileActivityKey'
LEFT JOIN account_contact_details c USING(account_id);

CREATE VIEW website_platform_account_state AS SELECT a.account_id,a.display_name,a.active,c.credential_epoch epoch,
 COALESCE((SELECT active FROM website_platform_admissions x WHERE x.account_id=a.account_id),1) admitted,
 EXISTS(SELECT 1 FROM global_role_assignments g WHERE g.account_id=a.account_id AND g.role='GLOBAL_ADMIN' AND g.active=1 AND g.review_state='CONFIRMED') global_admin
 FROM accounts a JOIN account_credentials c USING(account_id);

CREATE INDEX academy_announcements_public ON academy_announcements(active,deleted_at,display_order,created_at);

CREATE INDEX academy_calendar_scope_dates ON academy_calendar_events(scope_key,start_date,end_date);

CREATE INDEX academy_media_playlist_recordings_area ON academy_media_playlist_recordings(activity_key,lesson_id);

CREATE INDEX academy_media_playlist_recordings_page ON academy_media_playlist_recordings(playlist_id,position,lesson_id);

CREATE INDEX academy_media_playlists_area ON academy_media_playlists(activity_key,created_at DESC,playlist_id DESC);

CREATE INDEX academy_media_playlists_class ON academy_media_playlists(activity_key,class_id,enabled,created_at DESC,playlist_id DESC);

CREATE UNIQUE INDEX academy_module_subject_name ON academy_module_catalogue(subject_key,name_key) WHERE subject_key IS NOT NULL;

CREATE UNIQUE INDEX academy_module_unclassified_name ON academy_module_catalogue(name_key) WHERE subject_key IS NULL;

CREATE INDEX academy_module_usage_catalogue ON academy_module_usage(academy_module_id);

CREATE INDEX assessment_events_answer_views ON assessment_events(assessment_id,actor_id,action);

CREATE INDEX assessment_events_history ON assessment_events(assessment_id,occurred_at);

CREATE INDEX assessment_files_assessment ON assessment_files(assessment_id,kind);

CREATE INDEX assessment_recipients_account ON assessment_recipients(account_id,assessment_id);

CREATE INDEX assessments_class_date ON assessments(activity_key,class_id,exam_date);

CREATE INDEX assessments_phase_date ON assessments(phase_id,exam_date);

CREATE INDEX assessments_register_date ON assessments(register_id,exam_date);

CREATE INDEX attendance_context_day ON attendance_day_contexts(day_id,class_id,required);

CREATE INDEX attendance_delivery_dates ON attendance_delivery_members(activity_key,run_id,state,join_date,leave_date);

CREATE INDEX attendance_substitute_actor ON attendance_substitutes(account_id,revoked_at,correction_until);

CREATE UNIQUE INDEX attendance_substitute_current ON attendance_substitutes(activity_key,attendance_date,stable_key) WHERE revoked_at IS NULL;

CREATE INDEX attendance_substitute_session ON attendance_substitutes(activity_key,attendance_date,stable_key,revoked_at);

CREATE INDEX attendance_versions_series ON attendance_register_versions(series_id,submitted_at);

CREATE INDEX attendance_weekly_dates ON attendance_days(attendance_date,day_id);

CREATE INDEX audit_by_record ON audit_events(record_kind, record_id, occurred_at);

CREATE INDEX class_note_versions_due ON class_note_versions(due_context_id,due_date);

CREATE INDEX class_notes_lesson ON class_notes(activity_key,context_id,state,created_at,note_id);

CREATE INDEX class_notes_programme_history ON class_notes(activity_key,state,created_at DESC,note_id DESC);

CREATE INDEX class_notes_retention_created ON class_notes(created_at,note_id);

CREATE INDEX course_subscriptions_by_activity ON course_subscription_decisions(activity_key,active,account_id);

CREATE INDEX course_website_assets_scope ON course_website_assets(activity_key,asset_id);

CREATE INDEX enrolment_items_by_activity ON academy_enrolment_request_items(activity_key,request_id);

CREATE INDEX enrolment_requests_newest ON academy_enrolment_requests(created_at DESC,request_id DESC);

CREATE INDEX hifz_profile_sync_pending ON hifz_profile_sync(next_attempt_at) WHERE revision>delivered_revision;

CREATE INDEX historical_extensions_dates ON program_historical_extensions(start_date,end_date,activity_key);

CREATE INDEX learner_task_progress_task ON learner_task_progress(task_id,account_id);

CREATE INDEX lesson_media_by_program_date ON lesson_media_lessons(activity_key,state,lesson_date,lesson_id);

CREATE INDEX lesson_media_by_run ON lesson_media_lessons(activity_key,run_id,lesson_date,lesson_id);

CREATE UNIQUE INDEX lesson_media_course_pdfs ON lesson_media_lessons(activity_key) WHERE media_scope='COURSE';

CREATE INDEX lesson_media_links_asset ON lesson_media_links(asset_id,lesson_id);

CREATE INDEX lesson_media_retention_created ON lesson_media_assets(kind,created_at,asset_id);

CREATE INDEX lesson_media_retention_hash ON lesson_media_assets(substr(object_key,-68)) WHERE kind='PDF';

CREATE UNIQUE INDEX lesson_media_session_key ON lesson_media_lessons(activity_key,session_key) WHERE session_key IS NOT NULL;

CREATE INDEX lesson_note_retention_hash ON lesson_note_versions(sha256);

CREATE INDEX lesson_note_retention_versions ON lesson_note_versions(note_id,version_id);

CREATE INDEX lesson_notes_owner ON lesson_note_entries(owner_id,activity_key,state);

CREATE INDEX lesson_notes_retention_created ON lesson_note_entries(created_at,note_id);

CREATE INDEX lesson_notes_session ON lesson_note_entries(activity_key,session_key,state);

CREATE INDEX lesson_plan_comments_by_plan ON lesson_plan_comments(plan_id,created_at);

CREATE INDEX lesson_plans_board ON lesson_plans(activity_key,period,week_start,teacher_id);

CREATE INDEX lesson_recording_companions_expiry ON lesson_recording_companions(uploaded_at,lesson_id,asset_id);

CREATE INDEX lessons_by_date ON published_lessons(lesson_date, activity_key, publication_id);

CREATE INDEX lessons_by_weekday ON published_lessons(weekday, activity_key, publication_id);

CREATE INDEX memberships_by_class ON class_memberships(activity_key, class_id, active, account_id);

CREATE INDEX memberships_by_person ON class_memberships(account_id, active, activity_key, class_id);

CREATE INDEX memorisation_tasks_module ON memorisation_tasks(module_id,sort_order);

CREATE INDEX messaging_drafts_due ON messaging_drafts(state,schedule_at,next_attempt_at);

CREATE INDEX messaging_drafts_owner ON messaging_drafts(actor_id,state,updated_at,draft_id);

CREATE INDEX messaging_events_notice ON messaging_events(notice_id,occurred_at,event_id);

CREATE INDEX messaging_jobs_due ON messaging_jobs(state,next_attempt_at);

CREATE INDEX messaging_notices_sender ON messaging_notices(actor_id,created_at,notice_id);

CREATE INDEX messaging_recipients_inbox ON messaging_recipients(account_id,archived_at,delivered_at,notice_id);

CREATE INDEX messaging_reviews_draft ON messaging_reviews(draft_id,created_at);

CREATE INDEX note_retention_due ON note_retention_items(state,next_check,item_id);

CREATE INDEX note_retention_inbox ON note_retention_recipients(account_id,item_id);

CREATE INDEX note_retention_object_queue ON note_retention_objects(state,updated_at,object_key);

CREATE INDEX note_warning_class_members ON class_memberships(activity_key,class_id,active,account_id,start_date,end_date);

CREATE INDEX note_warning_delivery_inbox ON attendance_delivery_members(account_id,state,activity_key,run_id);

CREATE INDEX note_warning_delivery_members ON attendance_delivery_members(activity_key,run_id,state,account_id,join_date,leave_date);

CREATE INDEX note_warning_items_inbox ON note_retention_items(activity_key,state,delete_after,item_id);

CREATE INDEX note_warning_learner_inbox ON class_memberships(account_id,active,activity_key,class_id);

CREATE UNIQUE INDEX one_active_global_role ON global_role_assignments(account_id, role) WHERE active = 1;

CREATE UNIQUE INDEX one_active_scoped_role ON role_assignments(account_id, activity_key, role) WHERE active = 1;

CREATE INDEX program_monthly_own ON program_monthly_subscriptions(account_id,active,activity_key,lesson_month);

CREATE INDEX program_monthly_register ON program_monthly_subscriptions(activity_key,lesson_month,account_id);

CREATE INDEX program_surah_grants_own ON program_surah_grants(account_id,active,activity_key,surah_id);

CREATE INDEX program_surah_website_assets_scope ON program_surah_website_assets(surah_id,asset_id);

CREATE UNIQUE INDEX program_surahs_card ON program_surahs(activity_key,card_key) WHERE card_key<>'';

CREATE INDEX program_surahs_scope ON program_surahs(activity_key,completion_date,surah_id);

CREATE INDEX publications_by_scope ON timetable_publications(activity_key, scope_key, effective_from, version_no);

CREATE INDEX roles_by_activity ON role_assignments(activity_key, active, review_state, role, account_id);

CREATE INDEX sessions_by_account ON account_sessions(account_id, expires_at);

CREATE INDEX setup_components_batch ON setup_components(batch_id,table_name,scope_key);

CREATE INDEX setup_vector_component ON setup_head_components(component_id,head_id);

CREATE INDEX studio_access_dirty_unreconciled ON website_platform_access_dirty(activity_key,account_id) WHERE revision<>exported_revision OR last_error IS NOT NULL;

CREATE INDEX studio_access_import_pending ON website_platform_access_imports(activity_key,done,dataset);

CREATE INDEX studio_live_class_picker ON classes(activity_key,active,class_id);

CREATE INDEX teaching_by_account ON published_lesson_teachers(account_id, activity_key, publication_id, lesson_anchor);

CREATE INDEX website_platform_access_due ON website_platform_access_dirty(next_attempt,activity_key,account_id);

CREATE INDEX website_platform_access_enabled ON website_platform_access_scopes(enabled,activity_key);

CREATE INDEX website_platform_access_import_due ON website_platform_access_imports(done,activity_key,dataset);

CREATE INDEX website_platform_access_pending ON website_platform_outbox(access_account,acknowledged,stream,version);

CREATE INDEX website_platform_account_pending ON website_platform_outbox(stream,acknowledged,version);

CREATE INDEX website_platform_calendar ON academy_calendar_events(scope_key,teaching_impact,active,start_date);

CREATE INDEX website_platform_course_jobs_due ON website_platform_course_jobs(next_attempt,activity_key) WHERE phase<>'COMPLETE';

CREATE INDEX website_platform_global_page ON global_role_assignments(role,active,review_state,account_id);

CREATE INDEX website_platform_grants_page ON program_surah_grants(activity_key,account_id,active,surah_id);

CREATE INDEX website_platform_lifecycle_publication ON lesson_lifecycle(activity_key,publication_id);

CREATE INDEX website_platform_live_windows ON class_memberships(activity_key,account_id,active,end_date,enrollment_id);

CREATE INDEX website_platform_membership_page ON class_memberships(activity_key,account_id,active,enrollment_id);

CREATE INDEX website_platform_months_page ON program_monthly_subscriptions(activity_key,account_id,active,lesson_month);

CREATE INDEX website_platform_ownership_nocase ON website_platform_access_ownership(activity_key COLLATE NOCASE);

CREATE INDEX website_platform_pending ON website_platform_outbox(acknowledged,next_attempt,stream,version);

CREATE INDEX website_platform_program_versions ON timetable_publications(activity_key,scope_key,version_no DESC,effective_from);

CREATE INDEX website_platform_roles_page ON role_assignments(activity_key,account_id);

CREATE INDEX website_platform_schedule_due ON website_platform_timetable_scopes(next_attempt,activity_key);

CREATE INDEX website_platform_scope_pending ON website_platform_outbox(access_scope,access_account,acknowledged,stream,version);

CREATE INDEX website_platform_sessions_account ON website_platform_sessions(account_id COLLATE NOCASE,expires_at);

CREATE INDEX website_platform_sessions_native ON website_platform_sessions(session_id,epoch,expires_at);

CREATE INDEX website_platform_sessions_source ON website_platform_sessions(session_id);

CREATE INDEX website_platform_subscriptions_page ON course_subscription_decisions(activity_key,account_id);

CREATE INDEX website_platform_unscoped_due ON website_platform_outbox(next_attempt,stream,version) WHERE acknowledged=0 AND access_scope IS NULL;

CREATE INDEX website_studio_asset_scope ON website_studio_assets(website_id,asset_id);

CREATE INDEX website_studio_scope ON website_studio_state(activity_key,website_id);

CREATE INDEX weekly_absentee_inbox ON weekly_absentee_recipients(account_id,archived_at,week_start);

CREATE INDEX weekly_absentee_scope ON weekly_absentee_rows(week_start,activity_key,attendance_date,account_id);

CREATE TRIGGER academy_calendar_compat_revision
AFTER UPDATE OF event_type,description,start_date,end_date,alternate_date,teaching_impact,active,scope_key,calendar_kind ON academy_calendar_events
WHEN NEW.revision=OLD.revision
BEGIN
 UPDATE academy_calendar_events SET revision=OLD.revision+1 WHERE event_id=NEW.event_id;
END;

CREATE TRIGGER academy_snapshot_academy_calendar_events_delete AFTER DELETE ON "academy_calendar_events" BEGIN INSERT INTO academy_settings(setting_key,setting_value,updated_at,updated_by_account_id) VALUES('AcademySnapshot:calendar:'||'GLOBAL','1',strftime('%Y-%m-%dT%H:%M:%fZ','now'),NULL) ON CONFLICT(setting_key) DO UPDATE SET setting_value=CAST(setting_value AS INTEGER)+1,updated_at=excluded.updated_at; END;

CREATE TRIGGER academy_snapshot_academy_calendar_events_insert AFTER INSERT ON "academy_calendar_events" BEGIN INSERT INTO academy_settings(setting_key,setting_value,updated_at,updated_by_account_id) VALUES('AcademySnapshot:calendar:'||'GLOBAL','1',strftime('%Y-%m-%dT%H:%M:%fZ','now'),NULL) ON CONFLICT(setting_key) DO UPDATE SET setting_value=CAST(setting_value AS INTEGER)+1,updated_at=excluded.updated_at; END;

CREATE TRIGGER academy_snapshot_academy_calendar_events_update AFTER UPDATE OF active ON "academy_calendar_events" WHEN (OLD.active IS NOT NEW.active) BEGIN INSERT INTO academy_settings(setting_key,setting_value,updated_at,updated_by_account_id) VALUES('AcademySnapshot:calendar:'||'GLOBAL','1',strftime('%Y-%m-%dT%H:%M:%fZ','now'),NULL) ON CONFLICT(setting_key) DO UPDATE SET setting_value=CAST(setting_value AS INTEGER)+1,updated_at=excluded.updated_at; END;

CREATE TRIGGER academy_snapshot_academy_calendar_suppressions_delete AFTER DELETE ON "academy_calendar_suppressions" BEGIN INSERT INTO academy_settings(setting_key,setting_value,updated_at,updated_by_account_id) VALUES('AcademySnapshot:calendar:'||'GLOBAL','1',strftime('%Y-%m-%dT%H:%M:%fZ','now'),NULL) ON CONFLICT(setting_key) DO UPDATE SET setting_value=CAST(setting_value AS INTEGER)+1,updated_at=excluded.updated_at; END;

CREATE TRIGGER academy_snapshot_academy_calendar_suppressions_insert AFTER INSERT ON "academy_calendar_suppressions" BEGIN INSERT INTO academy_settings(setting_key,setting_value,updated_at,updated_by_account_id) VALUES('AcademySnapshot:calendar:'||'GLOBAL','1',strftime('%Y-%m-%dT%H:%M:%fZ','now'),NULL) ON CONFLICT(setting_key) DO UPDATE SET setting_value=CAST(setting_value AS INTEGER)+1,updated_at=excluded.updated_at; END;

CREATE TRIGGER academy_snapshot_academy_calendar_suppressions_update AFTER UPDATE ON "academy_calendar_suppressions" BEGIN INSERT INTO academy_settings(setting_key,setting_value,updated_at,updated_by_account_id) VALUES('AcademySnapshot:calendar:'||'GLOBAL','1',strftime('%Y-%m-%dT%H:%M:%fZ','now'),NULL) ON CONFLICT(setting_key) DO UPDATE SET setting_value=CAST(setting_value AS INTEGER)+1,updated_at=excluded.updated_at; END;

CREATE TRIGGER academy_snapshot_academy_settings_delete AFTER DELETE ON "academy_settings" WHEN (OLD.setting_key IN ('PersonalMemorisationCards','ProgramWorkspace') OR OLD.setting_key LIKE 'ProgramAccess:%') BEGIN INSERT INTO academy_settings(setting_key,setting_value,updated_at,updated_by_account_id) VALUES('AcademySnapshot:timetable:'||'GLOBAL','1',strftime('%Y-%m-%dT%H:%M:%fZ','now'),NULL) ON CONFLICT(setting_key) DO UPDATE SET setting_value=CAST(setting_value AS INTEGER)+1,updated_at=excluded.updated_at; END;

CREATE TRIGGER academy_snapshot_academy_settings_insert AFTER INSERT ON "academy_settings" WHEN (NEW.setting_key IN ('PersonalMemorisationCards','ProgramWorkspace') OR NEW.setting_key LIKE 'ProgramAccess:%') BEGIN INSERT INTO academy_settings(setting_key,setting_value,updated_at,updated_by_account_id) VALUES('AcademySnapshot:timetable:'||'GLOBAL','1',strftime('%Y-%m-%dT%H:%M:%fZ','now'),NULL) ON CONFLICT(setting_key) DO UPDATE SET setting_value=CAST(setting_value AS INTEGER)+1,updated_at=excluded.updated_at; END;

CREATE TRIGGER academy_snapshot_academy_settings_update AFTER UPDATE OF setting_key,setting_value ON "academy_settings" WHEN (OLD.setting_key IS NOT NEW.setting_key OR OLD.setting_value IS NOT NEW.setting_value) AND (NEW.setting_key IN ('PersonalMemorisationCards','ProgramWorkspace') OR NEW.setting_key LIKE 'ProgramAccess:%') BEGIN INSERT INTO academy_settings(setting_key,setting_value,updated_at,updated_by_account_id) VALUES('AcademySnapshot:timetable:'||'GLOBAL','1',strftime('%Y-%m-%dT%H:%M:%fZ','now'),NULL) ON CONFLICT(setting_key) DO UPDATE SET setting_value=CAST(setting_value AS INTEGER)+1,updated_at=excluded.updated_at; END;

CREATE TRIGGER academy_snapshot_accounts_delete AFTER DELETE ON "accounts" BEGIN INSERT INTO academy_settings(setting_key,setting_value,updated_at,updated_by_account_id) VALUES('AcademySnapshot:audience:'||'GLOBAL','1',strftime('%Y-%m-%dT%H:%M:%fZ','now'),NULL) ON CONFLICT(setting_key) DO UPDATE SET setting_value=CAST(setting_value AS INTEGER)+1,updated_at=excluded.updated_at; END;

CREATE TRIGGER academy_snapshot_accounts_insert AFTER INSERT ON "accounts" BEGIN INSERT INTO academy_settings(setting_key,setting_value,updated_at,updated_by_account_id) VALUES('AcademySnapshot:audience:'||'GLOBAL','1',strftime('%Y-%m-%dT%H:%M:%fZ','now'),NULL) ON CONFLICT(setting_key) DO UPDATE SET setting_value=CAST(setting_value AS INTEGER)+1,updated_at=excluded.updated_at; END;

CREATE TRIGGER academy_snapshot_accounts_update AFTER UPDATE OF active,display_name ON "accounts" WHEN (OLD.active IS NOT NEW.active OR OLD.display_name IS NOT NEW.display_name) BEGIN INSERT INTO academy_settings(setting_key,setting_value,updated_at,updated_by_account_id) VALUES('AcademySnapshot:audience:'||'GLOBAL','1',strftime('%Y-%m-%dT%H:%M:%fZ','now'),NULL) ON CONFLICT(setting_key) DO UPDATE SET setting_value=CAST(setting_value AS INTEGER)+1,updated_at=excluded.updated_at; END;

CREATE TRIGGER academy_snapshot_activities_delete AFTER DELETE ON "activities" BEGIN INSERT INTO academy_settings(setting_key,setting_value,updated_at,updated_by_account_id) VALUES('AcademySnapshot:audience:'||'GLOBAL','1',strftime('%Y-%m-%dT%H:%M:%fZ','now'),NULL) ON CONFLICT(setting_key) DO UPDATE SET setting_value=CAST(setting_value AS INTEGER)+1,updated_at=excluded.updated_at; END;

CREATE TRIGGER academy_snapshot_activities_insert AFTER INSERT ON "activities" BEGIN INSERT INTO academy_settings(setting_key,setting_value,updated_at,updated_by_account_id) VALUES('AcademySnapshot:audience:'||'GLOBAL','1',strftime('%Y-%m-%dT%H:%M:%fZ','now'),NULL) ON CONFLICT(setting_key) DO UPDATE SET setting_value=CAST(setting_value AS INTEGER)+1,updated_at=excluded.updated_at; END;

CREATE TRIGGER academy_snapshot_activities_update AFTER UPDATE OF active,lifecycle,website_visible ON "activities" WHEN (OLD.active IS NOT NEW.active OR OLD.lifecycle IS NOT NEW.lifecycle OR OLD.website_visible IS NOT NEW.website_visible) BEGIN INSERT INTO academy_settings(setting_key,setting_value,updated_at,updated_by_account_id) VALUES('AcademySnapshot:audience:'||'GLOBAL','1',strftime('%Y-%m-%dT%H:%M:%fZ','now'),NULL) ON CONFLICT(setting_key) DO UPDATE SET setting_value=CAST(setting_value AS INTEGER)+1,updated_at=excluded.updated_at; END;

CREATE TRIGGER academy_snapshot_assessment_recipients_delete AFTER DELETE ON "assessment_recipients" BEGIN INSERT INTO academy_settings(setting_key,setting_value,updated_at,updated_by_account_id) VALUES('AcademySnapshot:assessment:'||upper(OLD.account_id),'1',strftime('%Y-%m-%dT%H:%M:%fZ','now'),NULL) ON CONFLICT(setting_key) DO UPDATE SET setting_value=CAST(setting_value AS INTEGER)+1,updated_at=excluded.updated_at; END;

CREATE TRIGGER academy_snapshot_assessment_recipients_insert AFTER INSERT ON "assessment_recipients" BEGIN INSERT INTO academy_settings(setting_key,setting_value,updated_at,updated_by_account_id) VALUES('AcademySnapshot:assessment:'||upper(NEW.account_id),'1',strftime('%Y-%m-%dT%H:%M:%fZ','now'),NULL) ON CONFLICT(setting_key) DO UPDATE SET setting_value=CAST(setting_value AS INTEGER)+1,updated_at=excluded.updated_at; END;

CREATE TRIGGER academy_snapshot_assessment_recipients_update AFTER UPDATE OF assessment_id,account_id ON "assessment_recipients" WHEN (OLD.assessment_id IS NOT NEW.assessment_id OR OLD.account_id IS NOT NEW.account_id) BEGIN INSERT INTO academy_settings(setting_key,setting_value,updated_at,updated_by_account_id) VALUES('AcademySnapshot:assessment:'||upper(OLD.account_id),'1',strftime('%Y-%m-%dT%H:%M:%fZ','now'),NULL) ON CONFLICT(setting_key) DO UPDATE SET setting_value=CAST(setting_value AS INTEGER)+1,updated_at=excluded.updated_at;
INSERT INTO academy_settings(setting_key,setting_value,updated_at,updated_by_account_id) VALUES('AcademySnapshot:assessment:'||upper(NEW.account_id),'1',strftime('%Y-%m-%dT%H:%M:%fZ','now'),NULL) ON CONFLICT(setting_key) DO UPDATE SET setting_value=CAST(setting_value AS INTEGER)+1,updated_at=excluded.updated_at; END;

CREATE TRIGGER academy_snapshot_assessment_registers_delete AFTER DELETE ON "assessment_registers" BEGIN INSERT INTO academy_settings(setting_key,setting_value,updated_at,updated_by_account_id) VALUES('AcademySnapshot:assessment:'||'GLOBAL','1',strftime('%Y-%m-%dT%H:%M:%fZ','now'),NULL) ON CONFLICT(setting_key) DO UPDATE SET setting_value=CAST(setting_value AS INTEGER)+1,updated_at=excluded.updated_at; END;

CREATE TRIGGER academy_snapshot_assessment_registers_insert AFTER INSERT ON "assessment_registers" BEGIN INSERT INTO academy_settings(setting_key,setting_value,updated_at,updated_by_account_id) VALUES('AcademySnapshot:assessment:'||'GLOBAL','1',strftime('%Y-%m-%dT%H:%M:%fZ','now'),NULL) ON CONFLICT(setting_key) DO UPDATE SET setting_value=CAST(setting_value AS INTEGER)+1,updated_at=excluded.updated_at; END;

CREATE TRIGGER academy_snapshot_assessment_registers_update AFTER UPDATE OF status ON "assessment_registers" WHEN (OLD.status IS NOT NEW.status) BEGIN INSERT INTO academy_settings(setting_key,setting_value,updated_at,updated_by_account_id) VALUES('AcademySnapshot:assessment:'||'GLOBAL','1',strftime('%Y-%m-%dT%H:%M:%fZ','now'),NULL) ON CONFLICT(setting_key) DO UPDATE SET setting_value=CAST(setting_value AS INTEGER)+1,updated_at=excluded.updated_at; END;

CREATE TRIGGER academy_snapshot_assessments_delete AFTER DELETE ON "assessments" BEGIN INSERT INTO academy_settings(setting_key,setting_value,updated_at,updated_by_account_id) VALUES('AcademySnapshot:assessment:'||'GLOBAL','1',strftime('%Y-%m-%dT%H:%M:%fZ','now'),NULL) ON CONFLICT(setting_key) DO UPDATE SET setting_value=CAST(setting_value AS INTEGER)+1,updated_at=excluded.updated_at; END;

CREATE TRIGGER academy_snapshot_assessments_insert AFTER INSERT ON "assessments" BEGIN INSERT INTO academy_settings(setting_key,setting_value,updated_at,updated_by_account_id) VALUES('AcademySnapshot:assessment:'||'GLOBAL','1',strftime('%Y-%m-%dT%H:%M:%fZ','now'),NULL) ON CONFLICT(setting_key) DO UPDATE SET setting_value=CAST(setting_value AS INTEGER)+1,updated_at=excluded.updated_at; END;

CREATE TRIGGER academy_snapshot_assessments_update AFTER UPDATE OF schedule_published,examiner_id,deleted_at ON "assessments" WHEN (OLD.schedule_published IS NOT NEW.schedule_published OR OLD.examiner_id IS NOT NEW.examiner_id OR OLD.deleted_at IS NOT NEW.deleted_at) BEGIN INSERT INTO academy_settings(setting_key,setting_value,updated_at,updated_by_account_id) VALUES('AcademySnapshot:assessment:'||'GLOBAL','1',strftime('%Y-%m-%dT%H:%M:%fZ','now'),NULL) ON CONFLICT(setting_key) DO UPDATE SET setting_value=CAST(setting_value AS INTEGER)+1,updated_at=excluded.updated_at; END;

CREATE TRIGGER academy_snapshot_class_memberships_delete AFTER DELETE ON "class_memberships" BEGIN INSERT INTO academy_settings(setting_key,setting_value,updated_at,updated_by_account_id) VALUES('AcademySnapshot:membership:'||upper(OLD.account_id),'1',strftime('%Y-%m-%dT%H:%M:%fZ','now'),NULL) ON CONFLICT(setting_key) DO UPDATE SET setting_value=CAST(setting_value AS INTEGER)+1,updated_at=excluded.updated_at; END;

CREATE TRIGGER academy_snapshot_class_memberships_insert AFTER INSERT ON "class_memberships" BEGIN INSERT INTO academy_settings(setting_key,setting_value,updated_at,updated_by_account_id) VALUES('AcademySnapshot:membership:'||upper(NEW.account_id),'1',strftime('%Y-%m-%dT%H:%M:%fZ','now'),NULL) ON CONFLICT(setting_key) DO UPDATE SET setting_value=CAST(setting_value AS INTEGER)+1,updated_at=excluded.updated_at; END;

CREATE TRIGGER academy_snapshot_class_memberships_update AFTER UPDATE OF account_id,activity_key,class_id,active,start_date,end_date ON "class_memberships" WHEN (OLD.account_id IS NOT NEW.account_id OR OLD.activity_key IS NOT NEW.activity_key OR OLD.class_id IS NOT NEW.class_id OR OLD.active IS NOT NEW.active OR OLD.start_date IS NOT NEW.start_date OR OLD.end_date IS NOT NEW.end_date) BEGIN INSERT INTO academy_settings(setting_key,setting_value,updated_at,updated_by_account_id) VALUES('AcademySnapshot:membership:'||upper(OLD.account_id),'1',strftime('%Y-%m-%dT%H:%M:%fZ','now'),NULL) ON CONFLICT(setting_key) DO UPDATE SET setting_value=CAST(setting_value AS INTEGER)+1,updated_at=excluded.updated_at;
INSERT INTO academy_settings(setting_key,setting_value,updated_at,updated_by_account_id) VALUES('AcademySnapshot:membership:'||upper(NEW.account_id),'1',strftime('%Y-%m-%dT%H:%M:%fZ','now'),NULL) ON CONFLICT(setting_key) DO UPDATE SET setting_value=CAST(setting_value AS INTEGER)+1,updated_at=excluded.updated_at; END;

CREATE TRIGGER academy_snapshot_class_teacher_assignments_delete AFTER DELETE ON "class_teacher_assignments" BEGIN INSERT INTO academy_settings(setting_key,setting_value,updated_at,updated_by_account_id) VALUES('AcademySnapshot:membership:'||upper(OLD.account_id),'1',strftime('%Y-%m-%dT%H:%M:%fZ','now'),NULL) ON CONFLICT(setting_key) DO UPDATE SET setting_value=CAST(setting_value AS INTEGER)+1,updated_at=excluded.updated_at; END;

CREATE TRIGGER academy_snapshot_class_teacher_assignments_insert AFTER INSERT ON "class_teacher_assignments" BEGIN INSERT INTO academy_settings(setting_key,setting_value,updated_at,updated_by_account_id) VALUES('AcademySnapshot:membership:'||upper(NEW.account_id),'1',strftime('%Y-%m-%dT%H:%M:%fZ','now'),NULL) ON CONFLICT(setting_key) DO UPDATE SET setting_value=CAST(setting_value AS INTEGER)+1,updated_at=excluded.updated_at; END;

CREATE TRIGGER academy_snapshot_class_teacher_assignments_update AFTER UPDATE OF account_id,activity_key,class_id ON "class_teacher_assignments" WHEN (OLD.account_id IS NOT NEW.account_id OR OLD.activity_key IS NOT NEW.activity_key OR OLD.class_id IS NOT NEW.class_id) BEGIN INSERT INTO academy_settings(setting_key,setting_value,updated_at,updated_by_account_id) VALUES('AcademySnapshot:membership:'||upper(OLD.account_id),'1',strftime('%Y-%m-%dT%H:%M:%fZ','now'),NULL) ON CONFLICT(setting_key) DO UPDATE SET setting_value=CAST(setting_value AS INTEGER)+1,updated_at=excluded.updated_at;
INSERT INTO academy_settings(setting_key,setting_value,updated_at,updated_by_account_id) VALUES('AcademySnapshot:membership:'||upper(NEW.account_id),'1',strftime('%Y-%m-%dT%H:%M:%fZ','now'),NULL) ON CONFLICT(setting_key) DO UPDATE SET setting_value=CAST(setting_value AS INTEGER)+1,updated_at=excluded.updated_at; END;

CREATE TRIGGER academy_snapshot_classes_delete AFTER DELETE ON "classes" BEGIN INSERT INTO academy_settings(setting_key,setting_value,updated_at,updated_by_account_id) VALUES('AcademySnapshot:audience:'||'GLOBAL','1',strftime('%Y-%m-%dT%H:%M:%fZ','now'),NULL) ON CONFLICT(setting_key) DO UPDATE SET setting_value=CAST(setting_value AS INTEGER)+1,updated_at=excluded.updated_at; END;

CREATE TRIGGER academy_snapshot_classes_insert AFTER INSERT ON "classes" BEGIN INSERT INTO academy_settings(setting_key,setting_value,updated_at,updated_by_account_id) VALUES('AcademySnapshot:audience:'||'GLOBAL','1',strftime('%Y-%m-%dT%H:%M:%fZ','now'),NULL) ON CONFLICT(setting_key) DO UPDATE SET setting_value=CAST(setting_value AS INTEGER)+1,updated_at=excluded.updated_at; END;

CREATE TRIGGER academy_snapshot_classes_update AFTER UPDATE OF active ON "classes" WHEN (OLD.active IS NOT NEW.active) BEGIN INSERT INTO academy_settings(setting_key,setting_value,updated_at,updated_by_account_id) VALUES('AcademySnapshot:audience:'||'GLOBAL','1',strftime('%Y-%m-%dT%H:%M:%fZ','now'),NULL) ON CONFLICT(setting_key) DO UPDATE SET setting_value=CAST(setting_value AS INTEGER)+1,updated_at=excluded.updated_at; END;

CREATE TRIGGER academy_snapshot_course_run_access_delete AFTER DELETE ON "course_run_access" BEGIN INSERT INTO academy_settings(setting_key,setting_value,updated_at,updated_by_account_id) VALUES('AcademySnapshot:timetable:'||'GLOBAL','1',strftime('%Y-%m-%dT%H:%M:%fZ','now'),NULL) ON CONFLICT(setting_key) DO UPDATE SET setting_value=CAST(setting_value AS INTEGER)+1,updated_at=excluded.updated_at; END;

CREATE TRIGGER academy_snapshot_course_run_access_insert AFTER INSERT ON "course_run_access" BEGIN INSERT INTO academy_settings(setting_key,setting_value,updated_at,updated_by_account_id) VALUES('AcademySnapshot:timetable:'||'GLOBAL','1',strftime('%Y-%m-%dT%H:%M:%fZ','now'),NULL) ON CONFLICT(setting_key) DO UPDATE SET setting_value=CAST(setting_value AS INTEGER)+1,updated_at=excluded.updated_at; END;

CREATE TRIGGER academy_snapshot_course_run_access_update AFTER UPDATE OF access_model ON "course_run_access" WHEN (OLD.access_model IS NOT NEW.access_model) BEGIN INSERT INTO academy_settings(setting_key,setting_value,updated_at,updated_by_account_id) VALUES('AcademySnapshot:timetable:'||'GLOBAL','1',strftime('%Y-%m-%dT%H:%M:%fZ','now'),NULL) ON CONFLICT(setting_key) DO UPDATE SET setting_value=CAST(setting_value AS INTEGER)+1,updated_at=excluded.updated_at; END;

CREATE TRIGGER academy_snapshot_course_run_state_delete AFTER DELETE ON "course_run_state" BEGIN INSERT INTO academy_settings(setting_key,setting_value,updated_at,updated_by_account_id) VALUES('AcademySnapshot:timetable:'||'GLOBAL','1',strftime('%Y-%m-%dT%H:%M:%fZ','now'),NULL) ON CONFLICT(setting_key) DO UPDATE SET setting_value=CAST(setting_value AS INTEGER)+1,updated_at=excluded.updated_at; END;

CREATE TRIGGER academy_snapshot_course_run_state_insert AFTER INSERT ON "course_run_state" BEGIN INSERT INTO academy_settings(setting_key,setting_value,updated_at,updated_by_account_id) VALUES('AcademySnapshot:timetable:'||'GLOBAL','1',strftime('%Y-%m-%dT%H:%M:%fZ','now'),NULL) ON CONFLICT(setting_key) DO UPDATE SET setting_value=CAST(setting_value AS INTEGER)+1,updated_at=excluded.updated_at; END;

CREATE TRIGGER academy_snapshot_course_run_state_update AFTER UPDATE OF stage,current_publication_id ON "course_run_state" WHEN (OLD.stage IS NOT NEW.stage OR OLD.current_publication_id IS NOT NEW.current_publication_id) BEGIN INSERT INTO academy_settings(setting_key,setting_value,updated_at,updated_by_account_id) VALUES('AcademySnapshot:timetable:'||'GLOBAL','1',strftime('%Y-%m-%dT%H:%M:%fZ','now'),NULL) ON CONFLICT(setting_key) DO UPDATE SET setting_value=CAST(setting_value AS INTEGER)+1,updated_at=excluded.updated_at; END;

CREATE TRIGGER academy_snapshot_course_runs_delete AFTER DELETE ON "course_runs" BEGIN INSERT INTO academy_settings(setting_key,setting_value,updated_at,updated_by_account_id) VALUES('AcademySnapshot:timetable:'||'GLOBAL','1',strftime('%Y-%m-%dT%H:%M:%fZ','now'),NULL) ON CONFLICT(setting_key) DO UPDATE SET setting_value=CAST(setting_value AS INTEGER)+1,updated_at=excluded.updated_at; END;

CREATE TRIGGER academy_snapshot_course_runs_insert AFTER INSERT ON "course_runs" BEGIN INSERT INTO academy_settings(setting_key,setting_value,updated_at,updated_by_account_id) VALUES('AcademySnapshot:timetable:'||'GLOBAL','1',strftime('%Y-%m-%dT%H:%M:%fZ','now'),NULL) ON CONFLICT(setting_key) DO UPDATE SET setting_value=CAST(setting_value AS INTEGER)+1,updated_at=excluded.updated_at; END;

CREATE TRIGGER academy_snapshot_course_runs_update AFTER UPDATE OF active ON "course_runs" WHEN (OLD.active IS NOT NEW.active) BEGIN INSERT INTO academy_settings(setting_key,setting_value,updated_at,updated_by_account_id) VALUES('AcademySnapshot:timetable:'||'GLOBAL','1',strftime('%Y-%m-%dT%H:%M:%fZ','now'),NULL) ON CONFLICT(setting_key) DO UPDATE SET setting_value=CAST(setting_value AS INTEGER)+1,updated_at=excluded.updated_at; END;

CREATE TRIGGER academy_snapshot_course_settings_delete AFTER DELETE ON "course_settings" BEGIN INSERT INTO academy_settings(setting_key,setting_value,updated_at,updated_by_account_id) VALUES('AcademySnapshot:timetable:'||'GLOBAL','1',strftime('%Y-%m-%dT%H:%M:%fZ','now'),NULL) ON CONFLICT(setting_key) DO UPDATE SET setting_value=CAST(setting_value AS INTEGER)+1,updated_at=excluded.updated_at; END;

CREATE TRIGGER academy_snapshot_course_settings_insert AFTER INSERT ON "course_settings" BEGIN INSERT INTO academy_settings(setting_key,setting_value,updated_at,updated_by_account_id) VALUES('AcademySnapshot:timetable:'||'GLOBAL','1',strftime('%Y-%m-%dT%H:%M:%fZ','now'),NULL) ON CONFLICT(setting_key) DO UPDATE SET setting_value=CAST(setting_value AS INTEGER)+1,updated_at=excluded.updated_at; END;

CREATE TRIGGER academy_snapshot_course_settings_update AFTER UPDATE OF legacy_access_model,policy_review_state ON "course_settings" WHEN (OLD.legacy_access_model IS NOT NEW.legacy_access_model OR OLD.policy_review_state IS NOT NEW.policy_review_state) BEGIN INSERT INTO academy_settings(setting_key,setting_value,updated_at,updated_by_account_id) VALUES('AcademySnapshot:timetable:'||'GLOBAL','1',strftime('%Y-%m-%dT%H:%M:%fZ','now'),NULL) ON CONFLICT(setting_key) DO UPDATE SET setting_value=CAST(setting_value AS INTEGER)+1,updated_at=excluded.updated_at; END;

CREATE TRIGGER academy_snapshot_course_subscription_decisions_delete AFTER DELETE ON "course_subscription_decisions" BEGIN INSERT INTO academy_settings(setting_key,setting_value,updated_at,updated_by_account_id) VALUES('AcademySnapshot:authority:'||upper(OLD.account_id),'1',strftime('%Y-%m-%dT%H:%M:%fZ','now'),NULL) ON CONFLICT(setting_key) DO UPDATE SET setting_value=CAST(setting_value AS INTEGER)+1,updated_at=excluded.updated_at; END;

CREATE TRIGGER academy_snapshot_course_subscription_decisions_insert AFTER INSERT ON "course_subscription_decisions" BEGIN INSERT INTO academy_settings(setting_key,setting_value,updated_at,updated_by_account_id) VALUES('AcademySnapshot:authority:'||upper(NEW.account_id),'1',strftime('%Y-%m-%dT%H:%M:%fZ','now'),NULL) ON CONFLICT(setting_key) DO UPDATE SET setting_value=CAST(setting_value AS INTEGER)+1,updated_at=excluded.updated_at; END;

CREATE TRIGGER academy_snapshot_course_subscription_decisions_update AFTER UPDATE ON "course_subscription_decisions" BEGIN INSERT INTO academy_settings(setting_key,setting_value,updated_at,updated_by_account_id) VALUES('AcademySnapshot:authority:'||upper(OLD.account_id),'1',strftime('%Y-%m-%dT%H:%M:%fZ','now'),NULL) ON CONFLICT(setting_key) DO UPDATE SET setting_value=CAST(setting_value AS INTEGER)+1,updated_at=excluded.updated_at;
INSERT INTO academy_settings(setting_key,setting_value,updated_at,updated_by_account_id) VALUES('AcademySnapshot:authority:'||upper(NEW.account_id),'1',strftime('%Y-%m-%dT%H:%M:%fZ','now'),NULL) ON CONFLICT(setting_key) DO UPDATE SET setting_value=CAST(setting_value AS INTEGER)+1,updated_at=excluded.updated_at; END;

CREATE TRIGGER academy_snapshot_lesson_lifecycle_delete AFTER DELETE ON "lesson_lifecycle" BEGIN INSERT INTO academy_settings(setting_key,setting_value,updated_at,updated_by_account_id) VALUES('AcademySnapshot:timetable:'||'GLOBAL','1',strftime('%Y-%m-%dT%H:%M:%fZ','now'),NULL) ON CONFLICT(setting_key) DO UPDATE SET setting_value=CAST(setting_value AS INTEGER)+1,updated_at=excluded.updated_at; END;

CREATE TRIGGER academy_snapshot_lesson_lifecycle_insert AFTER INSERT ON "lesson_lifecycle" BEGIN INSERT INTO academy_settings(setting_key,setting_value,updated_at,updated_by_account_id) VALUES('AcademySnapshot:timetable:'||'GLOBAL','1',strftime('%Y-%m-%dT%H:%M:%fZ','now'),NULL) ON CONFLICT(setting_key) DO UPDATE SET setting_value=CAST(setting_value AS INTEGER)+1,updated_at=excluded.updated_at; END;

CREATE TRIGGER academy_snapshot_lesson_lifecycle_update AFTER UPDATE ON "lesson_lifecycle" BEGIN INSERT INTO academy_settings(setting_key,setting_value,updated_at,updated_by_account_id) VALUES('AcademySnapshot:timetable:'||'GLOBAL','1',strftime('%Y-%m-%dT%H:%M:%fZ','now'),NULL) ON CONFLICT(setting_key) DO UPDATE SET setting_value=CAST(setting_value AS INTEGER)+1,updated_at=excluded.updated_at; END;

CREATE TRIGGER academy_snapshot_modules_delete AFTER DELETE ON "modules" BEGIN INSERT INTO academy_settings(setting_key,setting_value,updated_at,updated_by_account_id) VALUES('AcademySnapshot:audience:'||'GLOBAL','1',strftime('%Y-%m-%dT%H:%M:%fZ','now'),NULL) ON CONFLICT(setting_key) DO UPDATE SET setting_value=CAST(setting_value AS INTEGER)+1,updated_at=excluded.updated_at; END;

CREATE TRIGGER academy_snapshot_modules_insert AFTER INSERT ON "modules" BEGIN INSERT INTO academy_settings(setting_key,setting_value,updated_at,updated_by_account_id) VALUES('AcademySnapshot:audience:'||'GLOBAL','1',strftime('%Y-%m-%dT%H:%M:%fZ','now'),NULL) ON CONFLICT(setting_key) DO UPDATE SET setting_value=CAST(setting_value AS INTEGER)+1,updated_at=excluded.updated_at; END;

CREATE TRIGGER academy_snapshot_modules_update AFTER UPDATE OF active ON "modules" WHEN (OLD.active IS NOT NEW.active) BEGIN INSERT INTO academy_settings(setting_key,setting_value,updated_at,updated_by_account_id) VALUES('AcademySnapshot:audience:'||'GLOBAL','1',strftime('%Y-%m-%dT%H:%M:%fZ','now'),NULL) ON CONFLICT(setting_key) DO UPDATE SET setting_value=CAST(setting_value AS INTEGER)+1,updated_at=excluded.updated_at; END;

CREATE TRIGGER academy_snapshot_program_monthly_media_policies_delete AFTER DELETE ON "program_monthly_media_policies" BEGIN INSERT INTO academy_settings(setting_key,setting_value,updated_at,updated_by_account_id) VALUES('AcademySnapshot:authority:'||'GLOBAL','1',strftime('%Y-%m-%dT%H:%M:%fZ','now'),NULL) ON CONFLICT(setting_key) DO UPDATE SET setting_value=CAST(setting_value AS INTEGER)+1,updated_at=excluded.updated_at; END;

CREATE TRIGGER academy_snapshot_program_monthly_media_policies_insert AFTER INSERT ON "program_monthly_media_policies" BEGIN INSERT INTO academy_settings(setting_key,setting_value,updated_at,updated_by_account_id) VALUES('AcademySnapshot:authority:'||'GLOBAL','1',strftime('%Y-%m-%dT%H:%M:%fZ','now'),NULL) ON CONFLICT(setting_key) DO UPDATE SET setting_value=CAST(setting_value AS INTEGER)+1,updated_at=excluded.updated_at; END;

CREATE TRIGGER academy_snapshot_program_monthly_media_policies_update AFTER UPDATE ON "program_monthly_media_policies" BEGIN INSERT INTO academy_settings(setting_key,setting_value,updated_at,updated_by_account_id) VALUES('AcademySnapshot:authority:'||'GLOBAL','1',strftime('%Y-%m-%dT%H:%M:%fZ','now'),NULL) ON CONFLICT(setting_key) DO UPDATE SET setting_value=CAST(setting_value AS INTEGER)+1,updated_at=excluded.updated_at; END;

CREATE TRIGGER academy_snapshot_program_monthly_subscriptions_delete AFTER DELETE ON "program_monthly_subscriptions" BEGIN INSERT INTO academy_settings(setting_key,setting_value,updated_at,updated_by_account_id) VALUES('AcademySnapshot:authority:'||upper(OLD.account_id),'1',strftime('%Y-%m-%dT%H:%M:%fZ','now'),NULL) ON CONFLICT(setting_key) DO UPDATE SET setting_value=CAST(setting_value AS INTEGER)+1,updated_at=excluded.updated_at; END;

CREATE TRIGGER academy_snapshot_program_monthly_subscriptions_insert AFTER INSERT ON "program_monthly_subscriptions" BEGIN INSERT INTO academy_settings(setting_key,setting_value,updated_at,updated_by_account_id) VALUES('AcademySnapshot:authority:'||upper(NEW.account_id),'1',strftime('%Y-%m-%dT%H:%M:%fZ','now'),NULL) ON CONFLICT(setting_key) DO UPDATE SET setting_value=CAST(setting_value AS INTEGER)+1,updated_at=excluded.updated_at; END;

CREATE TRIGGER academy_snapshot_program_monthly_subscriptions_update AFTER UPDATE ON "program_monthly_subscriptions" BEGIN INSERT INTO academy_settings(setting_key,setting_value,updated_at,updated_by_account_id) VALUES('AcademySnapshot:authority:'||upper(OLD.account_id),'1',strftime('%Y-%m-%dT%H:%M:%fZ','now'),NULL) ON CONFLICT(setting_key) DO UPDATE SET setting_value=CAST(setting_value AS INTEGER)+1,updated_at=excluded.updated_at;
INSERT INTO academy_settings(setting_key,setting_value,updated_at,updated_by_account_id) VALUES('AcademySnapshot:authority:'||upper(NEW.account_id),'1',strftime('%Y-%m-%dT%H:%M:%fZ','now'),NULL) ON CONFLICT(setting_key) DO UPDATE SET setting_value=CAST(setting_value AS INTEGER)+1,updated_at=excluded.updated_at; END;

CREATE TRIGGER academy_snapshot_program_publication_lifecycle_delete AFTER DELETE ON "program_publication_lifecycle" BEGIN INSERT INTO academy_settings(setting_key,setting_value,updated_at,updated_by_account_id) VALUES('AcademySnapshot:timetable:'||'GLOBAL','1',strftime('%Y-%m-%dT%H:%M:%fZ','now'),NULL) ON CONFLICT(setting_key) DO UPDATE SET setting_value=CAST(setting_value AS INTEGER)+1,updated_at=excluded.updated_at; END;

CREATE TRIGGER academy_snapshot_program_publication_lifecycle_insert AFTER INSERT ON "program_publication_lifecycle" BEGIN INSERT INTO academy_settings(setting_key,setting_value,updated_at,updated_by_account_id) VALUES('AcademySnapshot:timetable:'||'GLOBAL','1',strftime('%Y-%m-%dT%H:%M:%fZ','now'),NULL) ON CONFLICT(setting_key) DO UPDATE SET setting_value=CAST(setting_value AS INTEGER)+1,updated_at=excluded.updated_at; END;

CREATE TRIGGER academy_snapshot_program_publication_lifecycle_update AFTER UPDATE ON "program_publication_lifecycle" BEGIN INSERT INTO academy_settings(setting_key,setting_value,updated_at,updated_by_account_id) VALUES('AcademySnapshot:timetable:'||'GLOBAL','1',strftime('%Y-%m-%dT%H:%M:%fZ','now'),NULL) ON CONFLICT(setting_key) DO UPDATE SET setting_value=CAST(setting_value AS INTEGER)+1,updated_at=excluded.updated_at; END;

CREATE TRIGGER academy_snapshot_program_publication_state_delete AFTER DELETE ON "program_publication_state" BEGIN INSERT INTO academy_settings(setting_key,setting_value,updated_at,updated_by_account_id) VALUES('AcademySnapshot:timetable:'||'GLOBAL','1',strftime('%Y-%m-%dT%H:%M:%fZ','now'),NULL) ON CONFLICT(setting_key) DO UPDATE SET setting_value=CAST(setting_value AS INTEGER)+1,updated_at=excluded.updated_at; END;

CREATE TRIGGER academy_snapshot_program_publication_state_insert AFTER INSERT ON "program_publication_state" BEGIN INSERT INTO academy_settings(setting_key,setting_value,updated_at,updated_by_account_id) VALUES('AcademySnapshot:timetable:'||'GLOBAL','1',strftime('%Y-%m-%dT%H:%M:%fZ','now'),NULL) ON CONFLICT(setting_key) DO UPDATE SET setting_value=CAST(setting_value AS INTEGER)+1,updated_at=excluded.updated_at; END;

CREATE TRIGGER academy_snapshot_program_publication_state_update AFTER UPDATE ON "program_publication_state" BEGIN INSERT INTO academy_settings(setting_key,setting_value,updated_at,updated_by_account_id) VALUES('AcademySnapshot:timetable:'||'GLOBAL','1',strftime('%Y-%m-%dT%H:%M:%fZ','now'),NULL) ON CONFLICT(setting_key) DO UPDATE SET setting_value=CAST(setting_value AS INTEGER)+1,updated_at=excluded.updated_at; END;

CREATE TRIGGER academy_snapshot_program_subjects_delete AFTER DELETE ON "program_subjects" BEGIN INSERT INTO academy_settings(setting_key,setting_value,updated_at,updated_by_account_id) VALUES('AcademySnapshot:audience:'||'GLOBAL','1',strftime('%Y-%m-%dT%H:%M:%fZ','now'),NULL) ON CONFLICT(setting_key) DO UPDATE SET setting_value=CAST(setting_value AS INTEGER)+1,updated_at=excluded.updated_at; END;

CREATE TRIGGER academy_snapshot_program_subjects_insert AFTER INSERT ON "program_subjects" BEGIN INSERT INTO academy_settings(setting_key,setting_value,updated_at,updated_by_account_id) VALUES('AcademySnapshot:audience:'||'GLOBAL','1',strftime('%Y-%m-%dT%H:%M:%fZ','now'),NULL) ON CONFLICT(setting_key) DO UPDATE SET setting_value=CAST(setting_value AS INTEGER)+1,updated_at=excluded.updated_at; END;

CREATE TRIGGER academy_snapshot_program_subjects_update AFTER UPDATE OF active ON "program_subjects" WHEN (OLD.active IS NOT NEW.active) BEGIN INSERT INTO academy_settings(setting_key,setting_value,updated_at,updated_by_account_id) VALUES('AcademySnapshot:audience:'||'GLOBAL','1',strftime('%Y-%m-%dT%H:%M:%fZ','now'),NULL) ON CONFLICT(setting_key) DO UPDATE SET setting_value=CAST(setting_value AS INTEGER)+1,updated_at=excluded.updated_at; END;

CREATE TRIGGER academy_snapshot_program_surah_grants_delete AFTER DELETE ON "program_surah_grants" BEGIN INSERT INTO academy_settings(setting_key,setting_value,updated_at,updated_by_account_id) VALUES('AcademySnapshot:authority:'||upper(OLD.account_id),'1',strftime('%Y-%m-%dT%H:%M:%fZ','now'),NULL) ON CONFLICT(setting_key) DO UPDATE SET setting_value=CAST(setting_value AS INTEGER)+1,updated_at=excluded.updated_at; END;

CREATE TRIGGER academy_snapshot_program_surah_grants_insert AFTER INSERT ON "program_surah_grants" BEGIN INSERT INTO academy_settings(setting_key,setting_value,updated_at,updated_by_account_id) VALUES('AcademySnapshot:authority:'||upper(NEW.account_id),'1',strftime('%Y-%m-%dT%H:%M:%fZ','now'),NULL) ON CONFLICT(setting_key) DO UPDATE SET setting_value=CAST(setting_value AS INTEGER)+1,updated_at=excluded.updated_at; END;

CREATE TRIGGER academy_snapshot_program_surah_grants_update AFTER UPDATE ON "program_surah_grants" BEGIN INSERT INTO academy_settings(setting_key,setting_value,updated_at,updated_by_account_id) VALUES('AcademySnapshot:authority:'||upper(OLD.account_id),'1',strftime('%Y-%m-%dT%H:%M:%fZ','now'),NULL) ON CONFLICT(setting_key) DO UPDATE SET setting_value=CAST(setting_value AS INTEGER)+1,updated_at=excluded.updated_at;
INSERT INTO academy_settings(setting_key,setting_value,updated_at,updated_by_account_id) VALUES('AcademySnapshot:authority:'||upper(NEW.account_id),'1',strftime('%Y-%m-%dT%H:%M:%fZ','now'),NULL) ON CONFLICT(setting_key) DO UPDATE SET setting_value=CAST(setting_value AS INTEGER)+1,updated_at=excluded.updated_at; END;

CREATE TRIGGER academy_snapshot_program_surahs_delete AFTER DELETE ON program_surahs BEGIN INSERT INTO academy_settings(setting_key,setting_value,updated_at,updated_by_account_id) VALUES('AcademySnapshot:authority:GLOBAL','1',strftime('%Y-%m-%dT%H:%M:%fZ','now'),NULL) ON CONFLICT(setting_key) DO UPDATE SET setting_value=CAST(setting_value AS INTEGER)+1,updated_at=excluded.updated_at; END;

CREATE TRIGGER academy_snapshot_program_surahs_insert AFTER INSERT ON program_surahs BEGIN INSERT INTO academy_settings(setting_key,setting_value,updated_at,updated_by_account_id) VALUES('AcademySnapshot:authority:GLOBAL','1',strftime('%Y-%m-%dT%H:%M:%fZ','now'),NULL) ON CONFLICT(setting_key) DO UPDATE SET setting_value=CAST(setting_value AS INTEGER)+1,updated_at=excluded.updated_at; END;

CREATE TRIGGER academy_snapshot_program_surahs_update AFTER UPDATE ON program_surahs BEGIN INSERT INTO academy_settings(setting_key,setting_value,updated_at,updated_by_account_id) VALUES('AcademySnapshot:authority:GLOBAL','1',strftime('%Y-%m-%dT%H:%M:%fZ','now'),NULL) ON CONFLICT(setting_key) DO UPDATE SET setting_value=CAST(setting_value AS INTEGER)+1,updated_at=excluded.updated_at; END;

CREATE TRIGGER academy_snapshot_published_lesson_classes_delete AFTER DELETE ON "published_lesson_classes" BEGIN INSERT INTO academy_settings(setting_key,setting_value,updated_at,updated_by_account_id) VALUES('AcademySnapshot:timetable:'||'GLOBAL','1',strftime('%Y-%m-%dT%H:%M:%fZ','now'),NULL) ON CONFLICT(setting_key) DO UPDATE SET setting_value=CAST(setting_value AS INTEGER)+1,updated_at=excluded.updated_at; END;

CREATE TRIGGER academy_snapshot_published_lesson_classes_insert AFTER INSERT ON "published_lesson_classes" BEGIN INSERT INTO academy_settings(setting_key,setting_value,updated_at,updated_by_account_id) VALUES('AcademySnapshot:timetable:'||'GLOBAL','1',strftime('%Y-%m-%dT%H:%M:%fZ','now'),NULL) ON CONFLICT(setting_key) DO UPDATE SET setting_value=CAST(setting_value AS INTEGER)+1,updated_at=excluded.updated_at; END;

CREATE TRIGGER academy_snapshot_published_lesson_classes_update AFTER UPDATE ON "published_lesson_classes" BEGIN INSERT INTO academy_settings(setting_key,setting_value,updated_at,updated_by_account_id) VALUES('AcademySnapshot:timetable:'||'GLOBAL','1',strftime('%Y-%m-%dT%H:%M:%fZ','now'),NULL) ON CONFLICT(setting_key) DO UPDATE SET setting_value=CAST(setting_value AS INTEGER)+1,updated_at=excluded.updated_at; END;

CREATE TRIGGER academy_snapshot_published_lesson_teachers_delete AFTER DELETE ON "published_lesson_teachers" BEGIN INSERT INTO academy_settings(setting_key,setting_value,updated_at,updated_by_account_id) VALUES('AcademySnapshot:timetable:'||'GLOBAL','1',strftime('%Y-%m-%dT%H:%M:%fZ','now'),NULL) ON CONFLICT(setting_key) DO UPDATE SET setting_value=CAST(setting_value AS INTEGER)+1,updated_at=excluded.updated_at; END;

CREATE TRIGGER academy_snapshot_published_lesson_teachers_insert AFTER INSERT ON "published_lesson_teachers" BEGIN INSERT INTO academy_settings(setting_key,setting_value,updated_at,updated_by_account_id) VALUES('AcademySnapshot:timetable:'||'GLOBAL','1',strftime('%Y-%m-%dT%H:%M:%fZ','now'),NULL) ON CONFLICT(setting_key) DO UPDATE SET setting_value=CAST(setting_value AS INTEGER)+1,updated_at=excluded.updated_at; END;

CREATE TRIGGER academy_snapshot_published_lesson_teachers_update AFTER UPDATE ON "published_lesson_teachers" BEGIN INSERT INTO academy_settings(setting_key,setting_value,updated_at,updated_by_account_id) VALUES('AcademySnapshot:timetable:'||'GLOBAL','1',strftime('%Y-%m-%dT%H:%M:%fZ','now'),NULL) ON CONFLICT(setting_key) DO UPDATE SET setting_value=CAST(setting_value AS INTEGER)+1,updated_at=excluded.updated_at; END;

CREATE TRIGGER academy_snapshot_role_assignments_delete AFTER DELETE ON "role_assignments" BEGIN INSERT INTO academy_settings(setting_key,setting_value,updated_at,updated_by_account_id) VALUES('AcademySnapshot:authority:'||upper(OLD.account_id),'1',strftime('%Y-%m-%dT%H:%M:%fZ','now'),NULL) ON CONFLICT(setting_key) DO UPDATE SET setting_value=CAST(setting_value AS INTEGER)+1,updated_at=excluded.updated_at;
INSERT INTO academy_settings(setting_key,setting_value,updated_at,updated_by_account_id) VALUES('AcademySnapshot:authority:'||'GLOBAL','1',strftime('%Y-%m-%dT%H:%M:%fZ','now'),NULL) ON CONFLICT(setting_key) DO UPDATE SET setting_value=CAST(setting_value AS INTEGER)+1,updated_at=excluded.updated_at; END;

CREATE TRIGGER academy_snapshot_role_assignments_insert AFTER INSERT ON "role_assignments" BEGIN INSERT INTO academy_settings(setting_key,setting_value,updated_at,updated_by_account_id) VALUES('AcademySnapshot:authority:'||upper(NEW.account_id),'1',strftime('%Y-%m-%dT%H:%M:%fZ','now'),NULL) ON CONFLICT(setting_key) DO UPDATE SET setting_value=CAST(setting_value AS INTEGER)+1,updated_at=excluded.updated_at;
INSERT INTO academy_settings(setting_key,setting_value,updated_at,updated_by_account_id) VALUES('AcademySnapshot:authority:'||'GLOBAL','1',strftime('%Y-%m-%dT%H:%M:%fZ','now'),NULL) ON CONFLICT(setting_key) DO UPDATE SET setting_value=CAST(setting_value AS INTEGER)+1,updated_at=excluded.updated_at; END;

CREATE TRIGGER academy_snapshot_role_assignments_update AFTER UPDATE ON "role_assignments" BEGIN INSERT INTO academy_settings(setting_key,setting_value,updated_at,updated_by_account_id) VALUES('AcademySnapshot:authority:'||upper(OLD.account_id),'1',strftime('%Y-%m-%dT%H:%M:%fZ','now'),NULL) ON CONFLICT(setting_key) DO UPDATE SET setting_value=CAST(setting_value AS INTEGER)+1,updated_at=excluded.updated_at;
INSERT INTO academy_settings(setting_key,setting_value,updated_at,updated_by_account_id) VALUES('AcademySnapshot:authority:'||upper(NEW.account_id),'1',strftime('%Y-%m-%dT%H:%M:%fZ','now'),NULL) ON CONFLICT(setting_key) DO UPDATE SET setting_value=CAST(setting_value AS INTEGER)+1,updated_at=excluded.updated_at;
INSERT INTO academy_settings(setting_key,setting_value,updated_at,updated_by_account_id) VALUES('AcademySnapshot:authority:'||'GLOBAL','1',strftime('%Y-%m-%dT%H:%M:%fZ','now'),NULL) ON CONFLICT(setting_key) DO UPDATE SET setting_value=CAST(setting_value AS INTEGER)+1,updated_at=excluded.updated_at; END;

CREATE TRIGGER academy_snapshot_subject_catalog_delete AFTER DELETE ON "subject_catalog" BEGIN INSERT INTO academy_settings(setting_key,setting_value,updated_at,updated_by_account_id) VALUES('AcademySnapshot:audience:'||'GLOBAL','1',strftime('%Y-%m-%dT%H:%M:%fZ','now'),NULL) ON CONFLICT(setting_key) DO UPDATE SET setting_value=CAST(setting_value AS INTEGER)+1,updated_at=excluded.updated_at; END;

CREATE TRIGGER academy_snapshot_subject_catalog_insert AFTER INSERT ON "subject_catalog" BEGIN INSERT INTO academy_settings(setting_key,setting_value,updated_at,updated_by_account_id) VALUES('AcademySnapshot:audience:'||'GLOBAL','1',strftime('%Y-%m-%dT%H:%M:%fZ','now'),NULL) ON CONFLICT(setting_key) DO UPDATE SET setting_value=CAST(setting_value AS INTEGER)+1,updated_at=excluded.updated_at; END;

CREATE TRIGGER academy_snapshot_subject_catalog_update AFTER UPDATE OF active ON "subject_catalog" WHEN (OLD.active IS NOT NEW.active) BEGIN INSERT INTO academy_settings(setting_key,setting_value,updated_at,updated_by_account_id) VALUES('AcademySnapshot:audience:'||'GLOBAL','1',strftime('%Y-%m-%dT%H:%M:%fZ','now'),NULL) ON CONFLICT(setting_key) DO UPDATE SET setting_value=CAST(setting_value AS INTEGER)+1,updated_at=excluded.updated_at; END;

CREATE TRIGGER academy_snapshot_teacher_availability_delete AFTER DELETE ON "teacher_availability" BEGIN INSERT INTO academy_settings(setting_key,setting_value,updated_at,updated_by_account_id) VALUES('AcademySnapshot:calendar:'||'GLOBAL','1',strftime('%Y-%m-%dT%H:%M:%fZ','now'),NULL) ON CONFLICT(setting_key) DO UPDATE SET setting_value=CAST(setting_value AS INTEGER)+1,updated_at=excluded.updated_at; END;

CREATE TRIGGER academy_snapshot_teacher_availability_insert AFTER INSERT ON "teacher_availability" BEGIN INSERT INTO academy_settings(setting_key,setting_value,updated_at,updated_by_account_id) VALUES('AcademySnapshot:calendar:'||'GLOBAL','1',strftime('%Y-%m-%dT%H:%M:%fZ','now'),NULL) ON CONFLICT(setting_key) DO UPDATE SET setting_value=CAST(setting_value AS INTEGER)+1,updated_at=excluded.updated_at; END;

CREATE TRIGGER academy_snapshot_teacher_availability_update AFTER UPDATE OF revision ON "teacher_availability" WHEN (OLD.revision IS NOT NEW.revision) BEGIN INSERT INTO academy_settings(setting_key,setting_value,updated_at,updated_by_account_id) VALUES('AcademySnapshot:calendar:'||'GLOBAL','1',strftime('%Y-%m-%dT%H:%M:%fZ','now'),NULL) ON CONFLICT(setting_key) DO UPDATE SET setting_value=CAST(setting_value AS INTEGER)+1,updated_at=excluded.updated_at; END;

CREATE TRIGGER assessment_attempt_immutable_delete BEFORE DELETE ON assessment_attempts BEGIN SELECT RAISE(ABORT,'assessment_attempt_immutable'); END;

CREATE TRIGGER assessment_attempt_immutable_update BEFORE UPDATE ON assessment_attempts BEGIN SELECT RAISE(ABORT,'assessment_attempt_immutable'); END;

CREATE TRIGGER assessment_file_integrity_immutable BEFORE UPDATE ON assessment_file_integrity BEGIN SELECT RAISE(ABORT,'assessment_file_integrity_immutable'); END;

CREATE TRIGGER assessments_phase_scope_insert BEFORE INSERT ON assessments
 WHEN NEW.phase_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM assessment_phases WHERE phase_id=NEW.phase_id AND activity_key=NEW.activity_key)
 BEGIN SELECT RAISE(ABORT,'assessment_phase_scope'); END;

CREATE TRIGGER assessments_phase_scope_update BEFORE UPDATE OF phase_id,activity_key ON assessments
 WHEN NEW.phase_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM assessment_phases WHERE phase_id=NEW.phase_id AND activity_key=NEW.activity_key)
 BEGIN SELECT RAISE(ABORT,'assessment_phase_scope'); END;

CREATE TRIGGER attendance_absence_delete BEFORE DELETE ON attendance_absences BEGIN SELECT RAISE(ABORT,'attendance_absence_append_only'); END;

CREATE TRIGGER attendance_absence_update BEFORE UPDATE ON attendance_absences BEGIN SELECT RAISE(ABORT,'attendance_absence_append_only'); END;

CREATE TRIGGER attendance_context_identity BEFORE UPDATE ON attendance_day_contexts WHEN
 NEW.day_id<>OLD.day_id OR NEW.series_id<>OLD.series_id OR NEW.class_id<>OLD.class_id OR NEW.run_id IS NOT OLD.run_id OR NEW.lesson_json<>OLD.lesson_json OR
 (OLD.roster_id IS NOT NULL AND NEW.roster_id IS NOT OLD.roster_id)
 BEGIN SELECT RAISE(ABORT,'attendance_context_sealed'); END;

CREATE TRIGGER attendance_interval_overlap_insert BEFORE INSERT ON attendance_delivery_members WHEN NEW.state='VALID' AND EXISTS(
 SELECT 1 FROM attendance_delivery_members m WHERE m.activity_key=NEW.activity_key AND m.run_id=NEW.run_id AND m.account_id=NEW.account_id AND m.state='VALID'
 AND COALESCE(m.leave_date,'9999-12-31')>=NEW.join_date AND COALESCE(NEW.leave_date,'9999-12-31')>=m.join_date
) BEGIN SELECT RAISE(ABORT,'attendance_interval_overlap'); END;

CREATE TRIGGER attendance_interval_overlap_update BEFORE UPDATE ON attendance_delivery_members WHEN NEW.state='VALID' AND EXISTS(
 SELECT 1 FROM attendance_delivery_members m WHERE m.interval_id<>NEW.interval_id AND m.activity_key=NEW.activity_key AND m.run_id=NEW.run_id AND m.account_id=NEW.account_id AND m.state='VALID'
 AND COALESCE(m.leave_date,'9999-12-31')>=NEW.join_date AND COALESCE(NEW.leave_date,'9999-12-31')>=m.join_date
) BEGIN SELECT RAISE(ABORT,'attendance_interval_overlap'); END;

CREATE TRIGGER attendance_register_version_delete BEFORE DELETE ON attendance_register_versions BEGIN SELECT RAISE(ABORT,'attendance_register_append_only'); END;

CREATE TRIGGER attendance_register_version_update BEFORE UPDATE ON attendance_register_versions BEGIN SELECT RAISE(ABORT,'attendance_register_append_only'); END;

CREATE TRIGGER attendance_roster_member_delete BEFORE DELETE ON attendance_roster_members BEGIN SELECT RAISE(ABORT,'attendance_roster_immutable'); END;

CREATE TRIGGER attendance_roster_member_sealed BEFORE INSERT ON attendance_roster_members WHEN
 EXISTS(SELECT 1 FROM attendance_day_contexts WHERE roster_id=NEW.roster_id) OR EXISTS(SELECT 1 FROM attendance_register_versions WHERE roster_id=NEW.roster_id)
 BEGIN SELECT RAISE(ABORT,'attendance_roster_immutable'); END;

CREATE TRIGGER attendance_roster_member_update BEFORE UPDATE ON attendance_roster_members BEGIN SELECT RAISE(ABORT,'attendance_roster_immutable'); END;

CREATE TRIGGER attendance_roster_version_delete BEFORE DELETE ON attendance_roster_versions BEGIN SELECT RAISE(ABORT,'attendance_roster_immutable'); END;

CREATE TRIGGER attendance_roster_version_update BEFORE UPDATE ON attendance_roster_versions BEGIN SELECT RAISE(ABORT,'attendance_roster_immutable'); END;

CREATE TRIGGER attendance_series_accept BEFORE UPDATE OF latest_version_id ON attendance_series WHEN NEW.latest_version_id IS NOT NULL AND NOT EXISTS(
 SELECT 1 FROM attendance_register_versions v JOIN attendance_roster_versions r USING(roster_id)
 WHERE v.version_id=NEW.latest_version_id AND v.series_id=NEW.series_id
 AND r.member_count=(SELECT count(*) FROM attendance_roster_members m WHERE m.roster_id=r.roster_id)
 AND v.absence_count=(SELECT count(*) FROM attendance_absences a WHERE a.version_id=v.version_id)
) BEGIN SELECT RAISE(ABORT,'attendance_evidence_mismatch'); END;

CREATE TRIGGER audit_events_no_delete BEFORE DELETE ON audit_events
BEGIN SELECT RAISE(ABORT, 'Audit history is append-only'); END;

CREATE TRIGGER audit_events_no_update BEFORE UPDATE ON audit_events
BEGIN SELECT RAISE(ABORT, 'Audit history is append-only'); END;

CREATE TRIGGER class_note_context_immutable_delete BEFORE DELETE ON class_note_contexts
 BEGIN SELECT RAISE(ABORT,'class_note_context_immutable'); END;

CREATE TRIGGER class_note_context_immutable_update BEFORE UPDATE ON class_note_contexts
 BEGIN SELECT RAISE(ABORT,'class_note_context_immutable'); END;

CREATE TRIGGER class_note_context_scope_insert BEFORE INSERT ON class_notes
 WHEN NOT EXISTS(SELECT 1 FROM class_note_contexts c WHERE c.context_id=NEW.context_id AND c.activity_key=NEW.activity_key COLLATE NOCASE)
 BEGIN SELECT RAISE(ABORT,'class_note_context_scope'); END;

CREATE TRIGGER class_note_context_scope_update BEFORE UPDATE OF context_id ON class_notes
 WHEN NOT EXISTS(SELECT 1 FROM class_note_contexts c JOIN class_note_contexts old ON old.context_id=OLD.context_id WHERE c.context_id=NEW.context_id AND c.activity_key=NEW.activity_key COLLATE NOCASE AND c.class_id=old.class_id COLLATE NOCASE)
 BEGIN SELECT RAISE(ABORT,'class_note_context_scope'); END;

CREATE TRIGGER class_note_identity_immutable BEFORE UPDATE OF activity_key,created_by,created_at ON class_notes
 BEGIN SELECT RAISE(ABORT,'class_note_identity_immutable'); END;

CREATE TRIGGER class_note_pointer BEFORE UPDATE OF current_version_id,context_id ON class_notes
 WHEN NEW.current_version_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM class_note_versions v WHERE v.version_id=NEW.current_version_id AND v.note_id=NEW.note_id AND v.context_id=NEW.context_id)
 BEGIN SELECT RAISE(ABORT,'class_note_version_mismatch'); END;

CREATE TRIGGER class_note_retained BEFORE DELETE ON class_notes
 WHEN NOT EXISTS(SELECT 1 FROM note_retention_items WHERE kind='CLASS_NOTE' AND ref_id=OLD.note_id AND state='PURGING')
 BEGIN SELECT RAISE(ABORT,'class_note_retained'); END;

CREATE TRIGGER class_note_version_immutable_delete BEFORE DELETE ON class_note_versions
 WHEN NOT EXISTS(SELECT 1 FROM note_retention_items WHERE kind='CLASS_NOTE' AND ref_id=OLD.note_id AND state='PURGING')
 BEGIN SELECT RAISE(ABORT,'class_note_version_immutable'); END;

CREATE TRIGGER class_note_version_immutable_update BEFORE UPDATE ON class_note_versions
 BEGIN SELECT RAISE(ABORT,'class_note_version_immutable'); END;

CREATE TRIGGER hifz_sync_account AFTER UPDATE OF display_name,login_link_id,active,revision ON accounts BEGIN
INSERT INTO hifz_profile_sync(account_id)
 SELECT NEW.account_id WHERE (1) AND
 (EXISTS(SELECT 1 FROM hifz_profile_sync q WHERE q.account_id=NEW.account_id) OR
  EXISTS(SELECT 1 FROM hifz_profile_sync_projection p WHERE p.account_id=NEW.account_id AND p.active=1))
 ON CONFLICT(account_id) DO UPDATE SET revision=revision+1,attempts=0,next_attempt_at=0,last_error_code=NULL,updated_at=CURRENT_TIMESTAMP;
END;

CREATE TRIGGER hifz_sync_account_contact_details_delete AFTER DELETE ON account_contact_details BEGIN
INSERT INTO hifz_profile_sync(account_id)
 SELECT OLD.account_id WHERE (1) AND
 (EXISTS(SELECT 1 FROM hifz_profile_sync q WHERE q.account_id=OLD.account_id) OR
  EXISTS(SELECT 1 FROM hifz_profile_sync_projection p WHERE p.account_id=OLD.account_id AND p.active=1))
 ON CONFLICT(account_id) DO UPDATE SET revision=revision+1,attempts=0,next_attempt_at=0,last_error_code=NULL,updated_at=CURRENT_TIMESTAMP;
END;

CREATE TRIGGER hifz_sync_account_contact_details_insert AFTER INSERT ON account_contact_details BEGIN
INSERT INTO hifz_profile_sync(account_id)
 SELECT NEW.account_id WHERE (1) AND
 (EXISTS(SELECT 1 FROM hifz_profile_sync q WHERE q.account_id=NEW.account_id) OR
  EXISTS(SELECT 1 FROM hifz_profile_sync_projection p WHERE p.account_id=NEW.account_id AND p.active=1))
 ON CONFLICT(account_id) DO UPDATE SET revision=revision+1,attempts=0,next_attempt_at=0,last_error_code=NULL,updated_at=CURRENT_TIMESTAMP;
END;

CREATE TRIGGER hifz_sync_account_contact_details_update AFTER UPDATE ON account_contact_details BEGIN
INSERT INTO hifz_profile_sync(account_id)
 SELECT NEW.account_id WHERE (1) AND
 (EXISTS(SELECT 1 FROM hifz_profile_sync q WHERE q.account_id=NEW.account_id) OR
  EXISTS(SELECT 1 FROM hifz_profile_sync_projection p WHERE p.account_id=NEW.account_id AND p.active=1))
 ON CONFLICT(account_id) DO UPDATE SET revision=revision+1,attempts=0,next_attempt_at=0,last_error_code=NULL,updated_at=CURRENT_TIMESTAMP;
INSERT INTO hifz_profile_sync(account_id)
 SELECT OLD.account_id WHERE (OLD.account_id<>NEW.account_id) AND (1) AND
 (EXISTS(SELECT 1 FROM hifz_profile_sync q WHERE q.account_id=OLD.account_id) OR
  EXISTS(SELECT 1 FROM hifz_profile_sync_projection p WHERE p.account_id=OLD.account_id AND p.active=1))
 ON CONFLICT(account_id) DO UPDATE SET revision=revision+1,attempts=0,next_attempt_at=0,last_error_code=NULL,updated_at=CURRENT_TIMESTAMP;
END;

CREATE TRIGGER hifz_sync_global_role_assignments_delete AFTER DELETE ON global_role_assignments BEGIN
INSERT INTO hifz_profile_sync(account_id)
 SELECT OLD.account_id WHERE (1) AND
 (EXISTS(SELECT 1 FROM hifz_profile_sync q WHERE q.account_id=OLD.account_id) OR
  EXISTS(SELECT 1 FROM hifz_profile_sync_projection p WHERE p.account_id=OLD.account_id AND p.active=1))
 ON CONFLICT(account_id) DO UPDATE SET revision=revision+1,attempts=0,next_attempt_at=0,last_error_code=NULL,updated_at=CURRENT_TIMESTAMP;
END;

CREATE TRIGGER hifz_sync_global_role_assignments_insert AFTER INSERT ON global_role_assignments BEGIN
INSERT INTO hifz_profile_sync(account_id)
 SELECT NEW.account_id WHERE (1) AND
 (EXISTS(SELECT 1 FROM hifz_profile_sync q WHERE q.account_id=NEW.account_id) OR
  EXISTS(SELECT 1 FROM hifz_profile_sync_projection p WHERE p.account_id=NEW.account_id AND p.active=1))
 ON CONFLICT(account_id) DO UPDATE SET revision=revision+1,attempts=0,next_attempt_at=0,last_error_code=NULL,updated_at=CURRENT_TIMESTAMP;
END;

CREATE TRIGGER hifz_sync_global_role_assignments_update AFTER UPDATE ON global_role_assignments BEGIN
INSERT INTO hifz_profile_sync(account_id)
 SELECT NEW.account_id WHERE (1) AND
 (EXISTS(SELECT 1 FROM hifz_profile_sync q WHERE q.account_id=NEW.account_id) OR
  EXISTS(SELECT 1 FROM hifz_profile_sync_projection p WHERE p.account_id=NEW.account_id AND p.active=1))
 ON CONFLICT(account_id) DO UPDATE SET revision=revision+1,attempts=0,next_attempt_at=0,last_error_code=NULL,updated_at=CURRENT_TIMESTAMP;
INSERT INTO hifz_profile_sync(account_id)
 SELECT OLD.account_id WHERE (OLD.account_id<>NEW.account_id) AND (1) AND
 (EXISTS(SELECT 1 FROM hifz_profile_sync q WHERE q.account_id=OLD.account_id) OR
  EXISTS(SELECT 1 FROM hifz_profile_sync_projection p WHERE p.account_id=OLD.account_id AND p.active=1))
 ON CONFLICT(account_id) DO UPDATE SET revision=revision+1,attempts=0,next_attempt_at=0,last_error_code=NULL,updated_at=CURRENT_TIMESTAMP;
END;

CREATE TRIGGER hifz_sync_pin_reset AFTER UPDATE OF pin_setup,credential_epoch ON account_credentials
WHEN NEW.pin_setup=0 AND NEW.credential_epoch>OLD.credential_epoch
BEGIN
 UPDATE hifz_profile_sync SET revision=revision+1,pin_reset_version=pin_reset_version+1,
 attempts=0,next_attempt_at=0,last_error_code=NULL,updated_at=CURRENT_TIMESTAMP WHERE account_id=NEW.account_id;
END;

CREATE TRIGGER hifz_sync_pin_set AFTER UPDATE OF pin_hash,pin_setup,credential_epoch ON account_credentials
WHEN NEW.pin_setup=1 AND (NEW.pin_hash IS NOT OLD.pin_hash OR NEW.credential_epoch<>OLD.credential_epoch)
BEGIN
 UPDATE hifz_profile_sync SET revision=revision+1,attempts=0,next_attempt_at=0,last_error_code=NULL,updated_at=CURRENT_TIMESTAMP
 WHERE account_id=NEW.account_id;
END;

CREATE TRIGGER hifz_sync_program AFTER UPDATE OF active,lifecycle ON activities
WHEN NEW.activity_key=(SELECT setting_value FROM academy_settings WHERE setting_key='HifzProfileActivityKey')
BEGIN
 UPDATE hifz_profile_sync SET revision=revision+1,attempts=0,next_attempt_at=0,last_error_code=NULL,updated_at=CURRENT_TIMESTAMP;
END;

CREATE TRIGGER hifz_sync_role_assignments_delete AFTER DELETE ON role_assignments BEGIN
INSERT INTO hifz_profile_sync(account_id)
 SELECT OLD.account_id WHERE (OLD.activity_key=(SELECT setting_value FROM academy_settings WHERE setting_key='HifzProfileActivityKey')) AND
 (EXISTS(SELECT 1 FROM hifz_profile_sync q WHERE q.account_id=OLD.account_id) OR
  EXISTS(SELECT 1 FROM hifz_profile_sync_projection p WHERE p.account_id=OLD.account_id AND p.active=1))
 ON CONFLICT(account_id) DO UPDATE SET revision=revision+1,attempts=0,next_attempt_at=0,last_error_code=NULL,updated_at=CURRENT_TIMESTAMP;
END;

CREATE TRIGGER hifz_sync_role_assignments_insert AFTER INSERT ON role_assignments BEGIN
INSERT INTO hifz_profile_sync(account_id)
 SELECT NEW.account_id WHERE (NEW.activity_key=(SELECT setting_value FROM academy_settings WHERE setting_key='HifzProfileActivityKey')) AND
 (EXISTS(SELECT 1 FROM hifz_profile_sync q WHERE q.account_id=NEW.account_id) OR
  EXISTS(SELECT 1 FROM hifz_profile_sync_projection p WHERE p.account_id=NEW.account_id AND p.active=1))
 ON CONFLICT(account_id) DO UPDATE SET revision=revision+1,attempts=0,next_attempt_at=0,last_error_code=NULL,updated_at=CURRENT_TIMESTAMP;
END;

CREATE TRIGGER hifz_sync_role_assignments_update AFTER UPDATE ON role_assignments BEGIN
INSERT INTO hifz_profile_sync(account_id)
 SELECT NEW.account_id WHERE (NEW.activity_key=(SELECT setting_value FROM academy_settings WHERE setting_key='HifzProfileActivityKey')) AND
 (EXISTS(SELECT 1 FROM hifz_profile_sync q WHERE q.account_id=NEW.account_id) OR
  EXISTS(SELECT 1 FROM hifz_profile_sync_projection p WHERE p.account_id=NEW.account_id AND p.active=1))
 ON CONFLICT(account_id) DO UPDATE SET revision=revision+1,attempts=0,next_attempt_at=0,last_error_code=NULL,updated_at=CURRENT_TIMESTAMP;
INSERT INTO hifz_profile_sync(account_id)
 SELECT OLD.account_id WHERE (OLD.account_id<>NEW.account_id OR OLD.activity_key<>NEW.activity_key) AND (OLD.activity_key=(SELECT setting_value FROM academy_settings WHERE setting_key='HifzProfileActivityKey')) AND
 (EXISTS(SELECT 1 FROM hifz_profile_sync q WHERE q.account_id=OLD.account_id) OR
  EXISTS(SELECT 1 FROM hifz_profile_sync_projection p WHERE p.account_id=OLD.account_id AND p.active=1))
 ON CONFLICT(account_id) DO UPDATE SET revision=revision+1,attempts=0,next_attempt_at=0,last_error_code=NULL,updated_at=CURRENT_TIMESTAMP;
END;

CREATE TRIGGER lesson_media_accepted_pdf_limit_insert BEFORE INSERT ON setup_head_state
 WHEN EXISTS(WITH parents AS MATERIALIZED (SELECT json_extract(row.value,'$.lesson_id') id,json_extract(row.value,'$.activity_key') activity_key,json_extract(row.value,'$.session_key') session_key FROM setup_head_components h JOIN setup_components c USING(component_id),json_each(c.rows_json) row WHERE h.head_id=NEW.head_id AND h.table_name='lesson_media_lessons' AND json_extract(row.value,'$.state')='PUBLISHED' AND coalesce(json_extract(row.value,'$.media_scope'),'SESSION')='SESSION'), links AS MATERIALIZED (SELECT json_extract(row.value,'$.lesson_id') lesson_id,json_extract(row.value,'$.asset_id') asset_id FROM setup_head_components h JOIN setup_components c USING(component_id),json_each(c.rows_json) row WHERE h.head_id=NEW.head_id AND h.table_name='lesson_media_links'), assets AS MATERIALIZED (SELECT json_extract(row.value,'$.asset_id') asset_id FROM setup_head_components h JOIN setup_components c USING(component_id),json_each(c.rows_json) row WHERE h.head_id=NEW.head_id AND h.table_name='lesson_media_assets' AND json_extract(row.value,'$.kind')='PDF' AND NOT EXISTS(SELECT 1 FROM note_retention_items expiry WHERE expiry.kind='SESSION_PDF' AND expiry.ref_id=json_extract(row.value,'$.asset_id') AND expiry.state IN('PURGING','DELETED'))) SELECT 1 FROM parents p WHERE (SELECT count(*) FROM links l JOIN assets a USING(asset_id) WHERE l.lesson_id=p.id)+(SELECT count(*) FROM lesson_note_entries n WHERE n.activity_key=p.activity_key AND n.session_key=p.session_key AND n.state='ACTIVE')>10)
 BEGIN SELECT RAISE(ABORT,'lesson_media_pdf_limit'); END;

CREATE TRIGGER lesson_media_accepted_pdf_limit_update BEFORE UPDATE ON setup_head_state
 WHEN EXISTS(WITH parents AS MATERIALIZED (SELECT json_extract(row.value,'$.lesson_id') id,json_extract(row.value,'$.activity_key') activity_key,json_extract(row.value,'$.session_key') session_key FROM setup_head_components h JOIN setup_components c USING(component_id),json_each(c.rows_json) row WHERE h.head_id=NEW.head_id AND h.table_name='lesson_media_lessons' AND json_extract(row.value,'$.state')='PUBLISHED' AND coalesce(json_extract(row.value,'$.media_scope'),'SESSION')='SESSION'), links AS MATERIALIZED (SELECT json_extract(row.value,'$.lesson_id') lesson_id,json_extract(row.value,'$.asset_id') asset_id FROM setup_head_components h JOIN setup_components c USING(component_id),json_each(c.rows_json) row WHERE h.head_id=NEW.head_id AND h.table_name='lesson_media_links'), assets AS MATERIALIZED (SELECT json_extract(row.value,'$.asset_id') asset_id FROM setup_head_components h JOIN setup_components c USING(component_id),json_each(c.rows_json) row WHERE h.head_id=NEW.head_id AND h.table_name='lesson_media_assets' AND json_extract(row.value,'$.kind')='PDF' AND NOT EXISTS(SELECT 1 FROM note_retention_items expiry WHERE expiry.kind='SESSION_PDF' AND expiry.ref_id=json_extract(row.value,'$.asset_id') AND expiry.state IN('PURGING','DELETED'))) SELECT 1 FROM parents p WHERE (SELECT count(*) FROM links l JOIN assets a USING(asset_id) WHERE l.lesson_id=p.id)+(SELECT count(*) FROM lesson_note_entries n WHERE n.activity_key=p.activity_key AND n.session_key=p.session_key AND n.state='ACTIVE')>10)
 BEGIN SELECT RAISE(ABORT,'lesson_media_pdf_limit'); END;

CREATE TRIGGER lesson_note_owner_immutable BEFORE UPDATE OF activity_key,session_key,container_id,owner_id ON lesson_note_entries
 BEGIN SELECT RAISE(ABORT,'lesson_note_identity_immutable'); END;

CREATE TRIGGER lesson_note_pointer BEFORE UPDATE OF current_version_id ON lesson_note_entries
 WHEN NEW.current_version_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM lesson_note_versions v WHERE v.version_id=NEW.current_version_id AND v.note_id=NEW.note_id)
 BEGIN SELECT RAISE(ABORT,'lesson_note_version_mismatch'); END;

CREATE TRIGGER lesson_note_version_immutable_delete BEFORE DELETE ON lesson_note_versions
 WHEN NOT EXISTS(SELECT 1 FROM note_retention_items WHERE kind='PDF_NOTE' AND ref_id=OLD.note_id AND state='PURGING')
 BEGIN SELECT RAISE(ABORT,'lesson_note_version_immutable'); END;

CREATE TRIGGER lesson_note_version_immutable_update BEFORE UPDATE ON lesson_note_versions BEGIN SELECT RAISE(ABORT,'lesson_note_version_immutable'); END;

CREATE TRIGGER lesson_plan_comments_no_delete BEFORE DELETE ON lesson_plan_comments
BEGIN SELECT RAISE(ABORT,'Plan comments are append-only'); END;

CREATE TRIGGER lesson_plan_comments_no_update BEFORE UPDATE ON lesson_plan_comments
BEGIN SELECT RAISE(ABORT,'Plan comments are append-only'); END;

CREATE TRIGGER lesson_plan_revisions_no_delete BEFORE DELETE ON lesson_plan_revisions
BEGIN SELECT RAISE(ABORT,'Plan revisions are append-only'); END;

CREATE TRIGGER lesson_plan_revisions_no_update BEFORE UPDATE ON lesson_plan_revisions
BEGIN SELECT RAISE(ABORT,'Plan revisions are append-only'); END;

CREATE TRIGGER messaging_ack_retained BEFORE UPDATE OF acknowledged_at ON messaging_recipients WHEN OLD.acknowledged_at IS NOT NULL AND NEW.acknowledged_at IS NOT OLD.acknowledged_at BEGIN SELECT RAISE(ABORT,'messaging_ack_retained'); END;

CREATE TRIGGER messaging_event_delete BEFORE DELETE ON messaging_events BEGIN SELECT RAISE(ABORT,'messaging_event_retained'); END;

CREATE TRIGGER messaging_event_update BEFORE UPDATE ON messaging_events BEGIN SELECT RAISE(ABORT,'messaging_event_retained'); END;

CREATE TRIGGER messaging_notice_immutable BEFORE UPDATE OF draft_id,actor_id,sender_name,workspace,subject,body,targets_json,audience_json,link_json,requires_ack,recipient_count,recipients_json,created_at,previous_notice_id,source_head,scheduled_for ON messaging_notices
 BEGIN SELECT RAISE(ABORT,'messaging_notice_immutable'); END;

CREATE TRIGGER messaging_notice_retained BEFORE DELETE ON messaging_notices BEGIN SELECT RAISE(ABORT,'messaging_notice_retained'); END;

CREATE TRIGGER messaging_open_retained BEFORE UPDATE OF first_opened_at ON messaging_recipients WHEN OLD.first_opened_at IS NOT NULL AND NEW.first_opened_at IS NOT OLD.first_opened_at BEGIN SELECT RAISE(ABORT,'messaging_open_retained'); END;

CREATE TRIGGER messaging_receipt_retained BEFORE DELETE ON messaging_recipients BEGIN SELECT RAISE(ABORT,'messaging_receipt_retained'); END;

CREATE TRIGGER messaging_recipient_identity BEFORE UPDATE OF notice_id,account_id,display_name,delivered_at ON messaging_recipients BEGIN SELECT RAISE(ABORT,'messaging_recipient_identity'); END;

CREATE TRIGGER publications_immutable_delete BEFORE DELETE ON timetable_publications
BEGIN SELECT RAISE(ABORT, 'Published timetable versions are immutable'); END;

CREATE TRIGGER publications_immutable_update BEFORE UPDATE ON timetable_publications
BEGIN SELECT RAISE(ABORT, 'Published timetable versions are immutable'); END;

CREATE TRIGGER setup_component_immutable_delete BEFORE DELETE ON setup_components BEGIN SELECT RAISE(ABORT,'accepted_setup_component_immutable'); END;

CREATE TRIGGER setup_component_immutable_update BEFORE UPDATE ON setup_components BEGIN SELECT RAISE(ABORT,'accepted_setup_component_immutable'); END;

CREATE TRIGGER setup_head_immutable_delete BEFORE DELETE ON setup_heads BEGIN SELECT RAISE(ABORT,'accepted_setup_head_immutable'); END;

CREATE TRIGGER setup_head_immutable_update BEFORE UPDATE ON setup_heads BEGIN SELECT RAISE(ABORT,'accepted_setup_head_immutable'); END;

CREATE TRIGGER setup_vector_immutable_delete BEFORE DELETE ON setup_head_components BEGIN SELECT RAISE(ABORT,'accepted_setup_vector_immutable'); END;

CREATE TRIGGER setup_vector_immutable_update BEFORE UPDATE ON setup_head_components BEGIN SELECT RAISE(ABORT,'accepted_setup_vector_immutable'); END;

CREATE TRIGGER split_epoch_academy_announcements_delete AFTER DELETE ON "academy_announcements" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_academy_announcements_insert AFTER INSERT ON "academy_announcements" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_academy_announcements_update AFTER UPDATE ON "academy_announcements" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_academy_calendar_events_delete AFTER DELETE ON "academy_calendar_events" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_academy_calendar_events_insert AFTER INSERT ON "academy_calendar_events" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_academy_calendar_events_update AFTER UPDATE ON "academy_calendar_events" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_academy_calendar_suppressions_delete AFTER DELETE ON "academy_calendar_suppressions" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_academy_calendar_suppressions_insert AFTER INSERT ON "academy_calendar_suppressions" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_academy_calendar_suppressions_update AFTER UPDATE ON "academy_calendar_suppressions" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_academy_enrolment_catalogue_delete AFTER DELETE ON "academy_enrolment_catalogue" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_academy_enrolment_catalogue_insert AFTER INSERT ON "academy_enrolment_catalogue" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_academy_enrolment_catalogue_update AFTER UPDATE ON "academy_enrolment_catalogue" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_academy_enrolment_request_items_delete AFTER DELETE ON "academy_enrolment_request_items" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_academy_enrolment_request_items_insert AFTER INSERT ON "academy_enrolment_request_items" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_academy_enrolment_request_items_update AFTER UPDATE ON "academy_enrolment_request_items" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_academy_enrolment_requests_delete AFTER DELETE ON "academy_enrolment_requests" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_academy_enrolment_requests_insert AFTER INSERT ON "academy_enrolment_requests" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_academy_enrolment_requests_update AFTER UPDATE ON "academy_enrolment_requests" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_academy_media_playlist_recordings_insert AFTER INSERT ON academy_media_playlist_recordings BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_academy_media_playlist_recordings_update AFTER UPDATE ON academy_media_playlist_recordings BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_academy_media_playlist_state_insert AFTER INSERT ON academy_media_playlist_state BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_academy_media_playlist_state_update AFTER UPDATE ON academy_media_playlist_state BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_academy_media_playlists_insert AFTER INSERT ON academy_media_playlists BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_academy_media_playlists_update AFTER UPDATE ON academy_media_playlists BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_academy_module_catalogue_delete AFTER DELETE ON "academy_module_catalogue" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_academy_module_catalogue_insert AFTER INSERT ON "academy_module_catalogue" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_academy_module_catalogue_update AFTER UPDATE ON "academy_module_catalogue" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_academy_module_usage_delete AFTER DELETE ON "academy_module_usage" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_academy_module_usage_insert AFTER INSERT ON "academy_module_usage" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_academy_module_usage_update AFTER UPDATE ON "academy_module_usage" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_academy_pdf_bookmarks_delete AFTER DELETE ON "academy_pdf_bookmarks" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_academy_pdf_bookmarks_insert AFTER INSERT ON "academy_pdf_bookmarks" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_academy_pdf_bookmarks_update AFTER UPDATE ON "academy_pdf_bookmarks" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_academy_settings_delete AFTER DELETE ON "academy_settings" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_academy_settings_insert AFTER INSERT ON "academy_settings" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_academy_settings_update AFTER UPDATE ON "academy_settings" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_academy_teacher_designations_delete AFTER DELETE ON "academy_teacher_designations" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_academy_teacher_designations_insert AFTER INSERT ON "academy_teacher_designations" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_academy_teacher_designations_update AFTER UPDATE ON "academy_teacher_designations" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_academy_write_state_delete AFTER DELETE ON "academy_write_state" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_academy_write_state_insert AFTER INSERT ON "academy_write_state" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_academy_write_state_update AFTER UPDATE ON "academy_write_state" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_account_contact_details_delete AFTER DELETE ON "account_contact_details" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_account_contact_details_insert AFTER INSERT ON "account_contact_details" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_account_contact_details_update AFTER UPDATE ON "account_contact_details" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_account_credentials_delete AFTER DELETE ON "account_credentials" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_account_credentials_insert AFTER INSERT ON "account_credentials" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_account_credentials_update AFTER UPDATE ON "account_credentials" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_account_sessions_delete AFTER DELETE ON "account_sessions" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_account_sessions_insert AFTER INSERT ON "account_sessions" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_account_sessions_update AFTER UPDATE ON "account_sessions" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_accounts_delete AFTER DELETE ON "accounts" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_accounts_insert AFTER INSERT ON "accounts" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_accounts_update AFTER UPDATE ON "accounts" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_activities_delete AFTER DELETE ON "activities" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_activities_insert AFTER INSERT ON "activities" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_activities_update AFTER UPDATE ON "activities" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_actor_refs_delete AFTER DELETE ON "actor_refs" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_actor_refs_insert AFTER INSERT ON "actor_refs" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_actor_refs_update AFTER UPDATE ON "actor_refs" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_assessment_attempts_delete AFTER DELETE ON "assessment_attempts" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_assessment_attempts_insert AFTER INSERT ON "assessment_attempts" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_assessment_attempts_update AFTER UPDATE ON "assessment_attempts" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_assessment_collection_delete AFTER DELETE ON "assessment_collection" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_assessment_collection_insert AFTER INSERT ON "assessment_collection" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_assessment_collection_update AFTER UPDATE ON "assessment_collection" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_assessment_events_delete AFTER DELETE ON "assessment_events" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_assessment_events_insert AFTER INSERT ON "assessment_events" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_assessment_events_update AFTER UPDATE ON "assessment_events" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_assessment_file_integrity_delete AFTER DELETE ON "assessment_file_integrity" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_assessment_file_integrity_insert AFTER INSERT ON "assessment_file_integrity" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_assessment_file_integrity_update AFTER UPDATE ON "assessment_file_integrity" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_assessment_files_delete AFTER DELETE ON "assessment_files" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_assessment_files_insert AFTER INSERT ON "assessment_files" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_assessment_files_update AFTER UPDATE ON "assessment_files" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_assessment_markings_delete AFTER DELETE ON "assessment_markings" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_assessment_markings_insert AFTER INSERT ON "assessment_markings" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_assessment_markings_update AFTER UPDATE ON "assessment_markings" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_assessment_paper_review_delete AFTER DELETE ON "assessment_paper_review" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_assessment_paper_review_insert AFTER INSERT ON "assessment_paper_review" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_assessment_paper_review_update AFTER UPDATE ON "assessment_paper_review" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_assessment_phases_delete AFTER DELETE ON "assessment_phases" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_assessment_phases_insert AFTER INSERT ON "assessment_phases" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_assessment_phases_update AFTER UPDATE ON "assessment_phases" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_assessment_recipients_delete AFTER DELETE ON "assessment_recipients" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_assessment_recipients_insert AFTER INSERT ON "assessment_recipients" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_assessment_recipients_update AFTER UPDATE ON "assessment_recipients" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_assessment_register_areas_delete AFTER DELETE ON "assessment_register_areas" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_assessment_register_areas_insert AFTER INSERT ON "assessment_register_areas" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_assessment_register_areas_update AFTER UPDATE ON "assessment_register_areas" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_assessment_registers_delete AFTER DELETE ON "assessment_registers" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_assessment_registers_insert AFTER INSERT ON "assessment_registers" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_assessment_registers_update AFTER UPDATE ON "assessment_registers" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_assessment_report_evidence_delete AFTER DELETE ON "assessment_report_evidence" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_assessment_report_evidence_insert AFTER INSERT ON "assessment_report_evidence" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_assessment_report_evidence_update AFTER UPDATE ON "assessment_report_evidence" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_assessment_report_templates_delete AFTER DELETE ON "assessment_report_templates" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_assessment_report_templates_insert AFTER INSERT ON "assessment_report_templates" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_assessment_report_templates_update AFTER UPDATE ON "assessment_report_templates" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_assessment_reports_delete AFTER DELETE ON "assessment_reports" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_assessment_reports_insert AFTER INSERT ON "assessment_reports" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_assessment_reports_update AFTER UPDATE ON "assessment_reports" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_assessment_script_sources_delete AFTER DELETE ON "assessment_script_sources" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_assessment_script_sources_insert AFTER INSERT ON "assessment_script_sources" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_assessment_script_sources_update AFTER UPDATE ON "assessment_script_sources" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_assessment_submissions_delete AFTER DELETE ON "assessment_submissions" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_assessment_submissions_insert AFTER INSERT ON "assessment_submissions" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_assessment_submissions_update AFTER UPDATE ON "assessment_submissions" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_assessments_delete AFTER DELETE ON "assessments" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_assessments_insert AFTER INSERT ON "assessments" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_assessments_update AFTER UPDATE ON "assessments" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_attendance_absences_delete AFTER DELETE ON "attendance_absences" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_attendance_absences_insert AFTER INSERT ON "attendance_absences" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_attendance_absences_update AFTER UPDATE ON "attendance_absences" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_attendance_day_contexts_delete AFTER DELETE ON "attendance_day_contexts" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_attendance_day_contexts_insert AFTER INSERT ON "attendance_day_contexts" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_attendance_day_contexts_update AFTER UPDATE ON "attendance_day_contexts" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_attendance_days_delete AFTER DELETE ON "attendance_days" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_attendance_days_insert AFTER INSERT ON "attendance_days" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_attendance_days_update AFTER UPDATE ON "attendance_days" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_attendance_delivery_members_delete AFTER DELETE ON "attendance_delivery_members" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_attendance_delivery_members_insert AFTER INSERT ON "attendance_delivery_members" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_attendance_delivery_members_update AFTER UPDATE ON "attendance_delivery_members" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_attendance_delivery_rosters_delete AFTER DELETE ON "attendance_delivery_rosters" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_attendance_delivery_rosters_insert AFTER INSERT ON "attendance_delivery_rosters" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_attendance_delivery_rosters_update AFTER UPDATE ON "attendance_delivery_rosters" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_attendance_generation_delete AFTER DELETE ON "attendance_generation" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_attendance_generation_insert AFTER INSERT ON "attendance_generation" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_attendance_generation_update AFTER UPDATE ON "attendance_generation" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_attendance_register_versions_delete AFTER DELETE ON "attendance_register_versions" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_attendance_register_versions_insert AFTER INSERT ON "attendance_register_versions" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_attendance_register_versions_update AFTER UPDATE ON "attendance_register_versions" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_attendance_roster_members_delete AFTER DELETE ON "attendance_roster_members" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_attendance_roster_members_insert AFTER INSERT ON "attendance_roster_members" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_attendance_roster_members_update AFTER UPDATE ON "attendance_roster_members" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_attendance_roster_versions_delete AFTER DELETE ON "attendance_roster_versions" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_attendance_roster_versions_insert AFTER INSERT ON "attendance_roster_versions" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_attendance_roster_versions_update AFTER UPDATE ON "attendance_roster_versions" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_attendance_series_aliases_delete AFTER DELETE ON "attendance_series_aliases" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_attendance_series_aliases_insert AFTER INSERT ON "attendance_series_aliases" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_attendance_series_aliases_update AFTER UPDATE ON "attendance_series_aliases" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_attendance_series_delete AFTER DELETE ON "attendance_series" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_attendance_series_insert AFTER INSERT ON "attendance_series" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_attendance_series_update AFTER UPDATE ON "attendance_series" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_attendance_substitutes_delete AFTER DELETE ON "attendance_substitutes" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_attendance_substitutes_insert AFTER INSERT ON "attendance_substitutes" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_attendance_substitutes_update AFTER UPDATE ON "attendance_substitutes" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_audit_events_delete AFTER DELETE ON "audit_events" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_audit_events_insert AFTER INSERT ON "audit_events" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_audit_events_update AFTER UPDATE ON "audit_events" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_class_memberships_delete AFTER DELETE ON "class_memberships" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_class_memberships_insert AFTER INSERT ON "class_memberships" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_class_memberships_update AFTER UPDATE ON "class_memberships" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_class_module_progress_delete AFTER DELETE ON "class_module_progress" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_class_module_progress_insert AFTER INSERT ON "class_module_progress" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_class_module_progress_update AFTER UPDATE ON "class_module_progress" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_class_note_contexts_delete AFTER DELETE ON "class_note_contexts" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_class_note_contexts_insert AFTER INSERT ON "class_note_contexts" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_class_note_contexts_update AFTER UPDATE ON "class_note_contexts" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_class_note_versions_delete AFTER DELETE ON "class_note_versions" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_class_note_versions_insert AFTER INSERT ON "class_note_versions" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_class_note_versions_update AFTER UPDATE ON "class_note_versions" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_class_notes_delete AFTER DELETE ON "class_notes" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_class_notes_insert AFTER INSERT ON "class_notes" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_class_notes_update AFTER UPDATE ON "class_notes" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_class_teacher_assignments_delete AFTER DELETE ON "class_teacher_assignments" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_class_teacher_assignments_insert AFTER INSERT ON "class_teacher_assignments" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_class_teacher_assignments_update AFTER UPDATE ON "class_teacher_assignments" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_classes_delete AFTER DELETE ON "classes" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_classes_insert AFTER INSERT ON "classes" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_classes_update AFTER UPDATE ON "classes" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_course_resources_delete AFTER DELETE ON "course_resources" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_course_resources_insert AFTER INSERT ON "course_resources" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_course_resources_update AFTER UPDATE ON "course_resources" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_course_run_access_delete AFTER DELETE ON "course_run_access" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_course_run_access_insert AFTER INSERT ON "course_run_access" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_course_run_access_update AFTER UPDATE ON "course_run_access" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_course_run_state_delete AFTER DELETE ON "course_run_state" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_course_run_state_insert AFTER INSERT ON "course_run_state" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_course_run_state_update AFTER UPDATE ON "course_run_state" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_course_runs_delete AFTER DELETE ON "course_runs" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_course_runs_insert AFTER INSERT ON "course_runs" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_course_runs_update AFTER UPDATE ON "course_runs" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_course_session_state_delete AFTER DELETE ON "course_session_state" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_course_session_state_insert AFTER INSERT ON "course_session_state" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_course_session_state_update AFTER UPDATE ON "course_session_state" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_course_settings_delete AFTER DELETE ON "course_settings" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_course_settings_insert AFTER INSERT ON "course_settings" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_course_settings_update AFTER UPDATE ON "course_settings" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_course_subscription_decisions_delete AFTER DELETE ON "course_subscription_decisions" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_course_subscription_decisions_insert AFTER INSERT ON "course_subscription_decisions" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_course_subscription_decisions_update AFTER UPDATE ON "course_subscription_decisions" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_course_website_assets_delete AFTER DELETE ON "course_website_assets" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_course_website_assets_insert AFTER INSERT ON "course_website_assets" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_course_website_assets_update AFTER UPDATE ON "course_website_assets" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_course_website_documents_delete AFTER DELETE ON "course_website_documents" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_course_website_documents_insert AFTER INSERT ON "course_website_documents" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_course_website_documents_update AFTER UPDATE ON "course_website_documents" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_global_role_assignments_delete AFTER DELETE ON "global_role_assignments" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_global_role_assignments_insert AFTER INSERT ON "global_role_assignments" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_global_role_assignments_update AFTER UPDATE ON "global_role_assignments" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_hifz_profile_sync_delete AFTER DELETE ON "hifz_profile_sync" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_hifz_profile_sync_insert AFTER INSERT ON "hifz_profile_sync" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_hifz_profile_sync_update AFTER UPDATE ON "hifz_profile_sync" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_learner_task_progress_delete AFTER DELETE ON "learner_task_progress" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_learner_task_progress_insert AFTER INSERT ON "learner_task_progress" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_learner_task_progress_update AFTER UPDATE ON "learner_task_progress" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_lesson_lifecycle_delete AFTER DELETE ON "lesson_lifecycle" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_lesson_lifecycle_insert AFTER INSERT ON "lesson_lifecycle" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_lesson_lifecycle_update AFTER UPDATE ON "lesson_lifecycle" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_lesson_media_assets_delete AFTER DELETE ON "lesson_media_assets" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_lesson_media_assets_insert AFTER INSERT ON "lesson_media_assets" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_lesson_media_assets_update AFTER UPDATE ON "lesson_media_assets" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_lesson_media_lessons_delete AFTER DELETE ON "lesson_media_lessons" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_lesson_media_lessons_insert AFTER INSERT ON "lesson_media_lessons" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_lesson_media_lessons_update AFTER UPDATE ON "lesson_media_lessons" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_lesson_media_links_delete AFTER DELETE ON "lesson_media_links" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_lesson_media_links_insert AFTER INSERT ON "lesson_media_links" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_lesson_media_links_update AFTER UPDATE ON "lesson_media_links" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_lesson_media_visibility_delete AFTER DELETE ON "lesson_media_visibility" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_lesson_media_visibility_insert AFTER INSERT ON "lesson_media_visibility" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_lesson_media_visibility_update AFTER UPDATE ON "lesson_media_visibility" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_lesson_note_entries_delete AFTER DELETE ON "lesson_note_entries" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_lesson_note_entries_insert AFTER INSERT ON "lesson_note_entries" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_lesson_note_entries_update AFTER UPDATE ON "lesson_note_entries" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_lesson_note_versions_delete AFTER DELETE ON "lesson_note_versions" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_lesson_note_versions_insert AFTER INSERT ON "lesson_note_versions" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_lesson_note_versions_update AFTER UPDATE ON "lesson_note_versions" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_lesson_plan_comments_delete AFTER DELETE ON "lesson_plan_comments" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_lesson_plan_comments_insert AFTER INSERT ON "lesson_plan_comments" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_lesson_plan_comments_update AFTER UPDATE ON "lesson_plan_comments" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_lesson_plan_deadlines_delete AFTER DELETE ON "lesson_plan_deadlines" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_lesson_plan_deadlines_insert AFTER INSERT ON "lesson_plan_deadlines" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_lesson_plan_deadlines_update AFTER UPDATE ON "lesson_plan_deadlines" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_lesson_plan_policies_delete AFTER DELETE ON "lesson_plan_policies" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_lesson_plan_policies_insert AFTER INSERT ON "lesson_plan_policies" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_lesson_plan_policies_update AFTER UPDATE ON "lesson_plan_policies" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_lesson_plan_preferences_delete AFTER DELETE ON "lesson_plan_preferences" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_lesson_plan_preferences_insert AFTER INSERT ON "lesson_plan_preferences" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_lesson_plan_preferences_update AFTER UPDATE ON "lesson_plan_preferences" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_lesson_plan_requirements_delete AFTER DELETE ON "lesson_plan_requirements" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_lesson_plan_requirements_insert AFTER INSERT ON "lesson_plan_requirements" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_lesson_plan_requirements_update AFTER UPDATE ON "lesson_plan_requirements" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_lesson_plan_revisions_delete AFTER DELETE ON "lesson_plan_revisions" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_lesson_plan_revisions_insert AFTER INSERT ON "lesson_plan_revisions" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_lesson_plan_revisions_update AFTER UPDATE ON "lesson_plan_revisions" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_lesson_plans_delete AFTER DELETE ON "lesson_plans" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_lesson_plans_insert AFTER INSERT ON "lesson_plans" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_lesson_plans_update AFTER UPDATE ON "lesson_plans" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_management_revisions_delete AFTER DELETE ON "management_revisions" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_management_revisions_insert AFTER INSERT ON "management_revisions" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_management_revisions_update AFTER UPDATE ON "management_revisions" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_memorisation_account_settings_delete AFTER DELETE ON "memorisation_account_settings" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_memorisation_account_settings_insert AFTER INSERT ON "memorisation_account_settings" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_memorisation_account_settings_update AFTER UPDATE ON "memorisation_account_settings" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_memorisation_activity_settings_delete AFTER DELETE ON "memorisation_activity_settings" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_memorisation_activity_settings_insert AFTER INSERT ON "memorisation_activity_settings" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_memorisation_activity_settings_update AFTER UPDATE ON "memorisation_activity_settings" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_memorisation_catalogue_state_delete AFTER DELETE ON "memorisation_catalogue_state" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_memorisation_catalogue_state_insert AFTER INSERT ON "memorisation_catalogue_state" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_memorisation_catalogue_state_update AFTER UPDATE ON "memorisation_catalogue_state" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_memorisation_set_activities_delete AFTER DELETE ON "memorisation_set_activities" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_memorisation_set_activities_insert AFTER INSERT ON "memorisation_set_activities" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_memorisation_set_activities_update AFTER UPDATE ON "memorisation_set_activities" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_memorisation_sets_delete AFTER DELETE ON "memorisation_sets" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_memorisation_sets_insert AFTER INSERT ON "memorisation_sets" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_memorisation_sets_update AFTER UPDATE ON "memorisation_sets" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_memorisation_tasks_delete AFTER DELETE ON "memorisation_tasks" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_memorisation_tasks_insert AFTER INSERT ON "memorisation_tasks" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_memorisation_tasks_update AFTER UPDATE ON "memorisation_tasks" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_messaging_drafts_delete AFTER DELETE ON messaging_drafts BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_messaging_drafts_insert AFTER INSERT ON messaging_drafts BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_messaging_drafts_update AFTER UPDATE ON messaging_drafts BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_messaging_events_delete AFTER DELETE ON messaging_events BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_messaging_events_insert AFTER INSERT ON messaging_events BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_messaging_events_update AFTER UPDATE ON messaging_events BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_messaging_jobs_delete AFTER DELETE ON messaging_jobs BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_messaging_jobs_insert AFTER INSERT ON messaging_jobs BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_messaging_jobs_update AFTER UPDATE ON messaging_jobs BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_messaging_notices_delete AFTER DELETE ON messaging_notices BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_messaging_notices_insert AFTER INSERT ON messaging_notices BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_messaging_notices_update AFTER UPDATE ON messaging_notices BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_messaging_operations_delete AFTER DELETE ON messaging_operations BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_messaging_operations_insert AFTER INSERT ON messaging_operations BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_messaging_operations_update AFTER UPDATE ON messaging_operations BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_messaging_recipients_delete AFTER DELETE ON messaging_recipients BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_messaging_recipients_insert AFTER INSERT ON messaging_recipients BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_messaging_recipients_update AFTER UPDATE ON messaging_recipients BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_messaging_reviews_delete AFTER DELETE ON messaging_reviews BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_messaging_reviews_insert AFTER INSERT ON messaging_reviews BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_messaging_reviews_update AFTER UPDATE ON messaging_reviews BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_modules_delete AFTER DELETE ON "modules" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_modules_insert AFTER INSERT ON "modules" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_modules_update AFTER UPDATE ON "modules" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_note_retention_discovery_delete AFTER DELETE ON note_retention_discovery BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_note_retention_discovery_insert AFTER INSERT ON note_retention_discovery BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_note_retention_discovery_update AFTER UPDATE ON note_retention_discovery BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_note_retention_items_delete AFTER DELETE ON note_retention_items BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_note_retention_items_insert AFTER INSERT ON note_retention_items BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_note_retention_items_update AFTER UPDATE ON note_retention_items BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_note_retention_objects_delete AFTER DELETE ON note_retention_objects BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_note_retention_objects_insert AFTER INSERT ON note_retention_objects BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_note_retention_objects_update AFTER UPDATE ON note_retention_objects BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_note_retention_policy_delete AFTER DELETE ON note_retention_policy BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_note_retention_policy_insert AFTER INSERT ON note_retention_policy BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_note_retention_policy_update AFTER UPDATE ON note_retention_policy BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_note_retention_recipients_delete AFTER DELETE ON note_retention_recipients BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_note_retention_recipients_insert AFTER INSERT ON note_retention_recipients BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_note_retention_recipients_update AFTER UPDATE ON note_retention_recipients BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_operation_receipts_delete AFTER DELETE ON "operation_receipts" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_operation_receipts_insert AFTER INSERT ON "operation_receipts" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_operation_receipts_update AFTER UPDATE ON "operation_receipts" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_program_historical_extensions_delete AFTER DELETE ON "program_historical_extensions" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_program_historical_extensions_insert AFTER INSERT ON "program_historical_extensions" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_program_historical_extensions_update AFTER UPDATE ON "program_historical_extensions" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_program_levels_delete AFTER DELETE ON "program_levels" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_program_levels_insert AFTER INSERT ON "program_levels" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_program_levels_update AFTER UPDATE ON "program_levels" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_program_monthly_media_policies_delete AFTER DELETE ON program_monthly_media_policies BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_program_monthly_media_policies_insert AFTER INSERT ON program_monthly_media_policies BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_program_monthly_media_policies_update AFTER UPDATE ON program_monthly_media_policies BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_program_monthly_subscriptions_delete AFTER DELETE ON program_monthly_subscriptions BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_program_monthly_subscriptions_insert AFTER INSERT ON program_monthly_subscriptions BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_program_monthly_subscriptions_update AFTER UPDATE ON program_monthly_subscriptions BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_program_publication_lifecycle_delete AFTER DELETE ON "program_publication_lifecycle" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_program_publication_lifecycle_insert AFTER INSERT ON "program_publication_lifecycle" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_program_publication_lifecycle_update AFTER UPDATE ON "program_publication_lifecycle" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_program_publication_state_delete AFTER DELETE ON "program_publication_state" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_program_publication_state_insert AFTER INSERT ON "program_publication_state" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_program_publication_state_update AFTER UPDATE ON "program_publication_state" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_program_resources_delete AFTER DELETE ON "program_resources" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_program_resources_insert AFTER INSERT ON "program_resources" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_program_resources_update AFTER UPDATE ON "program_resources" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_program_settings_delete AFTER DELETE ON "program_settings" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_program_settings_insert AFTER INSERT ON "program_settings" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_program_settings_update AFTER UPDATE ON "program_settings" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_program_subjects_delete AFTER DELETE ON "program_subjects" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_program_subjects_insert AFTER INSERT ON "program_subjects" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_program_subjects_update AFTER UPDATE ON "program_subjects" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_program_surah_grants_delete AFTER DELETE ON program_surah_grants BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_program_surah_grants_insert AFTER INSERT ON program_surah_grants BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_program_surah_grants_update AFTER UPDATE ON program_surah_grants BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_program_surah_website_assets_delete AFTER DELETE ON program_surah_website_assets BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_program_surah_website_assets_insert AFTER INSERT ON program_surah_website_assets BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_program_surah_website_assets_update AFTER UPDATE ON program_surah_website_assets BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_program_surah_website_documents_delete AFTER DELETE ON program_surah_website_documents BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_program_surah_website_documents_insert AFTER INSERT ON program_surah_website_documents BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_program_surah_website_documents_update AFTER UPDATE ON program_surah_website_documents BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_program_surahs_delete AFTER DELETE ON program_surahs BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_program_surahs_insert AFTER INSERT ON program_surahs BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_program_surahs_update AFTER UPDATE ON program_surahs BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_published_lesson_classes_delete AFTER DELETE ON "published_lesson_classes" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_published_lesson_classes_insert AFTER INSERT ON "published_lesson_classes" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_published_lesson_classes_update AFTER UPDATE ON "published_lesson_classes" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_published_lesson_teachers_delete AFTER DELETE ON "published_lesson_teachers" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_published_lesson_teachers_insert AFTER INSERT ON "published_lesson_teachers" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_published_lesson_teachers_update AFTER UPDATE ON "published_lesson_teachers" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_published_lessons_delete AFTER DELETE ON "published_lessons" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_published_lessons_insert AFTER INSERT ON "published_lessons" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_published_lessons_update AFTER UPDATE ON "published_lessons" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_role_assignments_delete AFTER DELETE ON "role_assignments" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_role_assignments_insert AFTER INSERT ON "role_assignments" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_role_assignments_update AFTER UPDATE ON "role_assignments" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_setup_batches_delete AFTER DELETE ON "setup_batches" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_setup_batches_insert AFTER INSERT ON "setup_batches" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_setup_batches_update AFTER UPDATE ON "setup_batches" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_setup_components_delete AFTER DELETE ON "setup_components" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_setup_components_insert AFTER INSERT ON "setup_components" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_setup_components_update AFTER UPDATE ON "setup_components" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_setup_head_components_delete AFTER DELETE ON "setup_head_components" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_setup_head_components_insert AFTER INSERT ON "setup_head_components" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_setup_head_components_update AFTER UPDATE ON "setup_head_components" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_setup_head_state_delete AFTER DELETE ON "setup_head_state" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_setup_head_state_insert AFTER INSERT ON "setup_head_state" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_setup_head_state_update AFTER UPDATE ON "setup_head_state" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_setup_heads_delete AFTER DELETE ON "setup_heads" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_setup_heads_insert AFTER INSERT ON "setup_heads" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_setup_heads_update AFTER UPDATE ON "setup_heads" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_subject_catalog_delete AFTER DELETE ON "subject_catalog" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_subject_catalog_insert AFTER INSERT ON "subject_catalog" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_subject_catalog_update AFTER UPDATE ON "subject_catalog" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_tasks_delete AFTER DELETE ON "tasks" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_tasks_insert AFTER INSERT ON "tasks" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_tasks_update AFTER UPDATE ON "tasks" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_teacher_availability_delete AFTER DELETE ON "teacher_availability" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_teacher_availability_insert AFTER INSERT ON "teacher_availability" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_teacher_availability_update AFTER UPDATE ON "teacher_availability" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_timetable_publications_delete AFTER DELETE ON "timetable_publications" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_timetable_publications_insert AFTER INSERT ON "timetable_publications" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_timetable_publications_update AFTER UPDATE ON "timetable_publications" BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_weekly_absentee_recipients_delete AFTER DELETE ON weekly_absentee_recipients BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_weekly_absentee_recipients_insert AFTER INSERT ON weekly_absentee_recipients BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_weekly_absentee_recipients_update AFTER UPDATE ON weekly_absentee_recipients BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_weekly_absentee_reports_delete AFTER DELETE ON weekly_absentee_reports BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_weekly_absentee_reports_insert AFTER INSERT ON weekly_absentee_reports BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_weekly_absentee_reports_update AFTER UPDATE ON weekly_absentee_reports BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_weekly_absentee_rows_delete AFTER DELETE ON weekly_absentee_rows BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_weekly_absentee_rows_insert AFTER INSERT ON weekly_absentee_rows BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_epoch_weekly_absentee_rows_update AFTER UPDATE ON weekly_absentee_rows BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER split_fence_academy_announcements_delete BEFORE DELETE ON "academy_announcements" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_academy_announcements_insert BEFORE INSERT ON "academy_announcements" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_academy_announcements_update BEFORE UPDATE ON "academy_announcements" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_academy_calendar_events_delete BEFORE DELETE ON "academy_calendar_events" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_academy_calendar_events_insert BEFORE INSERT ON "academy_calendar_events" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_academy_calendar_events_update BEFORE UPDATE ON "academy_calendar_events" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_academy_calendar_suppressions_delete BEFORE DELETE ON "academy_calendar_suppressions" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_academy_calendar_suppressions_insert BEFORE INSERT ON "academy_calendar_suppressions" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_academy_calendar_suppressions_update BEFORE UPDATE ON "academy_calendar_suppressions" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_academy_enrolment_catalogue_delete BEFORE DELETE ON "academy_enrolment_catalogue" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_academy_enrolment_catalogue_insert BEFORE INSERT ON "academy_enrolment_catalogue" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_academy_enrolment_catalogue_update BEFORE UPDATE ON "academy_enrolment_catalogue" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_academy_enrolment_request_items_delete BEFORE DELETE ON "academy_enrolment_request_items" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_academy_enrolment_request_items_insert BEFORE INSERT ON "academy_enrolment_request_items" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_academy_enrolment_request_items_update BEFORE UPDATE ON "academy_enrolment_request_items" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_academy_enrolment_requests_delete BEFORE DELETE ON "academy_enrolment_requests" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_academy_enrolment_requests_insert BEFORE INSERT ON "academy_enrolment_requests" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_academy_enrolment_requests_update BEFORE UPDATE ON "academy_enrolment_requests" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_academy_media_playlist_recordings_insert BEFORE INSERT ON academy_media_playlist_recordings WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_academy_media_playlist_recordings_update BEFORE UPDATE ON academy_media_playlist_recordings WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_academy_media_playlist_state_insert BEFORE INSERT ON academy_media_playlist_state WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_academy_media_playlist_state_update BEFORE UPDATE ON academy_media_playlist_state WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_academy_media_playlists_insert BEFORE INSERT ON academy_media_playlists WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_academy_media_playlists_update BEFORE UPDATE ON academy_media_playlists WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_academy_module_catalogue_delete BEFORE DELETE ON "academy_module_catalogue" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_academy_module_catalogue_insert BEFORE INSERT ON "academy_module_catalogue" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_academy_module_catalogue_update BEFORE UPDATE ON "academy_module_catalogue" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_academy_module_usage_delete BEFORE DELETE ON "academy_module_usage" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_academy_module_usage_insert BEFORE INSERT ON "academy_module_usage" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_academy_module_usage_update BEFORE UPDATE ON "academy_module_usage" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_academy_pdf_bookmarks_delete BEFORE DELETE ON "academy_pdf_bookmarks" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_academy_pdf_bookmarks_insert BEFORE INSERT ON "academy_pdf_bookmarks" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_academy_pdf_bookmarks_update BEFORE UPDATE ON "academy_pdf_bookmarks" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_academy_settings_delete BEFORE DELETE ON "academy_settings" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_academy_settings_insert BEFORE INSERT ON "academy_settings" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_academy_settings_update BEFORE UPDATE ON "academy_settings" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_academy_teacher_designations_delete BEFORE DELETE ON "academy_teacher_designations" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_academy_teacher_designations_insert BEFORE INSERT ON "academy_teacher_designations" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_academy_teacher_designations_update BEFORE UPDATE ON "academy_teacher_designations" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_academy_write_state_delete BEFORE DELETE ON "academy_write_state" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_academy_write_state_insert BEFORE INSERT ON "academy_write_state" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_academy_write_state_update BEFORE UPDATE ON "academy_write_state" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_account_contact_details_delete BEFORE DELETE ON "account_contact_details" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_account_contact_details_insert BEFORE INSERT ON "account_contact_details" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_account_contact_details_update BEFORE UPDATE ON "account_contact_details" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_account_credentials_delete BEFORE DELETE ON "account_credentials" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_account_credentials_insert BEFORE INSERT ON "account_credentials" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_account_credentials_update BEFORE UPDATE ON "account_credentials" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_account_sessions_delete BEFORE DELETE ON "account_sessions" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_account_sessions_insert BEFORE INSERT ON "account_sessions" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_account_sessions_update BEFORE UPDATE ON "account_sessions" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_accounts_delete BEFORE DELETE ON "accounts" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_accounts_insert BEFORE INSERT ON "accounts" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_accounts_update BEFORE UPDATE ON "accounts" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_activities_delete BEFORE DELETE ON "activities" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_activities_insert BEFORE INSERT ON "activities" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_activities_update BEFORE UPDATE ON "activities" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_actor_refs_delete BEFORE DELETE ON "actor_refs" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_actor_refs_insert BEFORE INSERT ON "actor_refs" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_actor_refs_update BEFORE UPDATE ON "actor_refs" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_assessment_attempts_delete BEFORE DELETE ON "assessment_attempts" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_assessment_attempts_insert BEFORE INSERT ON "assessment_attempts" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_assessment_attempts_update BEFORE UPDATE ON "assessment_attempts" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_assessment_collection_delete BEFORE DELETE ON "assessment_collection" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_assessment_collection_insert BEFORE INSERT ON "assessment_collection" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_assessment_collection_update BEFORE UPDATE ON "assessment_collection" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_assessment_events_delete BEFORE DELETE ON "assessment_events" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_assessment_events_insert BEFORE INSERT ON "assessment_events" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_assessment_events_update BEFORE UPDATE ON "assessment_events" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_assessment_file_integrity_delete BEFORE DELETE ON "assessment_file_integrity" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_assessment_file_integrity_insert BEFORE INSERT ON "assessment_file_integrity" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_assessment_file_integrity_update BEFORE UPDATE ON "assessment_file_integrity" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_assessment_files_delete BEFORE DELETE ON "assessment_files" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_assessment_files_insert BEFORE INSERT ON "assessment_files" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_assessment_files_update BEFORE UPDATE ON "assessment_files" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_assessment_markings_delete BEFORE DELETE ON "assessment_markings" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_assessment_markings_insert BEFORE INSERT ON "assessment_markings" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_assessment_markings_update BEFORE UPDATE ON "assessment_markings" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_assessment_paper_review_delete BEFORE DELETE ON "assessment_paper_review" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_assessment_paper_review_insert BEFORE INSERT ON "assessment_paper_review" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_assessment_paper_review_update BEFORE UPDATE ON "assessment_paper_review" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_assessment_phases_delete BEFORE DELETE ON "assessment_phases" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_assessment_phases_insert BEFORE INSERT ON "assessment_phases" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_assessment_phases_update BEFORE UPDATE ON "assessment_phases" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_assessment_recipients_delete BEFORE DELETE ON "assessment_recipients" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_assessment_recipients_insert BEFORE INSERT ON "assessment_recipients" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_assessment_recipients_update BEFORE UPDATE ON "assessment_recipients" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_assessment_register_areas_delete BEFORE DELETE ON "assessment_register_areas" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_assessment_register_areas_insert BEFORE INSERT ON "assessment_register_areas" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_assessment_register_areas_update BEFORE UPDATE ON "assessment_register_areas" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_assessment_registers_delete BEFORE DELETE ON "assessment_registers" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_assessment_registers_insert BEFORE INSERT ON "assessment_registers" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_assessment_registers_update BEFORE UPDATE ON "assessment_registers" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_assessment_report_evidence_delete BEFORE DELETE ON "assessment_report_evidence" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_assessment_report_evidence_insert BEFORE INSERT ON "assessment_report_evidence" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_assessment_report_evidence_update BEFORE UPDATE ON "assessment_report_evidence" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_assessment_report_templates_delete BEFORE DELETE ON "assessment_report_templates" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_assessment_report_templates_insert BEFORE INSERT ON "assessment_report_templates" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_assessment_report_templates_update BEFORE UPDATE ON "assessment_report_templates" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_assessment_reports_delete BEFORE DELETE ON "assessment_reports" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_assessment_reports_insert BEFORE INSERT ON "assessment_reports" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_assessment_reports_update BEFORE UPDATE ON "assessment_reports" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_assessment_script_sources_delete BEFORE DELETE ON "assessment_script_sources" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_assessment_script_sources_insert BEFORE INSERT ON "assessment_script_sources" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_assessment_script_sources_update BEFORE UPDATE ON "assessment_script_sources" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_assessment_submissions_delete BEFORE DELETE ON "assessment_submissions" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_assessment_submissions_insert BEFORE INSERT ON "assessment_submissions" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_assessment_submissions_update BEFORE UPDATE ON "assessment_submissions" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_assessments_delete BEFORE DELETE ON "assessments" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_assessments_insert BEFORE INSERT ON "assessments" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_assessments_update BEFORE UPDATE ON "assessments" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_attendance_absences_delete BEFORE DELETE ON "attendance_absences" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_attendance_absences_insert BEFORE INSERT ON "attendance_absences" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_attendance_absences_update BEFORE UPDATE ON "attendance_absences" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_attendance_day_contexts_delete BEFORE DELETE ON "attendance_day_contexts" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_attendance_day_contexts_insert BEFORE INSERT ON "attendance_day_contexts" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_attendance_day_contexts_update BEFORE UPDATE ON "attendance_day_contexts" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_attendance_days_delete BEFORE DELETE ON "attendance_days" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_attendance_days_insert BEFORE INSERT ON "attendance_days" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_attendance_days_update BEFORE UPDATE ON "attendance_days" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_attendance_delivery_members_delete BEFORE DELETE ON "attendance_delivery_members" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_attendance_delivery_members_insert BEFORE INSERT ON "attendance_delivery_members" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_attendance_delivery_members_update BEFORE UPDATE ON "attendance_delivery_members" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_attendance_delivery_rosters_delete BEFORE DELETE ON "attendance_delivery_rosters" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_attendance_delivery_rosters_insert BEFORE INSERT ON "attendance_delivery_rosters" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_attendance_delivery_rosters_update BEFORE UPDATE ON "attendance_delivery_rosters" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_attendance_generation_delete BEFORE DELETE ON "attendance_generation" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_attendance_generation_insert BEFORE INSERT ON "attendance_generation" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_attendance_generation_update BEFORE UPDATE ON "attendance_generation" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_attendance_register_versions_delete BEFORE DELETE ON "attendance_register_versions" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_attendance_register_versions_insert BEFORE INSERT ON "attendance_register_versions" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_attendance_register_versions_update BEFORE UPDATE ON "attendance_register_versions" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_attendance_roster_members_delete BEFORE DELETE ON "attendance_roster_members" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_attendance_roster_members_insert BEFORE INSERT ON "attendance_roster_members" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_attendance_roster_members_update BEFORE UPDATE ON "attendance_roster_members" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_attendance_roster_versions_delete BEFORE DELETE ON "attendance_roster_versions" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_attendance_roster_versions_insert BEFORE INSERT ON "attendance_roster_versions" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_attendance_roster_versions_update BEFORE UPDATE ON "attendance_roster_versions" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_attendance_series_aliases_delete BEFORE DELETE ON "attendance_series_aliases" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_attendance_series_aliases_insert BEFORE INSERT ON "attendance_series_aliases" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_attendance_series_aliases_update BEFORE UPDATE ON "attendance_series_aliases" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_attendance_series_delete BEFORE DELETE ON "attendance_series" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_attendance_series_insert BEFORE INSERT ON "attendance_series" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_attendance_series_update BEFORE UPDATE ON "attendance_series" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_attendance_substitutes_delete BEFORE DELETE ON "attendance_substitutes" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_attendance_substitutes_insert BEFORE INSERT ON "attendance_substitutes" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_attendance_substitutes_update BEFORE UPDATE ON "attendance_substitutes" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_audit_events_delete BEFORE DELETE ON "audit_events" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_audit_events_insert BEFORE INSERT ON "audit_events" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_audit_events_update BEFORE UPDATE ON "audit_events" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_class_memberships_delete BEFORE DELETE ON "class_memberships" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_class_memberships_insert BEFORE INSERT ON "class_memberships" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_class_memberships_update BEFORE UPDATE ON "class_memberships" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_class_module_progress_delete BEFORE DELETE ON "class_module_progress" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_class_module_progress_insert BEFORE INSERT ON "class_module_progress" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_class_module_progress_update BEFORE UPDATE ON "class_module_progress" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_class_note_contexts_delete BEFORE DELETE ON "class_note_contexts" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_class_note_contexts_insert BEFORE INSERT ON "class_note_contexts" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_class_note_contexts_update BEFORE UPDATE ON "class_note_contexts" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_class_note_versions_delete BEFORE DELETE ON "class_note_versions" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_class_note_versions_insert BEFORE INSERT ON "class_note_versions" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_class_note_versions_update BEFORE UPDATE ON "class_note_versions" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_class_notes_delete BEFORE DELETE ON "class_notes" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_class_notes_insert BEFORE INSERT ON "class_notes" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_class_notes_update BEFORE UPDATE ON "class_notes" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_class_teacher_assignments_delete BEFORE DELETE ON "class_teacher_assignments" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_class_teacher_assignments_insert BEFORE INSERT ON "class_teacher_assignments" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_class_teacher_assignments_update BEFORE UPDATE ON "class_teacher_assignments" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_classes_delete BEFORE DELETE ON "classes" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_classes_insert BEFORE INSERT ON "classes" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_classes_update BEFORE UPDATE ON "classes" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_course_resources_delete BEFORE DELETE ON "course_resources" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_course_resources_insert BEFORE INSERT ON "course_resources" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_course_resources_update BEFORE UPDATE ON "course_resources" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_course_run_access_delete BEFORE DELETE ON "course_run_access" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_course_run_access_insert BEFORE INSERT ON "course_run_access" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_course_run_access_update BEFORE UPDATE ON "course_run_access" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_course_run_state_delete BEFORE DELETE ON "course_run_state" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_course_run_state_insert BEFORE INSERT ON "course_run_state" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_course_run_state_update BEFORE UPDATE ON "course_run_state" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_course_runs_delete BEFORE DELETE ON "course_runs" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_course_runs_insert BEFORE INSERT ON "course_runs" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_course_runs_update BEFORE UPDATE ON "course_runs" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_course_session_state_delete BEFORE DELETE ON "course_session_state" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_course_session_state_insert BEFORE INSERT ON "course_session_state" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_course_session_state_update BEFORE UPDATE ON "course_session_state" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_course_settings_delete BEFORE DELETE ON "course_settings" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_course_settings_insert BEFORE INSERT ON "course_settings" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_course_settings_update BEFORE UPDATE ON "course_settings" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_course_subscription_decisions_delete BEFORE DELETE ON "course_subscription_decisions" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_course_subscription_decisions_insert BEFORE INSERT ON "course_subscription_decisions" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_course_subscription_decisions_update BEFORE UPDATE ON "course_subscription_decisions" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_course_website_assets_delete BEFORE DELETE ON "course_website_assets" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_course_website_assets_insert BEFORE INSERT ON "course_website_assets" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_course_website_assets_update BEFORE UPDATE ON "course_website_assets" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_course_website_documents_delete BEFORE DELETE ON "course_website_documents" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_course_website_documents_insert BEFORE INSERT ON "course_website_documents" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_course_website_documents_update BEFORE UPDATE ON "course_website_documents" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_global_role_assignments_delete BEFORE DELETE ON "global_role_assignments" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_global_role_assignments_insert BEFORE INSERT ON "global_role_assignments" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_global_role_assignments_update BEFORE UPDATE ON "global_role_assignments" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_hifz_profile_sync_delete BEFORE DELETE ON "hifz_profile_sync" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_hifz_profile_sync_insert BEFORE INSERT ON "hifz_profile_sync" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_hifz_profile_sync_update BEFORE UPDATE ON "hifz_profile_sync" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_learner_task_progress_delete BEFORE DELETE ON "learner_task_progress" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_learner_task_progress_insert BEFORE INSERT ON "learner_task_progress" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_learner_task_progress_update BEFORE UPDATE ON "learner_task_progress" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_lesson_lifecycle_delete BEFORE DELETE ON "lesson_lifecycle" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_lesson_lifecycle_insert BEFORE INSERT ON "lesson_lifecycle" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_lesson_lifecycle_update BEFORE UPDATE ON "lesson_lifecycle" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_lesson_media_assets_delete BEFORE DELETE ON "lesson_media_assets" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_lesson_media_assets_insert BEFORE INSERT ON "lesson_media_assets" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_lesson_media_assets_update BEFORE UPDATE ON "lesson_media_assets" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_lesson_media_lessons_delete BEFORE DELETE ON "lesson_media_lessons" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_lesson_media_lessons_insert BEFORE INSERT ON "lesson_media_lessons" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_lesson_media_lessons_update BEFORE UPDATE ON "lesson_media_lessons" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_lesson_media_links_delete BEFORE DELETE ON "lesson_media_links" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_lesson_media_links_insert BEFORE INSERT ON "lesson_media_links" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_lesson_media_links_update BEFORE UPDATE ON "lesson_media_links" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_lesson_media_visibility_delete BEFORE DELETE ON "lesson_media_visibility" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_lesson_media_visibility_insert BEFORE INSERT ON "lesson_media_visibility" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_lesson_media_visibility_update BEFORE UPDATE ON "lesson_media_visibility" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_lesson_note_entries_delete BEFORE DELETE ON "lesson_note_entries" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_lesson_note_entries_insert BEFORE INSERT ON "lesson_note_entries" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_lesson_note_entries_update BEFORE UPDATE ON "lesson_note_entries" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_lesson_note_versions_delete BEFORE DELETE ON "lesson_note_versions" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_lesson_note_versions_insert BEFORE INSERT ON "lesson_note_versions" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_lesson_note_versions_update BEFORE UPDATE ON "lesson_note_versions" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_lesson_plan_comments_delete BEFORE DELETE ON "lesson_plan_comments" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_lesson_plan_comments_insert BEFORE INSERT ON "lesson_plan_comments" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_lesson_plan_comments_update BEFORE UPDATE ON "lesson_plan_comments" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_lesson_plan_deadlines_delete BEFORE DELETE ON "lesson_plan_deadlines" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_lesson_plan_deadlines_insert BEFORE INSERT ON "lesson_plan_deadlines" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_lesson_plan_deadlines_update BEFORE UPDATE ON "lesson_plan_deadlines" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_lesson_plan_policies_delete BEFORE DELETE ON "lesson_plan_policies" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_lesson_plan_policies_insert BEFORE INSERT ON "lesson_plan_policies" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_lesson_plan_policies_update BEFORE UPDATE ON "lesson_plan_policies" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_lesson_plan_preferences_delete BEFORE DELETE ON "lesson_plan_preferences" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_lesson_plan_preferences_insert BEFORE INSERT ON "lesson_plan_preferences" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_lesson_plan_preferences_update BEFORE UPDATE ON "lesson_plan_preferences" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_lesson_plan_requirements_delete BEFORE DELETE ON "lesson_plan_requirements" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_lesson_plan_requirements_insert BEFORE INSERT ON "lesson_plan_requirements" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_lesson_plan_requirements_update BEFORE UPDATE ON "lesson_plan_requirements" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_lesson_plan_revisions_delete BEFORE DELETE ON "lesson_plan_revisions" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_lesson_plan_revisions_insert BEFORE INSERT ON "lesson_plan_revisions" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_lesson_plan_revisions_update BEFORE UPDATE ON "lesson_plan_revisions" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_lesson_plans_delete BEFORE DELETE ON "lesson_plans" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_lesson_plans_insert BEFORE INSERT ON "lesson_plans" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_lesson_plans_update BEFORE UPDATE ON "lesson_plans" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_management_revisions_delete BEFORE DELETE ON "management_revisions" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_management_revisions_insert BEFORE INSERT ON "management_revisions" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_management_revisions_update BEFORE UPDATE ON "management_revisions" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_memorisation_account_settings_delete BEFORE DELETE ON "memorisation_account_settings" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_memorisation_account_settings_insert BEFORE INSERT ON "memorisation_account_settings" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_memorisation_account_settings_update BEFORE UPDATE ON "memorisation_account_settings" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_memorisation_activity_settings_delete BEFORE DELETE ON "memorisation_activity_settings" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_memorisation_activity_settings_insert BEFORE INSERT ON "memorisation_activity_settings" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_memorisation_activity_settings_update BEFORE UPDATE ON "memorisation_activity_settings" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_memorisation_catalogue_state_delete BEFORE DELETE ON "memorisation_catalogue_state" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_memorisation_catalogue_state_insert BEFORE INSERT ON "memorisation_catalogue_state" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_memorisation_catalogue_state_update BEFORE UPDATE ON "memorisation_catalogue_state" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_memorisation_set_activities_delete BEFORE DELETE ON "memorisation_set_activities" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_memorisation_set_activities_insert BEFORE INSERT ON "memorisation_set_activities" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_memorisation_set_activities_update BEFORE UPDATE ON "memorisation_set_activities" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_memorisation_sets_delete BEFORE DELETE ON "memorisation_sets" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_memorisation_sets_insert BEFORE INSERT ON "memorisation_sets" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_memorisation_sets_update BEFORE UPDATE ON "memorisation_sets" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_memorisation_tasks_delete BEFORE DELETE ON "memorisation_tasks" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_memorisation_tasks_insert BEFORE INSERT ON "memorisation_tasks" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_memorisation_tasks_update BEFORE UPDATE ON "memorisation_tasks" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_messaging_drafts_delete BEFORE DELETE ON messaging_drafts WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_messaging_drafts_insert BEFORE INSERT ON messaging_drafts WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_messaging_drafts_update BEFORE UPDATE ON messaging_drafts WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_messaging_events_delete BEFORE DELETE ON messaging_events WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_messaging_events_insert BEFORE INSERT ON messaging_events WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_messaging_events_update BEFORE UPDATE ON messaging_events WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_messaging_jobs_delete BEFORE DELETE ON messaging_jobs WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_messaging_jobs_insert BEFORE INSERT ON messaging_jobs WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_messaging_jobs_update BEFORE UPDATE ON messaging_jobs WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_messaging_notices_delete BEFORE DELETE ON messaging_notices WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_messaging_notices_insert BEFORE INSERT ON messaging_notices WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_messaging_notices_update BEFORE UPDATE ON messaging_notices WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_messaging_operations_delete BEFORE DELETE ON messaging_operations WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_messaging_operations_insert BEFORE INSERT ON messaging_operations WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_messaging_operations_update BEFORE UPDATE ON messaging_operations WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_messaging_recipients_delete BEFORE DELETE ON messaging_recipients WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_messaging_recipients_insert BEFORE INSERT ON messaging_recipients WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_messaging_recipients_update BEFORE UPDATE ON messaging_recipients WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_messaging_reviews_delete BEFORE DELETE ON messaging_reviews WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_messaging_reviews_insert BEFORE INSERT ON messaging_reviews WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_messaging_reviews_update BEFORE UPDATE ON messaging_reviews WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_modules_delete BEFORE DELETE ON "modules" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_modules_insert BEFORE INSERT ON "modules" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_modules_update BEFORE UPDATE ON "modules" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_note_retention_discovery_delete BEFORE DELETE ON note_retention_discovery WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_note_retention_discovery_insert BEFORE INSERT ON note_retention_discovery WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_note_retention_discovery_update BEFORE UPDATE ON note_retention_discovery WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_note_retention_items_delete BEFORE DELETE ON note_retention_items WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_note_retention_items_insert BEFORE INSERT ON note_retention_items WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_note_retention_items_update BEFORE UPDATE ON note_retention_items WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_note_retention_objects_delete BEFORE DELETE ON note_retention_objects WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_note_retention_objects_insert BEFORE INSERT ON note_retention_objects WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_note_retention_objects_update BEFORE UPDATE ON note_retention_objects WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_note_retention_policy_delete BEFORE DELETE ON note_retention_policy WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_note_retention_policy_insert BEFORE INSERT ON note_retention_policy WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_note_retention_policy_update BEFORE UPDATE ON note_retention_policy WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_note_retention_recipients_delete BEFORE DELETE ON note_retention_recipients WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_note_retention_recipients_insert BEFORE INSERT ON note_retention_recipients WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_note_retention_recipients_update BEFORE UPDATE ON note_retention_recipients WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_operation_receipts_delete BEFORE DELETE ON "operation_receipts" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_operation_receipts_insert BEFORE INSERT ON "operation_receipts" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_operation_receipts_update BEFORE UPDATE ON "operation_receipts" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_program_historical_extensions_delete BEFORE DELETE ON "program_historical_extensions" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_program_historical_extensions_insert BEFORE INSERT ON "program_historical_extensions" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_program_historical_extensions_update BEFORE UPDATE ON "program_historical_extensions" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_program_levels_delete BEFORE DELETE ON "program_levels" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_program_levels_insert BEFORE INSERT ON "program_levels" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_program_levels_update BEFORE UPDATE ON "program_levels" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_program_monthly_media_policies_delete BEFORE DELETE ON program_monthly_media_policies WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_program_monthly_media_policies_insert BEFORE INSERT ON program_monthly_media_policies WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_program_monthly_media_policies_update BEFORE UPDATE ON program_monthly_media_policies WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_program_monthly_subscriptions_delete BEFORE DELETE ON program_monthly_subscriptions WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_program_monthly_subscriptions_insert BEFORE INSERT ON program_monthly_subscriptions WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_program_monthly_subscriptions_update BEFORE UPDATE ON program_monthly_subscriptions WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_program_publication_lifecycle_delete BEFORE DELETE ON "program_publication_lifecycle" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_program_publication_lifecycle_insert BEFORE INSERT ON "program_publication_lifecycle" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_program_publication_lifecycle_update BEFORE UPDATE ON "program_publication_lifecycle" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_program_publication_state_delete BEFORE DELETE ON "program_publication_state" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_program_publication_state_insert BEFORE INSERT ON "program_publication_state" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_program_publication_state_update BEFORE UPDATE ON "program_publication_state" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_program_resources_delete BEFORE DELETE ON "program_resources" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_program_resources_insert BEFORE INSERT ON "program_resources" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_program_resources_update BEFORE UPDATE ON "program_resources" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_program_settings_delete BEFORE DELETE ON "program_settings" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_program_settings_insert BEFORE INSERT ON "program_settings" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_program_settings_update BEFORE UPDATE ON "program_settings" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_program_subjects_delete BEFORE DELETE ON "program_subjects" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_program_subjects_insert BEFORE INSERT ON "program_subjects" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_program_subjects_update BEFORE UPDATE ON "program_subjects" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_program_surah_grants_delete BEFORE DELETE ON program_surah_grants WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_program_surah_grants_insert BEFORE INSERT ON program_surah_grants WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_program_surah_grants_update BEFORE UPDATE ON program_surah_grants WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_program_surah_website_assets_delete BEFORE DELETE ON program_surah_website_assets WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_program_surah_website_assets_insert BEFORE INSERT ON program_surah_website_assets WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_program_surah_website_assets_update BEFORE UPDATE ON program_surah_website_assets WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_program_surah_website_documents_delete BEFORE DELETE ON program_surah_website_documents WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_program_surah_website_documents_insert BEFORE INSERT ON program_surah_website_documents WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_program_surah_website_documents_update BEFORE UPDATE ON program_surah_website_documents WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_program_surahs_delete BEFORE DELETE ON program_surahs WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_program_surahs_insert BEFORE INSERT ON program_surahs WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_program_surahs_update BEFORE UPDATE ON program_surahs WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_published_lesson_classes_delete BEFORE DELETE ON "published_lesson_classes" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_published_lesson_classes_insert BEFORE INSERT ON "published_lesson_classes" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_published_lesson_classes_update BEFORE UPDATE ON "published_lesson_classes" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_published_lesson_teachers_delete BEFORE DELETE ON "published_lesson_teachers" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_published_lesson_teachers_insert BEFORE INSERT ON "published_lesson_teachers" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_published_lesson_teachers_update BEFORE UPDATE ON "published_lesson_teachers" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_published_lessons_delete BEFORE DELETE ON "published_lessons" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_published_lessons_insert BEFORE INSERT ON "published_lessons" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_published_lessons_update BEFORE UPDATE ON "published_lessons" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_role_assignments_delete BEFORE DELETE ON "role_assignments" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_role_assignments_insert BEFORE INSERT ON "role_assignments" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_role_assignments_update BEFORE UPDATE ON "role_assignments" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_setup_batches_delete BEFORE DELETE ON "setup_batches" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_setup_batches_insert BEFORE INSERT ON "setup_batches" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_setup_batches_update BEFORE UPDATE ON "setup_batches" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_setup_components_delete BEFORE DELETE ON "setup_components" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_setup_components_insert BEFORE INSERT ON "setup_components" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_setup_components_update BEFORE UPDATE ON "setup_components" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_setup_head_components_delete BEFORE DELETE ON "setup_head_components" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_setup_head_components_insert BEFORE INSERT ON "setup_head_components" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_setup_head_components_update BEFORE UPDATE ON "setup_head_components" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_setup_head_state_delete BEFORE DELETE ON "setup_head_state" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_setup_head_state_insert BEFORE INSERT ON "setup_head_state" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_setup_head_state_update BEFORE UPDATE ON "setup_head_state" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_setup_heads_delete BEFORE DELETE ON "setup_heads" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_setup_heads_insert BEFORE INSERT ON "setup_heads" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_setup_heads_update BEFORE UPDATE ON "setup_heads" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_subject_catalog_delete BEFORE DELETE ON "subject_catalog" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_subject_catalog_insert BEFORE INSERT ON "subject_catalog" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_subject_catalog_update BEFORE UPDATE ON "subject_catalog" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_tasks_delete BEFORE DELETE ON "tasks" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_tasks_insert BEFORE INSERT ON "tasks" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_tasks_update BEFORE UPDATE ON "tasks" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_teacher_availability_delete BEFORE DELETE ON "teacher_availability" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_teacher_availability_insert BEFORE INSERT ON "teacher_availability" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_teacher_availability_update BEFORE UPDATE ON "teacher_availability" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_timetable_publications_delete BEFORE DELETE ON "timetable_publications" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_timetable_publications_insert BEFORE INSERT ON "timetable_publications" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_timetable_publications_update BEFORE UPDATE ON "timetable_publications" WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_weekly_absentee_recipients_delete BEFORE DELETE ON weekly_absentee_recipients WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_weekly_absentee_recipients_insert BEFORE INSERT ON weekly_absentee_recipients WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_weekly_absentee_recipients_update BEFORE UPDATE ON weekly_absentee_recipients WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_weekly_absentee_reports_delete BEFORE DELETE ON weekly_absentee_reports WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_weekly_absentee_reports_insert BEFORE INSERT ON weekly_absentee_reports WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_weekly_absentee_reports_update BEFORE UPDATE ON weekly_absentee_reports WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_weekly_absentee_rows_delete BEFORE DELETE ON weekly_absentee_rows WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_weekly_absentee_rows_insert BEFORE INSERT ON weekly_absentee_rows WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_fence_weekly_absentee_rows_update BEFORE UPDATE ON weekly_absentee_rows WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER split_new_actor AFTER INSERT ON accounts BEGIN INSERT INTO actor_refs(account_id) VALUES(NEW.account_id) ON CONFLICT DO NOTHING; END;

CREATE TRIGGER split_transaction_guard_reject BEFORE INSERT ON split_transaction_guards WHEN NEW.accepted<>1 BEGIN SELECT RAISE(ABORT,'split_transaction_state'); END;

CREATE TRIGGER studio_access_fence_course_subscription_decisions_delete BEFORE DELETE ON course_subscription_decisions WHEN EXISTS(SELECT 1 FROM website_platform_access_ownership o WHERE o.activity_key=OLD.activity_key AND o.state<>'ACADEMY') BEGIN SELECT RAISE(ABORT,'STUDIO_ACCESS_MANAGED'); END;

CREATE TRIGGER studio_access_fence_course_subscription_decisions_insert BEFORE INSERT ON course_subscription_decisions WHEN EXISTS(SELECT 1 FROM website_platform_access_ownership o WHERE o.activity_key=NEW.activity_key AND o.state<>'ACADEMY') BEGIN SELECT RAISE(ABORT,'STUDIO_ACCESS_MANAGED'); END;

CREATE TRIGGER studio_access_fence_course_subscription_decisions_update BEFORE UPDATE ON course_subscription_decisions WHEN EXISTS(SELECT 1 FROM website_platform_access_ownership o WHERE o.activity_key=OLD.activity_key AND o.state<>'ACADEMY') OR EXISTS(SELECT 1 FROM website_platform_access_ownership o WHERE o.activity_key=NEW.activity_key AND o.state<>'ACADEMY') BEGIN SELECT RAISE(ABORT,'STUDIO_ACCESS_MANAGED'); END;

CREATE TRIGGER studio_access_fence_program_monthly_subscriptions_delete BEFORE DELETE ON program_monthly_subscriptions WHEN EXISTS(SELECT 1 FROM website_platform_access_ownership o WHERE o.activity_key=OLD.activity_key AND o.state<>'ACADEMY') BEGIN SELECT RAISE(ABORT,'STUDIO_ACCESS_MANAGED'); END;

CREATE TRIGGER studio_access_fence_program_monthly_subscriptions_insert BEFORE INSERT ON program_monthly_subscriptions WHEN EXISTS(SELECT 1 FROM website_platform_access_ownership o WHERE o.activity_key=NEW.activity_key AND o.state<>'ACADEMY') BEGIN SELECT RAISE(ABORT,'STUDIO_ACCESS_MANAGED'); END;

CREATE TRIGGER studio_access_fence_program_monthly_subscriptions_update BEFORE UPDATE ON program_monthly_subscriptions WHEN EXISTS(SELECT 1 FROM website_platform_access_ownership o WHERE o.activity_key=OLD.activity_key AND o.state<>'ACADEMY') OR EXISTS(SELECT 1 FROM website_platform_access_ownership o WHERE o.activity_key=NEW.activity_key AND o.state<>'ACADEMY') BEGIN SELECT RAISE(ABORT,'STUDIO_ACCESS_MANAGED'); END;

CREATE TRIGGER studio_access_fence_program_surah_grants_delete BEFORE DELETE ON program_surah_grants WHEN EXISTS(SELECT 1 FROM website_platform_access_ownership o WHERE o.activity_key=OLD.activity_key AND o.state<>'ACADEMY') BEGIN SELECT RAISE(ABORT,'STUDIO_ACCESS_MANAGED'); END;

CREATE TRIGGER studio_access_fence_program_surah_grants_insert BEFORE INSERT ON program_surah_grants WHEN EXISTS(SELECT 1 FROM website_platform_access_ownership o WHERE o.activity_key=NEW.activity_key AND o.state<>'ACADEMY') BEGIN SELECT RAISE(ABORT,'STUDIO_ACCESS_MANAGED'); END;

CREATE TRIGGER studio_access_fence_program_surah_grants_update BEFORE UPDATE ON program_surah_grants WHEN EXISTS(SELECT 1 FROM website_platform_access_ownership o WHERE o.activity_key=OLD.activity_key AND o.state<>'ACADEMY') OR EXISTS(SELECT 1 FROM website_platform_access_ownership o WHERE o.activity_key=NEW.activity_key AND o.state<>'ACADEMY') BEGIN SELECT RAISE(ABORT,'STUDIO_ACCESS_MANAGED'); END;

CREATE TRIGGER studio_access_fence_role_assignments_delete BEFORE DELETE ON role_assignments WHEN EXISTS(SELECT 1 FROM website_platform_access_ownership o WHERE o.activity_key=OLD.activity_key AND o.state<>'ACADEMY' AND OLD.role='STUDENT') BEGIN SELECT RAISE(ABORT,'STUDIO_ACCESS_MANAGED'); END;

CREATE TRIGGER studio_access_fence_role_assignments_insert BEFORE INSERT ON role_assignments WHEN EXISTS(SELECT 1 FROM website_platform_access_ownership o WHERE o.activity_key=NEW.activity_key AND o.state<>'ACADEMY' AND NEW.role='STUDENT') BEGIN SELECT RAISE(ABORT,'STUDIO_ACCESS_MANAGED'); END;

CREATE TRIGGER studio_access_fence_role_assignments_update BEFORE UPDATE ON role_assignments WHEN (OLD.activity_key IS NOT NEW.activity_key OR OLD.account_id IS NOT NEW.account_id OR OLD.role IS NOT NEW.role OR OLD.active IS NOT NEW.active OR OLD.review_state IS NOT NEW.review_state OR OLD.grant_source IS NOT NEW.grant_source) AND (EXISTS(SELECT 1 FROM website_platform_access_ownership o WHERE o.activity_key=OLD.activity_key AND o.state<>'ACADEMY' AND OLD.role='STUDENT') OR EXISTS(SELECT 1 FROM website_platform_access_ownership o WHERE o.activity_key=NEW.activity_key AND o.state<>'ACADEMY' AND NEW.role='STUDENT')) BEGIN SELECT RAISE(ABORT,'STUDIO_ACCESS_MANAGED'); END;

CREATE TRIGGER studio_access_policy_course BEFORE UPDATE OF legacy_access_model,policy_review_state ON course_settings
WHEN (OLD.legacy_access_model<>NEW.legacy_access_model OR OLD.policy_review_state<>NEW.policy_review_state)
AND EXISTS(SELECT 1 FROM website_platform_access_ownership o WHERE o.activity_key=NEW.activity_key AND o.state<>'ACADEMY')
AND NOT EXISTS(SELECT 1 FROM website_platform_course_policy_mirror m JOIN website_platform_access_ownership o USING(activity_key) WHERE m.activity_key=NEW.activity_key AND o.state='STUDIO' AND m.access_model=NEW.legacy_access_model AND NEW.policy_review_state='CONFIRMED')
BEGIN SELECT RAISE(ABORT,'STUDIO_ACCESS_MANAGED'); END;

CREATE TRIGGER studio_access_policy_month_delete BEFORE DELETE ON program_monthly_media_policies WHEN EXISTS(SELECT 1 FROM website_platform_access_ownership o WHERE o.activity_key=OLD.activity_key AND o.state<>'ACADEMY') BEGIN SELECT RAISE(ABORT,'STUDIO_ACCESS_MANAGED'); END;

CREATE TRIGGER studio_access_policy_month_insert BEFORE INSERT ON program_monthly_media_policies WHEN EXISTS(SELECT 1 FROM website_platform_access_ownership o WHERE o.activity_key=NEW.activity_key AND o.state<>'ACADEMY') BEGIN SELECT RAISE(ABORT,'STUDIO_ACCESS_MANAGED'); END;

CREATE TRIGGER studio_access_policy_month_update BEFORE UPDATE ON program_monthly_media_policies WHEN EXISTS(SELECT 1 FROM website_platform_access_ownership o WHERE o.activity_key=NEW.activity_key AND o.state<>'ACADEMY') BEGIN SELECT RAISE(ABORT,'STUDIO_ACCESS_MANAGED'); END;

CREATE TRIGGER website_access_activities_delete AFTER DELETE ON activities WHEN (SELECT enabled FROM website_platform_control WHERE singleton=1)=1 BEGIN INSERT INTO website_platform_access_dirty(activity_key,account_id) SELECT s.activity_key,'' FROM website_platform_access_scopes s WHERE s.activity_key=OLD.activity_key AND s.enabled=1 ON CONFLICT(activity_key,account_id) DO UPDATE SET revision=revision+1,next_attempt=0,last_error=NULL; END;

CREATE TRIGGER website_access_activities_insert AFTER INSERT ON activities WHEN (SELECT enabled FROM website_platform_control WHERE singleton=1)=1 BEGIN INSERT INTO website_platform_access_dirty(activity_key,account_id) SELECT s.activity_key,'' FROM website_platform_access_scopes s WHERE s.activity_key=NEW.activity_key AND s.enabled=1 ON CONFLICT(activity_key,account_id) DO UPDATE SET revision=revision+1,next_attempt=0,last_error=NULL; END;

CREATE TRIGGER website_access_activities_update AFTER UPDATE ON activities WHEN (SELECT enabled FROM website_platform_control WHERE singleton=1)=1 BEGIN INSERT INTO website_platform_access_dirty(activity_key,account_id) SELECT s.activity_key,'' FROM website_platform_access_scopes s WHERE s.activity_key=OLD.activity_key AND s.enabled=1 ON CONFLICT(activity_key,account_id) DO UPDATE SET revision=revision+1,next_attempt=0,last_error=NULL;
INSERT INTO website_platform_access_dirty(activity_key,account_id) SELECT s.activity_key,'' FROM website_platform_access_scopes s WHERE s.activity_key=NEW.activity_key AND s.enabled=1 ON CONFLICT(activity_key,account_id) DO UPDATE SET revision=revision+1,next_attempt=0,last_error=NULL; END;

CREATE TRIGGER website_access_class_memberships_delete AFTER DELETE ON class_memberships WHEN (SELECT enabled FROM website_platform_control WHERE singleton=1)=1 BEGIN INSERT INTO website_platform_access_dirty(activity_key,account_id) SELECT s.activity_key,lower(OLD.account_id) FROM website_platform_access_scopes s WHERE s.activity_key=OLD.activity_key AND s.enabled=1 ON CONFLICT(activity_key,account_id) DO UPDATE SET revision=revision+1,next_attempt=0,last_error=NULL; END;

CREATE TRIGGER website_access_class_memberships_insert AFTER INSERT ON class_memberships WHEN (SELECT enabled FROM website_platform_control WHERE singleton=1)=1 BEGIN INSERT INTO website_platform_access_dirty(activity_key,account_id) SELECT s.activity_key,lower(NEW.account_id) FROM website_platform_access_scopes s WHERE s.activity_key=NEW.activity_key AND s.enabled=1 ON CONFLICT(activity_key,account_id) DO UPDATE SET revision=revision+1,next_attempt=0,last_error=NULL; END;

CREATE TRIGGER website_access_class_memberships_update AFTER UPDATE ON class_memberships WHEN (SELECT enabled FROM website_platform_control WHERE singleton=1)=1 BEGIN INSERT INTO website_platform_access_dirty(activity_key,account_id) SELECT s.activity_key,lower(OLD.account_id) FROM website_platform_access_scopes s WHERE s.activity_key=OLD.activity_key AND s.enabled=1 ON CONFLICT(activity_key,account_id) DO UPDATE SET revision=revision+1,next_attempt=0,last_error=NULL;
INSERT INTO website_platform_access_dirty(activity_key,account_id) SELECT s.activity_key,lower(NEW.account_id) FROM website_platform_access_scopes s WHERE s.activity_key=NEW.activity_key AND s.enabled=1 ON CONFLICT(activity_key,account_id) DO UPDATE SET revision=revision+1,next_attempt=0,last_error=NULL; END;

CREATE TRIGGER website_access_classes_delete AFTER DELETE ON classes WHEN (SELECT enabled FROM website_platform_control WHERE singleton=1)=1 BEGIN INSERT INTO website_platform_access_dirty(activity_key,account_id) SELECT s.activity_key,'' FROM website_platform_access_scopes s WHERE s.activity_key=OLD.activity_key AND s.enabled=1 ON CONFLICT(activity_key,account_id) DO UPDATE SET revision=revision+1,next_attempt=0,last_error=NULL; END;

CREATE TRIGGER website_access_classes_insert AFTER INSERT ON classes WHEN (SELECT enabled FROM website_platform_control WHERE singleton=1)=1 BEGIN INSERT INTO website_platform_access_dirty(activity_key,account_id) SELECT s.activity_key,'' FROM website_platform_access_scopes s WHERE s.activity_key=NEW.activity_key AND s.enabled=1 ON CONFLICT(activity_key,account_id) DO UPDATE SET revision=revision+1,next_attempt=0,last_error=NULL; END;

CREATE TRIGGER website_access_classes_update AFTER UPDATE ON classes WHEN (SELECT enabled FROM website_platform_control WHERE singleton=1)=1 BEGIN INSERT INTO website_platform_access_dirty(activity_key,account_id) SELECT s.activity_key,'' FROM website_platform_access_scopes s WHERE s.activity_key=OLD.activity_key AND s.enabled=1 ON CONFLICT(activity_key,account_id) DO UPDATE SET revision=revision+1,next_attempt=0,last_error=NULL;
INSERT INTO website_platform_access_dirty(activity_key,account_id) SELECT s.activity_key,'' FROM website_platform_access_scopes s WHERE s.activity_key=NEW.activity_key AND s.enabled=1 ON CONFLICT(activity_key,account_id) DO UPDATE SET revision=revision+1,next_attempt=0,last_error=NULL; END;

CREATE TRIGGER website_access_control_activation AFTER UPDATE OF enabled ON website_platform_control WHEN NEW.enabled=1 AND OLD.enabled=0 BEGIN
 UPDATE website_platform_access_scopes SET revision=revision+1 WHERE enabled=1;
 INSERT INTO website_platform_access_dirty(activity_key,account_id) SELECT activity_key,'' FROM website_platform_access_scopes WHERE enabled=1 ON CONFLICT(activity_key,account_id) DO UPDATE SET revision=revision+1,next_attempt=0,last_error=NULL;
 DELETE FROM website_platform_access_imports;
 END;

CREATE TRIGGER website_access_course_run_state_delete AFTER DELETE ON course_run_state WHEN (SELECT enabled FROM website_platform_control WHERE singleton=1)=1 BEGIN INSERT INTO website_platform_access_dirty(activity_key,account_id) SELECT s.activity_key,'' FROM website_platform_access_scopes s WHERE s.activity_key=OLD.activity_key AND s.enabled=1 ON CONFLICT(activity_key,account_id) DO UPDATE SET revision=revision+1,next_attempt=0,last_error=NULL; END;

CREATE TRIGGER website_access_course_run_state_insert AFTER INSERT ON course_run_state WHEN (SELECT enabled FROM website_platform_control WHERE singleton=1)=1 BEGIN INSERT INTO website_platform_access_dirty(activity_key,account_id) SELECT s.activity_key,'' FROM website_platform_access_scopes s WHERE s.activity_key=NEW.activity_key AND s.enabled=1 ON CONFLICT(activity_key,account_id) DO UPDATE SET revision=revision+1,next_attempt=0,last_error=NULL; END;

CREATE TRIGGER website_access_course_run_state_update AFTER UPDATE ON course_run_state WHEN (SELECT enabled FROM website_platform_control WHERE singleton=1)=1 BEGIN INSERT INTO website_platform_access_dirty(activity_key,account_id) SELECT s.activity_key,'' FROM website_platform_access_scopes s WHERE s.activity_key=OLD.activity_key AND s.enabled=1 ON CONFLICT(activity_key,account_id) DO UPDATE SET revision=revision+1,next_attempt=0,last_error=NULL;
INSERT INTO website_platform_access_dirty(activity_key,account_id) SELECT s.activity_key,'' FROM website_platform_access_scopes s WHERE s.activity_key=NEW.activity_key AND s.enabled=1 ON CONFLICT(activity_key,account_id) DO UPDATE SET revision=revision+1,next_attempt=0,last_error=NULL; END;

CREATE TRIGGER website_access_course_runs_delete AFTER DELETE ON course_runs WHEN (SELECT enabled FROM website_platform_control WHERE singleton=1)=1 BEGIN INSERT INTO website_platform_access_dirty(activity_key,account_id) SELECT s.activity_key,'' FROM website_platform_access_scopes s WHERE s.activity_key=OLD.activity_key AND s.enabled=1 ON CONFLICT(activity_key,account_id) DO UPDATE SET revision=revision+1,next_attempt=0,last_error=NULL; END;

CREATE TRIGGER website_access_course_runs_insert AFTER INSERT ON course_runs WHEN (SELECT enabled FROM website_platform_control WHERE singleton=1)=1 BEGIN INSERT INTO website_platform_access_dirty(activity_key,account_id) SELECT s.activity_key,'' FROM website_platform_access_scopes s WHERE s.activity_key=NEW.activity_key AND s.enabled=1 ON CONFLICT(activity_key,account_id) DO UPDATE SET revision=revision+1,next_attempt=0,last_error=NULL; END;

CREATE TRIGGER website_access_course_runs_update AFTER UPDATE ON course_runs WHEN (SELECT enabled FROM website_platform_control WHERE singleton=1)=1 BEGIN INSERT INTO website_platform_access_dirty(activity_key,account_id) SELECT s.activity_key,'' FROM website_platform_access_scopes s WHERE s.activity_key=OLD.activity_key AND s.enabled=1 ON CONFLICT(activity_key,account_id) DO UPDATE SET revision=revision+1,next_attempt=0,last_error=NULL;
INSERT INTO website_platform_access_dirty(activity_key,account_id) SELECT s.activity_key,'' FROM website_platform_access_scopes s WHERE s.activity_key=NEW.activity_key AND s.enabled=1 ON CONFLICT(activity_key,account_id) DO UPDATE SET revision=revision+1,next_attempt=0,last_error=NULL; END;

CREATE TRIGGER website_access_course_settings_delete AFTER DELETE ON course_settings WHEN (SELECT enabled FROM website_platform_control WHERE singleton=1)=1 BEGIN INSERT INTO website_platform_access_dirty(activity_key,account_id) SELECT activity_key,'' FROM website_platform_access_scopes WHERE activity_key=OLD.activity_key AND enabled=1 ON CONFLICT(activity_key,account_id) DO UPDATE SET revision=revision+1,next_attempt=0,last_error=NULL; END;

CREATE TRIGGER website_access_course_settings_insert AFTER INSERT ON course_settings WHEN (SELECT enabled FROM website_platform_control WHERE singleton=1)=1 BEGIN INSERT INTO website_platform_access_dirty(activity_key,account_id) SELECT activity_key,'' FROM website_platform_access_scopes WHERE activity_key=NEW.activity_key AND enabled=1 ON CONFLICT(activity_key,account_id) DO UPDATE SET revision=revision+1,next_attempt=0,last_error=NULL; END;

CREATE TRIGGER website_access_course_settings_update AFTER UPDATE ON course_settings WHEN (SELECT enabled FROM website_platform_control WHERE singleton=1)=1 BEGIN INSERT INTO website_platform_access_dirty(activity_key,account_id) SELECT activity_key,'' FROM website_platform_access_scopes WHERE activity_key=OLD.activity_key AND enabled=1 ON CONFLICT(activity_key,account_id) DO UPDATE SET revision=revision+1,next_attempt=0,last_error=NULL; INSERT INTO website_platform_access_dirty(activity_key,account_id) SELECT activity_key,'' FROM website_platform_access_scopes WHERE activity_key=NEW.activity_key AND enabled=1 ON CONFLICT(activity_key,account_id) DO UPDATE SET revision=revision+1,next_attempt=0,last_error=NULL; END;

CREATE TRIGGER website_access_course_subscription_decisions_delete AFTER DELETE ON course_subscription_decisions WHEN (SELECT enabled FROM website_platform_control WHERE singleton=1)=1 BEGIN INSERT INTO website_platform_access_dirty(activity_key,account_id) SELECT s.activity_key,lower(OLD.account_id) FROM website_platform_access_scopes s WHERE s.activity_key=OLD.activity_key AND s.enabled=1 ON CONFLICT(activity_key,account_id) DO UPDATE SET revision=revision+1,next_attempt=0,last_error=NULL; END;

CREATE TRIGGER website_access_course_subscription_decisions_insert AFTER INSERT ON course_subscription_decisions WHEN (SELECT enabled FROM website_platform_control WHERE singleton=1)=1 BEGIN INSERT INTO website_platform_access_dirty(activity_key,account_id) SELECT s.activity_key,lower(NEW.account_id) FROM website_platform_access_scopes s WHERE s.activity_key=NEW.activity_key AND s.enabled=1 ON CONFLICT(activity_key,account_id) DO UPDATE SET revision=revision+1,next_attempt=0,last_error=NULL; END;

CREATE TRIGGER website_access_course_subscription_decisions_update AFTER UPDATE ON course_subscription_decisions WHEN (SELECT enabled FROM website_platform_control WHERE singleton=1)=1 BEGIN INSERT INTO website_platform_access_dirty(activity_key,account_id) SELECT s.activity_key,lower(OLD.account_id) FROM website_platform_access_scopes s WHERE s.activity_key=OLD.activity_key AND s.enabled=1 ON CONFLICT(activity_key,account_id) DO UPDATE SET revision=revision+1,next_attempt=0,last_error=NULL;
INSERT INTO website_platform_access_dirty(activity_key,account_id) SELECT s.activity_key,lower(NEW.account_id) FROM website_platform_access_scopes s WHERE s.activity_key=NEW.activity_key AND s.enabled=1 ON CONFLICT(activity_key,account_id) DO UPDATE SET revision=revision+1,next_attempt=0,last_error=NULL; END;

CREATE TRIGGER website_access_global_delete AFTER DELETE ON global_role_assignments WHEN (SELECT enabled FROM website_platform_control WHERE singleton=1)=1 BEGIN INSERT INTO website_platform_access_dirty(activity_key,account_id) SELECT activity_key,lower(OLD.account_id) FROM website_platform_access_scopes WHERE enabled=1 ON CONFLICT(activity_key,account_id) DO UPDATE SET revision=revision+1,next_attempt=0,last_error=NULL; END;

CREATE TRIGGER website_access_global_insert AFTER INSERT ON global_role_assignments WHEN (SELECT enabled FROM website_platform_control WHERE singleton=1)=1 BEGIN INSERT INTO website_platform_access_dirty(activity_key,account_id) SELECT activity_key,lower(NEW.account_id) FROM website_platform_access_scopes WHERE enabled=1 ON CONFLICT(activity_key,account_id) DO UPDATE SET revision=revision+1,next_attempt=0,last_error=NULL; END;

CREATE TRIGGER website_access_global_update AFTER UPDATE ON global_role_assignments WHEN (SELECT enabled FROM website_platform_control WHERE singleton=1)=1 BEGIN INSERT INTO website_platform_access_dirty(activity_key,account_id) SELECT activity_key,lower(OLD.account_id) FROM website_platform_access_scopes WHERE enabled=1 ON CONFLICT(activity_key,account_id) DO UPDATE SET revision=revision+1,next_attempt=0,last_error=NULL;
INSERT INTO website_platform_access_dirty(activity_key,account_id) SELECT activity_key,lower(NEW.account_id) FROM website_platform_access_scopes WHERE enabled=1 ON CONFLICT(activity_key,account_id) DO UPDATE SET revision=revision+1,next_attempt=0,last_error=NULL; END;

CREATE TRIGGER website_access_program_monthly_media_policies_delete AFTER DELETE ON program_monthly_media_policies WHEN (SELECT enabled FROM website_platform_control WHERE singleton=1)=1 BEGIN INSERT INTO website_platform_access_dirty(activity_key,account_id) SELECT s.activity_key,'' FROM website_platform_access_scopes s WHERE s.activity_key=OLD.activity_key AND s.enabled=1 ON CONFLICT(activity_key,account_id) DO UPDATE SET revision=revision+1,next_attempt=0,last_error=NULL; END;

CREATE TRIGGER website_access_program_monthly_media_policies_insert AFTER INSERT ON program_monthly_media_policies WHEN (SELECT enabled FROM website_platform_control WHERE singleton=1)=1 BEGIN INSERT INTO website_platform_access_dirty(activity_key,account_id) SELECT s.activity_key,'' FROM website_platform_access_scopes s WHERE s.activity_key=NEW.activity_key AND s.enabled=1 ON CONFLICT(activity_key,account_id) DO UPDATE SET revision=revision+1,next_attempt=0,last_error=NULL; END;

CREATE TRIGGER website_access_program_monthly_media_policies_update AFTER UPDATE ON program_monthly_media_policies WHEN (SELECT enabled FROM website_platform_control WHERE singleton=1)=1 BEGIN INSERT INTO website_platform_access_dirty(activity_key,account_id) SELECT s.activity_key,'' FROM website_platform_access_scopes s WHERE s.activity_key=OLD.activity_key AND s.enabled=1 ON CONFLICT(activity_key,account_id) DO UPDATE SET revision=revision+1,next_attempt=0,last_error=NULL;
INSERT INTO website_platform_access_dirty(activity_key,account_id) SELECT s.activity_key,'' FROM website_platform_access_scopes s WHERE s.activity_key=NEW.activity_key AND s.enabled=1 ON CONFLICT(activity_key,account_id) DO UPDATE SET revision=revision+1,next_attempt=0,last_error=NULL; END;

CREATE TRIGGER website_access_program_monthly_subscriptions_delete AFTER DELETE ON program_monthly_subscriptions WHEN (SELECT enabled FROM website_platform_control WHERE singleton=1)=1 BEGIN INSERT INTO website_platform_access_dirty(activity_key,account_id) SELECT s.activity_key,lower(OLD.account_id) FROM website_platform_access_scopes s WHERE s.activity_key=OLD.activity_key AND s.enabled=1 ON CONFLICT(activity_key,account_id) DO UPDATE SET revision=revision+1,next_attempt=0,last_error=NULL; END;

CREATE TRIGGER website_access_program_monthly_subscriptions_insert AFTER INSERT ON program_monthly_subscriptions WHEN (SELECT enabled FROM website_platform_control WHERE singleton=1)=1 BEGIN INSERT INTO website_platform_access_dirty(activity_key,account_id) SELECT s.activity_key,lower(NEW.account_id) FROM website_platform_access_scopes s WHERE s.activity_key=NEW.activity_key AND s.enabled=1 ON CONFLICT(activity_key,account_id) DO UPDATE SET revision=revision+1,next_attempt=0,last_error=NULL; END;

CREATE TRIGGER website_access_program_monthly_subscriptions_update AFTER UPDATE ON program_monthly_subscriptions WHEN (SELECT enabled FROM website_platform_control WHERE singleton=1)=1 BEGIN INSERT INTO website_platform_access_dirty(activity_key,account_id) SELECT s.activity_key,lower(OLD.account_id) FROM website_platform_access_scopes s WHERE s.activity_key=OLD.activity_key AND s.enabled=1 ON CONFLICT(activity_key,account_id) DO UPDATE SET revision=revision+1,next_attempt=0,last_error=NULL;
INSERT INTO website_platform_access_dirty(activity_key,account_id) SELECT s.activity_key,lower(NEW.account_id) FROM website_platform_access_scopes s WHERE s.activity_key=NEW.activity_key AND s.enabled=1 ON CONFLICT(activity_key,account_id) DO UPDATE SET revision=revision+1,next_attempt=0,last_error=NULL; END;

CREATE TRIGGER website_access_program_settings_delete AFTER DELETE ON program_settings WHEN (SELECT enabled FROM website_platform_control WHERE singleton=1)=1 BEGIN INSERT INTO website_platform_access_dirty(activity_key,account_id) SELECT activity_key,'' FROM website_platform_access_scopes WHERE activity_key=OLD.activity_key AND enabled=1 ON CONFLICT(activity_key,account_id) DO UPDATE SET revision=revision+1,next_attempt=0,last_error=NULL; END;

CREATE TRIGGER website_access_program_settings_insert AFTER INSERT ON program_settings WHEN (SELECT enabled FROM website_platform_control WHERE singleton=1)=1 BEGIN INSERT INTO website_platform_access_dirty(activity_key,account_id) SELECT activity_key,'' FROM website_platform_access_scopes WHERE activity_key=NEW.activity_key AND enabled=1 ON CONFLICT(activity_key,account_id) DO UPDATE SET revision=revision+1,next_attempt=0,last_error=NULL; END;

CREATE TRIGGER website_access_program_settings_update AFTER UPDATE ON program_settings WHEN (SELECT enabled FROM website_platform_control WHERE singleton=1)=1 BEGIN INSERT INTO website_platform_access_dirty(activity_key,account_id) SELECT activity_key,'' FROM website_platform_access_scopes WHERE activity_key=OLD.activity_key AND enabled=1 ON CONFLICT(activity_key,account_id) DO UPDATE SET revision=revision+1,next_attempt=0,last_error=NULL; INSERT INTO website_platform_access_dirty(activity_key,account_id) SELECT activity_key,'' FROM website_platform_access_scopes WHERE activity_key=NEW.activity_key AND enabled=1 ON CONFLICT(activity_key,account_id) DO UPDATE SET revision=revision+1,next_attempt=0,last_error=NULL; END;

CREATE TRIGGER website_access_program_surah_grants_delete AFTER DELETE ON program_surah_grants WHEN (SELECT enabled FROM website_platform_control WHERE singleton=1)=1 BEGIN INSERT INTO website_platform_access_dirty(activity_key,account_id) SELECT s.activity_key,lower(OLD.account_id) FROM website_platform_access_scopes s WHERE s.activity_key=OLD.activity_key AND s.enabled=1 ON CONFLICT(activity_key,account_id) DO UPDATE SET revision=revision+1,next_attempt=0,last_error=NULL; END;

CREATE TRIGGER website_access_program_surah_grants_insert AFTER INSERT ON program_surah_grants WHEN (SELECT enabled FROM website_platform_control WHERE singleton=1)=1 BEGIN INSERT INTO website_platform_access_dirty(activity_key,account_id) SELECT s.activity_key,lower(NEW.account_id) FROM website_platform_access_scopes s WHERE s.activity_key=NEW.activity_key AND s.enabled=1 ON CONFLICT(activity_key,account_id) DO UPDATE SET revision=revision+1,next_attempt=0,last_error=NULL; END;

CREATE TRIGGER website_access_program_surah_grants_update AFTER UPDATE ON program_surah_grants WHEN (SELECT enabled FROM website_platform_control WHERE singleton=1)=1 BEGIN INSERT INTO website_platform_access_dirty(activity_key,account_id) SELECT s.activity_key,lower(OLD.account_id) FROM website_platform_access_scopes s WHERE s.activity_key=OLD.activity_key AND s.enabled=1 ON CONFLICT(activity_key,account_id) DO UPDATE SET revision=revision+1,next_attempt=0,last_error=NULL;
INSERT INTO website_platform_access_dirty(activity_key,account_id) SELECT s.activity_key,lower(NEW.account_id) FROM website_platform_access_scopes s WHERE s.activity_key=NEW.activity_key AND s.enabled=1 ON CONFLICT(activity_key,account_id) DO UPDATE SET revision=revision+1,next_attempt=0,last_error=NULL; END;

CREATE TRIGGER website_access_program_surahs_delete AFTER DELETE ON program_surahs WHEN (SELECT enabled FROM website_platform_control WHERE singleton=1)=1 BEGIN INSERT INTO website_platform_access_dirty(activity_key,account_id) SELECT s.activity_key,'' FROM website_platform_access_scopes s WHERE s.activity_key=OLD.activity_key AND s.enabled=1 ON CONFLICT(activity_key,account_id) DO UPDATE SET revision=revision+1,next_attempt=0,last_error=NULL; END;

CREATE TRIGGER website_access_program_surahs_insert AFTER INSERT ON program_surahs WHEN (SELECT enabled FROM website_platform_control WHERE singleton=1)=1 BEGIN INSERT INTO website_platform_access_dirty(activity_key,account_id) SELECT s.activity_key,'' FROM website_platform_access_scopes s WHERE s.activity_key=NEW.activity_key AND s.enabled=1 ON CONFLICT(activity_key,account_id) DO UPDATE SET revision=revision+1,next_attempt=0,last_error=NULL; END;

CREATE TRIGGER website_access_program_surahs_update AFTER UPDATE ON program_surahs WHEN (SELECT enabled FROM website_platform_control WHERE singleton=1)=1 BEGIN INSERT INTO website_platform_access_dirty(activity_key,account_id) SELECT s.activity_key,'' FROM website_platform_access_scopes s WHERE s.activity_key=OLD.activity_key AND s.enabled=1 ON CONFLICT(activity_key,account_id) DO UPDATE SET revision=revision+1,next_attempt=0,last_error=NULL;
INSERT INTO website_platform_access_dirty(activity_key,account_id) SELECT s.activity_key,'' FROM website_platform_access_scopes s WHERE s.activity_key=NEW.activity_key AND s.enabled=1 ON CONFLICT(activity_key,account_id) DO UPDATE SET revision=revision+1,next_attempt=0,last_error=NULL; END;

CREATE TRIGGER website_access_role_assignments_delete AFTER DELETE ON role_assignments WHEN (SELECT enabled FROM website_platform_control WHERE singleton=1)=1 BEGIN INSERT INTO website_platform_access_dirty(activity_key,account_id) SELECT s.activity_key,lower(OLD.account_id) FROM website_platform_access_scopes s WHERE s.activity_key=OLD.activity_key AND s.enabled=1 ON CONFLICT(activity_key,account_id) DO UPDATE SET revision=revision+1,next_attempt=0,last_error=NULL; END;

CREATE TRIGGER website_access_role_assignments_insert AFTER INSERT ON role_assignments WHEN (SELECT enabled FROM website_platform_control WHERE singleton=1)=1 BEGIN INSERT INTO website_platform_access_dirty(activity_key,account_id) SELECT s.activity_key,lower(NEW.account_id) FROM website_platform_access_scopes s WHERE s.activity_key=NEW.activity_key AND s.enabled=1 ON CONFLICT(activity_key,account_id) DO UPDATE SET revision=revision+1,next_attempt=0,last_error=NULL; END;

CREATE TRIGGER website_access_role_assignments_update AFTER UPDATE ON role_assignments WHEN (SELECT enabled FROM website_platform_control WHERE singleton=1)=1 BEGIN INSERT INTO website_platform_access_dirty(activity_key,account_id) SELECT s.activity_key,lower(OLD.account_id) FROM website_platform_access_scopes s WHERE s.activity_key=OLD.activity_key AND s.enabled=1 ON CONFLICT(activity_key,account_id) DO UPDATE SET revision=revision+1,next_attempt=0,last_error=NULL;
INSERT INTO website_platform_access_dirty(activity_key,account_id) SELECT s.activity_key,lower(NEW.account_id) FROM website_platform_access_scopes s WHERE s.activity_key=NEW.activity_key AND s.enabled=1 ON CONFLICT(activity_key,account_id) DO UPDATE SET revision=revision+1,next_attempt=0,last_error=NULL; END;

CREATE TRIGGER website_access_scope_change AFTER UPDATE OF enabled,purchase_model ON website_platform_access_scopes BEGIN
 UPDATE website_platform_access_scopes SET revision=OLD.revision+1 WHERE activity_key=NEW.activity_key;
 INSERT INTO website_platform_access_dirty(activity_key,account_id) VALUES(NEW.activity_key,'') ON CONFLICT(activity_key,account_id) DO UPDATE SET revision=revision+1,next_attempt=0,last_error=NULL;
 DELETE FROM website_platform_access_imports WHERE activity_key=NEW.activity_key;
 END;

CREATE TRIGGER website_access_website_platform_surah_maps_delete AFTER DELETE ON website_platform_surah_maps WHEN (SELECT enabled FROM website_platform_control WHERE singleton=1)=1 BEGIN INSERT INTO website_platform_access_dirty(activity_key,account_id) SELECT s.activity_key,'' FROM website_platform_access_scopes s WHERE s.activity_key=OLD.activity_key AND s.enabled=1 ON CONFLICT(activity_key,account_id) DO UPDATE SET revision=revision+1,next_attempt=0,last_error=NULL;
INSERT INTO website_platform_access_dirty(activity_key,account_id) SELECT g.activity_key,lower(g.account_id) FROM program_surah_grants g JOIN website_platform_access_scopes s USING(activity_key) WHERE g.activity_key=OLD.activity_key AND g.surah_id=OLD.surah_id AND s.enabled=1 ON CONFLICT(activity_key,account_id) DO UPDATE SET revision=revision+1,next_attempt=0,last_error=NULL; END;

CREATE TRIGGER website_access_website_platform_surah_maps_insert AFTER INSERT ON website_platform_surah_maps WHEN (SELECT enabled FROM website_platform_control WHERE singleton=1)=1 BEGIN INSERT INTO website_platform_access_dirty(activity_key,account_id) SELECT s.activity_key,'' FROM website_platform_access_scopes s WHERE s.activity_key=NEW.activity_key AND s.enabled=1 ON CONFLICT(activity_key,account_id) DO UPDATE SET revision=revision+1,next_attempt=0,last_error=NULL;
INSERT INTO website_platform_access_dirty(activity_key,account_id) SELECT g.activity_key,lower(g.account_id) FROM program_surah_grants g JOIN website_platform_access_scopes s USING(activity_key) WHERE g.activity_key=NEW.activity_key AND g.surah_id=NEW.surah_id AND s.enabled=1 ON CONFLICT(activity_key,account_id) DO UPDATE SET revision=revision+1,next_attempt=0,last_error=NULL; END;

CREATE TRIGGER website_access_website_platform_surah_maps_update AFTER UPDATE ON website_platform_surah_maps WHEN (SELECT enabled FROM website_platform_control WHERE singleton=1)=1 BEGIN INSERT INTO website_platform_access_dirty(activity_key,account_id) SELECT s.activity_key,'' FROM website_platform_access_scopes s WHERE s.activity_key=OLD.activity_key AND s.enabled=1 ON CONFLICT(activity_key,account_id) DO UPDATE SET revision=revision+1,next_attempt=0,last_error=NULL;
INSERT INTO website_platform_access_dirty(activity_key,account_id) SELECT s.activity_key,'' FROM website_platform_access_scopes s WHERE s.activity_key=NEW.activity_key AND s.enabled=1 ON CONFLICT(activity_key,account_id) DO UPDATE SET revision=revision+1,next_attempt=0,last_error=NULL;
INSERT INTO website_platform_access_dirty(activity_key,account_id) SELECT g.activity_key,lower(g.account_id) FROM program_surah_grants g JOIN website_platform_access_scopes s USING(activity_key) WHERE g.activity_key=OLD.activity_key AND g.surah_id=OLD.surah_id AND s.enabled=1 ON CONFLICT(activity_key,account_id) DO UPDATE SET revision=revision+1,next_attempt=0,last_error=NULL;
INSERT INTO website_platform_access_dirty(activity_key,account_id) SELECT g.activity_key,lower(g.account_id) FROM program_surah_grants g JOIN website_platform_access_scopes s USING(activity_key) WHERE g.activity_key=NEW.activity_key AND g.surah_id=NEW.surah_id AND s.enabled=1 ON CONFLICT(activity_key,account_id) DO UPDATE SET revision=revision+1,next_attempt=0,last_error=NULL; END;

CREATE TRIGGER website_navigation_activities_update AFTER UPDATE OF active,lifecycle ON activities WHEN (SELECT enabled FROM website_platform_control WHERE singleton=1)=1 BEGIN
INSERT INTO website_platform_streams SELECT 'account:'||a.account_id,1 FROM website_platform_account_state a WHERE a.account_id IN (SELECT r.account_id FROM role_assignments r JOIN website_platform_sessions b ON b.account_id=r.account_id COLLATE NOCASE WHERE r.activity_key=NEW.activity_key AND b.expires_at>CAST(strftime('%s','now') AS INTEGER)*1000 UNION SELECT g.account_id FROM global_role_assignments g JOIN website_platform_sessions b ON b.account_id=g.account_id COLLATE NOCASE WHERE g.role='GLOBAL_ADMIN' AND g.active=1 AND g.review_state='CONFIRMED' AND b.expires_at>CAST(strftime('%s','now') AS INTEGER)*1000) AND EXISTS(SELECT 1 FROM website_platform_sessions b WHERE b.account_id=a.account_id COLLATE NOCASE AND b.expires_at>CAST(strftime('%s','now') AS INTEGER)*1000) ON CONFLICT(stream) DO UPDATE SET version=version+1;
INSERT INTO website_platform_outbox(operation_id,stream,version,event_json) SELECT lower(hex(randomblob(16))),v.stream,v.version,json_object('type','navigation-invalidated','accountId',a.account_id) FROM website_platform_account_state a JOIN website_platform_streams v ON v.stream='account:'||a.account_id WHERE a.account_id IN (SELECT r.account_id FROM role_assignments r JOIN website_platform_sessions b ON b.account_id=r.account_id COLLATE NOCASE WHERE r.activity_key=NEW.activity_key AND b.expires_at>CAST(strftime('%s','now') AS INTEGER)*1000 UNION SELECT g.account_id FROM global_role_assignments g JOIN website_platform_sessions b ON b.account_id=g.account_id COLLATE NOCASE WHERE g.role='GLOBAL_ADMIN' AND g.active=1 AND g.review_state='CONFIRMED' AND b.expires_at>CAST(strftime('%s','now') AS INTEGER)*1000) AND EXISTS(SELECT 1 FROM website_platform_sessions b WHERE b.account_id=a.account_id COLLATE NOCASE AND b.expires_at>CAST(strftime('%s','now') AS INTEGER)*1000);
END;

CREATE TRIGGER website_navigation_class_memberships_delete AFTER DELETE ON class_memberships WHEN (SELECT enabled FROM website_platform_control WHERE singleton=1)=1 BEGIN
INSERT INTO website_platform_streams SELECT 'account:'||a.account_id,1 FROM website_platform_account_state a WHERE (a.account_id=OLD.account_id COLLATE NOCASE) AND EXISTS(SELECT 1 FROM website_platform_sessions b WHERE b.account_id=a.account_id COLLATE NOCASE AND b.expires_at>CAST(strftime('%s','now') AS INTEGER)*1000) ON CONFLICT(stream) DO UPDATE SET version=version+1;
INSERT INTO website_platform_outbox(operation_id,stream,version,event_json) SELECT lower(hex(randomblob(16))),v.stream,v.version,json_object('type','navigation-invalidated','accountId',a.account_id) FROM website_platform_account_state a JOIN website_platform_streams v ON v.stream='account:'||a.account_id WHERE (a.account_id=OLD.account_id COLLATE NOCASE) AND EXISTS(SELECT 1 FROM website_platform_sessions b WHERE b.account_id=a.account_id COLLATE NOCASE AND b.expires_at>CAST(strftime('%s','now') AS INTEGER)*1000);
END;

CREATE TRIGGER website_navigation_class_memberships_insert AFTER INSERT ON class_memberships WHEN (SELECT enabled FROM website_platform_control WHERE singleton=1)=1 BEGIN
INSERT INTO website_platform_streams SELECT 'account:'||a.account_id,1 FROM website_platform_account_state a WHERE (a.account_id=NEW.account_id COLLATE NOCASE) AND EXISTS(SELECT 1 FROM website_platform_sessions b WHERE b.account_id=a.account_id COLLATE NOCASE AND b.expires_at>CAST(strftime('%s','now') AS INTEGER)*1000) ON CONFLICT(stream) DO UPDATE SET version=version+1;
INSERT INTO website_platform_outbox(operation_id,stream,version,event_json) SELECT lower(hex(randomblob(16))),v.stream,v.version,json_object('type','navigation-invalidated','accountId',a.account_id) FROM website_platform_account_state a JOIN website_platform_streams v ON v.stream='account:'||a.account_id WHERE (a.account_id=NEW.account_id COLLATE NOCASE) AND EXISTS(SELECT 1 FROM website_platform_sessions b WHERE b.account_id=a.account_id COLLATE NOCASE AND b.expires_at>CAST(strftime('%s','now') AS INTEGER)*1000);
END;

CREATE TRIGGER website_navigation_class_memberships_update AFTER UPDATE ON class_memberships WHEN (SELECT enabled FROM website_platform_control WHERE singleton=1)=1 BEGIN
INSERT INTO website_platform_streams SELECT 'account:'||a.account_id,1 FROM website_platform_account_state a WHERE (a.account_id=OLD.account_id COLLATE NOCASE OR a.account_id=NEW.account_id COLLATE NOCASE) AND EXISTS(SELECT 1 FROM website_platform_sessions b WHERE b.account_id=a.account_id COLLATE NOCASE AND b.expires_at>CAST(strftime('%s','now') AS INTEGER)*1000) ON CONFLICT(stream) DO UPDATE SET version=version+1;
INSERT INTO website_platform_outbox(operation_id,stream,version,event_json) SELECT lower(hex(randomblob(16))),v.stream,v.version,json_object('type','navigation-invalidated','accountId',a.account_id) FROM website_platform_account_state a JOIN website_platform_streams v ON v.stream='account:'||a.account_id WHERE (a.account_id=OLD.account_id COLLATE NOCASE OR a.account_id=NEW.account_id COLLATE NOCASE) AND EXISTS(SELECT 1 FROM website_platform_sessions b WHERE b.account_id=a.account_id COLLATE NOCASE AND b.expires_at>CAST(strftime('%s','now') AS INTEGER)*1000);
END;

CREATE TRIGGER website_navigation_course_subscription_decisions_delete AFTER DELETE ON course_subscription_decisions WHEN (SELECT enabled FROM website_platform_control WHERE singleton=1)=1 BEGIN
INSERT INTO website_platform_streams SELECT 'account:'||a.account_id,1 FROM website_platform_account_state a WHERE (a.account_id=OLD.account_id COLLATE NOCASE) AND EXISTS(SELECT 1 FROM website_platform_sessions b WHERE b.account_id=a.account_id COLLATE NOCASE AND b.expires_at>CAST(strftime('%s','now') AS INTEGER)*1000) ON CONFLICT(stream) DO UPDATE SET version=version+1;
INSERT INTO website_platform_outbox(operation_id,stream,version,event_json) SELECT lower(hex(randomblob(16))),v.stream,v.version,json_object('type','navigation-invalidated','accountId',a.account_id) FROM website_platform_account_state a JOIN website_platform_streams v ON v.stream='account:'||a.account_id WHERE (a.account_id=OLD.account_id COLLATE NOCASE) AND EXISTS(SELECT 1 FROM website_platform_sessions b WHERE b.account_id=a.account_id COLLATE NOCASE AND b.expires_at>CAST(strftime('%s','now') AS INTEGER)*1000);
END;

CREATE TRIGGER website_navigation_course_subscription_decisions_insert AFTER INSERT ON course_subscription_decisions WHEN (SELECT enabled FROM website_platform_control WHERE singleton=1)=1 BEGIN
INSERT INTO website_platform_streams SELECT 'account:'||a.account_id,1 FROM website_platform_account_state a WHERE (a.account_id=NEW.account_id COLLATE NOCASE) AND EXISTS(SELECT 1 FROM website_platform_sessions b WHERE b.account_id=a.account_id COLLATE NOCASE AND b.expires_at>CAST(strftime('%s','now') AS INTEGER)*1000) ON CONFLICT(stream) DO UPDATE SET version=version+1;
INSERT INTO website_platform_outbox(operation_id,stream,version,event_json) SELECT lower(hex(randomblob(16))),v.stream,v.version,json_object('type','navigation-invalidated','accountId',a.account_id) FROM website_platform_account_state a JOIN website_platform_streams v ON v.stream='account:'||a.account_id WHERE (a.account_id=NEW.account_id COLLATE NOCASE) AND EXISTS(SELECT 1 FROM website_platform_sessions b WHERE b.account_id=a.account_id COLLATE NOCASE AND b.expires_at>CAST(strftime('%s','now') AS INTEGER)*1000);
END;

CREATE TRIGGER website_navigation_course_subscription_decisions_update AFTER UPDATE ON course_subscription_decisions WHEN (SELECT enabled FROM website_platform_control WHERE singleton=1)=1 BEGIN
INSERT INTO website_platform_streams SELECT 'account:'||a.account_id,1 FROM website_platform_account_state a WHERE (a.account_id=OLD.account_id COLLATE NOCASE OR a.account_id=NEW.account_id COLLATE NOCASE) AND EXISTS(SELECT 1 FROM website_platform_sessions b WHERE b.account_id=a.account_id COLLATE NOCASE AND b.expires_at>CAST(strftime('%s','now') AS INTEGER)*1000) ON CONFLICT(stream) DO UPDATE SET version=version+1;
INSERT INTO website_platform_outbox(operation_id,stream,version,event_json) SELECT lower(hex(randomblob(16))),v.stream,v.version,json_object('type','navigation-invalidated','accountId',a.account_id) FROM website_platform_account_state a JOIN website_platform_streams v ON v.stream='account:'||a.account_id WHERE (a.account_id=OLD.account_id COLLATE NOCASE OR a.account_id=NEW.account_id COLLATE NOCASE) AND EXISTS(SELECT 1 FROM website_platform_sessions b WHERE b.account_id=a.account_id COLLATE NOCASE AND b.expires_at>CAST(strftime('%s','now') AS INTEGER)*1000);
END;

CREATE TRIGGER website_navigation_role_assignments_delete AFTER DELETE ON role_assignments WHEN (SELECT enabled FROM website_platform_control WHERE singleton=1)=1 BEGIN
INSERT INTO website_platform_streams SELECT 'account:'||a.account_id,1 FROM website_platform_account_state a WHERE (a.account_id=OLD.account_id COLLATE NOCASE) AND EXISTS(SELECT 1 FROM website_platform_sessions b WHERE b.account_id=a.account_id COLLATE NOCASE AND b.expires_at>CAST(strftime('%s','now') AS INTEGER)*1000) ON CONFLICT(stream) DO UPDATE SET version=version+1;
INSERT INTO website_platform_outbox(operation_id,stream,version,event_json) SELECT lower(hex(randomblob(16))),v.stream,v.version,json_object('type','navigation-invalidated','accountId',a.account_id) FROM website_platform_account_state a JOIN website_platform_streams v ON v.stream='account:'||a.account_id WHERE (a.account_id=OLD.account_id COLLATE NOCASE) AND EXISTS(SELECT 1 FROM website_platform_sessions b WHERE b.account_id=a.account_id COLLATE NOCASE AND b.expires_at>CAST(strftime('%s','now') AS INTEGER)*1000);
END;

CREATE TRIGGER website_navigation_role_assignments_insert AFTER INSERT ON role_assignments WHEN (SELECT enabled FROM website_platform_control WHERE singleton=1)=1 BEGIN
INSERT INTO website_platform_streams SELECT 'account:'||a.account_id,1 FROM website_platform_account_state a WHERE (a.account_id=NEW.account_id COLLATE NOCASE) AND EXISTS(SELECT 1 FROM website_platform_sessions b WHERE b.account_id=a.account_id COLLATE NOCASE AND b.expires_at>CAST(strftime('%s','now') AS INTEGER)*1000) ON CONFLICT(stream) DO UPDATE SET version=version+1;
INSERT INTO website_platform_outbox(operation_id,stream,version,event_json) SELECT lower(hex(randomblob(16))),v.stream,v.version,json_object('type','navigation-invalidated','accountId',a.account_id) FROM website_platform_account_state a JOIN website_platform_streams v ON v.stream='account:'||a.account_id WHERE (a.account_id=NEW.account_id COLLATE NOCASE) AND EXISTS(SELECT 1 FROM website_platform_sessions b WHERE b.account_id=a.account_id COLLATE NOCASE AND b.expires_at>CAST(strftime('%s','now') AS INTEGER)*1000);
END;

CREATE TRIGGER website_navigation_role_assignments_update AFTER UPDATE ON role_assignments WHEN (SELECT enabled FROM website_platform_control WHERE singleton=1)=1 BEGIN
INSERT INTO website_platform_streams SELECT 'account:'||a.account_id,1 FROM website_platform_account_state a WHERE (a.account_id=OLD.account_id COLLATE NOCASE OR a.account_id=NEW.account_id COLLATE NOCASE) AND EXISTS(SELECT 1 FROM website_platform_sessions b WHERE b.account_id=a.account_id COLLATE NOCASE AND b.expires_at>CAST(strftime('%s','now') AS INTEGER)*1000) ON CONFLICT(stream) DO UPDATE SET version=version+1;
INSERT INTO website_platform_outbox(operation_id,stream,version,event_json) SELECT lower(hex(randomblob(16))),v.stream,v.version,json_object('type','navigation-invalidated','accountId',a.account_id) FROM website_platform_account_state a JOIN website_platform_streams v ON v.stream='account:'||a.account_id WHERE (a.account_id=OLD.account_id COLLATE NOCASE OR a.account_id=NEW.account_id COLLATE NOCASE) AND EXISTS(SELECT 1 FROM website_platform_sessions b WHERE b.account_id=a.account_id COLLATE NOCASE AND b.expires_at>CAST(strftime('%s','now') AS INTEGER)*1000);
END;

CREATE TRIGGER website_platform_account_credentials_update AFTER UPDATE OF credential_epoch ON account_credentials WHEN (SELECT enabled FROM website_platform_control WHERE singleton=1)=1 BEGIN
 INSERT INTO website_platform_streams VALUES('account:'||NEW.account_id,1) ON CONFLICT(stream) DO UPDATE SET version=version+1;
 INSERT INTO website_platform_outbox(operation_id,stream,version,event_json)
 SELECT lower(hex(randomblob(16))),'account:'||a.account_id,v.version,
 json_object('type','account','account',json_object('accountId',a.account_id,'displayName',a.display_name,'active',json(CASE a.active WHEN 1 THEN 'true' ELSE 'false' END),'admitted',json(CASE a.admitted WHEN 1 THEN 'true' ELSE 'false' END),'epoch',a.epoch,'globalAdmin',json(CASE a.global_admin WHEN 1 THEN 'true' ELSE 'false' END),'verifiedAt',CAST(strftime('%s','now') AS INTEGER)*1000+CAST(substr(strftime('%f','now'),4,3) AS INTEGER)))
 FROM website_platform_account_state a JOIN website_platform_streams v ON v.stream='account:'||a.account_id WHERE a.account_id=NEW.account_id;
 INSERT INTO academy_settings(setting_key,setting_value,updated_at) VALUES('AcademySnapshot:authority:'||upper(NEW.account_id),'1',strftime('%Y-%m-%dT%H:%M:%fZ','now')) ON CONFLICT(setting_key) DO UPDATE SET setting_value=CAST(setting_value AS INTEGER)+1;
 END;

CREATE TRIGGER website_platform_accounts_update AFTER UPDATE OF active,display_name ON accounts WHEN (SELECT enabled FROM website_platform_control WHERE singleton=1)=1 BEGIN
 INSERT INTO website_platform_streams VALUES('account:'||NEW.account_id,1) ON CONFLICT(stream) DO UPDATE SET version=version+1;
 INSERT INTO website_platform_outbox(operation_id,stream,version,event_json)
 SELECT lower(hex(randomblob(16))),'account:'||a.account_id,v.version,
 json_object('type','account','account',json_object('accountId',a.account_id,'displayName',a.display_name,'active',json(CASE a.active WHEN 1 THEN 'true' ELSE 'false' END),'admitted',json(CASE a.admitted WHEN 1 THEN 'true' ELSE 'false' END),'epoch',a.epoch,'globalAdmin',json(CASE a.global_admin WHEN 1 THEN 'true' ELSE 'false' END),'verifiedAt',CAST(strftime('%s','now') AS INTEGER)*1000+CAST(substr(strftime('%f','now'),4,3) AS INTEGER)))
 FROM website_platform_account_state a JOIN website_platform_streams v ON v.stream='account:'||a.account_id WHERE a.account_id=NEW.account_id;
 INSERT INTO academy_settings(setting_key,setting_value,updated_at) VALUES('AcademySnapshot:authority:'||upper(NEW.account_id),'1',strftime('%Y-%m-%dT%H:%M:%fZ','now')) ON CONFLICT(setting_key) DO UPDATE SET setting_value=CAST(setting_value AS INTEGER)+1;
 END;

CREATE TRIGGER website_platform_global_role_assignments_delete AFTER DELETE ON global_role_assignments WHEN (SELECT enabled FROM website_platform_control WHERE singleton=1)=1 BEGIN
 INSERT INTO website_platform_streams VALUES('account:'||OLD.account_id,1) ON CONFLICT(stream) DO UPDATE SET version=version+1;
 INSERT INTO website_platform_outbox(operation_id,stream,version,event_json)
 SELECT lower(hex(randomblob(16))),'account:'||a.account_id,v.version,
 json_object('type','account','account',json_object('accountId',a.account_id,'displayName',a.display_name,'active',json(CASE a.active WHEN 1 THEN 'true' ELSE 'false' END),'admitted',json(CASE a.admitted WHEN 1 THEN 'true' ELSE 'false' END),'epoch',a.epoch,'globalAdmin',json(CASE a.global_admin WHEN 1 THEN 'true' ELSE 'false' END),'verifiedAt',CAST(strftime('%s','now') AS INTEGER)*1000+CAST(substr(strftime('%f','now'),4,3) AS INTEGER)))
 FROM website_platform_account_state a JOIN website_platform_streams v ON v.stream='account:'||a.account_id WHERE a.account_id=OLD.account_id;
 INSERT INTO academy_settings(setting_key,setting_value,updated_at) VALUES('AcademySnapshot:authority:'||upper(OLD.account_id),'1',strftime('%Y-%m-%dT%H:%M:%fZ','now')) ON CONFLICT(setting_key) DO UPDATE SET setting_value=CAST(setting_value AS INTEGER)+1;
 END;

CREATE TRIGGER website_platform_global_role_assignments_insert AFTER INSERT ON global_role_assignments WHEN (SELECT enabled FROM website_platform_control WHERE singleton=1)=1 BEGIN
 INSERT INTO website_platform_streams VALUES('account:'||NEW.account_id,1) ON CONFLICT(stream) DO UPDATE SET version=version+1;
 INSERT INTO website_platform_outbox(operation_id,stream,version,event_json)
 SELECT lower(hex(randomblob(16))),'account:'||a.account_id,v.version,
 json_object('type','account','account',json_object('accountId',a.account_id,'displayName',a.display_name,'active',json(CASE a.active WHEN 1 THEN 'true' ELSE 'false' END),'admitted',json(CASE a.admitted WHEN 1 THEN 'true' ELSE 'false' END),'epoch',a.epoch,'globalAdmin',json(CASE a.global_admin WHEN 1 THEN 'true' ELSE 'false' END),'verifiedAt',CAST(strftime('%s','now') AS INTEGER)*1000+CAST(substr(strftime('%f','now'),4,3) AS INTEGER)))
 FROM website_platform_account_state a JOIN website_platform_streams v ON v.stream='account:'||a.account_id WHERE a.account_id=NEW.account_id;
 INSERT INTO academy_settings(setting_key,setting_value,updated_at) VALUES('AcademySnapshot:authority:'||upper(NEW.account_id),'1',strftime('%Y-%m-%dT%H:%M:%fZ','now')) ON CONFLICT(setting_key) DO UPDATE SET setting_value=CAST(setting_value AS INTEGER)+1;
 END;

CREATE TRIGGER website_platform_global_role_assignments_update AFTER UPDATE OF active,review_state ON global_role_assignments WHEN (SELECT enabled FROM website_platform_control WHERE singleton=1)=1 BEGIN
 INSERT INTO website_platform_streams VALUES('account:'||NEW.account_id,1) ON CONFLICT(stream) DO UPDATE SET version=version+1;
 INSERT INTO website_platform_outbox(operation_id,stream,version,event_json)
 SELECT lower(hex(randomblob(16))),'account:'||a.account_id,v.version,
 json_object('type','account','account',json_object('accountId',a.account_id,'displayName',a.display_name,'active',json(CASE a.active WHEN 1 THEN 'true' ELSE 'false' END),'admitted',json(CASE a.admitted WHEN 1 THEN 'true' ELSE 'false' END),'epoch',a.epoch,'globalAdmin',json(CASE a.global_admin WHEN 1 THEN 'true' ELSE 'false' END),'verifiedAt',CAST(strftime('%s','now') AS INTEGER)*1000+CAST(substr(strftime('%f','now'),4,3) AS INTEGER)))
 FROM website_platform_account_state a JOIN website_platform_streams v ON v.stream='account:'||a.account_id WHERE a.account_id=NEW.account_id;
 INSERT INTO academy_settings(setting_key,setting_value,updated_at) VALUES('AcademySnapshot:authority:'||upper(NEW.account_id),'1',strftime('%Y-%m-%dT%H:%M:%fZ','now')) ON CONFLICT(setting_key) DO UPDATE SET setting_value=CAST(setting_value AS INTEGER)+1;
 END;

CREATE TRIGGER website_platform_schedule_academy_calendar_events_delete AFTER DELETE ON academy_calendar_events
 WHEN (SELECT enabled FROM website_platform_control WHERE singleton=1)=1
 BEGIN UPDATE website_platform_timetable_scopes SET revision=revision+1,next_attempt=0,attempts=0,last_error=NULL WHERE OLD.scope_key='ACADEMY' OR activity_key=OLD.scope_key; END;

CREATE TRIGGER website_platform_schedule_academy_calendar_events_insert AFTER INSERT ON academy_calendar_events
 WHEN (SELECT enabled FROM website_platform_control WHERE singleton=1)=1
 BEGIN UPDATE website_platform_timetable_scopes SET revision=revision+1,next_attempt=0,attempts=0,last_error=NULL WHERE NEW.scope_key='ACADEMY' OR activity_key=NEW.scope_key; END;

CREATE TRIGGER website_platform_schedule_academy_calendar_events_update AFTER UPDATE ON academy_calendar_events
 WHEN (SELECT enabled FROM website_platform_control WHERE singleton=1)=1
 BEGIN UPDATE website_platform_timetable_scopes SET revision=revision+1,next_attempt=0,attempts=0,last_error=NULL WHERE OLD.scope_key='ACADEMY' OR activity_key=OLD.scope_key OR NEW.scope_key='ACADEMY' OR activity_key=NEW.scope_key; END;

CREATE TRIGGER website_platform_schedule_academy_calendar_suppressions_delete AFTER DELETE ON academy_calendar_suppressions
 WHEN (SELECT enabled FROM website_platform_control WHERE singleton=1)=1
 BEGIN UPDATE website_platform_timetable_scopes SET revision=revision+1,next_attempt=0,attempts=0,last_error=NULL WHERE 1; END;

CREATE TRIGGER website_platform_schedule_academy_calendar_suppressions_insert AFTER INSERT ON academy_calendar_suppressions
 WHEN (SELECT enabled FROM website_platform_control WHERE singleton=1)=1
 BEGIN UPDATE website_platform_timetable_scopes SET revision=revision+1,next_attempt=0,attempts=0,last_error=NULL WHERE 1; END;

CREATE TRIGGER website_platform_schedule_academy_calendar_suppressions_update AFTER UPDATE ON academy_calendar_suppressions
 WHEN (SELECT enabled FROM website_platform_control WHERE singleton=1)=1
 BEGIN UPDATE website_platform_timetable_scopes SET revision=revision+1,next_attempt=0,attempts=0,last_error=NULL WHERE 1; END;

CREATE TRIGGER website_platform_schedule_academy_settings_delete AFTER DELETE ON academy_settings
 WHEN (SELECT enabled FROM website_platform_control WHERE singleton=1)=1
 BEGIN UPDATE website_platform_timetable_scopes SET revision=revision+1,next_attempt=0,attempts=0,last_error=NULL WHERE OLD.setting_key='ProgramZoom:'||upper(activity_key) OR OLD.setting_key LIKE 'AcademyHolidayAnnual:%' OR OLD.setting_key LIKE 'AcademyHijriAnnual:%' OR OLD.setting_key='PlatformTimezone'; END;

CREATE TRIGGER website_platform_schedule_academy_settings_insert AFTER INSERT ON academy_settings
 WHEN (SELECT enabled FROM website_platform_control WHERE singleton=1)=1
 BEGIN UPDATE website_platform_timetable_scopes SET revision=revision+1,next_attempt=0,attempts=0,last_error=NULL WHERE NEW.setting_key='ProgramZoom:'||upper(activity_key) OR NEW.setting_key LIKE 'AcademyHolidayAnnual:%' OR NEW.setting_key LIKE 'AcademyHijriAnnual:%' OR NEW.setting_key='PlatformTimezone'; END;

CREATE TRIGGER website_platform_schedule_academy_settings_update AFTER UPDATE ON academy_settings
 WHEN (SELECT enabled FROM website_platform_control WHERE singleton=1)=1
 BEGIN UPDATE website_platform_timetable_scopes SET revision=revision+1,next_attempt=0,attempts=0,last_error=NULL WHERE OLD.setting_key='ProgramZoom:'||upper(activity_key) OR OLD.setting_key LIKE 'AcademyHolidayAnnual:%' OR OLD.setting_key LIKE 'AcademyHijriAnnual:%' OR OLD.setting_key='PlatformTimezone' OR NEW.setting_key='ProgramZoom:'||upper(activity_key) OR NEW.setting_key LIKE 'AcademyHolidayAnnual:%' OR NEW.setting_key LIKE 'AcademyHijriAnnual:%' OR NEW.setting_key='PlatformTimezone'; END;

CREATE TRIGGER website_platform_schedule_activation AFTER UPDATE OF enabled ON website_platform_control
WHEN NEW.enabled=1 AND OLD.enabled=0
BEGIN UPDATE website_platform_timetable_scopes SET revision=revision+1,next_attempt=0,attempts=0,last_error=NULL; END;

CREATE TRIGGER website_platform_schedule_activities_delete AFTER DELETE ON activities
 WHEN (SELECT enabled FROM website_platform_control WHERE singleton=1)=1
 BEGIN UPDATE website_platform_timetable_scopes SET revision=revision+1,next_attempt=0,attempts=0,last_error=NULL WHERE activity_key=OLD.activity_key; END;

CREATE TRIGGER website_platform_schedule_activities_insert AFTER INSERT ON activities
 WHEN (SELECT enabled FROM website_platform_control WHERE singleton=1)=1
 BEGIN UPDATE website_platform_timetable_scopes SET revision=revision+1,next_attempt=0,attempts=0,last_error=NULL WHERE activity_key=NEW.activity_key; END;

CREATE TRIGGER website_platform_schedule_activities_update AFTER UPDATE ON activities
 WHEN (SELECT enabled FROM website_platform_control WHERE singleton=1)=1
 BEGIN UPDATE website_platform_timetable_scopes SET revision=revision+1,next_attempt=0,attempts=0,last_error=NULL WHERE activity_key=OLD.activity_key OR activity_key=NEW.activity_key; END;

CREATE TRIGGER website_platform_schedule_classes_delete AFTER DELETE ON classes
 WHEN (SELECT enabled FROM website_platform_control WHERE singleton=1)=1
 BEGIN UPDATE website_platform_timetable_scopes SET revision=revision+1,next_attempt=0,attempts=0,last_error=NULL WHERE activity_key=OLD.activity_key; END;

CREATE TRIGGER website_platform_schedule_classes_insert AFTER INSERT ON classes
 WHEN (SELECT enabled FROM website_platform_control WHERE singleton=1)=1
 BEGIN UPDATE website_platform_timetable_scopes SET revision=revision+1,next_attempt=0,attempts=0,last_error=NULL WHERE activity_key=NEW.activity_key; END;

CREATE TRIGGER website_platform_schedule_classes_update AFTER UPDATE ON classes
 WHEN (SELECT enabled FROM website_platform_control WHERE singleton=1)=1
 BEGIN UPDATE website_platform_timetable_scopes SET revision=revision+1,next_attempt=0,attempts=0,last_error=NULL WHERE activity_key=OLD.activity_key OR activity_key=NEW.activity_key; END;

CREATE TRIGGER website_platform_schedule_course_run_state_delete AFTER DELETE ON course_run_state
 WHEN (SELECT enabled FROM website_platform_control WHERE singleton=1)=1
 BEGIN UPDATE website_platform_timetable_scopes SET revision=revision+1,next_attempt=0,attempts=0,last_error=NULL WHERE activity_key=OLD.activity_key; END;

CREATE TRIGGER website_platform_schedule_course_run_state_insert AFTER INSERT ON course_run_state
 WHEN (SELECT enabled FROM website_platform_control WHERE singleton=1)=1
 BEGIN UPDATE website_platform_timetable_scopes SET revision=revision+1,next_attempt=0,attempts=0,last_error=NULL WHERE activity_key=NEW.activity_key; END;

CREATE TRIGGER website_platform_schedule_course_run_state_update AFTER UPDATE ON course_run_state
 WHEN (SELECT enabled FROM website_platform_control WHERE singleton=1)=1
 BEGIN UPDATE website_platform_timetable_scopes SET revision=revision+1,next_attempt=0,attempts=0,last_error=NULL WHERE activity_key=OLD.activity_key OR activity_key=NEW.activity_key; END;

CREATE TRIGGER website_platform_schedule_course_runs_delete AFTER DELETE ON course_runs
 WHEN (SELECT enabled FROM website_platform_control WHERE singleton=1)=1
 BEGIN UPDATE website_platform_timetable_scopes SET revision=revision+1,next_attempt=0,attempts=0,last_error=NULL WHERE activity_key=OLD.activity_key; END;

CREATE TRIGGER website_platform_schedule_course_runs_insert AFTER INSERT ON course_runs
 WHEN (SELECT enabled FROM website_platform_control WHERE singleton=1)=1
 BEGIN UPDATE website_platform_timetable_scopes SET revision=revision+1,next_attempt=0,attempts=0,last_error=NULL WHERE activity_key=NEW.activity_key; END;

CREATE TRIGGER website_platform_schedule_course_runs_update AFTER UPDATE ON course_runs
 WHEN (SELECT enabled FROM website_platform_control WHERE singleton=1)=1
 BEGIN UPDATE website_platform_timetable_scopes SET revision=revision+1,next_attempt=0,attempts=0,last_error=NULL WHERE activity_key=OLD.activity_key OR activity_key=NEW.activity_key; END;

CREATE TRIGGER website_platform_schedule_lesson_lifecycle_delete AFTER DELETE ON lesson_lifecycle
 WHEN (SELECT enabled FROM website_platform_control WHERE singleton=1)=1
 BEGIN UPDATE website_platform_timetable_scopes SET revision=revision+1,next_attempt=0,attempts=0,last_error=NULL WHERE activity_key=OLD.activity_key; END;

CREATE TRIGGER website_platform_schedule_lesson_lifecycle_insert AFTER INSERT ON lesson_lifecycle
 WHEN (SELECT enabled FROM website_platform_control WHERE singleton=1)=1
 BEGIN UPDATE website_platform_timetable_scopes SET revision=revision+1,next_attempt=0,attempts=0,last_error=NULL WHERE activity_key=NEW.activity_key; END;

CREATE TRIGGER website_platform_schedule_lesson_lifecycle_update AFTER UPDATE ON lesson_lifecycle
 WHEN (SELECT enabled FROM website_platform_control WHERE singleton=1)=1
 BEGIN UPDATE website_platform_timetable_scopes SET revision=revision+1,next_attempt=0,attempts=0,last_error=NULL WHERE activity_key=OLD.activity_key OR activity_key=NEW.activity_key; END;

CREATE TRIGGER website_platform_schedule_program_publication_lifecycle_delete AFTER DELETE ON program_publication_lifecycle
 WHEN (SELECT enabled FROM website_platform_control WHERE singleton=1)=1
 BEGIN UPDATE website_platform_timetable_scopes SET revision=revision+1,next_attempt=0,attempts=0,last_error=NULL WHERE activity_key=OLD.activity_key; END;

CREATE TRIGGER website_platform_schedule_program_publication_lifecycle_insert AFTER INSERT ON program_publication_lifecycle
 WHEN (SELECT enabled FROM website_platform_control WHERE singleton=1)=1
 BEGIN UPDATE website_platform_timetable_scopes SET revision=revision+1,next_attempt=0,attempts=0,last_error=NULL WHERE activity_key=NEW.activity_key; END;

CREATE TRIGGER website_platform_schedule_program_publication_lifecycle_update AFTER UPDATE ON program_publication_lifecycle
 WHEN (SELECT enabled FROM website_platform_control WHERE singleton=1)=1
 BEGIN UPDATE website_platform_timetable_scopes SET revision=revision+1,next_attempt=0,attempts=0,last_error=NULL WHERE activity_key=OLD.activity_key OR activity_key=NEW.activity_key; END;

CREATE TRIGGER website_platform_schedule_timetable_publications_delete AFTER DELETE ON timetable_publications
 WHEN (SELECT enabled FROM website_platform_control WHERE singleton=1)=1
 BEGIN UPDATE website_platform_timetable_scopes SET revision=revision+1,next_attempt=0,attempts=0,last_error=NULL WHERE activity_key=OLD.activity_key; END;

CREATE TRIGGER website_platform_schedule_timetable_publications_insert AFTER INSERT ON timetable_publications
 WHEN (SELECT enabled FROM website_platform_control WHERE singleton=1)=1
 BEGIN UPDATE website_platform_timetable_scopes SET revision=revision+1,next_attempt=0,attempts=0,last_error=NULL WHERE activity_key=NEW.activity_key; END;

CREATE TRIGGER website_platform_schedule_timetable_publications_update AFTER UPDATE ON timetable_publications
 WHEN (SELECT enabled FROM website_platform_control WHERE singleton=1)=1
 BEGIN UPDATE website_platform_timetable_scopes SET revision=revision+1,next_attempt=0,attempts=0,last_error=NULL WHERE activity_key=OLD.activity_key OR activity_key=NEW.activity_key; END;

CREATE TRIGGER website_platform_session_revoke AFTER UPDATE OF revoked_at ON account_sessions
 WHEN NEW.revoked_at IS NOT NULL AND OLD.revoked_at IS NULL AND (SELECT enabled FROM website_platform_control WHERE singleton=1)=1 BEGIN
 INSERT INTO website_platform_streams SELECT 'session:'||source_ref,1 FROM website_platform_sessions WHERE session_id=NEW.session_id ON CONFLICT(stream) DO UPDATE SET version=version+1;
 INSERT INTO website_platform_outbox(operation_id,stream,version,event_json)
 SELECT lower(hex(randomblob(16))),'session:'||b.source_ref,v.version,json_object('type','session-revoked','sourceRef',b.source_ref)
 FROM website_platform_sessions b JOIN website_platform_streams v ON v.stream='session:'||b.source_ref WHERE b.session_id=NEW.session_id;
 END;

CREATE TRIGGER website_platform_website_platform_admissions_delete AFTER DELETE ON website_platform_admissions WHEN (SELECT enabled FROM website_platform_control WHERE singleton=1)=1 BEGIN
 INSERT INTO website_platform_streams VALUES('account:'||OLD.account_id,1) ON CONFLICT(stream) DO UPDATE SET version=version+1;
 INSERT INTO website_platform_outbox(operation_id,stream,version,event_json)
 SELECT lower(hex(randomblob(16))),'account:'||a.account_id,v.version,
 json_object('type','account','account',json_object('accountId',a.account_id,'displayName',a.display_name,'active',json(CASE a.active WHEN 1 THEN 'true' ELSE 'false' END),'admitted',json(CASE a.admitted WHEN 1 THEN 'true' ELSE 'false' END),'epoch',a.epoch,'globalAdmin',json(CASE a.global_admin WHEN 1 THEN 'true' ELSE 'false' END),'verifiedAt',CAST(strftime('%s','now') AS INTEGER)*1000+CAST(substr(strftime('%f','now'),4,3) AS INTEGER)))
 FROM website_platform_account_state a JOIN website_platform_streams v ON v.stream='account:'||a.account_id WHERE a.account_id=OLD.account_id;
 INSERT INTO academy_settings(setting_key,setting_value,updated_at) VALUES('AcademySnapshot:authority:'||upper(OLD.account_id),'1',strftime('%Y-%m-%dT%H:%M:%fZ','now')) ON CONFLICT(setting_key) DO UPDATE SET setting_value=CAST(setting_value AS INTEGER)+1;
 END;

CREATE TRIGGER website_platform_website_platform_admissions_insert AFTER INSERT ON website_platform_admissions WHEN (SELECT enabled FROM website_platform_control WHERE singleton=1)=1 BEGIN
 INSERT INTO website_platform_streams VALUES('account:'||NEW.account_id,1) ON CONFLICT(stream) DO UPDATE SET version=version+1;
 INSERT INTO website_platform_outbox(operation_id,stream,version,event_json)
 SELECT lower(hex(randomblob(16))),'account:'||a.account_id,v.version,
 json_object('type','account','account',json_object('accountId',a.account_id,'displayName',a.display_name,'active',json(CASE a.active WHEN 1 THEN 'true' ELSE 'false' END),'admitted',json(CASE a.admitted WHEN 1 THEN 'true' ELSE 'false' END),'epoch',a.epoch,'globalAdmin',json(CASE a.global_admin WHEN 1 THEN 'true' ELSE 'false' END),'verifiedAt',CAST(strftime('%s','now') AS INTEGER)*1000+CAST(substr(strftime('%f','now'),4,3) AS INTEGER)))
 FROM website_platform_account_state a JOIN website_platform_streams v ON v.stream='account:'||a.account_id WHERE a.account_id=NEW.account_id;
 INSERT INTO academy_settings(setting_key,setting_value,updated_at) VALUES('AcademySnapshot:authority:'||upper(NEW.account_id),'1',strftime('%Y-%m-%dT%H:%M:%fZ','now')) ON CONFLICT(setting_key) DO UPDATE SET setting_value=CAST(setting_value AS INTEGER)+1;
 END;

CREATE TRIGGER website_platform_website_platform_admissions_update AFTER UPDATE OF active ON website_platform_admissions WHEN (SELECT enabled FROM website_platform_control WHERE singleton=1)=1 BEGIN
 INSERT INTO website_platform_streams VALUES('account:'||NEW.account_id,1) ON CONFLICT(stream) DO UPDATE SET version=version+1;
 INSERT INTO website_platform_outbox(operation_id,stream,version,event_json)
 SELECT lower(hex(randomblob(16))),'account:'||a.account_id,v.version,
 json_object('type','account','account',json_object('accountId',a.account_id,'displayName',a.display_name,'active',json(CASE a.active WHEN 1 THEN 'true' ELSE 'false' END),'admitted',json(CASE a.admitted WHEN 1 THEN 'true' ELSE 'false' END),'epoch',a.epoch,'globalAdmin',json(CASE a.global_admin WHEN 1 THEN 'true' ELSE 'false' END),'verifiedAt',CAST(strftime('%s','now') AS INTEGER)*1000+CAST(substr(strftime('%f','now'),4,3) AS INTEGER)))
 FROM website_platform_account_state a JOIN website_platform_streams v ON v.stream='account:'||a.account_id WHERE a.account_id=NEW.account_id;
 INSERT INTO academy_settings(setting_key,setting_value,updated_at) VALUES('AcademySnapshot:authority:'||upper(NEW.account_id),'1',strftime('%Y-%m-%dT%H:%M:%fZ','now')) ON CONFLICT(setting_key) DO UPDATE SET setting_value=CAST(setting_value AS INTEGER)+1;
 END;

CREATE TRIGGER website_programme_policy_update AFTER UPDATE ON website_platform_programmes BEGIN
 INSERT INTO website_platform_access_dirty(activity_key,account_id) SELECT NEW.activity_key,'' WHERE EXISTS(SELECT 1 FROM website_platform_access_scopes WHERE activity_key=NEW.activity_key AND enabled=1) ON CONFLICT(activity_key,account_id) DO UPDATE SET revision=revision+1,next_attempt=0,last_error=NULL;
END;

CREATE TRIGGER website_studio_assets_epoch_insert AFTER INSERT ON website_studio_assets BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER website_studio_assets_fence_insert BEFORE INSERT ON website_studio_assets WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER website_studio_epoch_insert AFTER INSERT ON website_studio_state BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER website_studio_epoch_update AFTER UPDATE ON website_studio_state BEGIN UPDATE split_read_state SET version=version+1 WHERE singleton=1; END;

CREATE TRIGGER website_studio_fence_insert BEFORE INSERT ON website_studio_state WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;

CREATE TRIGGER website_studio_fence_update BEFORE UPDATE ON website_studio_state WHEN EXISTS(SELECT 1 FROM split_write_fence WHERE singleton=1 AND allow_write=0) BEGIN SELECT RAISE(ABORT,'split_write_busy'); END;
