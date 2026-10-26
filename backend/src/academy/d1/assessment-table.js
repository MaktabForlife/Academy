import {imtihaanMarkingSnapshot,requireMarkingValidation,reportReleaseStatements} from './assessment-imtihaan-workflow.js';
import {managementError as fail} from './management-store.js';
import {paperReplacementOpen} from './assessment-store.js';

import {assessmentTableStates} from './assessment-marking-state.js';
export {assessmentTableStates} from './assessment-marking-state.js';

export async function assessmentTablePlan(s,a,row,context){
 const {p}=s,changes=row.changes||{},stats=context.tableStates.get(a.assessment_id),now=new Date().toISOString(),statements=[];
 if(!changes||typeof changes!=='object'||Array.isArray(changes)||Object.keys(changes).some(k=>!['details','approve','ready','marksModerated','closed'].includes(k)))throw fail('Choose valid assessment table changes.');
 for(const key of ['approve','ready','marksModerated','closed'])if(key in changes&&typeof changes[key]!=='boolean')throw fail('Choose checked or unchecked for each assessment control.');
 let reset=false;
 if(changes.details){
  if(!paperReplacementOpen(a)||stats?.accessed)throw fail('Assessment details are fixed once the paper is available to students.',409,'PAPER_ALREADY_AVAILABLE');
  if(stats?.entered)throw fail('Assessment details are fixed after marks have been entered.',409);
  const input={activityKey:a.activity_key,title:a.title,subject:a.subject,subjectDescriptor:a.subject_descriptor,examDate:a.exam_date,durationMinutes:a.duration_minutes,maximumMark:a.maximum_mark,assessmentKind:a.assessment_kind,timingMode:a.timing_mode,allowanceMinutes:a.allowance_minutes,availableFrom:a.available_from,dueAt:a.due_at,...changes.details};
  const v=await context.fields(input,a,context.catalogue,context.examiners,context.timezone);
  reset=v.title!==a.title||v.subject!==a.subject||v.descriptor!==a.subject_descriptor||v.examinerId!==a.examiner_id||v.date!==a.exam_date||v.duration!==a.duration_minutes||v.maximum!==a.maximum_mark||context.native&&(v.timing.mode!==a.timing_mode||v.timing.opens!==a.available_from||v.timing.due!==a.due_at||v.timing.allowance!==a.allowance_minutes);
  if(reset&&!('marksModerated' in changes))statements.push(s.event(a,'marks-moderated',{approved:false,mode:'EXTERNAL',revision:a.revision+1}));
  if(reset)statements.push(p(`UPDATE assessments SET title=?,subject=?,subject_descriptor=?,examiner_id=?,exam_date=?,duration_minutes=?,maximum_mark=?,paper_state=CASE WHEN paper_file_id IS NOT NULL THEN 'IN_REVIEW' ELSE paper_state END,paper_released_at=NULL,ready_for_assessment_at=NULL,ready_for_assessment_by=NULL${context.native?',assessment_kind=?,timing_mode=?,timezone=?,available_from=?,due_at=?,exam_cutoff=?,allowance_minutes=?':''} WHERE assessment_id=?`,v.title,v.subject,v.descriptor,v.examinerId,v.date,v.duration,v.maximum,...(context.native?[v.timing.kind,v.timing.mode,v.timing.timezone,v.timing.opens,v.timing.due,v.timing.cutoff,v.timing.allowance]:[]),a.assessment_id));
 }
 if('approve' in changes){
  if(!a.paper_file_id)throw fail('Attach a PDF before approving the paper.',409);
  if(!paperReplacementOpen(a)&&(!changes.approve||reset))throw fail('This paper is already available to students.',409,'PAPER_ALREADY_AVAILABLE');
  if(changes.approve){
   if(row.paperReview?.fileId!==a.paper_file_id||(row.paperReview?.sha256??null)!==(a.paper_sha256??null))throw fail('Open and review the exact attached PDF before approving.',409,'PAPER_REVIEW_REQUIRED');
   statements.push(p("UPDATE assessments SET paper_state='APPROVED',paper_comment='' WHERE assessment_id=?",a.assessment_id));
   if(context.native)statements.push(p('INSERT OR REPLACE INTO assessment_paper_review VALUES(?,?,?,?,?,?)',a.paper_file_id,a.assessment_id,a.paper_sha256||null,a.revision+1,now,s.actor));
  }else statements.push(p("UPDATE assessments SET paper_state='IN_REVIEW',paper_released_at=NULL WHERE assessment_id=?",a.assessment_id));
 }
 if('ready' in changes)statements.push(p('UPDATE assessments SET ready_for_assessment_at=?,ready_for_assessment_by=? WHERE assessment_id=?',changes.ready?now:null,changes.ready?s.actor:null,a.assessment_id));
 if('closed' in changes){
  if(!context.native)throw fail('Refresh this assessment before changing submissions.',409);
  const collection=context.collections.get(a.assessment_id),revision=collection?.revision||0;
  statements.push(p('INSERT INTO assessment_collection VALUES(?,?,?,?,?,?) ON CONFLICT(assessment_id) DO UPDATE SET closed_at=excluded.closed_at,revision=excluded.revision,updated_at=excluded.updated_at,updated_by=excluded.updated_by',a.assessment_id,collection?.effective_due_at||null,changes.closed?(collection?.closed_at||now):null,revision+1,now,s.actor));
 }
 if('marksModerated' in changes){
  if(changes.marksModerated)await s.moderator(a);
  statements.push(s.event(a,'marks-moderated',{approved:changes.marksModerated,mode:'MANUAL',revision:a.revision+1}));
 }
 statements.push(s.touch(a),s.event(a,'table-save',{fields:Object.keys(changes),revision:a.revision+1}));
 return {statements};
}

