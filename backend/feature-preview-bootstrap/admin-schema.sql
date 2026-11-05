CREATE TABLE academy_announcements (
 announcement_id TEXT PRIMARY KEY,
 title TEXT NOT NULL,
 message TEXT NOT NULL,
 display_order INTEGER NOT NULL,
 image_key TEXT,
 image_name TEXT,
 image_type TEXT,
 image_bytes INTEGER,
 image_alt TEXT NOT NULL DEFAULT '',
 revision INTEGER NOT NULL CHECK(revision>0),
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 updated_by TEXT NOT NULL COLLATE NOCASE REFERENCES identity_refs(account_id),
 deleted_at TEXT);

CREATE TABLE academy_calendar_events (
 event_id TEXT PRIMARY KEY COLLATE NOCASE NOT NULL,
 event_type TEXT NOT NULL CHECK(event_type IN ('TERM','ISLAMIC_DAY','PUBLIC_HOLIDAY')),
 description TEXT NOT NULL CHECK(length(trim(description)) BETWEEN 1 AND 400),
 start_date TEXT NOT NULL,
 end_date TEXT NOT NULL CHECK(end_date>=start_date),
 alternate_date TEXT,
 teaching_impact TEXT NOT NULL CHECK(teaching_impact IN ('INFORMATION','NO_TEACHING')),
 scope_key TEXT COLLATE NOCASE NOT NULL DEFAULT 'ACADEMY',
 calendar_kind TEXT NOT NULL DEFAULT 'REFERENCE'
 CHECK(calendar_kind IN ('REFERENCE','TERM','ACADEMY_HOLIDAY','PUBLIC_HOLIDAY')),
 revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0));

CREATE TABLE academy_calendar_suppressions (
 calendar_date TEXT PRIMARY KEY NOT NULL);

CREATE TABLE academy_enrolment_catalogue (
 entry_id TEXT PRIMARY KEY NOT NULL,
 activity_key TEXT COLLATE NOCASE NOT NULL REFERENCES activities(activity_key),
 enrolment_year INTEGER NOT NULL CHECK(enrolment_year BETWEEN 1900 AND 2200),
 cost_text TEXT NOT NULL CHECK(length(cost_text) BETWEEN 1 AND 500),
 display_order INTEGER NOT NULL DEFAULT 0 CHECK(display_order BETWEEN 0 AND 10000),
 revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>=1),
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 updated_by_account_id TEXT COLLATE NOCASE REFERENCES identity_refs(account_id),
 UNIQUE(activity_key,enrolment_year));

CREATE TABLE academy_module_catalogue (
 module_id TEXT PRIMARY KEY COLLATE NOCASE NOT NULL,
 subject_key TEXT COLLATE NOCASE REFERENCES subject_catalog(subject_key),
 name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 160),
 name_key TEXT NOT NULL,
 revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>=1));

CREATE TABLE academy_module_usage (
 activity_key TEXT COLLATE NOCASE NOT NULL,
 module_id TEXT COLLATE NOCASE NOT NULL,
 academy_module_id TEXT COLLATE NOCASE NOT NULL REFERENCES academy_module_catalogue(module_id),
 PRIMARY KEY(activity_key,module_id),
 FOREIGN KEY(activity_key,module_id) REFERENCES modules(activity_key,module_id));

CREATE TABLE academy_settings (
 setting_key TEXT PRIMARY KEY NOT NULL,
 setting_value TEXT NOT NULL,
 updated_at TEXT,
 updated_by_account_id TEXT COLLATE NOCASE REFERENCES identity_refs(account_id));

CREATE TABLE activities (
 activity_key TEXT PRIMARY KEY COLLATE NOCASE NOT NULL,
 name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 160));

CREATE TABLE assessment_phases (
 phase_id TEXT PRIMARY KEY,
 activity_key TEXT NOT NULL REFERENCES activities(activity_key),
 name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 160),
 name_normalised TEXT NOT NULL,
 created_at TEXT NOT NULL,
 created_by TEXT NOT NULL REFERENCES identity_refs(account_id),
 UNIQUE(activity_key,name_normalised));

