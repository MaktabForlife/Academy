// Actual local DO/alarms; probe recovery replaces business recovery solely to
// observe which D1 binding the production old/new constructors retain.
import {AcademySplitCoordinator,JWTFeatureAcademySplitCoordinator} from '../src/academy-split-coordinator.js';
import academy from '../src/academy-development-runtime.js';
function install(instance,label){
 instance.engine={recover:async()=>{await instance.env.ACADEMY_DB.prepare('INSERT INTO probe(origin) VALUES(?)').bind(label).run();}};
}
export class LegacyProbe extends AcademySplitCoordinator{
 constructor(ctx,env){super(ctx,env);install(this,'legacy');}
 async arm(){await this.ctx.storage.setAlarm(Date.now()+400);}
}
export class FreshProbe extends JWTFeatureAcademySplitCoordinator{
 constructor(ctx,env){super(ctx,env);install(this,'fresh');}
 async arm(){await this.ctx.storage.setAlarm(Date.now()+400);}
}
export default {async fetch(request,env,ctx){
 const path=new URL(request.url).pathname;
 if(path==='/arm'){await env.LEGACY.getByName('same-name').arm();await env.FRESH.getByName('same-name').arm();return Response.json({armed:true});}
 if(path==='/paused')return academy.fetch(new Request('https://feature_worker.maktab4life.workers.dev/api/health'),{...env,ACADEMY_D1_MODE:'PAUSED',ACADEMY_LIBRARY_MODE:'PUBLIC_ONLY'},ctx);
 return new Response(null,{status:404});
}};
