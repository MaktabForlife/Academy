import {payloadHash} from '../../programs/timetable-model.js';
// Workflow counters and classmates' later releases do not change this definition.
export const reportDefinitionHash=a=>payloadHash({id:a.assessment_id,activity:a.activity_key,classId:a.class_id,title:a.title,subject:a.subject,descriptor:a.subject_descriptor||'',examDate:a.exam_date,kind:a.assessment_kind||'EXAM',mode:a.timing_mode||'TIMED',duration:a.duration_minutes,maximum:a.maximum_mark});