CREATE TABLE assessment_register_areas (
 register_id TEXT NOT NULL REFERENCES assessment_registers(register_id),
 activity_key TEXT NOT NULL REFERENCES activities(activity_key),
 PRIMARY KEY(register_id,activity_key));

CREATE TABLE assessment_registers (
 register_id TEXT PRIMARY KEY,
 name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 160),
 class_mode TEXT NOT NULL CHECK(class_mode IN('ONE','ALL')),
 class_activity_key TEXT REFERENCES activities(activity_key),
 class_id TEXT,
 legacy_phase_id TEXT UNIQUE REFERENCES assessment_phases(phase_id),
 created_at TEXT NOT NULL,
 created_by TEXT NOT NULL REFERENCES identity_refs(account_id),
 CHECK((class_mode='ALL' AND class_activity_key IS NULL AND class_id IS NULL) OR (class_mode='ONE' AND class_activity_key IS NOT NULL AND class_id IS NOT NULL)),
 FOREIGN KEY(class_activity_key,class_id) REFERENCES classes(activity_key,class_id));

CREATE TABLE assessment_report_templates (
 template_id TEXT PRIMARY KEY,
 activity_key TEXT NOT NULL REFERENCES activities(activity_key),
 name TEXT NOT NULL,
 file_id TEXT REFERENCES file_refs(file_id),
 layout_json TEXT NOT NULL,
 revision INTEGER NOT NULL DEFAULT 1,
 updated_at TEXT NOT NULL,
 updated_by TEXT NOT NULL REFERENCES identity_refs(account_id));

CREATE TABLE "assessments" (
 assessment_id TEXT PRIMARY KEY,
 activity_key TEXT NOT NULL REFERENCES activities(activity_key),
 class_id TEXT NOT NULL,
 title TEXT NOT NULL,
 subject TEXT NOT NULL,
 exam_date TEXT,
 duration_minutes INTEGER CHECK(duration_minutes IS NULL OR duration_minutes BETWEEN 1 AND 1440),
 maximum_mark REAL NOT NULL CHECK(maximum_mark>0),
 phase_id TEXT REFERENCES assessment_phases(phase_id),
 subject_descriptor TEXT NOT NULL DEFAULT '',
 register_id TEXT REFERENCES assessment_registers(register_id),
 assessment_kind TEXT NOT NULL DEFAULT 'EXAM' CHECK(assessment_kind IN('EXAM','ASSIGNMENT')),
 timing_mode TEXT NOT NULL DEFAULT 'TIMED' CHECK(timing_mode IN('TIMED','UNTIMED')),
 timezone TEXT NOT NULL DEFAULT 'Africa/Johannesburg',
 available_from TEXT,
 due_at TEXT,
 exam_cutoff TEXT,
 allowance_minutes INTEGER DEFAULT 15 CHECK(allowance_minutes IS NULL OR allowance_minutes BETWEEN 0 AND 1440),
 FOREIGN KEY(activity_key,class_id) REFERENCES classes(activity_key,class_id),
 CHECK((timing_mode='UNTIMED' AND duration_minutes IS NULL AND allowance_minutes IS NULL) OR (timing_mode='TIMED' AND duration_minutes IS NOT NULL AND allowance_minutes IS NOT NULL)),
 CHECK((assessment_kind='EXAM' AND exam_date IS NOT NULL) OR assessment_kind='ASSIGNMENT'));

CREATE TABLE audit_events (
 event_id TEXT PRIMARY KEY NOT NULL,
 occurred_at TEXT NOT NULL,
 actor_account_id TEXT COLLATE NOCASE REFERENCES identity_refs(account_id),
 actor_source_id TEXT,
 actor_name_snapshot TEXT,
 authority TEXT,
 scope_key TEXT,
 action TEXT NOT NULL,
 record_kind TEXT NOT NULL,
 record_id TEXT NOT NULL,
 changed_fields_json TEXT NOT NULL CHECK (json_valid(changed_fields_json)));

