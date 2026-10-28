-- Disabled until the existing website-platform control is explicitly activated.
-- No mappings, people, grants, or production facts are seeded by this migration.
ALTER TABLE website_platform_return_codes ADD COLUMN return_context TEXT;
CREATE TABLE website_platform_timetable_scopes(
 activity_key TEXT PRIMARY KEY COLLATE NOCASE REFERENCES activities(activity_key),
 offering_id TEXT NOT NULL UNIQUE, kind TEXT NOT NULL CHECK(kind IN ('COURSE','TAFSEER','ACADEMY')),
 revision INTEGER NOT NULL DEFAULT 1, exported_revision INTEGER NOT NULL DEFAULT 0,
 next_attempt INTEGER NOT NULL DEFAULT 0, attempts INTEGER NOT NULL DEFAULT 0, last_error TEXT
);
CREATE INDEX website_platform_schedule_due ON website_platform_timetable_scopes(next_attempt,activity_key);
CREATE INDEX website_platform_program_versions ON timetable_publications(activity_key,scope_key,version_no DESC,effective_from);
CREATE INDEX website_platform_lifecycle_publication ON lesson_lifecycle(activity_key,publication_id);
CREATE INDEX website_platform_calendar ON academy_calendar_events(scope_key,teaching_impact,active,start_date);
CREATE TRIGGER website_platform_schedule_timetable_publications_insert AFTER INSERT ON timetable_publications
 WHEN (SELECT enabled FROM website_platform_control WHERE singleton=1)=1
 BEGIN UPDATE website_platform_timetable_scopes SET revision=revision+1,next_attempt=0,attempts=0,last_error=NULL WHERE activity_key=NEW.activity_key; END;
CREATE TRIGGER website_platform_schedule_timetable_publications_update AFTER UPDATE ON timetable_publications
 WHEN (SELECT enabled FROM website_platform_control WHERE singleton=1)=1
 BEGIN UPDATE website_platform_timetable_scopes SET revision=revision+1,next_attempt=0,attempts=0,last_error=NULL WHERE activity_key=OLD.activity_key OR activity_key=NEW.activity_key; END;
CREATE TRIGGER website_platform_schedule_timetable_publications_delete AFTER DELETE ON timetable_publications
 WHEN (SELECT enabled FROM website_platform_control WHERE singleton=1)=1
 BEGIN UPDATE website_platform_timetable_scopes SET revision=revision+1,next_attempt=0,attempts=0,last_error=NULL WHERE activity_key=OLD.activity_key; END;
CREATE TRIGGER website_platform_schedule_course_run_state_insert AFTER INSERT ON course_run_state
 WHEN (SELECT enabled FROM website_platform_control WHERE singleton=1)=1
 BEGIN UPDATE website_platform_timetable_scopes SET revision=revision+1,next_attempt=0,attempts=0,last_error=NULL WHERE activity_key=NEW.activity_key; END;
CREATE TRIGGER website_platform_schedule_course_run_state_update AFTER UPDATE ON course_run_state
 WHEN (SELECT enabled FROM website_platform_control WHERE singleton=1)=1
 BEGIN UPDATE website_platform_timetable_scopes SET revision=revision+1,next_attempt=0,attempts=0,last_error=NULL WHERE activity_key=OLD.activity_key OR activity_key=NEW.activity_key; END;
CREATE TRIGGER website_platform_schedule_course_run_state_delete AFTER DELETE ON course_run_state
 WHEN (SELECT enabled FROM website_platform_control WHERE singleton=1)=1
 BEGIN UPDATE website_platform_timetable_scopes SET revision=revision+1,next_attempt=0,attempts=0,last_error=NULL WHERE activity_key=OLD.activity_key; END;
CREATE TRIGGER website_platform_schedule_course_runs_insert AFTER INSERT ON course_runs
 WHEN (SELECT enabled FROM website_platform_control WHERE singleton=1)=1
 BEGIN UPDATE website_platform_timetable_scopes SET revision=revision+1,next_attempt=0,attempts=0,last_error=NULL WHERE activity_key=NEW.activity_key; END;
CREATE TRIGGER website_platform_schedule_course_runs_update AFTER UPDATE ON course_runs
 WHEN (SELECT enabled FROM website_platform_control WHERE singleton=1)=1
 BEGIN UPDATE website_platform_timetable_scopes SET revision=revision+1,next_attempt=0,attempts=0,last_error=NULL WHERE activity_key=OLD.activity_key OR activity_key=NEW.activity_key; END;
CREATE TRIGGER website_platform_schedule_course_runs_delete AFTER DELETE ON course_runs
 WHEN (SELECT enabled FROM website_platform_control WHERE singleton=1)=1
 BEGIN UPDATE website_platform_timetable_scopes SET revision=revision+1,next_attempt=0,attempts=0,last_error=NULL WHERE activity_key=OLD.activity_key; END;
