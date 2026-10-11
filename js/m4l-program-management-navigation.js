(() => {'use strict';
 const id=new URLSearchParams(location.search).get('program');
 if(!/^PRG-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id||''))return;
 const main=document.querySelector('main');if(!main)return;
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const token=()=>localStorage.getItem('m4l_account_token')||'';
 let header=null,generation=0;
 const suffix='?program='+encodeURIComponent(id);
 const home='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 10 9-7 9 7M5 9v12h5v-7h4v7h5V9"/></svg>',back='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m10 5-7 7 7 7M3 12h18"/></svg>';
 function clear(){generation++;header?.remove();header=null;document.body.classList.remove('pgm-layout');}
 function update(program){if(header&&program.id===id){header.querySelector('[data-program-name]').textContent=program.name;header.querySelector('[data-program-status]').textContent=program.status==='ACTIVE'?'Active':program.status==='ARCHIVED'?'Archived':'Draft';}}
 async function load(){
  clear();const session=token(),pending=generation;if(!session)return;
  try{
   const response=await fetch((window.M4L_CONFIG?.API_BASE||'')+'/api/admin/platform/programs/list',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+session},body:'{}'}),result=await response.json();
   if(pending!==generation||session!==token()||!response.ok||!result.success||result.store!=='D1')return;
   const program=result.programs.find(row=>row.id===id);if(!program)return;
   const tabs=[['timetable','Timetable','/programs/timetable.html'+suffix],['people','People & classes','/programs/manage.html'+suffix+'&tab=profiles'],['library','Library','/programs/media.html'+suffix],['attendance','Attendance','/programs/attendance.html'+suffix],...(result.globalAdmin?[['profiles','User profiles','/users/'+suffix]]:[])];
   const current=location.pathname.startsWith('/users/')?'profiles':location.pathname.includes('manage.html')?'people':location.pathname.includes('attendance.html')?'attendance':/library|media/.test(location.pathname)?'library':'timetable';
   header=document.createElement('header');header.className='pgm-header';
   header.innerHTML=`<div class="pgm-heading"><div><span class="pgm-label">Program management</span><h1 data-program-name>${esc(program.name)}</h1><div class="pgm-identity"><small>${esc(id)}</small><span data-program-status>${esc(program.status==='ACTIVE'?'Active':program.status==='ARCHIVED'?'Archived':'Draft')}</span></div></div><nav class="pgm-icons" aria-label="Page navigation"><a href="/academy/#overview" aria-label="Academy home" title="Academy home">${home}</a><a href="/academy/#activity/PROGRAM/${encodeURIComponent(id)}" aria-label="Return to Program page" title="Return to Program page">${back}</a></nav></div><nav class="pgm-tabs" aria-label="Program management">${tabs.map(([key,label,href])=>`<a href="${esc(href)}"${key===current?' aria-current="page"':''}>${esc(label)}</a>`).join('')}</nav>`;
   main.prepend(header);document.body.classList.add('pgm-layout');
  }catch{/* Existing page/session errors remain visible; no scope is inferred. */}
 }
 window.M4L_PROGRAM_MANAGEMENT_NAV={update};
 window.addEventListener('storage',event=>{if(event.key==='m4l_account_token'||event.key===null)void load();});
 window.addEventListener('m4l-academy-session',()=>void load());
 void load();
})();
