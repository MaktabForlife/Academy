import {payloadHash} from '../../programs/timetable-model.js';
import {academyDate} from './academy-clock.js';
import {actorProof} from '../separation/proof.js';

const format='ACADEMY_PRIVATE_SNAPSHOT_V1',maxBytes=4*1024*1024;
// Server-side data snapshots only. Authentication/workspace selection happens
// before entry. Never use a public media bucket, cache a mutation, or retain a
// permission decision between requests. The timetable caches its source rows;
// lesson joining and the final time-sensitive projection still run live.
export async function privateSnapshot(repository,auth,{kind,input={},date,now=Date.now()},produce){
 const snapshots=repository.privateSnapshots;
 if(!auth||!snapshots?.bucket?.get||!snapshots.bucket.put)return produce();
 const proof=actorProof(auth),timezone=(await repository.homeConfiguration())?.setting_value||'Africa/Johannesburg';
 const identity=await payloadHash([format,snapshots.namespace,kind,auth.user.accountid,auth.workspaceContext||auth.workspace,auth.adminView||false,auth.classView||null,input]);
 // Replace the same object as dates/publications advance instead of retaining
 // a permanent extra object for every account on every day.
 const key='academy-private-snapshots/v1/'+identity+'.json';
 let previous;
 for(let attempt=0;attempt<2;attempt++){
  const before=await snapshots.revision(auth,previous,kind);
  if(!before.enabled)return produce();
  const revision=await payloadHash([format,repository.setup?.head||'ADMIN',timezone,date||academyDate(new Date(now),timezone),before.source,proof.epoch,proof.signature]);
  let stored=null;
  try{const object=await snapshots.bucket.get(key);if(object&&object.size<=maxBytes)stored=await object.json();}catch{/* Storage is optional; a miss uses the established reader. */}
  const hit=stored?.format===format&&stored.revision===revision&&stored.expiresAt>now&&Object.hasOwn(stored,'data');
  const data=hit?stored.data:await produce();
  const after=await snapshots.revision(auth,before,kind);
  if(JSON.stringify(before)!==JSON.stringify(after)){previous=after;continue;}
  if(!hit){
   const encoded=JSON.stringify({format,revision,expiresAt:now+86400000,data});
   if(new TextEncoder().encode(encoded).byteLength<=maxBytes){
    try{await snapshots.bucket.put(key,encoded,{httpMetadata:{contentType:'application/json',cacheControl:'private, no-store'}});}catch{/* A failed cache write never changes the response. */}
    // Storage can be slow. Recheck authority and source after that final await,
    // including when a failed write delayed the uncached response.
    const final=await snapshots.revision(auth,after,kind);
    if(JSON.stringify(after)!==JSON.stringify(final)){previous=final;continue;}
   }
  }
  return data;
 }
 throw Object.assign(Error('Academy information changed while loading. Please refresh.'),{status:409,code:'SNAPSHOT_CHANGED'});
}
