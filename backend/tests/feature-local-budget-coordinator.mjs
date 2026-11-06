import {JWTFeatureAcademySplitCoordinator as NativeJWTCoordinator} from '../src/academy-split-coordinator.js';
import {measuredJWTDatabaseEnv} from './jwt-v110-fresh-budget.mjs';
import {AcademySplitCoordinator as NativeCoordinator} from '../src/academy-split-coordinator.js';
import {freshMetrics,measuredEnv} from './feature-local-budget-metrics.mjs';
export class AcademySplitCoordinator extends NativeCoordinator{
 constructor(ctx,env){const metrics=freshMetrics();super(ctx,measuredEnv(env,metrics,{coordinator:false}));this.localBudget=metrics;}
 async measured(method,args){const before=structuredClone(this.localBudget),result=await super[method](...args),after=structuredClone(this.localBudget);for(const owner of ['core','admin'])for(const k of Object.keys(after.d1[owner]))after.d1[owner][k]-=before.d1[owner][k];return {...result,__localBudget:after};}
 read(...args){return this.measured('read',args);}
 write(...args){return this.measured('write',args);}
}
export class JWTFeatureAcademySplitCoordinator extends NativeJWTCoordinator {
 constructor(ctx,env){const metrics=freshMetrics();super(ctx,measuredJWTDatabaseEnv(env,metrics));this.localBudget=metrics;}
 async measured(method,args){const before=structuredClone(this.localBudget),result=await super[method](...args),after=structuredClone(this.localBudget);for(const owner of ['core','admin'])for(const k of Object.keys(after.d1[owner]))after.d1[owner][k]-=before.d1[owner][k];return {...result,__localBudget:after};}
 read(...args){return this.measured('read',args);}
 write(...args){return this.measured('write',args);}
}
export default {fetch:()=>new Response('Not found',{status:404})};
