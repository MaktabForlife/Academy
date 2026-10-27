import {monthlyEnabled,monthlyAudienceSQL,retainedRecording} from './monthly-media-policy.js';
import {courseCompanion} from '../course-books/course-companion.js';
import {courseReaderSessions} from './course-reader-sessions.js';
import {storeLessonPdf,lessonPdfReference,lessonPdfObjectKey} from './lesson-pdf-storage.js';
import {sessionPdfCount} from './session-pdf-policy.js';
import {prepareFeatureChange} from './feature-change.js';
import {managementError as fail,same} from './management-store.js';
import {validDate,cleanText} from './assessment-store.js';
import {payloadHash} from '../../programs/timetable-model.js';
import {optionalSchema} from './schema-probe.js';
import {assessmentRolesSQL} from './assessment-store.js';
import {sessionVideos,videoExpiry} from './session-video.js';
import {mediaSessions} from './lesson-media-sessions.js';
import {isAdminWorkspace,administers,actualRole,readerPreview,viewedClass,classVisible} from './workspace-access.js';
import {academyDate,appTimezone} from './academy-clock.js';

export const MOU_MEDIA_PROGRAM='PROGRAM:PRG-656bcece-4310-49c7-87d7-ee06756f66c1';
export const MEDIA_PDF_LIMIT=16*1024*1024;
export function youtubeId(value){
 if(typeof value!=='string'||value.length>2048)throw fail('Enter a YouTube recording link.');
 let url;try{url=new URL(value);}catch{throw fail('Enter a YouTube recording link.');}
 if(url.protocol!=='https:'||url.username||url.password||url.port)throw fail('Enter a secure YouTube recording link.');
 const host=url.hostname.toLowerCase().replace(/^www\./,''),id=host==='youtu.be'?url.pathname.slice(1):['youtube.com','m.youtube.com'].includes(host)?url.pathname==='/watch'?url.searchParams.get('v'):url.pathname.match(/^\/(?:embed|shorts)\/([^/]+)$/)?.[1]:'';
 if(!/^[A-Za-z0-9_-]{11}$/.test(id||''))throw fail('Enter a valid YouTube recording link.');return id;
}
const rolesSQL=`EXISTS(SELECT 1 FROM (${assessmentRolesSQL}) r WHERE r.account_id=a.account_id AND r.activity_key=? AND r.role IN(SELECT value FROM json_each(?)))`;
const globalSQL="EXISTS(SELECT 1 FROM global_role_assignments g WHERE g.account_id=a.account_id AND g.role='GLOBAL_ADMIN' AND g.active=1 AND g.review_state='CONFIRMED')";

const classMatch="(c.class_id=l.class_id OR EXISTS(SELECT 1 FROM json_each(l.source_lessons_json,'$[0].classIds') WHERE value=c.class_id COLLATE NOCASE))";
const baseMediaAudienceSQL=`(l.activity_key LIKE 'COURSE:%' OR EXISTS(SELECT 1 FROM class_memberships c WHERE c.activity_key=l.activity_key AND c.account_id=? AND (c.active=1 OR c.start_date IS NOT NULL AND c.end_date IS NOT NULL) AND (c.start_date IS NULL OR c.start_date<=l.lesson_date) AND (c.end_date IS NULL OR c.end_date>=l.lesson_date) AND ${classMatch}) OR (NOT EXISTS(SELECT 1 FROM class_memberships m WHERE m.activity_key=l.activity_key AND m.account_id=?) AND (SELECT count(*) FROM classes WHERE activity_key=l.activity_key AND active=1)=1 AND EXISTS(SELECT 1 FROM classes c WHERE c.activity_key=l.activity_key AND c.active=1 AND ${classMatch})))`;

// One bounded lookup for a displayed timetable, using the same roles and class
// audience as the media reader. References never carry playback or storage URLs.
export async function timetableMedia(repository,auth,input){
 if(!Array.isArray(input.sessions)||input.sessions.length>400)throw fail('Choose up to 400 timetable lessons.');
 const mediaAudienceSQL=monthlyEnabled(repository)?monthlyAudienceSQL(baseMediaAudienceSQL):baseMediaAudienceSQL;
 const audienceValues=Array(monthlyEnabled(repository)?3:2).fill(auth.user.accountid);
 const refs=new Map();
 for(const ref of input.sessions){
  if(!ref||typeof ref.activityKey!=='string'||ref.activityKey.length>200||!/^(PROGRAM|COURSE):[^:]+$/.test(ref.activityKey)||typeof ref.sessionKey!=='string'||ref.sessionKey.length>1200)throw fail('Choose valid timetable lessons.');
  if(auth.adminView&&!administers(auth,ref.activityKey))continue;
  const roles=auth.state.roles.filter(r=>same(r.activity_key,ref.activityKey)).map(r=>r.role);
  const staff=Boolean(auth.state.account.global_admin||auth.workspace!=='LEARN'&&roles.some(r=>['PROGRAM_ADMIN','TEACHER'].includes(r)));
  const preview=readerPreview(auth,ref.activityKey);
  const freeCourse=repository.features?.mediaSeparation&&auth.workspace==='LEARN'&&auth.state.activities.some(a=>same(a.activity_key,ref.activityKey)&&a.kind==='COURSE'&&a.legacy_access_model==='FREE'&&a.policy_review_state==='CONFIRMED');
  if(staff||preview||freeCourse||(auth.state.monthlyMedia||[]).some(r=>same(r.activity_key,ref.activityKey))||roles.includes('STUDENT')||auth.state.subscriptions.some(r=>same(r.activity_key,ref.activityKey)))refs.set(JSON.stringify([ref.activityKey,ref.sessionKey]),{activityKey:ref.activityKey,sessionKey:ref.sessionKey,staff:Number(staff||preview),classId:viewedClass(auth,ref.activityKey)||''});
 }
 if(!refs.size||!await optionalSchema(repository.db,'SELECT session_key FROM lesson_media_lessons WHERE 0'))return {lessons:[]};
 const rows=(await repository.db.prepare(`SELECT DISTINCT l.lesson_id,l.activity_key,l.session_key,l.title,a.asset_id,a.kind,a.filename,a.display_name,a.created_at,a.object_key,${monthlyEnabled(repository)?'(SELECT retain_recordings FROM program_monthly_media_policies WHERE activity_key=l.activity_key)':'0'} monthly_retained
  FROM json_each(?) r JOIN lesson_media_lessons l ON l.activity_key=json_extract(r.value,'$.activityKey') COLLATE NOCASE AND l.session_key=json_extract(r.value,'$.sessionKey')
  JOIN activities area ON area.activity_key=l.activity_key AND area.active=1 AND area.lifecycle='ACTIVE'
  JOIN lesson_media_links link ON link.lesson_id=l.lesson_id JOIN lesson_media_assets a ON a.asset_id=link.asset_id
  WHERE l.media_scope='SESSION' AND l.state='PUBLISHED' AND (json_extract(r.value,'$.classId')='' OR l.class_id=json_extract(r.value,'$.classId') COLLATE NOCASE OR EXISTS(SELECT 1 FROM json_each(l.source_lessons_json,'$[0].classIds') WHERE value=json_extract(r.value,'$.classId') COLLATE NOCASE)) AND (json_extract(r.value,'$.staff')=1 OR ${mediaAudienceSQL})
  AND EXISTS(SELECT 1 FROM academy_settings WHERE setting_key='LessonMediaEnabled' AND setting_value='1')
  ORDER BY l.lesson_id,a.created_at,a.asset_id`).bind(JSON.stringify([...refs.values()]),...audienceValues).all()).results;
 const lessons=new Map();
 for(const r of rows){if(!lessons.has(r.lesson_id))lessons.set(r.lesson_id,{id:r.lesson_id,activityKey:r.activity_key,sessionKey:r.session_key,title:r.title,assets:[]});lessons.get(r.lesson_id).assets.push({id:r.asset_id,kind:r.kind,filename:r.filename,name:r.display_name||r.filename||(r.kind==='PDF'?'PDF':'Video'),...(r.kind==='MP4'?videoExpiry(r,Date.now(),retainedRecording(repository.recordingEnv||{},r.activity_key,r,{retain_recordings:r.monthly_retained})):{})});}
 return {lessons:[...lessons.values()]};
}

