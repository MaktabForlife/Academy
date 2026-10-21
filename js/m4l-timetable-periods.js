/* Keep lesson boundaries aligned with editable planning periods. */
(() => {'use strict';
 const valid=value=>/^([01]\d|2[0-3]):[0-5]\d$/.test(value||'');
 const overlap=(a,b)=>a.startTime<b.endTime&&b.startTime<a.endTime;
 window.M4L_TIMETABLE_PERIODS={change({periods,rules,breaks=[],id,field,value}){
  const index=periods.findIndex(p=>p.id===id),old=periods[index];
  if(!old||!['startTime','endTime'].includes(field)||!valid(value))throw Error('Enter a valid start and end time, for example 745 for 07:45.');
  const next={...old,[field]:value};
  if(next.startTime>=next.endTime)throw Error('The period must finish after it starts.');
  if(index>0&&next.startTime<periods[index-1].endTime||index<periods.length-1&&next.endTime>periods[index+1].startTime)throw Error('Planning periods must stay in order and cannot overlap.');
  if(old[field]===value)return {changed:false};
  let lessonsChanged=0,breaksChanged=0;
  const retime=(rows,isBreak)=>rows.map(original=>{
   const row=structuredClone(original),owners=periods.flatMap((p,i)=>overlap(original,p)?[i]:[]);
   // Internal period boundaries do not shorten a lesson spanning several periods.
   if((field==='startTime'?owners[0]:owners.at(-1))===index&&(!isBreak||original[field]===old[field])){
    row[field]=value;
    if(!valid(row.startTime)||!valid(row.endTime)||row.startTime>=row.endTime)throw Error('This change would leave a lesson or break with no duration. Edit that lesson or break first.');
    if(original[field]!==value){if(isBreak)breaksChanged+=row.weekdays.length;else lessonsChanged+=row.weekdays.length;}
   }
   return row;
  });
  return {changed:true,periods:periods.map((p,i)=>i===index?next:{...p}),rules:retime(rules,false),breaks:retime(breaks,true),lessonsChanged,breaksChanged};
 }};
})();
