import {fail,id} from './protocol.mjs';
import {navigationMappings} from './navigation.mjs';

export function dashboardModes(state){
 if(!state?.account?.active)throw fail('Your Academy session has ended.',401,'SESSION_ENDED');
 const admin=Boolean(state.account.global_admin||state.contexts.some(c=>['GLOBAL_ADMIN','PROGRAM_ADMIN','ADMIN'].includes(c.role)));
 return ['learn',...(state.contexts.some(c=>['TEACHER','SENIOR','SUBSTITUTE'].includes(c.role))?['teach']:[]),...(admin?['admin']:[])];
}
export function dashboardChoice(state,input={}){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['mode','tool','activityKey'].includes(k)))throw fail('Choose an Academy dashboard destination.');
 const mode=input.mode||'learn',tool=input.tool||'home',available=dashboardModes(state);if(!available.includes(mode))throw fail('This dashboard is outside your current permissions.',403);
 const base=mode==='admin'?'/academy/admin/':'/academy/';let context;
 if(input.activityKey){
  const key=id(input.activityKey),activity=state.activities.find(a=>a.activity_key.toUpperCase()===key.toUpperCase()&&a.active&&a.lifecycle==='ACTIVE');
  if(!activity)throw fail('This programme is unavailable.',403);
  const roles=mode==='admin'?['PROGRAM_ADMIN','ADMIN']:mode==='teach'?['TEACHER','SENIOR']:['STUDENT','MEDIA_READER'];
  context=state.account.global_admin&&mode==='admin'?state.contexts.find(c=>c.role==='GLOBAL_ADMIN'):state.contexts.find(c=>c.scope==='COURSE'&&c.courseId.toUpperCase()===activity.activity_id.toUpperCase()&&roles.includes(c.role));
  if(!context)throw fail('This programme is outside your selected dashboard.',403);
  if(!['activity','assessment','planning','attendance','surahs-duas','timetable'].includes(tool)||mode!=='teach'&&['planning','attendance','surahs-duas'].includes(tool))throw fail('This tool is unavailable in the selected dashboard.',403);
  const route=mode==='admin'?tool==='assessment'?'#assessment-admin/':'#activity/':'#activity/';
  return {context,destination:base+route+activity.kind+'/'+encodeURIComponent(activity.activity_id)+(mode==='admin'?'':'/'+mode)+(tool==='activity'||mode==='admin'?'':'/'+tool)};
 }
 const candidates=mode==='admin'?['GLOBAL_ADMIN','PROGRAM_ADMIN','ADMIN']:mode==='teach'?['TEACHER','SENIOR','SUBSTITUTE']:['STUDENT','MEDIA_READER'];
 context=state.contexts.find(c=>candidates.includes(c.role))||state.contexts[0];if(!context)throw fail('Your Academy session has ended.',401);
 const destinations={home:base+(mode==='admin'?'#administration':'#timetable/'+mode),messages:base+'?circlesTool=messages'+(mode==='admin'?'#administration':'#timetable/'+mode),library:'/academy/library/',calendar:'/academy/calendar/?view='+mode,progress:mode==='admin'?base+'#progress-admin':mode==='learn'?base+'#progress':null,enrolments:mode==='admin'?'/academy/enrolment/manage/?view=requests':null,recorder:'/recorder/?academy=1'};
 if(!Object.hasOwn(destinations,tool)||!destinations[tool])throw fail('This tool is unavailable in the selected dashboard.',403);
 return {context,destination:destinations[tool]};
}
const fields=(value,names)=>Object.fromEntries(names.filter(k=>value[k]!==undefined).map(k=>[k,value[k]]));
export async function dashboardSummary(state,env,input,read,nativeScopes=[]){
 const availableModes=dashboardModes(state),mode=input.mode||(['admin','teach','learn'].find(m=>availableModes.includes(m)));if(!availableModes.includes(mode))throw fail('This dashboard is outside your current permissions.',403);
 const home=await read('/api/academy/entrance',{},mode),mappings=navigationMappings(env),warnings=[];
 const activities=(home.personalActivities||[]).filter(a=>a.active!==false&&a.lifecycle!=='ARCHIVED'&&a.menuAvailable!==false&&['PROGRAM','COURSE'].includes(a.kind)&&a.roles?.length).slice(0,60).map(a=>({...fields(a,['kind','id','name','roles','substituteOnly','plansRequired']),activityKey:a.kind+':'+a.id,navigationKey:Object.keys(mappings).find(k=>mappings[k].toLowerCase()===a.id.toLowerCase())||null}));
 for(const area of activities){const mapped=nativeScopes.find(s=>s.activity_key.toUpperCase()===area.activityKey.toUpperCase());if(mapped){area.websiteOfferingId=mapped.offering_id;area.websiteKind=mapped.kind;}}
 const allowed=new Map(activities.map(a=>[a.activityKey.toUpperCase(),a]));
 const timetable=(home.personalTimetable||[]).filter(r=>allowed.has((r.kind+':'+r.activityId).toUpperCase())).slice(0,200);
 const optional=async(name,path,body)=>{try{return await read(path,body,mode);}catch(error){if(error.status===401||error.status===403)throw error;warnings.push(name+' could not be checked.');return null;}};
 const sources=[...new Map(timetable.filter(r=>r.mediaSessionKey).map(r=>[JSON.stringify([r.kind,r.activityId,r.sourceDate||r.date,r.mediaSessionKey]),{activityKey:r.kind+':'+r.activityId,date:r.sourceDate||r.date,sessionKey:r.mediaSessionKey}])).values()];
 const [assessments,notes,messages,enrolments]=await Promise.all([
  optional('Upcoming exams','/api/academy/assessments/list',{dashboard:true,summaryVersion:2,view:mode==='admin'?'admin':mode==='teach'?'teacher':'learner'}),
  sources.length?optional('Class notes','/api/academy/class-notes/timetable',{sessions:sources}):{sessions:[]},
  env.ACADEMY_MESSAGING==='1'?optional('Messages','/api/academy/messaging/summary',{}):(warnings.push('Messages are not available from Academy.'),null),
  mode==='admin'?optional('Enrolment requests','/api/admin/platform/enrolment/get',{}):null
 ]);
 const dueNotes=[];for(const session of notes?.sessions||[]){const lesson=timetable.find(r=>JSON.stringify([r.kind+':'+r.activityId,r.sourceDate||r.date,r.mediaSessionKey])===session.ref);if(!lesson||Number(lesson.startsAt)<=Date.now())continue;const source=session.sources?.[0];if(!source||!allowed.has(source.activityKey.toUpperCase()))continue;for(const note of session.dueNotes||[])dueNotes.push({...fields(note,['id','title','date']),activityKey:source.activityKey,activityName:source.activityName});}
 return {mode,availableModes,adminBadge:availableModes.includes('admin')?(state.account.global_admin?'Global Admin':'Admin'):null,checkedAt:Date.now(),timezone:home.timezone||'Africa/Johannesburg',startDate:home.startDate,endDate:home.endDate,activities,
  timetable:timetable.map(r=>fields(r,['kind','activityId','activityName','date','startTime','endTime','startsAt','endsAt','status','subjectName','moduleName','title'])),
  calendar:(home.calendarEvents||[]).slice(0,100).map(r=>fields(r,['id','title','name','description','date','startDate','endDate','type'])),
  assessments:assessments?(assessments.assessments||[]).filter(r=>allowed.has(r.activityKey?.toUpperCase())&&r.published).slice(0,200).map(r=>fields(r,['activityKey','title','phaseName','registerId','registerStatus','examDate','assessmentKind','availableFrom','dueAt','timezone','published'])):null,
  dueNotes:notes?dueNotes.slice(0,100):null,messages:messages?{counts:messages.counts,notices:messages.notices.map(r=>fields(r,['id','subject','sender','state','issuedAt','unread','requiresAcknowledgement','acknowledgedAt'])),canSend:Boolean(messages.canSend)}:null,
  enrolmentRequests:enrolments?{count:enrolments.requests?.length||0,more:Boolean(enrolments.nextCursor)}:null,warnings};
}
