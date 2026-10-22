import {setupEnabled,acceptedHead,acceptedRepository} from './setup-reader.js';
import {academyD1Repository,rehearsalError} from './repository.js';
import {d1Entrance} from './entrance.js';
import {lessonTimes,sunday,addDays} from '../entrance.js';
import {dateInTimezone} from '../../lib/global-subject-delivery.js';
import {authenticatedD1Account} from './session.js';
import {refreshSetting} from './refresh-state.js';

export function publicTimetableDay(now=new Date()) {
  const day=dateInTimezone(now,'Africa/Johannesburg');
  return {weekStart:sunday(day),startDate:day,expiresAt:new Date(day+'T22:00:00Z').toISOString()};
}
export const publicTimetableKey=(env,period)=>`academy-public-timetable/v4/${encodeURIComponent(env.ENVIRONMENT)}/${encodeURIComponent(env.ACADEMY_D1_RUN_ID||'rehearsal')}/${period.startDate}.json`;
const cacheKeyFor=(request,key)=>new Request(new URL('/api/academy/entrance/public-snapshot/'+key+'?refreshable=1',new URL(request.url).origin),{method:'GET'});
const snapshotResponse=(snapshot,period,now)=>new Response(JSON.stringify(snapshot),{headers:{'Content-Type':'application/json','Cache-Control':`public, max-age=${Math.min(60,Math.max(0,Math.floor((Date.parse(period.expiresAt)-now.getTime())/1000)))}`}});
async function buildSnapshot(repository,period,now){
 const data=await d1Entrance(repository,null,null,{startDate:period.weekStart},now,{days:84});
 if(data.warnings.some(warning=>warning.endsWith('timetable is unavailable.')))throw rehearsalError('The public timetable snapshot could not be prepared.');
 return publicTimetableSnapshot(data,period,now);
}

// This is a marketing snapshot, never a copy of an authenticated response.
// Whitelist on both creation and retrieval; no accounts, classes, teachers,
// memberships, media or meeting URLs are stored. Free lessons include only
// an opaque published reference and clock boundaries for click-time joining.
export function publicTimetableSnapshot(data,period,now=new Date()) {
  return {success:true,snapshotVersion:4,snapshotDate:period.startDate,expiresAt:period.expiresAt,generatedAt:data.generatedAt||now.toISOString(),
    ...(Number.isSafeInteger(data.sourceRevision)?{sourceRevision:data.sourceRevision}:{}),signedIn:false,globalAdmin:false,student:false,startDate:data.startDate,endDate:addDays(data.startDate,6),availableEndDate:data.availableEndDate||data.endDate,timezone:data.timezone,
    activities:[],personalActivities:[],activityPages:[],personalTimetable:[],activity:null,warnings:[],calendarEvents:[],
    timetable:data.timetable.filter(row=>row.status==='SCHEDULED').map(row=>({kind:row.kind,activityId:row.activityId,
      ...(row.kind==='PROGRAM'||row.kind==='COURSE'&&row.publicCard?{publicCard:Object.fromEntries(['time','title','description'].map(key=>[key,typeof row.publicCard?.[key]==='string'?row.publicCard[key].slice(0,({time:12,title:80,description:240})[key]):'']))}:{}),activityName:row.activityName,title:row.activityName||row.title,date:row.date,startTime:row.startTime,endTime:row.endTime,timezone:row.timezone,status:'SCHEDULED',...(row.publicJoin===true&&typeof row.joinKey==='string'?{publicJoin:true,joinKey:row.joinKey,...lessonTimes(row)}:{})}))};
}

export async function publicTimetable(request,env,now=new Date(),edgeCache=globalThis.caches?.default) {
  if(request.method!=='GET')throw rehearsalError('Use GET.',405,'METHOD_NOT_ALLOWED');
  if(request.headers.has('Authorization'))throw rehearsalError('Open the public timetable without an account session.',400,'PUBLIC_SNAPSHOT_ONLY');
  if(!['local','development'].includes(env.ENVIRONMENT)||!['REHEARSAL','ACTIVE'].includes(env.ACADEMY_D1_MODE)||
    env.ACADEMY_D1_MODE==='ACTIVE'&&(!env.ACADEMY_D1_RUN_ID||env.ACADEMY_LIBRARY_MODE!=='PUBLIC_ONLY'))
    throw rehearsalError('Academy activation configuration is incomplete.',503,'ACTIVATION_REQUIRED');
  let repository;
  if(setupEnabled(env)){const source=academyD1Repository(env);await source.ready();repository=acceptedRepository(source,await acceptedHead(source,request.headers.get('X-Academy-Setup')||''));}
  const period=publicTimetableDay(now),key=publicTimetableKey(env,period)+(repository?'.accepted-'+repository.setup.head:'');
  const cacheKey=cacheKeyFor(request,key);
  const valid=data=>data?.snapshotVersion===4&&data.snapshotDate===period.startDate&&data.startDate===period.weekStart&&data.signedIn===false&&Array.isArray(data.timetable);
  let snapshot,edgeHit=false;
  if(edgeCache)try { const cached=await edgeCache.match(cacheKey);if(cached){const data=await cached.json();if(valid(data)){snapshot=publicTimetableSnapshot(data,period,now);edgeHit=true;}} }catch { /* R2 remains the durable snapshot. */ }
  if(!snapshot&&env.MEDIA_BUCKET){
    const stored=await env.MEDIA_BUCKET.get(key);
    if(stored){const data=await stored.json();if(valid(data))snapshot=publicTimetableSnapshot(data,period,now);}
  }
  if(!snapshot){
    if(!env.MEDIA_BUCKET&&env.ENVIRONMENT!=='local')throw rehearsalError('The public timetable snapshot store is unavailable.');
    repository??=academyD1Repository(env);await repository.ready();
    // One durable daily snapshot supplies twelve Sunday-based public weeks.
    // Browsing these weeks is local and never issues more visitor D1 queries.
    snapshot=await buildSnapshot(repository,period,now);
    if(env.MEDIA_BUCKET){
      const written=await env.MEDIA_BUCKET.put(key,JSON.stringify(snapshot),{httpMetadata:{contentType:'application/json'},onlyIf:{etagDoesNotMatch:'*'}});
      if(!written){const existing=await env.MEDIA_BUCKET.get(key);const winner=existing&&await existing.json();if(valid(winner))snapshot=publicTimetableSnapshot(winner,period,now);}
    }
  }
  const response=snapshotResponse(snapshot,period,now);
  if(edgeCache&&!edgeHit)try { await edgeCache.put(cacheKey,response.clone()); }catch { /* Serving R2 does not require an edge-cache write. */ }
  return response;
}

