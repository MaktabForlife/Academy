import {personalLinks} from './personal-links.js';
import {lessonNotes} from './lesson-notes.js';
import {nativeAttendance} from './native-attendance.js';
import {setupEnabled,acceptedHead,acceptedRepository} from './setup-reader.js';
import {setupPublication} from './setup-publication.js';
import {announcements,publicAnnouncements,announcementImage,announcementPdf,announcementUpload} from './announcements.js';
import {guardWorkspace,actualState,isAdminWorkspace} from './workspace-access.js';
import {globalSettings} from './global-settings.js';
import {headerDate} from '../header-date.js';
import {lessonPlanning} from './lesson-planning.js';
import {d1Memorisation,d1MemorisationPreview} from './memorisation.js';
import {d1Assessments} from './assessments.js';
import {assessmentFiles} from './assessment-files.js';
import {assessmentReports} from './assessment-reports.js';
import {lessonMedia,timetableMedia} from './lesson-media.js';
import {pdfTools,publicPdfTools} from './pdf-tools.js';
import {pdfBookmarks} from './pdf-bookmarks.js';
import {teacherAvailability} from './teacher-availability.js';
import {d1Subjects} from './subjects.js';
import {d1LearningCatalogue,saveLearningModule} from './learning-catalogue.js';
import {d1AccountTimetable} from './account-timetable.js';
import { createAuthRateLimitKey, createSessionToken, isValidFourDigitPin } from '../../lib/auth-primitives.js';
import {createAcademyPinHash,verifyAcademyPin} from '../../lib/academy-pin.js';
import { academyD1Repository, rehearsalError } from './repository.js';
import { d1Entrance } from './entrance.js';
import {d1LessonJoin,websiteEntrance} from './lesson-join.js';
import {publicTimetable,refreshPublicTimetable,refreshPublishedTimetable} from './public-timetable.js';
import {profileLabelsVersion,processCacheRefresh,recoverCacheRefresh} from './cache-refresh.js';
import { d1Profiles } from './profiles.js';
import {issueHifzHandoff} from './hifz-handoff.js';
import {hifzSyncEnabled,hifzSyncChangePath,recoverHifzProfiles} from './hifz-profile-sync.js';
import { d1Programs } from './programs.js';
import {d1Learning} from './learning.js';
import {learningAvailable} from './learning-state.js';
import * as publicLibrary from './library-boundary.js';
import {d1CourseCalendar as defaultCourseCalendar} from './course-calendar.js';
import {academicCalendar} from './academic-calendar.js';
import {d1CourseManagement} from './course-management.js';
import {d1CourseCatalogue} from './course-catalogue.js';
import {enrolmentCatalogue,enrolmentProfile,submitEnrolment,enrolmentManagement} from './enrolment.js';
import {d1CourseSubscriptions} from './course-subscriptions.js';
import {managedCourseScopes} from './course-authority.js';
import {authenticatedD1Account,d1Audience as audience,d1ContextEqual as contextEqual} from './session.js';
import {openLibraryMetadataEndpoint as defaultMetadataEndpoint} from './library-metadata.js';

