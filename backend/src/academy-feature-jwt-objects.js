// New namespace only. Original ProgramTimetableCoordinator export stays unchanged.
import {ProgramTimetableCoordinator} from './academy/d1/library-storage.js';
import {jwtFeatureDatabaseEnv} from './academy/jwt-feature-storage.mjs';
export class JWTFeatureProgramTimetableCoordinator extends ProgramTimetableCoordinator {
 constructor(ctx,env){super(ctx,jwtFeatureDatabaseEnv(env));}
}
