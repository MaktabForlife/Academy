import {academyD1Repository} from './repository.js';
import {authenticatedD1Account} from './session.js';
import {websiteActivity} from './website-access.js';
import {courseWebsites,preparedWebsiteCopy} from './course-websites.js';
import {acceptedRepository,acceptedHead} from './setup-reader.js';
import {actualState} from './workspace-access.js';
import {lessonMedia} from './lesson-media.js';
import {surahRecordingTerms} from './surah-recording-titles.js';
import {siteId,canonicalSite,uuid,digest,boundedJSON,json,failure,error,versionKey,imageKey} from '../../../../website-studio/src/protocol.mjs';

export const studioEnabled=env=>env.ACADEMY_WEBSITE_STUDIO==='1';
const raw=env=>env.ACADEMY_DB.withSession('first-primary');
const currentVersion=db=>db.prepare('SELECT version FROM split_read_state WHERE singleton=1').first('version');
const stateFor=(db,id)=>db.prepare('SELECT * FROM website_studio_state WHERE website_id=?').bind(id).first();
const assetsFor=async(db,id)=>(await db.prepare('SELECT * FROM website_studio_assets WHERE website_id=? ORDER BY created_at,asset_id LIMIT 101').bind(id).all()).results;
export const studioAssetDTO=row=>({id:row.asset_id,name:row.filename,type:row.mime_type,size:row.byte_size,createdAt:row.created_at,source:row.source,...(row.source==='ACADEMY'?{lessonId:row.lesson_id,nativeAssetId:row.native_asset_id}:{})});
const assertRef=ref=>{if(!ref||!digest(ref.sha256)||ref.key!==versionKey(ref.websiteId,ref.sha256)||!Number.isInteger(ref.bytes)||ref.bytes<2||ref.bytes>1200000)throw error('The saved website reference is invalid.');};
const authoritySQL=`EXISTS(SELECT 1 FROM accounts a JOIN account_credentials c USING(account_id) JOIN account_sessions s USING(account_id)
 WHERE a.account_id=? AND a.active=1 AND c.credential_epoch=? AND c.pin_setup=1 AND length(trim(c.pin_hash))>0
 AND s.session_id=? AND s.revoked_at IS NULL AND s.credential_epoch=c.credential_epoch AND s.expires_at>?
 AND EXISTS(SELECT 1 FROM activities x WHERE x.activity_key=? COLLATE NOCASE AND x.active=1 AND x.lifecycle='ACTIVE')
 AND (EXISTS(SELECT 1 FROM global_role_assignments g WHERE g.account_id=a.account_id AND g.role='GLOBAL_ADMIN' AND g.active=1 AND g.review_state='CONFIRMED')
 OR EXISTS(SELECT 1 FROM effective_activity_roles r WHERE r.account_id=a.account_id AND r.activity_key=? COLLATE NOCASE AND r.role='PROGRAM_ADMIN')))`;
