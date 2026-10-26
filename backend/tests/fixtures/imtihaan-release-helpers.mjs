import assert from 'node:assert/strict';
const ok=response=>{assert.equal(response.status,200,JSON.stringify(response.body));return response.body;};
const op=()=>({operationId:crypto.randomUUID()});
const layout={fields:[{key:'learner',x:.1,y:.1,width:.8,height:.1,fontSize:14},{key:'results',x:.1,y:.3,width:.8,height:.4,fontSize:12},{key:'total',x:.1,y:.8,width:.8,height:.1,fontSize:14}]};
export async function generateImtihaanFixture(f,registerId){
 const plan=ok(await f.request('register-reports-plan',{registerId})),reports=[],designs=[];
 for(const c of plan.classes){designs.push({activityKey:c.activityKey,classId:c.classId,layout});for(const learner of c.learners){const file=ok(await f.uploadNative(c.assessments[0],'REPORT',{accountId:learner.id}));reports.push({activityKey:c.activityKey,classId:c.classId,accountId:learner.id,fileId:file.fileId,sha256:file.sha256});}}
 const body={...op(),registerId,fingerprint:plan.fingerprint,reviewed:true,reports,designs},result=ok(await f.request('register-reports-generate',body));return {body,result,reports};
}
export async function releaseImtihaanFixture(f,id,{releaseReports=false}={}){
 const d=await f.detail(id),registerId=d.assessment.registerId,seen=new Set();
 const ids=f.db.prepare('SELECT assessment_id FROM assessments WHERE register_id=? AND deleted_at IS NULL').all(registerId);
 for(const row of ids){if(seen.has(row.assessment_id))continue;const a=await f.detail(row.assessment_id);for(const m of a.group?.members||[{id:row.assessment_id}])seen.add(m.id);await f.allowMarks(row.assessment_id);}
 let summary=ok(await f.request('register-marking-validate',{registerId}));
 if(summary.missing||summary.unconfirmed)ok(await f.request('register-marking-override',{...op(),registerId,fingerprint:summary.fingerprint,confirm:true,reason:'Synthetic remaining marks or receipts are explicitly pending.'}));
 const generated=await generateImtihaanFixture(f,registerId);summary=ok(await f.request('register-marking-validate',{registerId}));
 const body={...op(),...summary,confirm:true,releaseReports},result=ok(await f.request('register-marks-release',body));return {...generated,body,result,registerId};
}
