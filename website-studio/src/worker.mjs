import {WorkerEntrypoint} from 'cloudflare:workers';
import {validateCourse,referencedAssets,fileKind} from '../../academy/course-websites/model.mjs';
import {siteId,canonicalSite,uuid,digest,boundedJSON,boundedBytes,sha256,json,failure,error,imageKey} from './protocol.mjs';
import {putVersion,getVersion} from './storage.mjs';
const random=()=>{const bytes=crypto.getRandomValues(new Uint8Array(32));return btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');};
const cookieName='__Host-website_studio',cookie=(value,maxAge)=>cookieName+'='+value+'; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age='+maxAge;
const validCode=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{43}$/.test(value);
const origin=env=>new URL(env.STUDIO_ORIGIN).origin;
function csrf(request,env){if(request.headers.get('Origin')!==origin(env))throw error('Open this action in Website Studio.',403,'STUDIO_ORIGIN_REQUIRED');}
async function bridge(env,token,path,input={}){
 const response=await env.ACADEMY.fetch(new Request('https://academy-studio.internal'+path,{method:'POST',headers:{Authorization:'Bearer '+token,'X-Academy-Workspace':'ADMIN','Content-Type':'application/json'},body:JSON.stringify(input)}));
 if(!response.ok){const data=await boundedJSON(response.body,4096);throw error(data.error||'Academy access is unavailable.',response.status,data.code);}
 return response;
}
const call=async(...args)=>boundedJSON((await bridge(...args)).body);
async function account(request,env){
 const id=request.headers.get('Cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith(cookieName+'='))?.slice(cookieName.length+1);if(!validCode(id))throw error('Open Website Studio from Academy.',401,'STUDIO_SIGN_IN_REQUIRED');
 const object=await env.CONTENT.get('auth/sessions/'+id+'.json');if(!object||object.size>8192)throw error('Your Studio session ended.',401,'STUDIO_SESSION_ENDED');const session=await boundedJSON(object.body,8192);if(session.expiresAt<=Date.now())throw error('Your Studio session ended.',401,'STUDIO_SESSION_ENDED');if(request.headers.has('X-Studio-Account')&&request.headers.get('X-Studio-Account')!==session.sourceTokenHash)throw error('Your Studio account changed.',401,'STUDIO_SESSION_ENDED');return {...session,id};
}
const ref=(id,state,published=false)=>({websiteId:id,key:state[published?'published_key':'draft_key'],sha256:state[published?'published_sha256':'draft_sha256']});
async function context(env,token,input){return call(env,token,'/context',canonicalSite(input));}
async function validateDocument(env,token,input,ctx,document,review=false){
 let errors;try{errors=validateCourse(document,{review});}catch(e){throw error(e.message);}
 if(review&&errors.length)throw error(errors.join(' '));if(new TextEncoder().encode(JSON.stringify(document)).length>500000)throw error('Keep website text below 500 KB.',413);
 const map=new Map(ctx.assets.map(a=>[a.id,a]));if(referencedAssets(document).some(id=>!map.has(id)))throw error('Choose files belonging to this website.');
 const images=[document.home.imageId,...document.lessons.flatMap(l=>l.sections.flatMap(s=>s.blocks.filter(b=>b.type==='image').map(b=>b.assetId)))].filter(Boolean);if(images.some(id=>!map.get(id).type.startsWith('image/')))throw error('Choose an image for each picture position.');
 if(review)for(const id of referencedAssets(document)){const a=map.get(id);if(a.source==='ACADEMY')await call(env,token,'/check-media',{...canonicalSite(input),lessonId:a.lessonId,nativeAssetId:a.nativeAssetId});}
}
async function migrate(env,token,input){
 const ctx=await context(env,token,input);if(ctx.state)return ctx;
 const source=await call(env,token,'/legacy-export',canonicalSite(input)),assetRows=[],map=new Map();
 for(const a of [...source.draft.assets,...(source.published?.assets||[])])map.set(a.id,a);
 for(const a of map.values()){
  if(!a.type.startsWith('image/'))throw error('Move legacy PDF attachments to Academy Lesson media and link them before migration.',409,'STUDIO_LEGACY_MEDIA_MAPPING_REQUIRED');
  const response=await bridge(env,token,'/legacy-asset',{...canonicalSite(input),assetId:a.id}),bytes=await boundedBytes(response.body,5*1024*1024),hash=await sha256(bytes);if(fileKind(bytes.slice(0,16))!==a.type)throw error('An existing image could not be verified.',503);
  await env.CONTENT.put(imageKey(hash),bytes,{onlyIf:{etagDoesNotMatch:'*'},httpMetadata:{contentType:a.type,cacheControl:'private, no-store'},customMetadata:{sha256:hash}});assetRows.push({id:a.id,source:'STUDIO',key:imageKey(hash),sha256:hash,name:a.name,type:a.type,size:bytes.length});
 }
 const draft=await putVersion(env.CONTENT,ctx.websiteId,{kind:'DRAFT',document:source.draft.document,assets:assetRows,previous:null});
 const published=source.published?await putVersion(env.CONTENT,ctx.websiteId,{kind:'PUBLISHED',document:source.published.document,assets:assetRows.filter(a=>referencedAssets(source.published.document).includes(a.id)),previous:null}):null;
 await call(env,token,'/commit',{...canonicalSite(input),action:'migrate',operationId:input.migrationId||crypto.randomUUID(),revision:source.draft.revision,requestSha256:await sha256(JSON.stringify({action:'migrate',sourceVersion:source.sourceVersion,draft,published})),draft,published,assets:assetRows,enabled:source.published?.enabled,sourceKind:source.sourceKind,sourceVersion:source.sourceVersion});
 return context(env,token,input);
}
async function api(request,env){
 const path=new URL(request.url).pathname;if(request.method!=='POST')throw error('Use POST.',405);csrf(request,env);
 const metadata=new URL(request.url).searchParams.get('metadata');if(metadata&&new TextEncoder().encode(metadata).length>8192)throw error('This file description is too large.',413);
 const input=path==='/api/upload'?await boundedJSON(new Response(metadata||'{}').body,8192):await boundedJSON(request.body);
 if(path==='/api/exchange'){
  if(!validCode(input.code)||!validCode(input.verifier))throw error('Reopen Website Studio from Academy.',401);
  const key='auth/handoffs/'+input.code+'.json',object=await env.CONTENT.get(key);if(!object||object.size>8192)throw error('This sign-in link expired. Open Studio again.',401);
  const ticket=await boundedJSON(object.body,8192),challenge=btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(input.verifier))))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
  if(ticket.used||ticket.expiresAt<=Date.now()||ticket.challenge!==challenge||ticket.state!==input.state)throw error('This sign-in link expired. Open Studio again.',401);
  await call(env,ticket.token,'/session');const consumed=await env.CONTENT.put(key,JSON.stringify({...ticket,used:true}),{onlyIf:{etagMatches:object.etag}});if(!consumed)throw error('This sign-in link has already been used.',401);
  const id=random(),expiresAt=Math.min(ticket.sessionExpiresAt,Date.now()+7*86400000);await env.CONTENT.put('auth/sessions/'+id+'.json',JSON.stringify({token:ticket.token,sourceTokenHash:ticket.sourceTokenHash,accountId:ticket.accountId,expiresAt}),{httpMetadata:{contentType:'application/json'}});
  return json({success:true,accountId:ticket.accountId,sourceTokenHash:ticket.sourceTokenHash,selection:ticket.selection},200,{'Set-Cookie':cookie(id,Math.max(0,Math.floor((expiresAt-Date.now())/1000)))});
 }
 const session=await account(request,env),token=session.token;
 if(path==='/api/logout'){await env.CONTENT.delete('auth/sessions/'+session.id+'.json');return json({success:true},200,{'Set-Cookie':cookie('',0)});}
 if(path==='/api/session'){const result=await call(env,token,'/session');return json({...result,sourceTokenHash:session.sourceTokenHash,academyOrigin:new URL(env.ACADEMY_ORIGIN).origin});}
 if(path==='/api/list')return bridge(env,token,'/list');
 siteId(input);const requestSha256=await sha256(JSON.stringify({path,input}));
 if(['/api/save','/api/publish','/api/withdraw','/api/upload','/api/attach'].includes(path)){if(!uuid(input.operationId))throw error('This change needs its retry identifier.');const saved=await call(env,token,'/operation',{...canonicalSite(input),operationId:input.operationId,requestSha256});if(saved.result)return json({success:true,...saved.result});}
 let ctx=await context(env,token,input);
 if(path==='/api/get'){
  if(!ctx.state)return json({...await call(env,token,'/legacy-draft',canonicalSite(input)),migrationNeeded:true});
  const saved=await getVersion(env.CONTENT,ref(ctx.websiteId,ctx.state));return json({success:true,...canonicalSite(input),name:ctx.name,revision:ctx.state.revision,enabled:Boolean(ctx.state.enabled),document:saved.document,assets:ctx.assets,preparedCopyAvailable:ctx.preparedCopyAvailable});
 }
 if(path==='/api/media')return bridge(env,token,'/media',input);
 if(path==='/api/prepared-copy')return bridge(env,token,'/legacy-prepared',input);
 if(path==='/api/migrate'){ctx=await migrate(env,token,input);return json({success:true,migrated:true,revision:ctx.state.revision});}
 if(path==='/api/asset'){
  if(!ctx.state)return bridge(env,token,'/legacy-asset',input);
  const row=ctx.assetRefs.find(a=>a.asset_id===input.assetId);if(!row)throw error('This file belongs to another website.',404);
  if(row.source==='ACADEMY'){if(row.mime_type!=='application/pdf')throw error('Open this recording through Academy Lesson media.',400);return bridge(env,token,'/media-download',{...canonicalSite(input),lessonId:row.lesson_id,nativeAssetId:row.native_asset_id});}
  const object=await env.CONTENT.get(row.object_key);if(!object)throw error('This image is temporarily unavailable.',404);return new Response(object.body,{headers:{'Content-Type':row.mime_type,'Content-Length':String(object.size),'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':'sandbox'}});
 }
 if(!uuid(input.operationId))throw error('This change needs its retry identifier.');
 ctx=await migrate(env,token,input);
 if(path==='/api/upload'){
  if(!uuid(input.assetId)||!digest(input.sha256)||!Number.isSafeInteger(input.size)||input.size<8||input.size>5*1024*1024||!['image/png','image/jpeg','image/webp'].includes(input.type))throw error('Upload images here. Attach PDFs and recordings from Academy Lesson media.');
  const bytes=await boundedBytes(request.body,5*1024*1024);if(bytes.length!==input.size||fileKind(bytes.slice(0,16))!==input.type||await sha256(bytes)!==input.sha256)throw error('The image type, size or checksum changed.');
  await env.CONTENT.put(imageKey(input.sha256),bytes,{onlyIf:{etagDoesNotMatch:'*'},httpMetadata:{contentType:input.type,cacheControl:'private, no-store'},customMetadata:{sha256:input.sha256}});
  const asset={id:input.assetId,source:'STUDIO',key:imageKey(input.sha256),sha256:input.sha256,name:input.filename,type:input.type,size:input.size};
  return json(await call(env,token,'/commit',{...canonicalSite(input),action:'asset',requestSha256,revision:ctx.state.revision,asset,operationId:input.operationId}));
 }
 if(path==='/api/attach'){
  const selected=await call(env,token,'/check-media',input),asset={id:input.assetId,source:'ACADEMY',lessonId:input.lessonId,nativeAssetId:input.nativeAssetId,name:selected.asset.name||selected.asset.filename||'Academy material',type:selected.asset.kind==='PDF'?'application/pdf':'video/academy',size:selected.asset.size};
  return json(await call(env,token,'/commit',{...canonicalSite(input),action:'asset',requestSha256,revision:ctx.state.revision,asset,operationId:input.operationId}));
 }
 if(!Number.isInteger(input.revision)||input.revision!==ctx.state.revision)throw error('This website changed elsewhere. Reopen the saved draft.',409,'ROW_CHANGED');
 if(path==='/api/save'){
  await validateDocument(env,token,input,ctx,input.document);const draft=await putVersion(env.CONTENT,ctx.websiteId,{kind:'DRAFT',document:input.document,assets:ctx.assets,previous:ctx.state.draft_key,operationId:input.operationId});
  return json(await call(env,token,'/commit',{...canonicalSite(input),action:'save',requestSha256,revision:input.revision,draft,operationId:input.operationId}));
 }
 if(path==='/api/publish'){
  const saved=await getVersion(env.CONTENT,ref(ctx.websiteId,ctx.state));await validateDocument(env,token,input,ctx,saved.document,true);
  const published=await putVersion(env.CONTENT,ctx.websiteId,{kind:'PUBLISHED',document:saved.document,assets:ctx.assets.filter(a=>referencedAssets(saved.document).includes(a.id)),previous:ctx.state.published_key,draftKey:ctx.state.draft_key,operationId:input.operationId});
  return json(await call(env,token,'/commit',{...canonicalSite(input),action:'publish',requestSha256,revision:input.revision,published,draftKey:ctx.state.draft_key,operationId:input.operationId}));
 }
 if(path==='/api/withdraw')return json(await call(env,token,'/commit',{...canonicalSite(input),action:'withdraw',requestSha256,revision:input.revision,operationId:input.operationId}));
 throw error('Website Studio action not found.',404);
}
export class StudioContent extends WorkerEntrypoint{
 async fetch(request){try{const input=await boundedJSON(request.body,1200000),path=new URL(request.url).pathname;
  if(path==='/handoff'){
   if(!validCode(input.challenge)||!validCode(input.state)||typeof input.token!=='string'||input.token.length>4096||typeof input.accountId!=='string')throw error('Invalid Studio handoff.');
   const code=random();await this.env.CONTENT.put('auth/handoffs/'+code+'.json',JSON.stringify({...input,expiresAt:Date.now()+60000,used:false}),{httpMetadata:{contentType:'application/json'}});return json({success:true,code,expiresIn:60});
  }
  if(path==='/version')return json({success:true,value:await getVersion(this.env.CONTENT,input)});
  if(path==='/image'){if(!digest(input.sha256)||input.key!==imageKey(input.sha256))throw error('Invalid image reference.');const object=await this.env.CONTENT.get(input.key);if(!object)throw error('This image is unavailable.',404);return new Response(object.body,{headers:{'Content-Type':object.httpMetadata?.contentType||'application/octet-stream','Content-Length':String(object.size),'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':'sandbox'}});}
  throw error('Not found.',404);
 }catch(e){return failure(e);}}
}
export default {async fetch(request,env){try{
 const path=new URL(request.url).pathname;if(path==='/api/config'&&request.method==='GET')return json({academyOrigin:new URL(env.ACADEMY_ORIGIN).origin});
 if(path.startsWith('/api/'))return await api(request,env);return env.ASSETS.fetch(request);
 }catch(e){return failure(e);}}};