CREATE TRIGGER website_platform_schedule_lesson_lifecycle_insert AFTER INSERT ON lesson_lifecycle
 WHEN (SELECT enabled FROM website_platform_control WHERE singleton=1)=1
 BEGIN UPDATE website_platform_timetable_scopes SET revision=revision+1,next_attempt=0,attempts=0,last_error=NULL WHERE activity_key=NEW.activity_key; END;
CREATE TRIGGER website_platform_schedule_lesson_lifecycle_update AFTER UPDATE ON lesson_lifecycle
 WHEN (SELECT enabled FROM website_platform_control WHERE singleton=1)=1
 BEGIN UPDATE website_platform_timetable_scopes SET revision=revision+1,next_attempt=0,attempts=0,last_error=NULL WHERE activity_key=OLD.activity_key OR activity_key=NEW.activity_key; END;
CREATE TRIGGER website_platform_schedule_lesson_lifecycle_delete AFTER DELETE ON lesson_lifecycle
 WHEN (SELECT enabled FROM website_platform_control WHERE singleton=1)=1
 BEGIN UPDATE website_platform_timetable_scopes SET revision=revision+1,next_attempt=0,attempts=0,last_error=NULL WHERE activity_key=OLD.activity_key; END;
CREATE TRIGGER website_platform_schedule_program_publication_lifecycle_insert AFTER INSERT ON program_publication_lifecycle
 WHEN (SELECT enabled FROM website_platform_control WHERE singleton=1)=1
 BEGIN UPDATE website_platform_timetable_scopes SET revision=revision+1,next_attempt=0,attempts=0,last_error=NULL WHERE activity_key=NEW.activity_key; END;
CREATE TRIGGER website_platform_schedule_program_publication_lifecycle_update AFTER UPDATE ON program_publication_lifecycle
 WHEN (SELECT enabled FROM website_platform_control WHERE singleton=1)=1
 BEGIN UPDATE website_platform_timetable_scopes SET revision=revision+1,next_attempt=0,attempts=0,last_error=NULL WHERE activity_key=OLD.activity_key OR activity_key=NEW.activity_key; END;
CREATE TRIGGER website_platform_schedule_program_publication_lifecycle_delete AFTER DELETE ON program_publication_lifecycle
 WHEN (SELECT enabled FROM website_platform_control WHERE singleton=1)=1
 BEGIN UPDATE website_platform_timetable_scopes SET revision=revision+1,next_attempt=0,attempts=0,last_error=NULL WHERE activity_key=OLD.activity_key; END;
CREATE TRIGGER website_platform_schedule_classes_insert AFTER INSERT ON classes
 WHEN (SELECT enabled FROM website_platform_control WHERE singleton=1)=1
 BEGIN UPDATE website_platform_timetable_scopes SET revision=revision+1,next_attempt=0,attempts=0,last_error=NULL WHERE activity_key=NEW.activity_key; END;
CREATE TRIGGER website_platform_schedule_classes_update AFTER UPDATE ON classes
 WHEN (SELECT enabled FROM website_platform_control WHERE singleton=1)=1
 BEGIN UPDATE website_platform_timetable_scopes SET revision=revision+1,next_attempt=0,attempts=0,last_error=NULL WHERE activity_key=OLD.activity_key OR activity_key=NEW.activity_key; END;
CREATE TRIGGER website_platform_schedule_classes_delete AFTER DELETE ON classes
 WHEN (SELECT enabled FROM website_platform_control WHERE singleton=1)=1
 BEGIN UPDATE website_platform_timetable_scopes SET revision=revision+1,next_attempt=0,attempts=0,last_error=NULL WHERE activity_key=OLD.activity_key; END;
CREATE TRIGGER website_platform_schedule_activities_insert AFTER INSERT ON activities
 WHEN (SELECT enabled FROM website_platform_control WHERE singleton=1)=1
 BEGIN UPDATE website_platform_timetable_scopes SET revision=revision+1,next_attempt=0,attempts=0,last_error=NULL WHERE activity_key=NEW.activity_key; END;
CREATE TRIGGER website_platform_schedule_activities_update AFTER UPDATE ON activities
 WHEN (SELECT enabled FROM website_platform_control WHERE singleton=1)=1
 BEGIN UPDATE website_platform_timetable_scopes SET revision=revision+1,next_attempt=0,attempts=0,last_error=NULL WHERE activity_key=OLD.activity_key OR activity_key=NEW.activity_key; END;
CREATE TRIGGER website_platform_schedule_activities_delete AFTER DELETE ON activities
 WHEN (SELECT enabled FROM website_platform_control WHERE singleton=1)=1
 BEGIN UPDATE website_platform_timetable_scopes SET revision=revision+1,next_attempt=0,attempts=0,last_error=NULL WHERE activity_key=OLD.activity_key; END;
