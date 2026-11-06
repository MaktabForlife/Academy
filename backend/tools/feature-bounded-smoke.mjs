// Bounded initial Feature verification. No retries, scans, content writes or response credentials in evidence.
import assert from 'node:assert/strict';
export const workerOrigin='https://feature_worker.maktab4life.workers.dev',portalOrigin='https://feature-preview.academy-maktab4life.pages.dev';
export async function featureSmoke({request,pin,expectedVersion='109.25',onSession=()=>{}}){
 assert.match(pin,/^\d{4}$/);let token='',calls=0;const results=[];
 const call=async(path,{method='POST',body={},expected=200}={})=>{
  assert(calls<6,'Feature request budget exhausted');calls++;
  const headers={Origin:portalOrigin,'Content-Type':'application/json','X-Academy-Workspace':'ADMIN',...(token?{Authorization:'Bearer '+token}:{})};
  const r=await request(workerOrigin+path,{method,headers,redirect:'error',cache:'no-store',signal:AbortSignal.timeout(15000),...(method==='POST'?{body:JSON.stringify(body)}:{})});
  const value=r.status===204?null:await r.json();
  results.push({request:calls,path,method,status:r.status});
  assert.equal(r.status,expected,'Feature '+path+' returned unexpected status');
  assert.equal(r.headers.get('Access-Control-Allow-Origin'),portalOrigin,'Feature origin did not match');
  assert.equal(r.headers.get('Cache-Control'),'private, no-store','Feature response must not be cached');
  return value;
 };
 try{
  await call('/api/account/login',{method:'OPTIONS',expected:204});
  const health=await call('/api/health',{method:'GET'});assert.equal(health.success,true);assert.equal(String(health.version),String(expectedVersion),'Native Feature version did not match the reviewed source');assert.equal(health.databaseGeneration,'SPLIT_V1');assert.equal(health.store,'D1_ACTIVE');
  const login=await call('/api/account/login',{body:{uniqueid:'feature-test-admin',pin}});assert.equal(login.success,true);assert.equal(login.account?.uniqueid,'feature-test-admin');assert.equal(login.sessionStore,'D1');assert.equal(typeof login.token,'string');
  token=login.token;onSession(true);
  const current=await call('/api/account/session');assert.equal(current.account?.uniqueid,'feature-test-admin');
  const logout=await call('/api/account/logout');assert.equal(logout.success,true);onSession(false);
  const denied=await call('/api/account/session',{expected:401});assert.equal(denied.success,false);
  return {success:true,workerRequests:calls,results,sessionEnded:true,credentialsLogged:false};
 }catch(error){
  // Reserve the remaining existing budget for one best-effort sign-out, never retry a failed request.
  if(token&&calls<6){try{const cleanup=await call('/api/account/logout');assert.equal(cleanup.success,true);onSession(false);}catch{}}
  throw Object.assign(Error('Bounded Feature smoke failed; pause Feature and inspect status-only evidence'),{safeEvidence:{success:false,workerRequests:calls,results,credentialsLogged:false}});
 }finally{token='';}
}
