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
export function groupRevisions(rows,input){
 const expected=input.groupRevisions;
 if(!Array.isArray(expected)||expected.some(r=>!r||typeof r.id!=='string'||!Number.isInteger(r.revision))||expected.length!==rows.length||new Set(expected.map(r=>r.id)).size!==rows.length||rows.some(a=>!expected.some(r=>r.id===a.assessment_id&&r.revision===a.revision)))throw fail('Refresh this shared assessment before applying changes to all its classes.',409,'ASSESSMENT_GROUP_CHANGED');
}
export const sharedAssessmentAction=(action,input)=>['save','publish','roster','paper-details','review-paper','ready-assessment','collection-save','session-delete'].includes(action)||action==='release'&&input.selection==='CLASS';
