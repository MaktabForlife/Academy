// NEW source-only local entry. No native handler import, credential fallback,
// service bridge, schedule, initializer or child-sync route is exposed here.
import {LOCAL_INTEGRATION_ORIGIN} from '../auth/v110/local-integration-profile.mjs';
import {localEntryEnvironment} from './jwt-local-integration-entry-policy.mjs';
const unavailable=()=>Response.json({code:'JWT_LOCAL_ENTRY_UNAVAILABLE'},{status:503,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
const missing=()=>new Response(null,{status:404,headers:{'Cache-Control':'no-store'}});
export function createLocalIntegrationEntry({assetPaths=[]}={}){
 if(!Array.isArray(assetPaths)||assetPaths.length>4096||assetPaths.some(p=>typeof p!=='string'||!/^\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_.-]+$/.test(p)||p.includes('..')||p.startsWith('/auth/')||p.startsWith('/api/')||p.startsWith('/internal/')||p.startsWith('/__')))throw Error('INVALID_LOCAL_ASSET_ALLOWLIST');
 const assets=new Set(assetPaths);
 return Object.freeze({
  async fetch(request,env){
   let url,selected;
   try{
    url=new URL(request.url);
    if(url.origin!==LOCAL_INTEGRATION_ORIGIN||url.username||url.password||request.headers.has('Host')&&request.headers.get('Host')!=='ummabbadacademy.app')return unavailable();
    selected=localEntryEnvironment(env);
   }catch{return unavailable();}
   // Native V110 and legacy endpoints alike are closed until actual native
   // JWT resource authorization and writer/authority-floor seams are reviewed.
   if(/^\/(?:auth|api|internal)(?:\/|$)/.test(url.pathname))return unavailable();
   if(!['GET','HEAD'].includes(request.method))return new Response(null,{status:405,headers:{Allow:'GET, HEAD','Cache-Control':'no-store'}});
   if(url.search)return missing();
   if(url.pathname==='/__jwt_local_status'){
    const body=request.method==='HEAD'?null:JSON.stringify({localOnly:true,nativeRoutes:'DISABLED',runtimeReady:false});
    return new Response(body,{status:200,headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
   }
   if(!assets.has(url.pathname)||typeof selected.ASSETS?.fetch!=='function')return missing();
   return selected.ASSETS.fetch(request);
  }
 });
}