CREATE TABLE class_module_progress (
 activity_key TEXT COLLATE NOCASE NOT NULL,
 progress_id TEXT COLLATE NOCASE NOT NULL,
 class_id TEXT COLLATE NOCASE NOT NULL,
 module_id TEXT COLLATE NOCASE NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('ACTIVE','INACTIVE','COMPLETED')),
 PRIMARY KEY(activity_key, progress_id),
 UNIQUE(activity_key, class_id, module_id),
 FOREIGN KEY(activity_key, class_id) REFERENCES classes(activity_key, class_id),
 FOREIGN KEY(activity_key, module_id) REFERENCES modules(activity_key, module_id));

CREATE TABLE classes (
 activity_key TEXT COLLATE NOCASE NOT NULL REFERENCES program_settings(activity_key),
 class_id TEXT COLLATE NOCASE NOT NULL,
 name TEXT NOT NULL,
 academic_year TEXT,
 zoom_link TEXT,
 PRIMARY KEY(activity_key, class_id));

CREATE TABLE course_draft_lifecycle (
 activity_key TEXT COLLATE NOCASE NOT NULL,
 run_id TEXT COLLATE NOCASE NOT NULL,
 session_id TEXT COLLATE NOCASE NOT NULL,
 lifecycle_id TEXT UNIQUE COLLATE NOCASE NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('SCHEDULED','CANCELLED','RESCHEDULED')),
 previous_session_id TEXT,
 replacement_session_id TEXT,
 PRIMARY KEY(activity_key,run_id,session_id),
 FOREIGN KEY(activity_key,run_id,session_id) REFERENCES course_draft_sessions(activity_key,run_id,session_id));

CREATE TABLE course_draft_sessions (
 activity_key TEXT COLLATE NOCASE NOT NULL,
 run_id TEXT COLLATE NOCASE NOT NULL,
 session_id TEXT COLLATE NOCASE NOT NULL,
 module_id TEXT COLLATE NOCASE,
 teacher_account_id TEXT COLLATE NOCASE REFERENCES identity_refs(account_id),
 session_date TEXT NOT NULL,
 start_time TEXT NOT NULL,
 end_time TEXT NOT NULL,
 session_kind TEXT NOT NULL,
 zoom_link TEXT,
 schedule_rule_key TEXT,
 occurrence_date TEXT,
 description TEXT,
 PRIMARY KEY(activity_key, run_id, session_id),
 FOREIGN KEY(activity_key, run_id) REFERENCES course_runs(activity_key, run_id),
 FOREIGN KEY(activity_key, module_id) REFERENCES modules(activity_key, module_id));

CREATE TABLE course_management_drafts (
 activity_key TEXT COLLATE NOCASE NOT NULL,
 run_id TEXT COLLATE NOCASE NOT NULL,
 details_json TEXT NOT NULL CHECK(json_valid(details_json)),
 stage TEXT NOT NULL CHECK(stage IN ('DRAFT','PUBLISHED','COMPLETE','CANCELLED','ARCHIVED')),
 completed_at TEXT,
 repeated_from_activity_key TEXT COLLATE NOCASE,
 validation_sha256 TEXT CHECK(validation_sha256 IS NULL OR length(validation_sha256)=64),
 revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>=1),
 updated_at TEXT NOT NULL,
 updated_by_account_id TEXT COLLATE NOCASE NOT NULL REFERENCES identity_refs(account_id),
 schedule_sha256 TEXT
  CHECK(schedule_sha256 IS NULL OR length(schedule_sha256)=64),
 accepted_sha256 TEXT
  CHECK(accepted_sha256 IS NULL OR length(accepted_sha256)=64),
 PRIMARY KEY(activity_key,run_id));

CREATE TABLE course_resources (
 activity_key TEXT COLLATE NOCASE NOT NULL,
 resource_id TEXT COLLATE NOCASE NOT NULL,
 module_id TEXT COLLATE NOCASE,
 task_id TEXT COLLATE NOCASE,
 name TEXT NOT NULL,
 resource_type TEXT,
 resource_format TEXT,
 description TEXT,
 resource_link TEXT,
 PRIMARY KEY(activity_key, resource_id),
 FOREIGN KEY(activity_key, module_id) REFERENCES modules(activity_key, module_id),
 FOREIGN KEY(activity_key, task_id) REFERENCES tasks(activity_key, task_id));

