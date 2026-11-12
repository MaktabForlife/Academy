import {fail,id,date} from './protocol.mjs';
import {navigationMappings} from './navigation.mjs';
import {nativeJoinTarget} from './native-join.mjs';
import {dashboardStudioSessionId} from './timetable.mjs';
import {lessonTimes,addDays,sunday} from '../../entrance.js';

export function dashboardModes(state){
 if(!state?.account?.active)throw fail('Your Academy session has ended.',401,'SESSION_ENDED');
 const admin=Boolean(state.account.global_admin||state.contexts.some(c=>['GLOBAL_ADMIN','PROGRAM_ADMIN','ADMIN'].includes(c.role)));
 return ['learn',...(state.account.global_admin||state.contexts.some(c=>['TEACHER','SENIOR','SUBSTITUTE'].includes(c.role))?['teach']:[]),...(admin?['admin']:[])];
}
// A verified Global Admin's circle is an oversight view in every presentation.
// Reuse current native Admin authority; never manufacture learner enrolments.
export function dashboardTimetableAudience(state,mode){
 return state.account.global_admin===true||state.account.global_admin===1?'admin':mode;
}
export function dashboardChoice(state,input={}){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['mode','tool','activityKey'].includes(k)))throw fail('Choose an Academy dashboard destination.');
 const mode=input.mode||'learn',tool=input.tool||'home',available=dashboardModes(state);if(!available.includes(mode))throw fail('This dashboard is outside your current permissions.',403);
 const base=mode==='admin'?'/academy/admin/':'/academy/';let context;
 if(input.activityKey){
  const key=id(input.activityKey),activity=state.activities.find(a=>a.activity_key.toUpperCase()===key.toUpperCase()&&a.active&&a.lifecycle==='ACTIVE');
  if(!activity)throw fail('This programme is unavailable.',403);
  const roles=mode==='admin'?['PROGRAM_ADMIN','ADMIN']:mode==='teach'?['TEACHER','SENIOR']:['STUDENT','MEDIA_READER'];
  const programmeContext=selectedRoles=>state.contexts.find(c=>c.scope==='COURSE'&&c.courseId.toUpperCase()===activity.activity_id.toUpperCase()&&selectedRoles.includes(c.role));
  // Global Admin contexts deliberately contain no synthetic per-programme
  // Teacher/Student records. Use the native Admin audience views for inherited
  // authority, keeping the selected Teach/Learn suffix through the connector.
  context=state.account.global_admin?state.contexts.find(c=>c.role==='GLOBAL_ADMIN'):programmeContext(roles)||programmeContext(['PROGRAM_ADMIN','ADMIN']);
  if(!context)throw fail('This programme is outside your selected dashboard.',403);
  if(tool==='participants'&&mode==='admin'&&activity.kind==='PROGRAM')return {context,destination:'/programs/?program='+encodeURIComponent(activity.activity_id)+'&tab=participants&participants=access'};
  if(tool==='media'&&mode==='admin')return {context,destination:'/academy/admin/#administration/media/'+activity.kind+'/'+encodeURIComponent(activity.activity_id)};
  if(!['activity','assessment','planning','attendance','surahs-duas','timetable'].includes(tool)||mode!=='teach'&&['planning','attendance','surahs-duas'].includes(tool))throw fail('This tool is unavailable in the selected dashboard.',403);
  const route=mode==='admin'?tool==='assessment'?'#assessment-admin/':'#activity/':'#activity/';
  const adminAudience=mode!=='admin'&&['GLOBAL_ADMIN','PROGRAM_ADMIN','ADMIN'].includes(context.role),activityBase=adminAudience?'/academy/admin/':base;
  return {context,destination:activityBase+route+activity.kind+'/'+encodeURIComponent(activity.activity_id)+(mode==='admin'?'':'/'+mode)+(tool==='activity'||mode==='admin'?'':'/'+tool)};
 }
 const candidates=mode==='admin'?['GLOBAL_ADMIN','PROGRAM_ADMIN','ADMIN']:mode==='teach'?['TEACHER','SENIOR','SUBSTITUTE']:['STUDENT','MEDIA_READER'];
 context=state.contexts.find(c=>candidates.includes(c.role))||state.contexts[0];if(!context)throw fail('Your Academy session has ended.',401);
 const destinations={home:base+(mode==='admin'?'#administration':'#timetable/'+mode),messages:base+'?circlesTool=messages'+(mode==='admin'?'#administration':'#timetable/'+mode),library:'/academy/library/?workspace='+mode.toUpperCase(),calendar:'/academy/calendar/?view='+mode,progress:mode==='admin'?base+'#progress-admin':mode==='learn'?base+'#progress':null,enrolments:mode==='admin'?'/academy/enrolment/manage/?view=requests':null,curriculum:mode==='admin'?base+'#administration/curriculum':null,access:mode==='admin'?base+'#administration/access':null,users:mode==='admin'?base+'#administration/users':null,assessment:mode==='admin'?base+'#assessment-admin':null,recorder:'/recorder/?academy=1'};
 if(!Object.hasOwn(destinations,tool)||!destinations[tool])throw fail('This tool is unavailable in the selected dashboard.',403);
 return {context,destination:destinations[tool]};
}
const fields=(value,names)=>Object.fromEntries(names.filter(k=>value[k]!==undefined).map(k=>[k,value[k]]));
export function dashboardJoinInput(state,input){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['sourceRef','issuedAt','mode','joinKey','date'].includes(k))||!['learn','teach','admin'].includes(input.mode)||typeof input.joinKey!=='string'||!input.joinKey||input.joinKey.length>1200)throw fail('Refresh the timetable and select a lesson.');
 if(!dashboardModes(state).includes(input.mode))throw fail('This dashboard is outside your current permissions.',403);
 const day=date(input.date);
 return {mode:input.mode,joinKey:input.joinKey,date:day,target:nativeJoinTarget(input.joinKey,day)};
}
function nativeJoinReference(row,nativeScopes){
 // The reference is not authority. A click always resolves it through the
 // unchanged native lesson Join handler, using the current native audience.
 if(row.status!=='SCHEDULED'||row.preview||typeof row.joinKey!=='string'||!row.joinKey||row.joinKey.length>1200||nativeScopes.some(scope=>scope.activity_key.toUpperCase()===(row.kind+':'+row.activityId).toUpperCase()&&['FROZEN','STUDIO'].includes(scope.access_owner)))return {};
 return {nativeJoin:{joinKey:row.joinKey,date:row.sourceDate||row.date}};
}
async function studioJoinReference(row,nativeScopes){
 if(row.status!=='SCHEDULED'||row.preview)return {};
 const scope=nativeScopes.find(scope=>scope.activity_key.toUpperCase()===(row.kind+':'+row.activityId).toUpperCase());
 if(scope?.access_owner!=='STUDIO'||!scope.offering_id)return {};
 const sessionId=await dashboardStudioSessionId(scope.activity_key,row.mediaSessionKey,row.sourceDate||row.date);
 return sessionId?{studioJoin:{offeringId:scope.offering_id,sessionId}}:{};
}
// A civil date selects exactly one native Sunday–Saturday week. The selected
// day is presentation state, never a class grant or a Join clock override.
export function dashboardWeekInput(input={}){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['mode','date','weekStart'].includes(k))||input.date!==undefined&&input.weekStart!==undefined)throw fail('Choose one dashboard date or week.');
 const value=input.date??input.weekStart;if(value===undefined)return null;
 const selectedDate=date(value),weekStart=date(sunday(selectedDate)),weekEnd=date(addDays(weekStart,6));return {selectedDate,weekStart,weekEnd};
}
function trustedMeetingGroup(row,mode){
 return mode==='teach'&&typeof row.meetingGroup==='string'&&/^meeting-[1-9]\d{0,5}$/.test(row.meetingGroup)?{meetingGroup:row.meetingGroup}:{};
}
export async function dashboardSummary(state,env,input,read,nativeScopes=[]){
 const requestedWeek=dashboardWeekInput(input),availableModes=dashboardModes(state),mode=input.mode||(['admin','teach','learn'].find(m=>availableModes.includes(m)));if(!availableModes.includes(mode))throw fail('This dashboard is outside your current permissions.',403);
 const home=await read('/api/academy/entrance',requestedWeek?{startDate:requestedWeek.weekStart}:{},dashboardTimetableAudience(state,mode)),mappings=navigationMappings(env),warnings=[];
 const weekStart=date(home.startDate),weekEnd=date(home.endDate);if(sunday(weekStart)!==weekStart||addDays(weekStart,6)!==weekEnd||requestedWeek&&requestedWeek.weekStart!==weekStart)throw fail('Academy returned a different timetable week.',503);
 const inWeek=row=>typeof row.date==='string'&&row.date>=weekStart&&row.date<=weekEnd;
 // Personal Learn/Teach activity summaries intentionally omit synthetic Admin
 // enrolments. Programme links use exact native mappings and the same current
 // destination guard instead of inferring IDs or roles from those summaries.
 const programmeNavigation=['alimiyah','reboot','arabic-intensive'].flatMap(navigationKey=>{
  const activity=state.activities.find(a=>a.kind==='PROGRAM'&&a.activity_id.toUpperCase()===mappings[navigationKey]?.toUpperCase());
  if(!activity)return [];
  try{dashboardChoice(state,{mode,tool:'activity',activityKey:activity.activity_key});}
  catch(error){if(error.status===403)return [];throw error;}
  return [{navigationKey,activityKey:activity.activity_key}];
 });
 const activities=(home.personalActivities||[]).filter(a=>a.active!==false&&a.lifecycle!=='ARCHIVED'&&a.menuAvailable!==false&&['PROGRAM','COURSE'].includes(a.kind)&&a.roles?.length).slice(0,60).map(a=>({...fields(a,['kind','id','name','roles','substituteOnly','plansRequired']),activityKey:a.kind+':'+a.id,navigationKey:Object.keys(mappings).find(k=>mappings[k].toLowerCase()===a.id.toLowerCase())||null}));
 for(const area of activities){const mapped=nativeScopes.find(s=>s.activity_key.toUpperCase()===area.activityKey.toUpperCase());if(mapped){area.websiteOfferingId=mapped.offering_id;area.websiteKind=mapped.kind;area.accessOwner=mapped.access_owner||'ACADEMY';}}
 const allowed=new Map(activities.map(a=>[a.activityKey.toUpperCase(),a]));
 const personal=(home.personalTimetable||[]).filter(r=>inWeek(r)&&allowed.has((r.kind+':'+r.activityId).toUpperCase()));
 // Public FREE references add no personal roles, class labels or enrolment.
 // Retain future metadata so the existing local clock can open Join at -5min
 // even when this dashboard is reused for twelve hours without a network poll.
 const free=(home.timetable||[]).filter(r=>inWeek(r)&&r.publicJoin===true&&r.status==='SCHEDULED'&&!nativeScopes.some(s=>s.activity_key.toUpperCase()===(r.kind+':'+r.activityId).toUpperCase()&&['STUDIO','FROZEN'].includes(s.access_owner))).map(r=>({...fields(r,['kind','activityId','activityName','date','sourceDate','startTime','endTime','timezone','status','joinKey']),title:r.activityName,...lessonTimes(r)})).filter(r=>Number.isFinite(r.startsAt)&&Number.isFinite(r.endsAt));
 const publicByKey=new Map(free.map(row=>[row.joinKey,row])),personalKeys=new Set(personal.map(row=>row.joinKey));
 const timetable=[...personal.map(row=>row.preview&&publicByKey.has(row.joinKey)?publicByKey.get(row.joinKey):row),...free.filter(row=>!personalKeys.has(row.joinKey))].slice(0,200);
 const optional=async(name,path,body)=>{try{return await read(path,body,mode);}catch(error){if(error.status===401||error.status===403)throw error;warnings.push(name+' could not be checked.');return null;}};
 const sources=[...new Map(timetable.filter(r=>r.mediaSessionKey).map(r=>[JSON.stringify([r.kind,r.activityId,r.sourceDate||r.date,r.mediaSessionKey]),{activityKey:r.kind+':'+r.activityId,date:r.sourceDate||r.date,sessionKey:r.mediaSessionKey}])).values()];
 const [assessments,notes,messages,enrolments]=await Promise.all([
  optional('Upcoming exams','/api/academy/assessments/list',{dashboard:true,summaryVersion:2,view:mode==='admin'?'admin':mode==='teach'?'teacher':'learner'}),
  sources.length?optional('Class notes','/api/academy/class-notes/timetable',{sessions:sources}):{sessions:[]},
  env.ACADEMY_MESSAGING==='1'?optional('Messages','/api/academy/messaging/summary',{}):(warnings.push('Messages are not available from Academy.'),null),
  mode==='admin'?optional('Enrolment requests','/api/admin/platform/enrolment/get',{}):null
 ]);
 const dueNotes=[];for(const session of notes?.sessions||[]){const lesson=timetable.find(r=>JSON.stringify([r.kind+':'+r.activityId,r.sourceDate||r.date,r.mediaSessionKey])===session.ref);if(!lesson||Number(lesson.startsAt)<=Date.now())continue;const source=session.sources?.[0];if(!source||!allowed.has(source.activityKey.toUpperCase()))continue;for(const note of session.dueNotes||[])dueNotes.push({...fields(note,['id','title','date']),activityKey:source.activityKey,activityName:source.activityName});}
 return {mode,availableModes,programmeNavigation,timetableWeekVersion:1,weekStart,weekEnd,selectedDate:requestedWeek?.selectedDate||null,nativeJoinVersion:1,studioJoinVersion:1,freeProgrammeJoinVersion:1,adminBadge:availableModes.includes('admin')?(state.account.global_admin?'Global Admin':'Admin'):null,checkedAt:Date.now(),timezone:home.timezone||'Africa/Johannesburg',startDate:home.startDate,endDate:home.endDate,activities,
  timetable:await Promise.all(timetable.map(async r=>({...fields(r,['kind','activityId','activityName','date','startTime','endTime','startsAt','endsAt','joinAvailableAt','timezone','status','subjectName','moduleName','title']),...trustedMeetingGroup(r,mode),...nativeJoinReference(r,nativeScopes),...await studioJoinReference(r,nativeScopes)}))),
  calendar:(home.calendarEvents||[]).slice(0,100).map(r=>fields(r,['id','title','name','description','date','startDate','endDate','type'])),
  assessments:assessments?(assessments.assessments||[]).filter(r=>allowed.has(r.activityKey?.toUpperCase())&&r.published).slice(0,200).map(r=>fields(r,['activityKey','title','phaseName','registerId','registerStatus','examDate','assessmentKind','availableFrom','dueAt','timezone','published'])):null,
  dueNotes:notes?dueNotes.slice(0,100):null,messages:messages?{counts:messages.counts,notices:messages.notices.map(r=>fields(r,['id','subject','sender','state','issuedAt','unread','requiresAcknowledgement','acknowledgedAt'])),canSend:Boolean(messages.canSend)}:null,
  enrolmentRequests:enrolments?{count:enrolments.requests?.length||0,more:Boolean(enrolments.nextCursor)}:null,warnings};
}
