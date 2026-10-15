(function(root){
 'use strict';
 const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function href(value,{origin,apiBase}={}){
  if(typeof value!=='string'||/[\\\x00-\x20\x7f]/.test(value)||!/^https?:\/\/|^\/(?!\/)/i.test(value))return '';
  try{
   const location=origin||root.location?.origin||'https://academy.invalid';
   const url=new URL(value,value.startsWith('/api/academy/announcements/')?apiBase||location:location);
   if(url.username||url.password)return '';
   if(url.protocol!=='https:'&&!(url.protocol==='http:'&&url.origin===location&&['localhost','127.0.0.1','[::1]'].includes(url.hostname)))return '';
   return url.href;
  }catch{return '';}
 }
 function render(message,options){
  const text=String(message||'').slice(0,6000),pattern=/\[([^\]\n]{1,200})\]\(([^)\s]+)\)|https?:\/\/[^\s<>]+/gi;
  let html='',start=0;
  for(const match of text.matchAll(pattern)){
   const raw=match[2]||match[0].replace(/[.,;!?:)\]]+$/g,''),label=match[1]||raw,url=href(raw,options);
   html+=escape(text.slice(start,match.index));
   html+=url?'<a href="'+escape(url)+'" target="_blank" rel="noopener noreferrer">'+escape(label)+'</a>'+escape(match[1]?'':match[0].slice(raw.length)):escape(match[0]);
   start=match.index+match[0].length;
  }
  return html+escape(text.slice(start));
 }
 root.M4L_ANNOUNCEMENT_LINKS={href,render};
})(typeof window==='undefined'?globalThis:window);
