import {nativeBusinessProof} from './native-business.mjs';
const requests=new WeakMap(),actors=new WeakMap();
const fail=(code,status=503)=>Object.assign(Error(code),{code,status});
export function bindNativeRequest(request,{runtime,cap,env}){
 if(env?.UAA_V2_ENABLED!=='1'||typeof runtime?.assertCapability!=='function')throw fail('ACADEMY_V2_RUNTIME_REQUIRED');runtime.assertCapability(cap);
 if(cap?.binding?.iss!=='https://ummabbadacademy.app'||!cap.rights?.nativeState)throw fail('ACADEMY_NATIVE_STATE_REQUIRED');
 requests.set(request,{runtime,cap,env});return request;
}
export function nativeRequestContext(request){const context=requests.get(request);if(context)context.runtime.assertCapability(context.cap);return context;}
export function bindNativeAuth(auth,context){if(!context||typeof context.runtime?.assertCapability!=='function')throw fail('ACADEMY_V2_RUNTIME_REQUIRED');context.runtime.assertCapability(context.cap);actors.set(auth,context);return auth;}
export function nativeAuthContext(auth){const context=actors.get(auth);if(context)context.runtime.assertCapability(context.cap);return context;}
export function capturedAcademyState(context){
 context.runtime.assertCapability(context.cap);const {binding,rights}=context.cap,state=rights.nativeState;
 if(!state||state.account?.account_id!==binding.sub||state.account.active!==1||Boolean(state.account.global_admin)!==Boolean(rights.globalAdmin)||!['activities','roles','subscriptions','contexts','monthlyMedia','surahGrants'].every(k=>Array.isArray(state[k])))throw fail('ACADEMY_NATIVE_STATE_INVALID');
 const permissionRows=Object.fromEntries(['classMemberships','classTeacherAssignments','substituteGrants'].map(kind=>{const rows=rights[kind]||state[kind];if(!Array.isArray(rows))throw fail('ACADEMY_CAPTURED_PERMISSION_ROWS_REQUIRED');return [kind,rows];}));return {...state,...permissionRows,account:{...state.account,credential_epoch:binding.ce}};
}

export function inheritNativeRequest(source,target){const context=nativeRequestContext(source);return context?(context.serviceProof?bindNativeBusinessRequest(target,context):bindNativeRequest(target,context)):target;}

export function bindNativeBusinessRequest(request,context){
 const meta=nativeBusinessProof(context?.serviceProof);if(!meta||context.cap?.binding!==context.serviceProof.body.binding)throw fail('NATIVE_RPC_BRANDED_PROOF_REQUIRED');context.runtime.assertCapability(context.cap);requests.set(request,context);return request;
}

export function capturedNativePermissionRows(auth,kind){if(!['classMemberships','classTeacherAssignments','substituteGrants'].includes(kind))throw fail('ACADEMY_CAPTURED_PERMISSION_KIND_INVALID');const context=nativeAuthContext(auth);if(!context)return null;const state=capturedAcademyState(context);return state[kind].map(row=>({...row}));}
