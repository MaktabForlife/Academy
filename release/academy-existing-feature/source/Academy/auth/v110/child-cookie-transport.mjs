// Explicit local-child browser transport. Disconnected until a reviewed app
// build installs it before native startup. Cookies remain HttpOnly; memory
// stores only anti-CSRF/display expiry metadata, never access/refresh values.
const expected=Object.freeze({studio:'https://worshipuponbaseera.ummabbadacademy.app',hifz:'https://mahadarwa-hifz.ummabbadacademy.app'});
export function createChildCookieTransport({win,config,nativeFetch}){
 if(config?.enabled!==true||config.nativeChild!==true)return null;
 const app=config.app,origin=expected[app];
 if(!origin||config.origins?.[app]!==origin||win.location.origin!==origin||config.apiOrigins?.length!==1||config.apiOrigins[0]!==origin||typeof nativeFetch!=='function')throw Error('INVALID_CHILD_TRANSPORT');
 let csrf='',expires=0,generation=0,pending=null;
 const options={credentials:'same-origin',cache:'no-store',redirect:'error'};
 const failure=(code='CHILD_SESSION_REQUIRED',status=401)=>Object.assign(new Error('Check your sign-in to continue.'),{code,status});
 function observe(value,mine){
  if(mine!==generation)throw failure('CHILD_CONTEXT_CHANGED');
  if(typeof value?.csrf==='string'&&/^[-A-Za-z0-9_]{43}$/.test(value.csrf))csrf=value.csrf;
  if(Number.isSafeInteger(value?.accessExpiresAtMs))expires=value.accessExpiresAtMs;
 }
 async function checked(response,mine){
  let value;try{value=await response.clone().json();}catch{throw failure('CHILD_RESPONSE_INVALID',503);}
  if(!response.ok)throw failure(typeof value?.code==='string'?value.code:undefined,response.status);
  observe(value,mine);return value;
 }
 async function nonce(mine,signal){
  const response=await nativeFetch(origin+'/api/auth/v110/csrf',{...options,signal});
  const value=await checked(response,mine);
  if(Object.keys(value).length!==1||!csrf)throw failure('CHILD_CSRF_UNAVAILABLE',503);
 }
 async function renew(signal){
  if(!pending){const mine=generation,task=(async()=>{
   if(!csrf)await nonce(mine,signal);
   if(mine!==generation)throw failure('CHILD_CONTEXT_CHANGED');
   const started=performance.now();
   const response=await nativeFetch(origin+'/api/auth/v110/refresh',{...options,signal,method:'POST',headers:{'Content-Type':'application/json','X-UAA-CSRF':csrf},body:'{}'});
   const value=await checked(response,mine);
   if(!value?.session||!Number.isSafeInteger(value.accessExpiresAtMs))throw failure('CHILD_REFRESH_UNAVAILABLE',503);
   if(win.document.documentElement.dataset.uaaV110State==='ready')await win.M4L_V110?.acceptOwnRefresh({session:value.session},started);
  })().finally(()=>{if(pending===task)pending=null;});pending=task;}
  return pending;
 }
 async function context(signal){
  const mine=generation,load=()=>nativeFetch(origin+'/api/auth/v110/context',{...options,signal});
  let response=await load();
  if(response.status===401){await renew(signal);if(mine!==generation)throw failure('CHILD_CONTEXT_CHANGED');response=await load();}
  await checked(response,mine);return response;
 }
 function clear(){generation++;csrf='';expires=0;pending=null;}
 return Object.freeze({context,clear,async fetch(input,requestOptions={}){
  const request=new Request(typeof input==='string'||input instanceof URL?new URL(String(input),win.location.href):input,requestOptions),url=new URL(request.url);
  if(request.headers.has('Authorization'))throw failure('LEGACY_AUTH_NOT_ALLOWED',403);
  if(url.origin!==origin)throw failure('CHILD_ORIGIN_NOT_ALLOWED',403);
  if(url.pathname==='/auth/v110/context'||url.pathname==='/api/auth/v110/context')return context(request.signal);
  if(url.pathname.startsWith('/api/auth/v110/'))throw failure('CHILD_AUTH_ADAPTER_ONLY',403);
  if(['/auth/login','/auth/register','/auth/exchange','/auth/refresh','/auth/access'].includes(url.pathname))throw failure('ACADEMY_SIGNIN_REQUIRED');
  if(url.pathname==='/auth/logout'){
   const mine=generation;if(!csrf)await nonce(mine,request.signal);
   const headers=new Headers({'Content-Type':'application/json','X-UAA-CSRF':csrf});
   const response=await nativeFetch(origin+'/api/auth/v110/logout',{...options,signal:request.signal,method:'POST',headers,body:'{}'});
   await checked(response,mine);clear();win.M4L_V110?.clear('logout');return response;
  }
  const mine=generation,method=request.method;
  if(expires&&Date.now()>=expires)await renew(request.signal);
  if(mine!==generation)throw failure('CHILD_CONTEXT_CHANGED');
  const headers=new Headers(request.headers);
  if(headers.has('Authorization'))throw failure('LEGACY_AUTH_NOT_ALLOWED',403);
  if(!['GET','HEAD'].includes(method)){if(!csrf)await nonce(mine,request.signal);if(mine!==generation)throw failure('CHILD_CONTEXT_CHANGED');headers.set('X-UAA-CSRF',csrf);}
  // Never replay a denied native mutation. Privacy/native permission handling
  // decides whether a current-token transition needs a fresh masked document.
  return nativeFetch(new Request(request,{headers,...options}),options);
 }});
}