CREATE TABLE course_runs (
 activity_key TEXT COLLATE NOCASE NOT NULL,
 run_id TEXT COLLATE NOCASE NOT NULL,
 name TEXT NOT NULL,
 timezone TEXT NOT NULL,
 start_date TEXT,
 end_date TEXT,
 schedule_mode TEXT,
 schedule_definition TEXT,
 PRIMARY KEY(activity_key, run_id));

CREATE TABLE course_website_assets(
 asset_id TEXT PRIMARY KEY,
 activity_key TEXT NOT NULL COLLATE NOCASE REFERENCES activities(activity_key),
 object_key TEXT NOT NULL UNIQUE,
 filename TEXT NOT NULL,
 mime_type TEXT NOT NULL CHECK(mime_type IS NULL OR mime_type IN('application/pdf','image/png','image/jpeg','image/webp')),
 byte_size INTEGER NOT NULL CHECK(byte_size IS NULL OR byte_size BETWEEN 1 AND 16777216),
 sha256 TEXT NOT NULL,
 created_at TEXT NOT NULL,
 created_by TEXT NOT NULL REFERENCES identity_refs(account_id));

CREATE TABLE course_website_documents(
 activity_key TEXT PRIMARY KEY COLLATE NOCASE REFERENCES activities(activity_key),
 document_json TEXT NOT NULL CHECK(document_json IS NULL OR json_valid(document_json)),
 schema_version INTEGER NOT NULL DEFAULT 1,
 source_kind TEXT NOT NULL DEFAULT 'TEMPLATE' CHECK(source_kind IS NULL OR source_kind IN('TEMPLATE','KAHF')),
 revision INTEGER NOT NULL DEFAULT 1,
 updated_at TEXT NOT NULL,
 updated_by TEXT NOT NULL REFERENCES identity_refs(account_id));

CREATE TABLE file_refs(file_id TEXT PRIMARY KEY);

CREATE TABLE identity_refs(account_id TEXT PRIMARY KEY COLLATE NOCASE);

CREATE TABLE "lesson_media_assets" (
 asset_id TEXT PRIMARY KEY,
 activity_key TEXT NOT NULL REFERENCES activities(activity_key),
 kind TEXT NOT NULL CHECK(kind IN('YOUTUBE','PDF','MP4')),
 youtube_id TEXT,
 object_key TEXT UNIQUE,
 filename TEXT NOT NULL DEFAULT '',
 byte_size INTEGER,
 created_at TEXT NOT NULL,
 display_name TEXT NOT NULL DEFAULT '',
 CHECK((kind='YOUTUBE' AND youtube_id IS NOT NULL AND object_key IS NULL) OR (kind IN('PDF','MP4') AND youtube_id IS NULL AND object_key IS NOT NULL)));

CREATE TABLE "lesson_media_lessons" (
 lesson_id TEXT PRIMARY KEY,
 activity_key TEXT NOT NULL REFERENCES activities(activity_key),
 class_id TEXT,
 lesson_date TEXT NOT NULL,
 title TEXT NOT NULL,
 start_time TEXT NOT NULL,
 end_time TEXT NOT NULL,
 teacher_id TEXT REFERENCES identity_refs(account_id),
 teacher_name TEXT NOT NULL,
 summary TEXT NOT NULL DEFAULT '',
 state TEXT NOT NULL CHECK(state IN('DRAFT','PUBLISHED','HIDDEN')),
 comments_closed INTEGER NOT NULL DEFAULT 0 CHECK(comments_closed IN(0,1)),
 source_publication_id TEXT,
 source_lessons_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(source_lessons_json)),
 session_key TEXT,
 run_id TEXT NOT NULL DEFAULT '',
 teacher_ids_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(teacher_ids_json)),
 media_scope TEXT NOT NULL DEFAULT 'SESSION' CHECK(media_scope IN('SESSION','COURSE')),
 FOREIGN KEY(activity_key,class_id) REFERENCES classes(activity_key,class_id));

