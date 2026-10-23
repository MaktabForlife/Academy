import {academyD1Repository,rehearsalError} from './repository.js';
import {refreshPendingTimetable} from './public-timetable.js';
import {refreshKinds,refreshSetting,refreshObject} from './refresh-state.js';

const json=(body,ttl=60)=>new Response(JSON.stringify(body),{headers:{'Content-Type':'application/json','Cache-Control':`public, max-age=${ttl}`}});
// This route deliberately creates no repository and performs no D1 reads.
export async function profileLabelsVersion(request,env,edge=globalThis.caches?.default) {
  if(!['local','development'].includes(env.ENVIRONMENT)||!['REHEARSAL','ACTIVE'].includes(env.ACADEMY_D1_MODE))throw rehearsalError('Academy activation configuration is incomplete.',503,'ACTIVATION_REQUIRED');
  if(request.method!=='GET')throw rehearsalError('Use GET.',405,'METHOD_NOT_ALLOWED');
  if(request.headers.has('Authorization'))throw rehearsalError('Read the public version without an account session.',400,'PUBLIC_SNAPSHOT_ONLY');
  const key=new Request(new URL('/api/academy/profile-labels-version',request.url));
  if(edge){const cached=await edge.match(key);if(cached)return cached;}
  const object=await env.MEDIA_BUCKET?.get(refreshObject(env,'profile-labels'));
  const stored=object?await object.json():null;
  const revision=Number.isSafeInteger(stored?.revision)&&stored.revision>=0?stored.revision:0;
  const response=json({success:true,profileLabelsVersion:String(revision)});
  if(edge)try{await edge.put(key,response.clone());}catch{/* R2 remains available. */}
  return response;
}

async function publishLabels(env,revision) {
  const key=refreshObject(env,'profile-labels'),previous=await env.MEDIA_BUCKET.get(key);
  if(previous&&(await previous.json()).revision>=revision)return;
  const saved=await env.MEDIA_BUCKET.put(key,JSON.stringify({revision}),{httpMetadata:{contentType:'application/json'},onlyIf:previous?{etagMatches:previous.etag}:{etagDoesNotMatch:'*'}});
  if(!saved)throw rehearsalError('A newer cache update is being published.',409,'CACHE_REFRESH_CHANGED');
}

// At most two tiny pending records are read. A lease coalesces concurrent calls;
// generation checks retain later changes and prevent stale acknowledgements.
export async function processCacheRefresh(request,env,{repository,now=new Date(),edge=globalThis.caches?.default}={}) {
  if(!env.MEDIA_BUCKET)return {completed:[],pending:true};
  const pauseKey=refreshObject(env,'quota-pause'),pause=await env.MEDIA_BUCKET.get(pauseKey);
  if(pause&&Number((await pause.json()).until)>now.getTime())return {completed:[],pending:true};
  repository??=academyD1Repository(env);
  const p=(sql,...values)=>repository.db.prepare(sql).bind(...values),time=now.getTime();
  let rows;
  try{rows=(await p('SELECT setting_key,setting_value FROM academy_settings WHERE setting_key IN (?,?)',...refreshKinds.map(refreshSetting)).all()).results;}
  catch(error){
    if(!/daily.*(?:row|read|write).*limit|exceeded.*free tier/i.test(error.message))throw error;
    const tomorrow=new Date(time);tomorrow.setUTCHours(24,0,0,0);
    try{await env.MEDIA_BUCKET.put(pauseKey,JSON.stringify({until:tomorrow.getTime()}),{httpMetadata:{contentType:'application/json'}});}catch{/* Next recovery remains bounded. */}
    return {completed:[],pending:true};
  }
  const completed=[];let pending=false,ready=false;
  for(const row of rows) {
    const kind=refreshKinds.find(k=>refreshSetting(k)===row.setting_key),state=JSON.parse(row.setting_value);
    if(!Number.isSafeInteger(state.requested)||state.requested<=state.published)continue;
    pending=true;if(state.nextAttemptAt>time||state.leaseUntil>time)continue;
    const revision=state.requested;
    const claim=await p(`UPDATE academy_settings SET setting_value=json_set(setting_value,'$.leaseUntil',?) WHERE setting_key=?
      AND json_extract(setting_value,'$.requested')=? AND json_extract(setting_value,'$.published')<?
      AND COALESCE(json_extract(setting_value,'$.leaseUntil'),0)<=? AND COALESCE(json_extract(setting_value,'$.nextAttemptAt'),0)<=?`,time+120000,row.setting_key,revision,revision,time,time).run();
    if(!claim.meta.changes)continue;
    try {
      if(kind==='profile-labels')await publishLabels(env,revision);
      else {
        if(!ready){await repository.ready();ready=true;}
        await refreshPendingTimetable(request,env,repository,revision,async()=>{
          const current=await p('SELECT json_extract(setting_value,\'$.requested\') AS revision FROM academy_settings WHERE setting_key=?',row.setting_key).first();
          if(current?.revision!==revision)throw rehearsalError('A newer timetable change is pending.',409,'CACHE_REFRESH_CHANGED');
        },now,edge);
      }
      const done=await p(`UPDATE academy_settings SET setting_value=json_set(setting_value,'$.published',?,'$.leaseUntil',0,'$.attempts',0,'$.nextAttemptAt',0) WHERE setting_key=? AND json_extract(setting_value,'$.requested')=?`,revision,row.setting_key,revision).run();
      if(done.meta.changes>0)completed.push(kind);
    }catch(error) {
      const quota=/daily.*(?:row|read|write).*limit|exceeded.*free tier/i.test(error.message);
      const tomorrow=new Date(time);tomorrow.setUTCHours(24,0,0,0);
      const retryAt=quota?tomorrow.getTime():time+Math.min(3600000,60000*2**Math.min(state.attempts||0,6));
      if(quota)try{await env.MEDIA_BUCKET.put(pauseKey,JSON.stringify({until:retryAt}),{httpMetadata:{contentType:'application/json'}});}catch{/* No immediate retry. */}
      try{await p(`UPDATE academy_settings SET setting_value=json_set(setting_value,'$.leaseUntil',0,'$.attempts',?,'$.nextAttemptAt',?) WHERE setting_key=? AND json_extract(setting_value,'$.requested')=?`,(state.attempts||0)+1,retryAt,row.setting_key,revision).run();}catch{/* The lease expires; quota pause also survives in R2. */}
      if(quota)break;
    }
  }
  return {completed,pending:pending&&completed.length<rows.filter(r=>{const s=JSON.parse(r.setting_value);return s.requested>s.published;}).length};
}

export async function recoverCacheRefresh(env,now=new Date()) {
  // Recovery is bounded and does not authenticate synthetic users or load a home
  // page when there is no pending public timetable change.
  try{return await processCacheRefresh(new Request((env.API_ORIGIN||'https://academy.invalid')+'/api/academy/cache/refresh'),env,{now,...(!env.API_ORIGIN?{edge:null}:{})});}
  catch{return {completed:[],pending:true};}
}
