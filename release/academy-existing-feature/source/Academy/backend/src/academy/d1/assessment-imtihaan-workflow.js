import {assessmentResultsSQL} from './assessment-results.js';
import {assessmentTableStates} from './assessment-marking-state.js';
import {reportDefinitionHash} from './assessment-report-source.js';
import {validateAssessmentLayout} from './assessment-reports.js';
import {registerRecord} from './assessment-register.js';
import {actualState,isAdminWorkspace} from './workspace-access.js';
import {payloadHash} from '../../programs/timetable-model.js';
import {managementError as fail} from './management-store.js';
import {assessmentSelections,assessmentGroup} from './assessment-group.js';
import {paperReplacementImpact} from './assessment-paper-replacement.js';
import {validDate} from './assessment-store.js';

const personKey=(assessmentId,accountId)=>JSON.stringify([assessmentId,accountId]);
const globalAuthority=auth=>isAdminWorkspace(auth)&&Boolean(actualState(auth).account.global_admin);
const validChecks=result=>result.checks.every(check=>check.ok);
export async function imtihaanPaperValidation(s,input,native=true){
 const register=await registerRecord(s,input.registerId),allowed=new Set((await s.classes('admin')).map(c=>c.activity_key));
 if(register.activityKeys.some(key=>!allowed.has(key)))throw fail('This Imtihaan is outside your Admin access.',403,'FORBIDDEN');
 const rows=(await s.p(`SELECT a.*${native?',i.sha256,review.file_id reviewed_file':''} FROM assessments a ${native?'LEFT JOIN assessment_file_integrity i ON i.file_id=a.paper_file_id LEFT JOIN assessment_paper_review review ON review.file_id=a.paper_file_id AND review.sha256 IS i.sha256':''} WHERE a.register_id=? AND a.deleted_at IS NULL ORDER BY a.subject,a.assessment_id LIMIT 1001`,register.register_id).all()).results;
 if(rows.length>1000)throw fail('Choose a smaller Imtihaan to publish.',409);
 const papers=rows.map(a=>{
  const reasons=[];if(['CANCELLED','ARCHIVED'].includes(register.status))reasons.push('Imtihaan is not active');
  if(!a.schedule_published)reasons.push('Schedule is not released');if(!a.paper_file_id)reasons.push('No PDF is attached');if(a.paper_state!=='APPROVED')reasons.push('The current PDF is not approved');
  if(native&&a.sha256&&!a.reviewed_file)reasons.push('The exact PDF needs review and approval');
  if(!a.title.trim()||!a.subject.trim()||a.assessment_kind!=='ASSIGNMENT'&&!validDate(a.exam_date)||a.assessment_kind==='ASSIGNMENT'&&!Number.isFinite(Date.parse(a.available_from)))reasons.push('Assessment name, subject or date is incomplete');
  if(!Number.isFinite(a.maximum_mark)||a.maximum_mark<=0||(a.timing_mode||'TIMED')==='TIMED'&&(!Number.isInteger(a.duration_minutes)||a.duration_minutes<1))reasons.push('Timing or total marks are invalid');
  return {id:a.assessment_id,revision:a.revision,subject:a.subject,title:a.title,published:Boolean(a.paper_released_at),eligible:!a.paper_released_at&&!reasons.length,reasons};
 });
 const selections=await assessmentSelections(s,rows.map(a=>a.assessment_id)),byId=new Map(papers.map(a=>[a.id,a]));
 for(const paper of papers){const ids=selections.get(paper.id);if(paper.eligible&&Array.isArray(ids)&&ids.some(id=>!byId.has(id)||!byId.get(id).eligible&&!byId.get(id).published)){paper.eligible=false;paper.reasons.push('Every class sharing this paper must be ready to publish');}}
 return {registerId:register.register_id,name:register.name,papers,eligible:papers.filter(a=>a.eligible).map(({id,revision})=>({id,revision})),skipped:papers.filter(a=>!a.published&&!a.eligible).length};
}
export function requireMarkingValidation(snapshot){if(!validChecks(snapshot.result))throw fail('Marking validation failed: '+snapshot.result.checks.filter(c=>!c.ok).map(c=>c.label).join('; '),409,'MARKING_NOT_READY');}

