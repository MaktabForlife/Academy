import {assessmentResultsSQL} from './assessment-results.js';
import {cleanText} from './assessment-store.js';
import {managementError as fail} from './management-store.js';
import {statusValidation,requireValidStatus} from './assessment-validation.js';

export const registerStatuses=[['REGISTERED','Registered'],['DRAFT','Draft'],['SCHEDULED','Scheduled'],['SCHEDULE_RELEASED','Schedule released'],['AWAITING_MODERATION','Awaiting moderation'],['APPROVED','Approved'],['PUBLISHED','Published'],['IN_PROGRESS','In progress'],['READY_FOR_ASSESSMENT','Ready for assessment'],['ASSESSED','Assessed'],['MODERATED','Moderated'],['READY_FOR_RELEASE','Ready for release'],['RELEASED','Released'],['COMPLETE','Complete'],['ARCHIVED','Archived'],['CANCELLED','Cancelled']];
export const imtihaanStatuses=[['REGISTERED','Registered'],['SCHEDULED','Scheduled'],['IN_PROGRESS','In progress'],['BEING_ASSESSED','Being assessed'],['COMPLETE','Complete'],['ARCHIVED','Archived'],['CANCELLED','Cancelled']];
function imtihaanStage(status,summary){
 if(status==='CANCELLED'||status==='ARCHIVED')return status;
 if(!summary?.papers)return 'REGISTERED';
 const answers=Number(summary.answers||0),released=Number(summary.released||0),outstanding=Number(summary.outstanding||0);
 const lastDay=Date.now()>=Date.parse(summary.last_day+'T03:00:00+02:00');
 if(lastDay&&answers>0&&released===answers&&!outstanding)return 'COMPLETE';
 if(lastDay&&summary.published)return 'BEING_ASSESSED';
 if(summary.published)return 'IN_PROGRESS';
 return ['REGISTERED','DRAFT'].includes(status)?'REGISTERED':'SCHEDULED';
}
const areaRows=(s,id)=>s.p('SELECT activity_key FROM assessment_register_areas WHERE register_id=? ORDER BY activity_key',id).all().then(r=>r.results.map(a=>a.activity_key));
export async function registerRecord(s,id){const row=await s.p('SELECT * FROM assessment_registers WHERE register_id=?',String(id||'')).first();if(!row)throw fail('Imtihaan not found.',404);return {...row,activityKeys:await areaRows(s,row.register_id)};}
const areaStatement=(s,id,keys)=>s.p('INSERT INTO assessment_register_areas SELECT ?,value FROM json_each(?)',id,JSON.stringify(keys));
export function newRegisterStatements(s,{id,name,keys,classMode='ALL',classActivityKey=null,classId=null,status='REGISTERED',phaseId=null}){
 const now=new Date().toISOString();
 return [s.p('INSERT INTO assessment_registers(register_id,name,class_mode,class_activity_key,class_id,status,legacy_phase_id,created_at,created_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)',id,name,classMode,classActivityKey,classId,status,phaseId,now,s.actor,now),areaStatement(s,id,keys)];
}
export async function legacyRegisterPlan(s,{activityKey,classId,title,phaseId}){
 const phase=phaseId?await s.p('SELECT * FROM assessment_phases WHERE phase_id=?',phaseId).first():null;
 const old=phase?await s.p('SELECT register_id FROM assessment_registers WHERE legacy_phase_id=?',phaseId).first():await s.p("SELECT r.register_id FROM assessment_registers r WHERE r.name=? AND r.class_mode='ONE' AND r.class_activity_key=? AND r.class_id=? AND r.legacy_phase_id IS NULL AND (SELECT count(*) FROM assessment_register_areas a WHERE a.register_id=r.register_id)=1 ORDER BY created_at LIMIT 1",title,activityKey,classId).first();
 if(old)return {id:old.register_id,statements:[]};
 const id=crypto.randomUUID();return {id,statements:newRegisterStatements(s,{id,name:phase?.name||title,keys:[activityKey],classMode:phase?'ALL':'ONE',classActivityKey:phase?null:activityKey,classId:phase?null:classId,status:'SCHEDULED',phaseId:phaseId||null})};
}
export async function requireRegisterClass(s,id,activityKey,classId,record=null){
 const r=record||await registerRecord(s,id);
 if(!r.activityKeys.includes(activityKey)||r.class_mode==='ONE'&&(r.class_activity_key!==activityKey||r.class_id!==classId))throw fail('Choose a class included in this Imtihaan.',403);
 return r;
}
export async function registerList(s,input){
 const classes=await s.classes('admin'),keys=new Set(classes.map(c=>c.activity_key));
 const rows=(await s.p(`SELECT r.*,a.activity_key,a2.name activity_name,a2.kind,c.name class_name FROM assessment_registers r JOIN assessment_register_areas a USING(register_id) JOIN activities a2 USING(activity_key) LEFT JOIN classes c ON c.activity_key=r.class_activity_key AND c.class_id=r.class_id WHERE r.register_id IN(SELECT register_id FROM assessment_register_areas WHERE activity_key IN(SELECT value FROM json_each(?))) ORDER BY r.created_at DESC,r.register_id,a2.name LIMIT 10001`,JSON.stringify([...keys])).all()).results;
 if(rows.length>10000)throw fail('Choose a Program or Course to narrow the Imtihaan Register.',409);
 const grouped=new Map();for(const row of rows){if(!grouped.has(row.register_id))grouped.set(row.register_id,{id:row.register_id,name:row.name,status:row.status,revision:row.revision,classMode:row.class_mode,classActivityKey:row.class_activity_key,classId:row.class_id,className:row.class_name||'',areas:[],canEdit:true});const r=grouped.get(row.register_id);r.areas.push({key:row.activity_key,name:row.activity_name,kind:row.kind});if(!keys.has(row.activity_key))r.canEdit=false;}
 const ids=[...grouped.keys()];
 const summaries=ids.length?(await s.p(`SELECT a.register_id,count(DISTINCT a.assessment_id) papers,max(a.exam_date) last_day,
  count(DISTINCT CASE WHEN a.schedule_published=1 THEN a.assessment_id END) schedules_released,
  max(CASE WHEN a.paper_released_at IS NOT NULL THEN 1 ELSE 0 END) published,
  sum(CASE WHEN r.latest_submission_id IS NOT NULL OR m.manual=1 THEN 1 ELSE 0 END) answers,
  sum(CASE WHEN (m.manual=1 OR r.latest_submission_id=m.submission_id) AND m.state='APPROVED' THEN 1 ELSE 0 END) moderated,
  sum(CASE WHEN (m.manual=1 OR r.latest_submission_id=m.submission_id) AND m.state='APPROVED' AND r.released_mark_id=m.mark_id THEN 1 ELSE 0 END) released,
  sum(CASE WHEN r.resubmit_authorised=1 THEN 1 ELSE 0 END) outstanding
 FROM assessments a LEFT JOIN assessment_recipients r USING(assessment_id) LEFT JOIN (${assessmentResultsSQL}) m ON m.mark_id=r.latest_mark_id
 WHERE a.deleted_at IS NULL AND a.register_id IN(SELECT value FROM json_each(?)) GROUP BY a.register_id`,JSON.stringify(ids)).all()).results:[];
 const summaryById=new Map(summaries.map(row=>[row.register_id,row]));
 const registers=[...grouped.values()].map(r=>{const summary=summaryById.get(r.id),scheduleCount=Number(summary?.papers||0),releasedScheduleCount=Number(summary?.schedules_released||0);return {...r,imtihaanStatus:imtihaanStage(r.status,summary),scheduleCount,releasedScheduleCount,scheduleReleased:scheduleCount>0&&scheduleCount===releasedScheduleCount};}).filter(r=>(!input.activityKey||r.areas.some(a=>a.key===input.activityKey))&&(!['PROGRAM','COURSE'].includes(input.kind)||r.areas.some(a=>a.kind===input.kind)));
 return {registers,registerClasses:classes,registerStatuses,imtihaanStatuses};
}
async function fields(s,input,current=null){
 const name=cleanText(input.name,160,'an Imtihaan name'),keys=input.activityKeys;
 if(!Array.isArray(keys)||!keys.length||keys.length>50||keys.some(k=>typeof k!=='string')||new Set(keys).size!==keys.length)throw fail('Choose one or more Programs/Courses.');
 const allowed=new Set((await s.classes('admin')).map(c=>c.activity_key));
 if([...keys,...(current?.activityKeys||[])].some(k=>!allowed.has(k)))throw fail('This assessment includes a learning area outside your administration access.',403);
 if(!registerStatuses.some(([key])=>key===input.status))throw fail('Choose a valid Imtihaan status.');
 if(!['ONE','ALL'].includes(input.classMode))throw fail('Choose one class or All classes.');
 const one=input.classMode==='ONE',classKey=one?input.classActivityKey:null,classId=one?input.classId:null;
 if(one){if(!keys.includes(classKey))throw fail('Choose a class in the selected Programs/Courses.');await s.requireClass(classKey,classId,'admin');}
 if(current){
  const rows=(await s.p('SELECT DISTINCT activity_key,class_id FROM assessments WHERE register_id=? AND deleted_at IS NULL',current.register_id).all()).results;
  if(rows.some(r=>!keys.includes(r.activity_key)||one&&(r.activity_key!==classKey||r.class_id!==classId)))throw fail('This selection excludes a class with saved assessment dates. Keep that class included.',409);
 }
 return {name,keys:[...keys].sort(),classMode:input.classMode,classActivityKey:classKey,classId,status:input.status};
}
export async function createRegister(s,input){return s.change('register-create',input,'REGISTER:'+s.actor,async()=>{
 const v=await fields(s,input),id=crypto.randomUUID();
 requireValidStatus(await statusValidation(s,null,v.status));
 return {statements:[...newRegisterStatements(s,{id,...v}),s.event({activity_key:v.keys[0]},'register-create',{registerId:id,name:v.name})],result:{registerId:id}};
});}
export async function saveRegister(s,input){return s.change('register-save',input,String(input.registerId||''),async()=>{
 const r=await registerRecord(s,input.registerId);if(input.revision!==r.revision)throw fail('This Imtihaan changed elsewhere. Refresh before saving.',409,'ROW_CHANGED');
 const v=await fields(s,input,r),now=new Date().toISOString();
 if(v.status!==r.status||v.status==='SCHEDULED')requireValidStatus(await statusValidation(s,r.register_id,v.status));
 const release=v.status==='SCHEDULED'?await scheduleReleasePlan(s,r):{statements:[]};
 const statements=[...release.statements,s.p('UPDATE assessment_registers SET name=?,class_mode=?,class_activity_key=?,class_id=?,status=?,revision=revision+1,updated_at=? WHERE register_id=?',v.name,v.classMode,v.classActivityKey,v.classId,v.status,now,r.register_id),s.p('DELETE FROM assessment_register_areas WHERE register_id=?',r.register_id),areaStatement(s,r.register_id,v.keys)];
 // The Imtihaan is the group. Its name is independent of each assessment paper.
 statements.push(s.event({activity_key:v.keys[0]},'register-save',{registerId:r.register_id,previousName:r.name,name:v.name,previousStatus:r.status,status:v.status,activityKeys:v.keys,classMode:v.classMode,classId:v.classId}));
 return {statements,result:{registerId:r.register_id,revision:r.revision+1}};
});}
export async function validateRegister(s,input){
 const r=input.registerId?await registerRecord(s,input.registerId):null;
 if(r&&input.revision!==r.revision)throw fail('This Imtihaan changed elsewhere. Refresh before validating.',409,'ROW_CHANGED');
 const v=await fields(s,input,r);
 return statusValidation(s,r?.register_id,v.status);
}

