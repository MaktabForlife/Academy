// TEST ONLY. These fault/state/metrics RPCs are never part of the setup release.
import {AcademySplitCoordinator,JWTFeatureAcademySplitCoordinator as NativeFresh} from '../src/academy-split-coordinator.js';
import {createJWTFeatureSetupAPI,withJWTFeatureSetup} from '../src/academy/jwt-feature-setup.mjs';
const cfg=__SETUP_CONTRACT__;
function counted(db,counters,owner,fault){
 return {withSession(value){const s=db.withSession(value),m=counters.d1[owner];
  const measure=result=>{m.read+=result.meta?.rows_read||0;m.written+=result.meta?.rows_written||0;};
  const wrap=(raw,read)=>({raw,read,bind(...args){return wrap(raw.bind(...args),read);},async all(){m.roundTrips++;m.statements++;const result=await raw.all();measure(result);return result;}});
  return {
   prepare(sql){counters.prepares++;return wrap(s.prepare(sql),sql.startsWith('SELECT'));},
   async batch(statements){
    if(statements.every(x=>x.read))counters.readBatches[owner]++;else {counters.batches[owner]++;if(fault===owner)throw Error('TEST_FAULT');}
    m.roundTrips++;m.statements+=statements.length;const result=await s.batch(statements.map(x=>x.raw));for(const row of result)measure(row);return result;
   }
  };
 }};
}
const Setup=withJWTFeatureSetup(NativeFresh,cfg);
export class JWTFeatureAcademySplitCoordinator extends Setup{
 constructor(ctx,env){const metrics={prepares:0,batches:{core:0,admin:0},readBatches:{core:0,admin:0},d1:{core:{roundTrips:0,statements:0,read:0,written:0},admin:{roundTrips:0,statements:0,read:0,written:0}}};
  const wrapped={...env,JWT_V110_CORE_DB:counted(env.JWT_V110_CORE_DB,metrics,'core',env.TEST_FAULT),JWT_V110_ADMIN_DB:counted(env.JWT_V110_ADMIN_DB,metrics,'admin',env.TEST_FAULT)};
  super(ctx,wrapped);this.testMetrics=metrics;
 }
 async testSnapshot(){const state=await this.ctx.storage.get('jwt-feature-bootstrap-v1');return {metrics:this.testMetrics,publicClaim:state,credentialPresent:JSON.stringify(state||{}).includes('pbkdf2')};}
 async testExpiredClaim(){return this.setupExecute({source:cfg.source,manifestHash:cfg.manifestHash,nonceDigest:'a'.repeat(64),pinHash:'v3$pbkdf2-sha256$100000await this.ctx.storage.put('jwt-feature-bootstrap-v1',{state:'PREPARING',source:cfg.source,manifestHash:cfg.manifestHash,planId:cfg.planId,sourceDigest:cfg.sourceDigest,nonceDigest:'a'.repeat(64),databaseIds:cfg.databaseIds,startedAt:Math.floor(Date.now()/1000),phase:'claimed'});}
}
export {AcademySplitCoordinator};
const api=createJWTFeatureSetupAPI(cfg);
export default {async fetch(request,env){
 const p=new URL(request.url).pathname,stub=()=>env.JWT_V110_SPLIT_COORDINATOR.getByName('jwt-feature-bootstrap:'+cfg.planId+':'+cfg.sourceDigest);
 if(p==='/__test/snapshot')return Response.json(await stub().testSnapshot());
 if(p==='/__test/expired-claim')return Response.json(await stub().testExpiredClaim());
 if(p==='/__test/prime'){await stub().testPrime();return new Response(null,{status:204});}
 return api.fetch(request,env);
}};
+'A'.repeat(22)+'await this.ctx.storage.put('jwt-feature-bootstrap-v1',{state:'PREPARING',source:cfg.source,manifestHash:cfg.manifestHash,planId:cfg.planId,sourceDigest:cfg.sourceDigest,nonceDigest:'a'.repeat(64),databaseIds:cfg.databaseIds,startedAt:Math.floor(Date.now()/1000),phase:'claimed'});}
}
export {AcademySplitCoordinator};
const api=createJWTFeatureSetupAPI(cfg);
export default {async fetch(request,env){
 const p=new URL(request.url).pathname,stub=()=>env.JWT_V110_SPLIT_COORDINATOR.getByName('jwt-feature-bootstrap:'+cfg.planId+':'+cfg.sourceDigest);
 if(p==='/__test/snapshot')return Response.json(await stub().testSnapshot());
 if(p==='/__test/prime'){await stub().testPrime();return new Response(null,{status:204});}
 return api.fetch(request,env);
}};
+'a'.repeat(64)});}
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
