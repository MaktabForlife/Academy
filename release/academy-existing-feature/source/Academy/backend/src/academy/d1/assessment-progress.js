import {assessmentStore,paperAvailable} from './assessment-store.js';
import {assessmentGroup} from './assessment-group.js';
import {managementError as fail} from './management-store.js';

export async function assessmentProgress(repository,auth,input){
 const s=assessmentStore(repository,auth),a=await s.assessment(input.assessmentId);await s.requireAssessor(a);
 if(!paperAvailable(a))throw fail('Review progress is available once the paper opens to students.',409,'PAPER_NOT_AVAILABLE');
 const group=await assessmentGroup(s,a)||[a],rows=await s.assessorRows(group);
 await s.requireAssessorGroup(rows);
 const recipients=(await s.p(`SELECT r.*,u.display_name current_name,b.submitted_at,b.file_id,b.confirmed_at,b.confirmed_by
  FROM assessment_recipients r JOIN accounts u USING(account_id) LEFT JOIN assessment_submissions b ON b.submission_id=r.latest_submission_id
  WHERE r.assessment_id IN(SELECT value FROM json_each(?)) ORDER BY u.display_name COLLATE NOCASE,r.account_id`,JSON.stringify(rows.map(r=>r.assessment_id))).all()).results;
 return {assessmentId:a.assessment_id,classes:rows.sort((a,b)=>a.class_name.localeCompare(b.class_name,'en',{numeric:true})).map(a=>({assessmentId:a.assessment_id,className:a.class_name,activityName:a.activity_name,revision:a.revision,students:recipients.filter(r=>r.assessment_id===a.assessment_id).map(r=>({accountId:r.account_id,name:r.current_name||r.display_name,revision:r.revision,accessedAt:r.first_accessed_at,submittedAt:r.submitted_at||null,elapsedSeconds:r.first_accessed_at&&r.submitted_at?Math.max(0,Math.floor((Date.parse(r.submitted_at)-Date.parse(r.first_accessed_at))/1000)):null,submissionId:r.latest_submission_id,fileId:r.file_id||null,confirmedAt:r.confirmed_at||null}))}))};
}