// The proof excludes workflow counters and released pointers. Releasing saved
// marks therefore does not invalidate reports; changing a source mark does.
export async function imtihaanMarkingSnapshot(s,input,auth){
 const register=await registerRecord(s,input.registerId),allowed=new Set((await s.classes('admin')).map(c=>c.activity_key));
 if(register.activityKeys.some(key=>!allowed.has(key)))throw fail('This Imtihaan is outside your Admin access.',403,'FORBIDDEN');
 const rows=(await s.p(`SELECT a.*,c.name class_name,v.name activity_name FROM assessments a JOIN classes c ON c.activity_key=a.activity_key AND c.class_id=a.class_id JOIN activities v USING(activity_key) WHERE a.register_id=? AND a.deleted_at IS NULL ORDER BY a.activity_key,a.class_id,a.assessment_id LIMIT 1001`,register.register_id).all()).results;
 if(rows.length>1000)throw fail('Choose a smaller Imtihaan for marking validation.',409);
 if(rows.length)await s.requireAdminClasses([...new Map(rows.map(a=>[personKey(a.activity_key,a.class_id),{activityKey:a.activity_key,classId:a.class_id}])).values()]);
 const ids=JSON.stringify(rows.map(a=>a.assessment_id));
 const [people,roster,states]=await Promise.all([
  s.p(`SELECT r.*,u.display_name current_name,m.mark,m.state mark_state,m.manual,m.submission_id marked_submission,b.confirmed_at FROM assessment_recipients r JOIN accounts u USING(account_id) LEFT JOIN (${assessmentResultsSQL}) m ON m.mark_id=r.latest_mark_id LEFT JOIN assessment_submissions b ON b.submission_id=r.latest_submission_id WHERE r.assessment_id IN(SELECT value FROM json_each(?)) ORDER BY r.assessment_id,r.account_id`,ids).all(),
  s.rosters(rows),assessmentTableStates(s,rows)
 ]);
 const recipients=people.results,expected=new Map(roster.map(r=>[personKey(r.assessment_id,r.account_id),r]));
 for(const r of recipients)if(!expected.has(personKey(r.assessment_id,r.account_id)))expected.set(personKey(r.assessment_id,r.account_id),{...r,display_name:r.current_name||r.display_name});
 if(expected.size>50000)throw fail('Choose a smaller Imtihaan for marking validation.',409);
 const byPerson=new Map(recipients.map(r=>[personKey(r.assessment_id,r.account_id),r])),byId=new Map(rows.map(a=>[a.assessment_id,a]));
 const entered=recipients.filter(r=>r.latest_mark_id),pending=entered.filter(r=>r.released_mark_id!==r.latest_mark_id),missing=expected.size-entered.length;
 const unconfirmed=recipients.filter(r=>r.latest_submission_id&&!r.confirmed_at).length;
 const invalid=entered.filter(r=>typeof r.mark!=='number'||!Number.isFinite(r.mark)||r.mark<0||r.mark>byId.get(r.assessment_id).maximum_mark);
 const unmoderated=rows.filter(a=>entered.some(r=>r.assessment_id===a.assessment_id)&&(!states.get(a.assessment_id)?.moderated||entered.some(r=>r.assessment_id===a.assessment_id&&(r.mark_state!=='APPROVED'||r.manual!==1&&r.marked_submission!==r.latest_submission_id))));
 const definitions=new Map(await Promise.all(rows.map(async a=>[a.assessment_id,await reportDefinitionHash(a)])));
 const fingerprint=await payloadHash({registerId:register.register_id,definitions:[...definitions],people:[...expected.keys()].sort(),marks:recipients.map(r=>[r.assessment_id,r.account_id,r.latest_mark_id,r.mark_state,r.latest_submission_id,r.confirmed_at]),moderated:rows.map(a=>[a.assessment_id,Boolean(states.get(a.assessment_id)?.moderated)])});
 const override=await s.p(`SELECT actor_id,occurred_at,details_json FROM assessment_events WHERE action='register-marking-override' AND json_extract(details_json,'$.registerId')=? AND json_extract(details_json,'$.fingerprint')=? ORDER BY occurred_at DESC,event_id DESC LIMIT 1`,register.register_id,fingerprint).first();
 const checks=[{label:'The Imtihaan is active and has assessments',ok:rows.length>0&&!['CANCELLED','ARCHIVED'].includes(register.status)},{label:'Every assessment schedule is released',ok:rows.length>0&&rows.every(a=>a.schedule_published)},{label:'All entered marks are between zero and the total mark',ok:invalid.length===0},{label:'All entered marks have current moderation',ok:unmoderated.length===0},{label:missing?`${missing} missing marks remain Pending`:'No missing marks',ok:!missing||Boolean(override),overridden:Boolean(missing&&override)},{label:unconfirmed?`${unconfirmed} submissions have unconfirmed receipt`:'All received submissions have confirmed receipt',ok:!unconfirmed||Boolean(override),overridden:Boolean(unconfirmed&&override)}];
 const generatedEvent=await s.p(`SELECT details_json FROM assessment_events WHERE action='register-reports-generated' AND json_extract(details_json,'$.registerId')=? AND json_extract(details_json,'$.fingerprint')=? ORDER BY occurred_at DESC,event_id DESC LIMIT 1`,register.register_id,fingerprint).first();
 const generated=generatedEvent?JSON.parse(generatedEvent.details_json):null;
 const reports=generated?.reportIds?.length?(await s.p(`SELECT r.*,e.template_id,e.template_revision,t.revision current_template_revision FROM assessment_reports r JOIN assessment_report_evidence e USING(report_id) LEFT JOIN assessment_report_templates t USING(template_id) WHERE r.report_id IN(SELECT value FROM json_each(?))`,JSON.stringify(generated.reportIds)).all()).results:[];
 const reportsReady=Boolean(generated&&reports.length===generated.reportIds.length&&reports.length>0&&reports.every(r=>!r.template_id||r.template_revision===r.current_template_revision));
 const releasedReports=reports.length?(await s.p(`SELECT DISTINCT json_extract(details_json,'$.reportId') report_id FROM assessment_events WHERE action='report-released' AND json_extract(details_json,'$.reportId') IN(SELECT value FROM json_each(?))`,JSON.stringify(reports.map(r=>r.report_id))).all()).results:[];
 const result={registerId:register.register_id,name:register.name,revision:register.revision,papers:rows.map(a=>({id:a.assessment_id,revision:a.revision})),fingerprint,marks:pending.length,entered:entered.length,missing,unconfirmed,unmoderated:unmoderated.map(a=>a.title),checks,valid:checks.every(c=>c.ok),canOverride:globalAuthority(auth),override:override?{actor:override.actor_id,at:override.occurred_at,reason:JSON.parse(override.details_json).reason}:null,reportsReady,reportsCount:reports.length,reportsReleased:reportsReady&&releasedReports.length===reports.length,marksReleased:expected.size>0&&pending.length===0};
 return {register,rows,recipients,expected,byPerson,definitions,pending,reports,result};
}

