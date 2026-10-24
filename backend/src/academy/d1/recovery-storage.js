// Keep original recovery files while the former database is retained. Current
// uploads use the new namespace and retain their ordinary cleanup behaviour.
export function recoveryBucket(bucket,prefix){
 if(!bucket||!prefix)return bucket;
 return new Proxy(bucket,{get(target,name){
  if(name==='delete')return async keys=>{const current=(Array.isArray(keys)?keys:[keys]).filter(key=>typeof key==='string'&&key.startsWith(prefix));if(current.length)return target.delete(Array.isArray(keys)?current:current[0]);};
  const value=target[name];return typeof value==='function'?value.bind(target):value;
 }});
}
