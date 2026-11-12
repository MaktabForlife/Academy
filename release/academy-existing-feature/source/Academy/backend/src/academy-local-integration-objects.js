// Separate class identities for NEW local namespaces only. Not exported by
// the inert entry and not referenced by any existing runtime configuration.
import {AcademySplitCoordinator} from './academy-split-coordinator.js';
import {ProgramTimetableCoordinator} from './academy/d1/library-storage.js';
import {guardedLocalCoordinator} from './academy/jwt-local-integration-entry-policy.mjs';
export class JWTLocalAcademySplitCoordinator extends guardedLocalCoordinator(AcademySplitCoordinator){}
export class JWTLocalProgramTimetableCoordinator extends guardedLocalCoordinator(ProgramTimetableCoordinator){}
