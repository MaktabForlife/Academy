// Manual results are immutable assessment events, with the existing recipient
// pointers selecting the current and released versions. No answer/PDF is invented.
// Keep one projection for timetable, release and report readers.
export const assessmentResultsSQL=`SELECT mark_id,assessment_id,account_id,submission_id,mark,feedback,script_file_id,state,examiner_id,created_at,moderator_id,moderated_at,moderation_comment,0 manual FROM assessment_markings
 UNION ALL SELECT event_id,assessment_id,account_id,NULL,json_extract(details_json,'$.mark'),'',NULL,'APPROVED',actor_id,occurred_at,actor_id,occurred_at,'Manually entered',1 FROM assessment_events WHERE action='manual-mark' AND account_id IS NOT NULL AND json_type(details_json,'$.mark') IN('integer','real')`;
