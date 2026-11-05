// The connector stores this tab's server-issued destination after its one-use
// exchange. Arbitrary websiteReturn query strings are deliberately ignored.
export function approvedReturn(raw,now=Date.now()){
 try{const c=JSON.parse(raw),url=new URL(c.returnUrl),origin=new URL(c.websiteOrigin);if(origin.origin!==c.websiteOrigin||url.origin!==origin.origin||url.pathname!=='/'||url.hash||url.username||url.password||!Number.isSafeInteger(c.expiresAt)||c.expiresAt<=now||c.expiresAt>now+8*3600_000||!/^[-A-Za-z0-9_:]{1,180}$/.test(c.websiteId)||url.searchParams.getAll('website').length!==1||url.searchParams.getAll('lesson').length>1||url.searchParams.get('website')!==c.websiteId||c.lessonId&&(!/^[-A-Za-z0-9_:]{1,180}$/.test(c.lessonId)||url.searchParams.get('lesson')!==c.lessonId)||[...url.searchParams.keys()].some(k=>!['website','lesson'].includes(k)))return null;return c;}catch{return null;}
}
if(typeof window!=='undefined'){
 const context=approvedReturn(sessionStorage.getItem('m4l_website_library_return'));
 if(context){
  const back=document.createElement('a');back.href=context.returnUrl;back.textContent='← Back to website';back.id='website-library-return';const navigation=document.createElement('nav');navigation.className='website-library-navigation';navigation.setAttribute('aria-label','Website return');navigation.append(back);document.querySelector('.al-main,main')?.prepend(navigation);
  back.onclick=event=>{if(window.opener&&!window.opener.closed){
   event.preventDefault();let timer;const received=message=>{if(message.source!==window.opener||message.origin!==context.websiteOrigin||message.data?.type!=='WEBSITE_LIBRARY_RETURNED')return;clearTimeout(timer);window.removeEventListener('message',received);window.close();};
   window.addEventListener('message',received);timer=setTimeout(()=>{window.removeEventListener('message',received);location.assign(context.returnUrl);},5000);
   window.opener.postMessage({type:'ACADEMY_WEBSITE_RETURN'},context.websiteOrigin);window.opener.focus();
  }};
  // Keep this Library tab and its return context together. The PDF reader's
  // existing Close reader goes back to Library; it never closes the website.
  document.addEventListener('click',event=>{const link=event.target.closest('a[href]');if(!link)return;const url=new URL(link.href,location.origin);if(url.origin===location.origin&&url.pathname==='/academy/pdf-reader/'){link.removeAttribute('target');link.removeAttribute('rel');}},true);
 }
}
