import {managementStore,managementError as fail} from './management-store.js';
import {authenticatedD1Account} from './session.js';

const imageLimit=5*1024*1024,pdfLimit=10*1024*1024;
const pdfSetting=id=>'AnnouncementPdf:'+id;
// Each announcement has at most one PDF. The indexed settings join keeps public
// reads to one query and updates attachment metadata in the guarded transaction.
const readSQL="SELECT a.*,p.setting_value AS pdf_json FROM academy_announcements a LEFT JOIN academy_settings p ON p.setting_key='AnnouncementPdf:'||a.announcement_id";
function attachment(row){try{const p=JSON.parse(row?.pdf_json||'null');return p&&typeof p.key==='string'&&typeof p.name==='string'&&Number.isInteger(p.bytes)?p:null;}catch{return null;}}
const pdfUrl=id=>'/api/academy/announcements/pdf?id='+encodeURIComponent(id);
function dto(r){const pdf=attachment(r);return {id:r.announcement_id,title:r.title,message:r.message,active:Boolean(r.active),order:r.display_order,imageUrl:r.image_key?'/api/academy/announcements/image?id='+encodeURIComponent(r.announcement_id)+'&v='+r.revision:'',imageAlt:r.image_alt||r.title,imageName:r.image_name||'',pdfUrl:pdf?pdfUrl(r.announcement_id):'',pdfName:pdf?.name||'',pdfBytes:pdf?.bytes||0,revision:r.revision,updatedAt:r.updated_at};}
const admin=auth=>{if(!auth?.state.account.global_admin)throw fail('Only Global Admin can manage Academy announcements.',403,'FORBIDDEN');};

