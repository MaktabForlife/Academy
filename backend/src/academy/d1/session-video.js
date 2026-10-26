import {managementError as fail} from './management-store.js';
import {cleanText} from './assessment-store.js';
import {createSessionToken,verifySessionToken} from '../../lib/auth-primitives.js';
import {payloadHash} from '../../programs/timetable-model.js';
import {selectWorkspace} from './workspace-access.js';
import {d1ContextEqual} from './session.js';

export const VIDEO_RETENTION_MS=14*86400000;
export const VIDEO_PART_SIZE=8*1024*1024;
export const VIDEO_MAX_SIZE=512*1024*1024;
const audience='academy-session-recording';
export function videoExpiry(asset,now=Date.now()){
 const expiresAt=new Date(Date.parse(asset.created_at)+VIDEO_RETENTION_MS).toISOString();
 return {uploadedAt:asset.created_at,expiresAt,expired:Date.parse(expiresAt)<=now};
}
const identity=auth=>({accountid:auth.user.accountid,sid:auth.sid,epoch:auth.state.account.credential_epoch,scope:auth.context.scope,courseid:auth.context.courseId,role:auth.context.role,workspace:auth.workspaceContext||auth.workspace||'ADMIN',classView:auth.classView||null});
async function issue(auth,env,purpose,details){return createSessionToken({...identity(auth),aud:audience,purpose,until:Date.now()+2*3600000,...details},env);}
async function verify(value,env,purpose){
 if(typeof value!=='string'||value.length>7000)throw fail('Recording access has expired. Reopen the recording.',401,'VIDEO_ACCESS_EXPIRED');
 const ticket=await verifySessionToken(value,env);
 if(!ticket||ticket.aud!==audience||ticket.purpose!==purpose||!Number.isFinite(ticket.until)||ticket.until<=Date.now())throw fail('Recording access has expired. Reopen the recording.',401,'VIDEO_ACCESS_EXPIRED');
 return ticket;
}
// A playback URL contains a narrow, short-lived grant, never the account token.
// Re-resolve the live session and audience on every seek/range request.
export async function authenticateVideo(request,env,repository){
 const ticket=await verify(new URL(request.url).searchParams.get('ticket'),env,'playback');
 const state=await repository.session(ticket.sid,ticket.accountid,ticket.epoch);
 const context=state?.contexts.find(c=>d1ContextEqual(c,{scope:ticket.scope,courseId:ticket.courseid,role:ticket.role}));
 if(!state||!context)throw fail('Your Academy session has ended.',401,'SESSION_ENDED');
 const headers=new Headers({'X-Academy-Workspace':ticket.workspace});
 if(ticket.classView)headers.set('X-Academy-Class',encodeURIComponent(JSON.stringify(ticket.classView)));
 const auth=selectWorkspace(new Request(request.url,{headers}),{state,sid:ticket.sid,context,user:{type:'account',accountid:state.account.account_id,uniqueid:state.account.login_link_id,username:state.account.display_name,role:state.account.global_admin?'GLOBAL_ADMIN':context.role,scope:context.scope,courseid:context.courseId}});
 return {auth,input:{lessonId:ticket.lessonId,assetId:ticket.assetId}};
}
export function sessionVideos({p,auth,env,lesson,staff,reader,revision,change,receipt,assets,scopeKey}){
 function bucket(){const b=env.LESSON_MEDIA_BUCKET;if(!b?.createMultipartUpload||!b?.resumeMultipartUpload||!b?.head)throw fail('Recording storage is not configured.',503,'VIDEO_STORAGE_REQUIRED');return b;}
 async function uploadTicket(input){
  const t=await verify(input.uploadToken,env,'upload');
  if(t.accountid!==auth.user.accountid||t.sid!==auth.sid||t.workspace!==(auth.workspaceContext||auth.workspace||'ADMIN')||t.lessonId!==input.lessonId)throw fail('This upload belongs to another session.',403,'MEDIA_FORBIDDEN');
  const row=await lesson(t.lessonId);staff(row);return {t,row};
 }
 const metadata=t=>({lessonId:t.lessonId,operationId:t.operationId,revision:t.revision,filename:t.filename,name:t.name,size:t.size,assetId:t.assetId});
 async function replay(t){const input=metadata(t);return receipt(input,await payloadHash({action:'video-upload',input}));}
 async function start(input){
  const row=await lesson(input.lessonId);staff(row);revision(row,input);
  if(row.media_scope==='COURSE')throw fail('Attach recordings to a session.');
  if(!/^[a-f0-9-]{36}$/i.test(input.operationId||''))throw fail('This upload needs its retry identifier.');
  if(!Number.isSafeInteger(input.size)||input.size<12||input.size>VIDEO_MAX_SIZE)throw fail('Choose an MP4 up to 512 MB.',413);
  const filename=cleanText(input.filename,180,'an MP4 filename').replace(/[\r\n\x00-\x1f\\/]/g,'_');
  if(!/\.mp4$/i.test(filename))throw fail('Choose an MP4 video.');
  if((await assets(row.lesson_id)).filter(a=>['MP4','YOUTUBE'].includes(a.kind)&&!a.expired).length>=10)throw fail('Use up to ten videos per session.');
  const assetId=crypto.randomUUID(),key=(env.ACADEMY_OBJECT_NAMESPACE||'')+'session-recordings/'+assetId+'.mp4';
  const upload=await bucket().createMultipartUpload(key,{httpMetadata:{contentType:'video/mp4',cacheControl:'private, no-store'}});
  const details={lessonId:row.lesson_id,revision:input.revision,operationId:input.operationId,size:input.size,filename,name:cleanText(input.name||'',180,'a video name',true),assetId,key,uploadId:upload.uploadId};
  return {uploadToken:await issue(auth,env,'upload',details),partSize:VIDEO_PART_SIZE,maxSize:VIDEO_MAX_SIZE};
 }
 async function part(request,input){
  const {t,row}=await uploadTicket(input);revision(row,{revision:t.revision});
  const count=Math.ceil(t.size/VIDEO_PART_SIZE),number=input.partNumber;
  if(!Number.isInteger(number)||number<1||number>count)throw fail('Choose a valid upload part.');
  const expected=Math.min(VIDEO_PART_SIZE,t.size-(number-1)*VIDEO_PART_SIZE),r=request.body?.getReader();
  if(!r)throw fail('The video upload is empty.');
  // Buffer one bounded part, never the complete recording.
  const bytes=new Uint8Array(expected);let size=0;
  try{while(true){const next=await r.read();if(next.done)break;if(size+next.value.length>expected)throw fail('This upload part is too large.',413);bytes.set(next.value,size);size+=next.value.length;}}
  catch(e){await r.cancel().catch(()=>{});throw e;}
  if(size!==expected)throw fail('The upload was interrupted. Retry this part.');
  if(number===1&&String.fromCharCode(...bytes.slice(4,8))!=='ftyp')throw fail('This file is not an MP4 video.');
  return bucket().resumeMultipartUpload(t.key,t.uploadId).uploadPart(number,bytes);
 }
 async function complete(input){
  const {t,row}=await uploadTicket(input),saved=await replay(t);if(saved)return saved;
  revision(row,{revision:t.revision});
  const count=Math.ceil(t.size/VIDEO_PART_SIZE),parts=input.parts;
  if(!Array.isArray(parts)||parts.length!==count||parts.some((v,i)=>!v||v.partNumber!==i+1||typeof v.etag!=='string'||!v.etag||v.etag.length>200))throw fail('Finish uploading every video part.');
  const storage=bucket();let object=await storage.head(t.key);
  if(!object)object=await storage.resumeMultipartUpload(t.key,t.uploadId).complete(parts.map(({partNumber,etag})=>({partNumber,etag})));
  if(object.size!==t.size||object.httpMetadata?.contentType!=='video/mp4')throw fail('The uploaded video size does not match.',409);
  const createdAt=new Date(object.uploaded||Date.now()).toISOString();
  if(Date.parse(createdAt)+VIDEO_RETENTION_MS<=Date.now())throw fail('This recording has expired.',410,'VIDEO_EXPIRED');
  return change('video-upload',metadata(t),row,'staff',async current=>{
   revision(current,{revision:t.revision});
   if((await assets(row.lesson_id)).filter(a=>['MP4','YOUTUBE'].includes(a.kind)&&!a.expired).length>=10)throw fail('Use up to ten videos per session.');
   return {statements:[p("INSERT INTO lesson_media_assets(asset_id,activity_key,kind,object_key,filename,byte_size,created_at,display_name) VALUES(?,?,'MP4',?,?,?,?,?)",t.assetId,scopeKey(),t.key,t.filename,t.size,createdAt,t.name),p('INSERT INTO lesson_media_links VALUES(?,?)',row.lesson_id,t.assetId),p('UPDATE lesson_media_lessons SET revision=revision+1,updated_at=? WHERE lesson_id=?',new Date().toISOString(),row.lesson_id)],result:{assetId:t.assetId,filename:t.filename,name:t.name||t.filename,...videoExpiry({created_at:createdAt})}};
  });
 }
 async function abort(input){const {t}=await uploadTicket(input);await bucket().resumeMultipartUpload(t.key,t.uploadId).abort();return {aborted:true};}
 async function watch(row,asset){
  if(videoExpiry(asset).expired)throw fail('This recording expired 14 days after upload.',410,'VIDEO_EXPIRED');
  const ticket=await issue(auth,env,'playback',{lessonId:row.lesson_id,assetId:asset.asset_id});
  return {kind:'MP4',playbackPath:'/api/academy/lesson-media/video?ticket='+encodeURIComponent(ticket),title:asset.display_name||asset.filename,...videoExpiry(asset)};
 }
 async function stream(request,input){
  const row=await lesson(input.lessonId);reader(row);
  const asset=await p("SELECT a.* FROM lesson_media_links l JOIN lesson_media_assets a USING(asset_id) WHERE l.lesson_id=? AND a.asset_id=? AND a.kind='MP4'",row.lesson_id,String(input.assetId||'')).first();
  if(!asset)throw fail('Recording not found.',404);
  if(videoExpiry(asset).expired)throw fail('This recording expired 14 days after upload.',410,'VIDEO_EXPIRED');
  const storage=bucket(),object=await storage.head(asset.object_key);
  if(!object)throw fail('This recording has expired or is unavailable.',410,'VIDEO_EXPIRED');
  const headers=new Headers({'Content-Type':'video/mp4','Accept-Ranges':'bytes','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Length':String(object.size)});
  let range=null;const value=request.headers.get('Range');
  if(value){
   const match=/^bytes=(\d*)-(\d*)$/.exec(value);let start=0,end=object.size-1;
   if(match&&(match[1]||match[2])){if(match[1]){start=Number(match[1]);if(match[2])end=Math.min(Number(match[2]),end);}else start=Math.max(0,object.size-Number(match[2]));}
   if(!match||!match[1]&&!match[2]||!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||end<start||start>=object.size||!match[1]&&Number(match[2])===0){headers.set('Content-Range','bytes */'+object.size);headers.delete('Content-Length');return new Response(null,{status:416,headers});}
   range={offset:start,length:end-start+1};headers.set('Content-Range',`bytes ${start}-${end}/${object.size}`);headers.set('Content-Length',String(range.length));
  }
  if(request.method==='HEAD')return new Response(null,{status:range?206:200,headers});
  const data=await storage.get(asset.object_key,range?{range}:undefined);
  if(!data)throw fail('This recording has expired or is unavailable.',410,'VIDEO_EXPIRED');
  return new Response(data.body,{status:range?206:200,headers});
 }
 return {start,part,complete,abort,watch,stream};
}
