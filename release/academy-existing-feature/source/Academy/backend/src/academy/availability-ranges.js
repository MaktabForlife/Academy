import {normalizePlanner} from '../programs/weekly-timetable.js';
const parseTimeInput=value=>typeof value==='string'?value.trim().replace(/^(\d{1,2})(\d{2})$/,'$1:$2').replace(/[hH]/,':').replace(/^(\d):(\d{2})$/,'0$1:$2'):'';

const validDate=v=>/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T12:00:00Z'))&&new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v;
const clock=(value,end=false)=>end&&value==='24:00'||/^([01]\d|2[0-3]):[0-5]\d$/.test(value);
const minutes=value=>Number(value.slice(0,2))*60+Number(value.slice(3));
const fail=message=>{throw Object.assign(new Error(message),{status:400,code:'INVALID_AVAILABILITY'});};
export const exceptionRanges=ranges=>ranges.some(row=>row?.status==='AVAILABLE'||row?.status==='UNAVAILABLE');

export function normalizeAvailability(ranges,accountId) {
 if(!Array.isArray(ranges)||ranges.length>(exceptionRanges(ranges)?140:70))fail('Use at most 140 exceptions or 70 legacy teaching-hour entries.');
 if(!exceptionRanges(ranges))return normalizePlanner({availability:ranges.map(r=>({...r,teacherId:accountId}))}).availability.map(({teacherId,...r})=>r);
 const ids=new Set();
 return ranges.map(row=>{
  if(!row||typeof row!=='object'||!/^AVAIL-[\w-]{1,80}$/.test(row.id)||ids.has(row.id))fail('Each availability entry needs a unique identifier.');
  ids.add(row.id);
  if(!['AVAILABLE','UNAVAILABLE'].includes(row.status)||!['WEEKLY','DATES'].includes(row.kind))fail('Choose Available or Unavailable, and weekly or dated entries.');
  const weekdays=row.kind==='WEEKLY'?row.weekdays:[];
  if(!Array.isArray(weekdays)||row.kind==='WEEKLY'&&(!weekdays.length||weekdays.length>7)||weekdays.some(d=>!Number.isInteger(d)||d<0||d>6)||new Set(weekdays).size!==weekdays.length)fail('Choose one or more different weekdays.');
  const startDate=String(row.startDate||''),endDate=String(row.endDate||'');
  if(row.kind==='DATES'&&(!startDate||!endDate)||startDate&&!validDate(startDate)||endDate&&!validDate(endDate)||endDate&&startDate&&endDate<startDate)fail('Choose valid start and end dates in order.');
  const allDay=row.allDay===true,startTime=allDay?'00:00':parseTimeInput(row.startTime)||row.startTime,endTime=allDay?'24:00':row.endTime==='24:00'?'24:00':parseTimeInput(row.endTime)||row.endTime;
  if(!clock(startTime)||!clock(endTime,true)||startTime>=endTime)fail('Choose a valid start time and a later end time.');
  return {id:row.id,kind:row.kind,status:row.status,weekdays:[...weekdays].sort(),startDate,endDate,allDay,startTime,endTime};
 });
}

export function matchingAvailability(ranges,date) {
 const weekday=new Date(date+'T12:00:00Z').getUTCDay();
 return ranges.filter(r=>(!r.startDate||r.startDate<=date)&&(!r.endDate||r.endDate>=date)&&(r.kind==='DATES'||r.weekdays?.includes(weekday)))
  .sort((a,b)=>Number(a.kind==='DATES')-Number(b.kind==='DATES'));
}

export function availableForSession(ranges,date,startTime,endTime) {
 if(!ranges.length)return true;
 if(!exceptionRanges(ranges))return ranges.some(r=>r.weekday===new Date(date+'T12:00:00Z').getUTCDay()&&r.startTime<=startTime&&r.endTime>=endTime);
 const applicable=matchingAvailability(ranges,date),from=minutes(startTime),to=minutes(endTime);
 const bounds=[...new Set([from,to,...applicable.flatMap(r=>[minutes(r.startTime),minutes(r.endTime)]).filter(t=>t>from&&t<to)])].sort((a,b)=>a-b);
 for(let i=0;i<bounds.length-1;i++){
  let status='AVAILABLE';
  for(const r of applicable)if(minutes(r.startTime)<=bounds[i]&&minutes(r.endTime)>=bounds[i+1])status=r.status;
  if(status==='UNAVAILABLE')return false;
 }
 return true;
}

export function availabilityBlocks(ranges,date) {
 if(!ranges.length)return [];
 if(!exceptionRanges(ranges))return ranges.filter(r=>r.weekday===new Date(date+'T12:00:00Z').getUTCDay()).map(r=>({...r,status:'AVAILABLE',kind:'LEGACY'}));
 const applicable=matchingAvailability(ranges,date),bounds=[...new Set(applicable.flatMap(r=>[minutes(r.startTime),minutes(r.endTime)]))].sort((a,b)=>a-b),blocks=[];
 const time=n=>String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');
 for(let i=0;i<bounds.length-1;i++){
  const winning=applicable.findLast(r=>minutes(r.startTime)<=bounds[i]&&minutes(r.endTime)>=bounds[i+1]);if(!winning)continue;
  const startTime=time(bounds[i]),endTime=time(bounds[i+1]),previous=blocks.at(-1);
  if(previous?.status===winning.status&&previous.endTime===startTime){previous.endTime=endTime;previous.allDay=previous.startTime==='00:00'&&endTime==='24:00';}
  else blocks.push({...winning,startTime,endTime,allDay:startTime==='00:00'&&endTime==='24:00'});
 }
 return blocks;
}