export async function publicAnnouncements(repository){
 const rows=(await repository.db.prepare(readSQL+' WHERE a.active=1 AND a.deleted_at IS NULL ORDER BY a.display_order,a.created_at DESC').all()).results;
 return {announcements:rows.map(r=>{const {id,title,message,imageUrl,imageAlt,pdfUrl,pdfName,pdfBytes}=dto(r);return {id,title,message,imageUrl,imageAlt,pdfUrl,pdfName,pdfBytes};})};
}
async function readableAnnouncement(request,repository,env){
 const auth=request.headers.has('Authorization')?await authenticatedD1Account(request,env,repository):null;
 const row=await repository.db.prepare(readSQL+' WHERE a.announcement_id=? AND a.deleted_at IS NULL').bind(new URL(request.url).searchParams.get('id')||'').first();
 return row&&(row.active||auth?.state.account.global_admin)?row:null;
}
export async function announcementImage(request,repository,env){
 const row=await readableAnnouncement(request,repository,env);
 const object=row?.image_key?await env.LESSON_MEDIA_BUCKET?.get(row.image_key):null;
 if(!object)throw fail('Announcement image not found.',404,'NOT_FOUND');
 return new Response(request.method==='HEAD'?null:object.body,{headers:{'Content-Type':row.image_type,'Content-Length':String(row.image_bytes),'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
}
export async function announcementPdf(request,repository,env){
 const pdf=attachment(await readableAnnouncement(request,repository,env));
 const object=pdf?await env.LESSON_MEDIA_BUCKET?.get(pdf.key):null;
 if(!object)throw fail('Announcement PDF not found.',404,'NOT_FOUND');
 const filename=encodeURIComponent(pdf.name).replace(/['()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase());
 return new Response(request.method==='HEAD'?null:object.body,{headers:{'Content-Type':'application/pdf','Content-Length':String(pdf.bytes),'Content-Disposition':"inline; filename=\"announcement.pdf\"; filename*=UTF-8''"+filename,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
}
async function uploadFile(file,kind){
 if(!file||typeof file.arrayBuffer!=='function')return null;
 const isPdf=kind==='pdf',limit=isPdf?pdfLimit:imageLimit;
 if(!file.size)throw fail(isPdf?'Choose a non-empty PDF file.':'Choose a non-empty image.');
 if(file.size>limit)throw fail(isPdf?'Choose a PDF up to 10 MB.':'Choose an image up to 5 MB.',413);
 const bytes=new Uint8Array(await file.arrayBuffer()),type=file.type;
 const valid=isPdf?/\.pdf$/i.test(file.name)&&['application/pdf','application/octet-stream',''].includes(type)&&new TextDecoder().decode(bytes.slice(0,5))==='%PDF-':
  type==='image/jpeg'&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255||type==='image/png'&&[137,80,78,71,13,10,26,10].every((b,i)=>bytes[i]===b)||type==='image/webp'&&new TextDecoder().decode(bytes.slice(0,4))==='RIFF'&&new TextDecoder().decode(bytes.slice(8,12))==='WEBP';
 if(!valid)throw fail(isPdf?'Upload a PDF file.':'Upload a JPEG, PNG or WebP image.');
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
 return {bytes,type:isPdf?'application/pdf':type,name:String(file.name||kind).replace(/[\r\n\x00-\x1f\x7f]/g,'').slice(0,200),size:file.size,hash};
}
export async function announcementUpload(request){
 const reader=request.body?.getReader(),parts=[];let size=0;
 if(reader)while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>imageLimit+pdfLimit+32768){await reader.cancel();throw fail('Uploads exceed the 5 MB image and 10 MB PDF limits.',413,'REQUEST_TOO_LARGE');}parts.push(value);}
 let form,input;try{form=await new Response(new Blob(parts),{headers:{'Content-Type':request.headers.get('Content-Type')||''}}).formData();const metadata=form.get('metadata');if(typeof metadata!=='string'||metadata.length>16000)throw Error();input=JSON.parse(metadata);}catch{throw fail('Invalid announcement details.');}
 if(!input||typeof input!=='object'||Array.isArray(input))throw fail('Invalid announcement details.');
 return {input,image:await uploadFile(form.get('image'),'image'),pdf:await uploadFile(form.get('pdf'),'pdf')};
}
export function announcements(repository,auth,env){
 admin(auth);const store=managementStore(repository,auth),p=store.p;
 const load=()=>store.load({announcements:p(readSQL+' WHERE a.deleted_at IS NULL')});
 async function cleanup(key,kind){
  if(!key)return;
  try{
   const linked=await (kind==='pdf'?p(readSQL+" WHERE a.deleted_at IS NULL AND json_extract(p.setting_value,'$.key')=? LIMIT 1",key):p('SELECT 1 FROM academy_announcements WHERE image_key=? AND deleted_at IS NULL',key)).first();
   if(!linked)await env.LESSON_MEDIA_BUCKET?.delete(key);
  }catch{console.warn('announcement_attachment_cleanup_pending');}
 }
 return {async run(action,input={},image=null,pdf=null){
  if(action==='list'){const d=await load();return {announcements:d.announcements.sort((a,b)=>a.display_order-b.display_order||b.created_at.localeCompare(a.created_at)).map(dto)};}
  if(!['save','delete'].includes(action))throw fail('Unknown announcement action.',404);
  const id=String(input.id||'');if(!/^[a-f0-9-]{36}$/i.test(id))throw fail('Invalid announcement identifier.');
  const clean={id,revision:input.revision,operationId:input.operationId};
  if(action==='save'){
   for(const [name,max]of [['title',160],['message',6000],['imageAlt',300]]){if(typeof input[name]!=='string'||input[name].length>max)throw fail('Enter a shorter '+name+'.');clean[name]=input[name].trim();}
   if(!clean.title)throw fail('Enter an announcement heading.');
   if(typeof input.active!=='boolean'||!Number.isInteger(input.order)||input.order<0||input.order>9999||typeof input.removeImage!=='boolean'||Object.hasOwn(input,'removePdf')&&typeof input.removePdf!=='boolean')throw fail('Choose an announcement status and order.');
   Object.assign(clean,{active:input.active,order:input.order,removeImage:input.removeImage,image:image?{hash:image.hash,type:image.type,name:image.name,size:image.size}:null});
   // Preserve the receipt hash for saves pending in older website versions.
   if(pdf||Object.hasOwn(input,'removePdf'))Object.assign(clean,{removePdf:input.removePdf===true,pdf:pdf?{hash:pdf.hash,type:pdf.type,name:pdf.name,size:pdf.size}:null});
  }
  const prefix='academy-announcements/'+id+'/'+input.operationId+'/',newKey=image?prefix+image.hash:null,newPdfKey=pdf?prefix+pdf.hash+'.pdf':null;
  let result;
  try{result=await store.change('ANNOUNCEMENTS','ACADEMY',action,clean,async()=>{
   const d=await load(),row=d.announcements.find(r=>r.announcement_id===id),oldPdf=attachment(row);
   if(input.revision!==(row?.revision||0)||action==='delete'&&!row)throw fail('This announcement changed elsewhere. Your entry is kept; reload the saved list.',409,'ROW_CHANGED');
   if(action==='save'&&!row&&d.announcements.length>=200)throw fail('Keep up to 200 current announcements. Delete unused entries before adding more.');
   const at=new Date().toISOString(),revision=(row?.revision||0)+1,statements=[];let saved,savedPdf=null;
   if(action==='delete'){
    statements.push(p('UPDATE academy_announcements SET deleted_at=?,active=0,revision=?,updated_at=?,updated_by=? WHERE announcement_id=?',at,revision,at,auth.user.accountid,id));
    statements.push(p('DELETE FROM academy_settings WHERE setting_key=?',pdfSetting(id)));
   }else{
    const keep=!input.removeImage&&!image,imageKey=newKey||(keep?row?.image_key:null)||null;
    savedPdf=pdf?{key:newPdfKey,name:pdf.name,bytes:pdf.size}:input.removePdf?null:oldPdf;
    if(!clean.message&&!imageKey&&!savedPdf)throw fail('Add a message, image or PDF.');
    if((image||pdf)&&!env.LESSON_MEDIA_BUCKET)throw fail('Attachment storage is unavailable.',503);
    if(image)await env.LESSON_MEDIA_BUCKET.put(newKey,image.bytes,{httpMetadata:{contentType:image.type}});
    if(pdf)await env.LESSON_MEDIA_BUCKET.put(newPdfKey,pdf.bytes,{httpMetadata:{contentType:'application/pdf'}});
    saved={announcement_id:id,title:clean.title,message:clean.message,active:Number(clean.active),display_order:clean.order,image_key:imageKey,image_name:image?.name||(keep?row?.image_name:null)||null,image_type:image?.type||(keep?row?.image_type:null)||null,image_bytes:image?.size||(keep?row?.image_bytes:null)||null,image_alt:clean.imageAlt,revision,created_at:row?.created_at||at,updated_at:at,updated_by:auth.user.accountid,deleted_at:null};
    const fields=Object.keys(saved);statements.push(p('INSERT INTO academy_announcements('+fields.join(',')+') VALUES('+fields.map(()=>'?').join(',')+') ON CONFLICT(announcement_id) DO UPDATE SET '+fields.filter(k=>k!=='announcement_id').map(k=>k+'=excluded.'+k).join(','),...Object.values(saved)));
    if(pdf||input.removePdf)statements.push(savedPdf?p('INSERT INTO academy_settings(setting_key,setting_value,updated_at,updated_by_account_id) VALUES(?,?,?,?) ON CONFLICT(setting_key) DO UPDATE SET setting_value=excluded.setting_value,updated_at=excluded.updated_at,updated_by_account_id=excluded.updated_by_account_id',pdfSetting(id),JSON.stringify(savedPdf),at,auth.user.accountid):p('DELETE FROM academy_settings WHERE setting_key=?',pdfSetting(id)));
   }
   return {data:d,statements,result:{saved:true,announcement:saved?dto({...saved,pdf_json:JSON.stringify(savedPdf)}):null,oldImageKey:row?.image_key&&row.image_key!==saved?.image_key?row.image_key:null,oldPdfKey:oldPdf?.key&&oldPdf.key!==savedPdf?.key?oldPdf.key:null},fields:['Announcement']};
  });}catch(error){await cleanup(newKey,'image');await cleanup(newPdfKey,'pdf');throw error;}
  await cleanup(result.oldImageKey,'image');await cleanup(result.oldPdfKey,'pdf');const {oldImageKey,oldPdfKey,...visible}=result;return visible;
 }};
}
