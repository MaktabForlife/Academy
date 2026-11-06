// Fixed own-host eight-request client. No HTTP retry, no crawl or credential output.
const origin='https://feature_worker.maktab4life.workers.dev';
const keys=['__Secure-uaa_a','__Host-uaa_r'];
const safe=code=>{throw Error('JWT_SMOKE_'+code);};
async function json(response,label){
 const reader=response.body?.getReader(),decoder=new TextDecoder('utf-8',{fatal:true});let total=0,text='';
 try{if(reader)for(;;){const p=await reader.read();if(p.done)break;total+=p.value.byteLength;if(total>262144){await reader.cancel();safe(label+'_BODY_LIMIT');}text+=decoder.decode(p.value,{stream:true});}text+=decoder.decode();return JSON.parse(text||'{}');}
 catch{safe(label+'_JSON');}finally{reader?.releaseLock();}
}
function measured(response,required){
 const value=response.headers.get('x-feature-local-budget');if(!value){if(required)safe('METRICS_MISSING');return null;}
 let m;try{m=JSON.parse(value);}catch{safe('METRICS_INVALID');}
 const sums={roundTrips:0,statements:0,rowsRead:0,rowsWritten:0,privateRpc:0,r2:0,remote:0,rateChecks:0};
 for(const db of Object.values(m.d1||{}))for(const k of ['roundTrips','statements','rowsRead','rowsWritten']){if(!Number.isSafeInteger(db[k])||db[k]<0)safe('METRICS_INVALID');sums[k]+=db[k];}
 for(const [out,input]of [['privateRpc','coordinatorCalls'],['remote','remoteCalls'],['rateChecks','rateChecks']]){const v=m[input]||0;if(!Number.isSafeInteger(v)||v<0)safe('METRICS_INVALID');sums[out]=v;}
 for(const n of Object.values(m.r2||{})){if(!Number.isSafeInteger(n)||n<0)safe('METRICS_INVALID');sums.r2+=n;}
 if(sums.remote||m.stubbedPublicDateCalls)safe('UNEXPECTED_REMOTE');
 return sums;
}
export async function runEightRequestSmoke({dispatch,uniqueid,pin,expectedAccount,requireMetrics=true}){
 if(typeof dispatch!=='function'||typeof uniqueid!=='string'||!/^\d{4}$/.test(pin))safe('INPUT');
 const jar=new Map(),calls=[];let proof='',selector='',replay='';
 const cookie=()=>[...jar].map(([k,v])=>k+'='+v).join('; ');
 async function step(label,path,method,body,expected,{anonymous=false,replayCookie=null}={}){
  const header={Origin:origin,'Sec-Fetch-Site':'same-origin','Content-Type':'application/json','X-Academy-Workspace':'LEARN'};
  if(!anonymous){const raw=replayCookie??cookie();if(raw.length>8192)safe('COOKIE_LIMIT');header.Cookie=raw;if(proof)header['X-UAA-CSRF']=proof;if(selector)header.Authorization='Bearer '+selector;}
  let response;try{response=await dispatch(origin+path,{method,headers:header,redirect:'error',cache:'no-store',credentials:'same-origin',signal:AbortSignal.timeout(10000),...(method==='POST'?{body:JSON.stringify(body||{})}:{})});}catch{safe(label+'_TRANSPORT');}
  if(response.status!==expected)safe(label+'_STATUS_'+response.status);
  if(response.url&&new URL(response.url).origin!==origin)safe(label+'_ORIGIN');
  if(!/no-store/i.test(response.headers.get('Cache-Control')||''))safe(label+'_CACHE');
  const metrics=measured(response,requireMetrics),cookies=response.headers.getSetCookie();
  for(const raw of cookies){if(raw.length>4096||!/(?:^|;)\s*Secure(?:;|$)/i.test(raw)||!/(?:^|;)\s*HttpOnly(?:;|$)/i.test(raw)||/;\s*Domain=/i.test(raw))safe(label+'_COOKIE');
   const first=raw.split(';',1)[0],index=first.indexOf('='),name=first.slice(0,index),value=first.slice(index+1);if(!keys.includes(name))safe(label+'_COOKIE_NAME');if(!value||/;\s*Max-Age=0(?:;|$)/i.test(raw))jar.delete(name);else jar.set(name,value);
  }
  const value=await json(response,label);
  calls.push({label,path,method,status:response.status,setCookieCount:cookies.length,metrics});return value;
 }
 try{
  const login=await step('login','/auth/v110/login','POST',{uniqueid,pin},200,{anonymous:true});pin='';
  if(login.account?.accountId!==expectedAccount||!/^[-A-Za-z0-9_]{43}$/.test(login.csrf||'')||!/^uaa-session:/.test(login.sessionKey||'')||jar.size!==2)safe('LOGIN_SHAPE');
  proof=login.csrf;selector=login.sessionKey;
  await step('context','/auth/v110/context','GET',null,200);
  const session=await step('session','/api/account/session','POST',{},200);if(session.account?.accountId!==expectedAccount)safe('SESSION_SUBJECT');
  await step('own-material','/api/academy/lesson-media/list','POST',{activityKey:'COURSE:FEATURE-SYNTHETIC-A'},200);
  await step('other-material','/api/academy/lesson-media/list','POST',{activityKey:'COURSE:FEATURE-SYNTHETIC-B'},403);
  const refreshed=await step('background-refresh','/auth/v110/refresh','POST',{foreground:false},200);if(refreshed.refreshed!==true)safe('REFRESH_SHAPE');
  replay=cookie();if(!keys.every(k=>jar.has(k)))safe('REPLAY_EMPTY');
  const ended=await step('logout','/auth/v110/logout','POST',{},200);if(ended.cancelled!==true)safe('LOGOUT_SHAPE');
  await step('persisted-cancellation','/api/account/session','POST',{},401,{replayCookie:replay});
  if(calls.length!==8)safe('REQUEST_COUNT');
  const totals={apiRequests:8,roundTrips:0,statements:0,rowsRead:0,rowsWritten:0,privateRpc:0,r2:0,remote:0,rateChecks:0};
  for(const c of calls)if(c.metrics)for(const k of Object.keys(c.metrics))totals[k]+=c.metrics[k];
  return Object.freeze({schema:1,kind:'FIXED_EIGHT_HTTP_SMOKE',origin,calls,totals,replayedNonemptyPreLogoutCookie:true,backgroundFlag:false,clockChanged:false,httpRetries:0,hostedExecuted:false,metricsObserved:requireMetrics,withinProvisional1000ReadPlanningCeiling:requireMetrics?totals.rowsRead<=1000:null,scope:'No browser/static crawl or foreground claim. Values/cookies/CSRF/PIN remain internal; only fixed route/status/numeric telemetry is returned.'});
 }finally{jar.clear();proof='';selector='';replay='';pin='';}
}
