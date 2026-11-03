// Local-only R2 adapter: one JSON file per student; no hosted storage or SQL.
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,readFileSync,writeFileSync,renameSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
const etag=body=>createHash('sha256').update(body).digest('hex');
export function journalBucket(directory=null){
 const objects=new Map(),calls={get:0,put:0,heads:0},format='ACADEMY_STUDENT_JOURNAL_R2_V1';
 if(directory){mkdirSync(directory,{recursive:true});for(const file of readdirSync(directory))if(/^[a-f0-9]{64}\.json$/.test(file)){const body=readFileSync(join(directory,file),'utf8');objects.set('student-journals/v1/'+file.slice(0,-5)+'/journal.json',{body,etag:etag(body),customMetadata:{format}});}}
 const matches=(object,condition)=>!condition||(!condition.etagMatches||object?.etag===condition.etagMatches)&&(!condition.etagDoesNotMatch||(condition.etagDoesNotMatch==='*'?!object:object?.etag!==condition.etagDoesNotMatch));
 return {objects,calls,failPut:false,
  async get(key,options){calls.get++;const object=objects.get(key);if(!object)return null;const metadata={etag:object.etag,size:Buffer.byteLength(object.body),customMetadata:object.customMetadata};if(!matches(object,options?.onlyIf))return metadata;return {...metadata,body:new ReadableStream(),text:async()=>object.body};},
  async put(key,body,options={}){calls.put++;if(this.failPut)throw Error('Synthetic R2 write failure');if(!matches(objects.get(key),options.onlyIf))return null;const record={body:String(body),etag:etag(String(body)),customMetadata:options.customMetadata};if(directory){const owner=key.match(/^student-journals\/v1\/([a-f0-9]{64})\/journal\.json$/)?.[1];if(!owner)throw Error('Invalid synthetic journal key');const file=join(directory,owner+'.json');writeFileSync(file+'.tmp',record.body);renameSync(file+'.tmp',file);}objects.set(key,record);return {etag:record.etag};},
  documents(){return [...objects.values()].map(object=>JSON.parse(object.body));}
 };
}
