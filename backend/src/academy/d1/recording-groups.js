import {recordedLessonContext} from './lesson-recorded-context.js';
// Group by recorded content, retaining original class/cohort permission anchors.
export function recordingGroupIdentity(row){
 const sources=JSON.parse(row.source_lessons_json||'[]'),context=recordedLessonContext(row),subjects=[...new Set((context?[context.subject]:sources).map(s=>s.surahId?['surah',s.surahId]:s.courseId?['course',s.courseId]:s.moduleId?['module',s.moduleId]:s.programSubjectId?['subject',s.programSubjectId]:s.subjectId?['subject',s.subjectId]:null).filter(Boolean).map(JSON.stringify))].sort();
 const teachers=[...new Set((context?context.teacherIds:[...JSON.parse(row.teacher_ids_json||'[]'),row.teacher_id]).filter(Boolean))].sort();
 const classes=[...new Set([row.class_id,...sources.flatMap(s=>s.classIds||[])].filter(Boolean))].sort();
 const cohorts=[...new Set(sources.flatMap(s=>[...(s.cohortIds||[]),s.cohortId,s.yearId].filter(Boolean)))].sort();
 const stable=subjects.length===1&&teachers.length>0&&(classes.length>0||Boolean(context?.subject.courseId));
 return {key:JSON.stringify([row.activity_key,row.run_id||'',classes,cohorts,subjects,teachers,...(stable?[]:[row.lesson_id])]),subjectLabel:context?.subject.name||sources[0]?.moduleName||sources[0]?.subjectName||row.title||'',subjectIdentity:subjects.length===1?JSON.parse(subjects[0]):null,teacherIds:teachers,classIds:classes,cohortIds:cohorts,complete:stable};
}
