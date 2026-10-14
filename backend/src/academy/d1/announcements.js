import {managementStore,managementError as fail} from './management-store.js';
import {authenticatedD1Account} from './session.js';
const limit=5*1024*1024;
const dto=r=>({id:r.announcement_id,title:r.title,message:r.message,active:Boolean(r.active),order:r.display_order,imageUrl:r.image_key?'/api/academy/announcements/image?id='+encodeURIComponent(r.announcement_id)+'&v='+r.revision:'',imageAlt:r.image_alt||r.title,imageName:r.image_name||'',revision:r.revision,updatedAt:r.updated_at});
const admin=auth=>{if(!auth?.state.account.global_admin)throw fail('Only Global Admin can manage Academy announcements.',403,'FORBIDDEN');};
export async function publicAnnouncements(repository){const rows=(await repository.db.prepare('SELECT * FROM academy_announcements WHERE active=1 AND deleted_at IS NULL ORDER BY display_order,created_at DESC').all()).results;return {announcements:rows.map(r=>{const {id,title,message,imageUrl,imageAlt}=dto(r);return {id,title,message,imageUrl,imageAlt};})};}
export async function announcementImage(request,repository,env){
 const auth=request.headers.has('Authorization')?await authenticatedD1Account(request,env,repository):null;
 const row=await repository.db.prepare('SELECT * FROM academy_announcements WHERE announcement_id=? AND deleted_at IS NULL').bind(new URL(request.url).searchParams.get('id')||'').first();
 if(!row?.image_key||!row.active&&!auth?.state.account.global_admin)throw fail('Announcement image not found.',404,'NOT_FOUND');
 const object=await env.LESSON_MEDIA_BUCKET?.get(row.image_key);if(!object)throw fail('Announcement image not found.',404,'NOT_FOUND');
 return new Response(request.method==='HEAD'?null:object.body,{headers:{'Content-Type':row.image_type,'Content-Length':String(row.image_bytes),'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
}
export async function announcementUpload(request){
 const reader=request.body?.getReader(),parts=[];let size=0;
 if(reader)while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit+32768){await reader.cancel();throw fail('Choose an image smaller than 5 MB.',413,'REQUEST_TOO_LARGE');}parts.push(value);}
 let form,input;try{form=await new Response(new Blob(parts),{headers:{'Content-Type':request.headers.get('Content-Type')||''}}).formData();const metadata=form.get('metadata');if(typeof metadata!=='string'||metadata.length>16000)throw Error();input=JSON.parse(metadata);}catch{throw fail('Invalid announcement details.');}
 if(!input||typeof input!=='object'||Array.isArray(input))throw fail('Invalid announcement details.');
 const file=form.get('image');let image=null;
 if(file&&typeof file.arrayBuffer==='function'&&file.size){
  if(file.size>limit)throw fail('Choose an image smaller than 5 MB.',413);
  const bytes=new Uint8Array(await file.arrayBuffer()),type=file.type;
  const valid=type==='image/jpeg'&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255||type==='image/png'&&[137,80,78,71,13,10,26,10].every((b,i)=>bytes[i]===b)||type==='image/webp'&&new TextDecoder().decode(bytes.slice(0,4))==='RIFF'&&new TextDecoder().decode(bytes.slice(8,12))==='WEBP';
  if(!valid)throw fail('Upload a JPEG, PNG or WebP image.');
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
  image={bytes,type,name:String(file.name||'image').slice(0,200),size:file.size,hash};
 }
 return {input,image};
}
export function announcements(repository,auth,env){
 admin(auth);const store=managementStore(repository,auth),p=store.p;
 const load=()=>store.load({announcements:p('SELECT * FROM academy_announcements WHERE deleted_at IS NULL')});
 async function cleanup(key){if(!key)return;try{const linked=await p('SELECT 1 FROM academy_announcements WHERE image_key=? AND deleted_at IS NULL',key).first();if(!linked)await env.LESSON_MEDIA_BUCKET?.delete(key);}catch{console.warn('announcement_image_cleanup_pending');}}
 return {async run(action,input={},image=null){
  if(action==='list'){const d=await load();return {announcements:d.announcements.sort((a,b)=>a.display_order-b.display_order||b.created_at.localeCompare(a.created_at)).map(dto)};}
  if(!['save','delete'].includes(action))throw fail('Unknown announcement action.',404);
  const id=String(input.id||'');if(!/^[a-f0-9-]{36}$/i.test(id))throw fail('Invalid announcement identifier.');
  const clean={id,revision:input.revision,operationId:input.operationId};
  if(action==='save'){
   for(const [name,max]of [['title',160],['message',6000],['imageAlt',300]]){if(typeof input[name]!=='string'||input[name].length>max)throw fail('Enter a shorter '+name+'.');clean[name]=input[name].trim();}
   if(!clean.title)throw fail('Enter an announcement heading.');
   if(typeof input.active!=='boolean'||!Number.isInteger(input.order)||input.order<0||input.order>9999||typeof input.removeImage!=='boolean')throw fail('Choose an announcement status and order.');
   Object.assign(clean,{active:input.active,order:input.order,removeImage:input.removeImage,image:image?{hash:image.hash,type:image.type,name:image.name,size:image.size}:null});
  }
  const newKey=image?'academy-announcements/'+id+'/'+input.operationId+'/'+image.hash:null;
  let result;
  try{result=await store.change('ANNOUNCEMENTS','ACADEMY',action,clean,async()=>{
   const d=await load(),row=d.announcements.find(r=>r.announcement_id===id);
   if(input.revision!==(row?.revision||0)||action==='delete'&&!row)throw fail('This announcement changed elsewhere. Your entry is kept; reload the saved list.',409,'ROW_CHANGED');
   if(action==='save'&&!row&&d.announcements.length>=200)throw fail('Keep up to 200 current announcements. Delete unused entries before adding more.');
   const at=new Date().toISOString(),revision=(row?.revision||0)+1,statements=[];let saved;
   if(action==='delete')statements.push(p('UPDATE academy_announcements SET deleted_at=?,active=0,revision=?,updated_at=?,updated_by=? WHERE announcement_id=?',at,revision,at,auth.user.accountid,id));
   else{
    const keep=!input.removeImage&&!image, imageKey=newKey||(keep?row?.image_key:null)||null;
    if(!clean.message&&!imageKey)throw fail('Add a message or an image.');
    if(image){if(!env.LESSON_MEDIA_BUCKET)throw fail('Image storage is unavailable.',503);await env.LESSON_MEDIA_BUCKET.put(newKey,image.bytes,{httpMetadata:{contentType:image.type}});}
    saved={announcement_id:id,title:clean.title,message:clean.message,active:Number(clean.active),display_order:clean.order,image_key:imageKey,image_name:image?.name||(keep?row?.image_name:null)||null,image_type:image?.type||(keep?row?.image_type:null)||null,image_bytes:image?.size||(keep?row?.image_bytes:null)||null,image_alt:clean.imageAlt,revision,created_at:row?.created_at||at,updated_at:at,updated_by:auth.user.accountid,deleted_at:null};
    const fields=Object.keys(saved);statements.push(p('INSERT INTO academy_announcements('+fields.join(',')+') VALUES('+fields.map(()=>'?').join(',')+') ON CONFLICT(announcement_id) DO UPDATE SET '+fields.filter(k=>k!=='announcement_id').map(k=>k+'=excluded.'+k).join(','),...Object.values(saved)));
   }
   return {data:d,statements,result:{saved:true,announcement:saved?dto(saved):null,oldImageKey:row?.image_key&&row.image_key!==saved?.image_key?row.image_key:null},fields:['Announcement']};
  });}catch(error){throw error;}
  await cleanup(result.oldImageKey);const {oldImageKey,...visible}=result;return visible;
 }};
}
