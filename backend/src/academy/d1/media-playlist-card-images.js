import {managementError as fail} from './management-store.js';
import {mediaPlaylistStore,playlistUUID} from './media-playlist-store.js';
import {playlistCardImage} from './media-playlist-card.js';
import {fileKind} from '../../../../academy/course-websites/model.mjs';
export const playlistCardImageKey=(env,activityKey,playlistId,hash)=>(env.ACADEMY_OBJECT_NAMESPACE||'')+'native-playlist-cards/'+encodeURIComponent(activityKey.toUpperCase())+'/'+playlistId+'/'+hash;
const target=input=>{if(!playlistUUID.test(input.playlistId||''))throw fail('Choose the exact playlist for this card image.');return input.playlistId;};
export async function checkPlaylistCardImage(env,activityKey,playlistId,image){
 if(!image)return;const object=await env.LESSON_MEDIA_BUCKET?.head(playlistCardImageKey(env,activityKey,playlistId,image.sha256));
 if(!object||object.size!==image.size||object.httpMetadata?.contentType!==image.type)throw fail('The playlist card image is missing or changed. Upload it again.',409,'PLAYLIST_CARD_IMAGE_MISSING');
}
export async function uploadPlaylistCardImage(request,repository,auth,env,input){
 const store=mediaPlaylistStore(repository,auth),area=await store.current(input.activityKey,{write:true}),playlistId=target(input),image=playlistCardImage(input.image);
 if(!env.LESSON_MEDIA_BUCKET?.put)throw fail('Card image storage is unavailable.',503);const reader=request.body?.getReader();if(!reader)throw fail('Choose a card image.');
 const bytes=new Uint8Array(image.size);let size=0;
 try{while(true){const part=await reader.read();if(part.done)break;if(size+part.value.length>bytes.length)throw fail('The image size changed.',413);bytes.set(part.value,size);size+=part.value.length;}}catch(error){await reader.cancel();throw error;}
 if(size!==bytes.length||fileKind(bytes.slice(0,16))!==image.type)throw fail('Choose a valid PNG, JPEG or WebP image.');
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');if(hash!==image.sha256)throw fail('The image checksum changed. Choose it again.');
 const current=await store.current(area.activity_key,{write:true});if(current.readVersion!==area.readVersion)throw fail('Your programme or access changed during upload. Retry from the current playlist.',409,'PLAYLIST_CHANGED');
 await env.LESSON_MEDIA_BUCKET.put(playlistCardImageKey(env,area.activity_key,playlistId,hash),bytes,{sha256:hash,httpMetadata:{contentType:image.type}});
 // No DB publication or public URL is created by uploading bytes.
 await store.current(area.activity_key,{write:true});return {playlistId,image};
}
function response(request,object,image,publicCover=false){return new Response(request.method==='HEAD'?null:object.body,{headers:{'Content-Type':image.type,'Content-Length':String(image.size),'Cache-Control':publicCover?'public, max-age=31536000, immutable':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox"}});}
export async function previewPlaylistCardImage(request,repository,auth,env,input){
 const store=mediaPlaylistStore(repository,auth),area=await store.current(input.activityKey,{write:true}),playlistId=target(input),image=playlistCardImage(input.image),object=await env.LESSON_MEDIA_BUCKET?.get(playlistCardImageKey(env,area.activity_key,playlistId,image.sha256));
 if(!object||object.size!==image.size||object.httpMetadata?.contentType!==image.type)throw fail('This card image is unavailable.',404,'NOT_FOUND');await store.current(area.activity_key,{write:true});return response(request,object,image);
}
export const publicPlaylistCardImageKey=(env,hash)=>(env.ACADEMY_OBJECT_NAMESPACE||'')+'public-native-playlist-cards/'+hash;
// Called only after a successful guarded Publish (also on exact Publish retry).
// A failed copy leaves the committed publication retryable; private Save never calls it.
export async function promotePlaylistCardImage(env,activityKey,playlistId,image){
 if(!image)return;const checked=playlistCardImage(image),object=await env.LESSON_MEDIA_BUCKET?.get(playlistCardImageKey(env,activityKey,playlistId,checked.sha256));
 if(!object||object.size!==checked.size||object.httpMetadata?.contentType!==checked.type)throw fail('The published artwork copy is incomplete. Retry Publish to finish it.',503,'PLAYLIST_CARD_PROMOTION_PENDING');
 try{await env.LESSON_MEDIA_BUCKET.put(publicPlaylistCardImageKey(env,checked.sha256),object.body,{sha256:checked.sha256,httpMetadata:{contentType:checked.type}});}catch{throw fail('The published artwork copy is incomplete. Retry Publish to finish it.',503,'PLAYLIST_CARD_PROMOTION_PENDING');}
}
export async function publicPlaylistCardImage(request,env){
 const hash=new URL(request.url).searchParams.get('sha256');if(!/^[a-f0-9]{64}$/.test(hash||''))throw fail('This card image is unavailable.',404,'NOT_FOUND');
 const object=await env.LESSON_MEDIA_BUCKET?.get(publicPlaylistCardImageKey(env,hash));if(!object||!['image/png','image/jpeg','image/webp'].includes(object.httpMetadata?.contentType)||!Number.isSafeInteger(object.size)||object.size<8||object.size>5*1024*1024)throw fail('This card image is unavailable.',404,'NOT_FOUND');return response(request,object,{type:object.httpMetadata.contentType,size:object.size},true);
}
