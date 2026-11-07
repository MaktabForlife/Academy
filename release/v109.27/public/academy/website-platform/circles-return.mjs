// Only a server-issued connector result supplies this tab's Circles return.
// URL parameters never supply a return origin, destination or account owner.
export function approvedCirclesReturn(raw,now=Date.now()){
 try{const c=JSON.parse(raw),url=new URL(c.returnUrl),origin=new URL(c.websiteOrigin);
  if(origin.origin!==c.websiteOrigin||!['https:','http:'].includes(origin.protocol)||origin.protocol==='http:'&&!['localhost','127.0.0.1'].includes(origin.hostname)||url.origin!==origin.origin||url.username||url.password||url.pathname!=='/'||url.hash||!['learn','teach','admin'].includes(c.mode)||url.search!=='?workspace='+c.mode||!Number.isSafeInteger(c.expiresAt)||c.expiresAt<=now||c.expiresAt>now+12*3600_000||!/^[a-f0-9]{64}$/.test(c.owner))return null;
  if(c.sameTab!==undefined&&typeof c.sameTab!=='boolean')return null;
  return c;
 }catch{return null;}
}
// Returning to the exact live opener preserves its DOM, selected mode and
// scroll position. If it cannot acknowledge, the checked ordinary URL remains.
export function returnToOpenDashboard({window,context,isCurrent=()=>true,timeoutMs=1000}){
 // An in-place Academy visit must use its checked ordinary Home link,
 // even if this tab originally had an opener. Never close the current tab.
 const checked=approvedCirclesReturn(JSON.stringify(context));
 if(!checked||!isCurrent()||checked.sameTab===true)return false;
 const opener=window.opener;if(!opener||opener.closed)return false;
 const requestId=window.crypto.randomUUID();let done=false;
 const finish=()=>{if(done)return;done=true;window.clearTimeout(timer);window.removeEventListener('message',receive);};
 const fallback=()=>{if(done)return;finish();if(isCurrent())window.location.assign(context.returnUrl);};
 const receive=event=>{if(event.source!==opener||event.origin!==context.websiteOrigin||event.data?.type!=='CIRCLES_DASHBOARD_RETURNED'||event.data.requestId!==requestId||event.data.mode!==context.mode||!isCurrent())return;finish();window.close();if(!window.closed)window.location.assign(context.returnUrl);};
 window.addEventListener('message',receive);const timer=window.setTimeout(fallback,timeoutMs);
 try{opener.postMessage({type:'ACADEMY_CIRCLES_RETURN',requestId,mode:context.mode},context.websiteOrigin);}catch{fallback();}
 return true;
}
if(typeof window!=='undefined'){
 const originals=new Map();let context=null,matchedToken='',generation=0,checking=Promise.resolve();
 window.M4L_CIRCLES_RETURN={ready:()=>checking,modeHref(mode){
  if(!['learn','teach','admin'].includes(mode)||!context||!matchedToken||matchedToken!==localStorage.getItem('m4l_account_token')||!approvedCirclesReturn(JSON.stringify(context)))return null;
  return new URL('/?workspace='+mode,context.websiteOrigin).href;
 }};
 const restore=()=>{document.body.classList.remove('circles-connected-academy');for(const [link,previous]of originals){link.href=previous.href;if(previous.label===null)link.removeAttribute('aria-label');else link.setAttribute('aria-label',previous.label);link.title=previous.title;}originals.clear();};
 const apply=()=>{if(!context)return;document.body.classList.add('circles-connected-academy');for(const link of document.querySelectorAll('[data-page-home],.academy-brand-details>a,.al-header>a:first-child,.pr-brand')){if(!originals.has(link))originals.set(link,{href:link.href,label:link.getAttribute('aria-label'),title:link.title});if(link.href!==context.returnUrl)link.href=context.returnUrl;link.setAttribute('aria-label','Return to your Circles dashboard');link.title='Home · Circles dashboard';}};
 async function connect(){const current=++generation;context=null;matchedToken='';restore();const value=approvedCirclesReturn(sessionStorage.getItem('m4l_circles_return')),token=localStorage.getItem('m4l_account_token');if(!value||!token)return;
  const owner=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))),b=>b.toString(16).padStart(2,'0')).join('');if(current!==generation||token!==localStorage.getItem('m4l_account_token'))return;if(owner!==value.owner){sessionStorage.removeItem('m4l_circles_return');return;}context=value;matchedToken=token;apply();
 }
 const refresh=()=>checking=connect();
 void refresh();window.addEventListener('hashchange',apply);window.addEventListener('m4l-academy-session',()=>void refresh());window.addEventListener('storage',event=>{if(event.key==='m4l_account_token'||event.key===null)void refresh();});
 new MutationObserver(apply).observe(document.body,{attributes:true,attributeFilter:['href'],subtree:true});
 // Keep the native Library and PDF reader in the same tab. A noopener PDF tab
 // would lose this account-bound return context and fall back to Academy Home.
 document.addEventListener('click',event=>{if(!context)return;const link=event.target.closest('a[href]');if(!link)return;const url=new URL(link.href,location.origin);if(url.origin===location.origin&&url.pathname==='/academy/pdf-reader/'){link.removeAttribute('target');link.removeAttribute('rel');}
  if(event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey||event.defaultPrevented||url.href!==context.returnUrl)return;
  const selected=context,owner=matchedToken;
  if(returnToOpenDashboard({window,context:selected,isCurrent:()=>context===selected&&matchedToken===owner&&owner===localStorage.getItem('m4l_account_token')&&Boolean(approvedCirclesReturn(JSON.stringify(selected)))}))event.preventDefault();
 },true);
}
