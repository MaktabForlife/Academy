import {managementError as fail,same} from './management-store.js';
import {validDate,cleanText} from './assessment-store.js';
import {payloadHash} from '../../programs/timetable-model.js';

export const MOU_MEDIA_PROGRAM='PROGRAM:PRG-656bcece-4310-49c7-87d7-ee06756f66c1';
export const MEDIA_PDF_LIMIT=16*1024*1024;
export function youtubeId(value){
 if(typeof value!=='string'||value.length>2048)throw fail('Enter a YouTube recording link.');
 let url;try{url=new URL(value);}catch{throw fail('Enter a YouTube recording link.');}
 if(url.protocol!=='https:'||url.username||url.password||url.port)throw fail('Enter a secure YouTube recording link.');
 const host=url.hostname.toLowerCase().replace(/^www\./,''),id=host==='youtu.be'?url.pathname.slice(1):['youtube.com','m.youtube.com'].includes(host)?url.pathname==='/watch'?url.searchParams.get('v'):url.pathname.match(/^\/(?:embed|shorts)\/([^/]+)$/)?.[1]:'';
 if(!/^[A-Za-z0-9_-]{11}$/.test(id||''))throw fail('Enter a valid YouTube recording link.');return id;
}
const rolesSQL="EXISTS(SELECT 1 FROM effective_activity_roles r WHERE r.account_id=a.account_id AND r.activity_key=? AND r.role IN(SELECT value FROM json_each(?)))";
const globalSQL="EXISTS(SELECT 1 FROM global_role_assignments g WHERE g.account_id=a.account_id AND g.role='GLOBAL_ADMIN' AND g.active=1 AND g.review_state='CONFIRMED')";

