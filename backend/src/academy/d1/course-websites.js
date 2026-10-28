import {studioPublished,studioAsset} from './website-studio-content.js';
import {websiteActivity} from './website-access.js';
import {publishedWebsiteValue} from './published-facts-cache.js';
import {payloadHash} from '../../programs/timetable-model.js';
import {managementStore,managementError as fail,same} from './management-store.js';
import {isAdminWorkspace,administers,readerPreview,hasAdminAuthority} from './workspace-access.js';
import {validateCourse,referencedAssets,fileKind} from '../../../../academy/course-websites/model.mjs';
import {courseWebsiteTemplate} from '../course-books/website-template.js';
import {isSurahKahfCourse} from '../course-books/course-companion.js';
import {courseReaderSessions} from './course-reader-sessions.js';
import {lessonNotes} from './lesson-notes.js';
import {lessonMedia} from './lesson-media.js';
import {preparedTafseerCopies,preparedTafseerKey} from '../course-books/tafseer-prepared.js';
import {storeLessonPdf,lessonPdfReference,lessonPdfObjectKey} from './lesson-pdf-storage.js';
import {surahRecordingTerms} from './surah-recording-titles.js';

const websiteAssetKey=reference=>lessonPdfObjectKey(String(reference).replace(/image-refs\/[a-f0-9-]{36}\/([a-f0-9]{64})$/,'$1'));
const assetDTO=row=>({id:row.asset_id,name:row.filename,type:row.mime_type,size:row.byte_size,createdAt:row.created_at});
const uuid=value=>/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value||'');
export const preparedWebsiteCopy=area=>isSurahKahfCourse(area)&&!area.surahId?preparedTafseerCopies.kahf:area.surahId&&area.programName.trim().toLowerCase()==='tafseer'&&Object.hasOwn(preparedTafseerCopies,area.card_key)?preparedTafseerCopies[area.card_key]:null;
export function courseWebsites(repository,auth,env){
 const store=managementStore(repository,auth),p=store.p,actor=auth?.user.accountid||'PUBLIC';
 let studioSource=null;
 let target={documents:'course_website_documents',assets:'course_website_assets',column:'activity_key',id:'',surahId:null};
 const template=area=>{const document=courseWebsiteTemplate(area);if(area.surahId){document.id=area.surahId;document.tag='TAFSEER';document.menu.home='Surah';document.pages.sessions=false;document.pages.assessments=false;}return document;};
 async function activity(input,write=false){const result=await websiteActivity(repository,auth,input,write);target=result.target;return result.area;}
 async function selectedMedia(native,document,area){
  if(!studioSource||!auth||!document.academyMediaIds?.length)return native;
  const map=new Map(studioSource.assets.map(a=>[a.id,a]));native={...native,lessons:[...(native.lessons||[])],sessions:[...(native.sessions||[])]};
  for(const id of document.academyMediaIds){const ref=map.get(id);if(ref?.source!=='ACADEMY')continue;
   try{const card=await lessonMedia(repository,auth,env).websiteCard({activityKey:area.activity_key,lessonId:ref.lessonId});if(!card.assets.some(a=>a.id===ref.nativeAssetId))continue;
    if(!native.lessons.some(l=>l.id===card.id))native.lessons.push(card);
    if(!native.sessions.some(s=>s.media?.id===card.id))native.sessions.push({sessionKey:card.sessionKey||'media:'+card.id,date:card.date,startTime:card.startTime||'',endTime:card.endTime||'',title:card.title,teacherNames:card.teacher?[card.teacher]:[],media:card,savedMedia:true});
   }catch(e){if(![403,404].includes(e.status))throw e;}
  }
  return native;
 }
 const record=scope=>publishedWebsiteValue(repository,{table:target.documents,scope,id:target.id},()=>p('SELECT * FROM '+target.documents+' WHERE '+target.column+'=?',target.id).first());
 const preparedCopy=preparedWebsiteCopy;
 const files=key=>studioSource?Promise.resolve(studioSource.assets.map(a=>({asset_id:a.id,filename:a.name,mime_type:a.type,byte_size:a.size,created_at:a.createdAt}))):publishedWebsiteValue(repository,{table:target.assets,scope:key,id:target.id},async()=>(await p('SELECT * FROM '+target.assets+' WHERE '+target.column+'=? ORDER BY created_at,asset_id LIMIT 101',target.id).all()).results);
 async function legacyGate(area,row){
  if(row?.source_kind!=='KAHF'&&row||!row&&!isSurahKahfCourse(area))return;
  const pdfs=(await p("SELECT a.filename,a.display_name FROM lesson_media_lessons l JOIN lesson_media_links k USING(lesson_id) JOIN lesson_media_assets a USING(asset_id) WHERE l.activity_key=? AND l.media_scope='COURSE' AND l.state='PUBLISHED' AND a.kind='PDF' LIMIT 101",area.activity_key).all()).results;
  const pdf=pdfs.find(a=>/nurturing|surah[ _-]*(al[ _-]*)?kahf/i.test((a.display_name||'')+' '+(a.filename||'')))||(pdfs.length===1?pdfs[0]:null);
  if(!pdf)throw fail('These course readings are not currently published.',403,'COURSE_WEBSITE_UNPUBLISHED');
 }
 async function readable(input){
  const area=await activity(input);studioSource=await studioPublished(env,input);const row=studioSource?{enabled:studioSource.state.enabled,source_kind:studioSource.source_kind,document_json:JSON.stringify(studioSource.document)}:await record(area.activity_key);
  if(!auth&&!(target.surahId&&area.card_key==='foundations'))throw fail('Contact Admin to receive access.',403,'COURSE_WEBSITE_FORBIDDEN');
  if(row&&!row.enabled)throw fail('This course website is currently withdrawn.',404,'COURSE_WEBSITE_UNPUBLISHED');
  await legacyGate(area,row);
  if(!row&&!isSurahKahfCourse(area))throw fail('This course website has not been published.',404,'COURSE_WEBSITE_UNPUBLISHED');
  const document=row?JSON.parse(row.document_json):template(area);validateCourse(document);
  return {area,row,document,...(studioSource?{studioSource}:{})};
 }
 async function load(area){
  // Only the actor and selected Course are needed to guard this operation.
  return store.load({accounts:p('SELECT * FROM accounts WHERE account_id=?',actor),admins:p('SELECT * FROM global_role_assignments WHERE account_id=?',actor),activities:p('SELECT * FROM activities WHERE activity_key=?',area.activity_key),roles:p('SELECT * FROM role_assignments WHERE account_id=?',actor),reviews:p('SELECT * FROM role_import_reviews WHERE 0'),policies:p('SELECT * FROM activity_policy_imports WHERE 0'),programs:p('SELECT * FROM program_settings WHERE 0'),mappings:p('SELECT * FROM role_mapping_decisions WHERE 0'),evidence:p('SELECT * FROM legacy_access_evidence WHERE 0'),website:p('SELECT * FROM '+target.documents+' WHERE '+target.column+'=?',target.id)});
 }
 function documentInput(input){
  let errors;try{errors=validateCourse(input.document,{review:input.review===true});}catch(error){throw fail(error.message);}
  if(new TextEncoder().encode(JSON.stringify(input.document)).length>500000)throw fail('Keep the course text below 500 KB.',413);
  return errors;
 }
 async function checkAssets(key,document,review=false){
  const available=await files(key),refs=referencedAssets(document),map=new Map(available.map(row=>[row.asset_id,row]));
  if(refs.some(id=>!map.has(id)))throw fail('Choose files uploaded to this Course. A referenced file is missing.',400,'COURSE_ASSET_MISSING');
  const images=[document.home.imageId,...document.lessons.flatMap(l=>l.sections.flatMap(s=>s.blocks.filter(b=>b.type==='image').map(b=>b.assetId)))].filter(Boolean);
  if(images.some(id=>!map.get(id).mime_type.startsWith('image/')))throw fail('Choose an image for each picture position.');
  if(review){const errors=validateCourse(document,{review:true});if(errors.length)throw fail(errors.join(' '));}
  return refs;
 }
 async function change(action,input){
  const area=await activity(input,true),key=area.activity_key;
  if(action==='save')documentInput(input);
  return store.change('COURSE_WEBSITE',key,action,input,async()=>{
   const data=await load(area),row=data.website[0];
   if(!Number.isInteger(input.revision)||input.revision!==(row?.revision||0))throw fail('This website changed elsewhere. Your draft is kept; reopen the saved version before saving.',409,'ROW_CHANGED');
   const now=new Date().toISOString(),revision=(row?.revision||0)+1;
   if(action==='save'){
    await checkAssets(key,input.document);
    const json=JSON.stringify(input.document);
    const values={...(target.surahId?{surah_id:target.surahId}:{}),activity_key:key,document_json:json,schema_version:1,source_kind:isSurahKahfCourse(area)?'KAHF':'TEMPLATE',revision,enabled:target.surahId?0:1,updated_at:now,updated_by:actor};
    const statement=row?p('UPDATE '+target.documents+' SET document_json=?,revision=?,updated_at=?,updated_by=? WHERE '+target.column+'=?',json,revision,now,actor,target.id):p('INSERT INTO '+target.documents+'('+Object.keys(values).join(',')+') VALUES('+Object.keys(values).map(()=>'?').join(',')+')',...Object.values(values));
    return {data,statements:[statement],result:{saved:true,revision},acceptDefinitions:false,fields:['Course website draft']};
   }
   if(!row)throw fail('Save the website draft first.');
   if(action==='withdraw')return {data,statements:[p('UPDATE '+target.documents+' SET enabled=0,revision=?,updated_at=?,updated_by=? WHERE '+target.column+'=?',revision,now,actor,target.id),p("INSERT INTO academy_settings(setting_key,setting_value,updated_at,updated_by_account_id) VALUES(?,'0',?,?) ON CONFLICT(setting_key) DO UPDATE SET setting_value='0',updated_at=excluded.updated_at,updated_by_account_id=excluded.updated_by_account_id",(target.surahId?'SurahWebsitePublished:'+target.surahId:'CourseWebsitePublished:'+key.toUpperCase()),now,actor),p("INSERT INTO academy_settings(setting_key,setting_value,updated_at,updated_by_account_id) VALUES('AcademySnapshot:timetable:GLOBAL','1',?,?) ON CONFLICT(setting_key) DO UPDATE SET setting_value=CAST(setting_value AS INTEGER)+1,updated_at=excluded.updated_at",now,actor)],result:{withdrawn:true,revision},acceptDefinitions:false,fields:['Course website availability']};
   const document=JSON.parse(row.document_json),refs=await checkAssets(key,document,true);
   const localFlag=target.surahId&&!repository.setup?.enabled?[p("INSERT INTO academy_settings(setting_key,setting_value,updated_at,updated_by_account_id) VALUES(?,'1',?,?) ON CONFLICT(setting_key) DO UPDATE SET setting_value='1',updated_at=excluded.updated_at",'SurahWebsitePublished:'+target.surahId,now,actor)]:[];
   return {data,statements:[p('UPDATE '+target.documents+' SET enabled=1,revision=?,updated_at=?,updated_by=? WHERE '+target.column+'=?',revision,now,actor,target.id),...localFlag],result:{published:true,revision},acceptFullRows:true,acceptEntities:{[target.documents]:{sql:target.column+'=?',values:[target.id]},[target.assets]:{sql:target.column+'=? AND asset_id IN(SELECT value FROM json_each(?))',values:[target.id,JSON.stringify(refs)]}},fields:['Published course website']};
  });
 }
 async function upload(request,input){
  const area=await activity(input,true),key=area.activity_key;
  if(!uuid(input.assetId)||!uuid(input.operationId)||!/^[a-f0-9]{64}$/.test(input.sha256||'')||typeof input.filename!=='string'||!input.filename.trim()||input.filename.length>240||/[\x00-\x1f\x7f]/.test(input.filename)||!Number.isSafeInteger(input.size)||input.size<5)throw fail('Choose a valid image or PDF.');
  const type=input.type;if(!['application/pdf','image/png','image/jpeg','image/webp'].includes(type)||input.size>(type==='application/pdf'?16:5)*1024*1024)throw fail('Choose an image up to 5 MB or PDF up to 16 MB.',413);
  const existing=await p('SELECT * FROM '+target.assets+' WHERE asset_id=?',input.assetId).first();
  if(existing&&(!same(existing.activity_key,key)||target.surahId&&existing.surah_id!==target.surahId||existing.sha256!==input.sha256||existing.filename!==input.filename||existing.mime_type!==type||existing.byte_size!==input.size))throw fail('Choose a fresh file identifier.',409,'ASSET_ID_REUSED');
  if((await files(key)).length>=100&&!existing)throw fail('Keep up to 100 uploaded files per Course.');
  const storage=env.LESSON_MEDIA_BUCKET,namespace=(env.ACADEMY_OBJECT_NAMESPACE||'')+(target.surahId?'program-surah-websites/'+encodeURIComponent(key)+'/'+target.surahId+'/':'course-websites/'+encodeURIComponent(key)+'/'),objectKey=namespace+input.sha256;
  let storedKey;
  if(type==='application/pdf'){await storeLessonPdf(request,storage,namespace,input);storedKey=lessonPdfReference(namespace,input.assetId,input.sha256);}
  else{
   if(!storage?.put)throw fail('Private file storage is unavailable.',503);
   const reader=request.body?.getReader(),parts=[];let size=0;if(!reader)throw fail('Choose a file.');
   while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>input.size){await reader.cancel();throw fail('The file size changed.',413);}parts.push(part.value);}
   if(size!==input.size)throw fail('The upload was interrupted.');
   const bytes=new Uint8Array(size);let at=0;for(const part of parts){bytes.set(part,at);at+=part.length;}
   const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
   if(fileKind(bytes.slice(0,16))!==type||hash!==input.sha256)throw fail('The file type or checksum changed. Choose it again.');
   await storage.put(objectKey,bytes,{sha256:hash,httpMetadata:{contentType:type}});storedKey=namespace+'image-refs/'+input.assetId+'/'+hash;
  }
  // Authority and concurrent source changes are checked again in the guarded write.
  return store.change('COURSE_WEBSITE',key,'upload',input,async()=>{
   const data=await load(area);if((await files(key)).length>=100&&!existing)throw fail('Keep up to 100 uploaded files per Course.');const duplicate=await p('SELECT * FROM '+target.assets+' WHERE asset_id=?',input.assetId).first();
   if(duplicate&&(!same(duplicate.activity_key,key)||target.surahId&&duplicate.surah_id!==target.surahId||duplicate.sha256!==input.sha256||duplicate.filename!==input.filename))throw fail('This file identifier is already in use.',409,'ASSET_ID_REUSED');
   const row={asset_id:input.assetId,...(target.surahId?{surah_id:target.surahId}:{}),activity_key:key,object_key:storedKey,filename:input.filename,mime_type:type,byte_size:input.size,sha256:input.sha256,created_at:new Date().toISOString(),created_by:actor};
   return {data,statements:duplicate?[]:[p('INSERT INTO '+target.assets+'('+Object.keys(row).join(',')+') VALUES('+Object.keys(row).map(()=>'?').join(',')+')',...Object.values(row))],result:{asset:assetDTO(duplicate||row)},acceptDefinitions:false,fields:['Course website file']};
  });
 }
 async function asset(input,admin=false){
  const source=admin?{area:await activity(input,true)}:await readable(input),id=String(input.assetId||'');
  if(source.studioSource)return studioAsset(env,repository,auth,input,source.studioSource);
  if(!admin&&!referencedAssets(source.document).includes(id))throw fail('This file is not published in this Course.',404,'NOT_FOUND');
  const row=await p('SELECT * FROM '+target.assets+' WHERE '+target.column+'=? AND asset_id=?',target.id,id).first();
  const object=row?await env.LESSON_MEDIA_BUCKET?.get(websiteAssetKey(row.object_key)):null;if(!object)throw fail('This file is unavailable.',404,'NOT_FOUND');
  return new Response(object.body,{headers:{'Content-Type':row.mime_type,'Content-Length':String(row.byte_size),'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"sandbox",'Content-Disposition':"attachment; filename*=UTF-8''"+encodeURIComponent(row.filename).replace(/['()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase())}});
 }
 return {upload,async run(action,input={}){
  if(action==='prepared-copy'){
   const area=await activity(input,true),copy=preparedCopy(area);
   if(!copy)throw fail('No prepared copy is attached to this website.',404,'NOT_FOUND');
   const object=await env.LESSON_MEDIA_BUCKET?.get(preparedTafseerKey(env,copy));
   if(!object||object.size!==copy.size)throw fail('The prepared course copy is unavailable.',503,'PREPARED_COPY_UNAVAILABLE');
   return new Response(object.body,{headers:{'Content-Type':'application/octet-stream','Content-Length':String(copy.size),'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':'sandbox','Content-Disposition':'attachment; filename="'+area.card_key+'.json"'}});
  }
  if(action==='list'){
   if(!isAdminWorkspace(auth)||!auth.state.account.global_admin&&!auth.state.roles.some(r=>r.role==='PROGRAM_ADMIN'))throw fail('Open Admin to manage course websites.',403,'FORBIDDEN');
   const scopes=auth.state.roles.filter(r=>r.role==='PROGRAM_ADMIN').map(r=>r.activity_key);
   const rows=(await p("SELECT a.activity_key,a.activity_id,a.name,d.revision,d.enabled,d.updated_at FROM activities a LEFT JOIN course_website_documents d USING(activity_key) WHERE a.kind='COURSE' AND a.active=1 AND a.lifecycle='ACTIVE' AND (?=1 OR a.activity_key IN(SELECT value FROM json_each(?))) ORDER BY a.name LIMIT 501",Number(auth.state.account.global_admin),JSON.stringify(scopes)).all()).results;
   return {websites:rows.slice(0,500).map(r=>({activityKey:r.activity_key,courseId:r.activity_id,name:r.name,hasDraft:Boolean(r.revision),revision:r.revision||0,enabled:r.enabled!==0,updatedAt:r.updated_at||'',existing:isSurahKahfCourse({kind:'COURSE',name:r.name})})),truncated:rows.length>500};
  }
  if(action==='get'){const area=await activity(input,true),row=await record(area.activity_key);return {activityKey:area.activity_key,preparedCopyAvailable:Boolean(preparedCopy(area)),...(target.surahId?{surahId:target.surahId,completionDate:area.completion_date}:{}),courseId:area.activity_id,name:area.name,revision:row?.revision||0,enabled:row?.enabled!==0,document:row?JSON.parse(row.document_json):template(area),assets:(await files(area.activity_key)).map(assetDTO),legacy:isSurahKahfCourse(area)};}
  if(['save','publish','withdraw'].includes(action))return change(action,input);
  if(action==='asset')return asset(input,false);
  if(action==='admin-asset')return asset(input,true);
  if(action==='export'){await activity(input,true);const {area,row,document}=await readable(input);return {document,enabled:row?.enabled!==0,revision:row?.revision||0,assets:(await files(area.activity_key)).map(assetDTO)};}
  if(action==='read'){
   const {area,document}=await readable(input);
   if(target.surahId){
    let native={lessons:[],sessions:[]};
    if(auth)try{native=await lessonMedia(repository,auth,env).run('feed',{activityKey:area.activity_key,view:'learner',websiteRecordingTerms:surahRecordingTerms(area),before:input.mediaBefore});}catch(error){if(![403,503].includes(error.status))throw error;}
    native=await selectedMedia(native,document,area);document.pages.sessions=Boolean(native.sessions.length);document.pages.assessments=false;
    return {document,canEdit:Boolean(auth&&hasAdminAuthority(auth,area.activity_key)),surahId:target.surahId,activityKey:area.activity_key,completionDate:area.completion_date,readerKey:await payloadHash(['SURAH_READER_OWNER',actor,area.activity_key,target.surahId]),assets:(await files(area.activity_key)).filter(r=>referencedAssets(document).includes(r.asset_id)).map(assetDTO),native:{...native,lessonMediaMaterials:true}};
   }
   let native=await lessonMedia(repository,auth,env).run('feed',{activityKey:area.activity_key,view:'learner',includeCourseCompanion:true,includeCourseSessions:true});
   native=await selectedMedia(native,document,area);
   if(repository.features?.mediaSeparation)native=await lessonNotes(repository,auth,env).enrichFeed(native,{activityKey:area.activity_key,view:'learner'});
   if(!native.courseCompanion?.schedule)try{native.courseWebsiteSchedule=await courseReaderSessions(repository,auth,area);}catch(error){if([401,403].includes(error.status))throw error;native.courseWebsiteSchedule={sessions:[],unavailable:true};}
   return {document,canEdit:Boolean(auth&&hasAdminAuthority(auth,area.activity_key)),readerKey:await payloadHash(['COURSE_READER_OWNER',actor,area.activity_key]),assets:(await files(area.activity_key)).filter(r=>referencedAssets(document).includes(r.asset_id)).map(assetDTO),activityKey:area.activity_key,courseId:area.activity_id,native};
  }
  throw fail('Unknown course website action.',404,'NOT_FOUND');
 }};
}
