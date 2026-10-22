import {noTeachingCalendarEvents,holidayOnDate} from './calendar-holidays.js';
import {annualFlag,annualKey,annualRevision,hijriYearRows} from './calendar-annual.js';
import {termBreaks} from '../calendar-dates.js';
export {termBreaks} from '../calendar-dates.js';
import {managementStore,managementError,same,liveRoles,rowChanged} from './management-store.js';
import {optionalSchema} from './schema-probe.js';
import {teacherDesignations,teacherDirectory} from './teachers.js';
import {canEditTeacherAvailability,availabilityAuthorityScopes} from './teacher-availability.js';
import {calendarRows} from './course-calendar.js';
import {buildAcademyCalendarEvents,expandAnnualCalendarRows} from '../../lib/academy-calendar.js';
import {availabilityBlocks,exceptionRanges} from '../availability-ranges.js';
import {programToday} from '../../programs/weekly-timetable.js';
import {lessonTimes} from '../entrance.js';
import {administers} from './workspace-access.js';

const validDate=v=>/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T12:00:00Z'))&&new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v;
const add=(date,n)=>new Date(Date.parse(date+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);
const activeProgram=a=>a.kind==='PROGRAM'&&a.active&&a.lifecycle==='ACTIVE';
const canManage=(data,auth,scope)=>auth.state.account.global_admin||scope!=='ACADEMY'&&data.activities.some(a=>same(a.activity_key,scope)&&activeProgram(a))&&liveRoles(data,auth.user.accountid,scope).includes('PROGRAM_ADMIN');
const scopeLabel=(data,key)=>key==='ACADEMY'?'Academy':data.activities.find(a=>same(a.activity_key,key))?.name||'Program';


export function academicCalendar(repository,auth) {
 const store=managementStore(repository,auth),p=store.p;
 async function load(){
  if(!await optionalSchema(repository.db,'SELECT scope_key,calendar_kind,revision FROM academy_calendar_events WHERE 0'))throw managementError('The Academic Calendar needs its database upgrade.',503,'ACADEMIC_CALENDAR_SCHEMA_REQUIRED');
  const teachers=await teacherDesignations(repository);
  return store.load({teachers:teachers.statement,calendar:p('SELECT * FROM academy_calendar_events'),suppressions:p('SELECT * FROM academy_calendar_suppressions'),availability:p('SELECT * FROM teacher_availability'),classes:p('SELECT t.* FROM class_teacher_assignments t JOIN classes c USING(activity_key,class_id) WHERE c.active=1'),drafts:p('SELECT activity_key,draft_json FROM timetable_drafts'),teaching:p('SELECT activity_key,account_id FROM published_lesson_teachers'),settings:p("SELECT * FROM academy_settings WHERE setting_key='PlatformTimezone' OR setting_key LIKE 'AcademyHijriAnnual:%' OR setting_key LIKE 'AcademyHolidayAnnual:%'")});
 }
 function scopes(data){return [{key:'ACADEMY',name:'Academy',editable:Boolean(auth.state.account.global_admin)},...data.activities.filter(a=>activeProgram(a)&&(auth.state.account.global_admin||administers(auth,a.activity_key)||liveRoles(data,auth.user.accountid,a.activity_key).length)).map(a=>({key:a.activity_key,name:a.name,editable:canManage(data,auth,a.activity_key)}))];}
 function eventDTO(data,row){return {id:row.event_id,kind:row.calendar_kind==='REFERENCE'?row.event_type:row.calendar_kind,description:row.description,scopeKey:row.scope_key,scopeName:scopeLabel(data,row.scope_key),startDate:row.start_date,endDate:row.end_date,active:Boolean(row.active),revision:row.revision,annual:row.annual??annualFlag(data.settings,row),annualRevision:annualRevision(data.settings,row),dateRequired:Boolean(row.date_required),editable:canManage(data,auth,row.scope_key),teachingImpact:row.teaching_impact};}
 async function teachingWeek(data,teacherId,scopeKey,year,month,timezone){
  const today=programToday(timezone),anchor=today.startsWith(`${year}-${String(month).padStart(2,'0')}`)?today:`${year}-${String(month).padStart(2,'0')}-01`,start=add(anchor,-((new Date(anchor+'T12:00:00Z').getUTCDay()+6)%7)),end=add(start,6);
  const allowed=data.activities.filter(a=>a.active&&a.lifecycle==='ACTIVE'&&(auth.state.account.global_admin||same(teacherId,auth.user.accountid)||liveRoles(data,auth.user.accountid,a.activity_key).includes('PROGRAM_ADMIN'))).map(a=>a.activity_key);
  const rows=(await p(`SELECT l.*,t.account_id,p.scope_key,p.version_no,p.pattern,p.effective_from,p.effective_until FROM published_lessons l JOIN published_lesson_teachers t USING(activity_key,publication_id,lesson_anchor) JOIN timetable_publications p USING(activity_key,publication_id) JOIN activities a USING(activity_key) LEFT JOIN lesson_lifecycle c ON c.activity_key=l.activity_key AND c.publication_id=l.publication_id AND c.source_session_id=COALESCE(json_extract(l.snapshot_json,'$.sourcesessionid'),l.lesson_anchor) WHERE t.account_id=? AND a.active=1 AND a.lifecycle='ACTIVE' AND l.status='SCHEDULED' AND COALESCE(c.status,'SCHEDULED')='SCHEDULED' AND (p.effective_from IS NULL OR p.effective_from<=?) AND (p.effective_until IS NULL OR p.effective_until>=?) AND NOT EXISTS(SELECT 1 FROM program_publication_lifecycle s WHERE s.activity_key=p.activity_key AND s.publication_id=p.publication_id) AND (p.pattern<>'COURSE' OR EXISTS(SELECT 1 FROM course_run_state s JOIN course_runs r USING(activity_key,run_id) WHERE s.activity_key=p.activity_key AND s.current_publication_id=p.publication_id AND r.active=1))`,teacherId,end,start).all()).results.filter(r=>allowed.includes(r.activity_key)&&(scopeKey==='ACADEMY'||same(r.activity_key,scopeKey)));
  const holidays=new Map([...new Set(rows.map(r=>r.activity_key))].map(key=>[key,noTeachingCalendarEvents(data,start,end,key)]));
  const days=Array.from({length:7},(_,i)=>{const date=add(start,i),weekday=new Date(date+'T12:00:00Z').getUTCDay(),matches=rows.filter(r=>!holidayOnDate(holidays.get(r.activity_key),date)&&(!r.effective_from||r.effective_from<=date)&&(!r.effective_until||r.effective_until>=date)&&(r.lesson_date?r.lesson_date===date:r.weekday===weekday));
   const slots=matches.filter(r=>r.version_no===Math.max(...matches.filter(x=>x.activity_key===r.activity_key&&x.scope_key===r.scope_key).map(x=>x.version_no))).map(r=>lessonTimes({date,startTime:r.start_time,endTime:r.end_time,timezone:r.timezone})).filter(r=>Number.isFinite(r.startsAt)&&Number.isFinite(r.endsAt)).sort((a,b)=>a.startsAt-b.startsAt);
   let total=0,finish=0;for(const s of slots){total+=Math.max(0,s.endsAt-Math.max(s.startsAt,finish));finish=Math.max(finish,s.endsAt);}
   return {date,weekday,minutes:Math.round(total/60000)};
  });return {startDate:start,endDate:end,days,totalMinutes:days.reduce((n,d)=>n+d.minutes,0),displayOnly:true};
 }
 async function get(input){
  const data=await load(),view=['learn','teach'].includes(input.view)?input.view:'admin',management=view==='admin',year=Number(input.year||new Date().getUTCFullYear()),month=Number(input.month||new Date().getUTCMonth()+1);
  if(view==='learn'&&input.teacherId)throw managementError('Teacher availability is available in Teach or Admin.',403,'FORBIDDEN');
  if(!Number.isInteger(year)||year<2025||year>2100||!Number.isInteger(month)||month<1||month>12)throw managementError('Choose a valid calendar month and year.');
  const choices=scopes(data),scopeKey=input.scopeKey||'ACADEMY';if(!choices.some(s=>same(s.key,scopeKey)))throw managementError('This Program calendar is not available to your account.',403,'FORBIDDEN');
  const first=`${year}-01-01`,last=`${year}-12-31`,inYear=e=>e.startDate<=last&&e.endDate>=first;
  const shared=buildAcademyCalendarEvents(calendarRows(data.calendar,data.suppressions,data.settings),first,last).map(e=>{const row=data.calendar.find(r=>r.event_id===e.id);return {...e,kind:row?eventDTO(data,row).kind:e.eventType,scopeKey:'ACADEMY',scopeName:'Academy',revision:row?.revision||0,annual:row?annualFlag(data.settings,row):false,annualRevision:row?annualRevision(data.settings,row):'',editable:Boolean(auth.state.account.global_admin)&&!e.derived,...(e.source==='SA_PUBLIC_HOLIDAY'?{editable:Boolean(auth.state.account.global_admin)}:{})};});
  const localRows=data.calendar.filter(r=>r.active&&same(r.scope_key,scopeKey));
  const local=scopeKey==='ACADEMY'?[]:expandAnnualCalendarRows(localRows.map(r=>({CalendarEventID:r.event_id,EventType:r.event_type,StartDate:r.start_date,EndDate:r.end_date,Annual:r.calendar_kind==='ACADEMY_HOLIDAY'&&annualFlag(data.settings,r)})),first,last).map(projected=>({...eventDTO(data,localRows.find(r=>r.event_id===projected.CalendarEventID)),startDate:projected.StartDate,endDate:projected.EndDate,...(projected.Annual?{baseStartDate:projected.BaseStartDate,baseEndDate:projected.BaseEndDate}:{})})).filter(inYear);
  const academyTerms=shared.filter(e=>e.kind==='TERM'),ownTerms=local.filter(e=>e.kind==='TERM'),terms=ownTerms.length?ownTerms:academyTerms;
  const events=[...shared,...local,...termBreaks(terms,year,ownTerms.length?scopeKey:'ACADEMY')].map(e=>({...e,scopeName:scopeLabel(data,e.scopeKey)}));
  const timezone=data.settings.find(s=>s.setting_key==='PlatformTimezone')?.setting_value||'Africa/Johannesburg',today=programToday(timezone),own=data.accounts.find(a=>same(a.account_id,auth.user.accountid)),selfEditable=canEditTeacherAvailability(data,auth.user.accountid,auth.user.accountid);
  let teachers=view==='learn'?[]:teacherDirectory(data).filter(t=>canEditTeacherAvailability(data,auth.user.accountid,t.accountId));
  if(view!=='learn'&&selfEditable&&!teachers.some(t=>same(t.accountId,own.account_id)))teachers.unshift({accountId:own.account_id,name:own.display_name});
  if(view==='teach'&&!teachers.length&&administers(auth,scopeKey))teachers=[{accountId:own.account_id,name:own.display_name}];
  if(view==='teach')teachers=teachers.filter(t=>same(t.accountId,auth.user.accountid));
  const allTerms=data.calendar.filter(r=>r.active&&(r.calendar_kind==='TERM'||r.calendar_kind==='REFERENCE'&&r.event_type==='TERM')).map(r=>eventDTO(data,r)),currentYear=today.slice(0,4),ownCurrentTerms=scopeKey==='ACADEMY'?[]:allTerms.filter(t=>same(t.scopeKey,scopeKey)&&t.startDate<=currentYear+'-12-31'&&t.endDate>=currentYear+'-01-01'),currentTerms=(ownCurrentTerms.length?ownCurrentTerms:allTerms.filter(t=>t.scopeKey==='ACADEMY')).filter(t=>t.startDate<=today&&t.endDate>=today);
  if(view==='teach'&&input.teacherId&&!same(input.teacherId,auth.user.accountid))throw managementError('Open Admin Calendar to edit another teacher’s availability.',403,'FORBIDDEN');
  const teacherId=view==='learn'?'':view==='teach'?teachers[0]?.accountId||'':input.teacherId!==undefined?input.teacherId:teachers.find(t=>same(t.accountId,auth.user.accountid))?.accountId||'';
  if(teacherId&&!teachers.some(t=>same(t.accountId,teacherId)))throw managementError('You may view only your own availability or teachers you administer.',403,'FORBIDDEN');
  const entry=data.availability.find(a=>same(a.account_id,teacherId)),ranges=entry?JSON.parse(entry.ranges_json):[];
  const forView=rows=>management?rows:rows.map(row=>({...row,editable:false}));
  return {year,month,today,view,scopes:management?choices:choices.filter(c=>same(c.key,scopeKey)).map(c=>({...c,editable:false})),scopeKey,events:forView(events.sort((a,b)=>a.startDate.localeCompare(b.startDate))),terms:forView(terms),currentTerms:forView(currentTerms),hijriEntries:management&&auth.state.account.global_admin?hijriYearRows(data.calendar,data.settings,year).map(row=>eventDTO(data,row)):[],teachers,teacherId,
   availability:teacherId?{accountId:teacherId,ranges,revision:entry?.revision||0,editable:management&&Boolean(auth.state.account.global_admin||availabilityAuthorityScopes(data,auth.user.accountid,teacherId).length),legacyHours:ranges.length>0&&!exceptionRanges(ranges),blocks:Array.from({length:new Date(Date.UTC(year,month,0)).getUTCDate()},(_,i)=>`${year}-${String(month).padStart(2,'0')}-${String(i+1).padStart(2,'0')}`).flatMap(date=>availabilityBlocks(ranges,date).map(r=>({...r,date})))}:null,
   teachingWeek:teacherId?await teachingWeek(data,teacherId,scopeKey,year,month,timezone):null,canManageAcademy:management&&Boolean(auth.state.account.global_admin)};
 }
 async function save(input){return store.change('ACADEMY_CALENDAR',input.entry?.scopeKey||'ACADEMY','save',input,async()=>{
  const data=await load(),entry=input.entry;
  if(!entry||typeof entry!=='object'||Array.isArray(entry))throw managementError('Enter calendar details.');
  const existing=entry.id?data.calendar.find(r=>same(r.event_id,entry.id)):null,generated=/^SA-PUBLIC-HOLIDAY-(\d{4}-\d{2}-\d{2})$/.exec(entry.id||'');
  if(entry.id&&!existing&&!generated)throw managementError('This calendar entry is unavailable.',404);
  const scopeKey=existing?.scope_key||entry.scopeKey||'ACADEMY';
  if(scopeKey!=='ACADEMY'&&!data.activities.some(a=>same(a.activity_key,scopeKey)&&activeProgram(a)))throw managementError('Choose an active Program calendar.');
  if(!canManage(data,auth,scopeKey)||entry.scopeKey&&entry.scopeKey!==scopeKey)throw managementError('You may manage only calendar entries within your authorised scope.',403,'FORBIDDEN');
  const kind=existing?.calendar_kind==='REFERENCE'?existing.event_type:existing?.calendar_kind||entry.kind;
  if(!['TERM','ACADEMY_HOLIDAY','PUBLIC_HOLIDAY','ISLAMIC_DAY'].includes(kind)||generated&&kind!=='PUBLIC_HOLIDAY'||scopeKey!=='ACADEMY'&&kind!=='TERM'&&kind!=='ACADEMY_HOLIDAY')throw managementError('Choose a term or holiday in your authorised calendar.');
  if(input.revision!==(existing?.revision||0))throw rowChanged(existing?eventDTO(data,existing):null,String(existing?.revision||0));
  const description=String(entry.description||'').trim(),startDate=String(entry.startDate||''),endDate=['PUBLIC_HOLIDAY','ISLAMIC_DAY'].includes(kind)?startDate:String(entry.endDate||startDate),active=entry.active!==false;
  if(entry.annual!==undefined&&typeof entry.annual!=='boolean'||entry.annual&&!['ACADEMY_HOLIDAY','ISLAMIC_DAY'].includes(kind))throw managementError('Annual is available for Academy holidays and Hijri labels.');
  if(existing&&entry.annualRevision!==undefined&&entry.annualRevision!==annualRevision(data.settings,existing))throw managementError('This annual label changed. Refresh before saving your entry.',409,'ROW_CHANGED');
  const annual=entry.annual??(existing?annualFlag(data.settings,existing):false),year=Number(entry.calendarYear),pendingYear=existing&&kind==='ISLAMIC_DAY'&&!startDate&&Number.isInteger(year)&&year!==Number(existing.start_date.slice(0,4));
  const annualStatement=(row,enabled)=>p('INSERT INTO academy_settings(setting_key,setting_value,updated_at,updated_by_account_id) VALUES(?,?,?,?) ON CONFLICT(setting_key) DO UPDATE SET setting_value=excluded.setting_value,updated_at=excluded.updated_at,updated_by_account_id=excluded.updated_by_account_id',annualKey(row),enabled?'1':'0',new Date().toISOString(),auth.user.accountid);
  if(pendingYear&&!active)return {data,statements:[annualStatement(existing,false)],result:{event:null,removed:true},fields:['AnnualLabel'],authorityScopes:[scopeKey]};
  if(!description||description.length>400||!validDate(startDate)||!validDate(endDate)||endDate<startDate)throw managementError('Enter a description and valid calendar dates in order.');
  if(annual&&kind==='ACADEMY_HOLIDAY'&&Date.parse(endDate)-Date.parse(startDate)>=366*86400000)throw managementError('An annual holiday must be shorter than a year.');
  if(kind==='TERM'&&active&&data.calendar.some(r=>r.active&&r.event_id!==existing?.event_id&&same(r.scope_key,scopeKey)&&(r.calendar_kind==='TERM'||r.calendar_kind==='REFERENCE'&&r.event_type==='TERM')&&r.start_date<=endDate&&r.end_date>=startDate))throw managementError('Terms in the same calendar cannot overlap.');
  if(!existing&&!generated&&!active)throw managementError('A new calendar entry must be active.');
  const statements=[],oldHoliday=generated?.[1]||kind==='PUBLIC_HOLIDAY'&&existing?.start_date;
  if(oldHoliday&&(!active||oldHoliday!==startDate))statements.push(p('INSERT OR IGNORE INTO academy_calendar_suppressions(calendar_date) VALUES(?)',oldHoliday));
  let result=null;
  if(!generated||active){
   const newYear=existing&&kind==='ISLAMIC_DAY'&&(annual||annualFlag(data.settings,existing))&&Number(startDate.slice(0,4))!==Number(existing.start_date.slice(0,4));
   if(newYear&&data.calendar.some(r=>r.active&&r.event_type==='ISLAMIC_DAY'&&r.description.toLocaleLowerCase()===description.toLocaleLowerCase()&&r.start_date.startsWith(startDate.slice(0,4)+'-')))throw managementError('This Hijri label already has a date for that year. Refresh and edit its saved entry.',409,'ROW_CHANGED');
   const id=!newYear&&existing?.event_id||'ACEVT-'+crypto.randomUUID(),revision=newYear?1:(existing?.revision||0)+1;
   const eventType=kind==='ACADEMY_HOLIDAY'?'TERM':kind,impact=kind==='PUBLIC_HOLIDAY'||kind==='ACADEMY_HOLIDAY'?'NO_TEACHING':'INFORMATION';
   statements.push(p(`INSERT INTO academy_calendar_events(event_id,event_type,description,start_date,end_date,alternate_date,teaching_impact,active,scope_key,calendar_kind,revision) VALUES(?,?,?,?,?,NULL,?,?,?,?,?) ON CONFLICT(event_id) DO UPDATE SET description=excluded.description,start_date=excluded.start_date,end_date=excluded.end_date,teaching_impact=excluded.teaching_impact,active=excluded.active,revision=excluded.revision`,id,eventType,description,startDate,endDate,impact,Number(active),scopeKey,kind==='ISLAMIC_DAY'?'REFERENCE':kind,revision));
   if(['ISLAMIC_DAY','ACADEMY_HOLIDAY'].includes(kind)){statements.push(annualStatement({event_id:id,event_type:kind==='ISLAMIC_DAY'?'ISLAMIC_DAY':'TERM',description},annual&&active));if(kind==='ISLAMIC_DAY'&&existing&&existing.description!==description)statements.push(annualStatement(existing,false));}
   result={id,kind,description,startDate,endDate,scopeKey,active,revision,annual};
  }
  return {data,statements,result:{event:result,removed:!active},fields:['CalendarEntry'],authorityScopes:[scopeKey]};
 });}
 return {async run(action,input={}){if(action==='get')return get(input);if(action==='save')return save(input);throw managementError('Calendar action not found.',404);}};
}