export function reportReleaseStatements(s,snapshot){
 const now=new Date().toISOString(),rows=snapshot.reports.map(r=>({id:crypto.randomUUID(),assessmentId:JSON.parse(r.source_json)[0].assessmentId,accountId:r.account_id,reportId:r.report_id,activityKey:r.activity_key}));
 return rows.length?[s.p(`INSERT INTO assessment_events SELECT json_extract(value,'$.id'),json_extract(value,'$.assessmentId'),json_extract(value,'$.activityKey'),?,'report-released',json_extract(value,'$.accountId'),json_object('registerId',?,'reportId',json_extract(value,'$.reportId')),? FROM json_each(?)`,s.actor,snapshot.register.register_id,now,JSON.stringify(rows))]:[];
}

export function imtihaanWorkflow(repository,auth,s){
 async function finish(input){return s.change('register-finish',input,String(input.registerId||''),async()=>{
  const snapshot=await imtihaanMarkingSnapshot(s,input,auth),r=snapshot.register;
  if(input.confirm!==true||input.revision!==r.revision||!['COMPLETE','CANCELLED'].includes(input.status))throw fail('Confirm the current Imtihaan status change.',409,'ROW_CHANGED');
  if(input.status==='COMPLETE'){requireMarkingValidation(snapshot);if(snapshot.pending.length)throw fail('Release the moderated marks before marking this Imtihaan complete.',409,'MARKS_REQUIRED');}
  return {statements:[s.p('UPDATE assessment_registers SET status=?,revision=revision+1,updated_at=? WHERE register_id=?',input.status,new Date().toISOString(),r.register_id),s.event(snapshot.rows[0]||{activity_key:r.activityKeys[0]},'register-finish',{registerId:r.register_id,status:input.status})],result:{status:input.status}};
 });}
 async function replacementPreview(input){const a=await s.assessment(input.assessmentId),rows=await assessmentGroup(s,a)||[a];await s.requireAdminClasses(rows.map(a=>({activityKey:a.activity_key,classId:a.class_id})));return {...await paperReplacementImpact(s,rows),classes:rows.map(a=>({activityKey:a.activity_key,classId:a.class_id}))};}
 async function preview(input){return (await imtihaanMarkingSnapshot(s,input,auth)).result;}
 async function override(input){return s.change('register-marking-override',input,String(input.registerId||''),async()=>{
  if(!globalAuthority(auth))throw fail('Only Global admin can override missing marks and unconfirmed receipts.',403,'GLOBAL_ADMIN_REQUIRED');
  const snapshot=await imtihaanMarkingSnapshot(s,input,auth),r=snapshot.result,reason=typeof input.reason==='string'?input.reason.trim():'';
  if(input.fingerprint!==r.fingerprint)throw fail('Marking changed. Validate again before overriding.',409,'ROW_CHANGED');
  if(input.confirm!==true||!reason||reason.length>1000)throw fail('Confirm the override and enter a reason of up to 1000 characters.');
  if(r.checks.slice(0,4).some(c=>!c.ok))throw fail('Invalid or unmoderated marks cannot be overridden.',409,'MARKING_NOT_READY');
  return {statements:[s.event(snapshot.rows[0],'register-marking-override',{registerId:r.registerId,fingerprint:r.fingerprint,missing:r.missing,unconfirmed:r.unconfirmed,reason})],result:{overridden:true}};
 });}
 async function reportPlan(input){
  const snapshot=await imtihaanMarkingSnapshot(s,input,auth);requireMarkingValidation(snapshot);
  const classes=new Map();for(const a of snapshot.rows){const key=personKey(a.activity_key,a.class_id);if(!classes.has(key))classes.set(key,{activityKey:a.activity_key,classId:a.class_id,className:a.class_name,activityName:a.activity_name,assessments:[]});classes.get(key).assessments.push(a);}
  const targets=[];for(const c of classes.values()){
   const people=new Map();for(const a of c.assessments)for(const r of snapshot.expected.values())if(r.assessment_id===a.assessment_id)people.set(r.account_id,r.display_name||r.current_name);
   targets.push({...c,assessments:c.assessments.map(a=>a.assessment_id),learners:[...people].map(([id,name])=>({id,name,results:c.assessments.map(a=>{const r=snapshot.byPerson.get(personKey(a.assessment_id,id));return {assessmentId:a.assessment_id,title:a.title,subject:a.subject,maximumMark:a.maximum_mark,mark:r?.mark_state==='APPROVED'?r.mark:null,markId:r?.mark_state==='APPROVED'?r.latest_mark_id:null,definitionHash:snapshot.definitions.get(a.assessment_id)};})})).sort((a,b)=>a.name.localeCompare(b.name,'en',{sensitivity:'base',numeric:true}))});
  }
  return {name:snapshot.register.name,fingerprint:snapshot.result.fingerprint,classes:targets,timezone:(await repository.homeConfiguration()).setting_value};
 }
 async function generate(input){return s.change('register-reports-generate',input,String(input.registerId||''),async()=>{
  const snapshot=await imtihaanMarkingSnapshot(s,input,auth);requireMarkingValidation(snapshot);
  if(input.fingerprint!==snapshot.result.fingerprint)throw fail('Marking changed. Generate updated reports.',409,'REPORT_SOURCE_CHANGED');
  if(!Array.isArray(input.reports)||!input.reports.length||input.reports.length>1000||input.reviewed!==true)throw fail('Review between one and 1000 generated learner PDFs before saving them.');
  const files=(await s.p(`SELECT f.*,i.sha256 FROM assessment_files f JOIN assessment_file_integrity i USING(file_id) WHERE f.file_id IN(SELECT json_extract(value,'$.fileId') FROM json_each(?))`,JSON.stringify(input.reports)).all()).results,byFile=new Map(files.map(f=>[f.file_id,f]));
  const templates=(await s.p(`SELECT * FROM assessment_report_templates WHERE template_id IN(SELECT json_extract(value,'$.templateId') FROM json_each(?))`,JSON.stringify(input.designs||[])).all()).results;
  const expectedPeople=new Set([...snapshot.expected.values()].map(r=>{const a=snapshot.rows.find(a=>a.assessment_id===r.assessment_id);return JSON.stringify([a.activity_key,a.class_id,r.account_id]);})),seen=new Set(),reports=[],evidence=[],events=[],now=new Date().toISOString();
  for(const item of input.reports){
   const file=byFile.get(item.fileId),key=JSON.stringify([item.activityKey,item.classId,item.accountId]),design=(input.designs||[]).find(d=>d.activityKey===item.activityKey&&d.classId===item.classId);
   if(!expectedPeople.has(key)||seen.has(key)||!file||!snapshot.rows.some(a=>a.assessment_id===file.assessment_id&&a.activity_key===item.activityKey&&a.class_id===item.classId)||file.kind!=='REPORT'||file.activity_key!==item.activityKey||file.owner_id!==item.accountId||file.uploaded_by!==s.actor||file.sha256!==item.sha256)throw fail('Review the exact PDF for each authorised learner.',403,'REPORT_REVIEW_REQUIRED');
   seen.add(key);const layout=validateAssessmentLayout(design?.layout),template=design?.templateId?templates.find(t=>t.template_id===design.templateId):null;
   if(design?.templateId&&(!template||template.activity_key!==item.activityKey||template.revision!==design.templateRevision))throw fail('The report template changed. Review the reports again.',409,'ROW_CHANGED');
   if(design?.backgroundFileId&&!await s.p("SELECT 1 ok FROM assessment_files WHERE file_id=? AND activity_key=? AND kind='TEMPLATE'",design.backgroundFileId,item.activityKey).first())throw fail('Choose an authorised report background.',403);
   const source=snapshot.rows.filter(a=>a.activity_key===item.activityKey&&a.class_id===item.classId).map(a=>{const r=snapshot.byPerson.get(personKey(a.assessment_id,item.accountId));return {assessmentId:a.assessment_id,markId:r?.mark_state==='APPROVED'?r.latest_mark_id:null,definitionHash:snapshot.definitions.get(a.assessment_id)};});
   const id=crypto.randomUUID();reports.push({id,activityKey:item.activityKey,classId:item.classId,accountId:item.accountId,fileId:file.file_id,source:JSON.stringify(source)});evidence.push({id,sha256:file.sha256,source:JSON.stringify(source),templateId:design.templateId||null,templateRevision:design.templateRevision||null,layout:JSON.stringify(layout),background:design.backgroundFileId||null});events.push({id:crypto.randomUUID(),assessmentId:source[0].assessmentId,activityKey:item.activityKey,accountId:item.accountId,reportId:id});
  }
  if(seen.size!==expectedPeople.size)throw fail('Generate one report for every learner in this Imtihaan.',409,'REPORTS_INCOMPLETE');
  const statements=[s.p(`INSERT INTO assessment_reports SELECT json_extract(value,'$.id'),json_extract(value,'$.activityKey'),json_extract(value,'$.classId'),json_extract(value,'$.accountId'),json_extract(value,'$.fileId'),json_extract(value,'$.source'),?,? FROM json_each(?)`,now,s.actor,JSON.stringify(reports)),s.p(`INSERT INTO assessment_report_evidence SELECT json_extract(value,'$.id'),json_extract(value,'$.sha256'),json_extract(value,'$.source'),json_extract(value,'$.templateId'),json_extract(value,'$.templateRevision'),json_extract(value,'$.layout'),json_extract(value,'$.background'),?,? FROM json_each(?)`,now,s.actor,JSON.stringify(evidence)),s.p(`INSERT INTO assessment_events SELECT json_extract(value,'$.id'),json_extract(value,'$.assessmentId'),json_extract(value,'$.activityKey'),?,'report-staged',json_extract(value,'$.accountId'),json_object('registerId',?,'reportId',json_extract(value,'$.reportId')),? FROM json_each(?)`,s.actor,snapshot.register.register_id,now,JSON.stringify(events)),s.event(snapshot.rows[0],'register-reports-generated',{registerId:snapshot.register.register_id,fingerprint:snapshot.result.fingerprint,reportIds:reports.map(r=>r.id)})];
  return {statements,result:{generated:reports.length}};
 });}
 async function releaseReports(input){return s.change('register-reports-release',input,String(input.registerId||''),async()=>{
  const snapshot=await imtihaanMarkingSnapshot(s,input,auth);requireMarkingValidation(snapshot);
  if(input.confirm!==true||input.fingerprint!==snapshot.result.fingerprint)throw fail('Confirm the current validated reports before release.',409,'ROW_CHANGED');
  if(!snapshot.result.reportsReady)throw fail('Generate current reports before releasing them.',409,'REPORTS_REQUIRED');
  if(!snapshot.result.marksReleased)throw fail('Release marks first, or choose reports with marks in the marks-release confirmation.',409,'MARKS_REQUIRED');
  return {statements:reportReleaseStatements(s,snapshot),result:{released:snapshot.reports.length}};
 });}
 return {run:(action,input)=>action==='register-finish'?finish(input):action==='papers-validate'?imtihaanPaperValidation(s,input,Boolean(repository.features?.nativeAttendance)):action==='paper-replacement-preview'?replacementPreview(input):action==='register-marking-validate'?preview(input):action==='register-marking-override'?override(input):action==='register-reports-plan'?reportPlan(input):action==='register-reports-generate'?generate(input):releaseReports(input)};
}
