import {learningFixture} from './academy-d1-learning-fixture.mjs';
import {fixtureTab,PROGRAM_IDS} from './academy-migration-fixture.mjs';
import {ATTENDANCE_HEADERS,scheduledLessons,classLesson} from '../../src/programs/attendance-model.js';
import {programToday} from '../../src/programs/weekly-timetable.js';
export const attendanceProgramId=PROGRAM_IDS[0];
export const attendanceDate=()=>programToday('Africa/Johannesburg');
export const previousAttendanceDate=()=>new Date(Date.parse(attendanceDate()+'T12:00:00Z')-86400000).toISOString().slice(0,10);
export function attendanceIntegrationFixture(){
  return learningFixture(snapshot=>{
    const tab=fixtureTab(snapshot,'ProgramManagementState',1),index=tab.rows[0].indexOf('SnapshotJSON'),state=JSON.parse(tab.rows[1][index]);
    state.ProgramClasses[0].Name='Class A';
    state.ProgramClasses.push({...state.ProgramClasses[0],ClassID:'class-shared',Name:'Class B',TeacherAccountID:'account-0004'});
    state.ProgramEnrollments=state.ProgramEnrollments.filter(row=>row.AccountID==='account-0002');
    state.ProgramEnrollments.push({EnrollmentID:'enrollment-shared',CourseID:attendanceProgramId,ClassID:'class-shared',AccountID:'account-0008',Active:true});
    tab.rows[1][index]=JSON.stringify(state);
    const publications=fixtureTab(snapshot,'ProgramTimetablePublications',1),column=publications.rows[0].indexOf('SnapshotJSON'),value=JSON.parse(publications.rows[1][column]),rule=value.rules[0];
    value.rules=[{...rule,id:'RULE-shared',moduleName:'Shared lesson',classIds:['class-1','class-shared'],classNames:['Class A','Class B']},
      {...rule,id:'RULE-second',startTime:'11:00',endTime:'12:00',moduleName:'Second lesson',classIds:['class-1'],classNames:['Class A']}];
    value.breaks=[{id:'BREAK-attendance',label:'Break',weekdays:[0,1,2,3,4,5,6],startTime:'12:00',endTime:'12:15'}];
    publications.rows[1][column]=JSON.stringify(value);
    const record=Object.fromEntries(publications.rows[0].map((name,i)=>[name,publications.rows[1][i]]));
    const lesson=classLesson(scheduledLessons([record],{id:attendanceProgramId},previousAttendanceDate())[0],'class-1','Class A');
    const add=(name,record)=>{const headers=ATTENDANCE_HEADERS[name];snapshot.workbooks[1].tabs.push({title:name,rows:[headers,headers.map(h=>record[h]??'')]});};
    add('ProgramAttendanceRegisters',{RegisterID:'historical-register',CourseID:attendanceProgramId,AttendanceDate:previousAttendanceDate(),PublicationID:lesson.publicationId,LessonAnchor:lesson.anchor,LessonJSON:JSON.stringify(lesson),LearnerCount:1,SubmittedDate:snapshot.completedAt,SubmittedByAccountID:'account-0003',OperationID:'historical-operation'});
    add('ProgramAttendanceMarks',{MarkID:'historical-mark',RegisterID:'historical-register',AccountID:'account-0002',DisplayName:'Original learner name',Status:'ABSENT'});
    for(const book of snapshot.workbooks){book.tabs.forEach((t,i)=>t.sheetId=i);book.inventory=book.tabs.map(t=>({title:t.title,sheetId:t.sheetId}));}
  });
}
