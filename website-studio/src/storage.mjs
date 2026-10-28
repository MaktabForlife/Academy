import {format,boundedJSON,sha256,versionKey,error} from './protocol.mjs';
export async function putVersion(bucket,websiteId,payload){
 const text=JSON.stringify({format,websiteId,...payload});if(new TextEncoder().encode(text).length>1200000)throw error('This website version is too large.',413);
 const hash=await sha256(text),key=versionKey(websiteId,hash);await bucket.put(key,text,{onlyIf:{etagDoesNotMatch:'*'},httpMetadata:{contentType:'application/json',cacheControl:'private, no-store'},customMetadata:{sha256:hash}});
 return {websiteId,key,sha256:hash,bytes:new TextEncoder().encode(text).length};
}
export async function getVersion(bucket,reference){
 if(!reference?.key||reference.key!==versionKey(reference.websiteId,reference.sha256))throw error('The website reference is invalid.',503);
 const object=await bucket.get(reference.key);if(!object||object.size>1200000)throw error('This website version is temporarily unavailable.',503,'STUDIO_CONTENT_MISSING');
 const bytes=new Uint8Array(await object.arrayBuffer());if(await sha256(bytes)!==reference.sha256)throw error('This website version could not be verified.',503,'STUDIO_CONTENT_INVALID');
 const value=await boundedJSON(new Response(bytes).body);if(value.format!==format||value.websiteId!==reference.websiteId)throw error('This website version belongs elsewhere.',503);return value;
}
