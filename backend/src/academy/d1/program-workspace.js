import {programWorkspaceAvailable,reviewAvailability} from './teacher-availability.js';
import {teacherDesignations,teacherDirectory} from './teachers.js';
import {managementError,same} from './management-store.js';
import {normalizeZoomLink} from '../../programs/zoom-links.js';
import {payloadHash} from '../../programs/timetable-model.js';
import {normalizeWeeklyDraft,validateWeeklyTimetable,weeklyPattern} from '../../programs/weekly-timetable.js';
import {applyProgramZoom} from './program-zoom.js';

export async function workspaceQueries(repository,activity) {
 if(!await programWorkspaceAvailable(repository))return {};
 const p=(sql,...v)=>repository.db.prepare(sql).bind(...v),staff=await teacherDesignations(repository);
 return {workspaceRecords:p('SELECT * FROM program_timetable_records WHERE activity_key=? ORDER BY updated_at DESC',activity),
 publicationLifecycle:p('SELECT * FROM program_publication_lifecycle WHERE activity_key=?',activity),
 availability:p('SELECT * FROM teacher_availability'),teacherStaff:staff.statement};
}
export function workspaceCatalog(loaded,catalog) {
 if(!loaded.data.workspaceRecords)return catalog;
 const teachers=teacherDirectory({...loaded.data,teachers:loaded.data.teacherStaff}).map(t=>({id:t.accountId,name:t.name,active:true}));
 // Retain current active Program teachers, including inherited administrators.
 return {...catalog,requireTeacher:true,teachers:[...new Map([...catalog.teachers,...teachers].map(t=>[t.id,t])).values()]};
}
export async function workspaceValidation(loaded,draft,catalog,date) {
 draft=applyProgramZoom(draft,loaded.program);
 const validationDraft=draft.planner?{...draft,planner:{...draft.planner,availability:[]}}:draft;
 const result=validateWeeklyTimetable(validationDraft,catalog,loaded.program,date);
 const review=reviewAvailability(draft,catalog,loaded.data.availability);
 result.issues.push(...review.issues);result.warnings=[...(result.warnings||[]),...review.warnings];result.valid&&=!review.issues.length;
 // Incomplete drafts remain shareable, clearly marked as unvalidated. Preview
 // only rows with usable times/days, without treating missing references as valid.
 if(!result.occurrences.length&&draft.rules.length){
   const clock=v=>/^([01]\d|2[0-3]):[0-5]\d$/.test(v);
   const rows=normalizeWeeklyDraft(draft).rules.filter(r=>clock(r.startTime)&&clock(r.endTime)&&r.startTime<r.endTime&&r.weekdays.every(d=>Number.isInteger(d)&&d>=0&&d<=6)).map(r=>{
     const module=catalog.modules.find(m=>m.id===r.moduleId),subject=catalog.subjects.find(s=>s.id===(module?.programSubjectId||r.programSubjectId));
     const teacherIds=[...new Set((r.teacherMode==='NONE'&&!catalog.requireTeacher?[]:r.teacherId?[r.teacherId,...(r.additionalTeacherIds||[])]:r.classIds.map(id=>catalog.classes.find(c=>c.id===id)?.classTeacherId)).filter(Boolean))];
     let zoomLink='';try{zoomLink=normalizeZoomLink(draft.programZoomLink||r.zoomLink||(r.classIds.length===1?catalog.classes.find(c=>c.id===r.classIds[0])?.zoomLink:''));}catch{}
     return {...r,moduleName:module?.name||subject?.name||'Choose Subject / Module',classNames:r.classIds.map(id=>catalog.classes.find(c=>c.id===id)?.name||id),teacherId:teacherIds[0]||'',teacherIds,teacherNames:teacherIds.map(id=>catalog.teachers.find(t=>t.id===id)?.name||id),teacherName:catalog.teachers.find(t=>t.id===teacherIds[0])?.name||'',effectiveZoomLink:zoomLink};
   });result.occurrences=weeklyPattern(rows,draft.breaks||[]);
 }
 result.validationHash=await payloadHash({draft:normalizeWeeklyDraft(draft),catalog,availability:loaded.data.availability});
 return result;
}
export const workspaceId=loaded=>JSON.parse(loaded.viewData.tables.ProgramTimetableState[0]?.DraftJSON||'{}').timetableId||`TT-${loaded.program.id}`;
export function recordStatement(p,loaded,id,draft,status='DRAFT',sourceId=null,publicationId=null,validationHash=null) {
 return p(`INSERT INTO program_timetable_records(timetable_id,activity_key,draft_json,status,source_id,publication_id,validation_hash,updated_at) VALUES(?,?,?,?,?,?,?,?)
 ON CONFLICT(timetable_id) DO UPDATE SET draft_json=excluded.draft_json,status=excluded.status,publication_id=COALESCE(excluded.publication_id,program_timetable_records.publication_id),validation_hash=excluded.validation_hash,updated_at=excluded.updated_at`,id,loaded.a.activity_key,JSON.stringify(draft),status,sourceId,publicationId,validationHash,new Date().toISOString());
}
export function assertWorkspaceDraft(loaded,input) {
 const current=workspaceId(loaded),id=input.draft?.timetableId||current;
 if(id!==current)throw managementError('This timetable changed elsewhere. Reload before saving.',409);
 const record=loaded.data.workspaceRecords.find(r=>r.timetable_id===id);
 if(record&&['ARCHIVED','CANCELLED','PUBLISHED'].includes(record.status))throw managementError('Copy this timetable to create an editable draft.',409);
 return id;
}
export function snapshotDraft(snapshot,id) {
 const grouped=new Map();
 for(const row of snapshot.rules){
  const key=row.sourceRuleId||row.id,existing=grouped.get(key);
  if(existing&&row.assignmentMode==='CLASS'){existing.classIds.push(...row.classIds);continue;}
  grouped.set(key,{id:key,moduleId:row.moduleId||'',programSubjectId:row.programSubjectId||'',teacherId:row.assignmentMode==='CLASS'?'':row.teacherId||'',additionalTeacherIds:row.assignmentMode==='EXPLICIT'?row.teacherIds?.slice(1)||[]:[],classIds:[...row.classIds],weekdays:[...row.weekdays],startTime:row.startTime,endTime:row.endTime,zoomLink:row.zoomLink||''});
 }
 return normalizeWeeklyDraft({...snapshot,timetableId:id,rules:[...grouped.values()]});
}
export function canEditWorkspace(loaded) {
 const record=loaded.data.workspaceRecords?.find(r=>r.timetable_id===workspaceId(loaded));
 return !record||['DRAFT','VALID'].includes(record.status);
}
