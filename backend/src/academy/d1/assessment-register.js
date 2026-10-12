import {cleanText} from './assessment-store.js';
import {managementError as fail} from './management-store.js';
import {statusValidation,requireValidStatus} from './assessment-validation.js';

export const registerStatuses=[['REGISTERED','Registered'],['DRAFT','Draft'],['SCHEDULED','Scheduled'],['SCHEDULE_RELEASED','Schedule released'],['AWAITING_MODERATION','Awaiting moderation'],['APPROVED','Approved'],['PUBLISHED','Published'],['IN_PROGRESS','In progress'],['READY_FOR_ASSESSMENT','Ready for assessment'],['ASSESSED','Assessed'],['MODERATED','Moderated'],['READY_FOR_RELEASE','Ready for release'],['RELEASED','Released'],['COMPLETE','Complete'],['ARCHIVED','Archived'],['CANCELLED','Cancelled']];
const areaRows=(s,id)=>s.p('SELECT activity_key FROM assessment_register_areas WHERE register_id=? ORDER BY activity_key',id).all().then(r=>r.results.map(a=>a.activity_key));
export async function registerRecord(s,id){const row=await s.p('SELECT * FROM assessment_registers WHERE register_id=?',String(id||'')).first();if(!row)throw fail('Assessment register entry not found.',404);return {...row,activityKeys:await areaRows(s,row.register_id)};}
const areaStatement=(s,id,keys)=>s.p('INSERT INTO assessment_register_areas SELECT ?,value FROM json_each(?)',id,JSON.stringify(keys));
export function newRegisterStatements(s,{id,name,keys,classMode='ALL',classActivityKey=null,classId=null,status='REGISTERED',phaseId=null}){
 const now=new Date().toISOString();
 return [s.p('INSERT INTO assessment_registers(register_id,name,class_mode,class_activity_key,class_id,status,legacy_phase_id,created_at,created_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)',id,name,classMode,classActivityKey,classId,status,phaseId,now,s.actor,now),areaStatement(s,id,keys)];
}
export async function legacyRegisterPlan(s,{activityKey,classId,title,phaseId}){
 const phase=phaseId?await s.p('SELECT * FROM assessment_phases WHERE phase_id=?',phaseId).first():null;
 const old=phase?await s.p('SELECT register_id FROM assessment_registers WHERE legacy_phase_id=?',phaseId).first():await s.p("SELECT r.register_id FROM assessment_registers r WHERE r.name=? AND r.class_mode='ONE' AND r.class_activity_key=? AND r.class_id=? AND r.legacy_phase_id IS NULL AND (SELECT count(*) FROM assessment_register_areas a WHERE a.register_id=r.register_id)=1 ORDER BY created_at LIMIT 1",title,activityKey,classId).first();
 if(old)return {id:old.register_id,statements:[]};
 const id=crypto.randomUUID();return {id,statements:newRegisterStatements(s,{id,name:phase?.name||title,keys:[activityKey],classMode:phase?'ALL':'ONE',classActivityKey:phase?null:activityKey,classId:phase?null:classId,status:'SCHEDULED',phaseId:phaseId||null})};
}
export async function requireRegisterClass(s,id,activityKey,classId){
 const r=await registerRecord(s,id);
 if(!r.activityKeys.includes(activityKey)||r.class_mode==='ONE'&&(r.class_activity_key!==activityKey||r.class_id!==classId))throw fail('Choose a class included in this assessment register entry.',403);
 return r;
}
export async function registerList(s,input){
 const classes=await s.classes('admin'),keys=new Set(classes.map(c=>c.activity_key));
 const rows=(await s.p(`SELECT r.*,a.activity_key,a2.name activity_name,a2.kind,c.name class_name FROM assessment_registers r JOIN assessment_register_areas a USING(register_id) JOIN activities a2 USING(activity_key) LEFT JOIN classes c ON c.activity_key=r.class_activity_key AND c.class_id=r.class_id WHERE r.register_id IN(SELECT register_id FROM assessment_register_areas WHERE activity_key IN(SELECT value FROM json_each(?))) ORDER BY r.created_at DESC,r.register_id,a2.name LIMIT 10001`,JSON.stringify([...keys])).all()).results;
 if(rows.length>10000)throw fail('Choose a Program or Course to narrow the assessment register.',409);
 const grouped=new Map();for(const row of rows){if(!grouped.has(row.register_id))grouped.set(row.register_id,{id:row.register_id,name:row.name,status:row.status,revision:row.revision,classMode:row.class_mode,classActivityKey:row.class_activity_key,classId:row.class_id,className:row.class_name||'',areas:[],canEdit:true});const r=grouped.get(row.register_id);r.areas.push({key:row.activity_key,name:row.activity_name,kind:row.kind});if(!keys.has(row.activity_key))r.canEdit=false;}
 const registers=[...grouped.values()].filter(r=>(!input.activityKey||r.areas.some(a=>a.key===input.activityKey))&&(!['PROGRAM','COURSE'].includes(input.kind)||r.areas.some(a=>a.kind===input.kind)));
 return {registers,registerClasses:classes,registerStatuses};
}
async function fields(s,input,current=null){
 const name=cleanText(input.name,160,'an assessment name'),keys=input.activityKeys;
 if(!Array.isArray(keys)||!keys.length||keys.length>50||keys.some(k=>typeof k!=='string')||new Set(keys).size!==keys.length)throw fail('Choose one or more Programs/Courses.');
 const allowed=new Set((await s.classes('admin')).map(c=>c.activity_key));
 if([...keys,...(current?.activityKeys||[])].some(k=>!allowed.has(k)))throw fail('This assessment includes a learning area outside your administration access.',403);
 if(!registerStatuses.some(([key])=>key===input.status))throw fail('Choose a valid assessment status.');
 if(!['ONE','ALL'].includes(input.classMode))throw fail('Choose one class or All classes.');
 const one=input.classMode==='ONE',classKey=one?input.classActivityKey:null,classId=one?input.classId:null;
 if(one){if(!keys.includes(classKey))throw fail('Choose a class in the selected Programs/Courses.');await s.requireClass(classKey,classId,'admin');}
 if(current){
  const rows=(await s.p('SELECT DISTINCT activity_key,class_id FROM assessments WHERE register_id=? AND deleted_at IS NULL',current.register_id).all()).results;
  if(rows.some(r=>!keys.includes(r.activity_key)||one&&(r.activity_key!==classKey||r.class_id!==classId)))throw fail('This selection excludes a class with saved assessment dates. Keep that class included.',409);
 }
 return {name,keys:[...keys].sort(),classMode:input.classMode,classActivityKey:classKey,classId,status:input.status};
}
export async function createRegister(s,input){return s.change('register-create',input,'REGISTER:'+s.actor,async()=>{
 const v=await fields(s,input),id=crypto.randomUUID();
 requireValidStatus(await statusValidation(s,null,v.status));
 return {statements:[...newRegisterStatements(s,{id,...v}),s.event({activity_key:v.keys[0]},'register-create',{registerId:id,name:v.name})],result:{registerId:id}};
});}
export async function saveRegister(s,input){return s.change('register-save',input,String(input.registerId||''),async()=>{
 const r=await registerRecord(s,input.registerId);if(input.revision!==r.revision)throw fail('This assessment register entry changed elsewhere. Refresh before saving.',409,'ROW_CHANGED');
 const v=await fields(s,input,r),now=new Date().toISOString();
 if(v.status!==r.status)requireValidStatus(await statusValidation(s,r.register_id,v.status));
 const statements=[s.p('UPDATE assessment_registers SET name=?,class_mode=?,class_activity_key=?,class_id=?,status=?,revision=revision+1,updated_at=? WHERE register_id=?',v.name,v.classMode,v.classActivityKey,v.classId,v.status,now,r.register_id),s.p('DELETE FROM assessment_register_areas WHERE register_id=?',r.register_id),areaStatement(s,r.register_id,v.keys)];
 if(v.name!==r.name){
  // Rename only shared schedule titles; individual paper names retain their labels.
  statements.push(s.p('UPDATE assessments SET title=?,revision=revision+1,updated_at=? WHERE register_id=? AND title=? AND deleted_at IS NULL',v.name,now,r.register_id,r.name));
 }
 statements.push(s.event({activity_key:v.keys[0]},'register-save',{registerId:r.register_id,previousName:r.name,name:v.name,previousStatus:r.status,status:v.status,activityKeys:v.keys,classMode:v.classMode,classId:v.classId}));
 return {statements,result:{registerId:r.register_id,revision:r.revision+1}};
});}
export async function validateRegister(s,input){
 const r=input.registerId?await registerRecord(s,input.registerId):null;
 if(r&&input.revision!==r.revision)throw fail('This assessment register entry changed elsewhere. Refresh before validating.',409,'ROW_CHANGED');
 const v=await fields(s,input,r);
 return statusValidation(s,r?.register_id,v.status);
}
