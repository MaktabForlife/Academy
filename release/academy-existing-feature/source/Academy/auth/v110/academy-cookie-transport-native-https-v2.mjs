// Root-only source successor. HttpOnly credentials never enter JS storage.
export function installAcademyCookieTransport({win,doc,config,nativeFetch,clock=()=>performance.now()}){
 const origin='https://maktabhelper.app',opaque=v=>typeof v==='string'&&/^[-A-Za-z0-9_]{43}$/.test(v);
 if(config?.enabled!==true||config.scope!=='ROOT_ONLY'||config.localProfile!=='native-root-only-v1'||!['LOCAL_SYNTHETIC','HOSTED_FEATURE'].includes(config.executionKind)||config.nativeCookie!==true||config.nativeChild===true||config.app!=='academy'||win.M4L_V110_ROOT_ONLY_PREPAINT_READY!==true||!config.origins||Object.keys(config.origins).join(',')!=='academy'||config.origins.academy!==origin||win.location.origin!==origin||config.apiOrigins?.length!==1||config.apiOrigins[0]!==origin||!/^[a-f0-9]{64}$/.test(config.profileCommitment||'')||typeof nativeFetch!=='function')throw Error('INVALID_ROOT_ONLY_COOKIE_TRANSPORT');
 let csrf='',expires=0,pending=null,generation=0;
 const controllers=new Set(),credentials={credentials:'same-origin',cache:'no-store',redirect:'error'};
 const stopped=()=>new DOMException('The browser sign-in needs verification.','AbortError');
 const hinted=()=>/^uaa-(?:session|context):/.test(win.localStorage.getItem('m4l_account_token')||'');
 function retire(){generation++;csrf='';expires=0;pending=null;for(const c of controllers)c.abort();controllers.clear();}
 win.addEventListener('pagehide',retire);
 doc.addEventListener('visibilitychange',()=>{if(doc.visibilityState==='hidden')retire();});
 function observe(value,mine){
  if(mine!==generation)throw stopped();
  if(opaque(value?.csrf))csrf=value.csrf;
  if(Number.isSafeInteger(value?.accessExpiresAtMs)&&value.accessExpiresAtMs>0)expires=value.accessExpiresAtMs;
 }
 // Headers, body and every late settlement share the same absolute budget.
 async function wire(input,options={},mine=generation){
  const source=options.signal||input?.signal,controller=new AbortController(),start=clock(),end=start+5000;
  if(!Number.isFinite(start)||start<0)throw stopped();
  let response,reader,timer,onAbort,finished=false,size=0;const chunks=[];
  const cancel=()=>{try{void Promise.resolve(reader?reader.cancel():response?.body?.cancel()).catch(()=>{});}catch{}};
  const release=()=>{try{reader?.releaseLock();}catch{}};
  const check=()=>{const now=clock();if(controller.signal.aborted||mine!==generation||!Number.isFinite(now)||now<start||now>=end)throw stopped();};
  const gate=new Promise((_yes,no)=>{
   const reject=()=>{controller.abort();cancel();no(stopped());};
   timer=setTimeout(reject,5000);onAbort=reject;
   if(source?.aborted)reject();else source?.addEventListener?.('abort',onAbort,{once:true});
   controller.signal.addEventListener('abort',()=>no(stopped()),{once:true});
  });
  void gate.catch(()=>{});controllers.add(controller);
  try{
   check();
   const fetching=Promise.resolve().then(()=>{check();return nativeFetch(input,{...credentials,...options,signal:controller.signal});});
   void fetching.then(value=>{if(finished||controller.signal.aborted)try{void Promise.resolve(value.body?.cancel()).catch(()=>{});}catch{}},()=>{});
   response=await Promise.race([fetching,gate]);check();
   reader=response.body?.getReader();
   if(reader)for(;;){
    const reading=Promise.resolve().then(()=>reader.read());
    void reading.then(()=>{if(finished)release();},()=>{if(finished)release();});
    const part=await Promise.race([reading,gate]);check();if(part.done)break;
    if(!(part.value instanceof Uint8Array))throw Error('ROOT_RESPONSE_INVALID');
    size+=part.value.byteLength;if(size>262144)throw Error('ROOT_RESPONSE_TOO_LARGE');chunks.push(part.value);
   }
   const bytes=new Uint8Array(size);let at=0;for(const part of chunks){bytes.set(part,at);at+=part.byteLength;}
   check();const headers=new Headers(response.headers);headers.delete('Content-Length');
   return {response:new Response([101,204,205,304].includes(response.status)?null:bytes,{status:response.status,statusText:response.statusText,headers}),bytes};
  }finally{
   finished=true;clearTimeout(timer);source?.removeEventListener?.('abort',onAbort);cancel();release();controllers.delete(controller);controller.abort();
  }
 }
 const parse=bytes=>JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
 async function json(path,options={},mine=generation){
  const packet=await wire(origin+path,options,mine);if(mine!==generation)throw stopped();if(!packet.response.ok)throw stopped();
  const value=parse(packet.bytes);if(!value||Object.getPrototypeOf(value)!==Object.prototype)throw Error('ROOT_RESPONSE_INVALID');
  observe(value,mine);return value;
 }
 async function nonce(mine=generation,signal){
  await json('/auth/v110/csrf',{signal},mine);if(!csrf)throw Error('CSRF_UNAVAILABLE');
 }
 async function renew(signal){
  if(!pending){const mine=generation,task=(async()=>{
   if(!csrf)await nonce(mine,signal);if(mine!==generation)throw stopped();
   const started=clock();
   const value=await json('/auth/v110/refresh',{signal,method:'POST',headers:{'Content-Type':'application/json','X-UAA-CSRF':csrf},body:'{}'},mine);
   if(mine!==generation)throw stopped();if(value.refreshed!==true)throw Error('REFRESH_UNAVAILABLE');
   if(mine!==generation)throw stopped();
   if(doc.documentElement.dataset.uaaV110State==='ready'&&value.browserContext){await win.M4L_V110.acceptOwnRefresh({session:value.browserContext},started);if(mine!==generation)throw stopped();}
  })().finally(()=>{if(pending===task)pending=null;});pending=task;}
  return pending;
 }
 async function pinBody(request,mine=generation){
  if(['GET','HEAD'].includes(request.method))return undefined;
  const start=clock(),end=start+5000,source=request.signal,controller=new AbortController(),signal=controller.signal;let reader,timer,onAbort,finished=false,size=0;const chunks=[];
  if(!Number.isFinite(start)||start<0)throw stopped();
  const cancel=()=>{try{void Promise.resolve(reader?.cancel()).catch(()=>{});}catch{}};
  const release=()=>{try{reader?.releaseLock();}catch{}};
  const check=()=>{const now=clock();if(signal.aborted||mine!==generation||!Number.isFinite(now)||now<start||now>=end)throw stopped();};
  const gate=new Promise((_yes,no)=>{const reject=()=>{cancel();no(stopped());};timer=setTimeout(()=>{controller.abort();reject();},5000);onAbort=reject;signal.addEventListener('abort',onAbort,{once:true});});void gate.catch(()=>{});
  const upstreamAbort=()=>controller.abort();if(source?.aborted)controller.abort();else source?.addEventListener('abort',upstreamAbort,{once:true});controllers.add(controller);
  try{
   check();reader=request.body?.getReader();
   if(reader)for(;;){const reading=Promise.resolve().then(()=>reader.read());void reading.then(()=>{if(finished)release();},()=>{if(finished)release();});const part=await Promise.race([reading,gate]);check();if(part.done)break;if(!(part.value instanceof Uint8Array))throw Error('INVALID_PIN_BODY');size+=part.value.byteLength;if(size>4096)throw Error('INVALID_PIN_BODY');chunks.push(part.value);}
   const bytes=new Uint8Array(size);let at=0;for(const part of chunks){bytes.set(part,at);at+=part.byteLength;}check();return bytes;
  }finally{finished=true;clearTimeout(timer);signal.removeEventListener('abort',onAbort);source?.removeEventListener('abort',upstreamAbort);cancel();release();controllers.delete(controller);controller.abort();}
 }
 const metadata=new Set(['/auth/v110/login','/auth/v110/setup-pin','/api/account/session','/api/account/switch-context','/api/academy/hub/open','/auth/v110/context']);
 function mapped(packet,path,mine){
  if(mine!==generation)throw stopped();const response=packet.response;if(!metadata.has(path)||!response.ok)return response;
  const value=parse(packet.bytes);observe(value,mine);
  if(value.cookieSession===true&&typeof value.sessionKey==='string'){
   value.token=value.sessionKey;
   if(value.browserContext?.app==='academy')value.browserContext={session:value.browserContext,initialViews:[]};
   const headers=new Headers(response.headers);headers.delete('Content-Length');return new Response(JSON.stringify(value),{status:response.status,headers});
  }
  return response;
 }
 return Object.freeze({async fetch(input,options={}){
  let mine=generation,request=new Request(typeof input==='string'||input instanceof URL?new URL(String(input),win.location.href):input,options),url=new URL(request.url);
  if(url.origin!==origin||url.username||url.password)throw Object.assign(Error('ACADEMY_ORIGIN_NOT_ALLOWED'),{code:'ACADEMY_ORIGIN_NOT_ALLOWED',status:403});
  const path=url.pathname,method=request.method,publicRead=['GET','HEAD'].includes(method)&&['/api/public/header-date','/api/public/academy-announcements','/api/public/academy-announcements/image','/api/public/academy-announcements/pdf','/api/academy/header-date'].includes(path),
   publicPath=publicRead||path==='/api/account/check'&&method==='POST'||path==='/api/academy/setup/head'&&['GET','HEAD'].includes(method),
   signIn=['/api/account/login','/api/account/setup-pin'].includes(path),context=path==='/auth/v110/context',logout=path==='/api/account/logout'&&method==='POST';
  if(logout){
   retire();mine=generation;const body=await pinBody(request);if(mine!==generation)throw stopped();
   await json('/auth/v110/logout-csrf',{signal:request.signal},mine);if(!csrf)throw Error('CSRF_UNAVAILABLE');
   url.pathname='/auth/v110/logout';const headers=new Headers(request.headers);headers.set('X-UAA-CSRF',csrf);
   const packet=await wire(new Request(url,{method:'POST',headers,body,signal:request.signal}),{},mine);
   if(mine!==generation)throw stopped();if(packet.response.ok){csrf='';expires=0;}return packet.response;
  }
  if(signIn){
   retire();mine=generation;url.pathname=path.endsWith('/setup-pin')?'/auth/v110/setup-pin':'/auth/v110/login';
   request=new Request(url,{method,headers:request.headers,body:await pinBody(request),signal:request.signal,keepalive:request.keepalive});
   if(mine!==generation)throw stopped();return mapped(await wire(request,{},mine),url.pathname,mine);
  }
  if(!publicPath&&path.startsWith('/api/')&&expires&&Date.now()>=expires)await renew(request.signal);
  if(!publicPath&&path.startsWith('/api/')&&!['GET','HEAD'].includes(method)){
   if(!csrf)await nonce(mine,request.signal);if(mine!==generation)throw stopped();const headers=new Headers(request.headers);headers.set('X-UAA-CSRF',csrf);request=new Request(request,{headers});
  }
  let packet=await wire(request,{},mine);if(mine!==generation)throw stopped();
  if(!publicPath&&path.startsWith('/api/')&&packet.response.status===401&&hinted()){
   // Permission replacement may refresh only this app. Never replay a denied mutation.
   try{await renew(request.signal);}catch{}if(mine!==generation)throw stopped();
  }
  if(context&&packet.response.status===401&&hinted()){if(mine!==generation)throw stopped();await renew(request.signal);packet=await wire(request,{},mine);}
  if(mine!==generation)throw stopped();return mapped(packet,path,mine);
 }});
}
