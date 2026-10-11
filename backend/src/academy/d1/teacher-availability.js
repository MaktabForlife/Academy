import {managementStore,managementError,same,liveRoles,rowChanged} from './management-store.js';
import {optionalSchema} from './schema-probe.js';
import {normalizePlanner,TIMETABLE_TIMEZONE} from '../../programs/weekly-timetable.js';
import {teacherDesignations,eligibleTeacher} from './teachers.js';

export const programWorkspaceAvailable=repository=>optionalSchema(repository.db,'SELECT timetable_id FROM program_timetable_records WHERE 0');
export function teacherActivityKeys(data,accountId,includePublished=true){
 const keys=new Set(data.roles.filter(r=>same(r.account_id,accountId)&&r.role==='TEACHER'&&r.active&&r.review_state==='CONFIRMED').map(r=>r.activity_key));
 for(const r of [...(data.classes||[]),...(includePublished?data.teaching||[]:[])])if(same(r.account_id,accountId))keys.add(r.activity_key);
 for(const r of data.drafts||[])if(JSON.parse(r.draft_json).rules?.some(rule=>same(rule.teacherId,accountId)||rule.additionalTeacherIds?.some(id=>same(id,accountId))))keys.add(r.activity_key);
 return keys;
}
const globalAdmin=(data,actor)=>data.admins.some(g=>same(g.account_id,actor)&&g.role==='GLOBAL_ADMIN'&&g.active&&g.review_state==='CONFIRMED');
export function availabilityAuthorityScopes(data,actor,teacher){
 const assigned=teacherActivityKeys(data,teacher,false);
 return data.activities.filter(a=>a.active&&a.lifecycle==='ACTIVE'&&assigned.has(a.activity_key)&&liveRoles(data,actor,a.activity_key).includes('PROGRAM_ADMIN')).map(a=>a.activity_key);
}
export const canEditTeacherAvailability=(data,actor,teacher)=>eligibleTeacher(data,teacher)&&(same(actor,teacher)||globalAdmin(data,actor)||availabilityAuthorityScopes(data,actor,teacher).length>0);
export function reviewAvailability(draft,catalog,availability=[]) {
 const issues=[],warnings=[];
 for(const row of draft.rules) {
  const classes=row.classIds.map(id=>catalog.classes.find(c=>c.id===id));
  const ids=row.teacherMode==='NONE'&&!catalog.requireTeacher?[]:row.teacherId?[row.teacherId,...(row.additionalTeacherIds||[])]:classes.map(c=>c?.classTeacherId).filter(Boolean);
  for(const teacherId of new Set(ids)) {
   const entry=availability.find(a=>same(a.account_id,teacherId)),name=catalog.teachers.find(t=>same(t.id,teacherId))?.name||teacherId;
   if(!entry)continue;
   const ranges=JSON.parse(entry.ranges_json);if(!ranges.length)continue;
   for(const day of row.weekdays)if(!ranges.some(a=>a.weekday===day&&a.startTime<=row.startTime&&a.endTime>=row.endTime))issues.push({rowId:row.id,field:'teacherId',message:`${name} is unavailable for the full session on ${['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][day]}.`});
  }
 }
 return {issues,warnings};
}
export async function teacherAvailability(repository,auth,action,input) {
 const store=managementStore(repository,auth),p=store.p;
 if(!await programWorkspaceAvailable(repository))throw managementError('Teacher calendars need the Program workspace database upgrade.',503,'PROGRAM_WORKSPACE_SCHEMA_REQUIRED');
 if(input.accountId!==undefined&&(typeof input.accountId!=='string'||!input.accountId.trim()||input.accountId.length>128))throw managementError('Choose a teacher.');
 const accountId=input.accountId?.trim()||auth.user.accountid,designations=await teacherDesignations(repository);
 const load=()=>store.load({teachers:designations.statement,availability:p('SELECT * FROM teacher_availability WHERE account_id=?',accountId),classes:p('SELECT t.* FROM class_teacher_assignments t JOIN classes c USING(activity_key,class_id) WHERE c.active=1'),drafts:p('SELECT activity_key,draft_json FROM timetable_drafts'),teaching:p('SELECT activity_key,account_id FROM published_lesson_teachers'),notices:p(`SELECT c.change_id,c.account_id,c.changed_at,c.ranges_json,a.display_name FROM teacher_availability_notices n JOIN teacher_availability_changes c USING(change_id) JOIN accounts a ON a.account_id=c.account_id WHERE n.account_id=? ORDER BY c.changed_at DESC LIMIT 30`,auth.user.accountid)});
 const dto=data=>({accountId:data.accounts.find(a=>same(a.account_id,accountId))?.account_id||accountId,teacherName:data.accounts.find(a=>same(a.account_id,accountId))?.display_name||'',available:canEditTeacherAvailability(data,auth.user.accountid,accountId),timezone:TIMETABLE_TIMEZONE,revision:data.availability[0]?.revision||0,ranges:data.availability[0]?JSON.parse(data.availability[0].ranges_json):[],configured:Boolean(data.availability[0]),notices:data.notices.map(n=>({id:n.change_id,teacher:n.display_name,changedAt:n.changed_at,ranges:JSON.parse(n.ranges_json)}))});
 const requireEdit=data=>{if(!canEditTeacherAvailability(data,auth.user.accountid,accountId))throw managementError('You may edit your own teaching availability, or teachers in learning areas you administer.',403,'FORBIDDEN');};
 if(action==='get'){const data=await load();if(!same(accountId,auth.user.accountid))requireEdit(data);return dto(data);}
 if(action!=='save')throw managementError('Unknown availability action.',404);
 return store.change('TEACHER_AVAILABILITY','ACADEMY','save',input,async()=>{
  const data=await load();requireEdit(data);
  const current=data.availability[0];if(input.revision!==(current?.revision||0))throw rowChanged(dto(data),String(current?.revision||0));
  if(!Array.isArray(input.ranges)||input.ranges.length>70)throw managementError('Use at most 70 teaching availability ranges.');
  const ranges=normalizePlanner({availability:input.ranges.map(r=>({...r,teacherId:accountId}))}).availability.map(({teacherId,...r})=>r);
  const json=JSON.stringify(ranges),previous=current?.ranges_json||'[]',at=new Date().toISOString(),changeId=crypto.randomUUID();
  const relevant=teacherActivityKeys(data,accountId);
  const recipients=data.accounts.filter(a=>a.active&&(data.admins.some(g=>same(g.account_id,a.account_id)&&g.role==='GLOBAL_ADMIN'&&g.active&&g.review_state==='CONFIRMED')||[...relevant].some(key=>liveRoles(data,a.account_id,key).includes('PROGRAM_ADMIN'))));
  const statements=[p('INSERT INTO teacher_availability VALUES(?,?,?,?) ON CONFLICT(account_id) DO UPDATE SET ranges_json=excluded.ranges_json,revision=excluded.revision,updated_at=excluded.updated_at',accountId,json,(current?.revision||0)+1,at)];
  if(json!==previous||!current){statements.push(p('INSERT INTO teacher_availability_changes VALUES(?,?,?,?,?)',changeId,accountId,previous,json,at),...recipients.map(a=>p('INSERT INTO teacher_availability_notices VALUES(?,?)',a.account_id,changeId)));}
  return {data,statements,result:{...dto(data),configured:true,ranges,revision:(current?.revision||0)+1,notified:recipients.length},fields:['TeachingAvailability'],authorityScopes:same(accountId,auth.user.accountid)||globalAdmin(data,auth.user.accountid)?['ACADEMY']:availabilityAuthorityScopes(data,auth.user.accountid,accountId)};
 });
}
