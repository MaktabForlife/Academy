// An Admin correction describes one recording, never its permission audience.
// The original timetable identity and teacher columns remain untouched.
export function recordedLessonContext(row){
 const sources=JSON.parse(row.source_lessons_json||'[]'),value=sources[0]?.recordedContext;
 return value?.schema==='RECORDED_LESSON_CONTEXT_V1'?value:null;
}
export function recordedTeacherName(row){return recordedLessonContext(row)?.teacherName??row.teacher_name;}
