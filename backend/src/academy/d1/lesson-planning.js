import {managementStore,managementError as fail,same,liveRoles} from './management-store.js';
import {optionalSchema} from './schema-probe.js';
import {dateInTimezone} from '../../lib/global-subject-delivery.js';
import {addDays,lessonTimes} from '../entrance.js';
import {scheduledLessons} from '../../programs/attendance-model.js';

const dateOK=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s+'T12:00:00Z'))&&addDays(s,0)===s;
export const planningMonday=s=>addDays(s,-((new Date(s+'T12:00:00Z').getUTCDay()+6)%7));
const text=(s,max,label,required=false)=>{if(typeof s!=='string'||s.length>max||required&&!s.trim())throw fail('Enter '+label+'.');return s.trim();};
const defaults={weeklyDay:0,weeklyTime:'18:00',courseLeadDays:3,revision:0};
const identity=r=>[r.activityKey,r.runId,r.teacherId,r.period,r.weekStart].join('|');
const fromRow=r=>({activityKey:r.activity_key,runId:r.run_id,teacherId:r.teacher_id,period:r.period,weekStart:r.week_start});
export function planningInstant(date,time,timezone){const n=lessonTimes({date,startTime:time,endTime:time,timezone}).startsAt;if(!Number.isFinite(n))throw fail('That local deadline is not a valid clock time.');return new Date(n).toISOString();}
function normalizeContent(input,submitted){
 if(!input||typeof input!=='object'||!Array.isArray(input.lessons)||input.lessons.length>60)throw fail('Use up to 60 lesson sections.');
 const result={title:text(input.title??'',160,'a plan title',submitted),overview:text(input.overview??'',6000,'a shorter weekly overview'),reflection:text(input.reflection??'',6000,'shorter reflections'),lessons:input.lessons.map(r=>{
  if(!r||typeof r!=='object')throw fail('Enter a valid lesson section.');
  const date=text(r.date??'',10,'a lesson date');if(date&&!dateOK(date))throw fail('Choose a valid lesson date.');
  return {date,className:text(r.className??'',160,'a shorter class name'),subject:text(r.subject??'',200,'a shorter lesson title'),objectives:text(r.objectives??'',2000,'shorter objectives'),activities:text(r.activities??'',6000,'shorter activities'),resources:text(r.resources??'',2000,'shorter resources')};
 })};
 if(JSON.stringify(result).length>60000)throw fail('Keep this plan below 60,000 characters.');
 if(submitted&&!result.overview&&!result.lessons.some(r=>r.activities||r.objectives))throw fail('Add an overview or lesson activities before submitting.');
 return result;
}
export function lessonPlanning(repository,auth,now=()=>new Date()){
 const store=managementStore(repository,auth),p=store.p,actor=auth.user.accountid;
 const global=Boolean(auth.state.account.global_admin);
 const keys=global?null:[...new Set(auth.state.roles.filter(r=>['TEACHER','PROGRAM_ADMIN'].includes(r.role)).map(r=>r.activity_key))];
 const filter=keys===null?'1':'activity_key IN (SELECT value FROM json_each(?))';
 const q=table=>keys===null?p('SELECT * FROM '+table):p('SELECT * FROM '+table+' WHERE '+filter,JSON.stringify(keys));
 async function load(input={}){
  if(!await optionalSchema(repository.db,'SELECT plan_id FROM lesson_plans WHERE 0'))throw fail('Lesson planning needs its database upgrade.',503,'PLANNING_SCHEMA_REQUIRED');
  const config=await repository.homeConfiguration(),tz=config?.setting_value||'Africa/Johannesburg',week=planningMonday(dateOK(input.weekStart)?input.weekStart:dateInTimezone(now(),tz));
  const planQuery=p(`SELECT * FROM lesson_plans WHERE ${filter} AND (period='ENTIRE' OR week_start=?)`,...(keys===null?[]:[JSON.stringify(keys)]),week);
  return store.load({plans:planQuery,policies:q('lesson_plan_policies'),preferences:q('lesson_plan_preferences'),deadlines:q('lesson_plan_deadlines'),runs:q('course_runs'),runStates:q('course_run_state'),sessions:q('course_draft_sessions')});
 }
 const admin=(d,key)=>global||liveRoles(d,actor,key).includes('PROGRAM_ADMIN');
 const staff=(d,key)=>admin(d,key)||liveRoles(d,actor,key).includes('TEACHER');
 const areas=(d,view)=>d.activities.filter(a=>a.active&&a.lifecycle==='ACTIVE'&&['PROGRAM','COURSE'].includes(a.kind)&&(view==='admin'?admin(d,a.activity_key):staff(d,a.activity_key)));
 const timezone=async d=>{const config=await repository.homeConfiguration();return config?.setting_value||'Africa/Johannesburg';};
 function policy(d,key){const r=d.policies.find(r=>same(r.activity_key,key));return r?{weeklyDay:r.weekly_day,weeklyTime:r.weekly_time,courseLeadDays:r.course_lead_days,revision:r.revision}:defaults;}
 function runList(d,key){return d.runs.filter(r=>same(r.activity_key,key)&&r.active&&!d.runStates.some(s=>same(s.activity_key,key)&&same(s.run_id,r.run_id)&&['CANCELLED','ARCHIVED'].includes(s.stage)));}
 function firstDate(d,run){return run.start_date||d.sessions.filter(s=>same(s.activity_key,run.activity_key)&&same(s.run_id,run.run_id)&&s.session_kind!=='BREAK').map(s=>s.session_date).sort()[0]||'';}
 function normalizeKey(d,input,write=false){
  const a=d.activities.find(a=>same(a.activity_key,input.activityKey)&&a.active&&a.lifecycle==='ACTIVE');
  if(!a||!staff(d,a.activity_key))throw fail('This learning area is outside your planning access.',403,'FORBIDDEN');
  const teacherId=input.teacherId||actor,account=d.accounts.find(u=>same(u.account_id,teacherId));
  if(!account||write&&(!same(teacherId,actor)||!staff(d,a.activity_key))||!same(teacherId,actor)&&!admin(d,a.activity_key))throw fail('You may edit your own plans and view submitted plans in areas you administer.',403,'FORBIDDEN');
  const period=input.period||'WEEKLY';if(!['WEEKLY','ENTIRE'].includes(period)||a.kind==='PROGRAM'&&period!=='WEEKLY')throw fail('Programs use weekly plans. Courses support weekly or entire-course plans.');
  const run=a.kind==='COURSE'?runList(d,a.activity_key).find(r=>same(r.run_id,input.runId)):null;
  if(a.kind==='COURSE'&&!run)throw fail('Choose an active Course offering.');
  let weekStart='';if(period==='WEEKLY'){if(!dateOK(input.weekStart))throw fail('Choose a valid teaching week.');weekStart=planningMonday(input.weekStart);}
  return {activityKey:a.activity_key,runId:run?.run_id||'',teacherId:account.account_id,period,weekStart};
 }
 function find(d,key){return d.plans.find(r=>identity(fromRow(r))===identity(key));}
 function deadline(d,key,tz){
  const override=d.deadlines.find(r=>identity(fromRow(r))===identity(key));if(override)return {dueAt:override.due_at,deadlineRevision:override.revision,reason:override.reason};
  const submitted=find(d,key);if(submitted?.submitted_due_at)return {dueAt:submitted.submitted_due_at,deadlineRevision:0,reason:''};
  const config=policy(d,key.activityKey);let date='';
  if(key.period==='WEEKLY')date=addDays(key.weekStart,((config.weeklyDay+6)%7)-7);
  else{const run=d.runs.find(r=>same(r.activity_key,key.activityKey)&&same(r.run_id,key.runId)),first=run&&firstDate(d,run);if(first)date=addDays(first,-config.courseLeadDays);}
  return {dueAt:date?planningInstant(date,key.period==='WEEKLY'?config.weeklyTime:'18:00',tz):null,deadlineRevision:0,reason:''};
 }
 function summary(d,key,tz){
  const r=find(d,key),due=deadline(d,key,tz),a=d.activities.find(a=>same(a.activity_key,key.activityKey)),u=d.accounts.find(u=>same(u.account_id,key.teacherId)),run=d.runs.find(r=>same(r.activity_key,key.activityKey)&&same(r.run_id,key.runId));
  const status=r?.submitted_at?(!due.dueAt?'SUBMITTED':r.submitted_at>due.dueAt?'SUBMITTED_LATE':'SUBMITTED_ON_TIME'):(due.dueAt&&now().toISOString()>due.dueAt?'OVERDUE':'DUE');
  return {...key,...due,planId:r?.plan_id||'',revision:r?.revision||0,activityName:a.name,kind:a.kind,teacherName:u.display_name,runName:run?.name||'',status,submittedAt:r?.submitted_at||'',lastSubmittedAt:r?.last_submitted_at||'',submittedRevision:r?.submitted_revision||0,hasDraft:same(key.teacherId,actor)&&Boolean(r),draftChanged:same(key.teacherId,actor)&&Boolean(r?.submitted_json&&r.draft_json!==r.submitted_json)};
 }
 async function list(input){
  const d=await load(input),tz=await timezone(d),view=input.view==='admin'?'admin':'teacher',available=areas(d,view);
  if(view==='admin'&&!available.length)throw fail('Planning management requires Program or Course Admin access.',403,'FORBIDDEN');
  if(!available.length)throw fail('Planning requires a teaching assignment.',403,'FORBIDDEN');
  const date=input.weekStart||dateInTimezone(now(),tz);if(!dateOK(date))throw fail('Choose a valid teaching week.');const week=planningMonday(date);
  const selected=input.activityKey?available.filter(a=>same(a.activity_key,input.activityKey)):available;
  if(input.activityKey&&!selected.length)throw fail('This area is outside your planning access.',403,'FORBIDDEN');
  const expected=new Map();
  for(const a of selected){
   const teachers=view==='admin'?d.accounts.filter(u=>u.active&&liveRoles(d,u.account_id,a.activity_key).includes('TEACHER')):d.accounts.filter(u=>same(u.account_id,actor));
   const runs=a.kind==='PROGRAM'?[null]:runList(d,a.activity_key);
   for(const u of teachers)for(const run of runs){
    const preference=d.preferences.find(r=>same(r.activity_key,a.activity_key)&&same(r.teacher_id,u.account_id)&&same(r.run_id,run?.run_id||''));
    const period=a.kind==='PROGRAM'?'WEEKLY':preference?.period||'WEEKLY';
    if(run&&period==='WEEKLY'&&(run.end_date&&run.end_date<week||firstDate(d,run)&&firstDate(d,run)>addDays(week,6)))continue;
    const key={activityKey:a.activity_key,teacherId:u.account_id,runId:run?.run_id||'',period,weekStart:period==='WEEKLY'?week:''};expected.set(identity(key),key);
   }
  }
  for(const r of d.plans)if(selected.some(a=>same(a.activity_key,r.activity_key))&&(view==='admin'||same(r.teacher_id,actor))&&(r.period==='ENTIRE'||r.week_start===week)&&(r.submitted_at||view==='teacher'))expected.set(identity(fromRow(r)),fromRow(r));
  if(expected.size>2000)throw fail('Select one learning area to narrow the plans board.',409);
  return {view,timezone:tz,weekStart:week,accountId:actor,canAdmin:areas(d,'admin').length>0,areas:available.map(a=>({key:a.activity_key,name:a.name,kind:a.kind,policy:policy(d,a.activity_key),runs:runList(d,a.activity_key).map(r=>({id:r.run_id,name:r.name,startDate:firstDate(d,r),endDate:r.end_date||'',period:d.preferences.find(x=>same(x.activity_key,a.activity_key)&&same(x.run_id,r.run_id)&&same(x.teacher_id,actor))?.period||'WEEKLY'}))})),plans:[...expected.values()].map(k=>summary(d,k,tz)).sort((a,b)=>a.activityName.localeCompare(b.activityName)||a.teacherName.localeCompare(b.teacherName))};
 }
 async function get(input){
  const d=await load(input),key=normalizeKey(d,input),tz=await timezone(d),r=find(d,key),own=same(key.teacherId,actor);
  if(!own&&!r?.submitted_at)throw fail('This plan has not been submitted yet.',409,'PLAN_NOT_SUBMITTED');
  let content=r?JSON.parse(own?r.draft_json:r.submitted_json):{title:'Weekly teaching plan',overview:'',reflection:'',lessons:[]};
  if(!r&&key.period==='ENTIRE')content.title='Entire-course teaching plan';
  if(!r&&key.period==='WEEKLY'&&key.activityKey.startsWith('PROGRAM:')){
   const publications=(await p('SELECT p.*,l.status lifecycle FROM timetable_publications p LEFT JOIN program_publication_lifecycle l USING(activity_key,publication_id) WHERE p.activity_key=?',key.activityKey).all()).results;
   const classes=(await p('SELECT t.class_id FROM class_teacher_assignments t JOIN classes c USING(activity_key,class_id) WHERE t.activity_key=? AND t.account_id=? AND c.active=1',key.activityKey,actor).all()).results;
   const rows=publications.map(r=>({PublicationID:r.publication_id,VersionNo:r.version_no,SnapshotJSON:r.snapshot_json,PublishedDate:r.published_at,PublishedByAccountID:r.published_by_source_id,Lifecycle:r.lifecycle||''}));
   for(let day=0;day<7;day++)for(const lesson of scheduledLessons(rows,{id:key.activityKey.slice(8)},addDays(key.weekStart,day)))if(lesson.teacherIds.some(id=>same(id,actor))||lesson.classIds.some(id=>classes.some(c=>same(c.class_id,id))))content.lessons.push({date:lesson.date,className:lesson.classNames.join(', '),subject:lesson.subjectName||lesson.moduleName,objectives:'',activities:'',resources:''});
  }
  if(!r&&key.activityKey.startsWith('COURSE:'))content.lessons=d.sessions.filter(s=>same(s.activity_key,key.activityKey)&&same(s.run_id,key.runId)&&same(s.teacher_account_id,actor)&&s.session_kind!=='BREAK'&&(key.period==='ENTIRE'||s.session_date>=key.weekStart&&s.session_date<=addDays(key.weekStart,6))).slice(0,60).map(s=>({date:s.session_date,className:'',subject:s.description||'Lesson',objectives:'',activities:'',resources:''}));
  if(content.lessons.length>60)content.lessons=content.lessons.slice(0,60);
  const comments=r?(await p('SELECT c.*,a.display_name FROM lesson_plan_comments c JOIN accounts a ON a.account_id=c.actor_id WHERE c.plan_id=? ORDER BY c.created_at,c.comment_id',r.plan_id).all()).results.map(c=>({id:c.comment_id,author:c.display_name,at:c.created_at,body:c.body,submittedRevision:c.submitted_revision})):[];
  return {...summary(d,key,tz),timezone:tz,canEdit:own,canComment:admin(d,key.activityKey)&&Boolean(r?.submitted_at),content,comments};
 }
 async function write(action,input){
  const adminAction=['policy','deadline','comment'].includes(action),dataset=adminAction?'LESSON_PLAN_ADMIN':'LESSON_PLANS';
  if(typeof input.activityKey!=='string'||input.activityKey.length>200)throw fail('Choose a learning area.');
  return store.change(dataset,input.activityKey,action,input,async()=>{
   const d=await load(input),a=d.activities.find(a=>same(a.activity_key,input.activityKey)&&a.active&&a.lifecycle==='ACTIVE');
   if(!a||!staff(d,a.activity_key)||adminAction&&!admin(d,a.activity_key))throw fail('This action is outside your planning access.',403,'FORBIDDEN');
   const at=now().toISOString(),statements=[];
   if(action==='policy'){
    const previous=policy(d,a.activity_key);if(input.revision!==previous.revision)throw fail('Deadline settings changed. Refresh before saving.',409,'ROW_CHANGED');
    if(!Number.isInteger(input.weeklyDay)||input.weeklyDay<0||input.weeklyDay>6||typeof input.weeklyTime!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(input.weeklyTime)||!Number.isInteger(input.courseLeadDays)||input.courseLeadDays<0||input.courseLeadDays>90)throw fail('Choose a weekday, time and 0–90 days before the course.');
    statements.push(p('INSERT INTO lesson_plan_policies VALUES(?,?,?,?,?,?,?) ON CONFLICT(activity_key) DO UPDATE SET weekly_day=excluded.weekly_day,weekly_time=excluded.weekly_time,course_lead_days=excluded.course_lead_days,revision=excluded.revision,updated_at=excluded.updated_at,updated_by=excluded.updated_by',a.activity_key,input.weeklyDay,input.weeklyTime,input.courseLeadDays,previous.revision+1,at,actor));
   }else{
    const key=normalizeKey(d,input,!adminAction),r=find(d,key);
    if(action==='deadline'){
     if(!same(key.teacherId,actor)&&!liveRoles(d,key.teacherId,key.activityKey).includes('TEACHER')&&!r)throw fail('Choose a teacher assigned to this learning area.');
     const previous=d.deadlines.find(r=>identity(fromRow(r))===identity(key));if(input.revision!==(previous?.revision||0))throw fail('This deadline changed. Refresh before extending it.',409,'ROW_CHANGED');
     if(!dateOK(input.dueDate)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(input.dueTime))throw fail('Choose a valid deadline date and time.');
     const due=planningInstant(input.dueDate,input.dueTime,await timezone(d)),reason=text(input.reason??'',500,'a reason for the extension',true);
     const current=deadline(d,key,await timezone(d));if(current.dueAt&&due<=current.dueAt)throw fail('An extension must be later than the current deadline.');
     statements.push(p('INSERT INTO lesson_plan_deadlines VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(activity_key,run_id,teacher_id,period,week_start) DO UPDATE SET due_at=excluded.due_at,revision=excluded.revision,reason=excluded.reason,updated_at=excluded.updated_at,updated_by=excluded.updated_by',key.activityKey,key.runId,key.teacherId,key.period,key.weekStart,due,(previous?.revision||0)+1,reason,at,actor));
    }else if(action==='comment'){
     if(!r?.submitted_at)throw fail('Comments are available after the teacher submits a plan.',409);
     if(input.submittedRevision!==r.submitted_revision)throw fail('A newer plan was submitted. Open it before commenting.',409,'ROW_CHANGED');
     statements.push(p('INSERT INTO lesson_plan_comments VALUES(?,?,?,?,?,?)',crypto.randomUUID(),r.plan_id,r.submitted_revision,actor,text(input.body,4000,'feedback',true),at));
    }else if(['save','submit'].includes(action)){
     if(input.revision!==(r?.revision||0))throw fail('This plan changed elsewhere. Your draft is kept; open the saved plan before retrying.',409,'ROW_CHANGED');
     const content=normalizeContent(input.content,action==='submit');
     if(key.period==='WEEKLY'&&content.lessons.some(l=>l.date&&(l.date<key.weekStart||l.date>addDays(key.weekStart,6))))throw fail('Lesson dates must fall within the selected teaching week.');
     const json=JSON.stringify(content),id=r?.plan_id||crypto.randomUUID(),revision=(r?.revision||0)+1,submit=action==='submit';
     statements.push(p(`INSERT INTO lesson_plans VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(plan_id) DO UPDATE SET draft_json=excluded.draft_json,submitted_json=excluded.submitted_json,revision=excluded.revision,submitted_revision=excluded.submitted_revision,submitted_at=excluded.submitted_at,last_submitted_at=excluded.last_submitted_at,submitted_due_at=excluded.submitted_due_at,updated_at=excluded.updated_at`,id,key.activityKey,key.runId,key.teacherId,key.period,key.weekStart,json,submit?json:r?.submitted_json||null,revision,submit?revision:r?.submitted_revision||null,r?.submitted_at||(submit?at:null),submit?at:r?.last_submitted_at||null,r?.submitted_due_at||(submit?deadline(d,key,await timezone(d)).dueAt:null),r?.created_at||at,at));
     statements.push(p('INSERT INTO lesson_plan_revisions VALUES(?,?,?,?,?,?)',id,revision,submit?'SUBMIT':'DRAFT',json,actor,at));
     if(a.kind==='COURSE')statements.push(p('INSERT INTO lesson_plan_preferences VALUES(?,?,?,?) ON CONFLICT(activity_key,run_id,teacher_id) DO UPDATE SET period=excluded.period',key.activityKey,key.runId,actor,key.period));
    }else throw fail('Unknown planning action.',404);
   }
   return {data:d,statements,result:{saved:true},fields:['LessonPlanning'],authorityScopes:[a.activity_key]};
  });
 }
 return {run:async(action,input)=>action==='list'?list(input):action==='get'?get(input):write(action,input)};
}
