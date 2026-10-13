(() => {'use strict';
 let id=new URLSearchParams(location.search).get('program');
 const valid=value=>/^PRG-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value||'');
 const main=document.querySelector('main');if(!main)return;
 const page=location.pathname.replace(/\/+$/,'').replace(/\.html$/,'');
 const listPage=page==='/programs'||page==='/programs/index',unified=listPage||['/programs/timetable','/programs/manage','/programs/lesson-media'].includes(page);
 if(page==='/users'||page==='/users/index')return;
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const token=()=>localStorage.getItem('m4l_account_token')||'';
 let header=null,generation=0,programs=null,owner='';
 const home='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 10 9-7 9 7M5 9v12h5v-7h4v7h5V9"/></svg>';
 function clear(){generation++;header?.remove();header=null;document.body.classList.remove('pgm-layout');}
 function update(program){if(header&&program.id===id){header.querySelector('[data-program-name]').textContent=program.name;const status=header.querySelector('[data-program-status]');if(status)status.textContent=program.status==='ACTIVE'?'Active':program.status==='ARCHIVED'?'Archived':'Draft';}}
 function workspace(program,current,available=true){
  const suffix=program?'?program='+encodeURIComponent(program.id):'';
  const tabs=[['list','Program List','/programs/'+suffix],['timetable','Timetable','/programs/timetable.html'+suffix],['people','People','/programs/manage.html'+suffix+'&tab=profiles'],['lesson-media','Lesson media','/programs/lesson-media.html'+suffix]];
  header=document.createElement('header');header.className='pgm-header pgm-unified';
  header.innerHTML=`<div class="pgm-heading"><h1>Manage Programs</h1></div><nav class="pgm-tabs" aria-label="Program management">${tabs.map(([key,label,href])=>`<a${key==='list'||available?` href="${esc(href)}"`:' aria-disabled="true" tabindex="-1" title="Select a saved Program and save your changes first"'}${key===current?' aria-current="page"':''}>${label}</a>`).join('')}</nav>${program?`<p class="pgm-context" data-program-name>${esc(program.name)}</p>`:''}`;
  main.prepend(header);document.body.classList.add('pgm-layout');
 }
 function setSelection(selection){if(!listPage)return;clear();if(!selection?.ready)return;id=selection.program?.id||'';workspace(selection.program,'list',Boolean(selection.available&&valid(id)));}
 async function load(){
  if(listPage){setSelection(window.M4L_PROGRAM_BUILDER_NAV?.selection());return;}
  clear();const session=token(),pending=generation;if(!session||!valid(id))return;
  try{
   if(owner!==session||!programs){
    const response=await fetch((window.M4L_CONFIG?.API_BASE||'')+'/api/admin/platform/programs/list',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+session},body:'{}'}),result=await response.json();
    if(pending!==generation||session!==token()||!response.ok||!result.success||result.store!=='D1')return;
    programs=result.programs;owner=session;
   }
   const program=programs.find(row=>row.id===id);if(!program)return;
   if(unified){workspace(program,page==='/programs/timetable'?'timetable':page==='/programs/lesson-media'?'lesson-media':'people');return;}
   const suffix='?program='+encodeURIComponent(id);
   const tabs=[['timetable','Timetable','/programs/timetable.html'+suffix],['people','People','/programs/manage.html'+suffix+'&tab=profiles'],['library','Library','/programs/media.html'+suffix],['attendance','Attendance','/academy/#activity/PROGRAM/'+encodeURIComponent(id)+'/attendance']];
   const current=({'/programs/timetable':'timetable','/programs/manage':'people','/programs/media':'library','/programs/library':'library','/programs/library-view':'library','/programs/attendance':'attendance'})[page];
   header=document.createElement('header');header.className='pgm-header';
   header.innerHTML=`<div class="pgm-heading"><div><span class="pgm-label">Program management</span><h1 data-program-name>${esc(program.name)}</h1><div class="pgm-identity"><small>${esc(id)}</small><span data-program-status>${esc(program.status==='ACTIVE'?'Active':program.status==='ARCHIVED'?'Archived':'Draft')}</span></div></div><nav class="pgm-icons" aria-label="Page navigation"><a href="/academy/#overview" aria-label="Academy home" title="Academy home">${home}</a><a class="pgm-back" href="/programs/${suffix}">Back to Program management</a></nav></div><nav class="pgm-tabs" aria-label="Program management">${tabs.map(([key,label,href])=>`<a href="${esc(href)}"${key===current?' aria-current="page"':''}>${esc(label)}</a>`).join('')}</nav>`;
   main.prepend(header);document.body.classList.add('pgm-layout');
  }catch{/* Existing page/session errors remain visible; no scope is inferred. */}
 }
 function select(value){if(value===id)return;id=value;void load();}
 function refresh(){programs=null;owner='';void load();}
 window.M4L_PROGRAM_MANAGEMENT_NAV={update,select,setSelection};
 window.addEventListener('storage',event=>{if(event.key==='m4l_account_token'||event.key===null)refresh();});
 window.addEventListener('m4l-academy-session',refresh);
 window.addEventListener('pageshow',event=>{if(event.persisted)refresh();});
 void load();
})();
