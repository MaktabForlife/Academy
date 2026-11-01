// Use the immutable media attachment snapshot, never today's timetable teacher.
export function recordingGroupIdentity(row){
 const sources=JSON.parse(row.source_lessons_json||'[]'),subjects=[...new Set(sources.map(s=>s.moduleId?['module',s.moduleId]:s.programSubjectId?['subject',s.programSubjectId]:s.subjectId?['subject',s.subjectId]:null).filter(Boolean).map(JSON.stringify))].sort();
 const teachers=[...new Set([...JSON.parse(row.teacher_ids_json||'[]'),row.teacher_id].filter(Boolean))].sort();
 const classes=[...new Set([row.class_id,...sources.flatMap(s=>s.classIds||[])].filter(Boolean))].sort();
 const cohorts=[...new Set(sources.flatMap(s=>[...(s.cohortIds||[]),s.cohortId,s.yearId].filter(Boolean)))].sort();
 const stable=subjects.length===1&&teachers.length>0&&classes.length>0;
 return {key:JSON.stringify([row.activity_key,row.run_id||'',classes,cohorts,subjects,teachers,...(stable?[]:[row.lesson_id])]),subjectLabel:sources[0]?.moduleName||sources[0]?.subjectName||row.title||'',subjectIdentity:subjects.length===1?JSON.parse(subjects[0]):null,teacherIds:teachers,classIds:classes,cohortIds:cohorts,complete:stable};
}
