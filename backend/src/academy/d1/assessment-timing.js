import {managementError as fail} from './management-store.js';
import {validDate} from './assessment-store.js';
import {academyDate,appTimezone,localInstant,dayStart,nextDate} from './academy-clock.js';
export const assessmentOperations=repository=>repository.features?.nativeAttendance===true;
const instant=(value,timezone,label)=>{
 if(value===null||value===undefined||value==='')return null;
 if(typeof value!=='string')throw fail('Choose a valid '+label+'.');
 if(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))return localInstant(value.slice(0,10),value.slice(11),timezone);
 if(!/^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/.test(value)||!Number.isFinite(Date.parse(value)))throw fail('Choose a valid '+label+'.');
 return new Date(value).toISOString();
};
export async function timingFields(repository,input,current,defaultTimezone){
 const timezone=current?.timezone||defaultTimezone||await appTimezone(repository),kind=input.assessmentKind||current?.assessment_kind||'EXAM',mode=input.timingMode||current?.timing_mode||'TIMED';
 if(!['EXAM','ASSIGNMENT'].includes(kind)||!['TIMED','UNTIMED'].includes(mode))throw fail('Choose Exam or Assignment and Timed or Untimed.');
 const duration=mode==='UNTIMED'?null:input.durationMinutes??current?.duration_minutes,allowance=mode==='UNTIMED'?null:input.allowanceMinutes??current?.allowance_minutes??15;
 if(mode==='TIMED'&&(!Number.isInteger(duration)||duration<1||duration>1440||!Number.isInteger(allowance)||allowance<0||allowance>1440))throw fail('Enter a writing duration and reading/printing allowance.');
 const date=kind==='EXAM'?input.examDate??current?.exam_date:null;
 if(kind==='EXAM'&&!validDate(date))throw fail('Choose a valid exam date.');
 const opens=kind==='EXAM'?localInstant(date,'03:00',timezone):instant(input.availableFrom??current?.available_from,timezone,'opening time')||new Date().toISOString();
 const due=kind==='ASSIGNMENT'?(input.dueDate?validDate(input.dueDate)?dayStart(nextDate(input.dueDate),timezone):(()=>{throw fail('Choose a valid due date.');})():instant(input.dueAt===undefined?current?.due_at:input.dueAt,timezone,'due time')):null;
 if(due&&due<opens)throw fail('The due date must follow opening.');
 return {kind,mode,duration,allowance,date,timezone,opens,due,cutoff:kind==='EXAM'?dayStart(nextDate(date),timezone):null};
}
export function collectionPolicy(a,collection=null,attempt=null,at=new Date()){
 const kind=a.assessment_kind||'EXAM',mode=a.timing_mode||'TIMED',timezone=a.timezone||'Africa/Johannesburg',timestamp=at.toISOString();
 const opens=a.available_from||(a.exam_date?localInstant(a.exam_date,'03:00',timezone):null),cutoff=kind==='EXAM'?(a.exam_cutoff||dayStart(nextDate(a.exam_date),timezone)):null,due=collection?.effective_due_at||a.due_at||null;
 const deadline=[attempt?.deadline_at,due].filter(Boolean).sort()[0]||null;
 return {kind,mode,timezone,opens,cutoff,due,closedAt:collection?.closed_at||null,revision:collection?.revision||0,deadline,late:Boolean(deadline&&timestamp>=deadline),open:Boolean(opens&&timestamp>=opens&&!collection?.closed_at&&(!cutoff||timestamp<cutoff))};
}
export function readyEligibility(a,counts,collection=null,at=new Date()){
 const policy=collectionPolicy(a,collection,null,at),all=counts.expected>0&&counts.received===counts.expected&&!counts.unchecked&&!counts.replacements;
 const reference=policy.kind==='EXAM'?a.exam_date:policy.due?academyDate(new Date(Date.parse(policy.due)-1),policy.timezone):null;
 const nextDay=Boolean(reference&&academyDate(at,policy.timezone)>reference);
 return {available:all||nextDay,allChecked:all,nextDay,unchecked:Number(counts.unchecked||0)};
}
