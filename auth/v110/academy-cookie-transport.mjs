// Academy's explicit native cookie adapter. Public metadata is never authority.
export function installAcademyCookieTransport({win,doc,config,nativeFetch,clock=()=>performance.now()}){
 if(config?.enabled!==true||config.nativeCookie!==true||config.app!=='academy')return null;
 const origin=config.origins?.academy;
 if(origin!=='https://feature_worker.maktab4life.workers.dev'||win.location.origin!==origin||config.apiOrigins?.length!==1||config.apiOrigins[0]!==origin||typeof nativeFetch!=='function')throw Error('INVALID_COOKIE_TRANSPORT');
 let csrf='',expires=0,pending=null;
 const credentials={credentials:'same-origin',cache:'no-store'};
 const hinted=()=>/^uaa-(?:session|context):/.test(win.localStorage.getItem('m4l_account_token')||'');
 const observe=data=>{
  if(typeof data?.csrf==='string'&&/^[-A-Za-z0-9_]{43}$/.test(data.csrf))csrf=data.csrf;
  if(Number.isSafeInteger(data?.accessExpiresAtMs)&&data.accessExpiresAtMs>0)expires=data.accessExpiresAtMs;
 };
 async function nonce(){
  const r=await nativeFetch(origin+'/auth/v110/csrf',credentials);
  if(!r.ok)throw new DOMException('Academy sign-in needs verification.','AbortError');
  const value=await r.json();observe(value);if(!csrf)throw Error('CSRF_UNAVAILABLE');
 }
 async function renew(){
  if(!pending){const task=(async()=>{
   if(!csrf)await nonce();
   const started=clock(),foreground=doc.visibilityState==='visible'&&win.navigator.userActivation?.isActive===true;
   const r=await nativeFetch(origin+'/auth/v110/refresh',{...credentials,method:'POST',headers:{'Content-Type':'application/json','X-UAA-CSRF':csrf},body:JSON.stringify({foreground})});
   if(!r.ok)throw new DOMException('Academy sign-in needs verification.','AbortError');
   const value=await r.json();if(value.refreshed!==true)throw Error('REFRESH_UNAVAILABLE');observe(value);
   if(doc.documentElement.dataset.uaaV110State==='ready'&&value.browserContext){
    await win.M4L_V110.acceptOwnRefresh({session:value.browserContext},started);
   }
  })().finally(()=>{if(pending===task)pending=null;});pending=task;}
  return pending;
 }
 const metadata=new Set(['/auth/v110/login','/auth/v110/setup-pin','/api/account/session','/api/account/switch-context','/api/academy/hub/open','/auth/v110/context']);
 async function mapped(response,path){
  if(!metadata.has(path)||!response.ok)return response;
  const value=await response.clone().json();observe(value);
  if(value.cookieSession===true&&typeof value.sessionKey==='string'){
   value.token=value.sessionKey; // Existing controllers retain a nonsecret UI selector.
   if(value.browserContext?.app==='academy')value.browserContext={session:value.browserContext,initialViews:[]};
   const headers=new Headers(response.headers);headers.delete('Content-Length');
   return new Response(JSON.stringify(value),{status:response.status,headers});
  }
  return response;
 }
 return Object.freeze({async fetch(input,options={}){
  let request=new Request(typeof input==='string'||input instanceof URL?new URL(String(input),win.location.href):input,options),url=new URL(request.url);
  if(url.origin!==origin)return nativeFetch(input,options);
  const path=url.pathname,publicPath=['/api/account/check','/api/academy/setup/head'].includes(path),signIn=['/api/account/login','/api/account/setup-pin'].includes(path),context=path==='/auth/v110/context';
  if(signIn){url.pathname=path.endsWith('/setup-pin')?'/auth/v110/setup-pin':'/auth/v110/login';request=new Request(url,request);return mapped(await nativeFetch(request,credentials),url.pathname);}
  if(!publicPath&&path.startsWith('/api/')&&expires&&Date.now()>=expires)await renew();
  if(!publicPath&&path.startsWith('/api/')&&!['GET','HEAD'].includes(request.method)){
   if(!csrf)await nonce();const headers=new Headers(request.headers);headers.set('X-UAA-CSRF',csrf);request=new Request(request,{headers});
  }
  let response=await nativeFetch(request,credentials);
  if(context&&response.status===401&&hinted()){await renew();response=await nativeFetch(request,credentials);}
  return mapped(response,path);
 }});
}
