import {managementError as fail} from './management-store.js';
import {isAdminWorkspace,administers} from './workspace-access.js';
import {fileKind} from '../../../../academy/course-websites/model.mjs';

const text=(value,max,label,required=false)=>{if(typeof value!=='string'||value.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)||required&&!value.trim())throw fail('Enter '+label+' (up to '+max+' characters).');return value.trim();};
export function normalizeWebsiteCards(value){
 if(!Array.isArray(value)||value.length>160)throw fail('Keep up to 160 website cards in the table.');
 const ids=new Set();
 const rows=value.map(row=>{
  if(!row||typeof row!=='object'||typeof row.id!=='string'||!/^[a-z0-9][a-z0-9-]{0,79}$/.test(row.id)||ids.has(row.id))throw fail('Every website card needs a different reference.');ids.add(row.id);
  if(!['plum','rose','sage','gold'].includes(row.tone)||typeof row.visible!=='boolean')throw fail('Choose a card colour and visibility.');
  let image=null;
  if(row.image){const i=row.image;if(!/^[a-f0-9]{64}$/.test(i.sha256)||!['image/png','image/jpeg','image/webp'].includes(i.type)||!Number.isSafeInteger(i.size)||i.size<8||i.size>5*1024*1024)throw fail('Choose a valid card image up to 5 MB.');image={sha256:i.sha256,type:i.type,size:i.size,alt:text(i.alt,240,'an image description',true)};}
  return {id:row.id,title:text(row.title,160,'a card title',true),arabic:text(row.arabic||'',160,'an Arabic heading'),summary:text(row.summary||'',700,'a card summary'),contactMessage:text(row.contactMessage||'Contact Admin to receive access.',700,'a contact message',true),tone:row.tone,visible:row.id==='foundations'?true:row.visible,...(row.id==='foundations'?{access:'public'}:{}),image};
 });
 if(new TextEncoder().encode(JSON.stringify(rows)).length>80000)throw fail('Keep the combined card text below 80 KB. Shorten the summaries or popup messages.');
 return rows.sort((a,b)=>Number(b.id==='foundations')-Number(a.id==='foundations'));
}
export const websiteCardImageKey=(env,key,hash)=>(env.ACADEMY_OBJECT_NAMESPACE||'')+'public-website-cards/'+encodeURIComponent(key.toUpperCase())+'/'+hash;
export async function checkWebsiteCardImages(cards,key,env){
 for(const card of cards.filter(c=>c.image)){
  const object=await env.LESSON_MEDIA_BUCKET?.head(websiteCardImageKey(env,key,card.image.sha256));
  if(!object||object.size!==card.image.size||object.httpMetadata?.contentType!==card.image.type)throw fail('A card image is missing or changed. Upload it again.');
 }
}
export async function uploadWebsiteCardImage(request,repository,auth,env,input){
 const key=input.activityKey;
 if(typeof key!=='string'||!/^PROGRAM:[^:]{1,160}$/.test(key)||!isAdminWorkspace(auth)||!administers(auth,key))throw fail('Open Admin for this Program to upload a card image.',403,'FORBIDDEN');
 const area=await repository.db.prepare("SELECT 1 ok FROM activities WHERE activity_key=? AND kind='PROGRAM' AND active=1 AND lifecycle='ACTIVE'").bind(key).first();
 if(!area)throw fail('This Program is unavailable.',403,'FORBIDDEN');
 const image=normalizeWebsiteCards([{id:'upload',title:'Image',tone:'plum',visible:false,image:input}])[0].image;
 if(!image||!env.LESSON_MEDIA_BUCKET?.put)throw fail('Card image storage is unavailable.',503);
 const reader=request.body?.getReader();if(!reader)throw fail('Choose a card image.');
 const bytes=new Uint8Array(image.size);let size=0;
 while(true){const part=await reader.read();if(part.done)break;if(size+part.value.length>bytes.length){await reader.cancel();throw fail('The image size changed.',413);}bytes.set(part.value,size);size+=part.value.length;}
 if(size!==bytes.length||fileKind(bytes.slice(0,16))!==image.type)throw fail('Choose a valid PNG, JPEG or WebP image.');
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');if(hash!==image.sha256)throw fail('The image checksum changed. Choose it again.');
 await env.LESSON_MEDIA_BUCKET.put(websiteCardImageKey(env,key,hash),bytes,{sha256:hash,httpMetadata:{contentType:image.type}});
 return {image};
}
export async function publicWebsiteCards(repository){
 const result=await repository.db.prepare("SELECT a.activity_key,p.public_card_json FROM activities a JOIN program_settings p USING(activity_key) WHERE a.kind='PROGRAM' AND a.active=1 AND a.lifecycle='ACTIVE' AND a.website_visible=1 AND json_type(p.public_card_json,'$.websiteCards')='array' ORDER BY a.name LIMIT 201").all();
 return {groups:result.results.slice(0,200).map(row=>({activityKey:row.activity_key,cards:normalizeWebsiteCards(JSON.parse(row.public_card_json).websiteCards).filter(c=>c.visible).map(c=>({...c,...(c.image?{image:{...c.image,url:'/api/academy/website-card-image?program='+encodeURIComponent(row.activity_key.slice(8))+'&card='+encodeURIComponent(c.id)}}:{})}))}))};
}
export async function publicWebsiteCardImage(request,repository,env){
 const query=new URL(request.url).searchParams,program=query.get('program'),id=query.get('card');
 if(!program||program.length>160||program.includes(':')||!id||!/^[a-z0-9][a-z0-9-]{0,79}$/.test(id))throw fail('This card image is unavailable.',404,'NOT_FOUND');
 const key='PROGRAM:'+program,row=await repository.db.prepare("SELECT p.public_card_json FROM program_settings p JOIN activities a USING(activity_key) WHERE a.activity_key=? AND a.active=1 AND a.lifecycle='ACTIVE' AND a.website_visible=1").bind(key).first();
 const card=row?normalizeWebsiteCards(JSON.parse(row.public_card_json).websiteCards||[]).find(c=>c.id===id&&c.visible):null;
 const object=card?.image?await env.LESSON_MEDIA_BUCKET?.get(websiteCardImageKey(env,key,card.image.sha256)):null;
 if(!object)throw fail('This card image is unavailable.',404,'NOT_FOUND');
 return new Response(request.method==='HEAD'?null:object.body,{headers:{'Content-Type':card.image.type,'Content-Length':String(card.image.size),'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox"}});
}
