import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {mediaFixture} from './academy-lesson-media-fixture.mjs';
import worker from '../../src/academy-runtime.js';
import {WorkspaceRequest} from './workspace-request.mjs';
export const mp4=Buffer.concat([Buffer.from([0,0,0,24]),Buffer.from('ftypisom'),Buffer.alloc(200)]);
export function videoBucket(){
 const objects=new Map(),uploads=new Map();
 const head=key=>{const value=objects.get(key);return value?{key,size:value.bytes.length,uploaded:value.uploaded,httpMetadata:value.httpMetadata}:null;};
 const resume=(key,id)=>({key,uploadId:id,
  async uploadPart(partNumber,body){const u=uploads.get(id);if(!u||u.key!==key)throw Error('Upload not found');const bytes=Buffer.from(await new Response(body).arrayBuffer()),etag=createHash('sha256').update(bytes).digest('hex');u.parts.set(partNumber,{bytes,etag});return {partNumber,etag};},
  async complete(parts){const u=uploads.get(id);if(!u||u.key!==key)throw Error('Upload not found');const bytes=Buffer.concat(parts.map(p=>{const stored=u.parts.get(p.partNumber);if(!stored||stored.etag!==p.etag)throw Error('Part mismatch');return stored.bytes;}));objects.set(key,{bytes,uploaded:new Date(),httpMetadata:u.options.httpMetadata});uploads.delete(id);return head(key);},
  async abort(){uploads.delete(id);}
 });
 return {objects,uploads,async head(key){return head(key);},async get(key,{range}={}){const o=objects.get(key);return o?{...head(key),body:new Blob([range?o.bytes.subarray(range.offset,range.offset+range.length):o.bytes]).stream()}:null;},async put(key,body,options){objects.set(key,{bytes:Buffer.from(await new Response(body).arrayBuffer()),uploaded:new Date(),httpMetadata:options.httpMetadata});return head(key);},async delete(key){objects.delete(key);},async createMultipartUpload(key,options){const id=crypto.randomUUID();uploads.set(id,{key,options,parts:new Map()});return resume(key,id);},resumeMultipartUpload:resume};
}
export async function videoFixture(){
 const f=await mediaFixture();f.env.AUTH_LOGIN_RATE_LIMITER={limit:async()=>({success:true})};
 f.db.exec('BEGIN');f.db.exec(readFileSync(new URL('../../migrations/academy/0037_session_mp4.sql',import.meta.url),'utf8'));f.db.exec('COMMIT');
 f.env.LESSON_MEDIA_BUCKET=videoBucket();
 f.videoPart=async(input,token,bytes=mp4)=>{const response=await worker.fetch(new WorkspaceRequest('http://localhost/api/academy/lesson-media/video-part?metadata='+encodeURIComponent(JSON.stringify(input)),{method:'POST',headers:{Authorization:'Bearer '+token},body:bytes}),f.env);return {status:response.status,body:await response.json()};};
 f.videoGet=async(path,headers={},method='GET')=>worker.fetch(new Request('http://localhost'+path,{method,headers}),f.env);
 return f;
}
