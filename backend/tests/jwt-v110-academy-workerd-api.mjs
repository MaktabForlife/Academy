import api from '../src/academy-development-runtime.js';
export {ProgramTimetableCoordinator} from '../src/academy-development-runtime.js';
import {freshMetrics,measuredEnv} from './feature-local-budget-metrics.mjs';
export default{async fetch(request,env){
 const metrics=freshMetrics(),tasks=[],context={waitUntil(p){tasks.push(p);}};
 const original=globalThis.fetch;globalThis.fetch=async()=>{metrics.remoteCalls++;throw Error('External fetch forbidden in local JWT runtime proof');};
 try{
  const measured=measuredEnv(env,metrics);measured.JWT_V110_RATE_LIMITER={limit:async()=>{metrics.rateChecks++;return {success:true};}};
  const result=await api.fetch(request,measured,context);await Promise.all(tasks);
  const headers=new Headers(result.headers);headers.set('x-feature-local-budget',JSON.stringify(metrics));return new Response(result.body,{status:result.status,headers});
 }finally{globalThis.fetch=original;}
}};
