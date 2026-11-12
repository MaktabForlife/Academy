// SOURCE ONLY, UNSELECTED. Portable repo imports; no MSI virtual modules/SDK/fixture owner.
import {requireReviewedProductionActivation,promotionUnavailable} from './promotion-gate-r1.mjs';
import {withNativeNoEgressRootDate} from '../../auth/v110/native-public-date-no-egress-v1.mjs';
import {createLocalTestV110ReaderRootEntry} from '../../academy/jwt-local-test-entry-reader-v3.mjs';
import {publicAuthRecords,childPINRecords,admissionRecords} from './public-protocol-records-r1.mjs';
import {AcademySplitCoordinator} from '../../academy-split-coordinator-root-sensitive-v1.js';
import {ProgramTimetableCoordinator} from '../../academy/d1/library-storage.js';
import {guardedOperationalV110Coordinator} from '../../academy/jwt-local-v110-operational-entry.mjs';
const Split=guardedOperationalV110Coordinator(AcademySplitCoordinator),Timetable=guardedOperationalV110Coordinator(ProgramTimetableCoordinator);
export class V110ProductionAcademySplitCoordinator extends Split{
 constructor(ctx,env){requireReviewedProductionActivation();super(ctx,env);}
}
export class V110ProductionProgramTimetableCoordinator extends Timetable{
 constructor(ctx,env){requireReviewedProductionActivation();super(ctx,env);}
}
let native;
export default {async fetch(request,env,ctx){
 try{requireReviewedProductionActivation();}catch{return promotionUnavailable();}
 // Prepared native factory is retained, not reimplemented. Its LOCAL profile
 // remains fail-closed until a separately reviewed production profile exists.
 native??=withNativeNoEgressRootDate(createLocalTestV110ReaderRootEntry({assetPaths:[],publicAuthRecords,childPINRecords,admissionRecords}));
 return native.fetch(request,env,ctx);
}};
