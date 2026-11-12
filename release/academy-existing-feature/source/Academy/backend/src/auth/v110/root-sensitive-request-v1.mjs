// SOURCE ONLY V110 native Root request/action context. No HTTP DTO or native-baseline selection.
import {trustedCookieFacts} from './academy-cookie-auth.mjs';
import {requireNativeRootPINReceipt} from './root-pin-evidence-plan-v4.mjs';
import {bindNativeRootSensitiveAction} from './root-sensitive-action.mjs';
import {isAdminWorkspace} from '../../academy/d1/workspace-access.js';
const contexts=new WeakMap(),origin='https://ummabbadacademy.app';
const actions=Object.freeze({'class-notes':Object.freeze(['post','revise','withdraw','relink']),assessments:Object.freeze(['marks-save'])});
const fail=(code='ROOT_SENSITIVE_REQUEST_CONTEXT_REQUIRED',status=503)=>{throw Object.assign(Error(code),{code,status});};
const facts=auth=>auth&&typeof auth==='object'?trustedCookieFacts(auth):null;
function sameContext(auth,r){
 const c=facts(auth);
 if(!c||Object.keys(r.claims).some(k=>c[k]!==r.claims[k])||auth.workspace!==r.workspace||Boolean(auth.adminView)!==r.adminView||r.repository.mediaPlaylistSource?.db!==r.db)fail('SESSION_ENDED',401);
 return r;
}
export function registerNativeRootSensitiveRequest(auth,request,repository){
 const c=facts(auth),url=new URL(request.url);
 if(!c||c.sid!==c.psid||url.origin!==origin)fail('SESSION_ENDED',401);
 if(repository?.features?.nativeCookie!==true||repository.features.splitDatabases!==true||typeof repository.session!=='function'||typeof repository.bindActor!=='function'||typeof repository.mediaPlaylistSource?.db?.prepare!=='function'||typeof repository.mediaPlaylistSource.db.batch!=='function')fail();
 const inherited=auth.adminView===true&&auth.workspace==='TEACH'&&request.method==='POST'&&Object.entries(actions).some(([family,names])=>names.some(action=>url.pathname==='/api/academy/'+family+'/'+action));
 const r=Object.freeze({repository,db:repository.mediaPlaylistSource.db,claims:Object.freeze({...c}),workspace:auth.workspace,adminView:Boolean(auth.adminView),path:url.pathname,method:request.method,required:isAdminWorkspace(auth)||inherited});
 const previous=contexts.get(auth);
 if(previous){sameContext(auth,previous);if(previous.repository!==repository||previous.path!==r.path||previous.method!==r.method)fail();return auth;}
 contexts.set(auth,r);return auth;
}
export function nativeRootSensitivePolicyRequired(auth){
 const r=contexts.get(auth);
 return r?sameContext(auth,r).required:isAdminWorkspace(auth);
}
export async function prepareNativeRootSensitiveAction(auth,family,action){
 const r=contexts.get(auth);if(!r)fail();sameContext(auth,r);
 if(!Object.hasOwn(actions,family)||!actions[family].includes(action)||r.method!=='POST'||r.path!=='/api/academy/'+family+'/'+action)fail();
 // Ordinary native Teachers retain their existing permission and session gates.
 // ADMIN_TEACH is sensitive here because these exact native handlers use Admin scope.
 if(!r.required)return null;
 const cap=await requireNativeRootPINReceipt({auth,repository:r.repository,db:r.db});
 sameContext(auth,r);bindNativeRootSensitiveAction(auth,cap);r.repository.bindActor(auth);
 return cap;
}
export const ROOT_SENSITIVE_REQUEST_CONTEXT_VERSION='ROOT_NATIVE_ACTION_CONTEXT_V1';
