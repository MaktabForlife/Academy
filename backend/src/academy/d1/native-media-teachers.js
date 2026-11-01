import {lessonContextRead} from './lesson-context-reads.js';
import {payloadHash} from '../../programs/timetable-model.js';
import {managementError as fail,same} from './management-store.js';
export async function nativeMediaTeachers(db,activityKey,ids){
 const rows=(await lessonContextRead(db,'teachers',activityKey).all()).results;if(rows.length>200)throw fail('Choose a smaller registered Teacher scope.',409,'CONTEXT_OPTIONS_LIMIT');
 const classes=activityKey.startsWith('PROGRAM:')?(await lessonContextRead(db,'classes',activityKey).all()).results.map(c=>({id:c.class_id,name:c.name})):[];if(classes.length>200)throw fail('Choose a smaller native class scope.',409,'CONTEXT_OPTIONS_LIMIT');
 const teachers=rows.map(row=>({id:row.account_id,name:row.display_name}));let selectedTeacherIds=[];
 if(ids!==undefined){if(!Array.isArray(ids)||ids.length<1||ids.length>10||ids.some(id=>typeof id!=='string')||new Set(ids.map(id=>id.toUpperCase())).size!==ids.length)throw fail('Choose one to ten distinct registered Teacher account IDs.');selectedTeacherIds=ids.map(id=>teachers.find(t=>same(t.id,id))?.id);if(selectedTeacherIds.some(id=>!id))throw fail('A recorded Teacher is no longer in the checked native choices.',409,'NATIVE_TEACHER_CHANGED');selectedTeacherIds.sort();}
 return {teachers,classes,selectedTeacherIds,teacherRequired:true,optionsRevision:await payloadHash([activityKey,teachers,classes])};
}
