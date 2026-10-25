import {substituteTimetable} from './substitute-timetable.js';
import {privateSnapshot} from './private-snapshot.js';
import {noTeachingCalendarEvents,holidayOnDate} from './calendar-holidays.js';
import { buildEntrance, addDays, sunday } from '../entrance.js';
import { dateInTimezone } from '../../lib/global-subject-delivery.js';
import { rehearsalError } from './repository.js';
import {courseCalendarAvailable,calendarRows} from './course-calendar.js';
import {buildAcademyCalendarEvents} from '../../lib/academy-calendar.js';
import {currentProgramZoom} from './program-zoom.js';
import {historicalPublications} from './historical-timetable.js';
import {MOU_MEDIA_PROGRAM} from './lesson-media.js';
import {d1CourseCatalogue} from './course-catalogue.js';
import {isAdminWorkspace,administers,actualState,readerPreview,classVisible,viewedClass} from './workspace-access.js';

const samePublication=(a,b)=>String(a).toUpperCase()===String(b).toUpperCase();
// Adapt normalized D1 records at the repository boundary. Reuse the established
// timetable projection so privacy, class membership and timed joining are shared.
export async function d1Entrance(repository,state,user,input={},now=new Date(),{days=7,detailed=false,auth}={}) {
  // Keep real learner assignments available for presentation even when Admin
  // readers project inherited teaching or a read-only student audience.
  const ownState=auth?actualState(auth):state;
  if(user&&ownState)user={...user,enrolledActivities:[...ownState.roles.filter(r=>r.role==='STUDENT'),...ownState.subscriptions].map(r=>r.activity_key)};
  const previewKeys=[];
  if(auth&&!isAdminWorkspace(auth)){
    const role=auth.workspace==='TEACH'?'TEACHER':'STUDENT';
    previewKeys.push(...actualState(auth).activities.filter(a=>administers(auth,a.activity_key)&&readerPreview(auth,a.activity_key)).map(a=>a.activity_key));
    state={...state,roles:[...state.roles,...previewKeys.map(activity_key=>({activity_key,role}))],subscriptions:[...state.subscriptions,...previewKeys.filter(k=>k.startsWith('COURSE:')).map(activity_key=>({activity_key}))]};
    user={...user,role,previewActivities:previewKeys,teachingActivities:auth.workspace==='TEACH'?actualState(auth).activities.filter(a=>administers(auth,a.activity_key)).map(a=>a.activity_key):[]};
  }
  const config=await repository.homeConfiguration();
  if(!config?.setting_value)throw rehearsalError('Academy timezone needs migration.');
  const start=input.startDate || (days===7?sunday(dateInTimezone(now,config.setting_value)):dateInTimezone(now,config.setting_value));
  if(!/^\d{4}-\d{2}-\d{2}$/.test(start)||Number.isNaN(Date.parse(start))||addDays(start,0)!==start)throw rehearsalError('Choose a valid timetable date.',400,'INVALID_DATE');
  const courseWorkflows=config.courseWorkflows??await courseCalendarAvailable(repository.db,true);
  const end=addDays(start,days-1);
  const [activities,publications,subjects,modules,classes,memberships,runs,runStates,lifecycles,calendar,suppressions,calendarSettings]=await privateSnapshot(repository,auth,{kind:'timetable-source',date:dateInTimezone(now,config.setting_value),now:now.getTime(),input:{start,end,courseWorkflows,programWorkspace:config.programWorkspace,globalAdmin:state?.account.global_admin,roles:state?.roles,subscriptions:state?.subscriptions}},()=>repository.homeData(state,start,end,courseWorkflows,config.programWorkspace));
  // The pilot's historical dates are in the past; ordinary timetable loads do
  // not query the extension table, and no historical lesson can be joined live.
  if(start<'2026-10-08'&&end>='2026-10-06'&&activities.some(a=>a.activity_key===MOU_MEDIA_PROGRAM))publications.push(...await historicalPublications(repository,start,end,Boolean(state)));
  // Labels arrive with the publication batch, keeping current profile names
  // without another database call. Anonymous reads never select these labels.
  const teacherAccounts=state?[...new Map(publications.flatMap(p=>JSON.parse(p.teacher_accounts_json||'[]')).map(a=>[a.account_id.toUpperCase(),a])).values()]:[];
  const stopped=config.programWorkspace?(await repository.db.prepare('SELECT activity_key,publication_id,status FROM program_publication_lifecycle').all()).results:[];
  const programs=activities.filter(a=>a.kind==='PROGRAM').map(a=>({id:a.activity_id,name:a.name,mode:'PROGRAM',status:'ACTIVE',timezone:a.timezone,publicFree:a.program_access_model==='FREE',capabilities:{attendance:true}}));
  const tables={UserAccounts:state?[repository.publicAccount(state.account),...teacherAccounts.filter(a=>!samePublication(a.account_id,state.account.account_id)).map(a=>({AccountID:a.account_id,DisplayName:a.display_name,Active:Boolean(a.active)}))]:[],PlatformConfig:[{ConfigKey:'PlatformTimezone',ConfigValue:config.setting_value}],
    GlobalSubjectList:activities.filter(a=>a.kind==='COURSE').map(a=>({SubjectID:a.activity_id,SubjectName:a.name,Active:true})),
    GlobalModuleList:modules.filter(m=>m.activity_key.startsWith('COURSE:')).map(m=>({ModuleID:m.module_id,SubjectID:m.activity_key.slice(7),ModuleName:m.name,Active:true})),
    GlobalSubjectAccessPolicy:activities.filter(a=>a.kind==='COURSE').map(a=>({SubjectPolicyID:a.activity_key,SubjectID:a.activity_id,AccessModel:a.legacy_access_model==='FREE'?'FREE':'SUBSCRIPTION',Active:true})),
    GlobalSubjectAccessMatrix:state?[{AccountID:state.account.account_id,_subjectAccess:Object.fromEntries([...state.subscriptions,...state.roles.filter(r=>r.activity_key.startsWith('COURSE:')&&r.role==='STUDENT')].map(s=>[s.activity_key.slice(7).toUpperCase(),true]))}]:[],
    GlobalSubjectRuns:runs.map(r=>({RunID:r.run_id,SubjectID:r.activity_key.slice(7),RunName:r.name,Timezone:r.timezone,StartDate:r.start_date || '',EndDate:r.end_date || '',ScheduleMode:r.schedule_mode,ScheduleDefinition:r.schedule_definition,...(courseWorkflows?{AccessModel:r.run_access_model}:{}),Active:true})),
    GlobalTimetableRunState:runStates.map(r=>({RunID:r.run_id,Stage:r.stage,CurrentPublicationID:r.current_publication_id || ''})),
    GlobalTimetablePublications:[],PublishedGlobalTimetableSessions:[],
    GlobalTimetableSessionLifecycle:lifecycles.map(r=>({SessionLifecycleID:r.lifecycle_id,SessionID:r.source_session_id,PublicationID:r.publication_id,Status:r.status,RescheduledFromSessionID:r.previous_source_session_id || '',RescheduledToSessionID:r.replacement_source_session_id || ''}))};
  for(const publication of publications.filter(p=>p.pattern==='COURSE')) {
    const snapshot=JSON.parse(publication.snapshot_json);
    tables.GlobalTimetablePublications.push(snapshot.publication);
    tables.PublishedGlobalTimetableSessions.push(...snapshot.sessions);
  }
  const rolesByProgram=Object.fromEntries(programs.map(p=>[p.id,state?[{AccountID:state.account.account_id,Active:true,Roles:state.roles.filter(r=>r.activity_key.toUpperCase()===`PROGRAM:${p.id}`.toUpperCase()).map(r=>r.role)}]:[]]));
  const rolesByCourse=courseWorkflows?Object.fromEntries(activities.filter(a=>a.kind==='COURSE').map(a=>[a.activity_id.toUpperCase(),state?.roles.filter(r=>r.activity_key.toUpperCase()===a.activity_key.toUpperCase()).map(r=>r.role)||[]])):null;
  const result=await buildEntrance({tables,programs,rolesByProgram,rolesByCourse,user,input:{...input,startDate:start},now,programLifecycle:'ACTIVE',rangeDays:days,detailedTimetable:detailed,publicJoining:true,loadProgram:async program=>{
    const activity=`PROGRAM:${program.id}`,scope=rows=>rows.filter(r=>r.activity_key===activity);
    const override=activities.find(a=>a.activity_key===activity)?.program_zoom_override;
    return {prepared:true,zoomLinkForLesson:(row,publication)=>currentProgramZoom(override,row,publication,scope(classes)),subjects:scope(subjects).map(s=>({SubjectID:s.subject_id,SubjectName:s.subject_name})),tables:{
      ProgramSubjects:scope(subjects).map(s=>({ProgramSubjectID:s.program_subject_id,CourseID:program.id,SubjectID:s.subject_id,Active:true})),
      ProgramLevels:[],ProgramModules:scope(modules).map(m=>({ProgramModuleID:m.module_id,ProgramSubjectID:m.program_subject_id,Name:m.name,Active:true})),
      ProgramClasses:scope(classes).map(c=>({ClassID:c.class_id,CourseID:program.id,Name:c.name,Active:true})),
      ProgramEnrollments:scope(memberships).map(m=>({EnrollmentID:m.enrollment_id,CourseID:program.id,ClassID:m.class_id,AccountID:m.account_id,StartDate:m.start_date || '',EndDate:m.end_date || '',Active:Boolean(m.active)})),
      ProgramTeachers:[],ProgramResources:[],ProgramTasks:[],ProgramModuleProgress:[],ProgramLibraryRoots:[],
      ProgramTimetablePublications:scope(publications).map(p=>({Lifecycle:stopped.find(l=>l.activity_key===p.activity_key&&samePublication(l.publication_id,p.publication_id))?.status||'',PublicationID:p.publication_id,VersionNo:p.version_no,SnapshotJSON:p.snapshot_json,PublishedDate:p.published_at,PublishedByAccountID:p.published_by_source_id}))}};
  }});
  if(config.programWorkspace){
    const today=dateInTimezone(now,config.setting_value);
    const project=row=>row.kind==='COURSE'?{...row,menuAvailable:activities.find(a=>a.activity_key.toUpperCase()===('COURSE:'+row.id).toUpperCase())?.course_menu_available!==0,curriculumActive:runs.some(run=>samePublication(run.activity_key,'COURSE:'+row.id)&&run.start_date&&run.end_date&&run.start_date<=today&&run.end_date>=today&&runStates.some(state=>state.run_id===run.run_id&&state.current_publication_id&&['PUBLISHED','ACTIVE'].includes(state.stage)))}:{...row,curriculumActive:true};
    for(const name of ['activities','personalActivities','activityPages'])result[name]=result[name].map(project);
    if(result.activity)result.activity=project(result.activity);
  }
  // Planning is independent of the displayed timetable week. Reuse the scoped
  // catalogue's safe metadata; never send editor sessions or meeting links here.
  if(courseWorkflows&&state&&(state.account.global_admin||state.roles.some(r=>r.activity_key.startsWith('COURSE:')&&['TEACHER','PROGRAM_ADMIN'].includes(r.role)))){
    const catalogue=await d1CourseCatalogue(repository,auth?{...auth,state,user}:{state,user},now),today=dateInTimezone(now,config.setting_value);
    const staffCourses=new Set(result.personalActivities.filter(a=>a.kind==='COURSE'&&a.roles.some(r=>['GLOBAL_ADMIN','PROGRAM_ADMIN','TEACHER'].includes(r))).map(a=>a.id.toUpperCase()));
    result.upcomingCourses=catalogue.courses.filter(c=>staffCourses.has(c.id.toUpperCase())&&c.canOpenActivity&&['PUBLISHED','DRAFT'].includes(c.stage)&&c.startDate>today)
      .map(({id,runId,name,stage,startDate,endDate,canPlan,canManage})=>({id,runId,name,stage,startDate,endDate,canPlan,canManage}))
      .sort((a,b)=>a.startDate.localeCompare(b.startDate)||a.name.localeCompare(b.name));
  }
  if(state&&config.memorisationCards){
    const setting=await repository.db.prepare('SELECT active FROM memorisation_account_settings WHERE account_id=?').bind(state.account.account_id).first();
    result.memorisationActive=setting?.active!==0;
  }
  if(config.programWorkspace)result.timetable=result.timetable.map(row=>row.kind==='PROGRAM'?{...row,publicCard:JSON.parse(activities.find(a=>a.kind==='PROGRAM'&&samePublication(a.activity_id,row.activityId))?.public_card_json||'{}')}:row);
  result.timetable=result.timetable.map(row=>row.kind==='COURSE'?{...row,publicCard:JSON.parse(activities.find(a=>a.kind==='COURSE'&&samePublication(a.activity_id,row.activityId))?.course_public_card_json||'null')}:row);
  if(courseWorkflows){
    const data={calendar,suppressions,settings:calendarSettings},byActivity=new Map();
    const project=row=>{const activity=row.kind+':'+row.activityId;if(!byActivity.has(activity))byActivity.set(activity,noTeachingCalendarEvents(data,start,end,activity));const holiday=holidayOnDate(byActivity.get(activity),row.date);if(!holiday||row.status!=='SCHEDULED')return row;const {joinKey,joinUrl,publicJoin,...rest}=row;return {...rest,status:'HOLIDAY',holidayName:holiday.description};};
    result.timetable=result.timetable.map(project);result.personalTimetable=result.personalTimetable.map(project).filter(row=>row.status==='SCHEDULED');if(result.activity)result.activity={...result.activity,timetable:result.activity.timetable.map(project)};
    result.calendarEvents=buildAcademyCalendarEvents(calendarRows(calendar,suppressions,calendarSettings),start,end);
  }
  if(auth){
    result.workspace=auth.workspaceContext||auth.workspace;
    result.audience=auth.workspace;result.adminView=Boolean(auth.adminView);
    const real=actualState(auth),canAdmin=Boolean(real.account.global_admin||real.roles.some(r=>r.role==='PROGRAM_ADMIN'));
    // Navigation uses the real account role; reader permissions stay projected.
    result.workspaceAccess={globalAdmin:Boolean(real.account.global_admin),learn:true,teach:real.roles.some(r=>r.role==='TEACHER'),admin:canAdmin,adminLearn:canAdmin,adminTeach:canAdmin};
    result.previewActivities=previewKeys;
    if(auth.adminView){
      for(const key of ['activities','personalActivities','activityPages'])result[key]=result[key].filter(a=>administers(auth,a.kind+':'+a.id));
      for(const key of ['timetable','personalTimetable'])result[key]=result[key].filter(a=>administers(auth,a.kind+':'+a.activityId));
      if(result.activity&&!administers(auth,result.activity.kind+':'+result.activity.id))throw rehearsalError('This area is outside your Admin view.',403,'FORBIDDEN');
    }
    const classAudience=a=>({...a,studentPreview:auth.workspace==='LEARN'&&administers(auth,a.kind+':'+a.id),viewClassId:viewedClass(auth,a.kind+':'+a.id)});
    result.activityPages=result.activityPages.map(classAudience);if(result.activity)result.activity=classAudience(result.activity);
    const classRows=rows=>rows.filter(row=>classVisible(auth,row.kind+':'+row.activityId,row.classIds||[]));
    result.timetable=classRows(result.timetable);result.personalTimetable=classRows(result.personalTimetable);if(result.activity)result.activity.timetable=classRows(result.activity.timetable);
    if(auth.classView){const a=result.activityPages.find(a=>samePublication(a.kind+':'+a.id,auth.classView.activityKey));if(!a?.classes.some(c=>samePublication(c.id,auth.classView.classId)))throw rehearsalError('This student class is no longer available.',403,'CLASS_VIEW_UNAVAILABLE');}
    if(!isAdminWorkspace(auth)){
      const role=auth.workspace==='TEACH'?'TEACHER':'STUDENT',project=a=>({...a,roles:a.roles.filter(r=>r===role)});
      result.activities=result.activities.map(project);result.personalActivities=result.personalActivities.map(project).filter(a=>a.roles.length);result.activityPages=result.activityPages.map(project).filter(a=>a.roles.length);
      if(result.activity)result.activity=project(result.activity);
      if(auth.workspace==='TEACH')result.student=false;
    }
    const reader=row=>{
      const key=row.kind+':'+row.activityId;
      if(auth.workspace==='TEACH'&&!result.personalActivities.some(a=>samePublication(a.kind+':'+a.id,key))){const {kind,activityId,activityName,date,startTime,endTime,timezone,status}=row;return {kind,activityId,activityName,date,startTime,endTime,timezone,status,title:activityName,relevant:false,involvement:''};}
      if(!previewKeys.some(k=>samePublication(k,key)))return row;const {joinKey,joinUrl,publicJoin,...safe}=row;return {...safe,preview:true,relevant:false,involvement:''};
    };
    result.timetable=result.timetable.map(reader);result.personalTimetable=result.personalTimetable.map(reader);if(result.activity)result.activity={...result.activity,timetable:result.activity.timetable.map(reader)};
    if(auth.workspace==='TEACH')result.personalTimetable=result.personalTimetable.filter(r=>result.personalActivities.some(a=>samePublication(a.kind+':'+a.id,r.kind+':'+r.activityId)));
  }
  if(auth?.workspace==='TEACH'&&repository.features?.nativeAttendance&&JSON.parse(auth.state.account.substitute_grants||'[]').length){
    const substitute=await substituteTimetable(repository,auth,{start,end,publications,classes,runs,runStates,lifecycles,stopped,calendar,suppressions,settings:calendarSettings},now);
    for(const area of substitute.areas){
      area.timetable=substitute.rows.filter(r=>r.kind===area.kind&&samePublication(r.activityId,area.id));
      for(const name of ['personalActivities','activityPages'])if(!result[name].some(a=>a.kind===area.kind&&samePublication(a.id,area.id)))result[name].push(area);
      if(input.kind===area.kind&&samePublication(input.id,area.id)&&(!result.activity||!result.activity.roles?.length))result.activity=area;
    }
    result.personalTimetable.push(...substitute.rows.filter(s=>!result.personalTimetable.some(r=>r.joinKey===s.joinKey)));result.workspaceAccess.teach=true;
  }
  return result;
}
