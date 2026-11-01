import {contentMediaContext} from './content-media-context.js';
import {learnerCompanion,recordingRetention,publicationIndex} from '../../../../js/m4l-learner-companion.mjs';
import {optionalSchema} from './schema-probe.js';
import {managementError as fail} from './management-store.js';
import {payloadHash} from '../../programs/timetable-model.js';
export const companionSchema=db=>optionalSchema(db,'SELECT lesson_id FROM lesson_recording_companions WHERE 0');
const parse=async(bucket,key)=>{const o=await bucket.get(key);if(!o||o.size>400000)throw fail('Companion unavailable.',503);return JSON.parse(await new Response(o.body).text());};
export function academicCompanions({db,p,lesson,reader,staff,revision,change,bucket,scopeKey,namespace='',isRetained=()=>false}){
 async function read(input){
  const row=await lesson(input.lessonId);reader(row);
  if(!await companionSchema(db))return {companion:null};
  const saved=await p('SELECT c.* FROM lesson_recording_companions c JOIN lesson_media_links l USING(lesson_id,asset_id) WHERE c.lesson_id=? AND c.asset_id=?',row.lesson_id,input.assetId).first();
  if(!saved?.published_key)return {companion:null};
  const retention=recordingRetention(saved.uploaded_at);if(retention.companionExpired)return {companion:null,companionExpired:true};
  return {companion:await parse(bucket(),saved.published_key),...retention};
 }
 async function editor(input){
  const row=await lesson(input.lessonId);staff(row);
  if(!await companionSchema(db))throw fail('Companion storage needs its reviewed upgrade.',503);
  const asset=await p("SELECT a.* FROM lesson_media_links l JOIN lesson_media_assets a USING(asset_id) WHERE l.lesson_id=? AND a.asset_id=? AND a.kind='MP4'",row.lesson_id,input.assetId).first();
  if(!asset||isRetained(asset))throw fail('Choose the original temporary academic recording.',409);
  const saved=await p('SELECT * FROM lesson_recording_companions WHERE lesson_id=? AND asset_id=?',row.lesson_id,asset.asset_id).first(),uploadedAt=saved?.uploaded_at||asset.created_at,retention=recordingRetention(uploadedAt);
  if(retention.companionExpired)throw fail('This companion has expired.',410);
  if(saved&&Date.parse(saved.uploaded_at)!==Date.parse(asset.created_at))throw fail('The original upload time changed.',409);
  return {lessonId:row.lesson_id,assetId:asset.asset_id,revision:row.revision,companionRevision:saved?.revision||0,sourceRevision:saved?.source_revision||'',durationSeconds:saved?.duration_seconds||null,draftKey:saved?.draft_key||'',companion:saved?await parse(bucket(),saved.draft_key):null,hasPublished:Boolean(saved?.published_key),...retention};
 }
 async function edit(action,input){
  const row=await lesson(input.lessonId);staff(row);
  if(!await companionSchema(db))throw fail('Companion storage needs its reviewed upgrade.',503);
  let staged;const result=await change(action,input,row,'staff',async current=>{
   revision(current,input);
   if(current.media_scope!=='SESSION'||!contentMediaContext(current)&&(!current.session_key||!JSON.parse(current.source_lessons_json||'[]').length))throw fail('Confirm the exact native media record before attaching this companion.',409);
   const asset=await p("SELECT a.* FROM lesson_media_links l JOIN lesson_media_assets a USING(asset_id) WHERE l.lesson_id=? AND a.asset_id=? AND a.kind='MP4'",current.lesson_id,input.assetId).first();
   if(!asset)throw fail('Choose this session’s original successfully uploaded MP4.',409);
   if(isRetained(asset))throw fail('Use the original temporary academic upload with its fourteen-day recording policy; do not change earlier retained media.',409);
   const saved=await p('SELECT * FROM lesson_recording_companions WHERE lesson_id=? AND asset_id=?',current.lesson_id,asset.asset_id).first();
   if(input.companionRevision!==(saved?.revision??0))throw fail('This companion changed. Reopen its saved draft.',409);
   const uploadedAt=saved?.uploaded_at||asset.created_at,retention=recordingRetention(uploadedAt);if(retention.companionExpired)throw fail('This companion has expired.',410);
   if(saved&&Date.parse(saved.uploaded_at)!==Date.parse(asset.created_at))throw fail('The original upload time changed; review the source attachment.',409);
   let key=saved?.draft_key,index;
   if(action==='companion-save'){
    if(!/^[a-f0-9]{64}$/.test(input.sourceRevision||''))throw fail('Confirm the reviewed source revision.');
    if(!Number.isInteger(input.durationSeconds)||input.durationSeconds<1||input.durationSeconds>86400)throw fail('Confirm the recording duration.');
    const value=learnerCompanion(input.companion,{academic:true});if(value.topics.some(t=>t.start>=input.durationSeconds))throw fail('Keep topic timestamps within the actual recording.');const encoded=JSON.stringify(value);if(new TextEncoder().encode(encoded).byteLength>400000)throw fail('Keep this companion bounded.',413);
    key=namespace+'recording-companions/'+encodeURIComponent(scopeKey())+'/'+asset.asset_id+'/'+await payloadHash(value)+'.json';
    staged=encoded;
   }else{
    if(!saved||input.sourceRevision!==saved.source_revision||input.draftKey!==saved.draft_key)throw fail('Review the exact saved source and draft before publication.',409);
    index=JSON.stringify({...publicationIndex(await parse(bucket(),saved.draft_key)),durationSeconds:saved.duration_seconds});
   }
   const statements=action==='companion-save'?[p('INSERT INTO lesson_recording_companions VALUES(?,?,?,?,1,?,NULL,NULL,?) ON CONFLICT(lesson_id,asset_id) DO UPDATE SET source_revision=excluded.source_revision,revision=lesson_recording_companions.revision+1,draft_key=excluded.draft_key,duration_seconds=excluded.duration_seconds',current.lesson_id,asset.asset_id,uploadedAt,input.sourceRevision,key,input.durationSeconds)]:[p('UPDATE lesson_recording_companions SET published_key=draft_key,index_json=?,revision=revision+1 WHERE lesson_id=? AND asset_id=?',index,current.lesson_id,asset.asset_id)];
   // Keep the native lesson revision in the existing current-authority transaction.
   statements.push(p('UPDATE lesson_media_lessons SET revision=revision+1 WHERE lesson_id=?',current.lesson_id));
   return {statements,result:{lessonId:current.lesson_id,revision:current.revision+1,companionRevision:(saved?.revision??0)+1,draftKey:key,...retention}};
  });
  if(Date.parse(result.companionExpiresAt)<=Date.now())throw fail('This companion has expired.',410);
  if(action==='companion-save'){staged??=JSON.stringify(learnerCompanion(input.companion,{academic:true}));const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(staged)),sha256=[...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');await bucket().put(result.draftKey,staged,{sha256,httpMetadata:{contentType:'application/json'}});}
  return result;
 }
 return {read,edit,editor};
}
export async function companionIndexes(db,p,ids,now=Date.now()){
 if(!ids.length||!await companionSchema(db))return new Map();
 const rows=(await p('SELECT lesson_id,asset_id,index_json,uploaded_at FROM lesson_recording_companions WHERE lesson_id IN(SELECT value FROM json_each(?)) AND published_key IS NOT NULL',JSON.stringify(ids)).all()).results;
 const indexes=new Map();for(const row of rows){if(recordingRetention(row.uploaded_at,{now}).companionExpired)continue;if(!indexes.has(row.lesson_id))indexes.set(row.lesson_id,[]);indexes.get(row.lesson_id).push({assetId:row.asset_id,...JSON.parse(row.index_json),...recordingRetention(row.uploaded_at,{now})});}return indexes;
}

// Bounded expiry maintenance on the existing scheduler, never learner navigation.
// Delete all revisions under this recording's private prefix before dropping its
// pointer. Old source captures/retry versions cannot outlive the original upload.
export async function cleanupExpiredAcademicCompanions(env,now=Date.now()){
 const bucket=env.LESSON_MEDIA_BUCKET;if(!bucket?.list||!bucket?.delete||!env.ACADEMY_DB)return {checked:0,deleted:0};
 const db=env.ACADEMY_DB.withSession('first-primary');if(!await companionSchema(db))return {checked:0,deleted:0};
 // A calendar month is at most 31 days. The lower bound keeps the indexed scan
 // small; the exact clamped calendar deadline remains authoritative.
 const cutoff=new Date(now-28*86400000).toISOString(),rows=(await db.prepare('SELECT lesson_id,asset_id,uploaded_at,draft_key FROM lesson_recording_companions WHERE uploaded_at<=? ORDER BY uploaded_at,lesson_id,asset_id LIMIT 8').bind(cutoff).all()).results;
 let deleted=0;
 for(const row of rows){
  if(!recordingRetention(row.uploaded_at,{now}).companionExpired)continue;
  const prefix=row.draft_key.slice(0,row.draft_key.lastIndexOf('/')+1);if(!prefix.startsWith((env.ACADEMY_OBJECT_NAMESPACE||'')+'recording-companions/'))continue;
  const page=await bucket.list({prefix,limit:64});if(page.objects.length){await bucket.delete(page.objects.map(o=>o.key));deleted+=page.objects.length;}
  if(!page.truncated)await db.prepare('DELETE FROM lesson_recording_companions WHERE lesson_id=? AND asset_id=? AND uploaded_at=?').bind(row.lesson_id,row.asset_id,row.uploaded_at).run();
 }
 return {checked:rows.length,deleted};
}
