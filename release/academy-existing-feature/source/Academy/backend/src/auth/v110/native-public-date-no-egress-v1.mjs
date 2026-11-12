// SOURCE ONLY. Public date fallback reuses native DTO and disables all egress/cache hits.
import {headerDate} from '../../academy/header-date.js';
import {assertLocalIntegrationProfile} from './local-integration-profile.mjs';
const origin='https://ummabbadacademy.app',path='/api/public/header-date';
export function nativeNoEgressRootDateRead(request){
 let u;try{u=new URL(request.url);}catch{return false;}
 if(request.method!=='GET'||u.origin!==origin||u.pathname!==path||u.username||u.password||u.hash)return false;
 if(!u.search&&!u.href.includes('?'))return true;
 const match=u.search.match(/^\?day=([0-9]{4}-[0-9]{2}-[0-9]{2})$/);if(!match)return false;
 const day=new Date(match[1]+'T00:00:00Z');
 return Number.isFinite(day.valueOf())&&day.toISOString().slice(0,10)===match[1];
}
const noEgress=async()=>{throw Error('LOCAL_PUBLIC_DATE_EGRESS_DISABLED');};
const denied=()=>Response.json({success:false,code:'LOCAL_PREVIEW_ACTION_UNAVAILABLE',error:'This action is unavailable in this local test.'},{status:503,headers:{'Cache-Control':'private, no-store','Pragma':'no-cache','X-Content-Type-Options':'nosniff'}});
export function withNativeNoEgressRootDate(native){
 if(typeof native?.fetch!=='function')throw Error('NATIVE_PUBLIC_DATE_CONFIG');
 return Object.freeze({async fetch(request,env,ctx){
  if(nativeNoEgressRootDateRead(request)){
   try{
    assertLocalIntegrationProfile(env);
    if(env.JWT_LOCAL_TEST_ROUTE_POLICY!=='NATIVE_WEBSITE_HIFZ_V1'||env.JWT_LOCAL_STAGE!=='V110_INTEGRATION'||env.JWT_LOCAL_BACKEND_EGRESS!=='DENY_ALL'||env.JWT_LOCAL_AI!=='OFF'||env.JWT_LOCAL_PROVIDERS!=='OFF'||env.JWT_LOCAL_TRANSCRIPTION!=='OFF'||env.JWT_LOCAL_SCHEDULES!=='OFF'||env.VIDEO_AUTOLINK_HTTP_ENABLED!=='0'||env.LOCAL_VIDEO_MANUAL_SOURCE_ENABLED!=='0')return denied();
    return headerDate(request,{fetcher:noEgress,cache:null});
   }catch{return denied();}
  }
  return native.fetch(request,env,ctx);
 }});
}