CREATE TRIGGER website_platform_schedule_academy_calendar_events_insert AFTER INSERT ON academy_calendar_events
 WHEN (SELECT enabled FROM website_platform_control WHERE singleton=1)=1
 BEGIN UPDATE website_platform_timetable_scopes SET revision=revision+1,next_attempt=0,attempts=0,last_error=NULL WHERE NEW.scope_key='ACADEMY' OR activity_key=NEW.scope_key; END;
CREATE TRIGGER website_platform_schedule_academy_calendar_events_update AFTER UPDATE ON academy_calendar_events
 WHEN (SELECT enabled FROM website_platform_control WHERE singleton=1)=1
 BEGIN UPDATE website_platform_timetable_scopes SET revision=revision+1,next_attempt=0,attempts=0,last_error=NULL WHERE OLD.scope_key='ACADEMY' OR activity_key=OLD.scope_key OR NEW.scope_key='ACADEMY' OR activity_key=NEW.scope_key; END;
CREATE TRIGGER website_platform_schedule_academy_calendar_events_delete AFTER DELETE ON academy_calendar_events
 WHEN (SELECT enabled FROM website_platform_control WHERE singleton=1)=1
 BEGIN UPDATE website_platform_timetable_scopes SET revision=revision+1,next_attempt=0,attempts=0,last_error=NULL WHERE OLD.scope_key='ACADEMY' OR activity_key=OLD.scope_key; END;
CREATE TRIGGER website_platform_schedule_academy_calendar_suppressions_insert AFTER INSERT ON academy_calendar_suppressions
 WHEN (SELECT enabled FROM website_platform_control WHERE singleton=1)=1
 BEGIN UPDATE website_platform_timetable_scopes SET revision=revision+1,next_attempt=0,attempts=0,last_error=NULL WHERE 1; END;
CREATE TRIGGER website_platform_schedule_academy_calendar_suppressions_update AFTER UPDATE ON academy_calendar_suppressions
 WHEN (SELECT enabled FROM website_platform_control WHERE singleton=1)=1
 BEGIN UPDATE website_platform_timetable_scopes SET revision=revision+1,next_attempt=0,attempts=0,last_error=NULL WHERE 1; END;
CREATE TRIGGER website_platform_schedule_academy_calendar_suppressions_delete AFTER DELETE ON academy_calendar_suppressions
 WHEN (SELECT enabled FROM website_platform_control WHERE singleton=1)=1
 BEGIN UPDATE website_platform_timetable_scopes SET revision=revision+1,next_attempt=0,attempts=0,last_error=NULL WHERE 1; END;
CREATE TRIGGER website_platform_schedule_academy_settings_insert AFTER INSERT ON academy_settings
 WHEN (SELECT enabled FROM website_platform_control WHERE singleton=1)=1
 BEGIN UPDATE website_platform_timetable_scopes SET revision=revision+1,next_attempt=0,attempts=0,last_error=NULL WHERE NEW.setting_key='ProgramZoom:'||upper(activity_key) OR NEW.setting_key LIKE 'AcademyHolidayAnnual:%' OR NEW.setting_key LIKE 'AcademyHijriAnnual:%' OR NEW.setting_key='PlatformTimezone'; END;
CREATE TRIGGER website_platform_schedule_academy_settings_update AFTER UPDATE ON academy_settings
 WHEN (SELECT enabled FROM website_platform_control WHERE singleton=1)=1
 BEGIN UPDATE website_platform_timetable_scopes SET revision=revision+1,next_attempt=0,attempts=0,last_error=NULL WHERE OLD.setting_key='ProgramZoom:'||upper(activity_key) OR OLD.setting_key LIKE 'AcademyHolidayAnnual:%' OR OLD.setting_key LIKE 'AcademyHijriAnnual:%' OR OLD.setting_key='PlatformTimezone' OR NEW.setting_key='ProgramZoom:'||upper(activity_key) OR NEW.setting_key LIKE 'AcademyHolidayAnnual:%' OR NEW.setting_key LIKE 'AcademyHijriAnnual:%' OR NEW.setting_key='PlatformTimezone'; END;
CREATE TRIGGER website_platform_schedule_academy_settings_delete AFTER DELETE ON academy_settings
 WHEN (SELECT enabled FROM website_platform_control WHERE singleton=1)=1
 BEGIN UPDATE website_platform_timetable_scopes SET revision=revision+1,next_attempt=0,attempts=0,last_error=NULL WHERE OLD.setting_key='ProgramZoom:'||upper(activity_key) OR OLD.setting_key LIKE 'AcademyHolidayAnnual:%' OR OLD.setting_key LIKE 'AcademyHijriAnnual:%' OR OLD.setting_key='PlatformTimezone'; END;
CREATE TRIGGER website_platform_schedule_activation AFTER UPDATE OF enabled ON website_platform_control
WHEN NEW.enabled=1 AND OLD.enabled=0
BEGIN UPDATE website_platform_timetable_scopes SET revision=revision+1,next_attempt=0,attempts=0,last_error=NULL; END;
