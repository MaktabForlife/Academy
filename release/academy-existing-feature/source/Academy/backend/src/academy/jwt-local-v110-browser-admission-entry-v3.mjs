import {readNativeRootStudioSelection} from '../auth/v110/root-studio-selection.mjs';
import {operationalV110Environment} from './jwt-local-v110-operational-entry.mjs';
import {withoutChildPINServices} from '../auth/v110/child-pin-service-rpc.mjs';
import {withoutChildAuthServices} from '../auth/v110/native-child-auth-service-rpc-v2.mjs';
// Local-test successor: seven admission assets and explicit old-helper denial.
// Existing entries and native admission/selection handlers remain unchanged.
import {createOperationalV110NativeAuthRootEntry} from './jwt-local-v110-native-auth-entry-v2.mjs';
import {createRootBrowserAdmissionGateway,rootBrowserAdmissionPublicPaths} from './jwt-local-v110-browser-admission-public-v3.mjs';
export function createOperationalV110BrowserAdmissionRootEntry({admissionRecords,...options}={}){
 if(!Array.isArray(options.assetPaths||[])||(options.assetPaths||[]).some(p=>typeof p!=='string'||(rootBrowserAdmissionPublicPaths.includes(p.split('?')[0])||p.split('?')[0]==='/js/jwt-root-website-admission.js')))throw Error('BROWSER_ADMISSION_GATEWAY_BYPASS');
 const base=createOperationalV110NativeAuthRootEntry(options),gateway=createRootBrowserAdmissionGateway(admissionRecords);
 return Object.freeze({async fetch(request,env,ctx){
  const u=new URL(request.url);
  if(u.origin!=='https://ummabbadacademy.app'||u.username||u.password||request.headers.has('Host')&&request.headers.get('Host')!==u.host)return Response.json({code:'LOCAL_AUTH_UNAVAILABLE'},{status:503,headers:{'Cache-Control':'private, no-store'}});
  // Never fall through to ordinary ASSETS for the preserved unselected helper.
  if(u.pathname==='/js/jwt-root-website-admission.js')return new Response(null,{status:404,headers:{'Cache-Control':'no-store'}});
  if(u.pathname==='/api/academy/website-studio/selection'){
   let selected;try{selected=operationalV110Environment(withoutChildPINServices(withoutChildAuthServices(env)));}catch{return Response.json({code:'STUDIO_SELECTION_UNAVAILABLE'},{status:503,headers:{'Cache-Control':'private, no-store'}});}
   return readNativeRootStudioSelection(request,selected);
  }
  if(gateway.has(u.pathname)){
   if(env.JWT_LOCAL_CHILD_ADMISSION!=='1')return new Response(null,{status:404,headers:{'Cache-Control':'no-store'}});
   return gateway.fetch(request,env.ASSETS);
  }
  return base.fetch(request,env,ctx);
 }});
}
