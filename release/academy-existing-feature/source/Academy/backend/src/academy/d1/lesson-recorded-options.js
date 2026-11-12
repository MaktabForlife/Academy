import {assessmentRolesSQL} from './assessment-store.js';

// Exact server-authored recipe. It is never populated from request SQL or tables.
export const recordedTeacherIdsSQL="SELECT account_id FROM effective_activity_roles WHERE activity_key=? AND role='TEACHER' UNION SELECT account_id FROM academy_teacher_designations WHERE active=1";
export const recordedOptionsSQL=[
 'SELECT ps.program_subject_id,c.name FROM program_subjects ps JOIN subject_catalog c USING(subject_key) WHERE ps.activity_key=? AND ps.active=1 AND c.active=1 ORDER BY c.name,ps.program_subject_id LIMIT 401',
 'SELECT m.module_id,m.program_subject_id,m.name FROM modules m WHERE m.activity_key=? AND m.active=1 AND (m.program_subject_id IS NULL OR EXISTS(SELECT 1 FROM program_subjects ps JOIN subject_catalog c USING(subject_key) WHERE ps.activity_key=m.activity_key AND ps.program_subject_id=m.program_subject_id AND ps.active=1 AND c.active=1)) AND (m.level_id IS NULL OR EXISTS(SELECT 1 FROM program_levels pl WHERE pl.activity_key=m.activity_key AND pl.level_id=m.level_id AND pl.active=1)) ORDER BY m.name,m.module_id LIMIT 401',
 `SELECT a.account_id,a.display_name FROM (${recordedTeacherIdsSQL}) t JOIN accounts a USING(account_id) WHERE a.active=1 GROUP BY a.account_id ORDER BY a.display_name,a.account_id LIMIT 201`
];
// Legacy monolithic stores retain their existing reviewed role mapping. Split
// stores already carry mapped roles in effective_activity_roles; avoid rebuilding
// global legacy mappings for a programme-scoped teacher picker.
const legacyOptionsSQL=[...recordedOptionsSQL.slice(0,2),recordedOptionsSQL[2].replace(recordedTeacherIdsSQL,`SELECT r.account_id FROM (${assessmentRolesSQL}) r WHERE r.activity_key=? AND r.role='TEACHER' UNION SELECT account_id FROM academy_teacher_designations WHERE active=1`)];
export async function recordedOptions(db,activityKey){
 const statements=(db.prepareRecordedContext?recordedOptionsSQL:legacyOptionsSQL).map(sql=>(db.prepareRecordedContext?db.prepareRecordedContext(sql,activityKey):db.prepare(sql)).bind(activityKey));
 return (await db.batch(statements)).map(r=>r.results);
}
