-- Read-only programme history window. Existing notes and versions are retained.
CREATE INDEX class_notes_programme_history ON class_notes(activity_key,state,created_at DESC,note_id DESC);
