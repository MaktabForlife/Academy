import {recordedTeacherIdsSQL} from '../d1/lesson-recorded-options.js';
import {lessonContextSQL} from '../d1/lesson-context-reads.js';
const invalid=()=>{throw Object.assign(Error('Invalid lesson-context read scope.'),{status:400,code:'CONTEXT_SCOPE_INVALID'});};
const area=value=>typeof value==='string'&&/^(PROGRAM|COURSE):[^:]{1,192}$/.test(value);
const lesson=value=>typeof value==='string'&&value.length>0&&value.length<=200;
const operation=value=>typeof value==='string'&&/^[a-f0-9-]{36}$/i.test(value);
const specs={teachers:[area],classes:[area],surahs:[area],schema:[],enabled:[],area:[lesson],activity:[area],lesson:[lesson,area],policy:[area],receipt:[area,operation]};
// Internal metadata cannot select arbitrary tables/predicates. Current authority
// is established by engine.read before this exact-template comparison and again
// after capture. No recipe changes the guarded write plan or receipt semantics.
export function lessonContextSelection(statements,proof,owner){
 if(!statements.some(s=>s.lessonContextRead)){if(statements.some(s=>Object.values(lessonContextSQL).includes(s.sql)))invalid();return null;}
 if(owner!=='admin'||statements.length!==1)invalid();
 const statement=statements[0],hint=statement.lessonContextRead,{kind,values}=hint||{},validators=specs[kind];
 if(!hint||typeof hint!=='object'||Array.isArray(hint)||Object.keys(hint).sort().join(',')!=='kind,values'||!Object.hasOwn(specs,kind)||!validators||statement.sql!==lessonContextSQL[kind]||!Array.isArray(values)||!Array.isArray(statement.params)||values.length!==validators.length||statement.params.length!==values.length||values.some((v,i)=>!validators[i](v)||statement.params[i]!==v)||statement.acceptedScope||statement.recordedContextScope)invalid();
 let signature;try{signature=JSON.parse(proof.signature);}catch{invalid();}
 const global=signature?.[0]===true,scopes=signature?.[1]?.filter(r=>r.endsWith('|PROGRAM_ADMIN')).map(r=>r.slice(0,-14))||[],scope=kind==='lesson'?values[1]:['activity','policy','receipt','classes','surahs','teachers'].includes(kind)?values[0]:null;
 if(!global&&(!scopes.length||scope&&!scopes.includes(scope.toUpperCase())))throw Object.assign(Error('This recording correction is outside your Admin scope.'),{status:403,code:'MEDIA_FORBIDDEN'});
 return {kind,values,scope,global,scopes,classIds:[]};
}
export function lessonContextFilter(name,selection){
 const {kind,values,classIds}=selection;
 if(kind==='teachers'&&name==='effective_activity_roles')return {where:" WHERE activity_key=? AND role='TEACHER' LIMIT 201",params:values,limit:200};
 if(kind==='teachers'&&name==='academy_teacher_designations')return {where:' WHERE active=1 LIMIT 201',params:[],limit:200};
 if(kind==='teachers'&&name==='accounts')return {where:` WHERE account_id IN(${recordedTeacherIdsSQL}) AND active=1 LIMIT 201`,params:values,limit:200};
 if(kind==='classes'&&name==='classes')return {where:' WHERE activity_key=? LIMIT 201',params:values,limit:200};
 if(kind==='surahs'&&name==='program_surahs')return {where:' WHERE activity_key=? LIMIT 201',params:values,limit:200};
 if(kind==='schema'&&['lesson_media_lessons','lesson_media_assets'].includes(name))return {where:' WHERE 0',params:[],limit:0};
 if(kind==='enabled'&&name==='academy_settings')return {where:" WHERE setting_key='LessonMediaEnabled'",params:[],limit:1};
 if(kind==='area'&&name==='lesson_media_lessons')return {where:' WHERE lesson_id=?',params:values,limit:1};
 if(kind==='activity'&&name==='activities')return {where:' WHERE activity_key=?',params:values,limit:1};
 if(kind==='lesson'&&name==='lesson_media_lessons')return {where:' WHERE lesson_id=? AND activity_key=?',params:values,limit:1};
 if(kind==='lesson'&&name==='classes')return {where:' WHERE activity_key=? AND class_id IN(SELECT value FROM json_each(?))',params:[values[1],JSON.stringify(classIds)],limit:2};
 if(kind==='policy'&&name==='program_monthly_media_policies')return {where:' WHERE activity_key=?',params:values,limit:1};
 if(kind==='receipt'&&name==='operation_receipts')return {where:" WHERE dataset_key='LESSON_MEDIA' AND scope_key=? AND operation_id=?",params:values,limit:1};
 invalid();
}

// The area lookup resolves one unknown lesson ID before the exact area can be
// authorised. Check both owners and expose no out-of-scope row or label.
export function validateLessonContextCapture(data,selection){
 if(!selection||selection.kind!=='area'||selection.global)return;
 const rows=[...(data.__splitSources?.core.lesson_media_lessons||[]),...(data.__splitSources?.admin.lesson_media_lessons||[])];
 if(rows.some(row=>!selection.scopes.includes(row.activity_key.toUpperCase())))throw Object.assign(Error('This recording correction is outside your Admin scope.'),{status:403,code:'MEDIA_FORBIDDEN'});
}
