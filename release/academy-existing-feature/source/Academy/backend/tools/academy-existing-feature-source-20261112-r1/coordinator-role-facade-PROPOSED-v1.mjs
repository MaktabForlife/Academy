// SOURCE PROPOSAL. Exact existing coordinator export surface; no public API/child service.
export {JWTFeatureAcademySplitCoordinator,AcademySplitCoordinator} from './academy-existing-feature-common.mjs';
export default {
 fetch(){return new Response('Not found',{status:404,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});},
 scheduled(){throw Object.assign(Error('UNRELATED_SCHEDULES_DISABLED'),{code:'UNRELATED_SCHEDULES_DISABLED',status:503});}
};
