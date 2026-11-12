// New opt-in operational composition. Existing entry/config/launchers unchanged.
// Root receives fixed RPC capabilities only; it never receives child databases.
import {createOperationalV110RootEntry,operationalV110Environment,rootV110Origin} from './jwt-local-v110-operational-entry.mjs';
import {createRootChildPINHTTP} from '../auth/v110/root-child-pin-http-v2.mjs';
import {createChildPINServicePeers,withoutChildPINServices} from '../auth/v110/child-pin-service-rpc.mjs';
import {createRootChildPINPublicGateway,rootChildPINPublicPaths} from './jwt-local-v110-child-pin-public.mjs';
const api=new Set(['/auth/v110/child-pin/prepare','/auth/v110/child-pin/verify']);
const unavailable=()=>Response.json({code:'CHILD_PIN_UNAVAILABLE'},{status:503,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
export function createOperationalV110ChildPINRootEntry({assetPaths=[],publicAuthRecords=[],childPINRecords}={}){
 if(!Array.isArray(assetPaths)||assetPaths.some(path=>rootChildPINPublicPaths.includes(path.split('?')[0])))throw Error('CHILD_PIN_PUBLIC_GATEWAY_BYPASS');
 const base=createOperationalV110RootEntry({assetPaths,publicAuthRecords});
 const gateway=createRootChildPINPublicGateway(childPINRecords);
 return Object.freeze({async fetch(request,env,ctx){
  const u=new URL(request.url);
  if(u.origin!==rootV110Origin||u.username||u.password||request.headers.has('Host')&&request.headers.get('Host')!==u.host)return unavailable();
  const isolated=withoutChildPINServices(env);
  if(gateway.has(u.pathname)){
   if(env.JWT_LOCAL_CHILD_PIN!=='1')return new Response(null,{status:404,headers:{'Cache-Control':'no-store'}});
   return gateway.fetch(request,env.ASSETS);
  }
  if(api.has(u.pathname)){
   let selected,peers;
   try{
    if(env.JWT_LOCAL_CHILD_PIN!=='1')return new Response(null,{status:404,headers:{'Cache-Control':'no-store'}});
    selected=operationalV110Environment(isolated);
    peers=createChildPINServicePeers(env);
   }catch{return unavailable();}
   return createRootChildPINHTTP({peers}).fetch(request,selected);
  }
  // Private RPC names/paths are never public routes. Base keeps its own finite
  // assets and native API authority; no child capability crosses this boundary.
  return base.fetch(request,isolated,ctx);
 }});
}
