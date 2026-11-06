import api from '../src/academy-development-runtime.js';
export {ProgramTimetableCoordinator} from '../src/academy-development-runtime.js';
import {freshMetrics,measuredEnv} from './feature-local-budget-metrics.mjs';
// A failed local statement reports only a redacted disposable-fixture error.
function observeErrors(db,metrics){
 const native=new WeakMap(),record=error=>{metrics.localD1Errors.push(String(error.message).replace(/[A-Za-z0-9_-]{24,}/g,'[redacted]').replace(/\\b\\d{4}\\b/g,'[digits]').slice(0,1000));throw error;};
 const wrap=st=>{const out={bind(...v){return wrap(st.bind(...v));},all:()=>st.all().catch(record),run:()=>st.run().catch(record)};native.set(out,st);return out;};
 return {withSession:(...v)=>observeErrors(db.withSession(...v),metrics),prepare:sql=>wrap(db.prepare(sql)),batch:statements=>db.batch(statements.map(s=>native.get(s))).catch(record)};
}
export default{async fetch(request,env){
 const metrics={...freshMetrics(),localD1Errors:[]},tasks=[],context={waitUntil(p){tasks.push(p);}};
 const original=globalThis.fetch;globalThis.fetch=async()=>{metrics.remoteCalls++;throw Error('External fetch forbidden in local JWT runtime proof');};
 try{
  const measured=measuredEnv({...env,ACADEMY_DB:observeErrors(env.ACADEMY_DB,metrics),ACADEMY_ADMIN_DB:observeErrors(env.ACADEMY_ADMIN_DB,metrics)},metrics);measured.JWT_V110_RATE_LIMITER={limit:async()=>{metrics.rateChecks++;return {success:true};}};
  const result=await api.fetch(request,measured,context);await Promise.all(tasks);
  const headers=new Headers(result.headers);headers.set('x-feature-local-budget',JSON.stringify(metrics));return new Response(result.body,{status:result.status,headers});
 }finally{globalThis.fetch=original;}
}};
