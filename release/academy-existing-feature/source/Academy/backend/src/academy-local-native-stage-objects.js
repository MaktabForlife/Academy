// NEW native local class identities; no SDK/runtime configuration yet binds them.
import {WorkerEntrypoint} from 'cloudflare:workers';
import {AcademySplitCoordinator} from './academy-split-coordinator.js';
import {ProgramTimetableCoordinator} from './academy/d1/library-storage.js';
import {websiteStudioBridge} from './academy/d1/website-studio-bridge.js';
import {nativeStageStorage} from './academy/jwt-local-native-stage-entry.mjs';
import {guardedLocalNativeCoordinator} from './academy/jwt-local-native-stage-policy.mjs';
export class JWTLocalNativeAcademySplitCoordinator extends guardedLocalNativeCoordinator(AcademySplitCoordinator){}
export class JWTLocalNativeProgramTimetableCoordinator extends guardedLocalNativeCoordinator(ProgramTimetableCoordinator){}
export class JWTLocalNativeWebsiteStudioAcademy extends WorkerEntrypoint{
 fetch(request){return websiteStudioBridge(request,nativeStageStorage(this.env));}
}
