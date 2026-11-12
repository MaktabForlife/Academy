import {managementError,same} from './management-store.js';
import {managementRowRevision} from '../../programs/management-model.js';
import {payloadHash} from '../../programs/timetable-model.js';
import {storeColumns} from '../separation/columns.js';

// Reference checks stay within the selected Program. Shared catalogue rows are
// never deleted or deactivated by this operation.
export async function curriculumReferenceQueries(db,p,activity){
 const sources={timetable_drafts:['draft_json'],timetable_publications:['snapshot_json'],program_timetable_records:['draft_json'],attendance_registers:['lesson_json'],lesson_media_lessons:['source_lessons_json'],lesson_plans:['draft_json','submitted_json']};
 const split=db.splitGeneration==='SPLIT_V1',tables=new Set(split?[...Object.keys(storeColumns.core),...Object.keys(storeColumns.admin)]:(await db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()).results.map(row=>row.name));
 const queries=Object.fromEntries(Object.entries(sources).filter(([table])=>tables.has(table)).map(([table,fields])=>['remove_'+table,p(`SELECT ${fields.join(',')} FROM ${table} WHERE activity_key=?`,activity)]));
 if(tables.has('lesson_plan_revisions')&&tables.has('lesson_plans'))queries.remove_plan_history=p('SELECT r.content_json FROM lesson_plan_revisions r JOIN lesson_plans l USING(plan_id) WHERE l.activity_key=?',activity);
 if(tables.has('attendance_day_contexts'))queries.remove_native_attendance=p('SELECT c.lesson_json FROM attendance_day_contexts c JOIN attendance_days d USING(day_id) WHERE d.activity_key=?',activity);
 return queries;
}
export function referencesCurriculum(value,id){
 const stack=[value],target=id.toUpperCase();
 while(stack.length){const next=stack.pop();if(typeof next==='string'){if(next.toUpperCase()===target)return true;if(/^[\[{]/.test(next))try{stack.push(JSON.parse(next));}catch{/* Plain text is not a reference. */}}else if(next&&typeof next==='object')stack.push(...Object.values(next));}
 return false;
}
export function usedInProgramLessons(loaded,kind,id){
 const ids=[id,...(kind==='subjects'?loaded.current.snapshot.ProgramModules.filter(row=>same(row.ProgramSubjectID,id)).map(row=>row.ProgramModuleID):[])];
 const history=Object.entries(loaded.data).filter(([key])=>key.startsWith('remove_')||['drafts','publications','workspaceRecords','registers'].includes(key)).map(([,rows])=>rows);
 return ids.some(id=>referencesCurriculum(history,id));
}
export async function removeCurriculumPlan(loaded,input,p,actor){
 const kind=input.kind,spec=kind==='subjects'?{table:'program_subjects',key:'ProgramSubjectID',column:'program_subject_id',rows:'ProgramSubjects'}:kind==='modules'?{table:'modules',key:'ProgramModuleID',column:'module_id',rows:'ProgramModules'}:null;
 if(!spec||typeof input.recordId!=='string'||input.recordId.length>100)throw managementError('Choose a Program subject or module to remove.');
 const snapshot=loaded.current.snapshot,record=snapshot[spec.rows].find(row=>same(row[spec.key],input.recordId));
 if(!record)throw managementError('This entry is no longer in the Program.',404);
 if(await managementRowRevision(record)!==input.baseRowRevision)throw managementError('This Program entry changed elsewhere. Refresh the curriculum before removing it.',409,'ROW_CHANGED');
 if(usedInProgramLessons(loaded,kind,input.recordId))throw managementError('This entry is used in Program lessons. It cannot be removed or made inactive.',409,'CURRICULUM_IN_USE');
 const others=Object.values(snapshot).filter(Array.isArray).flat().filter(row=>row!==record);
 const history=Object.entries(loaded.data).filter(([key])=>key.startsWith('remove_')).map(([,rows])=>rows);
 if(referencesCurriculum([others,loaded.data.resources,history],input.recordId))throw managementError('This entry is used by this Program. Make it inactive instead to preserve its lessons, resources and history.',409,'CURRICULUM_IN_USE');
 const activity=loaded.a.activity_key,statements=[];
 if(kind==='modules'&&loaded.data.moduleUsage)statements.push(p('DELETE FROM academy_module_usage WHERE activity_key=? AND module_id=?',activity,input.recordId));
 statements.push(p(`DELETE FROM ${spec.table} WHERE activity_key=? AND ${spec.column}=?`,activity,input.recordId));
 const next={...snapshot,[spec.rows]:snapshot[spec.rows].filter(row=>row!==record)},revision=crypto.randomUUID();
 statements.push(p(`INSERT INTO management_revisions(activity_key,source_revision,source_sequence,source_snapshot_sha256,modified_at,modified_by_source_id) VALUES(?,?,?,?,?,?) ON CONFLICT(activity_key) DO UPDATE SET source_revision=excluded.source_revision,source_sequence=excluded.source_sequence,source_snapshot_sha256=excluded.source_snapshot_sha256,modified_at=excluded.modified_at,modified_by_source_id=excluded.modified_by_source_id`,activity,revision,loaded.current.sequence+1,await payloadHash(next),new Date().toISOString(),actor));
 return {data:loaded.data,statements,result:{removed:true,kind,recordId:input.recordId,revision},fields:[kind]};
}
