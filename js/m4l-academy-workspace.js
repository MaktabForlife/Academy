(() => {
 'use strict';
 const adminPage=()=>/^\/(?:users(?:\/|$)|programs(?:\/(?:$|index\.html|manage\.html|timetable\.html|lesson-media\.html|library\.html))|academy\/(?:admin|subjects|courses\/manage|enrolment\/manage|library\/manage|pdf-tools)(?:\/|$))/.test(location.pathname);
 function desired(){
  if(location.pathname.startsWith('/academy/admin/')){
   if(/^#timetable\/(learn|teach)$/.test(location.hash))return location.hash.split('/')[1].toUpperCase();
   return 'ADMIN';
  }
  if(adminPage())return 'ADMIN';
  const explicit=location.hash.match(/^#(?:timetable\/(learn|teach)|activity\/[^/]+\/[^/]+\/(learn|teach)(?:\/|$))/);
  if(explicit)return (explicit[1]||explicit[2]).toUpperCase();
  if(/^#(?:administration|assessment-admin|progress-admin)(?:\/|$)/.test(location.hash))return 'ADMIN';
  const query=new URLSearchParams(location.search),mode=(query.get('workspace')||query.get('view')||'').toUpperCase();
  if(['LEARN','TEACH','ADMIN'].includes(mode))return mode;
  if(location.pathname==='/programs/attendance.html'||location.pathname.startsWith('/academy/teaching/'))return 'TEACH';
  return 'LEARN';
 }
 let selected=desired(),generation=0;
 const session=()=>{try{return localStorage.getItem('m4l_account_token')||'';}catch{return '';}};
 const current=()=>selected;
 function commit(){const next=desired();if(next===selected)return false;selected=next;generation++;return true;}
 function canonical(){
  const adminHost=location.pathname.startsWith('/academy/admin/');
  if(!adminHost&&/^#(?:administration|assessment-admin|progress-admin)(?:\/|$)/.test(location.hash))return '/academy/admin/'+location.hash;
  if(adminHost&&selected!=='ADMIN')return '/academy/'+location.hash;
  return '';
 }
 const original=window.fetch.bind(window);
 window.fetch=async(resource,options)=>{
  const url=new URL(typeof resource==='string'||resource instanceof URL?resource:resource.url,location.href);
  const api=new URL(window.M4L_CONFIG?.API_BASE||location.origin,location.href);
  if(url.origin!==api.origin||!url.pathname.startsWith('/api/'))return original(resource,options);
  const captured={selected,generation,session:session()},headers=new Headers(options?.headers||(resource instanceof Request?resource.headers:undefined));
  headers.set('X-Academy-Workspace',selected);
  const response=await original(resource,{...options,headers});
  const check=()=>{if(captured.generation!==generation||captured.selected!==selected||captured.session!==session())throw new DOMException('The Academy workspace or account changed.','AbortError');};
  check();
  // Preserve streamed file delivery. Reject a delayed parsed response before it
  // can populate another account/workspace or create a stale PDF object URL.
  return new Proxy(response,{get(target,name){if(['json','text','blob','arrayBuffer','formData'].includes(name))return async(...args)=>{check();const value=await target[name](...args);check();return value;};const value=Reflect.get(target,name,target);return typeof value==='function'?value.bind(target):value;}});
 };
 window.M4L_ACADEMY_WORKSPACE={current,desired,commit,canonical};
 window.addEventListener('m4l-academy-session',()=>{generation++;});
 // Reader tools carry their invoking perspective across tabs and back links.
 document.addEventListener('click',event=>{const link=event.target.closest?.('a[href]');if(!link)return;const url=new URL(link.href,location.href);if(url.origin!==location.origin)return;if(/^\/academy\/(?:calendar|library|pdf-reader|pdf-compare)\//.test(url.pathname)&&!url.pathname.includes('/manage/')){url.searchParams.set('workspace',selected);link.href=url.href;}},true);
 if(location.pathname.startsWith('/academy/admin/')&&!location.hash)history.replaceState(null,'','#administration');
})();
