-- Additive Academy calendar scope and classification. Existing reference rows stay intact.
ALTER TABLE academy_calendar_events ADD COLUMN scope_key TEXT COLLATE NOCASE NOT NULL DEFAULT 'ACADEMY';
ALTER TABLE academy_calendar_events ADD COLUMN calendar_kind TEXT NOT NULL DEFAULT 'REFERENCE'
 CHECK(calendar_kind IN ('REFERENCE','TERM','ACADEMY_HOLIDAY','PUBLIC_HOLIDAY'));
ALTER TABLE academy_calendar_events ADD COLUMN revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0);
CREATE INDEX academy_calendar_scope_dates ON academy_calendar_events(scope_key,start_date,end_date);
-- Older D1 calendar clients do not send a row revision. Keep the new editor's
-- conflict checks effective when one of those clients updates the same row.
CREATE TRIGGER academy_calendar_compat_revision
AFTER UPDATE OF event_type,description,start_date,end_date,alternate_date,teaching_impact,active,scope_key,calendar_kind ON academy_calendar_events
WHEN NEW.revision=OLD.revision
BEGIN
 UPDATE academy_calendar_events SET revision=OLD.revision+1 WHERE event_id=NEW.event_id;
END;
