import {assessmentResultsSQL} from './assessment-results.js';
import {reportDefinitionHash} from './assessment-report-source.js';
import {assessmentOperations} from './assessment-timing.js';
import {assessmentStore,cleanText} from './assessment-store.js';
import {managementError as fail} from './management-store.js';

// Normalised A4 coordinates make artwork placement independent of screen size.
export function validateAssessmentLayout(layout){
 if(!layout||typeof layout!=='object'||Array.isArray(layout)||!Array.isArray(layout.fields)||layout.fields.length>20)throw fail('Choose a valid report layout.');
 const allowed=new Set(['academy','learner','learnerId','class','program','period','year','issued','total','results']);
 const seen=new Set();
 for(const field of layout.fields){if(!field||!allowed.has(field.key)||seen.has(field.key))throw fail('Use each supported report field once.');seen.add(field.key);
  for(const key of ['x','y','width','height'])if(typeof field[key]!=='number'||!Number.isFinite(field[key])||field[key]<0||field[key]>1)throw fail('Keep report fields inside the page.');
  if(field.width<=0||field.height<=0||field.x+field.width>1.001||field.y+field.height>1.001||!Number.isInteger(field.fontSize)||field.fontSize<8||field.fontSize>36)throw fail('Choose valid field bounds and a font size from 8 to 36.');
 }
 if(!seen.has('learner')||!seen.has('results')||!seen.has('total'))throw fail('Include learner, results and total fields.');
 return {fields:layout.fields.map(({key,x,y,width,height,fontSize})=>({key,x,y,width,height,fontSize})),rtl:true};
}
export function assessmentReports(repository,auth){
 const s=assessmentStore(repository,auth),{p,actor}=s,native=assessmentOperations(repository);
 async function templates(input){
  await s.requireClass(input.activityKey,input.classId,'admin');
  const rows=(await p('SELECT * FROM assessment_report_templates WHERE activity_key=? ORDER BY name LIMIT 101',input.activityKey).all()).results;
  return {templates:rows.map(t=>({id:t.template_id,name:t.name,fileId:t.file_id,layout:JSON.parse(t.layout_json),revision:t.revision}))};
 }
 async function saveTemplate(input){return s.change('template-save',input,input.activityKey,async()=>{
  await s.requireClass(input.activityKey,input.classId,'admin');const name=cleanText(input.name,160,'a template name'),layout=validateAssessmentLayout(input.layout);
  if(input.fileId&&!await p("SELECT 1 ok FROM assessment_files WHERE file_id=? AND activity_key=? AND kind='TEMPLATE'",input.fileId,input.activityKey).first())throw fail('Choose a report design in this learning area.',403);
  const old=input.templateId?await p('SELECT * FROM assessment_report_templates WHERE template_id=? AND activity_key=?',input.templateId,input.activityKey).first():null;
  if(input.templateId&&!old)throw fail('Template not found.',404);if(old&&old.revision!==input.revision)throw fail('This template changed. Refresh before saving.',409,'ROW_CHANGED');
  const id=old?.template_id||crypto.randomUUID(),now=new Date().toISOString();
  return {statements:[p(`INSERT INTO assessment_report_templates VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(template_id) DO UPDATE SET name=excluded.name,file_id=excluded.file_id,layout_json=excluded.layout_json,revision=excluded.revision,updated_at=excluded.updated_at,updated_by=excluded.updated_by`,id,input.activityKey,name,input.fileId||null,JSON.stringify(layout),(old?.revision||0)+1,now,actor),s.event({activity_key:input.activityKey},'template-save',{templateId:id})],result:{templateId:id}};
 });}
 async function data(input){
  await s.requireClass(input.activityKey,input.classId,'admin');
  const ids=input.assessmentIds;if(!Array.isArray(ids)||!ids.length||ids.length>50||new Set(ids).size!==ids.length)throw fail('Select up to 50 assessments for this report.');
  const exams=(await p(`SELECT x.*,c.name class_name,a.name activity_name FROM assessments x JOIN classes c ON c.activity_key=x.activity_key AND c.class_id=x.class_id JOIN activities a ON a.activity_key=x.activity_key WHERE x.deleted_at IS NULL AND x.activity_key=? AND x.class_id=? AND x.assessment_id IN(SELECT value FROM json_each(?)) ORDER BY x.exam_date,x.subject,x.title`,input.activityKey,input.classId,JSON.stringify(ids)).all()).results;
  if(exams.length!==ids.length)throw fail('Select assessments from the same class.',403);
  const rows=(await p(`SELECT r.*,m.mark,m.state,m.submission_id,m.manual FROM assessment_recipients r LEFT JOIN (${assessmentResultsSQL}) m ON m.mark_id=r.released_mark_id WHERE r.assessment_id IN(SELECT value FROM json_each(?)) ORDER BY r.display_name`,JSON.stringify(ids)).all()).results;
  const definitions=new Map();if(native)for(const a of exams)definitions.set(a.assessment_id,await reportDefinitionHash(a));
  const people=new Map();for(const r of rows)if(!people.has(r.account_id))people.set(r.account_id,r.display_name);
  return {...(native?{timezone:(await repository.homeConfiguration()).setting_value}:{}),className:exams[0].class_name,activityName:exams[0].activity_name,learners:[...people].map(([id,name])=>({id,name,results:exams.map(a=>{const r=rows.find(r=>r.account_id===id&&r.assessment_id===a.assessment_id),released=r?.state==='APPROVED'&&(native||r.manual===1||r.submission_id===r.latest_submission_id);return {...(native?{definitionHash:definitions.get(a.assessment_id)}:{}),assessmentId:a.assessment_id,title:a.title,subject:[a.subject,a.subject_descriptor].filter(Boolean).join(' · '),date:a.exam_date,...(!native?{maximumMark:a.maximum_mark}:{}),mark:released?r.mark:null,markId:released?r.released_mark_id:null};})}))};
 }
 async function saveReport(input){return s.change('report-save',input,input.activityKey,async()=>{
  if(native)throw fail('Generate and review reports for the whole Imtihaan from the register, then release them separately or with marks.',409,'IMTIHAAN_REPORT_REQUIRED');
  await s.requireClass(input.activityKey,input.classId,'admin');
  const f=await p("SELECT * FROM assessment_files WHERE file_id=? AND kind='REPORT' AND activity_key=? AND owner_id=? AND uploaded_by=?",input.fileId,input.activityKey,input.accountId,actor).first();
  if(!f)throw fail('Upload this learner’s generated PDF first.',403);
  const source=input.source;if(!Array.isArray(source)||!source.length||source.length>50||new Set(source.map(r=>r.assessmentId)).size!==source.length)throw fail('Choose the report assessment records.');
  if(!source.some(entry=>entry.markId))throw fail('Release at least one assessment mark before issuing a report.',409);
  const records=(await p('SELECT a.*,r.released_mark_id FROM assessments a JOIN assessment_recipients r USING(assessment_id) WHERE a.deleted_at IS NULL AND r.account_id=? AND a.assessment_id IN(SELECT json_extract(value,\'$.assessmentId\') FROM json_each(?))',input.accountId,JSON.stringify(source)).all()).results;
  if(records.length!==source.length||records.some(r=>r.activity_key!==input.activityKey||r.class_id!==input.classId))throw fail('The report contains another class or learner.',403);
  if(native)for(const row of records)if(source.find(e=>e.assessmentId===row.assessment_id).definitionHash!==await reportDefinitionHash(row))throw fail('The assessment definition changed. Review the report again.',409,'REPORT_SOURCE_CHANGED');
  if(records.some(r=>r.released_mark_id!==(source.find(e=>e.assessmentId===r.assessment_id).markId??null)))throw fail('The selected results changed. Refresh the report.',409);
  let review=null;if(native){const integrity=await p('SELECT sha256 FROM assessment_file_integrity WHERE file_id=?',f.file_id).first();review=input.review;if(!integrity||review?.sha256!==integrity.sha256)throw fail('Review this exact generated PDF before issuing it.',409,'REPORT_REVIEW_REQUIRED');review.layout=validateAssessmentLayout(review.layout);if(review.templateId){const template=await p('SELECT * FROM assessment_report_templates WHERE template_id=? AND activity_key=?',review.templateId,input.activityKey).first();if(!template||template.revision!==review.templateRevision)throw fail('The report template changed. Review the report again.',409,'ROW_CHANGED');}if(review.backgroundFileId&&!await p("SELECT 1 ok FROM assessment_files WHERE file_id=? AND activity_key=? AND kind='TEMPLATE'",review.backgroundFileId,input.activityKey).first())throw fail('Choose a report background from this learning area.',403);}
  const id=crypto.randomUUID();return {statements:[p('INSERT INTO assessment_reports VALUES(?,?,?,?,?,?,?,?)',id,input.activityKey,input.classId,input.accountId,f.file_id,JSON.stringify(source),new Date().toISOString(),actor),...(native?[p('INSERT INTO assessment_report_evidence VALUES(?,?,?,?,?,?,?,?,?)',id,review.sha256,JSON.stringify(source),review.templateId||null,review.templateRevision||null,JSON.stringify(review.layout),review.backgroundFileId||null,new Date().toISOString(),actor)]:[]),s.event({activity_key:input.activityKey},'report-save',{reportId:id},input.accountId)],result:{reportId:id}};
 });}
 async function list(input){
  const a=await s.assessment(input.assessmentId);await s.requireReader(a);const admin=await s.allowed(a.activity_key,a.class_id,'admin');
  const reports=(await p(`SELECT report_id,file_id,account_id,created_at,source_json FROM assessment_reports WHERE activity_key=? AND class_id=? ${admin?'':'AND account_id=?'} ${native&&!admin?'AND EXISTS(SELECT 1 FROM assessment_report_evidence e WHERE e.report_id=assessment_reports.report_id)':''} ORDER BY created_at DESC LIMIT 200`,a.activity_key,a.class_id,...(admin?[]:[actor])).all()).results;
  const records=native&&!admin?(await p('SELECT a.*,r.released_mark_id FROM assessment_recipients r JOIN assessments a USING(assessment_id) WHERE r.account_id=?',actor).all()).results:null;
  const definitions=new Map();if(records)for(const row of records)definitions.set(row.assessment_id,await reportDefinitionHash(row));
  const staged=!admin&&reports.length?(await p(`SELECT json_extract(e.details_json,'$.reportId') report_id FROM assessment_events e WHERE e.action='report-staged' AND e.account_id=? AND NOT EXISTS(SELECT 1 FROM assessment_events released WHERE released.action='report-released' AND released.account_id=e.account_id AND json_extract(released.details_json,'$.reportId')=json_extract(e.details_json,'$.reportId'))`,actor).all()).results:[];
  const unreleased=new Set(staged.map(r=>r.report_id));
  return {reports:reports.filter(r=>!unreleased.has(r.report_id)&&(!records||JSON.parse(r.source_json).every(e=>records.some(c=>c.assessment_id===e.assessmentId&&c.released_mark_id===(e.markId??null)&&definitions.get(e.assessmentId)===e.definitionHash)))).map(({source_json,...r})=>r)};
 }
 return {run:(action,input)=>action==='templates'?templates(input):action==='template-save'?saveTemplate(input):action==='report-data'?data(input):action==='report-save'?saveReport(input):list(input)};
}
