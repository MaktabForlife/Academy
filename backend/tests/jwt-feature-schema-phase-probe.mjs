// TEST ONLY. Schema fault/claim inspection is absent from every release wrapper.
import api,{AcademySplitCoordinator,JWTFeatureAcademySplitCoordinator as SeedProbe} from './jwt-feature-setup-probe.mjs';
const c=__SETUP_CONTRACT__;
export {AcademySplitCoordinator};
export class JWTFeatureAcademySplitCoordinator extends SeedProbe{
 async testSchemaSnapshot(){return {metrics:this.testMetrics,schemaClaim:await this.ctx.storage.get('jwt-feature-schema-v1'),seedClaim:await this.ctx.storage.get('jwt-feature-bootstrap-v1')};}
 async testPrimeSchema(){await this.ctx.storage.put('jwt-feature-schema-v1',{state:'PREPARING',stage:'SCHEMA_ONLY',source:c.source,manifestHash:c.manifestHash,planId:c.planId,sourceDigest:c.sourceDigest,nonceDigest:'a'.repeat(64),databaseIds:c.databaseIds,startedAt:Math.floor(Date.now()/1000),phase:'claimed'});}
 async testExpiredSchema(){return this.setupSchemaExecute({source:c.source,manifestHash:c.manifestHash,nonceDigest:'a'.repeat(64)});}
}
export default {async fetch(request,env){
 const path=new URL(request.url).pathname,stub=()=>env.JWT_V110_SPLIT_COORDINATOR.getByName('jwt-feature-bootstrap:'+c.planId+':'+c.sourceDigest);
 if(path==='/__test/schema-snapshot')return Response.json(await stub().testSchemaSnapshot());
 if(path==='/__test/schema-prime'){await stub().testPrimeSchema();return new Response(null,{status:204});}
 if(path==='/__test/schema-expired')return Response.json(await stub().testExpiredSchema());
 return api.fetch(request,env);
}};