CREATE TABLE lesson_media_links (
 lesson_id TEXT NOT NULL REFERENCES lesson_media_lessons(lesson_id),
 asset_id TEXT NOT NULL REFERENCES lesson_media_assets(asset_id),
 PRIMARY KEY(lesson_id,asset_id));

CREATE TABLE lesson_plan_policies (
 activity_key TEXT PRIMARY KEY COLLATE NOCASE REFERENCES activities(activity_key),
 weekly_day INTEGER NOT NULL CHECK(weekly_day BETWEEN 0 AND 6),
 weekly_time TEXT NOT NULL,
 course_lead_days INTEGER NOT NULL CHECK(course_lead_days BETWEEN 0 AND 90),
 revision INTEGER NOT NULL CHECK(revision>0),
 updated_at TEXT NOT NULL,
 updated_by TEXT COLLATE NOCASE NOT NULL REFERENCES identity_refs(account_id));

CREATE TABLE lesson_plan_requirements (
 activity_key TEXT PRIMARY KEY COLLATE NOCASE REFERENCES activities(activity_key),
 plans_required INTEGER NOT NULL DEFAULT 1 CHECK(plans_required IN (0,1)));

CREATE TABLE management_revisions (
 activity_key TEXT PRIMARY KEY COLLATE NOCASE NOT NULL REFERENCES program_settings(activity_key),
 source_revision TEXT,
 source_sequence INTEGER NOT NULL CHECK(source_sequence >= 0),
 source_snapshot_sha256 TEXT NOT NULL CHECK(length(source_snapshot_sha256) = 64),
 modified_at TEXT,
 modified_by_source_id TEXT);

CREATE TABLE memorisation_activity_settings (
 activity_key TEXT PRIMARY KEY COLLATE NOCASE NOT NULL REFERENCES activities(activity_key),
 learners_per_card INTEGER NOT NULL DEFAULT 20 CHECK(learners_per_card BETWEEN 5 AND 50));

CREATE TABLE memorisation_set_activities (
 set_id TEXT COLLATE NOCASE NOT NULL REFERENCES memorisation_sets(set_id),
 activity_key TEXT COLLATE NOCASE NOT NULL REFERENCES activities(activity_key),
 PRIMARY KEY(set_id,activity_key));

CREATE TABLE memorisation_sets (
 set_id TEXT PRIMARY KEY COLLATE NOCASE NOT NULL,
 name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 160),
 name_key TEXT NOT NULL,
 subject TEXT NOT NULL CHECK(subject IN ('SURAHS','DUAS')),
 level TEXT NOT NULL CHECK(length(trim(level)) BETWEEN 1 AND 60),
 sort_order INTEGER NOT NULL,
 revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>=1),
 UNIQUE(subject,name_key));

CREATE TABLE "memorisation_tasks" (
 task_id TEXT PRIMARY KEY COLLATE NOCASE NOT NULL,
 module_id TEXT COLLATE NOCASE NOT NULL REFERENCES memorisation_sets(set_id),
 name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 240),
 sort_order INTEGER NOT NULL,
 UNIQUE(module_id,name));

CREATE TABLE modules (
 activity_key TEXT COLLATE NOCASE NOT NULL REFERENCES activities(activity_key),
 module_id TEXT COLLATE NOCASE NOT NULL,
 program_subject_id TEXT COLLATE NOCASE,
 level_id TEXT COLLATE NOCASE,
 name TEXT NOT NULL,
 sort_order INTEGER NOT NULL,
 PRIMARY KEY(activity_key, module_id),
 FOREIGN KEY(activity_key, program_subject_id) REFERENCES program_subjects(activity_key, program_subject_id),
 FOREIGN KEY(activity_key, level_id, program_subject_id) REFERENCES program_levels(activity_key, level_id, program_subject_id),
 CHECK(level_id IS NULL OR program_subject_id IS NOT NULL));

