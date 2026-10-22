import {payloadHash} from '../../programs/timetable-model.js';
import {managementError as fail} from './management-store.js';
import {actualState} from './workspace-access.js';
import {assessmentRolesSQL} from './assessment-store.js';
const format='ACADEMY_PERSONAL_LINKS_V1',uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
export const personalLinksKey=async accountId=>'academy-personal-links/v1/'+await payloadHash(String(accountId))+'/collection.json';
export async function personalLinksEstablished(env,accountId){
 if(env.ACADEMY_MEDIA_SEPARATION!=='1'||!env.LESSON_MEDIA_BUCKET?.head)return false;
 const object=await env.LESSON_MEDIA_BUCKET.head(await personalLinksKey(accountId));return object?.customMetadata?.format===format;
}
const initialAuthority=state=>state.account.global_admin||state.roles.some(r=>['TEACHER','PROGRAM_ADMIN'].includes(r.role));
function validLinks(links){
 if(!Array.isArray(links)||links.length>250)throw fail('Keep up to 250 personal links.');
 const ids=new Set();return links.map(link=>{
  if(!link||!uuid.test(link.id||'')||ids.has(link.id)||typeof link.title!=='string'||!link.title.trim()||link.title.trim().length>180||typeof link.url!=='string'||link.url.length>2048||typeof(link.description||'')!=='string'||(link.description||'').length>1000)throw fail('Enter a title, secure link and optional description.');
  ids.add(link.id);let url;try{url=new URL(link.url);}catch{throw fail('Enter a secure website link.');}
  if(url.protocol!=='https:'||url.username||url.password||[...url.searchParams.keys()].some(k=>/^(?:access_token|refresh_token|client_secret|password|api_key|authorization)$/i.test(k)))throw fail('Use a secure document or website link without sign-in credentials.');
  return {id:link.id,title:link.title.trim(),url:url.href,description:(link.description||'').trim()};
 });
}
export function personalLinks(repository,auth,env){
 const actor=auth.user.accountid,storage=env.LESSON_MEDIA_BUCKET;
 const account=async()=>{const row=await repository.db.prepare("SELECT 1 ok FROM accounts a JOIN account_credentials c USING(account_id) JOIN account_sessions s USING(account_id) WHERE a.account_id=? AND a.active=1 AND c.credential_epoch=? AND s.session_id=? AND s.credential_epoch=c.credential_epoch AND s.revoked_at IS NULL AND s.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now')").bind(actor,actualState(auth).account.credential_epoch,auth.sid).first();if(!row)throw fail('Your Academy session has ended.',401,'SESSION_ENDED');};
 async function read(){
  if(!storage?.get||!storage?.put)throw fail('Personal links storage is unavailable.',503);
  const key=await personalLinksKey(actor),object=await storage.get(key);if(!object)return {key,object:null,data:null};
  if(object.size>256*1024)throw fail('Personal links could not be read.',503);
  const data=JSON.parse(await object.text());if(data.format!==format||data.owner!==actor||!Number.isInteger(data.revision)||!Array.isArray(data.receipts))throw fail('Personal links could not be read.',503);
  validLinks(data.links);return {key,object,data};
 }
 const dto=state=>({links:state.data?.links||[],revision:state.object?.etag||null,established:Boolean(state.object),canCreate:Boolean(state.object||initialAuthority(actualState(auth)))});
 return {async run(action,input={}){
  if(env.ACADEMY_MEDIA_SEPARATION!=='1')throw fail('Personal links are not available yet.',503);
  if(['owner','ownerId','accountId','key'].some(k=>Object.hasOwn(input,k)))throw fail('Personal links belong only to the signed-in owner.',403,'FORBIDDEN');
  await account();const state=await read();if(!state.data&&!initialAuthority(actualState(auth)))throw fail('My links is available to teachers, admins and established owners.',403,'FORBIDDEN');
  if(action==='list'||action==='export')return dto(state);
  if(action!=='save')throw fail('Unknown personal links action.',404);
  if(!uuid.test(input.operationId||''))throw fail('This save needs its retry identifier.');
  const links=validLinks(input.links),hash=await payloadHash({revision:input.revision,links}),saved=state.data?.receipts.find(r=>r.id===input.operationId);
  if(saved){if(saved.hash!==hash)throw fail('This retry belongs to another save.',409,'OPERATION_ID_REUSED');return {...dto(state),savedRevision:saved.revision,replayed:true};}
  if(input.revision!==(state.object?.etag||null))throw fail('My links changed elsewhere. Your entries are kept; refresh before saving.',409,'ROW_CHANGED');
  await account();if(!state.data){const permitted=await repository.db.prepare(`SELECT EXISTS(SELECT 1 FROM global_role_assignments WHERE account_id=? AND active=1 AND review_state='CONFIRMED' AND role='GLOBAL_ADMIN') OR EXISTS(SELECT 1 FROM (${assessmentRolesSQL}) r JOIN activities a USING(activity_key) WHERE r.account_id=? AND r.role IN('TEACHER','PROGRAM_ADMIN') AND a.active=1 AND a.lifecycle='ACTIVE') ok`).bind(actor,actor).first();if(!permitted?.ok)throw fail('A current teaching or Admin role is needed to start My links.',403);}
  const revision=(state.data?.revision||0)+1,data={format,owner:actor,revision,links,receipts:[...(state.data?.receipts||[]).slice(-19),{id:input.operationId,hash,revision}],updatedAt:new Date().toISOString()};
  const json=JSON.stringify(data);if(new TextEncoder().encode(json).byteLength>128*1024)throw fail('This collection is too large. Shorten descriptions or remove a few links.',413);
  const object=await storage.put(state.key,json,{onlyIf:state.object?{etagMatches:state.object.etag}:{etagDoesNotMatch:'*'},httpMetadata:{contentType:'application/json'},customMetadata:{format}});
  if(!object)throw fail('My links changed elsewhere. Your entries are kept; refresh before saving.',409,'ROW_CHANGED');
  return {...dto({object,data}),savedRevision:revision};
 }};
}
