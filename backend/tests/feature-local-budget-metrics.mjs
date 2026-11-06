// Test-only instrumentation. Never imported by the deployed application.
export const freshMetrics=()=>({d1:{core:{roundTrips:0,statements:0,rowsRead:0,rowsWritten:0},admin:{roundTrips:0,statements:0,rowsRead:0,rowsWritten:0}},coordinatorCalls:0,rateChecks:0,r2:{},remoteCalls:0});
export function addMetrics(into,from){
 for(const owner of ['core','admin'])for(const key of Object.keys(into.d1[owner]))into.d1[owner][key]+=from.d1[owner][key];
 for(const key of ['coordinatorCalls','rateChecks','remoteCalls'])into[key]+=from[key];
 for(const [key,n]of Object.entries(from.r2))into.r2[key]=(into.r2[key]||0)+n;
}
function measuredDatabase(db,stats){
 const native=new WeakMap();
 const observe=result=>{for(const r of Array.isArray(result)?result:[result]){if(!Number.isSafeInteger(r.meta?.rows_read)||!Number.isSafeInteger(r.meta?.rows_written))throw Error('Missing actual D1 row telemetry');stats.rowsRead+=r.meta.rows_read;stats.rowsWritten+=r.meta.rows_written;}return result;};
 const execute=async st=>{stats.roundTrips++;stats.statements++;return observe(await st.all());};
 const wrap=st=>{const value={bind(...args){return wrap(st.bind(...args));},all(){return execute(st);},run:async()=>{stats.roundTrips++;stats.statements++;return observe(await st.run());},async first(column){const row=(await execute(st)).results[0]??null;return column?row?.[column]??null:row;},raw:async(...args)=>{throw Error('Uninstrumented raw D1 use');}};native.set(value,st);return value;};
 return new Proxy(db,{get(target,key){if(key==='withSession')return (...args)=>measuredDatabase(target.withSession(...args),stats);if(key==='prepare')return sql=>wrap(target.prepare(sql));if(key==='batch')return async statements=>{stats.roundTrips++;stats.statements+=statements.length;return observe(await target.batch(statements.map(s=>{const st=native.get(s);if(!st)throw Error('Uninstrumented D1 statement');return st;})));};const value=target[key];return typeof value==='function'?value.bind(target):value;}});
}
export function measuredEnv(env,metrics,{coordinator=true}={}){
 const out={...env,ACADEMY_DB:measuredDatabase(env.ACADEMY_DB,metrics.d1.core),ACADEMY_ADMIN_DB:measuredDatabase(env.ACADEMY_ADMIN_DB,metrics.d1.admin)};
 for(const name of ['MEDIA_BUCKET','LESSON_MEDIA_BUCKET','ASSESSMENT_BUCKET'])if(env[name])out[name]=new Proxy(env[name],{get(target,key){const value=target[key];if(typeof value!=='function')return value;return (...args)=>{metrics.r2[name+'.'+String(key)]=(metrics.r2[name+'.'+String(key)]||0)+1;return value.apply(target,args);};}});
 if(coordinator)out.ACADEMY_SPLIT_COORDINATOR={getByName(name){const stub=env.ACADEMY_SPLIT_COORDINATOR.getByName(name);return Object.fromEntries(['read','write'].map(method=>[method,async(...args)=>{metrics.coordinatorCalls++;const result=await stub[method](...args);if(!result.__localBudget)throw Error('Missing private coordinator telemetry');addMetrics(metrics,result.__localBudget);delete result.__localBudget;return result;}]));}};
 if(coordinator)out.AUTH_LOGIN_RATE_LIMITER={limit:async()=>{metrics.rateChecks++;return {success:true};}};
 return out;
}
