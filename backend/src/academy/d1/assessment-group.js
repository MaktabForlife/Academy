import {managementError as fail} from './management-store.js';

// The immutable creation event/receipt owns the original selection. Never infer
// a shared paper from matching names, dates or an Imtihaan's other subjects.
export async function assessmentGroup(s,a){
 const event=await s.p("SELECT details_json FROM assessment_events WHERE assessment_id=? AND action='CREATED' ORDER BY occurred_at,event_id LIMIT 1",a.assessment_id).first();
 let ids=event?JSON.parse(event.details_json).assessmentIds:null;
 if(!ids){
  const receipt=await s.p(`SELECT result_json FROM operation_receipts WHERE dataset_key='ASSESSMENT'
   AND (scope_key=? OR scope_key IN(SELECT activity_key FROM assessment_register_areas WHERE register_id=?))
   AND EXISTS(SELECT 1 FROM json_each(operation_receipts.result_json,'$.assessmentIds') WHERE value=?) LIMIT 1`,a.activity_key,a.register_id,a.assessment_id).first();
  ids=receipt?JSON.parse(receipt.result_json).assessmentIds:null;
 }
 if(!Array.isArray(ids)||ids.length<2)return null;
 if(ids.length>50||!ids.includes(a.assessment_id)||new Set(ids).size!==ids.length)throw fail('This shared assessment selection needs Admin review.',409,'ASSESSMENT_GROUP_CHANGED');
 const rows=await s.assessments(ids);
 if(rows.length!==ids.length)throw fail('A class in this shared assessment is unavailable. Refresh or contact Admin.',409,'ASSESSMENT_GROUP_CHANGED');
 return rows;
}
export async function assessmentListGroups(s,rows,assessments){
 const visible=new Map(assessments.filter(a=>a.canAdmin).map(a=>[a.id,a])),shared=new Map();
 if(visible.size<2)return shared;
 const selected=JSON.stringify([...visible.keys()]),original=new Map(),records=new Map(rows.map(a=>[a.assessment_id,a]));
 const events=(await s.p(`SELECT e.assessment_id,e.details_json FROM assessment_events e WHERE e.action='CREATED'
  AND e.assessment_id IN(SELECT value FROM json_each(?)) AND e.event_id=(SELECT first.event_id FROM assessment_events first
  WHERE first.assessment_id=e.assessment_id AND first.action='CREATED' ORDER BY first.occurred_at,first.event_id LIMIT 1)`,selected).all()).results;
 for(const event of events)original.set(event.assessment_id,JSON.parse(event.details_json).assessmentIds);
 const missing=[...visible.keys()].filter(id=>!original.get(id));
 if(missing.length){
  const receipts=(await s.p(`SELECT result_json FROM operation_receipts WHERE dataset_key='ASSESSMENT'
   AND EXISTS(SELECT 1 FROM json_each(operation_receipts.result_json,'$.assessmentIds') member
   JOIN json_each(?) selected ON selected.value=member.value) LIMIT 1001`,JSON.stringify(missing)).all()).results;
  for(const receipt of receipts){const ids=JSON.parse(receipt.result_json).assessmentIds;if(Array.isArray(ids))for(const id of ids)if(visible.has(id)&&!original.get(id))original.set(id,ids);}
 }
 for(const [id,a] of visible){
  const ids=original.get(id);
  if(!Array.isArray(ids)||ids.length<2||ids.length>50||!ids.includes(id)||new Set(ids).size!==ids.length||!ids.every(member=>visible.has(member)&&records.get(member)?.register_id===a.registerId&&records.get(member)?.paper_file_id===records.get(id)?.paper_file_id))continue;
  shared.set(id,{sharedAssessmentId:ids[0],sharedClassCount:ids.length});
 }
 return shared;
}
export function groupRevisions(rows,input){
 const expected=input.groupRevisions;
 if(!Array.isArray(expected)||expected.some(r=>!r||typeof r.id!=='string'||!Number.isInteger(r.revision))||expected.length!==rows.length||new Set(expected.map(r=>r.id)).size!==rows.length||rows.some(a=>!expected.some(r=>r.id===a.assessment_id&&r.revision===a.revision)))throw fail('Refresh this shared assessment before applying changes to all its classes.',409,'ASSESSMENT_GROUP_CHANGED');
}
export const sharedAssessmentAction=(action,input)=>['save','publish','roster','paper-details','review-paper','ready-assessment','collection-save','session-delete'].includes(action)||action==='release'&&input.selection==='CLASS';