async function session(request,env){
 if(!studioEnabled(env)||env.ACADEMY_DB_GENERATION!=='SPLIT_V1')throw error('Website Studio is not enabled.',503,'STUDIO_DISABLED');
 if(env.ACADEMY_D1_MODE!=='ACTIVE'&&env.ENVIRONMENT!=='local')throw error('Academy is temporarily unavailable.',503);
 const repository=academyD1Repository(env);await repository.ready();const auth=await authenticatedD1Account(request,env,repository);repository.bindActor?.(auth);
 if(auth.workspace!=='ADMIN'||auth.adminView||!actualState(auth).account.global_admin&&!actualState(auth).roles.some(r=>r.role==='PROGRAM_ADMIN'))throw error('Open Website Studio with current Admin authority.',403,'FORBIDDEN');
 return {repository,auth};
}
async function accepted(repository){return acceptedRepository(repository,await acceptedHead(repository));}
async function siteContext(repository,auth,input){const owned=repository.authoringRepository(),selection=await websiteActivity(owned,auth,input,true);return {...selection,owned,id:siteId(input)};}
async function commit(env,repository,auth,input){
 const {id,area,target,owned}=await siteContext(repository,auth,input),db=raw(env),actor=auth.user.accountid;
 if(!uuid(input.operationId)||!Number.isSafeInteger(input.revision)||input.revision<0||!['migrate','save','publish','withdraw','asset'].includes(input.action))throw error('This website change is invalid.');
 if(!digest(input.requestSha256))throw error('This change needs its verified request hash.');
 const hash=input.requestSha256,receipt=()=>db.prepare('SELECT * FROM website_studio_operations WHERE website_id=? AND operation_id=?').bind(id,input.operationId).first();
 const replay=async()=>{const row=await receipt();if(!row)return null;if(row.payload_sha256!==hash||row.actor_account_id!==actor)throw error('This retry identifier belongs to a different change.',409,'OPERATION_ID_REUSED');return {...JSON.parse(row.result_json),replayed:true};};
 const old=await replay();if(old)return old;
 const before=await currentVersion(db),state=await stateFor(db,id),now=new Date().toISOString();
 if(input.action==='migrate'?Boolean(state):!state||state.revision!==input.revision)throw error('This website changed elsewhere. Reopen its saved draft.',409,'ROW_CHANGED');
 const assetRows=input.action==='migrate'?input.assets||[]:input.action==='asset'?[input.asset]:[];
 if(!Array.isArray(assetRows)||assetRows.length>100)throw error('Keep up to 100 website files.');
 const existingAssets=state?await assetsFor(db,id):[];
 if(existingAssets.length+assetRows.filter(a=>!existingAssets.some(x=>x.asset_id===a.id)).length>100)throw error('Keep up to 100 website files.');
 const revision=input.action==='migrate'?input.revision:input.action==='asset'?state.revision:state.revision+1,statements=[];
 if(input.action==='migrate'){
  assertRef(input.draft);if(input.draft.websiteId!==id)throw error('The website draft belongs elsewhere.');
  if(input.published){assertRef(input.published);if(input.published.websiteId!==id)throw error('The publication belongs elsewhere.');}
  if(!Number.isInteger(input.sourceVersion)||input.sourceVersion!==before)throw error('The Academy source changed during migration. Retry the same website.',409,'STUDIO_SOURCE_CHANGED');
  statements.push(db.prepare('INSERT INTO website_studio_state VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(id,area.activity_key,target.surahId,input.revision,input.draft.key,input.draft.sha256,input.draft.bytes,input.published?.key||null,input.published?.sha256||null,input.published?input.revision:null,Number(Boolean(input.enabled&&input.published)),input.sourceKind||'TEMPLATE',now,now,actor));
 }else if(input.action==='save'){
  assertRef(input.draft);if(input.draft.websiteId!==id)throw error('The website draft belongs elsewhere.');
  statements.push(db.prepare('UPDATE website_studio_state SET draft_key=?,draft_sha256=?,draft_bytes=?,revision=?,updated_at=?,updated_by=? WHERE website_id=?').bind(input.draft.key,input.draft.sha256,input.draft.bytes,revision,now,actor,id));
 }else if(input.action==='publish'){
  assertRef(input.published);if(input.published.websiteId!==id||input.draftKey!==state.draft_key)throw error('The saved draft changed. Review it again.',409,'ROW_CHANGED');
  statements.push(db.prepare('UPDATE website_studio_state SET published_key=?,published_sha256=?,published_revision=?,enabled=1,revision=?,updated_at=?,updated_by=? WHERE website_id=?').bind(input.published.key,input.published.sha256,revision,revision,now,actor,id));
 }else if(input.action==='withdraw')statements.push(db.prepare('UPDATE website_studio_state SET enabled=0,revision=?,updated_at=?,updated_by=? WHERE website_id=?').bind(revision,now,actor,id));
 for(const a of assetRows){
  if(!a||!uuid(a.id)||!['STUDIO','ACADEMY'].includes(a.source)||typeof a.name!=='string'||!a.name.trim()||a.name.length>240||/[\x00-\x1f\x7f]/.test(a.name)||!Number.isSafeInteger(a.size)||a.size<0)throw error('The website file reference is invalid.');
  if(a.source==='STUDIO'&&(!['image/png','image/jpeg','image/webp'].includes(a.type)||!digest(a.sha256)||a.key!==imageKey(a.sha256)||a.size>5*1024*1024))throw error('Choose a valid website image.');
  if(a.source==='ACADEMY'&&(typeof a.lessonId!=='string'||!/^[-A-Za-z0-9_:]{1,200}$/.test(a.lessonId)||typeof a.nativeAssetId!=='string'||!/^[-A-Za-z0-9_:]{1,200}$/.test(a.nativeAssetId)||!['application/pdf','video/academy'].includes(a.type)))throw error('Choose existing Academy lesson media.');
  const duplicate=await db.prepare('SELECT * FROM website_studio_assets WHERE asset_id=?').bind(a.id).first();
  if(duplicate){if(duplicate.website_id!==id||duplicate.source!==a.source||duplicate.object_key!==(a.key||null)||duplicate.sha256!==(a.sha256||null)||duplicate.native_asset_id!==(a.nativeAssetId||null)||duplicate.lesson_id!==(a.lessonId||null)||duplicate.filename!==a.name||duplicate.mime_type!==a.type||duplicate.byte_size!==a.size)throw error('This file identifier is already in use.',409);continue;}
  statements.push(db.prepare('INSERT INTO website_studio_assets VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').bind(a.id,id,a.source,a.key||null,a.sha256||null,a.name,a.type,a.size,a.lessonId||null,a.nativeAssetId||null,now,actor));
 }
 if(input.action==='publish'||input.action==='withdraw'){
  const enabled=Number(input.action==='publish'),flag=target.surahId?'SurahWebsitePublished:'+target.surahId:'CourseWebsitePublished:'+area.activity_key.toUpperCase();
  statements.push(db.prepare('INSERT INTO '+target.documents+'('+target.column+(target.surahId?',activity_key':'')+',enabled,updated_by) VALUES(?'+(target.surahId?',?':'')+',?,?) ON CONFLICT('+target.column+') DO UPDATE SET enabled=excluded.enabled').bind(target.id,...(target.surahId?[area.activity_key]:[]),enabled,actor));
  statements.push(db.prepare("INSERT INTO academy_settings(setting_key,setting_value,updated_at,updated_by_account_id) VALUES(?,?,?,?) ON CONFLICT(setting_key) DO UPDATE SET setting_value=excluded.setting_value,updated_at=excluded.updated_at,updated_by_account_id=excluded.updated_by_account_id").bind(flag,String(enabled),now,actor));
  statements.push(db.prepare("INSERT INTO academy_settings(setting_key,setting_value,updated_at,updated_by_account_id) VALUES('AcademySnapshot:timetable:GLOBAL','1',?,?) ON CONFLICT(setting_key) DO UPDATE SET setting_value=CAST(setting_value AS INTEGER)+1,updated_at=excluded.updated_at").bind(now,actor));
 }
 const guard=crypto.randomUUID(),result={revision,...(input.action==='save'?{saved:true}:input.action==='publish'?{published:true}:input.action==='withdraw'?{withdrawn:true}:input.action==='asset'?{asset:input.asset}:{migrated:true})};
 const check=db.prepare('INSERT INTO academy_write_guards(guard_id,accepted) VALUES(?,('+authoritySQL+') AND EXISTS(SELECT 1 FROM split_read_state WHERE singleton=1 AND version=?) AND '+(state?'EXISTS(SELECT 1 FROM website_studio_state WHERE website_id=? AND revision=?)':'NOT EXISTS(SELECT 1 FROM website_studio_state WHERE website_id=?)')+')').bind(guard,actor,actualState(auth).account.credential_epoch,auth.sid,now,area.activity_key,area.activity_key,before,id,...(state?[input.revision]:[]));
 try{await db.batch([check,...statements,db.prepare('INSERT INTO website_studio_operations VALUES(?,?,?,?,?,?)').bind(id,input.operationId,hash,actor,JSON.stringify(result),now),db.prepare("INSERT INTO audit_events(event_id,occurred_at,actor_account_id,authority,scope_key,action,record_kind,record_id,changed_fields_json) VALUES(?,?,?,?,?,?,'WEBSITE_STUDIO',?,?)").bind(crypto.randomUUID(),now,actor,actualState(auth).account.global_admin?'GLOBAL_ADMIN':'PROGRAM_ADMIN',area.activity_key,input.action,input.operationId,JSON.stringify(['Website '+input.action])),db.prepare('DELETE FROM academy_write_guards WHERE guard_id=?').bind(guard)]);}catch(e){const saved=await replay();if(saved)return saved;throw error('This website or your permissions changed. Reopen the saved draft.',409,'ROW_CHANGED');}
 return result;
}
export async function websiteStudioBridge(request,env){try{
 const {repository,auth}=await session(request,env),input=await boundedJSON(request.body,1200000),path=new URL(request.url).pathname;
 if(path==='/session')return json({success:true,accountId:auth.user.accountid,displayName:auth.user.username,sessionId:auth.sid});
 if(path==='/list'){
  const websites=(await courseWebsites(repository.authoringRepository(),auth,env).run('list',{})).websites;
  const state=actualState(auth),keys=state.roles.filter(r=>r.role==='PROGRAM_ADMIN').map(r=>r.activity_key);
  const surahs=(await raw(env).prepare("SELECT s.surah_id,s.activity_key,s.name,s.active FROM program_surahs s JOIN activities a USING(activity_key) WHERE a.active=1 AND a.lifecycle='ACTIVE' AND (?=1 OR s.activity_key IN(SELECT value FROM json_each(?))) ORDER BY s.completion_date DESC,s.name LIMIT 201").bind(Number(state.account.global_admin),JSON.stringify(keys)).all()).results;
  const rows=[...websites,...surahs.slice(0,200).map(s=>({activityKey:s.activity_key,surahId:s.surah_id,name:s.name,enabled:Boolean(s.active)}))],ids=rows.map(siteId),current=(await raw(env).prepare('SELECT website_id,revision,enabled,updated_at FROM website_studio_state WHERE website_id IN(SELECT value FROM json_each(?)) LIMIT 701').bind(JSON.stringify(ids)).all()).results,map=new Map(current.map(s=>[s.website_id,s]));
  return json({success:true,truncated:websites.length>=500||surahs.length>200,websites:rows.map(row=>{const saved=map.get(siteId(row));return saved?{...row,hasDraft:true,revision:saved.revision,enabled:Boolean(saved.enabled),updatedAt:saved.updated_at}:row;})});
 }
 if(path==='/commit')return json({success:true,...await commit(env,repository,auth,input)});
 const {id,area,owned}=await siteContext(repository,auth,input),db=raw(env);
 if(path==='/operation'){const row=await db.prepare('SELECT * FROM website_studio_operations WHERE website_id=? AND operation_id=?').bind(id,input.operationId).first();if(row&&(row.actor_account_id!==auth.user.accountid||row.payload_sha256!==input.requestSha256))throw error('This retry identifier belongs to a different change.',409,'OPERATION_ID_REUSED');return json({success:true,result:row?{...JSON.parse(row.result_json),replayed:true}:null});}
 if(path==='/context'){const state=await stateFor(db,id),assetRefs=await assetsFor(db,id);return json({success:true,websiteId:id,activityKey:area.activity_key,surahId:area.surahId,name:area.name,state,preparedCopyAvailable:Boolean(preparedWebsiteCopy(area)),assets:assetRefs.map(studioAssetDTO),assetRefs});}
 if(path==='/legacy-draft')return json({success:true,...await courseWebsites(owned,auth,env).run('get',input)});
 if(path==='/legacy-asset')return courseWebsites(owned,auth,env).run('admin-asset',input);
 if(path==='/legacy-prepared')return courseWebsites(owned,auth,env).run('prepared-copy',input);
 if(path==='/legacy-export'){
  const before=await currentVersion(db),draft=await courseWebsites(owned,auth,env).run('get',input),source=await accepted(repository);let published=null;
  try{published=await courseWebsites(source,auth,env).run('export',input);}catch(e){if(!['COURSE_WEBSITE_UNPUBLISHED'].includes(e.code)&&e.status!==404)throw e;}
  if(await currentVersion(db)!==before)throw error('The Academy source changed. Retry migration.',409,'STUDIO_SOURCE_CHANGED');
  return json({success:true,sourceVersion:before,draft,published,sourceKind:draft.legacy?'KAHF':'TEMPLATE'});
 }
 if(path==='/media')return json({success:true,...await lessonMedia(await accepted(repository),auth,env).run('feed',{activityKey:area.activity_key,view:'learner',...(area.surahId?{websiteRecordingTerms:surahRecordingTerms(area)}:{}),before:input.before})});
 if(path==='/check-media'){
  const source=await accepted(repository),media=await lessonMedia(source,auth,env).run('get',{activityKey:area.activity_key,lessonId:input.lessonId});
  if(media.lesson.state!=='PUBLISHED'||!media.assets.some(a=>a.id===input.nativeAssetId))throw error('Choose published Academy media.',400);
  const asset=media.assets.find(a=>a.id===input.nativeAssetId),bytes=await db.prepare('SELECT byte_size FROM lesson_media_assets WHERE activity_key=? AND asset_id=?').bind(area.activity_key,input.nativeAssetId).first('byte_size');return json({success:true,asset:{...asset,size:bytes||0},lesson:media.lesson});
 }
 if(path==='/media-download')return lessonMedia(await accepted(repository),auth,env).run('download',{activityKey:area.activity_key,lessonId:input.lessonId,assetId:input.nativeAssetId});
 throw error('Website Studio action not found.',404);
 }catch(e){return failure(e);}}
