import {fail} from './protocol.mjs';
export async function gridClassMetadata(db,activity,result){
 const ids=JSON.stringify(result.students.map(r=>r.accountId));
 const [classes,memberships]=(await db.batch([
  db.prepare('SELECT class_id,name,active FROM classes WHERE activity_key=? ORDER BY class_id LIMIT 201').bind(activity),
  db.prepare('SELECT account_id,class_id,start_date,end_date,active FROM class_memberships WHERE activity_key=? AND account_id IN(SELECT value FROM json_each(?)) LIMIT 2001').bind(activity,ids)
 ])).map(r=>r.results);
 if(classes.length>200||memberships.length>2000)throw fail('Choose fewer students for this register.',409);
 const months=result.years.flatMap(y=>Array.from({length:12},(_,i)=>y+'-'+String(i+1).padStart(2,'0')));
 for(const student of result.students){
  const history=memberships.filter(m=>m.account_id.toLowerCase()===student.accountId.toLowerCase());
  student.suggestedClassIds=Object.fromEntries(months.map(month=>{
   const end=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),0)).toISOString().slice(0,10);
   const ids=[...new Set(history.filter(m=>(m.active||m.start_date&&m.end_date)&&(!m.start_date||m.start_date<=end)&&(!m.end_date||m.end_date>=month+'-01')).map(m=>m.class_id))];
   return [month,ids.length?ids:classes.length===1?[classes[0].class_id]:[]];
  }));
 }
 return {...result,classes,surahGrantsAvailable:false,currentMonth:new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Johannesburg',year:'numeric',month:'2-digit'}).format(new Date())};
}
export async function validateGridClasses(db,activity,command){
 if(!Array.isArray(command.entries)||!command.entries.length||command.entries.length>240)throw fail('Save up to 240 month changes together.');
 const ids=[...new Set(command.entries.filter(e=>e.subscribed).flatMap(e=>Array.isArray(e.classIds)?e.classIds:[]))];
 if(ids.length>200||ids.some(x=>typeof x!=='string'||!x||x.length>180))throw fail('Choose original programme classes.');
 const rows=(await db.prepare('SELECT class_id FROM classes WHERE activity_key=? AND class_id IN(SELECT value FROM json_each(?))').bind(activity,JSON.stringify(ids)).all()).results;
 if(rows.length!==ids.length)throw fail('Choose classes belonging to this programme.',403,'CLASS_SCOPE_REQUIRED');
 return {action:command.action,entries:command.entries.map(e=>({accountId:e.accountId,month:e.month,subscribed:e.subscribed,classIds:e.classIds,revision:e.revision})),policyRevision:command.policyRevision,operationId:command.operationId,removalReason:command.removalReason||''};
}
