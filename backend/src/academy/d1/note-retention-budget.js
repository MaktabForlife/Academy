// Request-owned budget. A D1 batch is one binding request, regardless of its
// statement count. Reserve room for at most five private R2 deletions.
export function retentionBudget(env,limit=40){
 const state={calls:0,exhausted:false},consume=()=>{if(state.calls>=limit){state.exhausted=true;throw Object.assign(Error('Note maintenance will continue next hour.'),{code:'NOTE_RETENTION_BUDGET'});}state.calls++;};
 function database(binding){
  const raw=new WeakMap();
  function statement(target){
   const proxy=new Proxy(target,{get(object,name){
    if(name==='bind')return(...values)=>statement(object.bind(...values));
    if(['all','first','run','raw'].includes(name))return(...values)=>{consume();return object[name](...values);};
    const value=object[name];return typeof value==='function'?value.bind(object):value;
   }});raw.set(proxy,target);return proxy;
  }
  return new Proxy(binding,{get(target,name){
   if(name==='prepare')return sql=>statement(target.prepare(sql));
   if(name==='withSession')return mode=>database(target.withSession(mode));
   if(name==='batch')return statements=>{consume();return target.batch(statements.map(s=>raw.get(s)||s));};
   if(name==='exec')return sql=>{consume();return target.exec(sql);};
   const value=target[name];return typeof value==='function'?value.bind(target):value;
  }});
 }
 return {state,env:{...env,ACADEMY_DB:database(env.ACADEMY_DB),...(env.ACADEMY_ADMIN_DB?{ACADEMY_ADMIN_DB:database(env.ACADEMY_ADMIN_DB)}:{})}};
}
