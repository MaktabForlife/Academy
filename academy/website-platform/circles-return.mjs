// Only a server-issued connector result supplies this tab's Circles return.
// URL parameters never supply a return origin, destination or account owner.
export function approvedCirclesReturn(raw,now=Date.now()){
 try{const c=JSON.parse(raw),url=new URL(c.returnUrl),origin=new URL(c.websiteOrigin);
  if(origin.origin!==c.websiteOrigin||!['https:','http:'].includes(origin.protocol)||origin.protocol==='http:'&&!['localhost','127.0.0.1'].includes(origin.hostname)||url.origin!==origin.origin||url.username||url.password||url.pathname!=='/'||url.hash||!['learn','teach','admin'].includes(c.mode)||url.search!=='?workspace='+c.mode||!Number.isSafeInteger(c.expiresAt)||c.expiresAt<=now||c.expiresAt>now+12*3600_000||!/^[a-f0-9]{64}$/.test(c.owner))return null;
  return c;
 }catch{return null;}
}
if(typeof window!=='undefined'){
 const originals=new Map();let context=null,generation=0;
 const restore=()=>{document.body.classList.remove('circles-connected-academy');for(const [link,previous]of originals){link.href=previous.href;if(previous.label===null)link.removeAttribute('aria-label');else link.setAttribute('aria-label',previous.label);link.title=previous.title;}originals.clear();};
 const apply=()=>{if(!context)return;document.body.classList.add('circles-connected-academy');for(const link of document.querySelectorAll('[data-page-home],.academy-brand-details>a,.al-header>a:first-child,.pr-brand')){if(!originals.has(link))originals.set(link,{href:link.href,label:link.getAttribute('aria-label'),title:link.title});if(link.href!==context.returnUrl)link.href=context.returnUrl;link.setAttribute('aria-label','Return to your Circles dashboard');link.title='Home · Circles dashboard';}};
 async function connect(){const current=++generation;context=null;restore();const value=approvedCirclesReturn(sessionStorage.getItem('m4l_circles_return')),token=localStorage.getItem('m4l_account_token');if(!value||!token)return;
  const owner=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))),b=>b.toString(16).padStart(2,'0')).join('');if(current!==generation||token!==localStorage.getItem('m4l_account_token'))return;if(owner!==value.owner){sessionStorage.removeItem('m4l_circles_return');return;}context=value;apply();
 }
 void connect();window.addEventListener('hashchange',apply);window.addEventListener('m4l-academy-session',()=>void connect());window.addEventListener('storage',event=>{if(event.key==='m4l_account_token'||event.key===null)void connect();});
 new MutationObserver(apply).observe(document.body,{attributes:true,attributeFilter:['href'],subtree:true});
 // Keep the native Library and PDF reader in the same tab. A noopener PDF tab
 // would lose this account-bound return context and fall back to Academy Home.
 document.addEventListener('click',event=>{if(!context)return;const link=event.target.closest('a[href]');if(!link)return;const url=new URL(link.href,location.origin);if(url.origin===location.origin&&url.pathname==='/academy/pdf-reader/'){link.removeAttribute('target');link.removeAttribute('rel');}},true);
}