CREATE TABLE operation_receipts (
 dataset_key TEXT NOT NULL,
 scope_key TEXT NOT NULL,
 operation_id TEXT NOT NULL,
 payload_sha256 TEXT NOT NULL CHECK (length(payload_sha256) = 64),
 result_json TEXT NOT NULL CHECK (json_valid(result_json)),
 actor_account_id TEXT COLLATE NOCASE REFERENCES identity_refs(account_id),
 completed_at TEXT NOT NULL,
 PRIMARY KEY (dataset_key, scope_key, operation_id));

CREATE TABLE program_levels (
 activity_key TEXT COLLATE NOCASE NOT NULL,
 level_id TEXT COLLATE NOCASE NOT NULL,
 program_subject_id TEXT COLLATE NOCASE NOT NULL,
 name TEXT NOT NULL,
 sort_order INTEGER NOT NULL,
 PRIMARY KEY(activity_key, level_id),
 UNIQUE(activity_key, level_id, program_subject_id),
 FOREIGN KEY(activity_key, program_subject_id) REFERENCES program_subjects(activity_key, program_subject_id));

CREATE TABLE program_resources (
 activity_key TEXT COLLATE NOCASE NOT NULL REFERENCES program_settings(activity_key),
 resource_id TEXT COLLATE NOCASE NOT NULL,
 program_subject_id TEXT COLLATE NOCASE,
 level_id TEXT COLLATE NOCASE,
 module_id TEXT COLLATE NOCASE,
 task_id TEXT COLLATE NOCASE,
 resource_type TEXT NOT NULL,
 name TEXT NOT NULL,
 description TEXT,
 drive_file_id TEXT,
 metadata_json TEXT NOT NULL CHECK(json_valid(metadata_json)),
 PRIMARY KEY(activity_key, resource_id),
 FOREIGN KEY(activity_key, program_subject_id) REFERENCES program_subjects(activity_key, program_subject_id),
 FOREIGN KEY(activity_key, level_id) REFERENCES program_levels(activity_key, level_id),
 FOREIGN KEY(activity_key, module_id) REFERENCES modules(activity_key, module_id),
 FOREIGN KEY(activity_key, task_id) REFERENCES tasks(activity_key, task_id));

CREATE TABLE program_settings (
 activity_key TEXT PRIMARY KEY COLLATE NOCASE NOT NULL,
 kind TEXT NOT NULL DEFAULT 'PROGRAM' CHECK (kind = 'PROGRAM'),
 duration_years INTEGER CHECK (duration_years BETWEEN 1 AND 30),
 timezone TEXT NOT NULL CHECK (length(trim(timezone)) > 0),
 revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
 public_card_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(public_card_json)));

CREATE TABLE program_subjects (
 activity_key TEXT COLLATE NOCASE NOT NULL REFERENCES program_settings(activity_key),
 program_subject_id TEXT COLLATE NOCASE NOT NULL,
 subject_key TEXT COLLATE NOCASE NOT NULL REFERENCES subject_catalog(subject_key),
 PRIMARY KEY(activity_key, program_subject_id));

CREATE TABLE program_surah_website_assets(
 asset_id TEXT PRIMARY KEY,
 surah_id TEXT NOT NULL,
 activity_key TEXT NOT NULL COLLATE NOCASE REFERENCES activities(activity_key),
 object_key TEXT NOT NULL UNIQUE,
 filename TEXT NOT NULL,
 mime_type TEXT NOT NULL CHECK(mime_type IS NULL OR mime_type IN('application/pdf','image/png','image/jpeg','image/webp')),
 byte_size INTEGER NOT NULL CHECK(byte_size IS NULL OR byte_size BETWEEN 1 AND 16777216),
 sha256 TEXT NOT NULL,
 created_at TEXT NOT NULL,
 created_by TEXT NOT NULL REFERENCES identity_refs(account_id));

CREATE TABLE program_surah_website_documents(
 surah_id TEXT PRIMARY KEY,
 activity_key TEXT NOT NULL COLLATE NOCASE REFERENCES activities(activity_key),
 document_json TEXT NOT NULL CHECK(document_json IS NULL OR json_valid(document_json)),
 schema_version INTEGER NOT NULL DEFAULT 1,
 source_kind TEXT NOT NULL DEFAULT 'TEMPLATE',
 revision INTEGER NOT NULL DEFAULT 1,
 updated_at TEXT NOT NULL,
 updated_by TEXT NOT NULL REFERENCES identity_refs(account_id));