export function createAcademyWorker({d1Library,d1LibraryStream,d1LibraryAreaRefs}=publicLibrary,{openLibraryMetadataEndpoint=defaultMetadataEndpoint,d1CourseCalendar=defaultCourseCalendar}={}){
const authenticated=async(request,env,repository)=>{const auth=await authenticatedD1Account(request,env,repository);repository.bindActor?.(auth);return auth;};
const publicAccount=state=>({displayName:state.account.display_name,uniqueid:state.account.login_link_id});
const sessionResponse=(state,context,token)=>({account:publicAccount(state),context,contexts:state.contexts,courseManagement:state.account.global_admin||managedCourseScopes(state).length>0,sessionStore:'D1',operationalAccessActive:['COURSE','GLOBAL','SUBSTITUTE','OWN_LIBRARY'].includes(context.scope),...(token?{token}:{})});
const requireActive=state=>{if(!state)throw rehearsalError('Invalid account link',404,'ACCOUNT_NOT_FOUND');if(!state.account.active)throw rehearsalError('Account disabled',403,'ACCOUNT_DISABLED');};

async function boundedBody(request,limit=4096) {
  const reader=request.body?.getReader();let size=0,raw='';const decoder=new TextDecoder();
  if(reader)while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;
    if(size>limit){await reader.cancel();throw rehearsalError('Request is too large.',413,'REQUEST_TOO_LARGE');}raw+=decoder.decode(value,{stream:true});}
  raw+=decoder.decode();
  let body;try{body=JSON.parse(raw || '{}');}catch{throw rehearsalError('Invalid request.',400,'INVALID_REQUEST');}
  if(!body||typeof body!=='object'||Array.isArray(body))throw rehearsalError('Invalid request.',400,'INVALID_REQUEST');
  return body;
}
async function issueSession(env,repository,state,context) {
  if(!context)throw rehearsalError('No authorised Academy context is available.',403,'NO_CONTEXT');
  const session=await repository.createSession(state,context);
  const token=await createSessionToken({type:'account',aud:audience,sv:3,sid:session.sid,accountid:state.account.account_id,epoch:state.account.credential_epoch,scope:context.scope,courseid:context.courseId,role:context.role},env);
  return {success:true,...sessionResponse(state,context,token)};
}
async function rateLimit(env,login) {
  if(!env.AUTH_LOGIN_RATE_LIMITER?.limit)throw rehearsalError('Account service is temporarily unavailable.');
  const key=await createAuthRateLimitKey('account-d1',login.toUpperCase(),env);
  const result=await env.AUTH_LOGIN_RATE_LIMITER.limit({key});
  if(!result.success)throw rehearsalError('Too many sign-in attempts. Please wait one minute.',429,'LOGIN_RATE_LIMITED');
}
async function dispatch(request,env) {
  if (![env.PIN_SECRET,env.SESSION_SECRET].every(value=>typeof value==='string'&&value.trim()))
    throw rehearsalError('Academy authentication is not configured.');
  let repository=academyD1Repository(env);
  const sourceRepository=repository;
  let reader;
  const readRepository=async()=>reader??=acceptedRepository(sourceRepository,await acceptedHead(sourceRepository,request.headers.get('X-Academy-Setup')||''));
  const path=new URL(request.url).pathname;
  await repository.ready();
  if(path==='/api/academy/setup/head'&&request.method==='GET')return {success:true,head:setupEnabled(env)?await acceptedHead(repository):null};
  if(path==='/api/academy/announcements'&&request.method==='GET')return {success:true,...await publicAnnouncements(setupEnabled(env)?await readRepository():repository)};
  if(path==='/api/academy/enrolment/catalogue'&&request.method==='GET')return {success:true,...await enrolmentCatalogue(setupEnabled(env)?await readRepository():repository)};
  if(path==='/api/academy/announcements/image'&&['GET','HEAD'].includes(request.method))return announcementImage(request,setupEnabled(env)?await readRepository():repository,env);
  if(path==='/api/academy/announcements/pdf'&&['GET','HEAD'].includes(request.method))return announcementPdf(request,setupEnabled(env)?await readRepository():repository,env);
  const publicLibraryOnly=env.ACADEMY_LIBRARY_MODE==='PUBLIC_ONLY';
  if(path==='/api/academy/pdf-tools/defaults'&&request.method==='GET')return {success:true,...await publicPdfTools(setupEnabled(env)?await readRepository():repository)};
  if(['/','/api/health'].includes(path)&&request.method==='GET')return {success:true,service:'maktab-academy',version:'107.35',...(sourceRepository.features.splitDatabases?{databaseGeneration:'SPLIT_V1'}:{}),
    store:env.ACADEMY_D1_MODE==='ACTIVE'?'D1_ACTIVE':'D1_REHEARSAL',cutoverReady:env.ACADEMY_D1_MODE==='ACTIVE',
    libraryMode:publicLibraryOnly?'PUBLIC_ONLY':'COMPATIBILITY',mediaSubscriptionsAvailable:false};
  if(path==='/api/academy/progress/preview'&&request.method==='GET')return {success:true,...await d1MemorisationPreview(setupEnabled(env)?await readRepository():repository)};
  const openLibraryAction=path.match(/^\/api\/academy\/open-library\/metadata\/(public|cover|list|save|options)$/)?.[1];
  if(openLibraryAction)return openLibraryMetadataEndpoint(openLibraryAction)(request,env);
  // Account/attendance screens reuse this authenticated Program selector. It
  // returns only assigned Program names/roles, never media or file access.
  const programSelector=path==='/api/program-library/available'||path==='/api/admin/platform/program-library/available';
  if(publicLibraryOnly&&!programSelector&&path!=='/api/academy/library/catalogue'&&(
    /^\/api\/(?:admin\/platform\/program-library|program-library|academy\/library|academy\/d1\/library)\//.test(path)||
    path==='/api/platform/global/resources/access'||path==='/api/admin/platform/program-timetable/prepare-library'||
    /^\/api\/admin\/platform\/global\/(?:resources?|drive(?:-root)?)\//.test(path)))
    throw rehearsalError('Private Academy media is not available yet.',403,'PRIVATE_MEDIA_NOT_ENABLED');
  if(path==='/api/academy/d1/library/file'&&['GET','HEAD'].includes(request.method))return d1LibraryStream(request,repository,env);
  if(request.method!=='POST')throw rehearsalError('Use POST.',405,'METHOD_NOT_ALLOWED');
  if(path==='/api/admin/platform/announcements/save'){
    const auth=await authenticated(request,env,repository);
    guardWorkspace(request,auth);
    repository=repository.authoringRepository();
    const editor=announcements(repository,auth,env),{input,image,pdf}=await announcementUpload(request);
    return {success:true,...await editor.run('save',input,image,pdf)};
  }
  if(['/api/academy/lesson-media/upload','/api/academy/lesson-media/note-upload'].includes(path)) {
    const auth=await authenticated(request,env,repository),metadata=new URL(request.url).searchParams.get('metadata')||'';
    if(metadata.length>8192)throw rehearsalError('Upload details are too large.',413);
    let input;try{input=JSON.parse(metadata);}catch{throw rehearsalError('Invalid upload details.',400);}
    if(!input||typeof input!=='object'||Array.isArray(input))throw rehearsalError('Invalid upload details.',400);
    guardWorkspace(request,auth,input);
    if(isAdminWorkspace(auth))repository=repository.authoringRepository();
    if(setupEnabled(env)&&!isAdminWorkspace(auth))repository=await readRepository();
    if(path.endsWith('/note-upload')){if(!sourceRepository.features.mediaSeparation)throw rehearsalError('Own notes are unavailable.',503);return {success:true,...await lessonNotes(await readRepository(),auth,env).upload(request,input)};}
    return {success:true,...await lessonMedia(repository,auth,env).upload(request,input)};
  }
  if(path==='/api/academy/assessments/upload') {
    const auth=await authenticated(request,env,repository),metadata=new URL(request.url).searchParams.get('metadata')||'';
    if(metadata.length>8192)throw rehearsalError('Upload details are too large.',413);
    let input;try{input=JSON.parse(metadata);}catch{throw rehearsalError('Invalid upload details.',400);}
    if(!input||typeof input!=='object'||Array.isArray(input))throw rehearsalError('Invalid upload details.',400);
    guardWorkspace(request,auth,input);
    if(isAdminWorkspace(auth))repository=repository.authoringRepository();
    if(setupEnabled(env)&&!isAdminWorkspace(auth))repository=await readRepository();
    return {success:true,...await assessmentFiles(repository,auth,env).upload(request,input)};
  }
  if(path==='/api/admin/platform/program-library/upload-chunk') {
    const auth=await authenticated(request,env,repository);
    guardWorkspace(request,auth);
    return {success:true,...await d1Library(repository,auth,env).uploadChunk(request)};
  }
  const managementPath=path.startsWith('/api/admin/platform/');
  const input=await boundedBody(request,path.startsWith('/api/academy/bookmarks/')?8192:managementPath||path.startsWith('/api/academy/teacher-availability/')||path.startsWith('/api/academy/progress/')||path.startsWith('/api/academy/assessments/')||path.startsWith('/api/academy/lesson-media/')||path.startsWith('/api/academy/planning/')||path.startsWith('/api/academy/attendance/')||path.startsWith('/api/academy/my-links/')?131072:path.startsWith('/api/program-attendance/')?65536:4096);
  if(['/api/account/check','/api/account/login','/api/account/setup-pin'].includes(path)) {
    const login=String(input.uniqueid || '').trim();
    if(!login||login.length>160)throw rehearsalError('Missing or invalid account link.',400,'INVALID_ACCOUNT_LINK');
    if(path!=='/api/account/check') {
      if(!isValidFourDigitPin(input.pin))throw rehearsalError('PIN must contain four digits.',400,'INVALID_PIN');
      if(path==='/api/account/setup-pin'&&input.pinConfirmation!==input.pin)throw rehearsalError('PIN confirmation must match the 4-digit PIN.',400,'PIN_CONFIRMATION_MISMATCH');
      await rateLimit(env,login);
    }
    let state=await (path==='/api/account/check'?repository.accountByLogin(login):repository.byLogin(login));requireActive(state);
    if(path==='/api/account/check')return {success:true,account:{...publicAccount(state),pinsetup:Boolean(state.account.pin_setup)},unifiedLoginStage:'CENTRAL_CONTEXT_VERIFICATION'};
    if(path==='/api/account/setup-pin') {
      if(state.account.pin_setup||String(state.account.pin_hash || '').trim())throw rehearsalError('PIN is already set. An authorised administrator must reset it before a new PIN can be created.',409,'PIN_ALREADY_SET');
      if(!state.contexts.length)throw rehearsalError('No authorised Academy context is available.',403,'NO_CONTEXT');
      state=await repository.setCredential(state,await createAcademyPinHash(input.pin,env),'ACCOUNT_PIN_SETUP_SELF');
    } else {
      if(!state.account.pin_setup||!String(state.account.pin_hash || '').trim())throw rehearsalError('Account PIN not set up yet',403,'PIN_NOT_SET');
      const verification=await verifyAcademyPin(input.pin,state.account.pin_hash,env);
      if(!verification.valid)throw rehearsalError('Incorrect PIN',401,'INCORRECT_PIN');
      if(verification.needsMigration)state=await repository.setCredential(state,verification.upgradedHash,'ACCOUNT_PIN_HASH_UPGRADE');
    }
    return issueSession(env,repository,state,state.contexts[0]);
  }
  if(path==='/api/academy/entrance') {
    const auth=request.headers.has('Authorization')?await authenticated(request,env,repository):null;
    return {success:true,sessionStore:'D1',...websiteEntrance(await d1Entrance(setupEnabled(env)?await readRepository():repository,auth?.state,auth?.user,input,undefined,{auth}))};
  }
  if(path==='/api/academy/public-lesson/join')return {success:true,...await d1LessonJoin(setupEnabled(env)?await readRepository():repository,null,input)};
  if(path==='/api/academy/enrolment/submit'){
    const auth=await authenticated(request,env,repository);
    return {success:true,...await submitEnrolment(setupEnabled(env)?await readRepository():repository,auth,input,request,env)};
  }
  const auth=await authenticated(request,env,repository);
  guardWorkspace(request,auth,input);
  if(isAdminWorkspace(auth))repository=repository.authoringRepository();
  const nativeAction=path.match(/^\/api\/(?:academy\/attendance|program-attendance)\/(options|get|submit|prepare|recover|report|roster-get|roster-save|substitute-save|substitute-revoke|substitute-reopen)$/)?.[1];
  if(nativeAction&&sourceRepository.features.nativeAttendance)return {success:true,...await nativeAttendance(await readRepository(),auth).run(nativeAction,input)};
  const setupAction=path.match(/^\/api\/admin\/platform\/setup\/(options|review|freeze|publish|resolve)$/)?.[1];
  if(setupAction){if(!setupEnabled(env))throw rehearsalError('Accepted setup is not enabled.',503,'SETUP_PUBLICATION_REQUIRED');return {success:true,...await setupPublication(repository,auth).run(setupAction,input)};}
  if(setupEnabled(env)&&(!isAdminWorkspace(auth)||path==='/api/academy/lesson/join')&&!path.startsWith('/api/account/'))repository=await readRepository();
  const personalAction=path.match(/^\/api\/academy\/my-links\/(list|save|export)$/)?.[1];
  if(personalAction)return {success:true,...await personalLinks(sourceRepository,auth,env).run(personalAction,input)};
  const noteAction=path.match(/^\/api\/academy\/lesson-media\/note-(options|withdraw)$/)?.[1];
  if(noteAction){if(!sourceRepository.features.mediaSeparation)throw rehearsalError('Own notes are unavailable.',503);const notes=lessonNotes(await readRepository(),auth,env);return {success:true,...await notes[noteAction](input)};}
  if(path==='/api/academy/lesson-media/download'&&sourceRepository.features.mediaSeparation&&String(input.assetId||'').startsWith('NOTE-'))return lessonNotes(await readRepository(),auth,env).download(input);
  const settingsAction=path.match(/^\/api\/admin\/platform\/settings\/(get|save)$/)?.[1];
  if(settingsAction)return {success:true,...await globalSettings(repository,auth).run(settingsAction,input)};
  if(path==='/api/academy/hifz/sign-in')return issueHifzHandoff(env,auth,input);
  if(path==='/api/academy/enrolment/profile')return {success:true,...await enrolmentProfile(repository,auth)};
  const enrolmentAction=path.match(/^\/api\/admin\/platform\/enrolment\/(get|catalogue-save|request-save|request-delete|accounts|register|settings-save)$/)?.[1];
  if(enrolmentAction)return {success:true,...await enrolmentManagement(repository,auth).run(enrolmentAction,input)};
  const bookmarkAction=path.match(/^\/api\/academy\/bookmarks\/(list|save|delete)$/)?.[1];
  if(bookmarkAction)return {success:true,...await pdfBookmarks(repository,auth).run(bookmarkAction,input)};
  const announcementAction=path.match(/^\/api\/admin\/platform\/announcements\/(list|delete)$/)?.[1];
  if(announcementAction)return {success:true,...await announcements(repository,auth,env).run(announcementAction,input)};
  const planningAction=path.match(/^\/api\/academy\/planning\/(list|get|save|submit|comment|policy|deadline)$/)?.[1];
  if(planningAction)return {success:true,...await lessonPlanning(repository,auth).run(planningAction,input)};
  const pdfToolAction=path.match(/^\/api\/admin\/platform\/pdf-tools\/(get|save)$/)?.[1];
  if(pdfToolAction)return {success:true,...await pdfTools(repository,auth).run(pdfToolAction,input)};
  const academicCalendarAction=path.match(/^\/api\/academy\/calendar\/(get|save)$/)?.[1];
  if(academicCalendarAction)return {success:true,...await academicCalendar(repository,auth).run(academicCalendarAction,input)};
  if(path==='/api/academy/lesson-media/timetable'){const result=await timetableMedia(repository,auth,input);if(sourceRepository.features.mediaSeparation){const additions=await lessonNotes(await readRepository(),auth,env).timetable(input);for(const row of additions.lessons){const existing=result.lessons.find(r=>r.activityKey===row.activityKey&&r.sessionKey===row.sessionKey);if(existing)existing.assets.push(...row.assets);else result.lessons.push(row);}}return {success:true,...result};}
  const mediaAction=path.match(/^\/api\/academy\/lesson-media\/(list|calendar|sessions|create|course-files-create|get|save|watch|download|comments|comment-save|comment-moderate|attachment-remove|attachment-name)$/)?.[1];
  if(mediaAction){let result=await lessonMedia(repository,auth,env).run(mediaAction,input);if(sourceRepository.features.mediaSeparation&&['calendar','list','get'].includes(mediaAction)){const notes=lessonNotes(await readRepository(),auth,env);if(mediaAction==='get'){if(result.lesson.sessionKey){const entries=await notes.notes([{activityKey:result.lesson.activityKey,sessionKey:result.lesson.sessionKey}]);result.assets.push(...entries.map(notes.asset));result.lesson.canCurateNotes=true;}}else result=await (mediaAction==='calendar'?notes.enrichCalendar(result,input):notes.enrichList(result,input));}return result instanceof Response?result:{success:true,...result};}
  if(path==='/api/academy/assessments/download')return assessmentFiles(repository,auth,env).download(input);
  const assessmentAction=path.match(/^\/api\/academy\/assessments\/(list|get|register-create|register-save|register-validate|register-release|session-delete|phase-create|create|save|paper-details|publish|roster|review-paper|authorise-resubmission|confirm-submission|ready-assessment|mark|review-mark|release|release-papers|collection-save|finalise|withdraw-release)$/)?.[1];
  if(assessmentAction)return {success:true,...await d1Assessments(repository,auth).run(assessmentAction,input)};
  const assessmentReportAction=path.match(/^\/api\/academy\/assessments\/(templates|template-save|report-data|report-save|report-list)$/)?.[1];
  if(assessmentReportAction)return {success:true,...await assessmentReports(repository,auth).run(assessmentReportAction,input)};
  if(path==='/api/admin/platform/public-timetable/refresh')return {success:true,...await refreshPublicTimetable(request,env,repository,auth)};
  if(path==='/api/academy/cache/refresh') {
    if(!auth.state.account.global_admin&&!auth.state.roles.some(r=>r.role==='PROGRAM_ADMIN'))throw rehearsalError('This action requires an authorised administrator.',403,'FORBIDDEN');
    return {success:true,...await processCacheRefresh(request,env,{repository})};
  }
  if(path==='/api/admin/platform/program-timetable/refresh-public')return {success:true,...await refreshPublishedTimetable(request,env,repository,auth,input)};
  if(path==='/api/academy/lesson/join')return {success:true,...await d1LessonJoin(repository,auth,input)};
  if(path==='/api/academy/courses/catalogue')return {success:true,...await d1CourseCatalogue(repository,auth)};
  if(publicLibraryOnly&&path==='/api/academy/library/catalogue')return {success:true,resources:[],
    warnings:['Private Academy media will appear when Module subscriptions are available.'],learningAreaRefs:d1LibraryAreaRefs(auth.state),
    libraryMode:'PUBLIC_ONLY',mediaSubscriptionsAvailable:false,store:'D1'};
  const availabilityAction=path.match(/^\/api\/academy\/teacher-availability\/(get|save)$/)?.[1];
  if(availabilityAction)return {success:true,...await teacherAvailability(repository,auth,availabilityAction,input)};
  const progressAction=path.match(/^\/api\/academy\/progress\/(get|grid|mark|confirm|import|module-save|set-save|cards|card-active|activity-active)$/)?.[1];
  if(progressAction)return {success:true,...await d1Memorisation(repository,auth).run(progressAction,input)};
  if(path==='/api/academy/timetable')return {success:true,...await d1AccountTimetable(repository,auth,input)};
  if(path==='/api/account/personal-workspace'||path==='/api/account/substitute-workspace'){const expected=path.endsWith('/personal-workspace')?'OWN_LIBRARY':'SUBSTITUTE';if(auth.context.scope!==expected)throw rehearsalError('Choose your authorised personal context.',403,'FORBIDDEN_CONTEXT');return {success:true,sessionStore:'D1',workspace:{portalType:'academy',path:expected==='OWN_LIBRARY'?'/academy/library/?view=my-links':'/academy/#timetable/teach'}};}
  if(['/api/account/workspace','/api/account/global-workspace'].includes(path)){
    const expected=path.endsWith('/global-workspace')?'GLOBAL':'COURSE';
    if(auth.context.scope!==expected)throw rehearsalError('Choose an authorised Academy context.',403,'FORBIDDEN_CONTEXT');
    return {success:true,sessionStore:'D1',workspace:{portalType:'academy',path:expected==='GLOBAL'?'/academy/'+(auth.context.courseId?'#activity/COURSE/'+encodeURIComponent(auth.context.courseId):''):'/academy/#activity/PROGRAM/'+encodeURIComponent(auth.context.courseId)}};
  }
  const subjectAction=path.match(/^\/api\/admin\/platform\/academy-subjects\/(get|save|recover|import-preview)$/)?.[1];
  if(subjectAction)return {success:true,...await d1Subjects(repository,auth).run(subjectAction,input)};
  if(path==='/api/admin/platform/learning-catalogue/module/save')return {success:true,...await saveLearningModule(repository,auth,input)};
  if(path==='/api/admin/platform/learning-catalogue/get')return {success:true,...await d1LearningCatalogue(repository,auth)};
  if(path==='/api/admin/platform/global/access/save')return {success:true,...await d1CourseSubscriptions(repository,auth).save(input)};
  if(path==='/api/platform/global/resources/access')return {success:true,...await d1Library(repository,auth,env).run('course-access',input,request)};
  const courseEditorAction=path.match(/^\/api\/admin\/platform\/courses\/(list|get|save|public-card-save|validate|accept|publish|status|repeat|copy|participants|participants-save|participant-create)$/)?.[1];
  if(courseEditorAction)return {success:true,...await d1CourseManagement(repository,auth,env).run(courseEditorAction,input)};
  const courseAction=path==='/api/admin/platform/global/get'?'get':path.match(/^\/api\/admin\/platform\/global\/((?:subject|subjects|module|task|resource|resources|drive-root|drive|delivery|policy|run|timetable)(?:\/[a-z-]+){1,2})$/)?.[1];
  const calendarAction=path.match(/^\/api\/admin\/platform\/calendar\/(get|save|batch-save)$/)?.[1];
  if(courseAction||calendarAction)return {success:true,...await d1CourseCalendar(repository,auth,env).run(calendarAction?`calendar/${calendarAction}`:courseAction,input,request)};
  const timetableAction=path.match(/^\/api\/admin\/platform\/program-timetable\/(get|save|publish|copy|status|record|history|published|preview|validate|prepare|prepare-library)$/)?.[1];
  const attendanceAction=path.match(/^\/api\/program-attendance\/(get|submit|prepare|recover)$/)?.[1];
  if(timetableAction||attendanceAction) {
    const learning=d1Learning(repository,auth);
    return {success:true,...await (timetableAction?learning.timetable(timetableAction,input):learning.attendance(attendanceAction,input))};
  }
  const libraryAction=path.match(/^\/api\/(admin\/platform\/program-library|program-library|academy\/library)\/(available|manage|save|recover|prepare-library|folder-set|browse|access|cover|covers|catalogue|upload-start)$/);
  if(libraryAction)return {success:true,...await d1Library(repository,auth,env).run(libraryAction[2],input,request,{admin:libraryAction[1].startsWith('admin/'),academy:libraryAction[1]==='academy/library'})};
  const profileAction=path.match(/^\/api\/admin\/platform\/user-profiles\/(get|link|save|recover)$/)?.[1];
  const registryAction=path.match(/^\/api\/admin\/platform\/programs\/(list|create|copy|save|readiness|prepare)$/)?.[1];
  const managementAction=path.match(/^\/api\/admin\/platform\/program-timetable\/(manage-get|manage-save|manage-remove|recover)$/)?.[1];
  if(publicLibraryOnly&&managementAction==='manage-save'&&['resources','library-root'].includes(input.kind))
    throw rehearsalError('Private Academy media is not available yet.',403,'PRIVATE_MEDIA_NOT_ENABLED');
  if(profileAction||registryAction||managementAction) {
    const programAdmin=(managementAction||['list','save'].includes(registryAction))&&auth.state.roles.some(r=>r.role==='PROGRAM_ADMIN'&&(registryAction==='list'||r.activity_key.toUpperCase()===`PROGRAM:${String(input.id||'')}`.toUpperCase()));
    if(!auth.state.account.global_admin&&!programAdmin)throw rehearsalError('This action requires an authorised administrator.',403,'FORBIDDEN');
    const learningView=managementAction==='manage-get'&&await learningAvailable(repository.db);
    const result=profileAction?await d1Profiles(repository,auth).run(profileAction,input):registryAction?await d1Programs(repository,auth).registry(registryAction,input):learningView?await d1Learning(repository,auth).timetable('manage-get',input):await d1Programs(repository,auth).management(managementAction,input);
    return {success:true,...result};
  }
  if(path==='/api/account/session')return {success:true,...sessionResponse(actualState(auth),auth.context)};
  if(path==='/api/account/logout') {await repository.revoke(auth.sid,auth.state.account.account_id);return {success:true};}
  if(path==='/api/account/switch-context') {
    const context=actualState(auth).contexts.find(c=>contextEqual(c,{scope:String(input.scope || 'COURSE').toUpperCase(),courseId:String(input.courseId || ''),role:String(input.role || '').toUpperCase()}));
    if(!context)throw rehearsalError('Requested course or role is not authorised',403,'FORBIDDEN_CONTEXT');
    const result=await issueSession(env,repository,actualState(auth),context);
    await repository.revoke(auth.sid,auth.state.account.account_id);
    return result;
  }
  if(path.startsWith('/api/academy/d1/accounts/')) {
    if(!auth.state.account.global_admin)throw rehearsalError('Forbidden',403,'FORBIDDEN');
    if(['/api/academy/d1/accounts/update','/api/academy/d1/accounts/reset-pin'].includes(path))
      throw rehearsalError('Use User profiles to change an account or reset its PIN.',410,'ACCOUNT_WRITE_RETIRED');
    const target=await repository.byId(String(input.accountId || ''));
    if(!target)throw rehearsalError('Account not found.',404,'ACCOUNT_NOT_FOUND');
    if(path.endsWith('/read'))return {success:true,account:{accountId:target.account.account_id,displayName:target.account.display_name,active:Boolean(target.account.active),revision:target.account.revision,pinSetup:Boolean(target.account.pin_setup),credentialEpoch:target.account.credential_epoch}};
  }
  throw rehearsalError('This operation is not available in the Academy.',501,'OPERATION_NOT_MIGRATED');
}
return {
  async scheduled(event,env,ctx){
    ctx.waitUntil(recoverCacheRefresh(env,new Date(event.scheduledTime)));
    if(hifzSyncEnabled(env))ctx.waitUntil(recoverHifzProfiles(env,{limit:40}));
  },
  async fetch(request,env,ctx) {
    const origin=request.headers.get('Origin');
    const allowed=(env.ALLOWED_ORIGINS || '').split(',').filter(Boolean);
    const headers={'Content-Type':'application/json','Cache-Control':'private, no-store','Vary':'Origin',
      'Access-Control-Allow-Methods':'POST, GET, HEAD, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Authorization, Range, X-Academy-Workspace, X-Academy-Class, X-Academy-Setup, X-Library-Upload-Ticket, X-Library-Upload-Offset'};
    if(origin&&allowed.includes(origin))headers['Access-Control-Allow-Origin']=origin;
    if(origin&&!allowed.includes(origin))return new Response(JSON.stringify({success:false,error:'Origin is not allowed.'}),{status:403,headers});
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
    try{const path=new URL(request.url).pathname;
      const result=await (path==='/api/academy/header-date'?(request.method==='GET'?headerDate(request):Response.json({success:false,error:'Use GET.'},{status:405})):path==='/api/academy/entrance/public-snapshot'?publicTimetable(request,env):path==='/api/academy/profile-labels-version'?profileLabelsVersion(request,env):dispatch(request,env));
      if(request.method==='POST'&&hifzSyncChangePath(path)&&hifzSyncEnabled(env)&&ctx?.waitUntil&&!(result instanceof Response)&&result.success)
        ctx.waitUntil(recoverHifzProfiles(env));
      if(result instanceof Response){const mediaHeaders=new Headers(result.headers);for(const name of ['Vary','Access-Control-Allow-Methods','Access-Control-Allow-Headers'])mediaHeaders.set(name,headers[name]);
        mediaHeaders.set('X-Content-Type-Options','nosniff');
        mediaHeaders.delete('Access-Control-Allow-Origin');if(headers['Access-Control-Allow-Origin'])mediaHeaders.set('Access-Control-Allow-Origin',headers['Access-Control-Allow-Origin']);
        return new Response(result.body,{status:result.status,headers:mediaHeaders});}
      return new Response(JSON.stringify(result),{headers});}
    catch(error){const status=Number.isInteger(error.status)?error.status:503;
      const unavailable=status>=500&&status!==501;
      const dailyReadLimit=/exceeded D1.s free tier daily row read limit/i.test(String(error.message));
      const reset=new Date();reset.setUTCHours(24,0,0,0);
      const retryAfterMs=Math.max(1000,reset.getTime()-Date.now());
      if(dailyReadLimit)headers['Retry-After']=String(Math.ceil(retryAfterMs/1000));
      if(status===429)headers['Retry-After']='60';
      return new Response(JSON.stringify({success:false,error:dailyReadLimit?'Academy access has reached today’s service allowance. Please try again after 00:00 UTC (03:00 Riyadh), or contact an administrator.':unavailable?'Academy information is temporarily unavailable. Please try again.':error.message,
        code:dailyReadLimit?'ACADEMY_D1_DAILY_READ_LIMIT':unavailable?(['ACADEMIC_CALENDAR_SCHEMA_REQUIRED','ACTIVATION_REQUIRED','MANAGEMENT_SCHEMA_REQUIRED','LEARNING_IMPORT_REQUIRED','COURSE_IMPORT_REQUIRED','COURSE_ACCESS_SCHEMA_REQUIRED','COURSE_MANAGEMENT_SCHEMA_REQUIRED','UPLOAD_BRIDGE_REQUIRED','MEMORISATION_SCHEMA_REQUIRED'].includes(error.code)?error.code:'ACADEMY_D1_UNAVAILABLE'):error.code,retryable:unavailable||status===429,...(dailyReadLimit?{retryAfterMs,resetAt:reset.toISOString()}:{}),...(status===429?{retryAfterMs:60000}:{}),
        ...(status===409&&request.headers.get('X-Academy-Workspace')==='ADMIN'?Object.fromEntries(['currentRecord','rowRevision','entryKey'].filter(k=>error[k]!==undefined).map(k=>[k,error[k]])):{} )}),{status,headers});}
  }
};
}
export default createAcademyWorker();
