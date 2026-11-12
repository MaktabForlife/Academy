import {buildAcademyCalendarEvents} from '../../lib/academy-calendar.js';
import {calendarRows} from './course-calendar.js';
export function noTeachingCalendarEvents(data,start,end,activityKey='ACADEMY'){
 const calendar=data.calendar.filter(row=>!row.scope_key||row.scope_key==='ACADEMY'||row.scope_key===activityKey).map(row=>({...row,scope_key:'ACADEMY'}));
 return buildAcademyCalendarEvents(calendarRows(calendar,data.suppressions,data.settings||[]),start,end).filter(event=>event.teachingImpact==='NO_TEACHING');
}
export const holidayOnDate=(events,date)=>events.find(event=>event.startDate<=date&&event.endDate>=date);
