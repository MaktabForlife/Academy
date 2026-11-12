// Bounded local native HTTPS entry. Fixed profile stays UNBOUND by default.
import native from './academy-development-runtime.js';
import {AcademyHTTPSLocalSplitCoordinator} from './academy-split-coordinator-native-https-v2.mjs';
import {ProgramTimetableCoordinator as NativeTimetable} from './academy/d1/library-storage.js';
import {requirePortableNativeMethod,portableNativeHTTPRequest,portableNativeUnavailable,verifyPortableNativeProfile} from './auth/v110/portable-native-profile-v5.mjs';
import {receiveNativeHTTPS} from './auth/v110/native-https-receiver-v1.mjs';
import {handleRootHTTPSAdmission} from './auth/v110/root-https-admission-v1.mjs';
export class AcademySplitCoordinator extends AcademyHTTPSLocalSplitCoordinator {
 fetch(){return portableNativeUnavailable();}
}
export class ProgramTimetableCoordinator extends NativeTimetable {
 constructor(ctx,env){requirePortableNativeMethod(env,'academy','timetable');super(ctx,env);}
 fetch(){return portableNativeUnavailable();}
 alarm(){throw Object.assign(Error('UNRELATED_SCHEDULES_DISABLED'),{status:503});}
}
export default {
 async fetch(request,env,ctx){
  try{
   // Server-to-server authentication is distinct from browser Origin/CSRF checks.
   const internal=await receiveNativeHTTPS(request,env,{app:'academy',handlers:{'admission.request':packet=>handleRootHTTPSAdmission(packet,env,{clock:Date.now})}});
   if(internal!==null)return internal;
   await verifyPortableNativeProfile();portableNativeHTTPRequest(request,env,'academy');
   return await native.fetch(request,env,ctx);
  }catch(error){
   if(error?.code==='PORTABLE_NATIVE_ORIGIN')return new Response('Forbidden',{status:403,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
   return portableNativeUnavailable();
  }
 },
 scheduled(){throw Object.assign(Error('UNRELATED_SCHEDULES_DISABLED'),{status:503});}
};
