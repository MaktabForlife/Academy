import {payloadHash} from '../../programs/timetable-model.js';
import {setupSchema} from './setup-schema.js';

const format='ACADEMY_PUBLISHED_ASSESSMENTS_V1',maxRows=10000,maxBytes=4*1024*1024;
// Only accepted definitions and published labels are shared. No learner,
// recipient, answer, mark, permission, paper-file or release state enters R2.
const definitionColumns=['assessment_id','activity_key','class_id','title','subject','exam_date','duration_minutes','maximum_mark','phase_id','subject_descriptor','register_id','assessment_kind','timing_mode','timezone','available_from','due_at','exam_cutoff','allowance_minutes'];
const labelColumns=['phase_name','class_name','activity_name'];
const pick=row=>Object.fromEntries([...definitionColumns,...labelColumns].map(key=>[key,row[key]??null]));
const eligible=repository=>repository.setup?.reader&&repository.setup.head&&repository.features?.splitDatabases&&repository.features.nativeAttendance;

async function definitions(repository,auth){
 if(!eligible(repository))return null;
 const snapshots=repository.privateSnapshots,bucket=snapshots?.bucket;
 if(!bucket?.get||!bucket.put)return null;
 // A stable private key bounds storage as publications advance. A pinned old
 // head may rebuild its data; it can never consume another head's snapshot.
 const key='academy-published-assessments/v1/'+await payloadHash([format,snapshots.namespace])+'.json';
 for(let attempt=0;attempt<2;attempt++){
  const before=await snapshots.revision(auth,undefined,'published-assessment-definitions');
  if(!before.enabled)return null;
  let stored;
  try{const object=await bucket.get(key);if(object&&object.size<=maxBytes)stored=await object.json();}catch{/* Optional storage. */}
  let rows=stored?.format===format&&stored.head===repository.setup.head&&Array.isArray(stored.rows)&&stored.rows.length<=maxRows&&stored.rows.every(row=>row&&typeof row.assessment_id==='string'&&typeof row.activity_key==='string'&&typeof row.class_id==='string')?stored.rows.map(pick):null;
  if(!rows){
   rows=(await repository.db.prepare(`SELECT ${definitionColumns.map(c=>'x.'+c).join(',')},COALESCE(ar.name,ph.name) phase_name,c.name class_name,a.name activity_name FROM assessments x LEFT JOIN assessment_phases ph ON ph.phase_id=x.phase_id LEFT JOIN assessment_registers ar ON ar.register_id=x.register_id JOIN classes c ON c.activity_key=x.activity_key AND c.class_id=x.class_id JOIN activities a ON a.activity_key=x.activity_key ORDER BY x.exam_date,x.title LIMIT ${maxRows+1}`).all()).results.map(pick);
   if(rows.length>maxRows)return null;
   const encoded=JSON.stringify({format,head:repository.setup.head,rows});
   if(new TextEncoder().encode(encoded).byteLength>maxBytes)return null;
   try{await bucket.put(key,encoded,{httpMetadata:{contentType:'application/json',cacheControl:'private, no-store'}});}catch{/* Storage failure cannot prevent reading an assessment. */}
  }
  // Expiry, grants and revocations remain live while storage is slow. The
  // verification marker never enters the shared stored definition.
  const after=await snapshots.revision(auth,before,'published-assessment-definitions');
  if(JSON.stringify(before)===JSON.stringify(after))return rows;
 }
 throw Object.assign(Error('Assessment information changed while loading. Please refresh.'),{status:409,code:'SNAPSHOT_CHANGED'});
}

export async function publishedAssessmentRows(repository,auth,{activityKey='',ids,publishedOnly=false,limit}={}){
 const source=await definitions(repository,auth);if(source===null)return null;
 const scoped=source.filter(r=>!activityKey||r.activity_key===activityKey);
 // The established reader limits before audience projection. On exceptionally
 // large schedules preserve that exact behaviour through its original query.
 if(limit&&scoped.length>=limit)return null;
 const selected=ids?scoped.filter(r=>ids.includes(r.assessment_id)):scoped;
 if(!selected.length)return [];
 const liveColumns=setupSchema.assessments.live.map(c=>'live.'+c).join(',');
 const current=(await repository.db.prepare(`SELECT live.assessment_id,${liveColumns},ar.status register_status,col.effective_due_at,col.closed_at,col.revision collection_revision,f.sha256 paper_sha256 FROM json_each(?) selected JOIN main.assessments live ON live.assessment_id=json_extract(selected.value,'$.id') JOIN main.classes c ON c.activity_key=json_extract(selected.value,'$.activityKey') AND c.class_id=json_extract(selected.value,'$.classId') JOIN main.activities a ON a.activity_key=c.activity_key LEFT JOIN main.assessment_registers ar ON ar.register_id=json_extract(selected.value,'$.registerId') LEFT JOIN assessment_collection col ON col.assessment_id=live.assessment_id LEFT JOIN assessment_file_integrity f ON f.file_id=live.paper_file_id WHERE live.deleted_at IS NULL ${publishedOnly?'AND live.schedule_published=1':''}`).bind(JSON.stringify(selected.map(r=>({id:r.assessment_id,activityKey:r.activity_key,classId:r.class_id,registerId:r.register_id})))).all()).results;
 const byId=new Map(current.map(row=>[row.assessment_id,row]));
 const rows=selected.filter(r=>byId.has(r.assessment_id)).map(row=>({...row,...byId.get(row.assessment_id)}));
 return limit?rows.slice(0,limit):rows;
}

export async function warmPublishedAssessments(repository,auth){
 // A successful publication stays successful even if this optional warming
 // fails. The first learner can rebuild from the same accepted definitions.
 try{await definitions(repository,auth);}catch{/* Optional optimisation. */}
}
