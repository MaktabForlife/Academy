import {recordedOptionsSQL,recordedTeacherIdsSQL} from '../d1/lesson-recorded-options.js';
export const recordedLimit=name=>['program_subjects','subject_catalog','modules','program_levels'].includes(name)?401:201;
export function recordedSelection(sqls,scopes){
 if(!scopes?.some(Boolean)){if(sqls.some(sql=>recordedOptionsSQL.includes(sql)))throw Object.assign(Error('Missing recorded-context read scope.'),{status:400,code:'CONTEXT_SCOPE_INVALID'});return null;}
 const key=scopes[0]?.activityKey;
 if(sqls.length!==recordedOptionsSQL.length||typeof key!=='string'||!/^PROGRAM:[^:]{1,192}$/.test(key)||sqls.some((sql,i)=>sql!==recordedOptionsSQL[i]||scopes[i]?.activityKey!==key||scopes[i]?.params?.length!==1||scopes[i].params[0]!==key))throw Object.assign(Error('Invalid recorded-context read.'),{status:400,code:'CONTEXT_SCOPE_INVALID'});
 return key;
}
export function recordedFilter(name,selection){
 const limit=recordedLimit(name),key=selection.activityKey;let where,params=[key];
 if(['program_subjects','modules','program_levels'].includes(name))where='activity_key=?';
 else if(name==='subject_catalog'){where='subject_key IN(SELECT value FROM json_each(?))';params=[JSON.stringify(selection.subjectKeys)];}
 else if(name==='effective_activity_roles')where="activity_key=? AND role='TEACHER'";
 else if(name==='accounts')where=`account_id IN(${recordedTeacherIdsSQL}) AND active=1`;
 else if(name==='academy_teacher_designations'){where='active=1';params=[];}
 else throw Object.assign(Error('Unsupported recorded-context table.'),{status:400,code:'CONTEXT_SCOPE_INVALID'});
 return {where:' WHERE '+where+' LIMIT '+limit,params};
}
// Only an authenticated current Admin for this exact programme can use the
// recipe. Scope metadata cannot confer authority or select arbitrary SQL.
export function authorizeRecordedRead(statements,proof,owner){
 const scope=recordedSelection(statements.map(s=>s.sql),statements.map(s=>s.recordedContextScope?{activityKey:s.recordedContextScope,params:s.params}:null));
 if(!scope)return;
 let signature;try{signature=JSON.parse(proof.signature);}catch{}
 if(owner!=='admin'||!signature||!signature[0]&&!signature[1]?.includes(scope.toUpperCase()+'|PROGRAM_ADMIN'))throw Object.assign(Error('This recording correction is outside your Admin scope.'),{status:403,code:'MEDIA_FORBIDDEN'});
}
