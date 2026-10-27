import {acceptedHead,acceptedRepository} from './setup-reader.js';
import {managementStore,managementError as fail,same,liveRoles} from './management-store.js';
import {optionalSchema} from './schema-probe.js';
import {dateInTimezone} from '../../lib/global-subject-delivery.js';
import {addDays} from '../entrance.js';
import {scheduledLessons} from '../../programs/attendance-model.js';
import {administers,actualState,actualRole,isAdminWorkspace} from './workspace-access.js';

const dateOK=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s+'T12:00:00Z'))&&addDays(s,0)===s;
export const planningMonday=s=>addDays(s,-((new Date(s+'T12:00:00Z').getUTCDay()+6)%7));
const text=(s,max,label,required=false)=>{if(typeof s!=='string'||s.length>max||required&&!s.trim())throw fail('Enter '+label+'.');return s.trim();};
const identity=r=>[r.activityKey,r.runId,r.teacherId,r.period,r.weekStart].join('|');
const fromRow=r=>({activityKey:r.activity_key,runId:r.run_id,teacherId:r.teacher_id,period:r.period,weekStart:r.week_start});
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
 const store=managementStore(repository,auth),p=store.p,actor=auth.user.accountid;let reader=null;
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
  return store.load({plans:input.view==='admin'&&!input.activityKey?p('SELECT * FROM lesson_plans WHERE 0'):planQuery,requirements:p(`SELECT a.activity_key,coalesce(r.plans_required,1) plans_required FROM activities a LEFT JOIN lesson_plan_requirements r USING(activity_key) WHERE a.kind IN ('PROGRAM','COURSE')${keys===null?'':' AND a.activity_key IN(SELECT value FROM json_each(?))'}`,...(keys===null?[]:[JSON.stringify(keys)])),preferences:q('lesson_plan_preferences'),runs:q('course_runs'),runStates:q('course_run_state'),courseEditor:q('course_management_drafts'),sessions:q('course_draft_sessions')});
 }
 const admin=(d,key)=>global||liveRoles(d,actor,key).includes('PROGRAM_ADMIN');
 const staff=(d,key)=>admin(d,key)||liveRoles(d,actor,key).includes('TEACHER')||auth.workspace==='TEACH'&&administers(auth,key);
 const required=(d,key)=>d.requirements.find(r=>same(r.activity_key,key))?.plans_required!==0;
 const areas=(d,view)=>d.activities.filter(a=>a.active&&a.lifecycle==='ACTIVE'&&['PROGRAM','COURSE'].includes(a.kind)&&(view==='admin'?admin(d,a.activity_key):staff(d,a.activity_key)&&required(d,a.activity_key))).sort((a,b)=>a.name.localeCompare(b.name));
 const timezone=async()=>{const config=await repository.homeConfiguration();return config?.setting_value||'Africa/Johannesburg';};
 function runStage(d,r){return String(d.courseEditor.find(s=>same(s.activity_key,r.activity_key)&&same(s.run_id,r.run_id))?.stage||d.runStates.find(s=>same(s.activity_key,r.activity_key)&&same(s.run_id,r.run_id))?.stage||(r.active?'ACTIVE':'ARCHIVED')).toUpperCase();}
 function runOpen(d,r){const a=d.activities.find(a=>same(a.activity_key,r.activity_key));return Boolean(a?.active&&a.lifecycle==='ACTIVE'&&r.active&&!['COMPLETE','COMPLETED','CANCELLED','ARCHIVED'].includes(runStage(d,r)));}
 function runList(d,key){return d.runs.filter(r=>same(r.activity_key,key));}
 function firstDate(d,run){return run.start_date||d.sessions.filter(s=>same(s.activity_key,run.activity_key)&&same(s.run_id,run.run_id)&&s.session_kind!=='BREAK').map(s=>s.session_date).sort()[0]||'';}
 function normalizeKey(d,input,write=false){
  const a=d.activities.find(a=>same(a.activity_key,input.activityKey)&&['PROGRAM','COURSE'].includes(a.kind));
  if(!a||!staff(d,a.activity_key))throw fail('This learning area is outside your planning access.',403,'FORBIDDEN');
  if(!required(d,a.activity_key))throw fail('Lesson plans are not required for this Program or Course.',403,'PLANS_NOT_REQUIRED');
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
 function summary(d,key){
  const r=find(d,key),a=d.activities.find(a=>same(a.activity_key,key.activityKey)),u=d.accounts.find(u=>same(u.account_id,key.teacherId)),run=d.runs.find(r=>same(r.activity_key,key.activityKey)&&same(r.run_id,key.runId));
  return {...key,canSubmit:run?runOpen(d,run):Boolean(a.active&&a.lifecycle==='ACTIVE'),planId:r?.plan_id||'',revision:r?.revision||0,activityName:a.name,kind:a.kind,teacherName:u?.display_name||'Teacher',runName:run?.name||'',submittedAt:r?.submitted_at||'',lastSubmittedAt:r?.last_submitted_at||'',submittedRevision:r?.submitted_revision||0,hasDraft:same(key.teacherId,actor)&&Boolean(r),draftChanged:same(key.teacherId,actor)&&Boolean(r?.submitted_json&&r.draft_json!==r.submitted_json)};
 }
 async function list(input){
  const d=await load(input),tz=await timezone(),view=input.view==='admin'?'admin':'teacher',available=areas(d,view);
  if(view==='admin'&&!global&&!auth.state.roles.some(r=>r.role==='PROGRAM_ADMIN'))throw fail('Planning management requires Program or Course Admin access.',403,'FORBIDDEN');
  if(view==='teacher'&&!global&&!auth.state.roles.some(r=>['TEACHER','PROGRAM_ADMIN'].includes(r.role)))throw fail('Planning requires a teaching assignment.',403,'FORBIDDEN');
  const date=input.weekStart||dateInTimezone(now(),tz);if(!dateOK(date))throw fail('Choose a valid teaching week.');const week=planningMonday(date);
  const count=view==='admin'?(input.weekCount??1):1,weeks=Array.from({length:count},(_,i)=>addDays(week,(count>1?-14:0)+7*i));
  const chosen=input.activityKey?available.filter(a=>same(a.activity_key,input.activityKey)):available;
  if(input.activityKey&&!chosen.length)throw fail('This area is outside your planning access or does not require plans.',403,'FORBIDDEN');
  if(input.activityKey&&!required(d,input.activityKey))throw fail('Lesson plans are not required for this Program or Course.',403,'PLANS_NOT_REQUIRED');
  const records=d.plans.filter(r=>chosen.some(a=>same(a.activity_key,r.activity_key)&&required(d,a.activity_key))&&(view==='admin'?Boolean(r.submitted_at):same(r.teacher_id,actor))&&(r.period==='ENTIRE'||weeks.includes(r.week_start)));
  return {view,timezone:tz,weekStart:week,weeks,accountId:actor,canAdmin:global||auth.state.roles.some(r=>r.role==='PROGRAM_ADMIN'),areas:available.map(a=>({key:a.activity_key,name:a.name,kind:a.kind,plansRequired:required(d,a.activity_key),teachers:view==='admin'?d.accounts.filter(u=>u.active&&liveRoles(d,u.account_id,a.activity_key).includes('TEACHER')).map(u=>({id:u.account_id,name:u.display_name})):[],runs:runList(d,a.activity_key).map(r=>({id:r.run_id,name:r.name,startDate:firstDate(d,r),endDate:r.end_date||'',canSubmit:runOpen(d,r),period:d.preferences.find(x=>same(x.activity_key,a.activity_key)&&same(x.run_id,r.run_id)&&same(x.teacher_id,actor))?.period||'WEEKLY'}))})),plans:records.map(r=>summary(d,fromRow(r))).sort((a,b)=>a.activityName.localeCompare(b.activityName)||a.teacherName.localeCompare(b.teacherName))};
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
  const details=summary(d,key);
  return {...details,...(choices?{choices}:{}),timezone:tz,canEdit:editing&&details.canSubmit,content};
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
  if(!['requirement','save','submit'].includes(action))throw fail('This planning action is no longer available.',410,'PLANNING_ACTION_RETIRED');
  const adminAction=action==='requirement',dataset=adminAction?'LESSON_PLAN_ADMIN':'LESSON_PLANS';
  if(typeof input.activityKey!=='string'||input.activityKey.length>200)throw fail('Choose a learning area.');
  return store.change(dataset,input.activityKey,action,input,async()=>{
   const d=await load(input),a=d.activities.find(a=>same(a.activity_key,input.activityKey)&&a.active&&a.lifecycle==='ACTIVE');
   if(!a||!staff(d,a.activity_key)||adminAction&&!admin(d,a.activity_key))throw fail('This action is outside your planning access.',403,'FORBIDDEN');
   const at=now().toISOString(),statements=[];
   if(adminAction){
    if(typeof input.plansRequired!=='boolean'||typeof input.previousRequired!=='boolean')throw fail('Choose whether plans are required.');
    if(input.previousRequired!==required(d,a.activity_key))throw fail('The requirement changed. Reload before saving.',409,'ROW_CHANGED');
    statements.push(p('INSERT INTO lesson_plan_requirements(activity_key,plans_required) VALUES(?,?) ON CONFLICT(activity_key) DO UPDATE SET plans_required=excluded.plans_required',a.activity_key,Number(input.plansRequired)));
   }else{
    const key=normalizeKey(d,input,true),r=find(d,key),guard=crypto.randomUUID();
    // Recheck the requirement in the guarded transaction as well as before editing.
    statements.push(p('INSERT INTO academy_write_guards(guard_id,accepted) VALUES(?,COALESCE((SELECT plans_required FROM lesson_plan_requirements WHERE activity_key=?),1)=1)',guard,key.activityKey),p('DELETE FROM academy_write_guards WHERE guard_id=?',guard));
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
     statements.push(p(`INSERT INTO lesson_plans VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(plan_id) DO UPDATE SET draft_json=excluded.draft_json,submitted_json=excluded.submitted_json,revision=excluded.revision,submitted_revision=excluded.submitted_revision,submitted_at=excluded.submitted_at,last_submitted_at=excluded.last_submitted_at,updated_at=excluded.updated_at`,id,key.activityKey,key.runId,key.teacherId,key.period,key.weekStart,json,submit?json:r?.submitted_json||null,revision,submit?revision:r?.submitted_revision||null,r?.submitted_at||(submit?at:null),submit?at:r?.last_submitted_at||null,r?.submitted_due_at||null,r?.created_at||at,at));
     statements.push(p('INSERT INTO lesson_plan_revisions VALUES(?,?,?,?,?,?)',id,revision,submit?'SUBMIT':'DRAFT',json,actor,at));
     if(a.kind==='COURSE')statements.push(p('INSERT INTO lesson_plan_preferences VALUES(?,?,?,?) ON CONFLICT(activity_key,run_id,teacher_id) DO UPDATE SET period=excluded.period',key.activityKey,key.runId,actor,key.period));
   }
   return {data:d,statements,result:{saved:true},fields:['LessonPlanning'],authorityScopes:[a.activity_key],acceptDefinitions:adminAction};
  });
 }
 return {run:async(action,input)=>action==='list'?list(input):action==='get'?get(input):write(action,input)};
}