CREATE TABLE program_timetable_records (
 timetable_id TEXT PRIMARY KEY,
 activity_key TEXT COLLATE NOCASE NOT NULL REFERENCES activities(activity_key),
 draft_json TEXT NOT NULL CHECK(json_valid(draft_json)),
 status TEXT NOT NULL CHECK(status IN ('DRAFT','VALID','PUBLISHED','ARCHIVED','CANCELLED')),
 source_id TEXT,
 publication_id TEXT COLLATE NOCASE,
 validation_hash TEXT,
 updated_at TEXT NOT NULL);

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

CREATE TABLE split_command_parts(command_id TEXT NOT NULL REFERENCES split_commands(command_id),part_index INTEGER NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(command_id,part_index));

CREATE TABLE split_commands(command_id TEXT PRIMARY KEY,phase TEXT NOT NULL CHECK(phase IN('PREPARING','PENDING','APPLIED','COMMITTED','ABORTING','ROLLED_BACK','ABORTED','DONE')),payload_hash TEXT NOT NULL,proof_json TEXT,created_at TEXT NOT NULL,error_code TEXT);

CREATE TABLE split_transaction_guards(guard_id TEXT PRIMARY KEY,accepted INTEGER NOT NULL CHECK(accepted=1));

CREATE TABLE subject_catalog (
 subject_key TEXT PRIMARY KEY COLLATE NOCASE NOT NULL,
 source_namespace TEXT NOT NULL CHECK(source_namespace IN ('ACADEMY','GLOBAL_REFERENCE')),
 subject_id TEXT COLLATE NOCASE NOT NULL,
 name TEXT NOT NULL CHECK(length(trim(name)) > 0),
 UNIQUE(source_namespace, subject_id));

CREATE TABLE tasks (
 activity_key TEXT COLLATE NOCASE NOT NULL REFERENCES activities(activity_key),
 task_id TEXT COLLATE NOCASE NOT NULL,
 program_subject_id TEXT COLLATE NOCASE,
 module_id TEXT COLLATE NOCASE,
 name TEXT NOT NULL,
 sort_order INTEGER NOT NULL,
 PRIMARY KEY(activity_key, task_id),
 FOREIGN KEY(activity_key, program_subject_id) REFERENCES program_subjects(activity_key, program_subject_id),
 FOREIGN KEY(activity_key, module_id) REFERENCES modules(activity_key, module_id));

CREATE TABLE teacher_availability (
 account_id TEXT COLLATE NOCASE PRIMARY KEY REFERENCES identity_refs(account_id),
 ranges_json TEXT NOT NULL CHECK(json_valid(ranges_json)),
 revision INTEGER NOT NULL CHECK(revision>0),
 updated_at TEXT NOT NULL);

CREATE TABLE teacher_availability_changes (
 change_id TEXT PRIMARY KEY,
 account_id TEXT COLLATE NOCASE NOT NULL REFERENCES identity_refs(account_id),
 previous_json TEXT NOT NULL CHECK(json_valid(previous_json)),
 ranges_json TEXT NOT NULL CHECK(json_valid(ranges_json)),
 changed_at TEXT NOT NULL);

CREATE TABLE teacher_availability_notices (
 account_id TEXT COLLATE NOCASE NOT NULL REFERENCES identity_refs(account_id),
 change_id TEXT NOT NULL REFERENCES teacher_availability_changes(change_id),
 PRIMARY KEY(account_id,change_id));

CREATE TABLE timetable_drafts (
 activity_key TEXT COLLATE NOCASE NOT NULL REFERENCES activities(activity_key),
 scope_key TEXT NOT NULL,
 source_revision TEXT,
 source_sequence INTEGER NOT NULL CHECK(source_sequence >= 0),
 draft_json TEXT NOT NULL CHECK(json_valid(draft_json)),
 source_draft_sha256 TEXT NOT NULL CHECK(length(source_draft_sha256) = 64),
 modified_at TEXT,
 PRIMARY KEY(activity_key, scope_key));

