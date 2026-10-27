import {mediaSessions} from './lesson-media-sessions.js';
import {sessionBinding} from './session-identity.js';
import {publishedSessionFacts} from './published-sessions.js';
import {acceptedHead,acceptedRepository} from './setup-reader.js';
import {managementStore,managementError as fail,same,liveRoles} from './management-store.js';
import {optionalSchema} from './schema-probe.js';
import {dateInTimezone} from '../../lib/global-subject-delivery.js';
import {addDays,lessonTimes} from '../entrance.js';
import {scheduledLessons} from '../../programs/attendance-model.js';
import {administers,actualState,actualRole,isAdminWorkspace} from './workspace-access.js';

const dateOK=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s+'T12:00:00Z'))&&addDays(s,0)===s;
export const planningMonday=s=>addDays(s,-((new Date(s+'T12:00:00Z').getUTCDay()+6)%7));
const text=(s,max,label,required=false)=>{if(typeof s!=='string'||s.length>max||required&&!s.trim())throw fail('Enter '+label+'.');return s.trim();};
const defaults={weeklyDay:0,weeklyTime:'18:00',courseLeadDays:3,plansRequired:true,revision:0};
const sessionPolicyKey=key=>'LessonPlanSessions:'+key.toUpperCase();
const identity=r=>[r.activityKey,r.runId,r.teacherId,r.period,r.weekStart].join('|');
const fromRow=r=>({activityKey:r.activity_key,runId:r.run_id,teacherId:r.teacher_id,period:r.period,weekStart:r.week_start});
export function planningInstant(date,time,timezone){const n=lessonTimes({date,startTime:time,endTime:time,timezone}).startsAt;if(!Number.isFinite(n))throw fail('That local deadline is not a valid clock time.');return new Date(n).toISOString();}
function normalizeContent(input,submitted){
 if(!input||typeof input!=='object'||!Array.isArray(input.lessons)||input.lessons.length>60)throw fail('Use up to 60 lesson sections.');
 const result={title:text(input.title??'',160,'a plan title',submitted),overview:text(input.overview??'',6000,'a shorter weekly overview'),reflection:text(input.reflection??'',6000,'shorter reflections'),lessons:input.lessons.map(r=>{
  if(!r||typeof r!=='object')throw fail('Enter a valid lesson section.');
  const date=text(r.date??'',10,'a lesson date');if(date&&!dateOK(date))throw fail('Choose a valid lesson date.');
  return {date,className:text(r.className??'',160,'a shorter class name'),subject:text(r.subject??'',200,'a shorter lesson title'),objectives:text(r.objectives??'',2000,'shorter objectives'),activities:text(r.activities??'',12000,'shorter activities'),resources:text(r.resources??'',2000,'shorter resources')};
 })};
 if(JSON.stringify(result).length>60000)throw fail('Keep this plan below 60,000 characters.');
 if(submitted&&!result.overview&&!result.lessons.some(r=>r.activities||r.objectives))throw fail('Add an overview or lesson activities before submitting.');
 return result;
}
export function lessonPlanning(repository,auth,now=()=>new Date()){
 const store=managementStore(repository,auth),p=store.p,actor=auth.user.accountid;let reader=null,factsJob=null;const sessionRows=new Map(),policyCache=new WeakMap();
 const accepted=async()=>reader??=repository.setup?.reader?repository:repository.setup?.enabled?acceptedRepository(repository,await acceptedHead(repository)):repository;
 const global=Boolean(auth.state.account.global_admin);
 const keys=global?null:[...new Set([...auth.state.roles.filter(r=>['TEACHER','PROGRAM_ADMIN'].includes(r.role)).map(r=>r.activity_key),...(!isAdminWorkspace(auth)?actualState(auth).activities.filter(a=>administers(auth,a.activity_key)).map(a=>a.activity_key):[])])];
 const filter=keys===null?'1':'activity_key IN (SELECT value FROM json_each(?))';
 const q=table=>keys===null?p('SELECT * FROM '+table):p('SELECT * FROM '+table+' WHERE '+filter,JSON.stringify(keys));
 async function load(input={}){
  if(!await optionalSchema(repository.db,'SELECT plan_id FROM lesson_plans WHERE 0'))throw fail('Lesson planning needs its database upgrade.',503,'PLANNING_SCHEMA_REQUIRED');
  const config=await repository.homeConfiguration(),tz=config?.setting_value||'Africa/Johannesburg',week=planningMonday(dateOK(input.weekStart)?input.weekStart:dateInTimezone(now(),tz));
  const count=input.view==='admin'?(input.weekCount??1):1;
  if(!Number.isInteger(count)||count<1||count>12)throw fail('Show between one and twelve weeks.');
  const start=count>1?addDays(week,-14):week,end=addDays(start,(count-1)*7);
  const planQuery=p(`SELECT * FROM lesson_plans WHERE ${filter} AND (period='ENTIRE' OR week_start BETWEEN ? AND ?)`,...(keys===null?[]:[JSON.stringify(keys)]),start,end);
  return store.load({plans:planQuery,policies:q('lesson_plan_policies'),requirements:p(`SELECT a.activity_key,coalesce(r.plans_required,1) plans_required,s.setting_value session_policy_json FROM activities a LEFT JOIN lesson_plan_requirements r USING(activity_key) LEFT JOIN main.academy_settings s ON s.setting_key='LessonPlanSessions:'||upper(a.activity_key) WHERE a.kind IN ('PROGRAM','COURSE')${keys===null?'':' AND a.activity_key IN(SELECT value FROM json_each(?))'}`,...(keys===null?[]:[JSON.stringify(keys)])),preferences:q('lesson_plan_preferences'),deadlines:q('lesson_plan_deadlines'),runs:q('course_runs'),runStates:q('course_run_state'),courseEditor:q('course_management_drafts'),sessions:q('course_draft_sessions')});
 }
 const admin=(d,key)=>global||liveRoles(d,actor,key).includes('PROGRAM_ADMIN');
 const staff=(d,key)=>admin(d,key)||liveRoles(d,actor,key).includes('TEACHER')||auth.workspace==='TEACH'&&administers(auth,key);
 const areas=(d,view)=>d.activities.filter(a=>(a.kind==='COURSE'||a.active&&a.lifecycle==='ACTIVE')&&['PROGRAM','COURSE'].includes(a.kind)&&(view==='admin'?admin(d,a.activity_key):staff(d,a.activity_key)));
 const timezone=async d=>{const config=await repository.homeConfiguration();return config?.setting_value||'Africa/Johannesburg';};
 function sessionPolicy(d,key){let map=policyCache.get(d);if(!map){map=new Map();policyCache.set(d,map);}if(map.has(key))return map.get(key);let result={revision:0,records:[]};try{const value=JSON.parse(d.requirements.find(r=>same(r.activity_key,key))?.session_policy_json||'null');if(value&&Number.isInteger(value.revision)&&Array.isArray(value.records))result=value;}catch{}map.set(key,result);return result;}

 function policy(d,key){const r=d.policies.find(r=>same(r.activity_key,key)),plansRequired=d.requirements.find(r=>same(r.activity_key,key))?.plans_required!==0;return {...(r?{weeklyDay:r.weekly_day,weeklyTime:r.weekly_time,courseLeadDays:r.course_lead_days,revision:r.revision}:defaults),plansRequired,sessionRevision:sessionPolicy(d,key).revision};}
 async function policyFacts(d){
  return factsJob??=(async()=>{const keys=d.requirements.filter(r=>sessionPolicy(d,r.activity_key).records.length).map(r=>r.activity_key),source=await accepted(),[facts,assigned]=await Promise.all([publishedSessionFacts(source,keys),source.db.prepare('SELECT activity_key,class_id,account_id FROM class_teacher_assignments WHERE activity_key IN(SELECT value FROM json_each(?))').bind(JSON.stringify(keys)).all()]);return {source,facts,assignments:assigned.results};})();
 }

 function effectiveSession(d,key,session){const identity=sessionBinding(key,session),records=sessionPolicy(d,key).records.filter(r=>r.identity===identity&&r.effectiveFrom<=session.date).sort((a,b)=>a.effectiveFrom.localeCompare(b.effectiveFrom)),last=records.at(-1);return last?.required==='INHERIT'||!last?policy(d,key).plansRequired:last.required;}
 async function requirementSessions(d,key){
  const cacheKey=[key.activityKey,key.runId,key.period,key.weekStart].join('|');if(sessionRows.has(cacheKey))return sessionRows.get(cacheKey);
  const job=(async()=>{const {source,facts}=await policyFacts(d),area=d.activities.find(a=>same(a.activity_key,key.activityKey));let rows=[];
  if(key.period==='WEEKLY')rows=(await mediaSessions(source,area,{startDate:key.weekStart,endDate:addDays(key.weekStart,6),runId:key.runId,allRuns:!key.runId},actor,true,{facts:facts.get(key.activityKey.toUpperCase())})).sessions;
  else{const areaFacts=facts.get(key.activityKey.toUpperCase()),run=areaFacts.runs.find(r=>same(r.run_id,key.runId)),publication=run&&areaFacts.publications.find(p=>same(p.publication_id,run.current_publication_id)),dates=publication?[...new Set((JSON.parse(publication.snapshot_json).sessions||[]).filter(s=>s.SessionKind!=='BREAK').map(s=>s.SessionDate))]:[];
   for(const date of dates)rows.push(...(await mediaSessions(source,area,{startDate:date,endDate:date,runId:key.runId},actor,true,{facts:areaFacts})).sessions);
  }
  return rows;})();sessionRows.set(cacheKey,job);return job;
 }
 async function plansRequired(d,key){
  const base=policy(d,key.activityKey).plansRequired,records=sessionPolicy(d,key.activityKey).records;if(!records.length||key.period==='WEEKLY'&&records.every(r=>r.effectiveFrom>addDays(key.weekStart,6)))return base;
  const rows=await requirementSessions(d,key),{assignments}=await policyFacts(d),assigned=rows.filter(s=>s.teacherIds.some(id=>same(id,key.teacherId))||assignments.some(t=>same(t.account_id,key.teacherId)&&same(t.activity_key,key.activityKey)&&s.classIds.some(id=>same(id,t.class_id))));
  return assigned.length?assigned.some(s=>effectiveSession(d,key.activityKey,s)):base;
 }
 async function sessionOptions(input){
  if(!isAdminWorkspace(auth)||typeof input.activityKey!=='string')throw fail('Open this area in Admin.',403,'FORBIDDEN');
  const d=await load(input),area=d.activities.find(a=>same(a.activity_key,input.activityKey));if(!area||!admin(d,area.activity_key))throw fail('This learning area is outside your Admin scope.',403,'FORBIDDEN');
  const tz=await timezone(d),today=dateInTimezone(now(),tz),start=dateOK(input.startDate)?input.startDate:today,end=dateOK(input.endDate)?input.endDate:addDays(start,13),source=await accepted(),resolved=await mediaSessions(source,area,{startDate:start,endDate:end,runId:input.runId||'',allRuns:!input.runId},actor,true),records=sessionPolicy(d,area.activity_key),chosen=new Map(),asOf=dateOK(input.effectiveFrom)&&input.effectiveFrom>today?input.effectiveFrom:addDays(today,1);
  for(const s of resolved.sessions){const identity=sessionBinding(area.activity_key,s),last=records.records.filter(r=>r.identity===identity&&r.effectiveFrom<=asOf).sort((a,b)=>a.effectiveFrom.localeCompare(b.effectiveFrom)).at(-1);if(!chosen.has(identity))chosen.set(identity,{sessionKey:s.sessionKey,sessionVersion:s.sessionVersion,date:s.date,runId:s.runId,title:s.title,className:s.classNames.join(', '),startTime:s.startTime,endTime:s.endTime,choices:records.records.filter(r=>r.identity===identity).map(r=>({effectiveFrom:r.effectiveFrom,choice:r.required===true?'REQUIRED':r.required===false?'OPTIONAL':'INHERIT'})),choice:last?.required===true?'REQUIRED':last?.required===false?'OPTIONAL':'INHERIT',required:effectiveSession(d,area.activity_key,{...s,date:asOf})});}
  return {activityKey:area.activity_key,revision:records.revision,appliesFrom:addDays(today,1),effectiveFrom:asOf,defaultRequired:policy(d,area.activity_key).plansRequired,sessions:[...chosen.values()]};
 }
 function runStage(d,r){return String(d.courseEditor.find(s=>same(s.activity_key,r.activity_key)&&same(s.run_id,r.run_id))?.stage||d.runStates.find(s=>same(s.activity_key,r.activity_key)&&same(s.run_id,r.run_id))?.stage||(r.active?'ACTIVE':'ARCHIVED')).toUpperCase();}
 function runOpen(d,r){const a=d.activities.find(a=>same(a.activity_key,r.activity_key));return Boolean(a?.active&&a.lifecycle==='ACTIVE'&&r.active&&!['COMPLETE','COMPLETED','CANCELLED','ARCHIVED'].includes(runStage(d,r)));}
 function runList(d,key){return d.runs.filter(r=>same(r.activity_key,key));}
 function firstDate(d,run){return run.start_date||d.sessions.filter(s=>same(s.activity_key,run.activity_key)&&same(s.run_id,run.run_id)&&s.session_kind!=='BREAK').map(s=>s.session_date).sort()[0]||'';}
 function normalizeKey(d,input,write=false){
  const a=d.activities.find(a=>same(a.activity_key,input.activityKey)&&['PROGRAM','COURSE'].includes(a.kind));
  if(!a||!staff(d,a.activity_key))throw fail('This learning area is outside your planning access.',403,'FORBIDDEN');
  const teacherId=input.teacherId||actor,account=d.accounts.find(u=>same(u.account_id,teacherId));
  if(!account||write&&(!same(teacherId,actor)||!staff(d,a.activity_key))||!same(teacherId,actor)&&!admin(d,a.activity_key))throw fail('You may edit your own plans and view submitted plans in areas you administer.',403,'FORBIDDEN');
  const period=input.period||'WEEKLY';if(!['WEEKLY','ENTIRE'].includes(period)||a.kind==='PROGRAM'&&period!=='WEEKLY')throw fail('Programs use weekly plans. Courses support weekly or entire-course plans.');
  const run=a.kind==='COURSE'?runList(d,a.activity_key).find(r=>same(r.run_id,input.runId)):null;
  if(a.kind==='COURSE'&&!run)throw fail('Choose a Course offering.');
  if(write&&(!a.active||a.lifecycle!=='ACTIVE'||run&&!runOpen(d,run)))throw fail('This Course is complete, cancelled or archived. Its existing plans can still be viewed.',409,'PLANNING_CLOSED');
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
 async function summary(d,key,tz){
  const r=find(d,key),due=deadline(d,key,tz),a=d.activities.find(a=>same(a.activity_key,key.activityKey)),u=d.accounts.find(u=>same(u.account_id,key.teacherId)),run=d.runs.find(r=>same(r.activity_key,key.activityKey)&&same(r.run_id,key.runId));
  const required=await plansRequired(d,key),status=!r?.submitted_at&&!required?'OPTIONAL':r?.submitted_at?(!due.dueAt?'SUBMITTED':r.submitted_at>due.dueAt?'SUBMITTED_LATE':'SUBMITTED_ON_TIME'):(due.dueAt&&now().toISOString()>due.dueAt?'OVERDUE':'DUE');
  return {...key,...due,plansRequired:required,canSubmit:run?runOpen(d,run):Boolean(a.active&&a.lifecycle==='ACTIVE'),courseStage:run?runStage(d,run):'',planId:r?.plan_id||'',revision:r?.revision||0,activityName:a.name,kind:a.kind,teacherName:u.display_name,runName:run?.name||'',status,submittedAt:r?.submitted_at||'',lastSubmittedAt:r?.last_submitted_at||'',submittedRevision:r?.submitted_revision||0,hasDraft:same(key.teacherId,actor)&&Boolean(r),draftChanged:same(key.teacherId,actor)&&Boolean(r?.submitted_json&&r.draft_json!==r.submitted_json)};
 }
 async function list(input){
  const d=await load(input),tz=await timezone(d),view=input.view==='admin'?'admin':'teacher',available=areas(d,view);
  if(view==='admin'&&!available.length)throw fail('Planning management requires Program or Course Admin access.',403,'FORBIDDEN');
  if(!available.length)throw fail('Planning requires a teaching assignment.',403,'FORBIDDEN');
  const date=input.weekStart||dateInTimezone(now(),tz);if(!dateOK(date))throw fail('Choose a valid teaching week.');const week=planningMonday(date);
  const count=view==='admin'?(input.weekCount??1):1,weeks=Array.from({length:count},(_,i)=>addDays(week,(count>1?-14:0)+7*i));
  const selected=input.activityKey?available.filter(a=>same(a.activity_key,input.activityKey)):available;
  if(input.activityKey&&!selected.length)throw fail('This area is outside your planning access.',403,'FORBIDDEN');
  const expected=new Map();
  for(const a of selected){
   const teachers=view==='admin'?d.accounts.filter(u=>u.active&&liveRoles(d,u.account_id,a.activity_key).includes('TEACHER')):d.accounts.filter(u=>same(u.account_id,actor)&&actualRole(auth,a.activity_key,'TEACHER'));
   const runs=a.kind==='PROGRAM'?[null]:runList(d,a.activity_key).filter(r=>runOpen(d,r));
   for(const u of teachers)for(const run of runs){
    const preference=d.preferences.find(r=>same(r.activity_key,a.activity_key)&&same(r.teacher_id,u.account_id)&&same(r.run_id,run?.run_id||''));
    const period=a.kind==='PROGRAM'?'WEEKLY':preference?.period||'WEEKLY';
    for(const teachingWeek of period==='ENTIRE'?['']:weeks){
     if(run&&period==='WEEKLY'&&firstDate(d,run)&&firstDate(d,run)>addDays(teachingWeek,6))continue;
     const key={activityKey:a.activity_key,teacherId:u.account_id,runId:run?.run_id||'',period,weekStart:teachingWeek};if(policy(d,a.activity_key).plansRequired||await plansRequired(d,key))expected.set(identity(key),key);
    }
   }
  }
  for(const r of d.plans)if(selected.some(a=>same(a.activity_key,r.activity_key))&&(view==='admin'||same(r.teacher_id,actor))&&(r.period==='ENTIRE'||weeks.includes(r.week_start))&&(r.submitted_at||view==='teacher'))expected.set(identity(fromRow(r)),fromRow(r));
  if(expected.size>10000)throw fail('Select one learning area to narrow the plans board.',409);
  return {view,timezone:tz,weekStart:week,weeks,accountId:actor,canAdmin:areas(d,'admin').length>0,areas:available.map(a=>({key:a.activity_key,name:a.name,kind:a.kind,teachers:view==='admin'?d.accounts.filter(u=>u.active&&liveRoles(d,u.account_id,a.activity_key).includes('TEACHER')).map(u=>({id:u.account_id,name:u.display_name})):[],policy:policy(d,a.activity_key),runs:runList(d,a.activity_key).map(r=>({id:r.run_id,name:r.name,startDate:firstDate(d,r),endDate:r.end_date||'',stage:runStage(d,r),canSubmit:runOpen(d,r),period:d.preferences.find(x=>same(x.activity_key,a.activity_key)&&same(x.run_id,r.run_id)&&same(x.teacher_id,actor))?.period||'WEEKLY'}))})),plans:(await Promise.all([...expected.values()].map(k=>summary(d,k,tz)))).sort((a,b)=>a.activityName.localeCompare(b.activityName)||a.teacherName.localeCompare(b.teacherName))};
 }
 async function get(input){
  const d=await load(input),key=normalizeKey(d,input),tz=await timezone(d),r=find(d,key),own=same(key.teacherId,actor),preview=auth.workspace==='TEACH'&&!actualRole(auth,key.activityKey,'TEACHER'),editing=own&&input.view!=='admin'&&!preview;
  if(!editing&&!preview&&!r?.submitted_at)throw fail('This plan has not been submitted yet.',409,'PLAN_NOT_SUBMITTED');
  let content=r&&!preview?JSON.parse(editing?r.draft_json:r.submitted_json):{title:'Weekly teaching plan',overview:'',reflection:'',lessons:[]};
  if(!r&&key.period==='ENTIRE')content.title='Entire-course teaching plan';
  const choices=editing&&key.activityKey.startsWith('PROGRAM:')?await editorChoices(key):null;
  if(!r&&key.activityKey.startsWith('PROGRAM:'))content.lessons=[{date:'',className:choices?.defaultClass||'',subject:'',objectives:'',activities:'',resources:''}];
  if(!r&&key.activityKey.startsWith('COURSE:'))content.lessons=d.sessions.filter(s=>same(s.activity_key,key.activityKey)&&same(s.run_id,key.runId)&&(administers(auth,key.activityKey)||same(s.teacher_account_id,actor))&&s.session_kind!=='BREAK'&&(key.period==='ENTIRE'||s.session_date>=key.weekStart&&s.session_date<=addDays(key.weekStart,6))).slice(0,60).map(s=>({date:s.session_date,className:'',subject:s.description||'Lesson',objectives:'',activities:'',resources:''}));
  if(content.lessons.length>60)content.lessons=content.lessons.slice(0,60);
  const comments=r?(await p('SELECT c.*,a.display_name FROM lesson_plan_comments c JOIN accounts a ON a.account_id=c.actor_id WHERE c.plan_id=? ORDER BY c.created_at,c.comment_id',r.plan_id).all()).results.map(c=>({id:c.comment_id,author:c.display_name,at:c.created_at,body:c.body,submittedRevision:c.submitted_revision})):[];
  const details=await summary(d,key,tz);let sessionRequirements=[];
  if(sessionPolicy(d,key.activityKey).records.some(r=>key.period==='ENTIRE'||r.effectiveFrom<=addDays(key.weekStart,6))){const rows=await requirementSessions(d,key),{assignments}=await policyFacts(d);sessionRequirements=rows.filter(s=>s.teacherIds.some(id=>same(id,key.teacherId))||assignments.some(t=>same(t.account_id,key.teacherId)&&same(t.activity_key,key.activityKey)&&s.classIds.some(id=>same(id,t.class_id)))).map(s=>({date:s.date,title:s.title,className:s.classNames.join(', '),required:effectiveSession(d,key.activityKey,s)}));}
  return {...details,...(choices?{choices}:{}),sessionRequirements,timezone:tz,canEdit:editing&&details.canSubmit,canComment:admin(d,key.activityKey)&&Boolean(r?.submitted_at)&&Boolean(d.activities.find(x=>same(x.activity_key,key.activityKey)&&x.active&&x.lifecycle==='ACTIVE')),content,comments};
 }
 async function editorChoices(key){
  const source=await accepted(),query=(sql,...args)=>source.db.prepare(sql).bind(...args);
  const [subjects,modules,classes,assigned,publications]=await source.db.batch([
   query('SELECT s.name FROM program_subjects ps JOIN subject_catalog s USING(subject_key) WHERE ps.activity_key=? AND ps.active=1 AND s.active=1 ORDER BY s.name',key.activityKey),
   query('SELECT m.name,s.name subject_name FROM modules m LEFT JOIN program_subjects ps USING(activity_key,program_subject_id) LEFT JOIN subject_catalog s USING(subject_key) WHERE m.activity_key=? AND m.active=1 AND (m.program_subject_id IS NULL OR ps.active=1 AND s.active=1) ORDER BY m.sort_order,m.name',key.activityKey),
   query('SELECT class_id,name FROM classes WHERE activity_key=? AND active=1 ORDER BY name',key.activityKey),
   query('SELECT class_id,responsibility FROM class_teacher_assignments WHERE activity_key=? AND account_id=?',key.activityKey,actor),
   query('SELECT p.*,l.status lifecycle FROM timetable_publications p LEFT JOIN program_publication_lifecycle l USING(activity_key,publication_id) WHERE p.activity_key=?',key.activityKey)
  ]);
  const classIds=new Set(assigned.results.map(r=>r.class_id.toUpperCase())),defaults=new Set(assigned.results.filter(r=>r.responsibility==='DEFAULT').map(r=>r.class_id.toUpperCase()));
  const rows=publications.results.map(r=>({PublicationID:r.publication_id,VersionNo:r.version_no,SnapshotJSON:r.snapshot_json,PublishedDate:r.published_at,PublishedByAccountID:r.published_by_source_id,Lifecycle:r.lifecycle||''}));
  for(let day=0;day<7;day++)for(const lesson of scheduledLessons(rows,{id:key.activityKey.slice(8)},addDays(key.weekStart,day)))if(lesson.teacherIds.some(id=>same(id,actor)))for(const id of lesson.classIds)classIds.add(id.toUpperCase());
  const names=[...subjects.results.map(r=>r.name),...modules.results.map(r=>r.subject_name&&r.subject_name!==r.name?r.subject_name+' · '+r.name:r.name)];
  const available=classes.results.filter(r=>administers(auth,key.activityKey)||classIds.has(r.class_id.toUpperCase())).sort((a,b)=>Number(defaults.has(b.class_id.toUpperCase()))-Number(defaults.has(a.class_id.toUpperCase()))||a.name.localeCompare(b.name));
  return {subjects:[...new Set(names)],classes:available.map(r=>r.name),defaultClass:available[0]?.name||''};
 }
 async function write(action,input){
  const adminAction=['policy','session-policy','deadline','comment'].includes(action),dataset=adminAction?'LESSON_PLAN_ADMIN':'LESSON_PLANS';
  if(typeof input.activityKey!=='string'||input.activityKey.length>200)throw fail('Choose a learning area.');
  return store.change(dataset,input.activityKey,action,input,async()=>{
   const d=await load(input),a=d.activities.find(a=>same(a.activity_key,input.activityKey)&&a.active&&a.lifecycle==='ACTIVE');
   if(!a||!staff(d,a.activity_key)||adminAction&&!admin(d,a.activity_key))throw fail('This action is outside your planning access.',403,'FORBIDDEN');
   const at=now().toISOString(),statements=[];
   if(action==='session-policy'){
    const current=sessionPolicy(d,a.activity_key),tz=await timezone(d),today=dateInTimezone(now(),tz),inputs=Array.isArray(input.rows)?input.rows:[input];if(input.revision!==current.revision)throw fail('Session requirements changed. Reload them before saving.',409,'ROW_CHANGED');
    if(!inputs.length||inputs.length>100||!dateOK(input.effectiveFrom)||input.effectiveFrom<=today)throw fail('Choose up to 100 session choices, applying from a future teaching day.');
    const source=await accepted(),facts=(await publishedSessionFacts(source,[a.activity_key])).get(a.activity_key.toUpperCase()),resolvedDates=new Map();let records=current.records.slice();const identities=new Set();
    for(const choice of inputs){
     if(!['INHERIT','REQUIRED','OPTIONAL'].includes(choice.choice)||!dateOK(choice.date))throw fail('Choose inheritance, required or optional for a valid accepted session.');
     const dateKey=choice.date+'|'+(choice.runId||'');if(!resolvedDates.has(dateKey))resolvedDates.set(dateKey,await mediaSessions(source,a,{startDate:choice.date,endDate:choice.date,runId:choice.runId||'',allRuns:!choice.runId},actor,true,{facts}));
     const session=resolvedDates.get(dateKey).sessions.find(s=>s.sessionKey===choice.sessionKey&&s.sessionVersion===choice.sessionVersion);if(!session)throw fail('This accepted session changed. Reload the session list.',409,'SESSION_CHANGED');
     const identity=sessionBinding(a.activity_key,session);if(identities.has(identity))throw fail('Choose each session once.');identities.add(identity);records=records.filter(r=>!(r.identity===identity&&r.effectiveFrom===input.effectiveFrom));records.push({identity,required:choice.choice==='INHERIT'?'INHERIT':choice.choice==='REQUIRED',effectiveFrom:input.effectiveFrom,updatedAt:at,updatedBy:actor});
    }
    if(records.length>400)throw fail('This area has too many session requirement changes.');
    statements.push(p('INSERT INTO academy_settings(setting_key,setting_value,updated_at,updated_by_account_id) VALUES(?,?,?,?) ON CONFLICT(setting_key) DO UPDATE SET setting_value=excluded.setting_value,updated_at=excluded.updated_at,updated_by_account_id=excluded.updated_by_account_id',sessionPolicyKey(a.activity_key),JSON.stringify({revision:current.revision+1,records}),at,actor));
   }else if(action==='policy'){
    const previous=policy(d,a.activity_key);if(input.revision!==previous.revision)throw fail('Deadline settings changed. Refresh before saving.',409,'ROW_CHANGED');
    if(!Number.isInteger(input.weeklyDay)||input.weeklyDay<0||input.weeklyDay>6||typeof input.weeklyTime!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(input.weeklyTime)||!Number.isInteger(input.courseLeadDays)||input.courseLeadDays<0||input.courseLeadDays>90)throw fail('Choose a weekday, time and 0–90 days before the course.');
    const required=input.plansRequired??previous.plansRequired;if(typeof required!=='boolean')throw fail('Choose whether plans are required.');
    statements.push(p('INSERT INTO lesson_plan_policies(activity_key,weekly_day,weekly_time,course_lead_days,revision,updated_at,updated_by) VALUES(?,?,?,?,?,?,?) ON CONFLICT(activity_key) DO UPDATE SET weekly_day=excluded.weekly_day,weekly_time=excluded.weekly_time,course_lead_days=excluded.course_lead_days,revision=excluded.revision,updated_at=excluded.updated_at,updated_by=excluded.updated_by',a.activity_key,input.weeklyDay,input.weeklyTime,input.courseLeadDays,previous.revision+1,at,actor));
    statements.push(p('INSERT INTO lesson_plan_requirements(activity_key,plans_required) VALUES(?,?) ON CONFLICT(activity_key) DO UPDATE SET plans_required=excluded.plans_required',a.activity_key,Number(required)));
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
     if(a.kind==='COURSE'){
      const guard=crypto.randomUUID();
      statements.push(p(`INSERT INTO academy_write_guards(guard_id,accepted) VALUES(?,EXISTS(SELECT 1 FROM course_runs r
        LEFT JOIN course_management_drafts d USING(activity_key,run_id) LEFT JOIN course_run_state s USING(activity_key,run_id)
        WHERE r.activity_key=? AND r.run_id=? AND r.active=1 AND UPPER(COALESCE(d.stage,s.stage,'ACTIVE')) NOT IN ('COMPLETE','COMPLETED','CANCELLED','ARCHIVED')))`,guard,key.activityKey,key.runId),p('DELETE FROM academy_write_guards WHERE guard_id=?',guard));
     }
     if(input.revision!==(r?.revision||0))throw fail('This plan changed elsewhere. Your draft is kept; open the saved plan before retrying.',409,'ROW_CHANGED');
     const content=normalizeContent(input.content,action==='submit');
     if(key.period==='WEEKLY'&&content.lessons.some(l=>l.date&&(l.date<key.weekStart||l.date>addDays(key.weekStart,6))))throw fail('Lesson dates must fall within the selected teaching week.');
     const json=JSON.stringify(content),id=r?.plan_id||crypto.randomUUID(),revision=(r?.revision||0)+1,submit=action==='submit';
     statements.push(p(`INSERT INTO lesson_plans VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(plan_id) DO UPDATE SET draft_json=excluded.draft_json,submitted_json=excluded.submitted_json,revision=excluded.revision,submitted_revision=excluded.submitted_revision,submitted_at=excluded.submitted_at,last_submitted_at=excluded.last_submitted_at,submitted_due_at=excluded.submitted_due_at,updated_at=excluded.updated_at`,id,key.activityKey,key.runId,key.teacherId,key.period,key.weekStart,json,submit?json:r?.submitted_json||null,revision,submit?revision:r?.submitted_revision||null,r?.submitted_at||(submit?at:null),submit?at:r?.last_submitted_at||null,r?.submitted_due_at||(submit?deadline(d,key,await timezone(d)).dueAt:null),r?.created_at||at,at));
     statements.push(p('INSERT INTO lesson_plan_revisions VALUES(?,?,?,?,?,?)',id,revision,submit?'SUBMIT':'DRAFT',json,actor,at));
     if(a.kind==='COURSE')statements.push(p('INSERT INTO lesson_plan_preferences VALUES(?,?,?,?) ON CONFLICT(activity_key,run_id,teacher_id) DO UPDATE SET period=excluded.period',key.activityKey,key.runId,actor,key.period));
    }else throw fail('Unknown planning action.',404);
   }
   return {data:d,statements,result:{saved:true},fields:['LessonPlanning'],authorityScopes:[a.activity_key],acceptDefinitions:action!=='session-policy'};
  });
 }
 return {run:async(action,input)=>action==='list'?list(input):action==='get'?get(input):action==='sessions'?sessionOptions(input):write(action,input)};
}
