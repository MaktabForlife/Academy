import {rehearsalError as fail} from './repository.js';
export const nextDate=(date,days=1)=>new Date(Date.parse(date+'T12:00:00Z')+days*86400000).toISOString().slice(0,10);
const parts=(instant,timezone)=>Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(instant)).map(p=>[p.type,p.value]));
export function academyDate(instant,timezone){const p=parts(instant,timezone);return `${p.year}-${p.month}-${p.day}`;}
export function localInstant(date,time,timezone){
 const [year,month,day]=date.split('-').map(Number),[hour,minute]=time.split(':').map(Number),target=Date.UTC(year,month-1,day,hour,minute);let guess=target;
 for(let i=0;i<4;i++){const p=parts(guess,timezone),display=Date.UTC(Number(p.year),Number(p.month)-1,Number(p.day),Number(p.hour),Number(p.minute),Number(p.second));if(display===target)return new Date(guess).toISOString();guess+=target-display;}
 throw fail('This date and time is unavailable in the app time zone. Choose another date.',400,'LOCAL_TIME_UNAVAILABLE');
}
export function dayStart(date,timezone){
 // Some zones advance clocks at midnight. The first real minute of the date
 // is the calendar boundary; never invent a per-area time-zone override.
 for(let minute=0;minute<=180;minute++)try{return localInstant(date,String(Math.floor(minute/60)).padStart(2,'0')+':'+String(minute%60).padStart(2,'0'),timezone);}catch(e){if(e.code!=='LOCAL_TIME_UNAVAILABLE')throw e;}
 throw fail('This date is unavailable in the app time zone.',400,'LOCAL_TIME_UNAVAILABLE');
}
export async function appTimezone(repository){
 const value=(await repository.homeConfiguration())?.setting_value;if(!value)throw fail('The app time zone is unavailable.',503,'APP_TIMEZONE_REQUIRED');return value;
}
