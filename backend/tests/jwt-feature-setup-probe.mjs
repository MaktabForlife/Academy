// TEST ONLY. These fault/state/metrics RPCs are never part of the setup release.
import {AcademySplitCoordinator,JWTFeatureAcademySplitCoordinator as NativeFresh} from '../src/academy-split-coordinator.js';
import {createJWTFeatureSetupAPI,withJWTFeatureSetup} from '../src/academy/jwt-feature-setup.mjs';
const cfg=__SETUP_CONTRACT__;
function counted(db,counters,owner,fault){
 return {withSession(value){const s=db.withSession(value);return {
  prepare(sql){counters.prepares++;return s.prepare(sql);},
  async batch(statements){counters.batches[owner]++;if(fault===owner)throw Error('TEST_FAULT');return s.batch(statements);}
 };}};
}
const Setup=withJWTFeatureSetup(NativeFresh,cfg);
export class JWTFeatureAcademySplitCoordinator extends Setup{
 constructor(ctx,env){const metrics={prepares:0,batches:{core:0,admin:0}};
  const wrapped={...env,JWT_V110_CORE_DB:counted(env.JWT_V110_CORE_DB,metrics,'core',env.TEST_FAULT),JWT_V110_ADMIN_DB:counted(env.JWT_V110_ADMIN_DB,metrics,'admin',env.TEST_FAULT)};
  super(ctx,wrapped);this.testMetrics=metrics;
 }
 async testSnapshot(){const state=await this.ctx.storage.get('jwt-feature-bootstrap-v1');return {metrics:this.testMetrics,publicClaim:state,credentialPresent:JSON.stringify(state||{}).includes('pbkdf2')};}
 async testPrime(){await this.ctx.storage.put('jwt-feature-bootstrap-v1',{state:'PREPARING',source:cfg.source,manifestHash:cfg.manifestHash,planId:cfg.planId,sourceDigest:cfg.sourceDigest,nonceDigest:'a'.repeat(64),databaseIds:cfg.databaseIds,startedAt:Math.floor(Date.now()/1000),phase:'claimed'});}
}
export {AcademySplitCoordinator};
const api=createJWTFeatureSetupAPI(cfg);
export default {async fetch(request,env){
 const p=new URL(request.url).pathname,stub=()=>env.JWT_V110_SPLIT_COORDINATOR.getByName('jwt-feature-bootstrap:'+cfg.planId+':'+cfg.sourceDigest);
 if(p==='/__test/snapshot')return Response.json(await stub().testSnapshot());
 if(p==='/__test/prime'){await stub().testPrime();return new Response(null,{status:204});}
 return api.fetch(request,env);
}};
