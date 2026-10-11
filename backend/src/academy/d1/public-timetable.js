import {academyD1Repository,rehearsalError} from './repository.js';
import {d1Entrance} from './entrance.js';
import {lessonTimes} from '../entrance.js';
import {authenticatedD1Account} from './session.js';

export function publicTimetableDay(now=new Date()) {
  const start=new Date(now);start.setUTCHours(0,0,0,0);
  return {startDate:start.toISOString().slice(0,10),expiresAt:new Date(start.getTime()+86400000).toISOString()};
}
export const publicTimetableKey=(env,period)=>`academy-public-timetable/v3/${encodeURIComponent(env.ENVIRONMENT)}/${encodeURIComponent(env.ACADEMY_D1_RUN_ID||'rehearsal')}/${period.startDate}.json`;
const cacheKeyFor=(request,key)=>new Request(new URL('/api/academy/entrance/public-snapshot/'+key+'?refreshable=1',new URL(request.url).origin),{method:'GET'});
const snapshotResponse=(snapshot,period,now)=>new Response(JSON.stringify(snapshot),{headers:{'Content-Type':'application/json','Cache-Control':`public, max-age=${Math.min(60,Math.max(0,Math.floor((Date.parse(period.expiresAt)-now.getTime())/1000)))}`}});
async function buildSnapshot(repository,period,now){
 const data=await d1Entrance(repository,null,null,{startDate:period.startDate},now,{days:7});
 if(data.warnings.some(warning=>warning.endsWith('timetable is unavailable.')))throw rehearsalError('The public timetable snapshot could not be prepared.');
 return publicTimetableSnapshot(data,period,now);
}

// This is a marketing snapshot, never a copy of an authenticated response.
// Whitelist on both creation and retrieval; no accounts, classes, teachers,
// memberships, media or meeting URLs are stored. Free lessons include only
// an opaque published reference and clock boundaries for click-time joining.
export function publicTimetableSnapshot(data,period,now=new Date()) {
  return {success:true,snapshotVersion:3,snapshotDate:period.startDate,expiresAt:period.expiresAt,generatedAt:data.generatedAt||now.toISOString(),
    signedIn:false,globalAdmin:false,student:false,startDate:data.startDate,endDate:data.endDate,timezone:data.timezone,
    activities:[],personalActivities:[],activityPages:[],personalTimetable:[],activity:null,warnings:[],calendarEvents:[],
    timetable:data.timetable.filter(row=>row.status==='SCHEDULED').map(row=>({kind:row.kind,activityId:row.activityId,
      ...(row.kind==='PROGRAM'?{publicCard:Object.fromEntries(['time','title','description'].map(key=>[key,typeof row.publicCard?.[key]==='string'?row.publicCard[key].slice(0,({time:12,title:80,description:240})[key]):'']))}:{}),activityName:row.activityName,title:row.activityName||row.title,date:row.date,startTime:row.startTime,endTime:row.endTime,timezone:row.timezone,status:'SCHEDULED',...(row.publicJoin===true&&typeof row.joinKey==='string'?{publicJoin:true,joinKey:row.joinKey,...lessonTimes(row)}:{})}))};
}

export async function publicTimetable(request,env,now=new Date(),edgeCache=globalThis.caches?.default) {
  if(request.method!=='GET')throw rehearsalError('Use GET.',405,'METHOD_NOT_ALLOWED');
  if(request.headers.has('Authorization'))throw rehearsalError('Open the public timetable without an account session.',400,'PUBLIC_SNAPSHOT_ONLY');
  if(!['local','development'].includes(env.ENVIRONMENT)||!['REHEARSAL','ACTIVE'].includes(env.ACADEMY_D1_MODE)||
    env.ACADEMY_D1_MODE==='ACTIVE'&&(!env.ACADEMY_D1_RUN_ID||env.ACADEMY_LIBRARY_MODE!=='PUBLIC_ONLY'))
    throw rehearsalError('Academy activation configuration is incomplete.',503,'ACTIVATION_REQUIRED');
  const period=publicTimetableDay(now),key=publicTimetableKey(env,period);
  const cacheKey=cacheKeyFor(request,key);
  const valid=data=>data?.snapshotVersion===3&&data.snapshotDate===period.startDate&&data.signedIn===false&&Array.isArray(data.timetable);
  let snapshot,edgeHit=false;
  if(edgeCache)try { const cached=await edgeCache.match(cacheKey);if(cached){const data=await cached.json();if(valid(data)){snapshot=publicTimetableSnapshot(data,period,now);edgeHit=true;}} }catch { /* R2 remains the durable snapshot. */ }
  if(!snapshot&&env.MEDIA_BUCKET){
    const stored=await env.MEDIA_BUCKET.get(key);
    if(stored){const data=await stored.json();if(valid(data))snapshot=publicTimetableSnapshot(data,period,now);}
  }
  if(!snapshot){
    if(!env.MEDIA_BUCKET&&env.ENVIRONMENT!=='local')throw rehearsalError('The public timetable snapshot store is unavailable.');
    const repository=academyD1Repository(env);await repository.ready();
    // The public preview covers the next seven days.
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

// Rebuild only on an explicit Global Admin action. Visitors still read one
// durable daily snapshot; short edge caching propagates a manual replacement
// across regions without adding visitor D1 reads or background polling.
export async function refreshPublicTimetable(request,env,repository,auth,now=new Date(),edgeCache=globalThis.caches?.default){
 if(!auth.state.account.global_admin)throw rehearsalError('Only a Global Admin can refresh the public timetable.',403,'FORBIDDEN');
 if(!env.MEDIA_BUCKET)throw rehearsalError('The public timetable snapshot store is unavailable.');
 const period=publicTimetableDay(now),key=publicTimetableKey(env,period),previous=await env.MEDIA_BUCKET.get(key);
 const snapshot=await buildSnapshot(repository,period,now);
 const current=await authenticatedD1Account(request,env,repository);
 if(!current.state.account.global_admin)throw rehearsalError('Only a Global Admin can refresh the public timetable.',403,'FORBIDDEN');
 const written=await env.MEDIA_BUCKET.put(key,JSON.stringify(snapshot),{httpMetadata:{contentType:'application/json'},onlyIf:previous?{etagMatches:previous.etag}:{etagDoesNotMatch:'*'}});
 if(!written)throw rehearsalError('The public timetable changed during refresh. Please refresh it again.',409,'SNAPSHOT_CHANGED');
 if(edgeCache)try{await edgeCache.put(cacheKeyFor(request,key),snapshotResponse(snapshot,period,now));}catch{/* Other regions receive the durable replacement within one minute. */}
 return {snapshotDate:period.startDate,generatedAt:snapshot.generatedAt,lessons:snapshot.timetable.length,refreshWithinSeconds:60};
}
