import {recordedTeacherIdsSQL} from './lesson-recorded-options.js';
// Exact read templates for the Admin recorded-context editor only. The marker
// keeps the reserved recipes distinct from ordinary media reader SQL.
const query=(kind,sql)=>`/* Academy recorded-context ${kind} V1 */ ${sql}`;
export const lessonContextSQL={
 teachers:query('teachers',`SELECT a.account_id,a.display_name FROM (${recordedTeacherIdsSQL}) t JOIN accounts a USING(account_id) WHERE a.active=1 GROUP BY a.account_id ORDER BY a.display_name,a.account_id LIMIT 201`),
 classes:query('classes','SELECT class_id,name,academic_year FROM classes WHERE activity_key=? AND active=1 ORDER BY name,class_id LIMIT 201'),
 surahs:query('surahs','SELECT surah_id,name FROM program_surahs WHERE activity_key=? AND active=1 ORDER BY name,surah_id LIMIT 201'),
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
