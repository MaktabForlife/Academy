// SOURCE ONLY; native authority is delegated unchanged, never impersonated.
import native from './academy-development-runtime.js';
import {AcademySplitCoordinator as NativeSplit} from './academy-split-coordinator-root-sensitive-v1.js';
import {ProgramTimetableCoordinator as NativeTimetable} from './academy/d1/library-storage.js';
import {requirePortableNativeMethod,portableNativeHTTPRequest,portableNativeUnavailable} from './auth/v110/portable-native-profile-v1.mjs';
export {StudioPINPeer,HifzPINPeer,StudioAuthPeer,HifzAuthPeer} from './auth/v110/portable-native-child-peers-v1.mjs';
export class AcademySplitCoordinator extends NativeSplit {
 constructor(ctx,env){requirePortableNativeMethod(env,'coordinator','coordinator');super(ctx,env);}
 fetch(){return portableNativeUnavailable();}
 reply(action){requirePortableNativeMethod(this.env,'coordinator','coordinator');return super.reply(action);}
 read(statements,proof,owner){requirePortableNativeMethod(this.env,'coordinator','coordinator');return super.read(statements,proof,owner);}
 write(statements,proof){requirePortableNativeMethod(this.env,'coordinator','coordinator');return super.write(statements,proof);}
 alarm(){requirePortableNativeMethod(this.env,'coordinator','coordinator');return super.alarm();}
}
export class ProgramTimetableCoordinator extends NativeTimetable {
 constructor(ctx,env){requirePortableNativeMethod(env,'academy','timetable');super(ctx,env);}
 fetch(){return portableNativeUnavailable();}
 openLibraryMetadataList(){requirePortableNativeMethod(this.env,'academy','timetable');return super.openLibraryMetadataList();}
 openLibraryMetadataCoverKey(id){requirePortableNativeMethod(this.env,'academy','timetable');return super.openLibraryMetadataCoverKey(id);}
 openLibraryMetadataSave(input,authorization,uploadedCoverKey=''){requirePortableNativeMethod(this.env,'academy','timetable');return super.openLibraryMetadataSave(input,authorization,uploadedCoverKey);}
 alarm(){requirePortableNativeMethod(this.env,'academy','timetable');throw Object.assign(Error('PORTABLE_SCHEDULES_DISABLED'),{status:503});}
}
export default {
 fetch(request,env,ctx){try{portableNativeHTTPRequest(request,env,'academy');}catch(e){if(e?.code==='PORTABLE_NATIVE_ORIGIN')return new Response('Forbidden',{status:403,headers:{'Cache-Control':'private, no-store'}});return portableNativeUnavailable();}return native.fetch(request,env,ctx);},
 scheduled(){throw Object.assign(Error('PORTABLE_SCHEDULES_DISABLED'),{status:503});}
};
