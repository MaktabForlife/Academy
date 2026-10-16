import {managementStore,managementError as fail,same,rowChanged,liveRoles} from './management-store.js';
import {definition} from '../../programs/model.js';
import {payloadHash} from '../../programs/timetable-model.js';
import {readWeeklyDraft,normalizeWeeklyDraft} from '../../programs/weekly-timetable.js';
import {insertRecords} from './insert-records.js';
import {programAccessKey} from './program-access.js';
import {programZoomKey} from './program-zoom.js';

// Copies remain inactive drafts. Optional learner roles and class memberships
// are editable preparation records; activity status gates learner access.
export async function copyProgram(repository,auth,input){
 if(!auth.state.account.global_admin)throw fail('Only a Global Admin can create Programs.',403,'FORBIDDEN');
 if(input.copyEnrollments!==undefined&&typeof input.copyEnrollments!=='boolean')throw fail('Choose whether to copy enrolments.');
 if(typeof input.copySchedule!=='boolean')throw fail('Choose whether to copy schedule settings.');
 const store=managementStore(repository,auth),p=store.p;
 return store.change('PROGRAM_REGISTRY','ACADEMY','copy',input,async()=>{
  const key='PROGRAM:'+String(input.id||''),tables={subjects:'program_subjects',levels:'program_levels',modules:'modules',tasks:'tasks',classes:'classes',classTeachers:'class_teacher_assignments',usage:'academy_module_usage',drafts:'timetable_drafts',memberships:'class_memberships'};
  const data=await store.load(Object.fromEntries(Object.entries(tables).map(([k,t])=>['copy_'+k,p(`SELECT * FROM ${t} WHERE activity_key=?`,key)])));
  const source=data.activities.find(a=>a.kind==='PROGRAM'&&same(a.activity_key,key));if(!source)throw fail('Choose an existing Program.',404);
  if(String(input.revision)!==String(source.revision))throw rowChanged(null,String(source.revision));
  const settings=data.programs.find(s=>same(s.activity_key,key)),config=definition({name:input.name,timezone:settings.timezone,durationYears:settings.duration_years??'',status:'DRAFT'});
  const id='PRG-'+crypto.randomUUID(),activity='PROGRAM:'+id,now=new Date().toISOString(),year=new Intl.DateTimeFormat('en',{timeZone:config.timezone,year:'numeric'}).format(new Date());
  const maps={},records={};
  const mapped=(kind,value)=>value?maps[kind].get(String(value).toUpperCase())||null:null;
  const collect=(kind,pk,prefix,eligible)=>{records[kind]=data['copy_'+kind].filter(r=>r.active&&eligible(r));maps[kind]=new Map(records[kind].map(r=>[String(r[pk]).toUpperCase(),prefix+crypto.randomUUID()]));};
  collect('subjects','program_subject_id','PS-',()=>true);
  collect('levels','level_id','LVL-',r=>mapped('subjects',r.program_subject_id));
  collect('modules','module_id','MOD-',r=>(!r.program_subject_id||mapped('subjects',r.program_subject_id))&&(!r.level_id||mapped('levels',r.level_id)));
  collect('tasks','task_id','TASK-',r=>(!r.program_subject_id||mapped('subjects',r.program_subject_id))&&(!r.module_id||mapped('modules',r.module_id)));
  collect('classes','class_id','CLS-',()=>true);
  const statements=[...insertRecords(p,'activities',[{activity_key:activity,activity_id:id,kind:'PROGRAM',name:config.name,active:0,lifecycle:'DRAFT',website_visible:0,created_at:now,updated_at:now,revision:1}]),
   ...insertRecords(p,'program_settings',[{activity_key:activity,duration_years:config.durationYears||null,timezone:config.timezone,revision:1,public_card_json:settings.public_card_json||'{}'}]),...insertRecords(p,'data_ownership',[repository.ownershipForNewActivity(activity)])];
  for(const [kind,pk]of [['subjects','program_subject_id'],['levels','level_id'],['modules','module_id'],['tasks','task_id'],['classes','class_id']]){
   const rows=records[kind].map(r=>({...r,activity_key:activity,[pk]:mapped(kind,r[pk]),...(kind!=='subjects'&&Object.hasOwn(r,'program_subject_id')?{program_subject_id:mapped('subjects',r.program_subject_id)}:{}),...(Object.hasOwn(r,'level_id')?{level_id:mapped('levels',r.level_id)}:{}),...(Object.hasOwn(r,'module_id')&&kind!=='modules'?{module_id:mapped('modules',r.module_id)}:{}),...(kind==='classes'?{academic_year:year,zoom_link:input.copySchedule?r.zoom_link:null}:{})}));
   statements.push(...insertRecords(p,tables[kind],rows));
  }
  if(!records.classes.length)statements.push(...insertRecords(p,'classes',[{activity_key:activity,class_id:'CLS-'+crypto.randomUUID(),name:config.name.slice(0,140)+' Class '+year,academic_year:year,active:1}]));
  statements.push(...insertRecords(p,'academy_module_usage',data.copy_usage.filter(r=>mapped('modules',r.module_id)).map(r=>({...r,activity_key:activity,module_id:mapped('modules',r.module_id)}))));
  if(input.copyEnrollments){
   const learners=data.accounts.filter(a=>a.active&&liveRoles(data,a.account_id,key).includes('STUDENT')),ids=new Set(learners.map(a=>a.account_id.toUpperCase()));
   statements.push(...insertRecords(p,'role_assignments',learners.map(a=>({assignment_id:crypto.randomUUID(),account_id:a.account_id,activity_key:activity,role:'STUDENT',active:1,review_state:'CONFIRMED',granted_at:now,granted_by_account_id:auth.user.accountid,revision:1}))));
   statements.push(...insertRecords(p,'class_memberships',data.copy_memberships.filter(r=>r.active&&ids.has(r.account_id.toUpperCase())&&mapped('classes',r.class_id)).map(r=>({...r,activity_key:activity,enrollment_id:'ENR-'+crypto.randomUUID(),class_id:mapped('classes',r.class_id)}))));
  }
  const access=data.policies.find(r=>same(r.activity_key,key))?.access_model;
  for(const [setting,value]of [[programAccessKey(activity),access],[programZoomKey(activity),input.copySchedule?settings.program_zoom_link:'']])if(value!==undefined)statements.push(p('INSERT INTO academy_settings(setting_key,setting_value,updated_at,updated_by_account_id) VALUES(?,?,?,?)',setting,value,now,auth.user.accountid));
  if(input.copySchedule){
   statements.push(...insertRecords(p,'class_teacher_assignments',data.copy_classTeachers.filter(r=>mapped('classes',r.class_id)&&data.accounts.some(a=>same(a.account_id,r.account_id)&&a.active)).map(r=>({...r,activity_key:activity,class_id:mapped('classes',r.class_id)}))));
   const current=data.copy_drafts.find(r=>same(r.scope_key,key));
   if(current){
    const original=readWeeklyDraft(JSON.parse(current.draft_json)).draft,timetableId='TT-'+crypto.randomUUID();
    const rules=original.rules.filter(r=>(!r.moduleId||mapped('modules',r.moduleId))&&(!r.programSubjectId||mapped('subjects',r.programSubjectId))&&r.classIds.every(v=>mapped('classes',v))).map(r=>({...r,id:'RULE-'+crypto.randomUUID(),moduleId:mapped('modules',r.moduleId)||'',programSubjectId:mapped('subjects',r.programSubjectId)||'',classIds:r.classIds.map(v=>mapped('classes',v))}));
    const draft=normalizeWeeklyDraft({...original,timetableId,rules,breaks:(original.breaks||[]).map(r=>({...r,id:'BREAK-'+crypto.randomUUID()})),...(original.planner?{planner:{...original.planner,availability:[],periods:original.planner.periods.map(r=>({...r,id:'PERIOD-'+crypto.randomUUID()}))}}:{})});
    const json=JSON.stringify(draft),hash=await payloadHash(draft);
    statements.push(p('INSERT INTO timetable_drafts VALUES(?,?,?,?,?,?,?)',activity,activity,crypto.randomUUID(),1,json,hash,now),p("INSERT INTO program_timetable_records(timetable_id,activity_key,draft_json,status,source_id,updated_at) VALUES(?,?,?,'DRAFT',?,?)",timetableId,activity,json,original.timetableId||null,now));
   }
  }
  return {data,statements,authorityScopes:[source.activity_key,activity],result:{program:{id,name:config.name},message:'Program copied as a separate draft. Review the curriculum, classes and timetable before publishing.'},fields:['ProgramCopy','Curriculum','Classes',...(input.copyEnrollments?['DraftEnrolments']:[]),...(input.copySchedule?['ScheduleTemplate']:[])]};
 });
}