async function scheduleReleasePlan(s,register){
 const allowed=new Set((await s.classes('admin')).map(c=>c.activity_key));
 if(register.activityKeys.some(key=>!allowed.has(key)))throw fail('This Imtihaan includes a learning area outside your administration access.',403,'FORBIDDEN');
 if(['CANCELLED','ARCHIVED'].includes(register.status))throw fail('A cancelled or archived Imtihaan cannot release its schedule.',409);
 const dates=(await s.p('SELECT * FROM assessments WHERE register_id=? AND deleted_at IS NULL ORDER BY exam_date,assessment_id LIMIT 1001',register.register_id).all()).results;
 if(dates.length>1000)throw fail('This Imtihaan has too many assessments to release together.',409);
 requireValidStatus(await statusValidation(s,register.register_id,'SCHEDULED'));
 const pending=dates.filter(a=>!a.schedule_published),recipients=[],events=[],now=new Date().toISOString();
 for(const a of pending){
  await s.requireClass(a.activity_key,a.class_id,'admin');
  if(!register.activityKeys.includes(a.activity_key)||register.class_mode==='ONE'&&(register.class_activity_key!==a.activity_key||register.class_id!==a.class_id))throw fail('An assessment is outside this Imtihaan’s class selection.',409);
  const rows=await s.roster(a);if(!rows.length)throw fail(`This assessment class has no eligible learners: ${a.title} · ${a.exam_date}. Check its enrolments before release.`,409);
  if(rows.length>2000)throw fail('Split this class into smaller assessment groups.',409);
  if(recipients.length+rows.length>25000)throw fail('Split this Imtihaan into smaller groups before releasing its schedule.',409);
  recipients.push(...rows.map(r=>({assessmentId:a.assessment_id,accountId:r.account_id,name:r.display_name})));
  events.push({id:crypto.randomUUID(),assessmentId:a.assessment_id,activityKey:a.activity_key});
 }
 const ids=pending.map(a=>a.assessment_id),statements=ids.length?[
  s.p(`INSERT INTO assessment_recipients(assessment_id,account_id,display_name) SELECT json_extract(value,'$.assessmentId'),json_extract(value,'$.accountId'),json_extract(value,'$.name') FROM json_each(?) WHERE 1 ON CONFLICT(assessment_id,account_id) DO NOTHING`,JSON.stringify(recipients)),
  s.p('UPDATE assessments SET schedule_published=1,revision=revision+1,updated_at=? WHERE assessment_id IN(SELECT value FROM json_each(?))',now,JSON.stringify(ids)),
  s.p(`INSERT INTO assessment_events(event_id,assessment_id,activity_key,actor_id,action,account_id,details_json,occurred_at) SELECT json_extract(value,'$.id'),json_extract(value,'$.assessmentId'),json_extract(value,'$.activityKey'),?,'publish',NULL,?,? FROM json_each(?)`,s.actor,JSON.stringify({registerId:register.register_id,release:'IMTIHAAN'}),now,JSON.stringify(events))
 ]:[];
 return {statements,released:ids.length,total:dates.length};
}
export async function releaseRegister(s,input){return s.change('register-release',input,String(input.registerId||''),async()=>{
 const r=await registerRecord(s,input.registerId);if(input.revision!==r.revision)throw fail('This Imtihaan changed elsewhere. Refresh before releasing its schedule.',409,'ROW_CHANGED');
 const plan=await scheduleReleasePlan(s,r),status=['REGISTERED','DRAFT','SCHEDULED'].includes(r.status)?'SCHEDULED':r.status;
 return {statements:[...plan.statements,s.p('UPDATE assessment_registers SET status=?,revision=revision+1,updated_at=? WHERE register_id=?',status,new Date().toISOString(),r.register_id),s.event({activity_key:r.activityKeys[0]},'register-release',{registerId:r.register_id,released:plan.released,total:plan.total})],result:{registerId:r.register_id,revision:r.revision+1,released:plan.released,total:plan.total,setupScopes:[...r.activityKeys,...(r.class_activity_key?[]:['GLOBAL'])]}};
});}
