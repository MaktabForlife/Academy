// SOURCE ONLY availability native-link successor. Existing native worker retained.
import {captureNativeRootPINVerification} from '../../auth/v110/native-root-pin-proof.mjs';
import {captureNativePINVerification} from '../../auth/v110/native-pin-proof.mjs';
import {assertLocalIntegrationProfile} from '../../auth/v110/local-integration-profile.mjs';
import {handleAcademyLogout} from '../../auth/v110/academy-logout-http.mjs';
import {actorProof,verifyActor} from '../separation/proof-root-sensitive-v3.js';
import {cookieSessionKey,bindAcademyCookieRequest} from '../../auth/v110/academy-cookie-auth.mjs';
import {handleAcademyPIN} from '../../auth/v110/academy-pin-http-v3.mjs';
import {handleAcademyRefresh} from '../../auth/v110/academy-refresh-http.mjs';
import {readAcademyDisplayContext} from '../../auth/v110/academy-display-context.mjs';
import {nativePortal,portalReadReply,portalNativeReadRequest} from './portal-local-test-v1.mjs';
import {hostingEnvironment,academyManagementOriginAllowed} from '../hosting.mjs';
import {uploadPlaylistCardImage,previewPlaylistCardImage,publicPlaylistCardImage} from './media-playlist-card-images.js';
import {recordingPlaylistMetadata} from './media-playlist-store.js';
import {mediaPlaylists} from './media-playlists.js';
import {nativeCoursePlaylistPlacements} from './native-course-playlist-placements.js';
import {nativeMediaTeachers} from './native-media-teachers.js';
import {recoverNoteRetention,noteRetentionCron} from './note-retention.js';
import {cleanupExpiredAcademicCompanions} from './recording-companions.js';
import {registerMonthlyProgramme} from './web-platform/programme-registration.mjs';
import {studioAdmin} from './web-platform/studio-admin.mjs';
import {studioOrigin,studioHandoff} from './website-studio-handoff.js';
import {bridge as websitePlatformBridge,recoverWebsite,enabled as websitePlatformEnabled} from './web-platform/bridge.mjs';
import {recoverWeeklyAbsentees,weeklyAbsenteeCron} from './weekly-absentees.js';
import {imtihaanWorkflow} from './assessment-imtihaan-workflow.js';
import {assessmentStore} from './assessment-store.js';
import {warmPublishedAssessments} from './published-assessments.js';
import {assessmentProgress} from './assessment-progress.js';
import {assessmentManualMarks,ROOT_SENSITIVE_MANUAL_MARKS_VERSION} from './assessment-manual-marks-root-sensitive-v1.js';
import {conditionalRead} from './read-cache.js';
import {privateSnapshot} from './private-snapshot.js';
import {personalLinks} from './personal-links.js';
import {classNotes,ROOT_SENSITIVE_CLASS_NOTES_VERSION} from './class-notes-root-sensitive-v1.js';
import {messaging,recoverMessaging} from './messaging.js';
import {lessonNotes} from './lesson-notes.js';
import {nativeAttendance} from './native-attendance.js';
import {setupEnabled,acceptedDatabase,acceptedHead,acceptedRepository} from './setup-reader.js';
import {courseWebsites} from './course-websites.js';
import {publicWebsiteCards,publicWebsiteCardImage,uploadWebsiteCardImage} from './website-cards.js';
import {publicFoundationsLinks} from './surah-websites-access.js';
import {acceptFeatureChange} from './setup-publication.js';
import {announcements,publicAnnouncements,announcementImage,announcementPdf,announcementUpload,publicAnnouncementSnapshot,publicAnnouncementAsset} from './announcements.js';
import {guardWorkspace,actualState,isAdminWorkspace} from './workspace-access.js';
import {globalSettings} from './global-settings.js';
import {headerDate} from '../header-date.js';
import {lessonPlanning} from './lesson-planning.js';
import {d1Memorisation,d1MemorisationPreview} from './memorisation.js';
import {d1Assessments} from './assessments.js';
import {assessmentFiles} from './assessment-files.js';
import {assessmentReports} from './assessment-reports.js';
import {authenticateVideo} from './session-video.js';
import {lessonMedia,timetableMedia} from './lesson-media.js';
import {pdfTools,publicPdfTools} from './pdf-tools.js';
import {pdfBookmarks} from './pdf-bookmarks.js';
import {teacherAvailability,ROOT_SENSITIVE_AVAILABILITY_VERSION} from './teacher-availability.js';
import {d1Subjects} from './subjects.js';
import {d1LearningCatalogue,saveLearningModule} from './learning-catalogue.js';
import {d1AccountTimetable} from './account-timetable.js';
import { createAuthRateLimitKey, createSessionToken, isValidFourDigitPin } from '../../lib/auth-primitives.js';
import {createAcademyPinHash,verifyAcademyPin} from '../../lib/academy-pin.js';
import { academyD1Repository, rehearsalError } from './repository-root-sensitive-v1.js';
import {surahWebsiteLinks} from './surah-websites-access.js';
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
import {programMonthlySubscriptions} from './program-monthly-subscriptions.js';
import {d1CourseSubscriptions} from './course-subscriptions.js';
import {managedCourseScopes} from './course-authority.js';
import {programmeChoice} from './web-platform/navigation.mjs';
import {dashboardSummary,dashboardChoice,dashboardJoinInput,dashboardTimetableAudience} from './web-platform/dashboard.mjs';
import {nativeJoinOwnership} from './web-platform/native-join.mjs';
import {programmePageGroups} from './web-platform/programme-groups.mjs';
import {authenticatedD1Account,d1Audience as audience,d1ContextEqual as contextEqual,ROOT_SENSITIVE_SESSION_VERSION} from './session-root-sensitive-v1.js';
import {openLibraryMetadataEndpoint as defaultMetadataEndpoint} from './library-metadata.js';

