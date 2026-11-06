import api from '../src/academy-development-runtime.js';
export {ProgramTimetableCoordinator} from '../src/academy-development-runtime.js';
import {freshMetrics,measuredEnv} from './feature-local-budget-metrics.mjs';
export default{async fetch(request,env,ctx){
 const metrics=freshMetrics(),tasks=[],context={waitUntil(p){tasks.push(p);}};
 const originalFetch=globalThis.fetch;globalThis.fetch=async()=>{metrics.remoteCalls++;throw Error('Remote calls forbidden in local Feature budget proof');};
 try{const response=await api.fetch(request,measuredEnv(env,metrics),context);await Promise.all(tasks);const headers=new Headers(response.headers);headers.set('x-feature-local-budget',JSON.stringify(metrics));return new Response(response.body,{status:response.status,headers});}finally{globalThis.fetch=originalFetch;}
}};