export function lessonMedia(repository,auth,env){
 const db=repository.db,descriptions=new WeakMap(),p=(sql,...values)=>{const statement=db.prepare(sql).bind(...values);descriptions.set(statement,{sql,values});return statement;},actor=auth.user.accountid;
 let activity,scopeKey,monthlyPolicy=null,admin=false,student=false,teacher=false,preview=false;
 const teachers=row=>[...new Set([...JSON.parse(row.teacher_ids_json||'[]'),row.teacher_id].filter(Boolean))];
 const manages=row=>admin||!repository.setup?.enabled&&row.media_scope!=='COURSE'&&teacher&&!preview&&actualRole(auth,scopeKey,'TEACHER')&&teachers(row).some(id=>same(id,actor));
 const canRead=()=>student||teacher||admin||preview;
 const audienceSQL=monthlyEnabled(repository)?monthlyAudienceSQL(baseMediaAudienceSQL):baseMediaAudienceSQL;
 const audienceValues=()=>Array(monthlyEnabled(repository)?3:2).fill(actor);
 const retained=asset=>retainedRecording(env,scopeKey,asset,monthlyPolicy);
 const readerAccess=row=>(admin||teacher||preview||student&&Boolean(row.learner_allowed))&&classVisible(auth,row.activity_key,[row.class_id,...JSON.parse(row.source_lessons_json||'[]').flatMap(r=>r.classIds||[])]);

 const scope=async()=>{
  const a=await p("SELECT * FROM activities WHERE activity_key=? AND active=1 AND lifecycle='ACTIVE'",scopeKey).first();
  if(!a)throw fail('These lesson materials are not available.',403,'MEDIA_FORBIDDEN');return a;
 };
 const ready=async input=>{
  if(!await optionalSchema(db,'SELECT l.session_key,l.teacher_ids_json,l.media_scope,a.display_name FROM lesson_media_lessons l,lesson_media_assets a WHERE 0'))throw fail('Lesson media needs its database upgrade.',503,'MEDIA_SCHEMA_REQUIRED');
  if(!await p("SELECT 1 ok FROM academy_settings WHERE setting_key='LessonMediaEnabled' AND setting_value='1'").first())throw fail('Lesson media is not available yet.',503,'MEDIA_NOT_ENABLED');
  let key=input.activityKey;
  if(input.lessonId){const row=await p('SELECT activity_key FROM lesson_media_lessons WHERE lesson_id=?',String(input.lessonId)).first();if(!row)throw fail('Lesson not found.',404);if(key&&!same(key,row.activity_key))throw fail('This lesson belongs to another learning area.',403,'MEDIA_FORBIDDEN');key=row.activity_key;}
  if(typeof key!=='string'||key.length>200||!/^(PROGRAM|COURSE):/.test(key))throw fail('Choose a Program or Course.');
  scopeKey=key;activity=await scope();scopeKey=activity.activity_key;
  monthlyPolicy=monthlyEnabled(repository)?await p('SELECT * FROM program_monthly_media_policies WHERE activity_key=?',scopeKey).first():null;
  if(auth.adminView&&!administers(auth,scopeKey))throw fail('This area is outside your Admin view.',403,'MEDIA_FORBIDDEN');
  admin=Boolean(auth.state.account.global_admin||auth.state.roles.some(r=>same(r.activity_key,scopeKey)&&r.role==='PROGRAM_ADMIN'));
  student=(auth.state.monthlyMedia||[]).some(r=>same(r.activity_key,scopeKey))||auth.state.roles.some(r=>same(r.activity_key,scopeKey)&&r.role==='STUDENT')||auth.state.subscriptions.some(r=>same(r.activity_key,scopeKey));
  if(repository.features?.mediaSeparation&&auth.workspace==='LEARN'&&activity.kind==='COURSE'&&await p("SELECT 1 ok FROM course_settings WHERE activity_key=? AND legacy_access_model='FREE' AND policy_review_state='CONFIRMED'",scopeKey).first())student=true;
  teacher=auth.state.roles.some(r=>same(r.activity_key,scopeKey)&&r.role==='TEACHER');
  preview=readerPreview(auth,scopeKey);
  if(preview&&auth.workspace==='TEACH')teacher=true;
  if(!canRead())throw fail('This lesson media is outside your access.',403,'MEDIA_FORBIDDEN');
 };
 async function lesson(id){const row=await p(`SELECT l.*,c.name class_name,${audienceSQL} learner_allowed FROM lesson_media_lessons l LEFT JOIN classes c ON c.activity_key=l.activity_key AND c.class_id=l.class_id WHERE l.lesson_id=? AND l.activity_key=?`,...audienceValues(),String(id||''),scopeKey).first();if(!row)throw fail('Lesson not found.',404);return row;}
 function reader(row){if(!readerAccess(row)||row.state!=='PUBLISHED')throw fail('Published lesson media is available to assigned learners, teachers and admins.',403,'MEDIA_FORBIDDEN');}
 function staff(row){if(!manages(row))throw fail('This session is outside your media management access.',403,'MEDIA_FORBIDDEN');}
 function revision(row,input){if(!Number.isInteger(input.revision)||row.revision!==input.revision)throw fail('This entry changed. Refresh before saving; your entry is kept.',409,'ROW_CHANGED');}
 const dto=row=>({id:row.lesson_id,sessionKey:row.session_key||'',activityKey:row.activity_key,runId:row.run_id,mediaScope:row.media_scope||'SESSION',date:row.lesson_date,title:row.title,startTime:row.start_time,endTime:row.end_time,teacher:row.teacher_name,className:row.class_name||JSON.parse(row.source_lessons_json)[0]?.classNames?.join(', ')||'',classIds:[...new Set([row.class_id,...JSON.parse(row.source_lessons_json||'[]').flatMap(r=>r.classIds||[])].filter(Boolean))],summary:row.summary,state:row.state,commentsClosed:Boolean(row.comments_closed),revision:row.revision,canManage:manages(row),canView:readerAccess(row)&&row.state==='PUBLISHED',...(admin||!repository.setup?.enabled&&manages(row)?{lessons:JSON.parse(row.source_lessons_json)}:{lessons:[]}),readOnly:preview,retainRecordings:monthlyPolicy?.retain_recordings===1});
 const assetDTO=a=>({id:a.asset_id,kind:a.kind,filename:a.filename,name:a.display_name||a.filename||(a.kind==='PDF'?'PDF':'Video'),...(a.kind==='MP4'?{byteSize:a.byte_size,...videoExpiry(a,Date.now(),retained(a))}:{})});
 const video=sessionVideos({p,auth,env,lesson,staff,reader,revision,change,receipt,assets,retained,retentionPrefix:()=>monthlyPolicy?.retain_recordings===1,scopeKey:()=>scopeKey});
 async function assets(id,management=false){return (await p('SELECT a.* FROM lesson_media_links l JOIN lesson_media_assets a USING(asset_id) WHERE l.lesson_id=? ORDER BY a.kind,a.created_at,a.asset_id',id).all()).results.map(a=>({...assetDTO(a),...(management&&a.kind==='YOUTUBE'?{url:'https://youtu.be/'+a.youtube_id}:{})}));}
 async function list(input,period=false){
  const preview=input.view==='learner'||!isAdminWorkspace(auth)&&!actualRole(auth,scopeKey,'TEACHER'),runId=input.runId||'';
  if(typeof runId!=='string'||runId.length>160)throw fail('Choose a Course offering.');
  if(input.month!==undefined&&!/^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(input.month))throw fail('Choose a valid month and year.');
  let date='9999-12-31',id='';
  if(input.before){try{if(String(input.before).startsWith('['))[date,id]=JSON.parse(input.before);else date=input.before;}catch{throw fail('Invalid media page.');}if(!validDate(date)||typeof id!=='string'||id.length>100)throw fail('Invalid media page.');}
  const rows=(await p(`SELECT l.*,c.name class_name,${audienceSQL} learner_allowed FROM lesson_media_lessons l LEFT JOIN classes c ON c.activity_key=l.activity_key AND c.class_id=l.class_id WHERE l.activity_key=? AND l.media_scope='SESSION' AND (?='' OR l.class_id=? COLLATE NOCASE OR EXISTS(SELECT 1 FROM json_each(l.source_lessons_json,'$[0].classIds') WHERE value=? COLLATE NOCASE)) AND (?=1 OR ${audienceSQL}) AND (?='' OR l.run_id=?) AND (?='' OR substr(l.lesson_date,1,7)=?) AND (l.lesson_date<? OR (l.lesson_date=? AND l.lesson_id<?)) AND ${preview?"l.state='PUBLISHED'":admin?'1=1':teacher&&!repository.setup?.enabled?"(l.state='PUBLISHED' OR l.teacher_id=? OR EXISTS(SELECT 1 FROM json_each(l.teacher_ids_json) WHERE value=? COLLATE NOCASE))":"l.state='PUBLISHED'"} ${period?' AND l.lesson_date>=? AND l.lesson_date<=?':''} ORDER BY l.lesson_date DESC,l.lesson_id DESC LIMIT ${period?401:31}`,...audienceValues(),scopeKey,...Array(3).fill(viewedClass(auth,scopeKey)||''),Number(admin||teacher||readerPreview(auth,scopeKey)),...audienceValues(),runId,runId,input.month||'',input.month||'',date,date,id,...(!preview&&!admin&&teacher&&!repository.setup?.enabled?[actor,actor]:[]),...(period?[input.startDate,input.endDate]:[])).all()).results;
  if(period&&rows.length>400)throw fail('Choose a shorter media period.');
  const page=rows.slice(0,period?400:30),ids=page.map(r=>r.lesson_id),links=ids.length?(await p('SELECT l.lesson_id,a.asset_id,a.kind,a.filename,a.display_name,a.created_at,a.byte_size,a.object_key FROM lesson_media_links l JOIN lesson_media_assets a USING(asset_id) WHERE l.lesson_id IN(SELECT value FROM json_each(?)) ORDER BY a.created_at,a.asset_id',JSON.stringify(ids)).all()).results:[];
  return {activityKey:scopeKey,activityName:activity.name,kind:activity.kind,monthlyPolicy:monthlyPolicy?{enabled:Boolean(monthlyPolicy.enabled),retainRecordings:true}:null,availableMonths:[...new Set((auth.state.monthlyMedia||[]).filter(g=>same(g.activity_key,scopeKey)).map(g=>g.lesson_month))].sort().reverse(),canManage:!preview&&(admin||!repository.setup?.enabled&&teacher),canView:canRead(),learnerPreview:preview,lessons:page.map(row=>({...dto(row),...(preview?{canManage:false}:{}),assets:links.filter(a=>a.lesson_id===row.lesson_id).map(assetDTO)})),before:!period&&rows.length>30?JSON.stringify([page.at(-1).lesson_date,page.at(-1).lesson_id]):null};
 }
 async function courseFiles(preview=false){
  if(activity.kind!=='COURSE')return null;
  const record=await p("SELECT l.*,1 learner_allowed FROM lesson_media_lessons l WHERE activity_key=? AND media_scope='COURSE'",scopeKey).first();
  if(!record||record.state!=='PUBLISHED'&&(preview||!admin))return {canManage:!preview&&admin,media:null};
  return {canManage:!preview&&admin,media:{...dto(record),canManage:!preview&&admin,assets:await assets(record.lesson_id)}};
 }
 function newCourseFiles(){
  if(activity.kind!=='COURSE'||!admin)throw fail('Only Course administrators may manage Course PDFs.',403,'MEDIA_FORBIDDEN');
  return {lesson_id:'LM-'+crypto.randomUUID(),activity_key:scopeKey,media_scope:'COURSE',teacher_ids_json:'[]',isNew:true};
 }
 async function createCourseFiles(input){
  const row=newCourseFiles(),hash=await payloadHash({action:'course-files-create',input}),saved=await receipt(input,hash);if(saved)return saved;
  return change('course-files-create',input,row,'staff',async current=>{
   const existing=await p("SELECT lesson_id FROM lesson_media_lessons WHERE activity_key=? AND media_scope='COURSE'",scopeKey).first();
   if(existing)return {statements:[],result:{lessonId:existing.lesson_id,existing:true}};
   return {statements:[p("INSERT INTO lesson_media_lessons(lesson_id,activity_key,lesson_date,title,start_time,end_time,teacher_name,state,comments_closed,updated_at,media_scope) VALUES(?,?,'','Course PDFs','','','','DRAFT',1,?,'COURSE')",current.lesson_id,scopeKey,new Date().toISOString())],result:{lessonId:current.lesson_id,revision:1}};
  });
 }
 async function sessions(input){if(!admin&&!teacher)throw fail('Choose an area you teach or administer.',403,'MEDIA_FORBIDDEN');if(preview)return {sessions:[],runs:[],runId:input.runId||''};return mediaSessions(repository,activity,input,actor,admin||auth.workspace==='TEACH'&&administers(auth,scopeKey));}
 // The calendar reuses the media audience checks. Learners never read draft
 // timetable sessions or unpublished media; staff retain per-session authority.
 async function calendar(input){
  if(!validDate(input.startDate)||!validDate(input.endDate)||input.endDate<input.startDate||Date.parse(input.endDate+'T12:00:00Z')-Date.parse(input.startDate+'T12:00:00Z')>30*86400000)throw fail('Choose a media period of up to 31 days.');
  const staffView=input.view!=='learner'&&(admin||teacher);
  const schedule=staffView?await sessions(input):{sessions:[],runs:[],runId:input.runId||''};
  const selectedInput=activity.kind==='COURSE'&&schedule.runId?{...input,runId:schedule.runId}:input;
  const media=await list(selectedInput,true);
  const records=new Map(media.lessons.filter(row=>row.sessionKey).map(row=>[row.sessionKey,row]));
  const dated=schedule.sessions.filter(row=>row.date>=input.startDate&&row.date<=input.endDate);
  const keys=new Set(dated.map(row=>row.sessionKey));
  const rows=dated.map(row=>({...row,canManage:records.get(row.sessionKey)?.canManage??Boolean(admin||!repository.setup?.enabled&&teacher),media:records.get(row.sessionKey)||null}));
  for(const row of media.lessons)if(!keys.has(row.sessionKey))rows.push({sessionKey:row.sessionKey||'media:'+row.id,date:row.date,title:row.title,startTime:row.startTime,endTime:row.endTime,classNames:row.className?[row.className]:[],classIds:row.classIds,teacherName:row.teacher,canManage:row.canManage,media:row,savedMedia:!row.sessionKey||staffView});
  const timezone=repository.features?.mediaSeparation?await appTimezone(repository):'Africa/Johannesburg';let suggestedDate='';
  if(input.initial===true&&!rows.length){
   const available=schedule.sessions.length?schedule.sessions:(await list({...selectedInput,before:undefined})).lessons;
   const today=academyDate(new Date(),timezone),dates=available.map(row=>row.date).sort();
   suggestedDate=dates.filter(day=>day<=today).at(-1)||dates[0]||'';
  }
  return {...media,timezone,sessions:rows.sort((a,b)=>a.date.localeCompare(b.date)||a.startTime.localeCompare(b.startTime)||a.sessionKey.localeCompare(b.sessionKey)),runs:schedule.runs,runId:schedule.runId,suggestedDate,courseFiles:await courseFiles(input.view==='learner')};
 }
 // A rail pages saved media across dates. Current-week dated sessions remain
 // available for Admin curation and genuine Teacher contributions.
 async function feed(input){
  if(typeof (input.runId||'')!=='string'||(input.runId||'').length>160)throw fail('Choose a Course offering.');
  const timezone=repository.features?.mediaSeparation?await appTimezone(repository):'Africa/Johannesburg',today=academyDate(new Date(),timezone),startDate=new Date(Date.parse(today+'T12:00:00Z')-new Date(today+'T12:00:00Z').getUTCDay()*86400000).toISOString().slice(0,10),endDate=new Date(Date.parse(startDate+'T12:00:00Z')+6*86400000).toISOString().slice(0,10);
  const state=await p('SELECT version FROM academy_write_state WHERE singleton=1').first(),cacheRevision=await payloadHash([input.includeCourseCompanion===true?(input.includeCourseSessions===true?'MEDIA_RAIL_KAHF_SESSIONS_V1':'MEDIA_RAIL_KAHF_20261018'):'MEDIA_RAIL_V1',state.version,repository.setup?.head||'ADMIN',today,actor,auth.workspaceContext||auth.workspace,viewedClass(auth,scopeKey),scopeKey,input.runId||'',input.view||'',input.month||'']);
  if(input.ifRevision===cacheRevision)return {activityKey:scopeKey,cacheRevision,notModified:true};
  const media=await list(input),staffView=input.view!=='learner'&&(admin||teacher),schedule=staffView&&!input.before?await sessions({...input,startDate,endDate,allRuns:!input.runId}):{sessions:[],runs:[],runId:input.runId||''};
  const rows=new Map(media.lessons.map(row=>[row.sessionKey||'media:'+row.id,{sessionKey:row.sessionKey||'media:'+row.id,date:row.date,title:row.title,startTime:row.startTime,endTime:row.endTime,classNames:row.className?[row.className]:[],classIds:row.classIds,teacherName:row.teacher,runId:row.runId,canManage:row.canManage,media:row,savedMedia:true}]));
  for(const row of schedule.sessions)if(!rows.has(row.sessionKey))rows.set(row.sessionKey,{...row,canManage:Boolean(admin||!repository.setup?.enabled&&teacher),media:null});
  const websiteFlag=input.includeCourseCompanion===true?await p("SELECT setting_value FROM academy_settings WHERE setting_key=?",'CourseWebsitePublished:'+scopeKey.toUpperCase()).first():null;
  const files=await courseFiles(input.view==='learner'),companion=websiteFlag?.setting_value==='0'?null:input.includeCourseCompanion===true?courseCompanion(activity,files):null;
  let readerSchedule;
  if(companion&&input.includeCourseSessions===true){
   try{readerSchedule=await courseReaderSessions(repository,auth,activity);}
   catch(error){if([401,403].includes(error.status))throw error;readerSchedule={sessions:[],unavailable:true};}
  }
  return {...media,cacheRevision,timezone,startDate,endDate,...(input.includeCourseCompanion===true?{courseCompanion:companion?{...companion,...(websiteFlag?.setting_value==='1'?{editableWebsite:true}:{}),readerKey:await payloadHash(['COURSE_READER_OWNER',actor,scopeKey]),...(readerSchedule?{schedule:readerSchedule}:{})}:null}:{}),sessions:[...rows.values()].sort((a,b)=>a.date.localeCompare(b.date)||a.startTime.localeCompare(b.startTime)||a.sessionKey.localeCompare(b.sessionKey)),runId:input.runId||'',runs:[],courseFiles:files};
 }
 async function historicalSession(input){
  if(!admin||!isAdminWorkspace(auth)||!monthlyPolicy)throw fail('Historical lesson entries require the prepared monthly Program and Admin workspace.',403,'MEDIA_FORBIDDEN');
  const date=input.date,title=cleanText(input.title,180,'a lesson title'),ids=input.classIds;
  if(!validDate(date)||date>academyDate(new Date(),await appTimezone(repository))||!Array.isArray(ids)||!ids.length||ids.length>50||ids.some(id=>typeof id!=='string'||!id||id.length>160)||new Set(ids).size!==ids.length)throw fail('Choose the original past lesson date, title and covered classes.');
  const classes=(await p('SELECT class_id,name FROM classes WHERE activity_key=? AND class_id IN(SELECT value FROM json_each(?))',scopeKey,JSON.stringify(ids)).all()).results;
  if(classes.length!==ids.length)throw fail('Choose classes belonging to this Program.');
  const session={sessionKey:JSON.stringify(['HISTORICAL',date,input.operationId]),date,title,classIds:classes.map(c=>c.class_id),classNames:classes.map(c=>c.name),historical:true,startTime:'',endTime:'',teacherIds:[],teacherName:''};
  return {lesson_id:'LM-HISTORY-'+input.operationId,activity_key:scopeKey,class_id:ids.length===1?ids[0]:null,lesson_date:date,title,start_time:'',end_time:'',teacher_id:null,teacher_name:'',teacher_ids_json:'[]',source_publication_id:null,source_lessons_json:JSON.stringify([session]),session_key:session.sessionKey,run_id:'',isNew:true};
 }
 async function selectedSession(input){
  if(input.historical===true)return historicalSession(input);
  const result=await sessions(input),session=result.sessions.find(r=>r.sessionKey===input.sessionKey);
  if(!session||session.sessionVersion!==input.sessionVersion)throw fail('This session changed. Refresh the session list before attaching media.',409,'SESSION_CHANGED');
  return {lesson_id:'LM-'+crypto.randomUUID(),activity_key:scopeKey,class_id:activity.kind==='PROGRAM'&&session.classIds.length===1?session.classIds[0]:null,lesson_date:session.date,title:session.title.slice(0,180),start_time:session.startTime,end_time:session.endTime,teacher_id:session.teacherIds[0]||null,teacher_name:session.teacherName,teacher_ids_json:JSON.stringify(session.teacherIds),source_publication_id:session.publicationId,source_lessons_json:JSON.stringify([session]),session_key:session.sessionKey,run_id:session.runId,isNew:true};
 }
 async function create(input){
  if(!admin&&!teacher)throw fail('Only teaching staff may attach media.',403,'MEDIA_FORBIDDEN');
  const hash=await payloadHash({action:'create',input}),saved=await receipt(input,hash);if(saved){staff(await lesson(saved.lessonId));return saved;}
  const row=await selectedSession(input);staff(row);
  return change('create',input,row,'staff',async current=>{
   const existing=await p('SELECT lesson_id FROM lesson_media_lessons WHERE activity_key=? AND session_key=?',scopeKey,current.session_key).first();
   if(existing)return {statements:[],result:{lessonId:existing.lesson_id,existing:true}};
   const at=new Date().toISOString();return {statements:[p(`INSERT INTO lesson_media_lessons(lesson_id,activity_key,class_id,lesson_date,title,start_time,end_time,teacher_id,teacher_name,state,source_publication_id,source_lessons_json,updated_at,session_key,run_id,teacher_ids_json) VALUES(?,?,?,?,?,?,?,?,?,'DRAFT',?,?,?,?,?,?)`,current.lesson_id,scopeKey,current.class_id,current.lesson_date,current.title,current.start_time,current.end_time,current.teacher_id,current.teacher_name,current.source_publication_id,current.source_lessons_json,at,current.session_key,current.run_id,current.teacher_ids_json)],result:{lessonId:current.lesson_id,revision:1}};
  });
 }
 async function receipt(input,hash){const r=await p("SELECT payload_sha256,actor_account_id,json_remove(result_json,'$._acceptedChange','$._acceptedHead','$._acceptedPublic') result_json FROM operation_receipts WHERE dataset_key='LESSON_MEDIA' AND scope_key=? AND operation_id=?",scopeKey,input.operationId).first();if(!r)return null;if(!same(r.actor_account_id,actor)||r.payload_sha256!==hash)throw fail('This retry belongs to another change.',409,'OPERATION_ID_REUSED');return {...JSON.parse(r.result_json),replayed:true};}
 // Version and current account/session/role guards share the write transaction.
 // Media operations never load the Academy-wide account or media catalogue.
 async function change(action,input,row,mode,plan){
  if(preview)throw fail('Preview is read only.',403,'PREVIEW_READ_ONLY');
  if(!/^[a-f0-9-]{36}$/i.test(input.operationId||''))throw fail('This change needs its retry identifier.');
  const hash=await payloadHash({action,input});
  for(let attempt=0;attempt<3;attempt++){
   const saved=await receipt(input,hash);if(saved)return saved;
   const version=await p('SELECT version FROM academy_write_state WHERE singleton=1').first();
   const current=row.isNew?(row.media_scope==='COURSE'?newCourseFiles():await selectedSession(input)):await lesson(row.lesson_id);await scope();
   if(mode==='student')reader(current);else if(mode==='staff')staff(current);else if(!manages(current))reader(current);
   const {statements,result}=await plan(current),guard=crypto.randomUUID(),now=new Date().toISOString();
   const acceptance=await prepareFeatureChange(repository,auth,{dataset:'LESSON_MEDIA',scope:scopeKey,operationId:input.operationId,statements,describe:statement=>descriptions.get(statement),scopes:[scopeKey],enabled:admin&&(action==='save'&&input.state==='PUBLISHED'||action==='video-retain'&&current.state==='PUBLISHED'),fullRows:true,entities:{lesson_media_lessons:{sql:'lesson_id=?',values:[current.lesson_id]},lesson_media_links:{sql:'lesson_id=?',values:[current.lesson_id]},lesson_media_assets:{sql:'asset_id IN(SELECT asset_id FROM lesson_media_links WHERE lesson_id=?)',values:[current.lesson_id]}}});
   if(acceptance)result.acceptedChange=acceptance.reference;
   const authority=isAdminWorkspace(auth)?mode==='student'?`(${globalSQL} OR ${rolesSQL} OR EXISTS(SELECT 1 FROM effective_course_subscriptions cs WHERE cs.account_id=a.account_id AND cs.activity_key=?))`:`(${globalSQL} OR ${rolesSQL} OR (${rolesSQL} AND EXISTS(SELECT 1 FROM json_each(?) WHERE value=a.account_id COLLATE NOCASE)))`:mode==='student'?`(${rolesSQL} OR (?=1 AND EXISTS(SELECT 1 FROM effective_course_subscriptions cs WHERE cs.account_id=a.account_id AND cs.activity_key=?)))`:`(${rolesSQL} AND EXISTS(SELECT 1 FROM json_each(?) WHERE value=a.account_id COLLATE NOCASE))`;
   const roleValues=isAdminWorkspace(auth)?mode==='student'?[scopeKey,JSON.stringify(['STUDENT','TEACHER']),scopeKey]:[scopeKey,JSON.stringify(['PROGRAM_ADMIN']),scopeKey,JSON.stringify(['TEACHER']),JSON.stringify(teachers(current))]:mode==='student'?[scopeKey,JSON.stringify([auth.workspace==='TEACH'?'TEACHER':'STUDENT']),Number(auth.workspace==='LEARN'),scopeKey]:[scopeKey,JSON.stringify(['TEACHER']),JSON.stringify(teachers(current))];
   try{
    const savedResult=acceptance?.receipt(result)||{expression:'?',values:[JSON.stringify(result)]};
    await db.batch([p(`INSERT INTO academy_write_guards(guard_id,accepted) VALUES(?,(SELECT version=? FROM academy_write_state WHERE singleton=1) AND EXISTS(SELECT 1 FROM accounts a JOIN account_credentials c USING(account_id) JOIN account_sessions s USING(account_id) WHERE a.account_id=? AND a.active=1 AND c.pin_setup=1 AND length(trim(c.pin_hash))>0 AND c.credential_epoch=? AND s.session_id=? AND s.revoked_at IS NULL AND s.credential_epoch=c.credential_epoch AND s.expires_at>? AND ${authority}))`,guard,version.version,actor,auth.state.account.credential_epoch,auth.sid,now,...roleValues),...statements,
     p('INSERT INTO audit_events(event_id,occurred_at,actor_account_id,authority,scope_key,action,record_kind,record_id,changed_fields_json) VALUES(?,?,?,?,?,?,?,?,?)',crypto.randomUUID(),now,actor,auth.user.role,scopeKey,action,'LESSON_MEDIA',current.lesson_id,JSON.stringify({action})),
     p(`INSERT INTO operation_receipts(dataset_key,scope_key,operation_id,payload_sha256,result_json,actor_account_id,completed_at) VALUES('LESSON_MEDIA',?,?,?,${savedResult.expression},?,?)`,scopeKey,input.operationId,hash,...savedResult.values,actor,now),p('UPDATE academy_write_state SET version=version+1 WHERE singleton=1'),p('DELETE FROM academy_write_guards WHERE guard_id=?',guard)]);
    return result;
   }catch(e){const recovered=await receipt(input,hash);if(recovered)return recovered;if(!/academy_management_stale/.test(e.message))throw e;const state=await repository.session(auth.sid,actor,auth.state.account.credential_epoch);if(!state)throw fail('Your Academy session has ended.',401);if(attempt===2)throw fail('The entry changed. Refresh before saving.',409,'ROW_CHANGED');}
  }
 }
 async function save(input){
  const row=await lesson(input.lessonId);staff(row);
  return change('save',input,row,'staff',async current=>{
   revision(current,input);
   const title=cleanText(input.title,180,'a lesson title'),summary=cleanText(input.summary,4000,'a summary',true),state=input.state;
   if(!['DRAFT','PUBLISHED','HIDDEN'].includes(state)||typeof input.commentsClosed!=='boolean')throw fail('Choose a lesson state.');
   const named=input.videos!==undefined,recordings=named?input.videos:input.recordingUrls??(input.recordingUrl?.trim()?[input.recordingUrl.trim()]:[]);
   if(!Array.isArray(recordings)||recordings.length>10)throw fail('Use up to ten YouTube videos per session.');
   if(current.media_scope==='COURSE'&&recordings.length)throw fail('Course PDFs accepts PDF files; attach videos to a session.');
   const old=(await p("SELECT a.* FROM lesson_media_links l JOIN lesson_media_assets a USING(asset_id) WHERE l.lesson_id=? AND a.kind='YOUTUBE'",row.lesson_id).all()).results;
   const names=input.attachmentNames??[],removed=input.removeAssetIds??[];
   if(!Array.isArray(names)||!Array.isArray(removed)||names.length>50||removed.length>50||names.some(a=>!a||typeof a.assetId!=='string')||removed.some(id=>typeof id!=='string')||new Set([...names.map(a=>a.assetId),...removed]).size!==names.length+removed.length)throw fail('Choose different attachments to update.');
   const uploaded=(await assets(row.lesson_id)).filter(a=>a.kind==='MP4'&&!a.expired&&!removed.includes(a.id));
   if(recordings.length+uploaded.length>10)throw fail('Use up to ten videos per session.');
   const videos=new Map();
   for(const [index,value] of recordings.entries()){
    if(named&&(!value||typeof value!=='object'||Array.isArray(value)))throw fail('Enter a video name and YouTube link.');
    const id=youtubeId(named?value.url:value),previous=old.find(a=>a.youtube_id===id),name=named?cleanText(value.name||'',180,'a video name',true):previous?.display_name||'';
    if(!videos.has(id))videos.set(id,{id,name,previous,index});
   }
   const pdfs=names.length||removed.length?(await p("SELECT a.asset_id FROM lesson_media_links l JOIN lesson_media_assets a USING(asset_id) WHERE l.lesson_id=? AND a.kind IN('PDF','MP4')",row.lesson_id).all()).results:[];
   if([...names.map(a=>a.assetId),...removed].some(id=>!pdfs.some(a=>a.asset_id===id)))throw fail('Attachment not found in this lesson.',404);
   const pdfChanges=[...names.map(a=>p('UPDATE lesson_media_assets SET display_name=? WHERE asset_id=?',cleanText(a.name,180,'an attachment name',true),a.assetId)),...removed.map(id=>p('DELETE FROM lesson_media_links WHERE lesson_id=? AND asset_id=?',row.lesson_id,id))];
   const statements=[...pdfChanges,...(repository.features?.mediaSeparation&&state==='HIDDEN'?[p('INSERT INTO lesson_media_visibility VALUES(?,0,?,?) ON CONFLICT(lesson_id) DO UPDATE SET visible=0,updated_at=excluded.updated_at,updated_by=excluded.updated_by',row.lesson_id,new Date().toISOString(),actor)]:[]),p('UPDATE lesson_media_lessons SET title=?,summary=?,state=?,comments_closed=?,revision=revision+1,updated_at=? WHERE lesson_id=?',title,summary,state,current.media_scope==='COURSE'?1:Number(input.commentsClosed),new Date().toISOString(),row.lesson_id),...old.filter(a=>!videos.has(a.youtube_id)).map(a=>p('DELETE FROM lesson_media_links WHERE lesson_id=? AND asset_id=?',row.lesson_id,a.asset_id))];
   for(const video of videos.values()){
    if(video.previous){statements.push(p('UPDATE lesson_media_assets SET display_name=? WHERE asset_id=?',video.name,video.previous.asset_id));continue;}
    const assetId=crypto.randomUUID();statements.push(p("INSERT INTO lesson_media_assets(asset_id,activity_key,kind,youtube_id,filename,display_name,created_at) VALUES(?,?,'YOUTUBE',?,?,?,?)",assetId,scopeKey,video.id,'Video '+(video.index+1),video.name,new Date().toISOString()),p('INSERT INTO lesson_media_links VALUES(?,?)',row.lesson_id,assetId));
   }
   return {statements,result:{lessonId:row.lesson_id,revision:current.revision+1}};
  });
 }
 async function comments(input){
  const row=await lesson(input.lessonId);if(!manages(row))reader(row);
  const moderates=manages(row)&&input.view!=='learner';
  const before=input.before||'9999-12-31T23:59:59.999Z';if(typeof before!=='string'||before.length>64)throw fail('Invalid comment page.');
  const rows=(await p(`SELECT c.*,a.display_name FROM lesson_media_comments c JOIN accounts a USING(account_id) WHERE c.lesson_id=? AND c.created_at<? AND ${moderates?"c.state<>'DELETED'":"(c.state='APPROVED' OR (c.account_id=? AND c.state<>'DELETED'))"} ORDER BY c.created_at DESC,c.comment_id DESC LIMIT 101`,row.lesson_id,before,...(moderates?[]:[actor])).all()).results;
  return {commentsClosed:Boolean(row.comments_closed),canManage:moderates,comments:rows.slice(0,100).map(c=>({id:c.comment_id,name:c.display_name,body:c.body,parentId:c.parent_id,state:c.state,staff:Boolean(c.staff),pinned:Boolean(c.pinned),revision:c.revision,createdAt:c.created_at,own:same(c.account_id,actor)})),before:rows.length>100?rows[99].created_at:null};
 }
 async function commentSave(input){
  const row=await lesson(input.lessonId),isStaff=manages(row);if(!isStaff)reader(row);
  return change('comment-save',input,row,isStaff?'staff':'student',async current=>{
   if(current.comments_closed&&!isStaff)throw fail('Discussion is closed for this lesson.',409,'COMMENTS_CLOSED');
   const body=cleanText(input.body,2000,'a comment');let old=null;
   if(input.commentId){old=await p('SELECT * FROM lesson_media_comments WHERE lesson_id=? AND comment_id=?',row.lesson_id,input.commentId).first();if(!old||old.state==='DELETED'||!same(old.account_id,actor))throw fail('You can edit only your own comments.',403);revision(old,input);}
   const parentId=old?.parent_id||input.parentId||null;
   if(parentId&&!await p("SELECT 1 ok FROM lesson_media_comments WHERE comment_id=? AND lesson_id=? AND state='APPROVED' AND parent_id IS NULL",parentId,row.lesson_id).first())throw fail('Reply to an approved comment in this lesson.');
   const id=old?.comment_id||crypto.randomUUID(),now=new Date().toISOString(),state=isStaff?'APPROVED':'PENDING';
   return {statements:[old?p('UPDATE lesson_media_comments SET body=?,state=?,pinned=0,revision=revision+1,updated_at=? WHERE comment_id=?',body,state,now,id):p('INSERT INTO lesson_media_comments(comment_id,lesson_id,account_id,parent_id,body,state,staff,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)',id,row.lesson_id,actor,parentId,body,state,Number(isStaff),now,now)],result:{commentId:id,state}};
  });
 }
 async function moderate(input){
  const row=await lesson(input.lessonId),isStaff=manages(row);if(!isStaff)reader(row);
  return change('comment-moderate',input,row,isStaff?'staff':'student',async()=>{
   const c=await p('SELECT * FROM lesson_media_comments WHERE comment_id=? AND lesson_id=?',input.commentId,row.lesson_id).first();if(!c)throw fail('Comment not found.',404);revision(c,input);
   if(!isStaff&&!(same(c.account_id,actor)&&input.decision==='DELETE'))throw fail('Only assigned teachers and admins can curate comments.',403);
   const states={APPROVE:'APPROVED',HIDE:'HIDDEN',DELETE:'DELETED'};if(!states[input.decision]&&!['PIN','UNPIN'].includes(input.decision))throw fail('Choose a moderation action.');
   if(['PIN','UNPIN'].includes(input.decision)&&c.state!=='APPROVED')throw fail('Approve a comment before pinning it.');
   return {statements:[p('UPDATE lesson_media_comments SET state=?,body=?,pinned=?,revision=revision+1,updated_at=? WHERE comment_id=?',states[input.decision]||c.state,input.decision==='DELETE'?'[Removed]':c.body,input.decision==='PIN'?1:input.decision==='UNPIN'||states[input.decision]?0:c.pinned,new Date().toISOString(),c.comment_id)],result:{commentId:c.comment_id}};
  });
 }
 function bucket(){if(!env.LESSON_MEDIA_BUCKET?.put||!env.LESSON_MEDIA_BUCKET?.get)throw fail('Private lesson storage is not configured.',503,'MEDIA_STORAGE_REQUIRED');return env.LESSON_MEDIA_BUCKET;}
 async function upload(request,input){
  await ready(input);const row=await lesson(input.lessonId);staff(row);
  if(!/^[a-f0-9-]{36}$/i.test(input.operationId||''))throw fail('This change needs its retry identifier.');
  if(!Number.isSafeInteger(input.size)||input.size<5||input.size>MEDIA_PDF_LIMIT)throw fail('Choose a PDF up to 16 MB.',413);
  if(!/^[a-f0-9]{64}$/.test(input.sha256||''))throw fail('This upload needs its file checksum.');
  const displayName=cleanText(input.name||'',180,'a PDF name',true);
  const filename=cleanText(input.filename,180,'a filename').replace(/[\r\n\x00-\x1f\\/]/g,'_');
  const hash=await payloadHash({action:'pdf-upload',input}),saved=await receipt(input,hash);if(saved)return saved;
  revision(row,input);
  const id=crypto.randomUUID(),storage=bucket();
  try{
   await storeLessonPdf(request,storage,env.ACADEMY_OBJECT_NAMESPACE,input);
   const key=lessonPdfReference(env.ACADEMY_OBJECT_NAMESPACE,id,input.sha256);
   const result=await change('pdf-upload',input,row,'staff',async current=>{
    revision(current,input);const pdfCount=repository.features?.mediaSeparation&&current.media_scope!=='COURSE'?await sessionPdfCount(repository,{activityKey:scopeKey,session:{...(JSON.parse(current.source_lessons_json||'[]')[0]||{}),sessionKey:current.session_key}}):(await assets(row.lesson_id)).filter(a=>a.kind==='PDF').length;if(pdfCount>=(current.media_scope==='COURSE'?50:10))throw fail(current.media_scope==='COURSE'?'Use up to 50 Course PDFs.':'Use up to ten PDFs per lesson.');
    const now=new Date().toISOString();return {statements:[p("INSERT INTO lesson_media_assets(asset_id,activity_key,kind,object_key,filename,byte_size,created_at,display_name) VALUES(?,?,'PDF',?,?,?,?,?)",id,scopeKey,key,filename,input.size,now,displayName),p('INSERT INTO lesson_media_links VALUES(?,?)',row.lesson_id,id),p('UPDATE lesson_media_lessons SET revision=revision+1,updated_at=? WHERE lesson_id=?',now,row.lesson_id)],result:{assetId:id,filename,name:displayName||filename}};
   });
   return result;
  }catch(e){/* Preserve an immutable upload while its database acknowledgement is uncertain. */throw e;}
 }
 async function download(input){
  const row=await lesson(input.lessonId);if(!manages(row))reader(row);
  const asset=await p("SELECT a.* FROM lesson_media_links l JOIN lesson_media_assets a USING(asset_id) WHERE l.lesson_id=? AND a.asset_id=? AND a.kind='PDF'",row.lesson_id,String(input.assetId||'')).first();if(!asset)throw fail('PDF not found.',404);
  const object=await bucket().get(lessonPdfObjectKey(asset.object_key));if(!object)throw fail('This PDF is temporarily unavailable.',404);
  return new Response(object.body,{headers:{'Content-Type':'application/pdf','Content-Length':String(asset.byte_size),'Content-Disposition':`inline; filename*=UTF-8''${encodeURIComponent(asset.filename)}`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':'sandbox'}});
 }
 async function videoPart(request,input){await ready(input);return video.part(request,input);}
 async function videoStream(request,input){await ready(input);return video.stream(request,input);}
 async function run(action,input){
  if(repository.features?.mediaSeparation&&['comments','comment-save','comment-moderate'].includes(action))throw fail('Discussion is retired.',410,'DISCUSSION_RETIRED');
  await ready(input);if(['comments','comment-save','comment-moderate'].includes(action)&&input.lessonId&&(await lesson(input.lessonId)).media_scope==='COURSE')throw fail('Discussion belongs to individual sessions.');if(action==='course-files-create')return createCourseFiles(input);if(action==='calendar')return calendar(input);if(action==='feed')return feed(input);if(action==='sessions')return sessions(input);if(action==='historical-create')return create({...input,historical:true});if(action==='create')return create(input);if(action==='list')return list(input);if(action==='save')return save(input);if(action==='comments')return comments(input);if(action==='comment-save')return commentSave(input);if(action==='comment-moderate')return moderate(input);
  if(action==='video-retain')return video.retain(input);
  if(action==='video-start')return video.start(input);
  if(action==='video-complete')return video.complete(input);
  if(action==='video-abort')return video.abort(input);
  if(action==='download')return download(input);
  const row=await lesson(input.lessonId);
  if(action==='get'){staff(row);return {lesson:dto(row),assets:await assets(row.lesson_id,true),attachmentEditing:true};}
  if(action==='watch'){
   reader(row);const a=await p("SELECT a.* FROM lesson_media_links l JOIN lesson_media_assets a USING(asset_id) WHERE l.lesson_id=? AND a.asset_id=? AND a.kind IN('YOUTUBE','MP4')",row.lesson_id,String(input.assetId||'')).first();if(!a)throw fail('Recording not found.',404);
   if(a.kind==='MP4')return video.watch(row,a);
   return {kind:'YOUTUBE',embedUrl:'https://www.youtube-nocookie.com/embed/'+a.youtube_id+'?rel=0',title:row.title};
  }
  if(action==='attachment-name'){staff(row);return change(action,input,row,'staff',async current=>{revision(current,input);const asset=await p('SELECT 1 ok FROM lesson_media_links WHERE lesson_id=? AND asset_id=?',row.lesson_id,input.assetId).first();if(!asset)throw fail('Attachment not found.',404);const name=cleanText(input.name||'',180,'a media name',true);return {statements:[p('UPDATE lesson_media_assets SET display_name=? WHERE asset_id=?',name,input.assetId),p('UPDATE lesson_media_lessons SET revision=revision+1 WHERE lesson_id=?',row.lesson_id)],result:{renamed:true}};});}
  if(action==='attachment-remove'){staff(row);return change(action,input,row,'staff',async current=>{revision(current,input);const a=await p('SELECT 1 ok FROM lesson_media_links WHERE lesson_id=? AND asset_id=?',row.lesson_id,input.assetId).first();if(!a)throw fail('Attachment not found.',404);return {statements:[p('DELETE FROM lesson_media_links WHERE lesson_id=? AND asset_id=?',row.lesson_id,input.assetId),p('UPDATE lesson_media_lessons SET revision=revision+1 WHERE lesson_id=?',row.lesson_id)],result:{removed:true}};});}
  throw fail('Unknown media action.',404);
 }
 return {run,upload,videoPart,videoStream};
}
