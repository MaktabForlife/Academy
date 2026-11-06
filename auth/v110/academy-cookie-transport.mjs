// Academy's explicit native cookie adapter. Public metadata is never authority.
export function installAcademyCookieTransport({win,doc,config,nativeFetch,clock=()=>performance.now()}){
 if(config?.enabled!==true||config.nativeCookie!==true||config.app!=='academy')return null;
 const origin=config.origins?.academy;
 if(origin!=='https://feature_worker.maktab4life.workers.dev'||win.location.origin!==origin||config.apiOrigins?.length!==1||config.apiOrigins[0]!==origin||typeof nativeFetch!=='function')throw Error('INVALID_COOKIE_TRANSPORT');
 let csrf='',expires=0,pending=null,generation=0;
 const credentials={credentials:'same-origin',cache:'no-store'};
 const hinted=()=>/^uaa-(?:session|context):/.test(win.localStorage.getItem('m4l_account_token')||'');
 const observe=(data,mine=generation)=>{
  if(mine!==generation)throw new DOMException('The browser sign-in changed.','AbortError');
  if(typeof data?.csrf==='string'&&/^[-A-Za-z0-9_]{43}$/.test(data.csrf))csrf=data.csrf;
  if(Number.isSafeInteger(data?.accessExpiresAtMs)&&data.accessExpiresAtMs>0)expires=data.accessExpiresAtMs;
 };
 async function nonce(mine=generation){
  const r=await nativeFetch(origin+'/auth/v110/csrf',credentials);
  if(!r.ok)throw new DOMException('Academy sign-in needs verification.','AbortError');
  const value=await r.json();observe(value,mine);if(!csrf)throw Error('CSRF_UNAVAILABLE');
 }
 async function renew(foreground=false){
  if(!pending){const mine=generation,task=(async()=>{
   if(!csrf)await nonce(mine);
   if(mine!==generation)throw new DOMException('The browser sign-in changed.','AbortError');
   const started=clock();
   const r=await nativeFetch(origin+'/auth/v110/refresh',{...credentials,method:'POST',headers:{'Content-Type':'application/json','X-UAA-CSRF':csrf},body:JSON.stringify({foreground})});
   if(!r.ok)throw new DOMException('Academy sign-in needs verification.','AbortError');
   const value=await r.json();if(value.refreshed!==true)throw Error('REFRESH_UNAVAILABLE');observe(value,mine);
   if(doc.documentElement.dataset.uaaV110State==='ready'&&value.browserContext){
    await win.M4L_V110.acceptOwnRefresh({session:value.browserContext},started);
   }
  })().finally(()=>{if(pending===task)pending=null;});pending=task;}
  return pending;
 }
 async function pinBody(request){
  if(['GET','HEAD'].includes(request.method))return undefined;
  const reader=request.body?.getReader(),chunks=[];let length=0;
  try{if(reader)for(;;){const part=await reader.read();if(part.done)break;length+=part.value.byteLength;if(length>4096){await reader.cancel();throw Error('INVALID_PIN_BODY');}chunks.push(part.value);}}
  finally{reader?.releaseLock();}
  const bytes=new Uint8Array(length);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.byteLength;}return bytes;
 }
 const metadata=new Set(['/auth/v110/login','/auth/v110/setup-pin','/api/account/session','/api/account/switch-context','/api/academy/hub/open','/auth/v110/context']);
 async function mapped(response,path,mine=generation){
  if(!metadata.has(path)||!response.ok)return response;
  const value=await response.clone().json();observe(value,mine);
  if(value.cookieSession===true&&typeof value.sessionKey==='string'){
   value.token=value.sessionKey; // Existing controllers retain a nonsecret UI selector.
   if(value.browserContext?.app==='academy')value.browserContext={session:value.browserContext,initialViews:[]};
   const headers=new Headers(response.headers);headers.delete('Content-Length');
   return new Response(JSON.stringify(value),{status:response.status,headers});
  }
  return response;
 }
 return Object.freeze({async fetch(input,options={}){
  const requestGeneration=generation;
  let request=new Request(typeof input==='string'||input instanceof URL?new URL(String(input),win.location.href):input,options),url=new URL(request.url);
  if(url.origin!==origin)return nativeFetch(input,options);
  const path=url.pathname,method=request.method,publicRead=['GET','HEAD'].includes(method)&&['/api/public/header-date','/api/public/academy-announcements','/api/public/academy-announcements/image','/api/public/academy-announcements/pdf','/api/academy/header-date'].includes(path),
   publicPath=publicRead||path==='/api/account/check'&&method==='POST'||path==='/api/academy/setup/head'&&['GET','HEAD'].includes(method),
   signIn=['/api/account/login','/api/account/setup-pin'].includes(path),context=path==='/auth/v110/context',logout=path==='/api/account/logout'&&method==='POST';
  const event=options.uaaUserAction,foreground=Boolean(!publicPath&&!logout&&path.startsWith('/api/')&&!['/api/account/session','/api/account/switch-context','/api/academy/hub/refresh'].includes(path)&&typeof win.Event==='function'&&event instanceof win.Event&&event.isTrusted===true&&['click','submit','keydown','pointerup'].includes(event.type)&&doc.visibilityState==='visible'&&win.navigator.userActivation?.isActive===true);
  if(logout){
   generation++;pending=null;
   // Cancellation uses its own fingerprint-bound endpoint. It never waits for
   // or starts access renewal, including when renewal is already failing.
   if(!csrf){
    const nonceResponse=await nativeFetch(origin+'/auth/v110/logout-csrf',credentials);
    if(!nonceResponse.ok)throw new DOMException('Academy sign-out is not confirmed.','AbortError');observe(await nonceResponse.json());if(!csrf)throw Error('CSRF_UNAVAILABLE');
   }
   url.pathname='/auth/v110/logout';const headers=new Headers(request.headers);if(csrf)headers.set('X-UAA-CSRF',csrf);
   const response=await nativeFetch(new Request(url,{method:'POST',headers,body:await pinBody(request),signal:request.signal,credentials:'same-origin',cache:'no-store',redirect:'error'}),credentials);
   if(response.ok){csrf='';expires=0;}return response;
  }
  if(signIn){const mine=++generation;pending=null;url.pathname=path.endsWith('/setup-pin')?'/auth/v110/setup-pin':'/auth/v110/login';request=new Request(url,{method:request.method,headers:request.headers,body:await pinBody(request),signal:request.signal,keepalive:request.keepalive,credentials:'same-origin',cache:'no-store',redirect:'error'});return mapped(await nativeFetch(request,credentials),url.pathname,mine);}
  if(!publicPath&&path.startsWith('/api/')&&expires&&Date.now()>=expires)await renew(foreground);
  if(!publicPath&&path.startsWith('/api/')&&!['GET','HEAD'].includes(request.method)){
   if(!csrf)await nonce(requestGeneration);const headers=new Headers(request.headers);headers.set('X-UAA-CSRF',csrf);request=new Request(request,{headers});
  }
  let response=await nativeFetch(request,credentials);
  if(context&&response.status===401&&hinted()){if(requestGeneration!==generation)throw new DOMException('The browser sign-in changed.','AbortError');await renew();response=await nativeFetch(request,credentials);}
  return mapped(response,path,requestGeneration);
 }});
}