if([ROOT_SENSITIVE_SESSION_VERSION,ROOT_SENSITIVE_CLASS_NOTES_VERSION,ROOT_SENSITIVE_MANUAL_MARKS_VERSION].some(v=>v!=='ROOT_NATIVE_ACTION_CONTEXT_V1'))throw Error('ROOT_SENSITIVE_NATIVE_LINK_REQUIRED');
if(ROOT_SENSITIVE_AVAILABILITY_VERSION!=='ROOT_NATIVE_ADMIN_AVAILABILITY_V1')throw Error('ROOT_AVAILABILITY_NATIVE_LINK_REQUIRED');
const nativePINVerifiers=new WeakMap();
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
async function issueSession(env,repository,state,context,capture) {
  if(!context)throw rehearsalError('No authorised Academy context is available.',403,'NO_CONTEXT');
  const session=await repository.createSession(state,context);
  if(repository.privateSnapshots){
    // Populate the permission cache at sign-in, using the same live session
    // and revision checks that protect later navigation requests.
    state=await repository.session(session.sid,state.account.account_id,state.account.credential_epoch);
    context=state?.contexts.find(c=>contextEqual(c,context));
    if(!context)throw rehearsalError('Your permissions changed. Please sign in again.',401,'SESSION_ENDED');
  }
  const token=await createSessionToken({type:'account',aud:audience,sv:3,sid:session.sid,accountid:state.account.account_id,epoch:state.account.credential_epoch,scope:context.scope,courseid:context.courseId,role:context.role},env);
  capture?.({state,context,sid:session.sid});
  return {success:true,...sessionResponse(state,context,token)};
}
async function rateLimit(env,login) {
  if(!env.AUTH_LOGIN_RATE_LIMITER?.limit)throw rehearsalError('Account service is temporarily unavailable.');
  const key=await createAuthRateLimitKey('account-d1',login.toUpperCase(),env);
  const result=await env.AUTH_LOGIN_RATE_LIMITER.limit({key});
  if(!result.success)throw rehearsalError('Too many sign-in attempts. Please wait one minute.',429,'LOGIN_RATE_LIMITED');
}
async function dispatch(request,env,options={}) {
  if (![env.PIN_SECRET,env.SESSION_SECRET].every(value=>typeof value==='string'&&value.trim()))
    throw rehearsalError('Academy authentication is not configured.');
  const path=new URL(request.url).pathname;
  if(env.JWT_V110_NATIVE_COOKIE==='1'&&['/api/account/login','/api/account/setup-pin'].includes(path)&&options.nativePINForJWT!==true)throw rehearsalError('Use the current Academy cookie sign-in.',409,'COOKIE_SIGN_IN_REQUIRED');
  if(path==='/api/academy/announcements/published'&&['GET','HEAD'].includes(request.method))return publicAnnouncementSnapshot(request,env);
  if(['/api/academy/announcements/image','/api/academy/announcements/pdf'].includes(path)&&['GET','HEAD'].includes(request.method)&&new URL(request.url).searchParams.has('asset'))return publicAnnouncementAsset(request,env,path.endsWith('/pdf')?'pdf':'image');
  // Playback tickets remain narrowly scoped, but cannot outlive the current
  // browser's own cookie identity or own-app lock/cancellation state.
  if(env.JWT_V110_NATIVE_COOKIE==='1'&&['GET','HEAD'].includes(request.method)&&['/api/academy/d1/library/file','/api/academy/lesson-media/video'].includes(path))env=await bindAcademyCookieRequest(request,env);
  let repository=academyD1Repository(env);
  const sourceRepository=repository;
  let reader;
  const readRepository=async()=>reader??=acceptedRepository(sourceRepository,await acceptedHead(sourceRepository,request.headers.get('X-Academy-Setup')||''));
  if(path==='/api/academy/media-playlist-card-image'&&['GET','HEAD'].includes(request.method))return publicPlaylistCardImage(request,env);
  if(path.startsWith('/api/academy/hub/')){await sourceRepository.ready();let portalAuth;const value=await nativePortal(request,env,{
    repository:sourceRepository,
    authenticate:async r=>{portalAuth=await authenticated(r,env,sourceRepository);return portalAuth;},
    read:async(p,body,mode,r,auth)=>dispatch(await portalNativeReadRequest(p,body,mode,r,auth,env),env),
    mint:(auth,context)=>auth.cookieClaims?cookieSessionKey(auth.cookieClaims,context):createSessionToken({type:'account',aud:audience,sv:3,sid:auth.sid,accountid:auth.state.account.account_id,epoch:auth.state.account.credential_epoch,scope:context.scope,courseid:context.courseId,role:context.role},env),
    login:input=>dispatch(new Request(new URL(input.setup?'/api/account/setup-pin':'/api/account/login',request.url),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)}),env)
  });return path==='/api/academy/hub/read'?portalReadReply(request,value,portalAuth):value;}
  if(path.startsWith('/internal/website/')||path.startsWith('/api/website-platform/'))return websitePlatformBridge(request,env,{
    login:async input=>{let captured;await dispatch(new Request(new URL(input.setup?'/api/account/setup-pin':'/api/account/login',request.url),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)}),env,{capture:value=>captured=value});return captured;},
    coursePlaylistPlacements:async(session,input)=>{await sourceRepository.ready();return nativeCoursePlaylistPlacements(sourceRepository,session,input);},
    mediaTeachers:async(session,input)=>{
      await sourceRepository.ready();
      if(typeof input.offeringId!=='string'||input.offeringId.length>180)throw rehearsalError('Choose the exact mapped offering.',400);
      const core=sourceRepository.coreDb,mappingSQL="SELECT m.activity_key,s.enabled,o.state access_owner FROM website_platform_timetable_scopes m JOIN website_platform_access_scopes s USING(activity_key) LEFT JOIN website_platform_access_ownership o USING(activity_key) WHERE m.offering_id=?";
      const mapping=await core.prepare(mappingSQL).bind(input.offeringId).first();if(!mapping||mapping.enabled!==1||mapping.access_owner==='FROZEN')throw rehearsalError('The mapped offering is unavailable for media attribution.',403,'MEDIA_FORBIDDEN');
      const state=await sourceRepository.session(session.session_id,session.account_id,session.epoch);if(!state)throw rehearsalError('Your Academy session has ended.',401,'SESSION_ENDED');
      if(!state.account.global_admin&&!state.roles.some(r=>r.role==='PROGRAM_ADMIN'&&r.activity_key.toUpperCase()===mapping.activity_key.toUpperCase()))throw rehearsalError('This media is outside your current Admin scope.',403,'MEDIA_FORBIDDEN');
      const auth={state,authority:state,sid:session.session_id,workspace:'ADMIN',workspaceContext:'ADMIN',user:{accountid:session.account_id}};sourceRepository.bindActor(auth);
      const choices=await nativeMediaTeachers(sourceRepository.authoringRepository().db,mapping.activity_key,input.teacherIds),after=await core.prepare(mappingSQL).bind(input.offeringId).first(),current=await sourceRepository.session(session.session_id,session.account_id,session.epoch);
      if(!current||!after||after.activity_key!==mapping.activity_key||after.enabled!==1||after.access_owner==='FROZEN'||!current.account.global_admin&&!current.roles.some(r=>r.role==='PROGRAM_ADMIN'&&r.activity_key.toUpperCase()===mapping.activity_key.toUpperCase()))throw rehearsalError('The native session, offering or Admin scope changed.',401,'SESSION_ENDED');
      return {schema:'NATIVE_MEDIA_TEACHERS_V1',offeringId:input.offeringId,activityKey:mapping.activity_key,...choices,checkedAt:Date.now()};
    },
    navigation:async(session,key)=>programmeChoice(await sourceRepository.byId(session.account_id),key,env),
    destination:async(session,input)=>{
      let destination=input;
      if(input?.tool==='participants'&&input.offeringId){
       if(Object.keys(input).some(key=>!['mode','tool','offeringId'].includes(key))||input.mode!=='admin'||typeof input.offeringId!=='string'||!/^[-A-Za-z0-9_:]{1,180}$/.test(input.offeringId))throw rehearsalError('Choose the current Participants table.',400);
       const mapped=await sourceRepository.coreDb.prepare("SELECT t.activity_key FROM website_platform_timetable_scopes t JOIN website_platform_access_scopes s USING(activity_key) JOIN website_platform_access_ownership o USING(activity_key) WHERE t.offering_id=? AND t.kind='TAFSEER' AND s.enabled=1 AND o.state='STUDIO'").bind(input.offeringId).first();
       if(!mapped)throw rehearsalError('This Participants table is unavailable.',403);
       destination={mode:'admin',tool:'participants',activityKey:mapped.activity_key};
      }
      return dashboardChoice(await sourceRepository.session(session.session_id,session.account_id,session.epoch),destination);
    },
    lessonJoin:async(session,input)=>{
      const state=await sourceRepository.session(session.session_id,session.account_id,session.epoch);
      if(!state)throw rehearsalError('Your Academy session has ended.',401,'SESSION_ENDED');
      const selected=dashboardJoinInput(state,input),context=JSON.parse(session.context_json);
      await nativeJoinOwnership(sourceRepository.coreDb,session.account_id,selected.target);
      const token=await createSessionToken({type:'account',aud:audience,sv:3,sid:session.session_id,accountid:session.account_id,epoch:session.epoch,scope:context.scope,courseid:context.courseId,role:context.role},env);
      const body=JSON.stringify({joinKey:selected.joinKey,date:selected.date});let result;
      try{result=await dispatch(new Request(new URL('/api/academy/lesson/join',request.url),{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token,'X-Academy-Workspace':dashboardTimetableAudience(state,selected.mode).toUpperCase()},body}),env);}
      catch(error){
        if(error.status!==403||error.code!=='LESSON_UNAVAILABLE')throw error;
        // A current admitted account may join a public FREE lesson without
        // acquiring its programme role. The unchanged anonymous accepted
        // reader rechecks FREE/publication/calendar/window; paid lessons fail.
        result=await dispatch(new Request(new URL('/api/academy/public-lesson/join',request.url),{method:'POST',headers:{'Content-Type':'application/json','X-Academy-Workspace':'LEARN'},body}),env);
      }
      const current=await sourceRepository.session(session.session_id,session.account_id,session.epoch);
      const permissions=value=>JSON.stringify([value.account.global_admin,value.account.substitute_grants,value.roles,value.contexts,value.subscriptions,value.monthlyMedia]);
      if(!current||permissions(current)!==permissions(state))throw rehearsalError('Your Academy permissions changed. Refresh the timetable.',409,'ACCESS_REFRESH_REQUIRED');
      await nativeJoinOwnership(sourceRepository.coreDb,session.account_id,selected.target);
      return result;
    },
    dashboard:async(session,input)=>{
      const state=await sourceRepository.session(session.session_id,session.account_id,session.epoch);if(!state)throw rehearsalError('Your Academy session has ended.',401,'SESSION_ENDED');
      const context=JSON.parse(session.context_json),token=await createSessionToken({type:'account',aud:audience,sv:3,sid:session.session_id,accountid:session.account_id,epoch:session.epoch,scope:context.scope,courseid:context.courseId,role:context.role},env);
      const nativeScopes=(await sourceRepository.db.prepare('SELECT s.activity_key,m.offering_id,m.kind,o.state access_owner FROM json_each(?) a JOIN website_platform_access_scopes s ON s.activity_key=a.value COLLATE NOCASE JOIN website_platform_timetable_scopes m USING(activity_key) LEFT JOIN website_platform_access_ownership o INDEXED BY website_platform_ownership_nocase ON o.activity_key=s.activity_key COLLATE NOCASE WHERE s.enabled=1').bind(JSON.stringify(state.activities.slice(0,100).map(a=>a.activity_key))).all()).results;
      return dashboardSummary(state,env,input,(path,body,mode)=>dispatch(new Request(new URL(path,request.url),{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token,'X-Academy-Workspace':mode.toUpperCase()},body:JSON.stringify(body)}),env),nativeScopes);
    },
    mint:(session,selected)=>{const context=selected||JSON.parse(session.context_json);return createSessionToken({type:'account',aud:audience,sv:3,sid:session.session_id,accountid:session.account_id,epoch:session.epoch,scope:context.scope,courseid:context.courseId,role:context.role},env);}
  });
  if(path==='/api/academy/website-studio/config'&&request.method==='GET')return {success:true,enabled:Boolean(studioOrigin(env)),origin:studioOrigin(env)};
  await repository.ready();
  if(path==='/api/academy/setup/head'&&request.method==='GET')return {success:true,head:setupEnabled(env)?await acceptedHead(repository):null};
  if(path==='/api/academy/website-cards'&&request.method==='GET'){const source=setupEnabled(env)?await readRepository():repository;return {success:true,...await publicWebsiteCards(source),publicLinks:await publicFoundationsLinks(source)}};
  if(path==='/api/academy/website-card-image'&&['GET','HEAD'].includes(request.method))return publicWebsiteCardImage(request,setupEnabled(env)?await readRepository():repository,env);
  if(path==='/api/academy/announcements'&&request.method==='GET'){const source=setupEnabled(env)?await readRepository():repository;return conditionalRead(request,source,null,{},async()=>({success:true,...await publicAnnouncements(source)}));}
  if(path==='/api/academy/enrolment/catalogue'&&request.method==='GET')return {success:true,...await enrolmentCatalogue(setupEnabled(env)?await readRepository():repository)};
  if(path==='/api/academy/announcements/image'&&['GET','HEAD'].includes(request.method))return announcementImage(request,new URL(request.url).searchParams.get('draft')==='1'?repository.authoringRepository():setupEnabled(env)?await readRepository():repository,env);
  if(path==='/api/academy/announcements/pdf'&&['GET','HEAD'].includes(request.method))return announcementPdf(request,new URL(request.url).searchParams.get('draft')==='1'?repository.authoringRepository():setupEnabled(env)?await readRepository():repository,env);
  const publicLibraryOnly=env.ACADEMY_LIBRARY_MODE==='PUBLIC_ONLY';
  if(path==='/api/academy/pdf-tools/defaults'&&request.method==='GET')return {success:true,...await publicPdfTools(setupEnabled(env)?await readRepository():repository)};
  if(['/','/api/health'].includes(path)&&request.method==='GET')return {success:true,service:'maktab-academy',version:'109.25',...(sourceRepository.features.splitDatabases?{databaseGeneration:'SPLIT_V1'}:{}),
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
  if(path==='/api/academy/lesson-media/video'&&['GET','HEAD'].includes(request.method)){
    const {auth,input}=await authenticateVideo(request,env,repository);repository.bindActor?.(auth);
    if(isAdminWorkspace(auth))repository=repository.authoringRepository();
    else if(setupEnabled(env))repository=await readRepository();
    const response=await lessonMedia(repository,auth,env).videoStream(request,input);
    // R2 may await network I/O after the initial native access check. Recheck
    // the verified JWT/native actor before handing any body to the browser.
    if(env.JWT_V110_NATIVE_COOKIE==='1')try{await verifyActor(sourceRepository.mediaPlaylistSource.db,actorProof(auth));}
    catch(error){try{await response.body?.cancel();}catch{}throw error;}
    return response;
  }
  if(request.method!=='POST')throw rehearsalError('Use POST.',405,'METHOD_NOT_ALLOWED');
  // Only decorative card artwork has a larger bounded browser request. Native
  // authentication/workspace checks and the generic access parser stay intact.
  if(path==='/api/admin/platform/studio-access/playlist-cover'){
    if(!academyManagementOriginAllowed(request.headers.get('Origin')))throw rehearsalError('Reopen artwork editing inside Academy Admin.',403,'ORIGIN_REQUIRED');
    const auth=await authenticated(request,env,repository),input=await boundedBody(request,1_000_000);guardWorkspace(request,auth,input);
    if(input.command?.action!=='mou-playlist-cover-upload')throw rehearsalError('Use the artwork upload action.',400,'INVALID_ACTION');
    return studioAdmin(env,auth,input);
  }
  if(path==='/api/admin/platform/studio-access'){
    if(!academyManagementOriginAllowed(request.headers.get('Origin')))throw rehearsalError('Reopen access management inside Academy Admin.',403,'ORIGIN_REQUIRED');
    const auth=await authenticated(request,env,repository),input=await boundedBody(request,131072);guardWorkspace(request,auth,input);
    return studioAdmin(env,auth,input);
  }
  if(path==='/api/academy/media-playlists/card-upload'||path==='/api/academy/media-playlists/card-preview'){
    const auth=await authenticated(request,env,repository);let input;
    if(path.endsWith('/card-upload')){const metadata=new URL(request.url).searchParams.get('metadata')||'';if(metadata.length>8192)throw rehearsalError('Upload details are too large.',413);try{input=JSON.parse(metadata);}catch{throw rehearsalError('Invalid image details.');}}
    else input=await boundedBody(request,8192);
    if(!input||typeof input!=='object'||Array.isArray(input))throw rehearsalError('Invalid image details.');guardWorkspace(request,auth,input);
    return path.endsWith('/card-upload')?{success:true,...await uploadPlaylistCardImage(request,repository,auth,env,input)}:previewPlaylistCardImage(request,repository,auth,env,input);
  }
  if(path==='/api/admin/platform/programs/website-card-image'){
    const auth=await authenticated(request,env,repository),metadata=new URL(request.url).searchParams.get('metadata')||'';
    if(metadata.length>8192)throw rehearsalError('Upload details are too large.',413);
    let input;try{input=JSON.parse(metadata);}catch{throw rehearsalError('Invalid image details.');}
    if(!input||typeof input!=='object'||Array.isArray(input))throw rehearsalError('Invalid image details.');
    guardWorkspace(request,auth,input);
    return {success:true,...await uploadWebsiteCardImage(request,repository.authoringRepository(),auth,env,input)};
  }
  if(path==='/api/admin/platform/course-websites/upload'){
    if(studioOrigin(env))throw rehearsalError('Open Website Studio to edit website content.',409,'WEBSITE_STUDIO_REQUIRED');
    const auth=await authenticated(request,env,repository),metadata=new URL(request.url).searchParams.get('metadata')||'';
    if(metadata.length>8192)throw rehearsalError('Upload details are too large.',413);
    let input;try{input=JSON.parse(metadata);}catch{throw rehearsalError('Invalid upload details.');}
    if(!input||typeof input!=='object'||Array.isArray(input))throw rehearsalError('Invalid upload details.');
    guardWorkspace(request,auth,input);
    return {success:true,...await courseWebsites(repository.authoringRepository(),auth,env).upload(request,input)};
  }
  if(['/api/admin/platform/announcements/save','/api/admin/platform/announcements/draft-save'].includes(path)){
    const auth=await authenticated(request,env,repository);
    guardWorkspace(request,auth);
    repository=repository.authoringRepository();
    const editor=announcements(repository,auth,env,{acceptPublication:reference=>acceptFeatureChange(repository,auth,reference)}),{input,image,pdf}=await announcementUpload(request);
    return {success:true,...await editor.run(path.endsWith('/draft-save')?'draft-save':'save',input,image,pdf)};
  }
  if(['/api/academy/lesson-media/upload','/api/academy/lesson-media/note-upload','/api/academy/lesson-media/video-part'].includes(path)) {
    const auth=await authenticated(request,env,repository),metadata=new URL(request.url).searchParams.get('metadata')||'';
    if(metadata.length>8192)throw rehearsalError('Upload details are too large.',413);
    let input;try{input=JSON.parse(metadata);}catch{throw rehearsalError('Invalid upload details.',400);}
    if(!input||typeof input!=='object'||Array.isArray(input))throw rehearsalError('Invalid upload details.',400);
    guardWorkspace(request,auth,input);
    if(isAdminWorkspace(auth))repository=repository.authoringRepository();
    if(setupEnabled(env)&&!isAdminWorkspace(auth))repository=await readRepository();
    if(path.endsWith('/video-part'))return {success:true,...await lessonMedia(repository,auth,env).videoPart(request,input)};
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
  const managementPath=path.startsWith('/api/admin/platform/')||path.startsWith('/api/academy/messaging/');
  const input=await boundedBody(request,['/api/admin/platform/course-websites/save','/api/admin/platform/programs/save'].includes(path)?750000:path.endsWith('/register-reports-generate')?524288:path.startsWith('/api/academy/bookmarks/')?8192:managementPath||path.startsWith('/api/academy/teacher-availability/')||path.startsWith('/api/academy/progress/')||path.startsWith('/api/academy/assessments/')||path.startsWith('/api/academy/lesson-media/')||path.startsWith('/api/academy/planning/')||path.startsWith('/api/academy/attendance/')||path.startsWith('/api/academy/my-links/')||path.startsWith('/api/academy/class-notes/')?131072:path.startsWith('/api/program-attendance/')?65536:4096);
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
    if(options.nativePINVerificationOnly===true){
      const context=state.contexts[0];
      if(!context)throw rehearsalError('No authorised Academy context is available.',403,'NO_CONTEXT');
      const proof=captureNativePINVerification(state,context);
      options.capture?.({proof});
      return {success:true};
    }
    if(options.nativePINForJWT===true){
      const rootPINProof=captureNativeRootPINVerification(state,state.contexts[0]);
      return issueSession(env,repository,state,state.contexts[0],value=>options.capture?.({...value,rootPINProof}));
    }
    return issueSession(env,repository,state,state.contexts[0],options.capture);
  }
  if(path==='/api/academy/entrance') {
    const auth=request.headers.has('Authorization')?await authenticated(request,env,repository):null;
    const source=setupEnabled(env)?await readRepository():repository;return conditionalRead(request,source,auth,input,async()=>{const home=websiteEntrance(await d1Entrance(source,auth?.state,auth?.user,input,undefined,{auth}));return {success:true,sessionStore:'D1',...home,programmePageGroups:programmePageGroups(home,env)};});
  }
  if(path==='/api/academy/public-lesson/join')return {success:true,...await d1LessonJoin(setupEnabled(env)?await readRepository():repository,null,input)};
  if(path==='/api/academy/enrolment/submit'){
    const auth=await authenticated(request,env,repository);
    return {success:true,...await submitEnrolment(setupEnabled(env)?await readRepository():repository,auth,input,request,env)};
  }
  const publicSurahAction=path.match(/^\/api\/academy\/public-surah-websites\/(read|asset)$/)?.[1];
  if(publicSurahAction){
    if(typeof input.surahId!=='string'||typeof input.activityKey!=='string'||!input.activityKey.startsWith('PROGRAM:'))throw rehearsalError('Choose the public Foundations website.',400);
    const source=setupEnabled(env)?await readRepository():repository,result=await courseWebsites(source,null,env).run(publicSurahAction,input);
    return result instanceof Response?result:{success:true,...result};
  }
  const auth=await authenticated(request,env,repository);
  guardWorkspace(request,auth,input);
  const monthlyAction=path.match(/^\/api\/admin\/platform\/program-monthly-subscriptions\/(get|configure|save|grid|grid-save|surahs|surah-save|surah-grants|surah-grants-save)$/)?.[1];
  if(monthlyAction)return {success:true,...await programMonthlySubscriptions(sourceRepository,auth).run(monthlyAction,input)};
  if(path==='/api/academy/tafseer-links'||path==='/api/academy/monthly-media/surahs'){
    const result=await surahWebsiteLinks(sourceRepository,auth);
    return {success:true,...result,...(path.endsWith('/surahs')?{surahs:result.websites}:{})};
  }
  if(path==='/api/academy/monthly-media/months'){
    if(!sourceRepository.features.monthlySubscriptions)throw rehearsalError('Monthly media is unavailable.',503);
    const grants=auth.workspace==='LEARN'&&!auth.adminView?(auth.state.monthlyMedia||[]):[];
    return {success:true,programs:[...new Set(grants.map(g=>g.activity_key))].map(key=>({activityKey:key,name:auth.state.activities.find(a=>a.activity_key===key)?.name||'Program',months:grants.filter(g=>g.activity_key===key).map(g=>g.lesson_month)}))};
  }
  if(path==='/api/academy/monthly-media/list'){
    if(!sourceRepository.features.monthlySubscriptions||auth.workspace!=='LEARN'||auth.adminView)throw rehearsalError('Open your paid months in Learn.',403,'FORBIDDEN');
    const source=setupEnabled(env)?await readRepository():sourceRepository,selection={...input,view:'learner'};
    const result=await lessonMedia(source,auth,env).run('list',selection);
    return {success:true,...(sourceRepository.features.mediaSeparation?await lessonNotes(source,auth,env).enrichList(result,selection):result)};
  }
  if(path.startsWith('/api/academy/messaging/')){
    if(request.method!=='POST')throw rehearsalError('Use POST.',405,'METHOD_NOT_ALLOWED');
    if(env.ACADEMY_MESSAGING!=='1')throw rehearsalError('Messaging is not enabled yet.',503,'MESSAGING_NOT_ENABLED');
    const action=path.slice('/api/academy/messaging/'.length);
    return {success:true,...await messaging(await readRepository(),auth).run(action,input)};
  }
  if(isAdminWorkspace(auth))repository=repository.authoringRepository();
  const classNoteAction=path.match(/^\/api\/academy\/class-notes\/(summary|timetable|sessions|get|due|history|post|revise|withdraw|relink)$/)?.[1];
  if(classNoteAction)return {success:true,...await classNotes(await readRepository(),auth).run(classNoteAction,input)};
  const nativeAction=path.match(/^\/api\/(?:academy\/attendance|program-attendance)\/(options|get|submit|prepare|recover|report|roster-get|roster-save|substitute-save|substitute-revoke|substitute-reopen)$/)?.[1];
  if(nativeAction&&sourceRepository.features.nativeAttendance)return {success:true,...await nativeAttendance(await readRepository(),auth).run(nativeAction,input)};
  if(path.startsWith('/api/admin/platform/setup/'))throw rehearsalError('This separate publication workflow has been retired. Save or Publish from the relevant editor.',404,'NOT_FOUND');
  if(path==='/api/academy/changes/accept'){
    if(request.method!=='POST'||!setupEnabled(env))throw rehearsalError('This saved change is not available.',404);
    return {success:true,...await acceptFeatureChange({...repository,onAssessmentPublication:head=>warmPublishedAssessments(acceptedRepository(sourceRepository,head),auth)},auth,input)};
  }
  if(setupEnabled(env)&&(!isAdminWorkspace(auth)||path==='/api/academy/lesson/join')&&!path.startsWith('/api/account/'))repository=await readRepository();
  const websiteAdmin=path.match(/^\/api\/admin\/platform\/course-websites\/(list|get|save|publish|withdraw|asset|prepared-copy)$/)?.[1];
  if(websiteAdmin){if(studioOrigin(env)&&['save','publish','withdraw'].includes(websiteAdmin))throw rehearsalError('Open Website Studio to edit and publish this website.',409,'WEBSITE_STUDIO_REQUIRED');const result=await courseWebsites(repository,auth,env).run(websiteAdmin==='asset'?'admin-asset':websiteAdmin,input);return result instanceof Response?result:{success:true,...result};}
  const websiteRead=path.match(/^\/api\/academy\/course-websites\/(read|asset)$/)?.[1];
  if(websiteRead){const source=setupEnabled(env)?await readRepository():repository;const result=await courseWebsites(source,auth,env).run(websiteRead,input);return result instanceof Response?result:{success:true,...result};}
  const personalAction=path.match(/^\/api\/academy\/my-links\/(list|save|export)$/)?.[1];
  if(personalAction)return {success:true,...await personalLinks(sourceRepository,auth,env).run(personalAction,input)};
  const playlistAction=path.match(/^\/api\/academy\/media-playlists\/(list|get|options|save|publish|attach)$/)?.[1];
  if(playlistAction){
   const loadRecordings=async(activityKey,lessonIds,{publicOnly=false}={})=>{
    const core=sourceRepository.mediaPlaylistSource.db,readerHead=repository.setup?.head||await acceptedHead(sourceRepository),management=isAdminWorkspace(auth)&&!publicOnly,selected=management?repository:{...repository,db:acceptedDatabase(core,readerHead,repository.features,{activityKey,lessonIds}),coreDb:core,setup:{...repository.setup,head:readerHead,reader:true}};
    const result=await lessonMedia(selected,auth,env,{lessonIds,management,companionDb:core}).run('list',{activityKey,...(publicOnly?{view:'learner'}:{})});
    if(sourceRepository.features.mediaSeparation){const notesSource={...repository,db:acceptedDatabase(core,readerHead,repository.features,{activityKey}),coreDb:core,setup:{...repository.setup,head:readerHead,reader:true}},notes=lessonNotes(notesSource,auth,env),refs=result.lessons.map(row=>({activityKey,sessionKey:row.mediaBinding?.noteKey||row.sessionKey,date:row.date})),entries=await notes.notes(refs);for(const row of result.lessons)row.assets.push(...entries.filter(n=>n.session_key===(row.mediaBinding?.noteKey||row.sessionKey)).map(notes.asset));}
    return result;
   };
   return {success:true,...await mediaPlaylists(repository,auth,env,{loadRecordings}).run(playlistAction,input)};
  }
  const noteAction=path.match(/^\/api\/academy\/lesson-media\/note-(options|withdraw)$/)?.[1];
  if(noteAction){if(!sourceRepository.features.mediaSeparation)throw rehearsalError('Own notes are unavailable.',503);const notes=lessonNotes(await readRepository(),auth,env);return {success:true,...await notes[noteAction](input)};}
  if(path==='/api/academy/lesson-media/download'&&sourceRepository.features.mediaSeparation&&String(input.assetId||'').startsWith('NOTE-'))return lessonNotes(await readRepository(),auth,env).download(input);
  const settingsAction=path.match(/^\/api\/admin\/platform\/settings\/(get|save)$/)?.[1];
  if(settingsAction)return {success:true,...await globalSettings(repository,auth).run(settingsAction,input)};
  if(path==='/api/academy/website-studio/handoff')return studioHandoff(request,env,sourceRepository,auth,input);
  if(path==='/api/academy/hifz/sign-in')return issueHifzHandoff(env,auth,input);
  if(path==='/api/academy/enrolment/profile')return {success:true,...await enrolmentProfile(repository,auth)};
  const enrolmentAction=path.match(/^\/api\/admin\/platform\/enrolment\/(get|catalogue-save|request-save|request-delete|accounts|register|settings-save)$/)?.[1];
  if(enrolmentAction)return {success:true,...await enrolmentManagement(repository,auth).run(enrolmentAction,input)};
  const bookmarkAction=path.match(/^\/api\/academy\/bookmarks\/(list|save|delete)$/)?.[1];
  if(bookmarkAction)return {success:true,...await pdfBookmarks(repository,auth).run(bookmarkAction,input)};
  const announcementAction=path.match(/^\/api\/admin\/platform\/announcements\/(list|drafts|publish|unpublish|discard|delete|publish-feed)$/)?.[1];
  if(announcementAction)return {success:true,...await announcements(repository,auth,env,{acceptPublication:reference=>acceptFeatureChange(repository,auth,reference)}).run(announcementAction,input)};
  const planningAction=path.match(/^\/api\/academy\/planning\/(list|get|save|submit|requirement|requirements|comment|policy|deadline|sessions|session-policy)$/)?.[1];
  if(planningAction)return {success:true,...await lessonPlanning(repository,auth).run(planningAction,input)};
  const pdfToolAction=path.match(/^\/api\/admin\/platform\/pdf-tools\/(get|save)$/)?.[1];
  if(pdfToolAction)return {success:true,...await pdfTools(repository,auth).run(pdfToolAction,input)};
  const academicCalendarAction=path.match(/^\/api\/academy\/calendar\/(get|save)$/)?.[1];
  if(academicCalendarAction){const produce=()=>academicCalendar(repository,auth).run(academicCalendarAction,input);return {success:true,...await (academicCalendarAction==='get'?privateSnapshot(repository,auth,{kind:'calendar',input},produce):produce())};}
  if(path==='/api/academy/lesson-media/timetable'){const result=await timetableMedia(repository,auth,input);if(sourceRepository.features.mediaSeparation){const additions=await lessonNotes(await readRepository(),auth,env).timetable(input);for(const row of additions.lessons){const existing=result.lessons.find(r=>r.activityKey===row.activityKey&&r.sessionKey===row.sessionKey);if(existing)existing.assets.push(...row.assets);else result.lessons.push(row);}}return {success:true,...result};}
  const mediaAction=path.match(/^\/api\/academy\/lesson-media\/(binding-options|binding-create|context-options|context-save|companion|companion-editor|companion-save|companion-publish|list|feed|calendar|sessions|create|historical-create|course-files-create|get|save|watch|download|comments|comment-save|comment-moderate|attachment-remove|attachment-name|video-start|video-complete|video-abort|video-retain)$/)?.[1];
  if(mediaAction){let result=await lessonMedia(repository,auth,env).run(mediaAction,input);if(sourceRepository.features.mediaSeparation&&['calendar','list','feed','get'].includes(mediaAction)&&!result.notModified){const notes=lessonNotes(await readRepository(),auth,env);if(mediaAction==='get'){if(result.lesson.sessionKey||result.lesson.mediaBinding){const entries=await notes.notes([{activityKey:result.lesson.activityKey,sessionKey:result.lesson.mediaBinding?.noteKey||result.lesson.sessionKey}]);result.assets.push(...entries.map(notes.asset));result.lesson.canCurateNotes=true;}}else result=await (mediaAction==='calendar'?notes.enrichCalendar(result,input):mediaAction==='feed'?notes.enrichFeed(result,input):notes.enrichList(result,input));}if(!(result instanceof Response)){await recordingPlaylistMetadata(sourceRepository,auth,result.lessons||result.lesson?[...(result.lessons||[]),...(result.lesson?[result.lesson]:[])]:[],{publicOnly:input.view==='learner'});}return result instanceof Response?result:{success:true,...result};}
  if(path==='/api/academy/assessments/progress-list')return {success:true,...await assessmentProgress(repository,auth,input)};
  if(path==='/api/academy/assessments/download')return assessmentFiles(repository,auth,env).download(input);
  if(['/api/academy/assessments/marks-list','/api/academy/assessments/marks-save'].includes(path))return {success:true,...await assessmentManualMarks(repository,auth).run(path.endsWith('marks-list')?'marks-list':'marks-save',input)};
  const imtihaanAction=path.match(/^\/api\/academy\/assessments\/(register-finish|papers-validate|paper-replacement-preview|register-marking-validate|register-marking-override|register-reports-plan|register-reports-generate|register-reports-release)$/)?.[1];
  if(imtihaanAction)return {success:true,...await imtihaanWorkflow(repository,auth,assessmentStore(repository,auth)).run(imtihaanAction,input)};
  const assessmentAction=path.match(/^\/api\/academy\/assessments\/(list|get|table-save|register-marks-preview|register-marks-release|schedule-batch|register-create|register-save|register-validate|register-release|session-delete|phase-create|create|save|paper-details|publish|roster|review-paper|authorise-resubmission|confirm-submission|ready-assessment|mark|review-mark|release|release-papers|prepare-papers|collection-save|finalise|withdraw-release)$/)?.[1];
  if(assessmentAction){const produce=()=>d1Assessments(repository,auth).run(assessmentAction,input);return {success:true,...await (assessmentAction==='list'&&input.dashboard===true?privateSnapshot(repository,auth,{kind:'dashboard-assessments',input},produce):produce())};}
  const assessmentReportAction=path.match(/^\/api\/academy\/assessments\/(templates|template-save|report-data|report-save|report-list)$/)?.[1];
  if(assessmentReportAction)return {success:true,...await assessmentReports(repository,auth).run(assessmentReportAction,input)};
  if(path==='/api/admin/platform/public-timetable/refresh')return {success:true,...await refreshPublicTimetable(request,env,repository,auth)};
  if(path==='/api/academy/cache/refresh') {
    if(!auth.state.account.global_admin&&!auth.state.roles.some(r=>r.role==='PROGRAM_ADMIN'))throw rehearsalError('This action requires an authorised administrator.',403,'FORBIDDEN');
    return {success:true,...await processCacheRefresh(request,env,{repository})};
  }
  if(path==='/api/admin/platform/program-timetable/refresh-public')return {success:true,...await refreshPublishedTimetable(request,env,repository,auth,input)};
  if(path==='/api/academy/lesson/join')return {success:true,...await d1LessonJoin(repository,auth,input)};
  if(path==='/api/academy/courses/catalogue')return conditionalRead(request,repository,auth,input,async()=>({success:true,...await d1CourseCatalogue(repository,auth)}));
  if(publicLibraryOnly&&path==='/api/academy/library/catalogue')return conditionalRead(request,repository,auth,input,async()=>({success:true,resources:[],
    warnings:['Private Academy media will appear when Module subscriptions are available.'],learningAreaRefs:d1LibraryAreaRefs(auth.state),
    libraryMode:'PUBLIC_ONLY',mediaSubscriptionsAvailable:false,store:'D1'}));
  const availabilityAction=path.match(/^\/api\/academy\/teacher-availability\/(get|save)$/)?.[1];
  if(availabilityAction)return {success:true,...await teacherAvailability(repository,auth,availabilityAction,input,{nativeAvailabilityV110:env.JWT_LOCAL_ROOT_TEACHER_AVAILABILITY==='NATIVE_PIN_AVAILABILITY_V1'})};
  const progressAction=path.match(/^\/api\/academy\/progress\/(get|grid|mark|confirm|import|module-save|set-save|cards|card-active|activity-active)$/)?.[1];
  if(progressAction)return {success:true,...await d1Memorisation(repository,auth).run(progressAction,input)};
  if(path==='/api/academy/timetable')return conditionalRead(request,repository,auth,input,async()=>({success:true,...await d1AccountTimetable(repository,auth,input)}));
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
  if(path==='/api/admin/platform/programme-studio/register')return {success:true,...await registerMonthlyProgramme(env,auth,input)};
  const courseEditorAction=path.match(/^\/api\/admin\/platform\/courses\/(list|get|save|register-completed|public-card-save|validate|accept|publish|status|repeat|copy|participants|participants-save|participant-create|studio-resume)$/)?.[1];
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
  if(libraryAction){const produce=async()=>({success:true,...await d1Library(repository,auth,env).run(libraryAction[2],input,request,{admin:libraryAction[1].startsWith('admin/'),academy:libraryAction[1]==='academy/library'})});return path==='/api/academy/library/catalogue'?conditionalRead(request,repository,auth,input,produce):produce();}
  const profileAction=path.match(/^\/api\/admin\/platform\/user-profiles\/(get|link|save|recover)$/)?.[1];
  const registryAction=path.match(/^\/api\/admin\/platform\/programs\/(list|create|copy|save|readiness|prepare)$/)?.[1];
  const managementAction=path.match(/^\/api\/admin\/platform\/program-timetable\/(manage-get|manage-save|manage-remove|recover)$/)?.[1];
  if(publicLibraryOnly&&managementAction==='manage-save'&&['resources','library-root'].includes(input.kind))
    throw rehearsalError('Private Academy media is not available yet.',403,'PRIVATE_MEDIA_NOT_ENABLED');
  if(profileAction||registryAction||managementAction) {
    const programAdmin=(managementAction||['list','save'].includes(registryAction))&&auth.state.roles.some(r=>r.role==='PROGRAM_ADMIN'&&(registryAction==='list'||r.activity_key.toUpperCase()===`PROGRAM:${String(input.id||'')}`.toUpperCase()));
    if(!auth.state.account.global_admin&&!programAdmin)throw rehearsalError('This action requires an authorised administrator.',403,'FORBIDDEN');
    const learningView=managementAction==='manage-get'&&await learningAvailable(repository.db);
    const result=profileAction?await d1Profiles(repository,auth).run(profileAction,input):registryAction?await d1Programs(repository,auth,env).registry(registryAction,input):learningView?await d1Learning(repository,auth).timetable('manage-get',input):await d1Programs(repository,auth,env).management(managementAction,input);
    return {success:true,...result};
  }
  if(path==='/api/account/session')return {success:true,...sessionResponse(actualState(auth),auth.context),...(auth.cookieClaims?{account:{...publicAccount(actualState(auth)),accountId:auth.cookieClaims.sub},cookieSession:true,sessionKey:cookieSessionKey(auth.cookieClaims,auth.context),accessExpiresAtMs:auth.cookieClaims.exp*1000}:{})};
  if(path==='/api/account/logout') {await repository.revoke(auth.sid,auth.state.account.account_id);return {success:true};}
  if(path==='/api/account/switch-context') {
    const context=actualState(auth).contexts.find(c=>contextEqual(c,{scope:String(input.scope || 'COURSE').toUpperCase(),courseId:String(input.courseId || ''),role:String(input.role || '').toUpperCase()}));
    if(!context)throw rehearsalError('Requested course or role is not authorised',403,'FORBIDDEN_CONTEXT');
    if(auth.cookieClaims)return {success:true,...sessionResponse(actualState(auth),context),account:{...publicAccount(actualState(auth)),accountId:auth.cookieClaims.sub},cookieSession:true,sessionKey:cookieSessionKey(auth.cookieClaims,context),accessExpiresAtMs:auth.cookieClaims.exp*1000};
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
const nativeWorkerInstance={
  async scheduled(event,env,ctx){
    if(event.cron===noteRetentionCron){if(env.ACADEMY_NOTE_RETENTION==='1')ctx.waitUntil(recoverNoteRetention(env,new Date(event.scheduledTime)));return;}
    if(event.cron===weeklyAbsenteeCron){ctx.waitUntil(recoverWeeklyAbsentees(env,new Date(event.scheduledTime)));return;}
    // A dedicated minute tick must not multiply cache/Hifz recovery work.
    if(event.cron==='* * * * *'){
      ctx.waitUntil(recoverMessaging(env,new Date(event.scheduledTime)));
      return;
    }
    ctx.waitUntil(recoverMessaging(env,new Date(event.scheduledTime)));
    ctx.waitUntil(recoverCacheRefresh(env,new Date(event.scheduledTime)));
    ctx.waitUntil(cleanupExpiredAcademicCompanions(env,event.scheduledTime));
    if(hifzSyncEnabled(env))ctx.waitUntil(recoverHifzProfiles(env,{limit:40}));
    if(websitePlatformEnabled(env))ctx.waitUntil(recoverWebsite(env));
  },
  async fetch(request,env,ctx) {
    env=hostingEnvironment(env);
    const origin=request.headers.get('Origin');
    const allowed=(env.ALLOWED_ORIGINS || '').split(',').filter(Boolean);
    const headers={'Content-Type':'application/json','Cache-Control':'private, no-store','Vary':'Origin',
      'Access-Control-Allow-Methods':'POST, GET, HEAD, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Authorization, Range, X-Academy-Workspace, X-Academy-Class, X-Academy-Setup, X-Library-Upload-Ticket, X-Library-Upload-Offset, X-Academy-Read-Cache, X-Academy-Read-Revision, If-None-Match'};
    if(origin&&allowed.includes(origin))headers['Access-Control-Allow-Origin']=origin;
    if(origin&&!allowed.includes(origin))return new Response(JSON.stringify({success:false,error:'Origin is not allowed.'}),{status:403,headers});
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
    try{const path=new URL(request.url).pathname;
      if(env.JWT_V110_NATIVE_COOKIE==='1'&&['GET','HEAD'].includes(request.method)&&path.startsWith('/api/public/academy-announcements')){
        const target=path==='/api/public/academy-announcements'?'/api/academy/announcements/published':/^\/api\/public\/academy-announcements\/(?:image|pdf)$/.test(path)?'/api/academy/announcements/'+path.split('/').at(-1):null;
        if(target){const url=new URL(request.url);url.pathname=target;const safe=new Headers();for(const name of ['Accept','Range','If-None-Match','If-Modified-Since'])if(request.headers.has(name))safe.set(name,request.headers.get(name));return await dispatch(new Request(url,{method:request.method,headers:safe}),env);}
      }
      if(['/auth/v110/login','/auth/v110/setup-pin'].includes(path))return handleAcademyPIN(request,env,{performNativeLogin:async(input,{setup})=>{
        let native;const publicResult=await dispatch(new Request(new URL(setup?'/api/account/setup-pin':'/api/account/login',request.url),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)}),env,{capture:value=>{native=value;},nativePINForJWT:true});
        if(!native||publicResult instanceof Response)throw rehearsalError('Native PIN verification did not finish.',503);
        return {native,publicResult};
      }});
      if(['/auth/v110/logout','/auth/v110/logout-csrf'].includes(path))return handleAcademyLogout(request,env);
      if(['/auth/v110/csrf','/auth/v110/refresh'].includes(path))return handleAcademyRefresh(request,env);
      if(path==='/auth/v110/context')return readAcademyDisplayContext(request,env);
      const result=await (['/api/academy/header-date','/api/public/header-date'].includes(path)?(request.method==='GET'?headerDate(request):Response.json({success:false,error:'Use GET.'},{status:405})):path==='/api/academy/entrance/public-snapshot'?publicTimetable(request,env):path==='/api/academy/profile-labels-version'?profileLabelsVersion(request,env):dispatch(request,env));
      if(request.method==='POST'&&hifzSyncChangePath(path)&&hifzSyncEnabled(env)&&ctx?.waitUntil&&!(result instanceof Response)&&result.success)
        ctx.waitUntil(recoverHifzProfiles(env));
      if(request.method==='POST'&&websitePlatformEnabled(env)&&ctx?.waitUntil&&!(result instanceof Response)&&result.success&&(/\/user-profiles\/(save|link|recover)$/.test(path)||['/api/account/logout','/api/account/setup-pin'].includes(path)||/^\/api\/admin\/platform\/(?:program-timetable\/(?:publish|status|manage-save|manage-remove|recover)|programs\/save|courses\/(?:publish|status|studio-resume|register-completed)|calendar\/(?:save|batch-save)|global\/(?:timetable|run)\/)/.test(path)||/program-monthly-subscriptions\/(?:configure|save|grid-save|surah-save|surah-grants-save)$|global\/access\/save$/.test(path)||path==='/api/academy/calendar/save'||path==='/api/admin/platform/programme-studio/register'))ctx.waitUntil(recoverWebsite(env));
      if(result instanceof Response){const mediaHeaders=new Headers(result.headers);for(const name of ['Vary','Access-Control-Allow-Methods','Access-Control-Allow-Headers'])mediaHeaders.set(name,headers[name]);
        mediaHeaders.set('X-Content-Type-Options','nosniff');
        mediaHeaders.delete('Access-Control-Allow-Origin');if(headers['Access-Control-Allow-Origin'])mediaHeaders.set('Access-Control-Allow-Origin',headers['Access-Control-Allow-Origin']);
        return new Response(result.body,{status:result.status,headers:mediaHeaders});}
      return new Response(JSON.stringify(result),{headers});}
    catch(error){if(String(error.message).includes('STUDIO_ACCESS_MANAGED'))error=rehearsalError('Manage this offering through Studio access in Academy Admin. Its old access controls are locked.',409,'STUDIO_ACCESS_MANAGED');const status=Number.isInteger(error.status)?error.status:503;
      const unavailable=status>=500&&status!==501,cardPromotion=error.code==='PLAYLIST_CARD_PROMOTION_PENDING';
      const dailyReadLimit=/exceeded D1.s free tier daily row read limit/i.test(String(error.message));
      const reset=new Date();reset.setUTCHours(24,0,0,0);
      const retryAfterMs=Math.max(1000,reset.getTime()-Date.now());
      if(dailyReadLimit)headers['Retry-After']=String(Math.ceil(retryAfterMs/1000));
      if(status===429)headers['Retry-After']='60';
      if(status===409&&error.code==='ROOT_PIN_CONFIRMATION_REQUIRED')headers['X-UAA-Root-PIN-Required']='1';
      return new Response(JSON.stringify({success:false,error:dailyReadLimit?'Academy access has reached today’s service allowance. Please try again after 00:00 UTC (03:00 Riyadh), or contact an administrator.':cardPromotion?'Artwork publication is incomplete. Retry Publish to finish it.':unavailable?'Academy information is temporarily unavailable. Please try again.':error.message,
        code:dailyReadLimit?'ACADEMY_D1_DAILY_READ_LIMIT':unavailable?(['ANNOUNCEMENT_PUBLICATION_PENDING','ANNOUNCEMENTS_NOT_ACTIVATED','PLAYLIST_CARD_PROMOTION_PENDING','MESSAGING_SCHEMA_REQUIRED','MESSAGING_NOT_ENABLED','ACADEMIC_CALENDAR_SCHEMA_REQUIRED','ACTIVATION_REQUIRED','MANAGEMENT_SCHEMA_REQUIRED','LEARNING_IMPORT_REQUIRED','COURSE_IMPORT_REQUIRED','COURSE_ACCESS_SCHEMA_REQUIRED','COURSE_MANAGEMENT_SCHEMA_REQUIRED','UPLOAD_BRIDGE_REQUIRED','MEMORISATION_SCHEMA_REQUIRED'].includes(error.code)?error.code:'ACADEMY_D1_UNAVAILABLE'):error.code,retryable:unavailable||status===429,...(dailyReadLimit?{retryAfterMs,resetAt:reset.toISOString()}:{}),...(status===429?{retryAfterMs:60000}:{}),
        ...(status===409&&request.headers.get('X-Academy-Workspace')==='ADMIN'?Object.fromEntries(['currentRecord','rowRevision','entryKey'].filter(k=>error[k]!==undefined).map(k=>[k,error[k]])):{} )}),{status,headers});}
  }
};
 // Server-only callback is branded to this exact owning factory closure.
 nativePINVerifiers.set(nativeWorkerInstance,async(env,{uniqueid,pin}={})=>{
  assertLocalIntegrationProfile(env);
  if(env.JWT_LOCAL_CHILD_PIN!=='1'||env.JWT_V110_MASTER!=='1'||env.JWT_V110_NATIVE_COOKIE!=='1')throw rehearsalError('Child PIN verification is unavailable.',503,'CHILD_PIN_UNAVAILABLE');
  let proof;
  const result=await dispatch(new Request('https://ummabbadacademy.app/api/account/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({uniqueid,pin})}),env,{nativePINForJWT:true,nativePINVerificationOnly:true,capture:value=>{proof=value.proof;}});
  if(!result?.success||!proof)throw rehearsalError('Native PIN verification did not finish.',503,'CHILD_PIN_UNAVAILABLE');
  return proof;
 });
 return nativeWorkerInstance;
}
const defaultAcademyWorker=createAcademyWorker();
export default defaultAcademyWorker;
export async function verifyNativePINForChild(env,input={}, {worker=defaultAcademyWorker}={}){
 const verify=nativePINVerifiers.get(worker);
 if(!verify)throw rehearsalError('Native PIN verifier is unavailable.',503,'CHILD_PIN_UNAVAILABLE');
 return verify(env,input);
}



export const ROOT_SENSITIVE_AVAILABILITY_NATIVE_VERSION='ROOT_NATIVE_ADMIN_AVAILABILITY_V1';
