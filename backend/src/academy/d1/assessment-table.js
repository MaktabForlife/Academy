import {assessmentResultsSQL} from './assessment-results.js';
import {managementError as fail} from './management-store.js';
import {paperReplacementOpen} from './assessment-store.js';

// External moderation is confirmed before marks are transcribed. Read its
// latest audited decision; entering numbers does not imply moderation.
export async function assessmentTableStates(s,rows){
 if(!rows.length)return new Map();const ids=JSON.stringify(rows.map(a=>a.assessment_id));
 const data=(await s.p(`SELECT a.assessment_id,COALESCE(r.entered,0) entered,COALESCE(r.accessed,0) accessed,
  (SELECT details_json FROM assessment_events e WHERE e.assessment_id=a.assessment_id AND e.action='marks-moderated' ORDER BY CAST(json_extract(e.details_json,'$.revision') AS INTEGER) DESC,e.occurred_at DESC,e.event_id DESC LIMIT 1) moderation
  FROM assessments a LEFT JOIN (SELECT assessment_id,sum(latest_mark_id IS NOT NULL) entered,sum(first_accessed_at IS NOT NULL OR latest_submission_id IS NOT NULL) accessed FROM assessment_recipients WHERE assessment_id IN(SELECT value FROM json_each(?)) GROUP BY assessment_id) r USING(assessment_id)
  WHERE a.assessment_id IN(SELECT value FROM json_each(?))`,ids,ids).all()).results;
 return new Map(data.map(r=>{const m=r.moderation?JSON.parse(r.moderation):null;return [r.assessment_id,{...r,moderated:Boolean(m?.approved)}];}));
}

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
  // This checkbox confirms external moderation before mark transcription.
  statements.push(s.event(a,'marks-moderated',{approved:changes.marksModerated,mode:'EXTERNAL',revision:a.revision+1}));
 }
 statements.push(s.touch(a),s.event(a,'table-save',{fields:Object.keys(changes),revision:a.revision+1}));
 return {statements};
}

export async function assessmentRegisterMarks(s,input,preview=false){
 const build=async()=>{
  const register=await s.p('SELECT * FROM assessment_registers WHERE register_id=?',String(input.registerId||'')).first();
  if(!register)throw fail('Imtihaan not found.',404);
  const rows=(await s.p('SELECT * FROM assessments WHERE register_id=? AND deleted_at IS NULL LIMIT 1001',register.register_id).all()).results;
  if(!rows.length||rows.length>1000)throw fail('Choose an Imtihaan with between 1 and 1,000 class assessments.',409);
  await s.requireAdminClasses([...new Map(rows.map(a=>[JSON.stringify([a.activity_key,a.class_id]),{activityKey:a.activity_key,classId:a.class_id}])).values()]);
  const states=await assessmentTableStates(s,rows),ids=JSON.stringify(rows.map(a=>a.assessment_id));
  const recipients=(await s.p(`SELECT r.*,m.state,m.manual,m.submission_id FROM assessment_recipients r LEFT JOIN (${assessmentResultsSQL}) m ON m.mark_id=r.latest_mark_id WHERE r.assessment_id IN(SELECT value FROM json_each(?))`,ids).all()).results;
  const roster=await s.rosters(rows),expected=new Set([...roster.map(r=>JSON.stringify([r.assessment_id,r.account_id])),...recipients.map(r=>JSON.stringify([r.assessment_id,r.account_id]))]);
  const entered=recipients.filter(r=>r.latest_mark_id),pending=entered.filter(r=>r.released_mark_id!==r.latest_mark_id),missing=expected.size-entered.length;
  const unmoderated=rows.filter(a=>pending.some(r=>r.assessment_id===a.assessment_id)&&(!states.get(a.assessment_id)?.moderated||entered.some(r=>r.assessment_id===a.assessment_id&&(r.state!=='APPROVED'||r.manual!==1&&r.submission_id!==r.latest_submission_id))));
  const result={registerId:register.register_id,name:register.name,revision:register.revision,papers:rows.map(a=>({id:a.assessment_id,revision:a.revision})),marks:pending.length,missing,unmoderated:unmoderated.map(a=>a.title)};
  return {register,rows,pending,result};
 };
 if(preview)return (await build()).result;
 return s.change('register-marks-release',input,String(input.registerId||''),async()=>{
  const {register,rows,pending,result}=await build();
  if(input.revision!==register.revision||!Array.isArray(input.papers)||input.papers.length!==rows.length||new Set(input.papers.map(p=>p.id)).size!==rows.length||rows.some(a=>!input.papers.some(p=>p.id===a.assessment_id&&p.revision===a.revision)))throw fail('The Imtihaan changed. Review its marks again before release.',409,'ROW_CHANGED');
  if(input.marks!==result.marks||input.missing!==result.missing)throw fail('The marks or student list changed. Review the Imtihaan release again.',409,'ROW_CHANGED');
  if(!pending.length)throw fail('There are no new marks to release.',409,'MARKS_REQUIRED');
  if(result.unmoderated.length)throw fail('Confirm Marks moderated for: '+result.unmoderated.join(', '),409,'MARKS_NOT_MODERATED');
  if(result.missing&&input.confirmIncomplete!==true)throw fail(`${result.missing} marks are missing. Confirm that blanks will remain pending.`,409,'INCOMPLETE_MARKS');
  const ids=[...new Set(pending.map(r=>r.assessment_id))];
  return {statements:[s.p(`UPDATE assessment_recipients SET released_mark_id=latest_mark_id,revision=revision+1 WHERE assessment_id IN(SELECT value FROM json_each(?)) AND latest_mark_id IS NOT NULL AND released_mark_id IS NOT latest_mark_id`,JSON.stringify(ids)),...rows.filter(a=>ids.includes(a.assessment_id)).flatMap(a=>[s.touch(a),s.event(a,'release',{category:'marks',registerId:register.register_id,accountIds:'CLASS'})]),s.p('UPDATE assessment_registers SET revision=revision+1,updated_at=? WHERE register_id=?',new Date().toISOString(),register.register_id)],result:{released:pending.length,missing:result.missing,registerId:register.register_id}};
 });
}