// Visitors still read one durable daily snapshot. Explicit administration and
// successful Program publication share the same conditional replacement.
async function replaceSnapshot(request,env,repository,authorize,now,edgeCache,sourceRevision){
 await authorize();
 if(!env.MEDIA_BUCKET)throw rehearsalError('The public timetable snapshot store is unavailable.');
 if(setupEnabled(env))repository=acceptedRepository(repository,await acceptedHead(repository));
 const period=publicTimetableDay(now),key=publicTimetableKey(env,period)+(repository.setup?.head?'.accepted-'+repository.setup.head:''),previous=await env.MEDIA_BUCKET.get(key);
 const manual=sourceRevision===undefined;
 const currentRevision=async()=>Number((await repository.db.prepare("SELECT json_extract(setting_value,'$.requested') AS revision FROM academy_settings WHERE setting_key=?").bind(refreshSetting('public-timetable')).first())?.revision||0);
 if(manual)sourceRevision=await currentRevision();
 if(sourceRevision!==undefined&&previous&&(await previous.json()).sourceRevision>sourceRevision)throw rehearsalError('A newer timetable is already published.',409,'SNAPSHOT_CHANGED');
 const snapshot=await buildSnapshot(repository,period,now);
 if(sourceRevision!==undefined)snapshot.sourceRevision=sourceRevision;
 await authorize();
 if(manual&&await currentRevision()!==sourceRevision)throw rehearsalError('A newer timetable change is pending. Please refresh again.',409,'SNAPSHOT_CHANGED');
 const written=await env.MEDIA_BUCKET.put(key,JSON.stringify(snapshot),{httpMetadata:{contentType:'application/json'},onlyIf:previous?{etagMatches:previous.etag}:{etagDoesNotMatch:'*'}});
 if(!written)throw rehearsalError('The public timetable changed during refresh. Please refresh it again.',409,'SNAPSHOT_CHANGED');
 if(manual)await repository.db.prepare("UPDATE academy_settings SET setting_value=json_set(setting_value,'$.published',?,'$.attempts',0,'$.nextAttemptAt',0,'$.leaseUntil',0) WHERE setting_key=? AND json_extract(setting_value,'$.requested')=?").bind(sourceRevision,refreshSetting('public-timetable'),sourceRevision).run();
 if(edgeCache)try{await edgeCache.put(cacheKeyFor(request,key),snapshotResponse(snapshot,period,now));}catch{/* Other regions receive the durable replacement within one minute. */}
 return {snapshotDate:period.startDate,generatedAt:snapshot.generatedAt,lessons:snapshot.timetable.length,refreshWithinSeconds:60};
}
export function refreshPendingTimetable(request,env,repository,revision,check,now=new Date(),edgeCache=globalThis.caches?.default){
 return replaceSnapshot(request,env,repository,check,now,edgeCache,revision);
}
export async function refreshPublicTimetable(request,env,repository,auth,now=new Date(),edgeCache=globalThis.caches?.default){
 if(!auth.state.account.global_admin)throw rehearsalError('Only a Global Admin can refresh the public timetable.',403,'FORBIDDEN');
 return replaceSnapshot(request,env,repository,async()=>{
  const current=await authenticatedD1Account(request,env,repository);
  if(!current.state.account.global_admin)throw rehearsalError('Only a Global Admin can refresh the public timetable.',403,'FORBIDDEN');
 },now,edgeCache);
}
// The Publish button follows its confirmed transaction with a separate request
// to stay within the Free plan's per-invocation D1 budget. Require a committed
// publication in the actor's scope; this does not widen manual Academy access.
export async function refreshPublishedTimetable(request,env,repository,auth,input,now=new Date(),edgeCache=globalThis.caches?.default){
 const activity='PROGRAM:'+String(input.id||'');
 const permitted=state=>state.account.global_admin||state.roles.some(r=>r.role==='PROGRAM_ADMIN'&&r.activity_key.toUpperCase()===activity.toUpperCase());
 if(!permitted(auth.state))throw rehearsalError('This publication requires an authorised Program administrator.',403,'FORBIDDEN');
 if(typeof input.publicationId!=='string'||input.publicationId.length>200||!await repository.db.prepare('SELECT 1 FROM timetable_publications WHERE activity_key=? AND publication_id=?').bind(activity,input.publicationId).first())
  throw rehearsalError('Publish this Program timetable before refreshing its public snapshot.',409,'PUBLICATION_REQUIRED');
 return replaceSnapshot(request,env,repository,async()=>{
  const current=await authenticatedD1Account(request,env,repository);
  if(!permitted(current.state))
   throw rehearsalError('This publication requires an authorised Program administrator.',403,'FORBIDDEN');
 },now,edgeCache);
}
