import {validDate} from './assessment-store.js';
import {managementError as fail} from './management-store.js';

const validInstant=value=>typeof value==='string'&&validDate(value.slice(0,10))&&/^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/.test(value)&&Number.isFinite(Date.parse(value));
function validSchedule(a){
 const kind=a.assessment_kind||'EXAM';
 if(kind==='EXAM')return validDate(a.exam_date);
 return kind==='ASSIGNMENT'&&validInstant(a.available_from)&&(!a.due_at||validInstant(a.due_at)&&Date.parse(a.due_at)>=Date.parse(a.available_from));
}

// These checks validate an admin's tracking label. They never release a resource.
export async function statusValidation(s,registerId,status){
 const checks=[{label:'Assessment name, learning areas and class selection are valid',ok:true}];
 if(['REGISTERED','DRAFT','CANCELLED','ARCHIVED'].includes(status))return {status,valid:true,checks};
 const rows=registerId?(await s.p(`SELECT a.*,
  count(r.account_id) learners,
  sum(CASE WHEN r.first_accessed_at IS NOT NULL THEN 1 ELSE 0 END) accessed,
  sum(CASE WHEN r.latest_submission_id IS NOT NULL THEN 1 ELSE 0 END) submitted,
  sum(CASE WHEN r.latest_submission_id=m.submission_id AND m.state IN('IN_REVIEW','APPROVED') THEN 1 ELSE 0 END) assessed,
  sum(CASE WHEN r.latest_submission_id=m.submission_id AND m.state='APPROVED' THEN 1 ELSE 0 END) moderated,
  sum(CASE WHEN r.latest_submission_id=m.submission_id AND m.state='APPROVED' AND r.released_mark_id=m.mark_id THEN 1 ELSE 0 END) released,
  sum(CASE WHEN r.resubmit_authorised=1 THEN 1 ELSE 0 END) replacements
 FROM assessments a LEFT JOIN assessment_recipients r USING(assessment_id) LEFT JOIN assessment_markings m ON m.mark_id=r.latest_mark_id
 WHERE a.register_id=? AND a.deleted_at IS NULL GROUP BY a.assessment_id LIMIT 1001`,registerId).all()).results:[];
 if(rows.length>1000)throw fail('This Imtihaan has too many assessments to validate together.',409);
 const check=(label,ok)=>checks.push({label,ok:Boolean(ok)}),all=fn=>rows.length>0&&rows.every(fn);
 check('At least one assessment has been added',rows.length);
 check('Every assessment has a name and subject',all(a=>a.subject?.trim()&&a.title?.trim()));
 check('Every exam has a valid date; assignments have valid opening and optional due times',all(validSchedule));
 check('Timed assessments have a valid duration; untimed assessments need no duration',all(a=>(a.timing_mode||'TIMED')==='UNTIMED'?a.duration_minutes==null:(a.timing_mode||'TIMED')==='TIMED'&&Number.isInteger(a.duration_minutes)&&a.duration_minutes>=1&&a.duration_minutes<=1440));
 check('Every assessment has a valid total mark',all(a=>Number.isFinite(a.maximum_mark)&&a.maximum_mark>0&&a.maximum_mark<=1000000));
 if(status==='SCHEDULED')return {status,valid:checks.every(c=>c.ok),checks};
 check('Every assessment schedule has been released to its class',all(a=>a.schedule_published&&a.learners>0));
 if(status==='AWAITING_MODERATION'){
  check('Every assessment has a PDF paper submitted for moderation',all(a=>a.paper_file_id&&['IN_REVIEW','APPROVED'].includes(a.paper_state)));
  check('At least one paper is awaiting moderation',rows.some(a=>a.paper_state==='IN_REVIEW'));
 }else if(status!=='SCHEDULE_RELEASED'){
  check('Every assessment paper has been approved by a moderator',all(a=>a.paper_file_id&&a.paper_state==='APPROVED'));
  if(status!=='APPROVED')check('Admin has published every assessment paper using the release controls',all(a=>a.paper_released_at));
 }
 const underway=['IN_PROGRESS','READY_FOR_ASSESSMENT','ASSESSED','MODERATED','READY_FOR_RELEASE','RELEASED','COMPLETE'];
 const started=a=>a.accessed>0||Date.now()>=Date.parse(a.available_from||a.exam_date+'T03:00:00+02:00');
 if(underway.includes(status))check('An assessment has started',rows.some(started));
 const marking=['READY_FOR_ASSESSMENT','ASSESSED','MODERATED','READY_FOR_RELEASE','RELEASED','COMPLETE'];
 if(marking.includes(status)){
  check('At least one learner has submitted answers',rows.some(a=>a.submitted>0));
  check('A teacher or admin has marked every assessment with received answers ready',all(a=>a.submitted===0||a.ready_for_assessment_at));
 }
 if(['ASSESSED','MODERATED','READY_FOR_RELEASE','RELEASED','COMPLETE'].includes(status))check('Every latest submitted answer has been assessed',all(a=>a.assessed===a.submitted));
 if(['MODERATED','READY_FOR_RELEASE','RELEASED','COMPLETE'].includes(status))check('Every latest assessed answer has approved moderation',all(a=>a.moderated===a.submitted));
 if(['RELEASED','COMPLETE'].includes(status))check('Marks for every submitted answer have been released to the class',all(a=>a.released===a.submitted));
 if(status==='COMPLETE'){
  check('Every assessment date has arrived',all(started));
  check('No authorised replacement submission is outstanding',all(a=>a.replacements===0));
 }
 return {status,valid:checks.every(c=>c.ok),checks};
}
export function requireValidStatus(validation){
 if(!validation.valid)throw fail('Status cannot be changed yet: '+validation.checks.filter(c=>!c.ok).map(c=>c.label).join('; ')+'.',409,'STATUS_NOT_READY');
}
