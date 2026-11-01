// Exact read templates for the Admin recorded-context editor only. The marker
// keeps the reserved recipes distinct from ordinary media reader SQL.
const query=(kind,sql)=>`/* Academy recorded-context ${kind} V1 */ ${sql}`;
export const lessonContextSQL={
 schema:query('schema','SELECT l.session_key,l.teacher_ids_json,l.media_scope,a.display_name FROM lesson_media_lessons l,lesson_media_assets a WHERE 0'),
 enabled:query('enabled',"SELECT 1 ok FROM academy_settings WHERE setting_key='LessonMediaEnabled' AND setting_value='1'"),
 area:query('area','SELECT activity_key FROM lesson_media_lessons WHERE lesson_id=?'),
 activity:query('activity',"SELECT * FROM activities WHERE activity_key=? AND active=1 AND lifecycle='ACTIVE'"),
 lesson:query('lesson','SELECT l.*,c.name class_name,1 learner_allowed FROM lesson_media_lessons l LEFT JOIN classes c ON c.activity_key=l.activity_key AND c.class_id=l.class_id WHERE l.lesson_id=? AND l.activity_key=?'),
 policy:query('policy','SELECT * FROM program_monthly_media_policies WHERE activity_key=?'),
 receipt:query('receipt',"SELECT payload_sha256,actor_account_id,json_remove(result_json,'$._acceptedChange','$._acceptedHead','$._acceptedPublic') result_json FROM operation_receipts WHERE dataset_key='LESSON_MEDIA' AND scope_key=? AND operation_id=?")
};
export function lessonContextRead(db,kind,...values){
 const sql=lessonContextSQL[kind];if(!sql)throw Error('Unknown lesson context read.');
 return (db.prepareLessonContext?db.prepareLessonContext(sql,{kind,values}):db.prepare(sql)).bind(...values);
}