export function lessonMedia(repository,auth,env){
 const db=repository.db,p=(sql,...values)=>db.prepare(sql).bind(...values),actor=auth.user.accountid;
 const admin=Boolean(auth.state.account.global_admin||auth.state.roles.some(r=>same(r.activity_key,MOU_MEDIA_PROGRAM)&&r.role==='PROGRAM_ADMIN'));
 const student=auth.state.roles.some(r=>same(r.activity_key,MOU_MEDIA_PROGRAM)&&r.role==='STUDENT');
 const teacher=auth.state.roles.some(r=>same(r.activity_key,MOU_MEDIA_PROGRAM)&&r.role==='TEACHER');
 const manages=lesson=>admin||teacher&&same(lesson.teacher_id,actor);
 const scope=async()=>{
  if(!await p("SELECT 1 ok FROM activities WHERE activity_key=? AND active=1 AND lifecycle='ACTIVE'",MOU_MEDIA_PROGRAM).first())throw fail('These lesson recordings are not available.',403,'MEDIA_FORBIDDEN');
 };
 const ready=async()=>{if(!await p("SELECT 1 ok FROM academy_settings WHERE setting_key='LessonMediaPilot' AND setting_value='1'").first())throw fail('Lesson media is not available yet.',503,'MEDIA_NOT_ENABLED');await scope();};
 async function lesson(id){const row=await p('SELECT l.*,c.name class_name FROM lesson_media_lessons l JOIN classes c ON c.activity_key=l.activity_key AND c.class_id=l.class_id WHERE l.lesson_id=? AND l.activity_key=?',String(id||''),MOU_MEDIA_PROGRAM).first();if(!row)throw fail('Lesson not found.',404);return row;}
 function reader(row){if(!(student||admin)||row.state!=='PUBLISHED')throw fail('Recordings are available to current MOU learners and authorised admins.',403,'MEDIA_FORBIDDEN');}
 function staff(row){if(!manages(row))throw fail('This lesson is outside your media management access.',403,'MEDIA_FORBIDDEN');}
 function revision(row,input){if(!Number.isInteger(input.revision)||row.revision!==input.revision)throw fail('This entry changed. Refresh before saving; your entry is kept.',409,'ROW_CHANGED');}
 const dto=row=>({id:row.lesson_id,date:row.lesson_date,title:row.title,startTime:row.start_time,endTime:row.end_time,teacher:row.teacher_name,className:row.class_name,summary:row.summary,state:row.state,commentsClosed:Boolean(row.comments_closed),revision:row.revision,canManage:manages(row),canView:(student||admin)&&row.state==='PUBLISHED',lessons:JSON.parse(row.source_lessons_json)});
 async function assets(id,management=false){return (await p('SELECT a.* FROM lesson_media_links l JOIN lesson_media_assets a USING(asset_id) WHERE l.lesson_id=? ORDER BY a.kind,a.created_at,a.asset_id',id).all()).results.map(a=>({id:a.asset_id,kind:a.kind,filename:a.filename,...(management&&a.kind==='YOUTUBE'?{url:'https://youtu.be/'+a.youtube_id}:{})}));}
 async function list(input){
  if(!student&&!teacher&&!admin)throw fail('This Program media is outside your access.',403,'MEDIA_FORBIDDEN');
  const preview=Boolean(input.view==='learner'&&admin);
  const before=input.before||'9999-12-31';if(before!=='9999-12-31'&&!validDate(before))throw fail('Choose a valid lesson date.');
  const rows=(await p(`SELECT l.*,c.name class_name FROM lesson_media_lessons l JOIN classes c ON c.activity_key=l.activity_key AND c.class_id=l.class_id WHERE l.activity_key=? AND l.lesson_date<? AND ${preview?"l.state='PUBLISHED'":admin?'1=1':teacher?'(l.teacher_id=? OR (?=1 AND l.state=\'PUBLISHED\'))':"l.state='PUBLISHED'"} ORDER BY l.lesson_date DESC,l.lesson_id DESC LIMIT 31`,MOU_MEDIA_PROGRAM,before,...(!admin&&teacher?[actor,Number(student)]:[])).all()).results;
  const page=rows.slice(0,30),ids=page.map(r=>r.lesson_id),links=ids.length?(await p('SELECT l.lesson_id,a.asset_id,a.kind,a.filename FROM lesson_media_links l JOIN lesson_media_assets a USING(asset_id) WHERE l.lesson_id IN(SELECT value FROM json_each(?)) ORDER BY a.created_at',JSON.stringify(ids)).all()).results:[];
  return {canManage:!preview&&(admin||teacher),canView:student||admin,learnerPreview:preview,lessons:page.map(row=>({...dto(row),...(preview?{canManage:false}:{}),assets:links.filter(a=>a.lesson_id===row.lesson_id).map(a=>({id:a.asset_id,kind:a.kind,filename:a.filename}))})),before:rows.length>30?page.at(-1).lesson_date:null};
 }
 async function receipt(input,hash){const r=await p("SELECT * FROM operation_receipts WHERE dataset_key='LESSON_MEDIA' AND scope_key=? AND operation_id=?",MOU_MEDIA_PROGRAM,input.operationId).first();if(!r)return null;if(!same(r.actor_account_id,actor)||r.payload_sha256!==hash)throw fail('This retry belongs to another change.',409,'OPERATION_ID_REUSED');return {...JSON.parse(r.result_json),replayed:true};}
 // Version and current account/session/role guards share the write transaction.
 // Media operations never load the Academy-wide account or media catalogue.
 async function change(action,input,row,mode,plan){
  if(!/^[a-f0-9-]{36}$/i.test(input.operationId||''))throw fail('This change needs its retry identifier.');
  const hash=await payloadHash({action,input});
  for(let attempt=0;attempt<3;attempt++){
   const saved=await receipt(input,hash);if(saved)return saved;
   const version=await p('SELECT version FROM academy_write_state WHERE singleton=1').first();
   const current=await lesson(row.lesson_id);await scope();
   if(mode==='student')reader(current);else if(mode==='staff')staff(current);else if(!manages(current))reader(current);
   const {statements,result}=await plan(current),guard=crypto.randomUUID(),now=new Date().toISOString();
   const authority=mode==='student'?rolesSQL:`(${globalSQL} OR ${rolesSQL} OR (${rolesSQL} AND EXISTS(SELECT 1 FROM lesson_media_lessons WHERE lesson_id=? AND teacher_id=a.account_id)))`;
   const roleValues=mode==='student'?[MOU_MEDIA_PROGRAM,JSON.stringify(['STUDENT'])]:[MOU_MEDIA_PROGRAM,JSON.stringify(['PROGRAM_ADMIN']),MOU_MEDIA_PROGRAM,JSON.stringify(mode==='either'?['TEACHER','STUDENT']:['TEACHER']),current.lesson_id];
   try{
    await db.batch([p(`INSERT INTO academy_write_guards(guard_id,accepted) VALUES(?,(SELECT version=? FROM academy_write_state WHERE singleton=1) AND EXISTS(SELECT 1 FROM accounts a JOIN account_credentials c USING(account_id) JOIN account_sessions s USING(account_id) WHERE a.account_id=? AND a.active=1 AND c.pin_setup=1 AND length(trim(c.pin_hash))>0 AND c.credential_epoch=? AND s.session_id=? AND s.revoked_at IS NULL AND s.credential_epoch=c.credential_epoch AND s.expires_at>? AND ${authority}))`,guard,version.version,actor,auth.state.account.credential_epoch,auth.sid,now,...roleValues),...statements,
     p('INSERT INTO audit_events(event_id,occurred_at,actor_account_id,authority,scope_key,action,record_kind,record_id,changed_fields_json) VALUES(?,?,?,?,?,?,?,?,?)',crypto.randomUUID(),now,actor,auth.user.role,MOU_MEDIA_PROGRAM,action,'LESSON_MEDIA',row.lesson_id,JSON.stringify({action})),
     p("INSERT INTO operation_receipts(dataset_key,scope_key,operation_id,payload_sha256,result_json,actor_account_id,completed_at) VALUES('LESSON_MEDIA',?,?,?,?,?,?)",MOU_MEDIA_PROGRAM,input.operationId,hash,JSON.stringify(result),actor,now),p('UPDATE academy_write_state SET version=version+1 WHERE singleton=1'),p('DELETE FROM academy_write_guards WHERE guard_id=?',guard)]);
    return result;
   }catch(e){const recovered=await receipt(input,hash);if(recovered)return recovered;if(!/academy_management_stale/.test(e.message))throw e;const state=await repository.session(auth.sid,actor,auth.state.account.credential_epoch);if(!state)throw fail('Your Academy session has ended.',401);if(attempt===2)throw fail('The entry changed. Refresh before saving.',409,'ROW_CHANGED');}
  }
 }
 async function save(input){
  const row=await lesson(input.lessonId);staff(row);
  return change('save',input,row,'staff',async current=>{
   revision(current,input);
   const title=cleanText(input.title,180,'a lesson title'),summary=cleanText(input.summary,4000,'a summary',true),state=input.state;
   if(!['DRAFT','PUBLISHED','HIDDEN'].includes(state)||typeof input.commentsClosed!=='boolean')throw fail('Choose a lesson state.');
   const recording=input.recordingUrl?.trim(),id=recording?youtubeId(recording):null;
   const all=await p("SELECT a.asset_id FROM lesson_media_links l JOIN lesson_media_assets a USING(asset_id) WHERE l.lesson_id=? AND a.kind='YOUTUBE'",row.lesson_id).all();
   const statements=[p('UPDATE lesson_media_lessons SET title=?,summary=?,state=?,comments_closed=?,revision=revision+1,updated_at=? WHERE lesson_id=?',title,summary,state,Number(input.commentsClosed),new Date().toISOString(),row.lesson_id),...all.results.map(a=>p('DELETE FROM lesson_media_links WHERE lesson_id=? AND asset_id=?',row.lesson_id,a.asset_id))];
   if(id){const assetId=crypto.randomUUID();statements.push(p("INSERT INTO lesson_media_assets(asset_id,activity_key,kind,youtube_id,created_at) VALUES(?,?,'YOUTUBE',?,?)",assetId,MOU_MEDIA_PROGRAM,id,new Date().toISOString()),p('INSERT INTO lesson_media_links VALUES(?,?)',row.lesson_id,assetId));}
   return {statements,result:{lessonId:row.lesson_id,revision:current.revision+1}};
  });
 }
 async function comments(input){
  const row=await lesson(input.lessonId);if(!manages(row))reader(row);
  const moderates=manages(row)&&!(input.view==='learner'&&admin);
  const before=input.before||'9999-12-31T23:59:59.999Z';if(typeof before!=='string'||before.length>64)throw fail('Invalid comment page.');
  const rows=(await p(`SELECT c.*,a.display_name FROM lesson_media_comments c JOIN accounts a USING(account_id) WHERE c.lesson_id=? AND c.created_at<? AND ${moderates?"c.state<>'DELETED'":"(c.state='APPROVED' OR (c.account_id=? AND c.state<>'DELETED'))"} ORDER BY c.created_at DESC,c.comment_id DESC LIMIT 101`,row.lesson_id,before,...(moderates?[]:[actor])).all()).results;
  return {commentsClosed:Boolean(row.comments_closed),canManage:moderates,comments:rows.slice(0,100).map(c=>({id:c.comment_id,name:c.display_name,body:c.body,parentId:c.parent_id,state:c.state,staff:Boolean(c.staff),pinned:Boolean(c.pinned),revision:c.revision,createdAt:c.created_at,own:same(c.account_id,actor)})),before:rows.length>100?rows[99].created_at:null};
 }
 async function commentSave(input){
  const row=await lesson(input.lessonId),isStaff=manages(row);if(!isStaff)reader(row);
  return change('comment-save',input,row,isStaff?'staff':'student',async current=>{
   if(current.comments_closed&&!isStaff)throw fail('Discussion is closed for this lesson.',409,'COMMENTS_CLOSED');
   const body=cleanText(input.body,2000,'a comment');let old=null;
   if(input.commentId){old=await p('SELECT * FROM lesson_media_comments WHERE lesson_id=? AND comment_id=?',row.lesson_id,input.commentId).first();if(!old||old.state==='DELETED'||!same(old.account_id,actor))throw fail('You can edit only your own comments.',403);revision(old,input);}
   const parentId=old?.parent_id||input.parentId||null;
   if(parentId&&!await p("SELECT 1 ok FROM lesson_media_comments WHERE comment_id=? AND lesson_id=? AND state='APPROVED' AND parent_id IS NULL",parentId,row.lesson_id).first())throw fail('Reply to an approved comment in this lesson.');
   const id=old?.comment_id||crypto.randomUUID(),now=new Date().toISOString(),state=isStaff?'APPROVED':'PENDING';
   return {statements:[old?p('UPDATE lesson_media_comments SET body=?,state=?,pinned=0,revision=revision+1,updated_at=? WHERE comment_id=?',body,state,now,id):p('INSERT INTO lesson_media_comments(comment_id,lesson_id,account_id,parent_id,body,state,staff,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)',id,row.lesson_id,actor,parentId,body,state,Number(isStaff),now,now)],result:{commentId:id,state}};
  });
 }
 async function moderate(input){
  const row=await lesson(input.lessonId),isStaff=manages(row);if(!isStaff)reader(row);
  return change('comment-moderate',input,row,isStaff?'staff':'student',async()=>{
   const c=await p('SELECT * FROM lesson_media_comments WHERE comment_id=? AND lesson_id=?',input.commentId,row.lesson_id).first();if(!c)throw fail('Comment not found.',404);revision(c,input);
   if(!isStaff&&!(same(c.account_id,actor)&&input.decision==='DELETE'))throw fail('Only assigned teachers and admins can curate comments.',403);
   const states={APPROVE:'APPROVED',HIDE:'HIDDEN',DELETE:'DELETED'};if(!states[input.decision]&&!['PIN','UNPIN'].includes(input.decision))throw fail('Choose a moderation action.');
   if(['PIN','UNPIN'].includes(input.decision)&&c.state!=='APPROVED')throw fail('Approve a comment before pinning it.');
   return {statements:[p('UPDATE lesson_media_comments SET state=?,body=?,pinned=?,revision=revision+1,updated_at=? WHERE comment_id=?',states[input.decision]||c.state,input.decision==='DELETE'?'[Removed]':c.body,input.decision==='PIN'?1:input.decision==='UNPIN'||states[input.decision]?0:c.pinned,new Date().toISOString(),c.comment_id)],result:{commentId:c.comment_id}};
  });
 }
 function bucket(){if(!env.LESSON_MEDIA_BUCKET?.put||!env.LESSON_MEDIA_BUCKET?.get)throw fail('Private lesson storage is not configured.',503,'MEDIA_STORAGE_REQUIRED');return env.LESSON_MEDIA_BUCKET;}
 async function upload(request,input){
  await ready();const row=await lesson(input.lessonId);staff(row);
  if(!/^[a-f0-9-]{36}$/i.test(input.operationId||''))throw fail('This change needs its retry identifier.');
  if(!Number.isSafeInteger(input.size)||input.size<5||input.size>MEDIA_PDF_LIMIT)throw fail('Choose a PDF up to 16 MB.',413);
  if(!/^[a-f0-9]{64}$/.test(input.sha256||''))throw fail('This upload needs its file checksum.');
  const filename=cleanText(input.filename,180,'a filename').replace(/[\r\n\x00-\x1f\\/]/g,'_');
  const hash=await payloadHash({action:'pdf-upload',input}),saved=await receipt(input,hash);if(saved)return saved;
  revision(row,input);
  const id=crypto.randomUUID(),key='lessons/'+id+'.pdf',storage=bucket();let stored=false;
  try{
   await streamPdf(request,storage,key,input);stored=true;
   const result=await change('pdf-upload',input,row,'staff',async current=>{
    revision(current,input);if((await assets(row.lesson_id)).filter(a=>a.kind==='PDF').length>=10)throw fail('Use up to ten PDFs per lesson.');
    const now=new Date().toISOString();return {statements:[p("INSERT INTO lesson_media_assets(asset_id,activity_key,kind,object_key,filename,byte_size,created_at) VALUES(?,?,'PDF',?,?,?,?)",id,MOU_MEDIA_PROGRAM,key,filename,input.size,now),p('INSERT INTO lesson_media_links VALUES(?,?)',row.lesson_id,id),p('UPDATE lesson_media_lessons SET revision=revision+1,updated_at=? WHERE lesson_id=?',now,row.lesson_id)],result:{assetId:id,filename}};
   });
   if(result.assetId!==id)await storage.delete(key);return result;
  }catch(e){if(stored)await storage.delete(key).catch(()=>{});throw e;}
 }
 async function download(input){
  const row=await lesson(input.lessonId);if(!manages(row))reader(row);
  const asset=await p("SELECT a.* FROM lesson_media_links l JOIN lesson_media_assets a USING(asset_id) WHERE l.lesson_id=? AND a.asset_id=? AND a.kind='PDF'",row.lesson_id,String(input.assetId||'')).first();if(!asset)throw fail('PDF not found.',404);
  const object=await bucket().get(asset.object_key);if(!object)throw fail('This PDF is temporarily unavailable.',404);
  return new Response(object.body,{headers:{'Content-Type':'application/pdf','Content-Length':String(asset.byte_size),'Content-Disposition':`inline; filename*=UTF-8''${encodeURIComponent(asset.filename)}`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':'sandbox'}});
 }
 async function run(action,input){
  await ready();if(action==='list')return list(input);if(action==='save')return save(input);if(action==='comments')return comments(input);if(action==='comment-save')return commentSave(input);if(action==='comment-moderate')return moderate(input);
  if(action==='download')return download(input);
  const row=await lesson(input.lessonId);
  if(action==='get'){staff(row);return {lesson:dto(row),assets:await assets(row.lesson_id,true)};}
  if(action==='watch'){
   reader(row);const a=await p("SELECT a.youtube_id FROM lesson_media_links l JOIN lesson_media_assets a USING(asset_id) WHERE l.lesson_id=? AND a.asset_id=? AND a.kind='YOUTUBE'",row.lesson_id,String(input.assetId||'')).first();if(!a)throw fail('Recording not found.',404);
   return {embedUrl:'https://www.youtube-nocookie.com/embed/'+a.youtube_id+'?rel=0',title:row.title};
  }
  if(action==='attachment-remove'){staff(row);return change(action,input,row,'staff',async current=>{revision(current,input);const a=await p('SELECT 1 ok FROM lesson_media_links WHERE lesson_id=? AND asset_id=?',row.lesson_id,input.assetId).first();if(!a)throw fail('Attachment not found.',404);return {statements:[p('DELETE FROM lesson_media_links WHERE lesson_id=? AND asset_id=?',row.lesson_id,input.assetId),p('UPDATE lesson_media_lessons SET revision=revision+1 WHERE lesson_id=?',row.lesson_id)],result:{removed:true}};});}
  throw fail('Unknown media action.',404);
 }
 return {run,upload};
}

async function streamPdf(request,storage,key,input){
 const reader=request.body?.getReader();if(!reader)throw fail('Choose a PDF.');
 const chunks=[];let bytes=0;
 while(bytes<5){const next=await reader.read();if(next.done)break;chunks.push(next.value);bytes+=next.value.length;if(bytes>input.size){await reader.cancel();throw fail('The file size changed.');}}
 const prefix=new Uint8Array(5);let offset=0;for(const chunk of chunks){const take=Math.min(5-offset,chunk.length);if(take>0)prefix.set(chunk.subarray(0,take),offset);offset+=take;}
 if(new TextDecoder().decode(prefix)!=='%PDF-'){await reader.cancel();throw fail('Choose a valid PDF file.');}
 const stream=typeof FixedLengthStream==='function'?new FixedLengthStream(input.size):new TransformStream(),writer=stream.writable.getWriter();
 const pump=(async()=>{let size=0;try{for(const chunk of chunks){size+=chunk.length;await writer.write(chunk);}while(true){const next=await reader.read();if(next.done)break;size+=next.value.length;if(size>input.size)throw fail('The file size changed.');await writer.write(next.value);}if(size!==input.size)throw fail('The upload was interrupted.');await writer.close();}catch(e){await reader.cancel().catch(()=>{});await writer.abort(e).catch(()=>{});throw e;}})();
 const put=storage.put(key,stream.readable,{sha256:input.sha256,httpMetadata:{contentType:'application/pdf'}}).catch(async e=>{await writer.abort(e).catch(()=>{});await reader.cancel().catch(()=>{});throw e;});
 const results=await Promise.allSettled([pump,put]),failed=results.find(r=>r.status==='rejected');if(failed)throw failed.reason;
}