export async function assessmentRegisterMarks(s,input,preview=false,auth){
 if(preview)return (await imtihaanMarkingSnapshot(s,input,auth)).result;
 return s.change('register-marks-release',input,String(input.registerId||''),async()=>{
  const snapshot=await imtihaanMarkingSnapshot(s,input,auth),{register,rows,pending,result}=snapshot;
  requireMarkingValidation(snapshot);
  if(input.confirm!==true||input.fingerprint!==result.fingerprint||input.revision!==register.revision||!Array.isArray(input.papers)||input.papers.length!==rows.length||rows.some(a=>!input.papers.some(p=>p.id===a.assessment_id&&p.revision===a.revision)))throw fail('The Imtihaan changed. Validate its marking again before release.',409,'ROW_CHANGED');
  if(!result.reportsReady)throw fail('Generate current Imtihaan reports after moderation and before releasing marks.',409,'REPORTS_REQUIRED');
  if(!pending.length)throw fail('There are no new marks to release.',409,'MARKS_REQUIRED');
  const ids=[...new Set(pending.map(r=>r.assessment_id))];
  return {statements:[s.p(`UPDATE assessment_recipients SET released_mark_id=latest_mark_id,revision=revision+1 WHERE assessment_id IN(SELECT value FROM json_each(?)) AND latest_mark_id IS NOT NULL AND released_mark_id IS NOT latest_mark_id`,JSON.stringify(ids)),...rows.filter(a=>ids.includes(a.assessment_id)).flatMap(a=>[s.touch(a),s.event(a,'release',{category:'marks',registerId:register.register_id,accountIds:'CLASS',fingerprint:result.fingerprint})]),...(input.releaseReports===true?reportReleaseStatements(s,snapshot):[]),s.p('UPDATE assessment_registers SET revision=revision+1,updated_at=? WHERE register_id=?',new Date().toISOString(),register.register_id)],result:{released:pending.length,missing:result.missing,reportsReleased:input.releaseReports===true?snapshot.reports.length:0,registerId:register.register_id}};
 });
}
