import api from '../src/academy-feature-jwt-runtime.js';
export {ProgramTimetableCoordinator} from '../src/academy-development-runtime.js';
import {freshMetrics} from './feature-local-budget-metrics.mjs';
import {measuredJWTApiEnv} from './jwt-v110-fresh-budget.mjs';
export {JWTFeatureProgramTimetableCoordinator} from '../src/academy-feature-jwt-objects.js';
// A failed local statement reports only a redacted disposable-fixture error.
function observeErrors(db,metrics){
 const native=new WeakMap(),record=error=>{metrics.localD1Errors.push(String(error.message).replace(/[A-Za-z0-9_-]{24,}/g,'[redacted]').replace(/\b\d{4}\b/g,'[digits]').slice(0,1000));throw error;};
 const wrap=st=>{const out={bind(...v){return wrap(st.bind(...v));},all:()=>st.all().catch(record),run:()=>st.run().catch(record)};native.set(out,st);return out;};
 return {withSession:(...v)=>observeErrors(db.withSession(...v),metrics),prepare:sql=>wrap(db.prepare(sql)),batch:statements=>db.batch(statements.map(s=>native.get(s))).catch(record)};
}
export default{async fetch(request,env){
 const metrics={...freshMetrics(),localD1Errors:[]},tasks=[],context={waitUntil(p){tasks.push(p);}};
 const original=globalThis.fetch;globalThis.fetch=async input=>{const url=new URL(typeof input==='string'?input:input.url);if(url.origin==='https://jamiat.org.za'&&url.pathname==='/'){metrics.stubbedPublicDateCalls=(metrics.stubbedPublicDateCalls||0)+1;return new Response('Disposable public-date source unavailable',{status:503});}metrics.remoteCalls++;throw Error('External fetch forbidden in local JWT runtime proof');};
 try{
  const measured=measuredJWTApiEnv({...env,JWT_V110_CORE_DB:observeErrors(env.JWT_V110_CORE_DB,metrics),JWT_V110_ADMIN_DB:observeErrors(env.JWT_V110_ADMIN_DB,metrics)},metrics);const nativeLimiter=measured.JWT_V110_RATE_LIMITER;measured.JWT_V110_RATE_LIMITER={limit:async input=>{metrics.rateChecks++;if(request.headers.get('X-Feature-Test-Refresh-Deny')==='1'&&new URL(request.url).pathname==='/auth/v110/refresh')return {success:false};return nativeLimiter.limit(input);}};
  const result=await api.fetch(request,measured,context);await Promise.all(tasks);
  const headers=new Headers(result.headers);headers.set('x-feature-local-budget',JSON.stringify(metrics));return new Response(result.body,{status:result.status,headers});
 }finally{globalThis.fetch=original;}
}};
