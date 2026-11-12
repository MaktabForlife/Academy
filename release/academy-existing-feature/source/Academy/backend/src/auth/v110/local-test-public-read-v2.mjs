// SOURCE ONLY exact new feature-policy successor; original read authority unchanged.
// SOURCE ONLY. Public published snapshots only; no identity, entitlement, private bridge or global fetch.
export const nativePublicReadOrigins=Object.freeze({academy:'https://ummabbadacademy.app',studio:'https://worshipuponbaseera.ummabbadacademy.app'});
export const nativePublicReadBinding='JWT_LOCAL_NATIVE_STUDIO_PUBLIC_READ_SERVICE';
const unavailable=()=>Response.json({code:'LOCAL_NATIVE_PUBLIC_READ_UNAVAILABLE'},{status:503,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
const maximum=8*1024*1024; // Local transport ceiling, not a change to native publication policy.
export function nativePublicReadDescriptor(request,app){
 const origin=nativePublicReadOrigins[app];if(!origin)return null;const u=new URL(request.url);
 if(u.origin!==origin||u.username||u.password||u.search||u.hash)return null;
 if(['/api/public/home','/api/public/circles'].includes(u.pathname))return request.method==='GET'?Object.freeze({path:u.pathname,kind:'json'}):null;
 if(/^\/api\/public\/circles\/covers\/[a-f0-9]{64}$/.test(u.pathname))return ['GET','HEAD'].includes(request.method)?Object.freeze({path:u.pathname,kind:'image'}):null;
 return null;
}
function nativeStage(env,app){
 const common=env.JWT_LOCAL_STAGE==='V110_INTEGRATION'&&env.JWT_LOCAL_TEST_ROUTE_POLICY==='NATIVE_WEBSITE_HIFZ_V1'&&env.JWT_LOCAL_BACKEND_EGRESS==='DENY_ALL'&&env.JWT_LOCAL_AI==='OFF'&&env.JWT_LOCAL_PROVIDERS==='OFF'&&env.JWT_LOCAL_TRANSCRIPTION==='OFF'&&env.JWT_LOCAL_SCHEDULES==='OFF'&&env.VIDEO_AUTOLINK_HTTP_ENABLED==='0'&&env.LOCAL_VIDEO_MANUAL_SOURCE_ENABLED==='0'&&env.JWT_V110_REFRESH==='1'&&env.JWT_V110_BROWSER==='1'&&/^[a-f0-9]{64}$/.test(env.JWT_LOCAL_NATIVE_RUN_ID||'')&&env.JWT_LOCAL_APP_BINDING===app+':'+env.JWT_LOCAL_NATIVE_RUN_ID;
 const own=app==='academy'?env.JWT_V110_MASTER==='1'&&env.JWT_V110_NATIVE_COOKIE==='1'&&env.JWT_LOCAL_OUTBOX==='1'&&env.JWT_LOCAL_CHILD_PIN==='1':app==='studio'&&env.JWT_V110_MASTER==='0'&&env.JWT_V110_CHILD_NATIVE_AUTH==='1'&&env.JWT_V110_CHILD_POLICY==='NATIVE_ATOMIC_PIN_V3'&&env.PLATFORM_ENABLED==='1';
 return common&&own;
}

const ownershipHeader='X-Local-Native-Public-Read-Ownership';
const typedUnavailable=()=>{const r=unavailable();r.headers.set(ownershipHeader,'UNCERTAIN');return r;};
const failure=code=>Object.assign(Error(code),{code});
// Opaque local state; failure notifications can only latch uncertainty, never attest success.
export function createNativePublicReadOwner({onUncertain=()=>{}}={}){
 const pending=new Set();let uncertain=false;
 function mark(){if(!uncertain){uncertain=true;onUncertain();}}
 function track(value){const p=Promise.resolve(value);pending.add(p);void p.then(()=>pending.delete(p),()=>pending.delete(p));return p;}
 async function boundedWait(value,ms){const raw=track(value);let timer;
  try{return await Promise.race([raw,new Promise((_yes,no)=>{timer=setTimeout(()=>{mark();no(failure('LOCAL_PUBLIC_READ_OWNERSHIP_UNCERTAIN'));},ms);})]);}
  finally{clearTimeout(timer);}
 }
 async function ownBody(response,signal,read){
  let reader,cancelPromise,complete=false;const start=Date.now();
  function cancel(){
   if(cancelPromise)return cancelPromise;if(complete||!response.body)return Promise.resolve();
   let operation;try{operation=reader?reader.cancel():response.body.cancel();}catch{mark();return Promise.reject(failure('LOCAL_PUBLIC_READ_OWNERSHIP_UNCERTAIN'));}
   cancelPromise=boundedWait(operation,5000).catch(()=>{mark();throw failure('LOCAL_PUBLIC_READ_OWNERSHIP_UNCERTAIN');});
   // Abort listeners do not leave a rejected detached promise. The latch survives every catch.
   void cancelPromise.catch(()=>{});return cancelPromise;
  }
  const abort=()=>{void cancel().catch(()=>{});};signal?.addEventListener('abort',abort,{once:true});
  try{
   if(!read||signal?.aborted){await cancel();if(signal?.aborted)throw failure('LOCAL_PUBLIC_READ_ABORTED');return new Uint8Array();}
   if(!response.body){complete=true;return new Uint8Array();}
   reader=response.body.getReader();if(signal?.aborted){await cancel();throw failure('LOCAL_PUBLIC_READ_ABORTED');}
   const parts=[];let size=0;
   while(true){
    if(signal?.aborted)throw failure('LOCAL_PUBLIC_READ_ABORTED');
    const remaining=10000-(Date.now()-start);if(remaining<=0){mark();throw failure('LOCAL_PUBLIC_READ_OWNERSHIP_UNCERTAIN');}
    const x=await boundedWait(reader.read(),remaining);
    if(signal?.aborted)throw failure('LOCAL_PUBLIC_READ_ABORTED');
    if(x.done){complete=true;break;}size+=x.value.byteLength;if(size>maximum)throw failure('LOCAL_PUBLIC_READ_BODY_LIMIT');parts.push(x.value);
   }
   const out=new Uint8Array(size);let at=0;for(const x of parts){out.set(x,at);at+=x.byteLength;}return out;
  }catch(error){if(!['LOCAL_PUBLIC_READ_ABORTED','LOCAL_PUBLIC_READ_BODY_LIMIT'].includes(error?.code))mark();throw error;}
  finally{
   signal?.removeEventListener('abort',abort);
   try{if(!complete)await cancel();}catch{mark();throw failure('LOCAL_PUBLIC_READ_OWNERSHIP_UNCERTAIN');}
   finally{if(reader)try{reader.releaseLock();}catch{mark();}}
  }
 }
 return Object.freeze({
  markUncertain:mark,
  read:(response,signal)=>ownBody(response,signal,true),
  discard:(response,signal)=>ownBody(response,signal,false),
  async fetch(target,request){
   const controller=new AbortController(),abort=()=>controller.abort();request.signal.addEventListener('abort',abort,{once:true});if(request.signal.aborted)abort();
   let abandoned=false,received;const operation=track(Promise.resolve().then(()=>target.fetch(new Request(request,{signal:controller.signal}))));
   // A response arriving after timeout/abort still has an owner and is cancelled through this registry.
   void operation.then(response=>{received=response;if(abandoned)void ownBody(response,undefined,false).catch(()=>mark());},()=>{});
   try{const response=await boundedWait(operation,10000);return response;}
   catch(error){abandoned=true;mark();controller.abort();if(received)void ownBody(received,undefined,false).catch(()=>mark());throw error;}
   finally{request.signal.removeEventListener('abort',abort);}
  },
  async settleForStop(){const snapshot=[...pending];if(snapshot.length)try{await boundedWait(Promise.allSettled(snapshot),5000);}catch{mark();}return Object.freeze({uncertain,pending:pending.size});},
  status:()=>Object.freeze({uncertain,pending:pending.size})
 });
}
const workerOwner=createNativePublicReadOwner();
const safeNativeErrors=new Set(['This cover is unavailable.','The learning catalogue is unavailable.','The learning catalogue needs review.','The public reading link needs review.','The website platform is not enabled.','Invalid request data.']);
async function publicResponse(response,descriptor,method,signal,owner){
 if(response.headers.get(ownershipHeader)==='UNCERTAIN'){owner.markUncertain();await owner.discard(response,signal);return unavailable();}
 if(response.redirected||response.status>=300&&response.status<400||response.headers.has('Set-Cookie')){await owner.discard(response,signal);return unavailable();}
 const type=response.headers.get('Content-Type')||'',mime=type.split(';')[0].trim().toLowerCase();
 if(response.status!==200){
  if(mime!=='application/json'){await owner.discard(response,signal);return unavailable();}
  const data=await owner.read(response,signal);let value;try{value=JSON.parse(new TextDecoder().decode(data));}catch{return unavailable();}
  if(!value||Array.isArray(value)||value.success!==false||!safeNativeErrors.has(value.error)||Object.keys(value).some(k=>!['success','error','code'].includes(k))||value.code!==undefined&&(typeof value.code!=='string'||!/^[-A-Z0-9_]{1,80}$/.test(value.code)))return unavailable();
  return Response.json({success:false,error:value.error,...(value.code?{code:value.code}:{})},{status:response.status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
 }
 if(descriptor.kind==='json'?mime!=='application/json':!['image/png','image/jpeg','image/webp'].includes(mime)){await owner.discard(response,signal);return unavailable();}
 const data=method==='HEAD'?(await owner.discard(response,signal),null):await owner.read(response,signal);
 return new Response(data,{status:200,headers:{'Content-Type':type,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex, nofollow','Referrer-Policy':'no-referrer'}});
}
export async function forwardNativePublicRead(request,target,owner){
 const descriptor=nativePublicReadDescriptor(request,'studio');
 if(!descriptor||request.headers.has('Cookie')||request.headers.has('Authorization')||request.headers.has('Origin')||typeof target?.fetch!=='function'||!owner)return unavailable();
 try{const headers=new Headers();if(request.headers.has('Accept'))headers.set('Accept',request.headers.get('Accept'));
  const response=await owner.fetch(target,new Request(nativePublicReadOrigins.studio+descriptor.path,{method:request.method,headers,redirect:'error',signal:request.signal}));
  return await publicResponse(response,descriptor,request.method,request.signal,owner);
 }catch{return unavailable();} // Owner latch/outstanding registry survives safe public error conversion.
}
export async function nativeStudioPublicRead(native,request,env,ctx){
 const descriptor=nativePublicReadDescriptor(request,'studio');
 if(!descriptor||!nativeStage(env,'studio')||request.headers.has('Cookie')||request.headers.has('Authorization')||request.headers.has('Origin'))return unavailable();
 try{const response=await workerOwner.fetch({fetch:r=>native.fetch(r,env,ctx)},request);const result=await publicResponse(response,descriptor,request.method,request.signal,workerOwner);return workerOwner.status().uncertain?typedUnavailable():result;}
 catch{return workerOwner.status().uncertain?typedUnavailable():unavailable();}
}
export async function relayNativeRootPublicRead(request,env){
 const u=new URL(request.url),owned=['/api/public/home','/api/public/circles'].includes(u.pathname)||u.pathname.startsWith('/api/public/circles/covers/');
 if(!owned)return null;const descriptor=nativePublicReadDescriptor(request,'academy');if(!descriptor||!nativeStage(env,'academy'))return unavailable();
 const target=env[nativePublicReadBinding];if(typeof target?.fetch!=='function')return unavailable();const headers=new Headers();if(request.headers.has('Accept'))headers.set('Accept',request.headers.get('Accept'));
 // Node capability owns and verifies the response body. Root does not create an untracked second consumer.
 try{return await target.fetch(new Request(nativePublicReadOrigins.studio+descriptor.path,{method:request.method,headers,redirect:'error',signal:request.signal}));}
 catch{return typedUnavailable();} // Host intercepts this private failure marker before any browser delivery.
}
export const nativePublicReadOwnershipHeader=ownershipHeader;

export const localTestPublicReadSource='LOCAL_TEST_PUBLIC_READ_V1';