CREATE INDEX academy_calendar_scope_dates ON academy_calendar_events(scope_key,start_date,end_date);

CREATE UNIQUE INDEX academy_module_subject_name ON academy_module_catalogue(subject_key,name_key) WHERE subject_key IS NOT NULL;

CREATE UNIQUE INDEX academy_module_unclassified_name ON academy_module_catalogue(name_key) WHERE subject_key IS NULL;

CREATE INDEX academy_module_usage_catalogue ON academy_module_usage(academy_module_id);

CREATE INDEX assessments_class_date ON assessments(activity_key,class_id,exam_date);

CREATE INDEX assessments_phase_date ON assessments(phase_id,exam_date);

CREATE INDEX assessments_register_date ON assessments(register_id,exam_date);

CREATE INDEX audit_by_record ON audit_events(record_kind, record_id, occurred_at);

CREATE INDEX course_management_by_stage ON course_management_drafts(stage,updated_at);

CREATE INDEX course_website_assets_scope ON course_website_assets(activity_key,asset_id);

CREATE INDEX lesson_media_by_program_date ON lesson_media_lessons(activity_key,state,lesson_date,lesson_id);

CREATE INDEX lesson_media_by_run ON lesson_media_lessons(activity_key,run_id,lesson_date,lesson_id);

CREATE UNIQUE INDEX lesson_media_course_pdfs ON lesson_media_lessons(activity_key) WHERE media_scope='COURSE';

CREATE INDEX lesson_media_links_asset ON lesson_media_links(asset_id,lesson_id);

CREATE INDEX lesson_media_retention_created ON lesson_media_assets(kind,created_at,asset_id);

CREATE INDEX lesson_media_retention_hash ON lesson_media_assets(substr(object_key,-68)) WHERE kind='PDF';

CREATE UNIQUE INDEX lesson_media_session_key ON lesson_media_lessons(activity_key,session_key) WHERE session_key IS NOT NULL;

CREATE INDEX memorisation_tasks_module ON memorisation_tasks(module_id,sort_order);

CREATE INDEX program_surah_website_assets_scope ON program_surah_website_assets(surah_id,asset_id);

CREATE INDEX program_timetable_records_by_activity ON program_timetable_records(activity_key,updated_at);

CREATE INDEX setup_components_batch ON setup_components(batch_id,table_name,scope_key);

CREATE TRIGGER assessments_phase_scope_insert BEFORE INSERT ON assessments
 WHEN NEW.phase_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM assessment_phases WHERE phase_id=NEW.phase_id AND activity_key=NEW.activity_key)
 BEGIN SELECT RAISE(ABORT,'assessment_phase_scope'); END;

CREATE TRIGGER assessments_phase_scope_update BEFORE UPDATE OF phase_id,activity_key ON assessments
 WHEN NEW.phase_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM assessment_phases WHERE phase_id=NEW.phase_id AND activity_key=NEW.activity_key)
 BEGIN SELECT RAISE(ABORT,'assessment_phase_scope'); END;

CREATE TRIGGER audit_events_no_delete BEFORE DELETE ON audit_events
BEGIN SELECT RAISE(ABORT, 'Audit history is append-only'); END;

CREATE TRIGGER audit_events_no_update BEFORE UPDATE ON audit_events
BEGIN SELECT RAISE(ABORT, 'Audit history is append-only'); END;

CREATE TRIGGER setup_component_immutable_delete BEFORE DELETE ON setup_components BEGIN SELECT RAISE(ABORT,'accepted_setup_component_immutable'); END;

CREATE TRIGGER setup_component_immutable_update BEFORE UPDATE ON setup_components BEGIN SELECT RAISE(ABORT,'accepted_setup_component_immutable'); END;

CREATE TRIGGER split_transaction_guard_reject BEFORE INSERT ON split_transaction_guards WHEN NEW.accepted<>1 BEGIN SELECT RAISE(ABORT,'split_transaction_state'); END;
