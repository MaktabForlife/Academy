// New bounded read-only native Root website selector. No session/grant/write.
// Browser resource selectors never determine account, ownership or Studio IDs.
import {academyD1Repository} from '../../academy/d1/repository.js';
import {authenticatedD1Account} from '../../academy/d1/session.js';
import {actualState,isAdminWorkspace,hasAdminAuthority} from '../../academy/d1/workspace-access.js';
import {trustedCookieFacts} from './academy-cookie-auth.mjs';
const root='https://ummabbadacademy.app',studio='https://worshipuponbaseera.ummabbadacademy.app';
const fail=(code='STUDIO_SELECTION_UNAVAILABLE',status=503)=>{throw Object.assign(Error(code),{code,status});};
const id=v=>typeof v==='string'&&/^[-A-Za-z0-9_:]{1,180}$/.test(v);
const reply=(value,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'private, no-store','Pragma':'no-cache','X-Content-Type-Options':'nosniff'}});
async function body(request){
 if(!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get('Content-Type')||''))fail('STUDIO_SELECTION_BODY',400);
 const reader=request.body?.getReader();if(!reader)fail('STUDIO_SELECTION_BODY',400);
 let size=0,text='';const d=new TextDecoder('utf-8',{fatal:true});
 try{for(;;){const p=await reader.read();if(p.done)break;size+=p.value.byteLength;if(size>2048){await reader.cancel();fail('STUDIO_SELECTION_BODY',400);}text+=d.decode(p.value,{stream:true});}text+=d.decode();const v=JSON.parse(text);if(!v||Object.getPrototypeOf(v)!==Object.prototype||!id(v.activityKey)||Object.keys(v).some(k=>!['activityKey','surahId','edit','lesson'].includes(k))||v.surahId!==undefined&&!id(v.surahId)||v.lesson!==undefined&&!id(v.lesson)||v.edit!==undefined&&v.edit!=='text')fail('STUDIO_SELECTION_BODY',400);return v;}
 catch(error){if(error.code)throw error;fail('STUDIO_SELECTION_BODY',400);}finally{reader.releaseLock();}
}
export async function readNativeRootStudioSelection(request,env){
 try{
  const u=new URL(request.url);
  if(env.JWT_LOCAL_CHILD_ADMISSION!=='1'||env.JWT_V110_NATIVE_COOKIE!=='1'||env.JWT_V110_MASTER!=='1')return reply({code:'NOT_FOUND'},404);
  if(u.origin!==root||u.pathname!=='/api/academy/website-studio/selection'||u.search||request.method!=='POST'||request.headers.get('Origin')!==root||request.headers.get('Sec-Fetch-Site')!=='same-origin'||request.headers.has('Host')&&request.headers.get('Host')!==u.host)fail('ORIGIN_NOT_ALLOWED',403);
  const input=await body(request),repository=academyD1Repository(env),auth=await authenticatedD1Account(request,env,repository);repository.bindActor?.(auth);
  const c=trustedCookieFacts(auth),state=actualState(auth);
  if(!c||c.sid!==c.psid||!isAdminWorkspace(auth)||auth.adminView||!hasAdminAuthority(auth,input.activityKey))fail('ADMIN_SCOPE_REQUIRED',403);
  const db=env.ACADEMY_DB.withSession('first-primary'),version=await db.prepare('SELECT version FROM split_read_state WHERE singleton=1').first('version'),started=Date.now();
  if(!Number.isSafeInteger(version)||state.account.account_id!==c.sub)fail();
  const lookup=()=>db.prepare(`SELECT a.activity_key,a.kind,t.offering_id,o.state owner,s.enabled,c.website_id course_website,m.website_id surah_website,p.active surah_active
   FROM activities a LEFT JOIN website_platform_timetable_scopes t USING(activity_key)
   LEFT JOIN website_platform_access_scopes s USING(activity_key)
   LEFT JOIN website_platform_access_ownership o USING(activity_key)
   LEFT JOIN website_platform_completed_courses c USING(activity_key)
   LEFT JOIN website_platform_surah_maps m ON m.activity_key=a.activity_key AND m.surah_id=?
   LEFT JOIN program_surahs p ON p.activity_key=m.activity_key AND p.surah_id=m.surah_id
   WHERE a.activity_key=? COLLATE NOCASE AND a.active=1 AND a.lifecycle='ACTIVE'`).bind(input.surahId||'',input.activityKey).first();
  const row=await lookup();
  const current=await repository.session(c.sid,c.sub,c.ce,new Date(),{jwtClaims:auth.cookieClaims});
  const again=await lookup();
  if(!row||!again||Object.keys(row).some(k=>row[k]!==again[k])||!current||!hasAdminAuthority({state:current},input.activityKey)||(await db.prepare('SELECT version FROM split_read_state WHERE singleton=1').first('version'))!==version||Date.now()<started||Date.now()-started>5000)fail('STUDIO_SELECTION_CHANGED',409);
  if(row.owner==='FROZEN')fail('STUDIO_SELECTION_FROZEN',409);
  // Retain the existing actual native inline-editor fallback for Source-owned
  // content. No old external connector or guessed handover is invoked.
  if(!row.owner||row.owner==='ACADEMY')return reply({external:false});
  if(row.owner!=='STUDIO'||row.enabled!==1||!id(row.offering_id))fail();
  const website=input.surahId?(row.surah_active===1?row.surah_website:null):(row.kind==='COURSE'?row.course_website:null);
  if(!id(website))fail('STUDIO_SELECTION_MAPPING_REQUIRED',409);
  const target=new URL(input.edit==='text'?'/builder/':'/studio/',studio);target.searchParams.set('website',website);
  if(input.lesson)target.searchParams.set('lesson',input.lesson);
  return reply({external:true,destination:target.href});
 }catch(error){const status=[400,401,403,409].includes(error?.status)?error.status:503;return reply({code:status===503?'STUDIO_SELECTION_UNAVAILABLE':error.code||'STUDIO_SELECTION_REJECTED'},status);}
}
