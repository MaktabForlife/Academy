// NEW native-baseline-only local entry. Default public manifest is empty.
// No JWT route, child sync endpoint, cron, fallback or initializer is exposed.
import academy from '../academy-runtime.js';
import {recoveryBucket} from './d1/recovery-storage.js';
import {localNativeStageEnvironment} from './jwt-local-native-stage-policy.mjs';
const origin='https://ummabbadacademy.app';
const stopped=()=>Response.json({code:'LOCAL_NATIVE_STAGE_UNAVAILABLE'},{status:503,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
const missing=()=>new Response(null,{status:404,headers:{'Cache-Control':'no-store'}});
export function nativeStageStorage(env,{coordinator=false}={}){
 const selected=localNativeStageEnvironment(env,{coordinator});
 return {...selected,...Object.fromEntries(['LESSON_MEDIA_BUCKET','ASSESSMENT_BUCKET','MEDIA_BUCKET'].map(name=>[name,recoveryBucket(selected[name],selected.ACADEMY_OBJECT_NAMESPACE)]))};
}
export function createLocalNativeStageEntry({assetPaths=[]}={}){
 const validAsset=resource=>{
  if(typeof resource!=='string'||resource.length>1536)return false;
  let u;try{u=new URL(resource,origin);}catch{return false;}
  return u.origin===origin&&resource===u.pathname+u.search&&!u.hash&&u.search.length<=512&&/^\/(?:[A-Za-z0-9_.-]+\/)*[A-Za-z0-9_.-]*$/.test(u.pathname)&&!u.pathname.includes('..')&&!u.pathname.startsWith('/__')&&!/^\/(?:api|auth|internal)(?:\/|$)/.test(u.pathname);
 };
 if(!Array.isArray(assetPaths)||assetPaths.length>4096||new Set(assetPaths).size!==assetPaths.length||assetPaths.some(path=>!validAsset(path)))throw Error('INVALID_NATIVE_STAGE_ASSET_MANIFEST');
 const assets=new Set(assetPaths);
 return Object.freeze({async fetch(request,env,ctx){
  const url=new URL(request.url);
  if(url.origin!==origin||url.username||url.password||request.headers.has('Host')&&request.headers.get('Host')!=='ummabbadacademy.app')return stopped();
  let selected;try{selected=nativeStageStorage(env);}catch{return stopped();}
  if(url.pathname.startsWith('/__')||/^\/(?:auth|internal)(?:\/|$)/.test(url.pathname))return stopped();
  if(url.pathname.startsWith('/api/')){
   const source=request.headers.get('Origin');
   if(source&&source!==origin||request.headers.get('Sec-Fetch-Site')!=='same-origin'||!['GET','HEAD','OPTIONS'].includes(request.method)&&source!==origin)return new Response(null,{status:403,headers:{'Cache-Control':'no-store'}});
   return academy.fetch(request,selected,ctx);
  }
  if(!['GET','HEAD'].includes(request.method))return new Response(null,{status:405,headers:{Allow:'GET, HEAD','Cache-Control':'no-store'}});
  if(!assets.has(url.pathname+url.search)||typeof selected.ASSETS?.fetch!=='function')return missing();
  return selected.ASSETS.fetch(request);
 }});
}
