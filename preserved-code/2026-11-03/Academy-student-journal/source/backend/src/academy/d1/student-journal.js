import {rehearsalError as fail} from './repository.js';
import {actualState} from './workspace-access.js';

export const JOURNAL_FORMAT='ACADEMY_STUDENT_JOURNAL_R2_V1';
// Conservative initial bounds for whole-file validation and replacement.
// Local correctness tests do not certify hosted Workers CPU consumption.
export const JOURNAL_MAX_BYTES=512*1024;
export const JOURNAL_MAX_ENTRIES=500;
export const JOURNAL_RECEIPTS=20;
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const fields={course:240,surah:240,lesson:400,ayah:240,question:8000,reflection:50000,entryDate:10};
const conflict=()=>fail('Your journal changed elsewhere. Your device draft is kept. Refresh and review the saved version before saving again.',409,'JOURNAL_CHANGED');
export const journalHash=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(typeof value==='string'?value:JSON.stringify(value)))),b=>b.toString(16).padStart(2,'0')).join('');
export const studentJournalKey=async owner=>'student-journals/v1/'+await journalHash(String(owner))+'/journal.json';
function text(value,max,label){
 if(typeof value!=='string'||value.length>max)throw fail(`Enter ${label} using up to ${max.toLocaleString('en-US')} characters.`,400,'INVALID_JOURNAL_FIELD');return value;
}
function values(input){
 if(!input||typeof input!=='object'||Array.isArray(input))throw fail('Choose valid journal fields.',400,'INVALID_JOURNAL_FIELD');
 const result={};for(const [key,value] of Object.entries(input)){if(!Object.hasOwn(fields,key))throw fail('Only journal content can be edited.',400,'INVALID_JOURNAL_FIELD');result[key]=value===null?'':text(value,fields[key],key);}
 if(result.entryDate){const date=new Date(result.entryDate+'T12:00:00Z');if(!/^\d{4}-\d{2}-\d{2}$/.test(result.entryDate)||!Number(result.entryDate.slice(0,4))||!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==result.entryDate)throw fail('Choose a valid entry date or leave it empty.',400,'INVALID_JOURNAL_FIELD');}
 return result;
}
const unavailable=()=>fail('Your private journal is unavailable. Your device draft is kept.',503,'JOURNAL_UNAVAILABLE');
const validVersion=value=>value===null||typeof value==='string'&&value.length>0&&value.length<=160;
function validate(document,owner){
 if(document?.format!==JOURNAL_FORMAT||document.owner!==owner||!Number.isSafeInteger(document.revision)||document.revision<1||!Array.isArray(document.entries)||document.entries.length>JOURNAL_MAX_ENTRIES||!Array.isArray(document.receipts)||document.receipts.length>JOURNAL_RECEIPTS)throw unavailable();
 const ids=new Set(),sources=new Set();
 try{for(const entry of document.entries){if(!uuid.test(entry.id||'')||ids.has(entry.id)||!Number.isSafeInteger(entry.revision)||entry.revision<1||typeof entry.createdAt!=='string'||typeof entry.updatedAt!=='string'||!Number.isFinite(Date.parse(entry.createdAt))||!Number.isFinite(Date.parse(entry.updatedAt)))throw unavailable();ids.add(entry.id);if(entry.sourceKey!==null){text(entry.sourceKey,1000,'a reflection reference');if(!entry.sourceKey||sources.has(entry.sourceKey))throw unavailable();sources.add(entry.sourceKey);}values(Object.fromEntries(Object.keys(fields).map(key=>[key,entry[key]])));}
  for(const receipt of document.receipts)if(!uuid.test(receipt.id||'')||!uuid.test(receipt.entryId||'')||!/^[a-f0-9]{64}$/.test(receipt.hash||'')||!Number.isSafeInteger(receipt.revision)||!Number.isSafeInteger(receipt.entryRevision))throw unavailable();
 }catch{throw unavailable();}
 return document;
}
// Journal content lives only in one private R2 object per authenticated owner.
// Core is used by the existing HTTP authentication boundary, never for journal SQL.
export function studentJournal(auth,env){
 const owner=actualState(auth)?.account?.account_id,bucket=env.ACADEMY_JOURNAL_BUCKET;
 return {async run(action,input={}){
  if(!owner||!actualState(auth).account.active)throw fail('Sign in to open your journal.',401,'SESSION_ENDED');
  if(auth.adminView||auth.classView)throw fail('Open your personal workspace to use your own journal.',403,'JOURNAL_PERSONAL_ONLY');
  const allowed={sync:['version'],save:['id','revision','version','fields','sourceKey','operationId']}[action];
  if(!allowed)throw fail('Unknown journal action.',404);
  if(Object.keys(input).some(key=>!allowed.includes(key)))throw fail('Journal entries belong only to the signed-in account.',403,'JOURNAL_OWNER_ONLY');
  if(!bucket?.get||!bucket?.put)throw unavailable();
  if(input.version!==undefined&&!validVersion(input.version))throw fail('Refresh your journal before saving.',400,'INVALID_JOURNAL_VERSION');
  const ownerKey=await journalHash(owner),key='student-journals/v1/'+ownerKey+'/journal.json';
  const object=await bucket.get(key,action==='sync'&&input.version?{onlyIf:{etagDoesNotMatch:input.version}}:undefined);
  if(object&&object.customMetadata?.format!==JOURNAL_FORMAT)throw unavailable();
  if(object&&!object.body){if(action==='sync'&&object.etag===input.version)return {ownerKey,version:object.etag,notModified:true};throw unavailable();}
  if(object&&object.size>JOURNAL_MAX_BYTES)throw unavailable();
  let document={format:JOURNAL_FORMAT,owner,revision:0,entries:[],receipts:[],updatedAt:null};
  if(object){try{document=validate(JSON.parse(await object.text()),owner);}catch{throw unavailable();}}
  const dto=(data=document,version=object?.etag??null)=>({ownerKey,version,revision:data.revision,entries:data.entries,updatedAt:data.updatedAt});
  if(action==='sync')return dto();
  if(!uuid.test(input.id||'')||!uuid.test(input.operationId||'')||!Number.isSafeInteger(input.revision)||input.revision<0||!Object.hasOwn(input,'version')||!validVersion(input.version))throw fail('This Save needs its entry, revision and file version.',400,'INVALID_JOURNAL_SAVE');
  const patch=values(input.fields??{}),existing=document.entries.find(entry=>entry.id===input.id),source=input.sourceKey===undefined?existing?.sourceKey??null:input.sourceKey===null||input.sourceKey===''?null:text(input.sourceKey,1000,'a reflection reference');
  const payload=await journalHash({id:input.id,revision:input.revision,version:input.version,source,fields:Object.fromEntries(Object.keys(fields).filter(key=>Object.hasOwn(patch,key)).map(key=>[key,patch[key]]))});
  const receipt=document.receipts.find(receipt=>receipt.id===input.operationId);
  if(receipt){if(receipt.hash!==payload)throw fail('This retry belongs to another Save.',409,'OPERATION_ID_REUSED');return {...dto(),entry:existing,savedRevision:receipt.entryRevision,replayed:true};}
  if(input.version!==(object?.etag??null))throw conflict();
  if(existing&&input.sourceKey!==undefined&&source!==existing.sourceKey)throw fail('A lesson reflection reference cannot be reassigned.',400,'INVALID_JOURNAL_SOURCE');
  if(!existing&&input.revision!==0)throw fail('This journal entry is unavailable.',404,'JOURNAL_NOT_FOUND');
  if(existing&&existing.revision!==input.revision||source&&document.entries.some(entry=>entry.sourceKey===source&&entry.id!==input.id))throw conflict();
  if(!existing&&document.entries.length>=JOURNAL_MAX_ENTRIES)throw fail('Your journal has reached its entry limit. Your device draft is kept; download a copy of your journal.',413,'JOURNAL_FULL');
  const now=new Date().toISOString(),entry={id:input.id,sourceKey:source,...Object.fromEntries(Object.keys(fields).map(key=>[key,patch[key]??existing?.[key]??''])),revision:input.revision+1,createdAt:existing?.createdAt||now,updatedAt:now};
  const next={...document,revision:document.revision+1,updatedAt:now,entries:existing?document.entries.map(row=>row.id===entry.id?entry:row):[...document.entries,entry],receipts:[...document.receipts.slice(-(JOURNAL_RECEIPTS-1)),{id:input.operationId,hash:payload,entryId:entry.id,entryRevision:entry.revision,revision:document.revision+1}]};
  const json=JSON.stringify(next);if(new TextEncoder().encode(json).byteLength>JOURNAL_MAX_BYTES)throw fail('This journal is too large to save. Your device draft is kept; download a copy and shorten the entry.',413,'JOURNAL_FULL');
  const saved=await bucket.put(key,json,{onlyIf:object?{etagMatches:object.etag}:{etagDoesNotMatch:'*'},httpMetadata:{contentType:'application/json',cacheControl:'private, no-store'},customMetadata:{format:JOURNAL_FORMAT}});
  if(!saved)throw conflict();
  // Return the complete confirmed device copy without a second storage read.
  return {...dto(next,saved.etag),entry};
 }};
}
