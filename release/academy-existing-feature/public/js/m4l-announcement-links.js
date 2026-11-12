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
   const raw=match[2]||match[0].replace(/[.,;!?:)\]]+$/g,''),label=match[1]||raw,url=readerHref(raw,{...options,title:label});
   html+=escape(text.slice(start,match.index));
   html+=url?'<a href="'+escape(url)+'" target="_blank" rel="noopener noreferrer">'+escape(label)+'</a>'+escape(match[1]?'':match[0].slice(raw.length)):escape(match[0]);
   start=match.index+match[0].length;
  }
  return html+escape(text.slice(start));
 }
 function readerHref(value,options={}){
  const safe=href(value,options);if(!safe)return '';
  const origin=options.origin||root.location?.origin||'https://academy.invalid',url=new URL(safe),api=new URL(options.apiBase||origin),params=new URLSearchParams();
  if(url.origin===api.origin&&url.pathname==='/api/academy/announcements/pdf'&&/^[A-Za-z0-9_-]{1,100}$/.test(url.searchParams.get('id')||''))params.set('announcement',url.searchParams.get('id'));
  else if(url.origin===origin&&/^\/academy\/(?:[A-Za-z0-9_.-]+\/)*[A-Za-z0-9_.-]+\.pdf$/i.test(url.pathname)&&!url.search&&!url.hash)params.set('document',url.pathname);
  else return safe;
  params.set('title',String(options.title||'Academy PDF').slice(0,240));
  return new URL('/academy/pdf-reader/?'+params,origin).href;
 }
 root.M4L_ANNOUNCEMENT_LINKS={href,readerHref,render};
})(typeof window==='undefined'?globalThis:window);
