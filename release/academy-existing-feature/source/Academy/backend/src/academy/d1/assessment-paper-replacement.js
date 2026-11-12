import {payloadHash} from '../../programs/timetable-model.js';
export async function paperReplacementImpact(s,rows){
 const recipients=(await s.p(`SELECT assessment_id,account_id,first_accessed_at,latest_submission_id,latest_mark_id FROM assessment_recipients WHERE assessment_id IN(SELECT value FROM json_each(?)) ORDER BY assessment_id,account_id`,JSON.stringify(rows.map(a=>a.assessment_id))).all()).results;
 const count=key=>new Set(recipients.filter(r=>r[key]).map(r=>r.account_id)).size;
 return {accessed:count('first_accessed_at'),submitted:count('latest_submission_id'),marked:count('latest_mark_id'),fingerprint:await payloadHash({papers:rows.map(a=>[a.assessment_id,a.paper_file_id]),recipients})};
}
