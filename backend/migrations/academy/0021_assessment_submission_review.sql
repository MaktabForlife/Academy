-- A received PDF is checked by a person before the assessment is declared ready.
-- Confirmation belongs to the submission version, so a replacement starts unchecked.
ALTER TABLE assessment_submissions ADD COLUMN confirmed_at TEXT;
ALTER TABLE assessment_submissions ADD COLUMN confirmed_by TEXT REFERENCES accounts(account_id);
ALTER TABLE assessments ADD COLUMN ready_for_assessment_at TEXT;
ALTER TABLE assessments ADD COLUMN ready_for_assessment_by TEXT REFERENCES accounts(account_id);
CREATE INDEX assessment_events_answer_views ON assessment_events(assessment_id,actor_id,action);
