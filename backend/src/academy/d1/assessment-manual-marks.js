import {assessmentStore} from './assessment-store.js';
import {assessmentGroup} from './assessment-group.js';
import {assessmentResultsSQL} from './assessment-results.js';
import {managementError as fail} from './management-store.js';

const compare=(a,b)=>a.localeCompare(b,'en',{sensitivity:'base',numeric:true});
export function assessmentManualMarks(repository,auth){
 const s=assessmentStore(repository,auth),{p,actor}=s;
 async function selection(id){
  const a=await s.assessment(id);await s.requireAssessor(a);
  const group=await assessmentGroup(s,a)||[a],visible=await s.assessorRows(group);
  await s.requireAssessorGroup(visible);
  if(visible.some(row=>!row.schedule_published))throw fail('Release the assessment schedule before entering marks.',409,'SCHEDULE_REQUIRED');
  return {a,rows:visible.sort((a,b)=>compare(a.activity_name,b.activity_name)||compare(a.class_name,b.class_name)||compare(a.class_id,b.class_id))};
 }
 async function records(rows){
  const ids=JSON.stringify(rows.map(a=>a.assessment_id)),[roster,recipients]=await Promise.all([s.rosters(rows),p(`SELECT r.*,u.display_name current_name,m.mark,m.state mark_state,m.manual FROM assessment_recipients r JOIN accounts u USING(account_id) LEFT JOIN (${assessmentResultsSQL}) m ON m.mark_id=r.latest_mark_id WHERE r.assessment_id IN(SELECT value FROM json_each(?))`,ids).all()]);
  const people=new Map(recipients.results.map(r=>[JSON.stringify([r.assessment_id,r.account_id]),{...r,display_name:r.current_name||r.display_name}]));
  for(const r of roster){const key=JSON.stringify([r.assessment_id,r.account_id]);if(!people.has(key))people.set(key,{...r,revision:0,latest_mark_id:null,mark:null});}
  if(people.size>5000)throw fail('Choose a single class to enter marks for this large assessment.',409,'MARK_ROSTER_TOO_LARGE');
  return [...people.values()];
 }
 async function list(input){const {a,rows}=await selection(input.assessmentId),people=await records(rows);return {assessment:{id:a.assessment_id,title:a.title,subject:a.subject},classes:rows.map(row=>({assessmentId:row.assessment_id,activityKey:row.activity_key,activityName:row.activity_name,classId:row.class_id,className:row.class_name,revision:row.revision,maximumMark:row.maximum_mark,students:people.filter(r=>r.assessment_id===row.assessment_id).sort((a,b)=>compare(a.display_name,b.display_name)||compare(a.account_id,b.account_id)).map(r=>({accountId:r.account_id,name:r.display_name,revision:r.revision,markId:r.latest_mark_id,mark:r.mark??null,markState:r.mark_state||null}))}))};}
 async function save(input){
  if(!Array.isArray(input.entries)||!input.entries.length||input.entries.length>1000||new Set(input.entries.map(r=>JSON.stringify([r?.assessmentId,r?.accountId]))).size!==input.entries.length)throw fail('Enter between one and 1000 changed marks at a time.');
  if(!Array.isArray(input.groupRevisions)||input.groupRevisions.some(r=>!r||typeof r.id!=='string'||!Number.isInteger(r.revision))||new Set(input.groupRevisions.map(r=>r.id)).size!==input.groupRevisions.length)throw fail('Refresh the marks list before saving.',409,'ROW_CHANGED');
  return s.change('marks-save',input,String(input.assessmentId||''),async()=>{
   const {a,rows}=await selection(input.assessmentId),people=await records(rows),byId=new Map(rows.map(a=>[a.assessment_id,a])),byPerson=new Map(people.map(r=>[JSON.stringify([r.assessment_id,r.account_id]),r])),changed=new Set(),now=new Date().toISOString(),events=[],updates=[],newRecipients=[];
   for(const entry of input.entries){
    const row=byId.get(entry?.assessmentId),person=byPerson.get(JSON.stringify([entry?.assessmentId,entry?.accountId]));
    if(!row||!person)throw fail('Choose students from your authorised assessment classes.',403,'FORBIDDEN');
    const revision=input.groupRevisions.find(r=>r.id===row.assessment_id);s.revision(row,{revision:revision?.revision});
    if(person.revision!==entry.recipientRevision||person.latest_mark_id!==(entry.markId??null))throw fail('A student’s mark changed elsewhere. Refresh before saving.',409,'ROW_CHANGED');
    if(typeof entry.mark!=='number'||!Number.isFinite(entry.mark)||entry.mark<0||entry.mark>row.maximum_mark)throw fail('Enter marks between zero and the total mark for each class.');
    const markId=crypto.randomUUID();changed.add(row.assessment_id);
    if(!Object.hasOwn(person,'first_accessed_at'))newRecipients.push({assessmentId:row.assessment_id,accountId:person.account_id,name:person.display_name});
    events.push({id:markId,assessmentId:row.assessment_id,activityKey:row.activity_key,accountId:person.account_id,details:JSON.stringify({mark:entry.mark,maximumMark:row.maximum_mark,previousMarkId:person.latest_mark_id||null,moderationRequired:true,assessmentRevision:row.revision+1})});
    updates.push({assessmentId:row.assessment_id,accountId:person.account_id,markId});
   }
   const statements=[];
   for(const id of changed)statements.push(s.event(byId.get(id),'marks-moderated',{approved:false,mode:'MANUAL',revision:byId.get(id).revision+1}));
   if(newRecipients.length)statements.push(p(`INSERT INTO assessment_recipients(assessment_id,account_id,display_name) SELECT json_extract(value,'$.assessmentId'),json_extract(value,'$.accountId'),json_extract(value,'$.name') FROM json_each(?)`,JSON.stringify(newRecipients)));
   statements.push(p(`INSERT INTO assessment_events(event_id,assessment_id,activity_key,actor_id,action,account_id,details_json,occurred_at) SELECT json_extract(value,'$.id'),json_extract(value,'$.assessmentId'),json_extract(value,'$.activityKey'),?,'manual-mark',json_extract(value,'$.accountId'),json_extract(value,'$.details'),? FROM json_each(?)`,actor,now,JSON.stringify(events)),p(`UPDATE assessment_recipients SET latest_mark_id=json_extract(j.value,'$.markId'),revision=revision+1 FROM json_each(?) j WHERE assessment_recipients.assessment_id=json_extract(j.value,'$.assessmentId') AND assessment_recipients.account_id=json_extract(j.value,'$.accountId')`,JSON.stringify(updates)),p(`UPDATE assessments SET revision=revision+1,updated_at=? WHERE assessment_id IN(SELECT value FROM json_each(?))`,now,JSON.stringify([...changed])),s.event(a,'marks-save',{entered:events.length,assessmentIds:[...changed]}));
   return {statements,result:{saved:events.length,appliedClasses:changed.size}};
  });
 }
 return {run:(action,input)=>action==='marks-list'?list(input):save(input)};
}
