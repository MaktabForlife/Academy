/* Shared Admin destinations; use verified shell roles without new lookups. */
(() => {
 'use strict';
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const base='/academy/admin/',token=()=>localStorage.getItem('m4l_account_token')||'';
 let host=null,currentData=null,job=null;
 function rows(data){
  if(!data?.signedIn)return [];
  const global=Boolean(data.globalAdmin),areas=(data.personalActivities||data.activities||[]).filter(a=>global||(a.roles||[]).some(r=>['PROGRAM_ADMIN','ADMIN'].includes(r))),first=areas[0];
  if(!global&&!data.workspaceAccess?.admin&&!areas.length&&!data.workspaceRoles?.some(r=>['PROGRAM_ADMIN','ADMIN'].includes(r)))return [];
  const curriculum=global?'/academy/subjects/':areas.some(a=>a.kind==='PROGRAM')?'/programs/':'/academy/courses/manage/';
  const assessment=global?'#assessment-admin':first?`#assessment-admin/${first.kind}/${encodeURIComponent(first.id)}`:'#assessment-admin';
  return [{id:'users',label:'Users',href:global?'/users/':base+'#administration/users'},{id:'access',label:'Access',href:base+'#administration/access'},...(global?[{id:'announcements',label:'Announcements',href:base+'#administration/announcements'}]:[]),{id:'attendance',label:'Attendance',href:base+'#administration/attendance'},{id:'curriculum',label:'Curriculum',href:curriculum},{id:'library',label:'Library',href:global?'/academy/library/manage/':'/academy/library/'},{id:'websites',label:'Course websites',href:'/academy/course-websites/'},{id:'planning',label:'Lesson plans',href:base+'#administration/planning'},{id:'assessments',label:'Assessments',href:base+assessment},...(global?[{id:'settings',label:'App settings',href:base+'#administration/settings'},{id:'refresh',label:'Update timetable',action:'refresh'}]:[])];
 }
 function active(){const path=location.pathname,hash=location.hash;
  if(path.startsWith('/academy/course-websites/'))return 'websites';
  if(path.startsWith('/users/')||path.startsWith('/academy/enrolment/manage/'))return 'users';
  if(path.startsWith('/programs/')||/\/academy\/(?:subjects|courses\/manage)\//.test(path)||hash.includes('/curriculum'))return 'curriculum';
  if(/\/academy\/(?:library\/manage|pdf-tools)\//.test(path))return 'library';
  if(hash.startsWith('#assessment-admin'))return 'assessments';
  return hash.split('/')[1]||'';
 }
 function curriculumRows(data){
  const areas=(data.personalActivities||data.activities||[]).filter(a=>(a.roles||[]).some(r=>['PROGRAM_ADMIN','ADMIN'].includes(r))),global=Boolean(data.globalAdmin);
  const subjects=location.pathname.startsWith('/academy/subjects/'),modules=new URLSearchParams(location.search||'').get('section')==='modules';
  return [...(global?[{id:'subjects',href:'/academy/subjects/',label:'Subjects',selected:subjects&&!modules},{id:'modules',href:'/academy/subjects/?section=modules',label:'Modules',selected:subjects&&modules}]:[]),...(global||areas.some(a=>a.kind==='PROGRAM')?[{id:'programs',href:'/programs/',label:'Programs',selected:location.pathname.startsWith('/programs/')}]:[]),...(global||areas.some(a=>a.kind==='COURSE')?[{id:'courses',href:'/academy/courses/manage/',label:'Courses',selected:location.pathname.startsWith('/academy/courses/manage/')}]:[])];
 }
 const curriculumLinks=rows=>rows.map(row=>`<a href="${esc(row.href)}" data-curriculum-area="${row.id}"${row.selected?' aria-current="page"':''}>${esc(row.label)}</a>`).join('');
 function placeCurriculumTabs(data,visible){
  const catalogue=document.querySelector('#lc-workspace .lc-tabs'),local=document.querySelector('main > .academy-curriculum-local');
  if(!visible||active()!=='curriculum'){catalogue?.querySelectorAll('[data-curriculum-area]').forEach(link=>link.remove());local?.remove();return false;}
  const choices=curriculumRows(data);
  if(catalogue){
   // Preserve the native Subjects/Modules buttons and their draft guards.
   catalogue.querySelectorAll('[data-curriculum-area]').forEach(link=>link.remove());
   catalogue.insertAdjacentHTML('beforeend',curriculumLinks(choices.filter(row=>['programs','courses'].includes(row.id))));local?.remove();return true;
  }
  const heading=document.querySelector('#program-builder > .pb-heading, .cm-main > .cm-page-heading');
  if(!heading)return false;
  const nav=local||document.createElement('nav');nav.className='academy-curriculum-local';nav.setAttribute('aria-label','Curriculum sections');nav.innerHTML=curriculumLinks(choices);if(!local)heading.after(nav);return true;
 }
 const dashboard=()=>location.pathname.startsWith('/academy/')&&(!location.hash||['#overview','#dashboard','#administration'].includes(location.hash)||/^#timetable(?:\/(?:learn|teach))?$/.test(location.hash));
 function markup(data,selected=active()){return rows(data).filter(row=>row.id!=='attendance'||!dashboard()).map(row=>row.action?'<button type="button" data-admin-public-refresh data-admin-key="refresh">Update timetable</button>':`<a href="${esc(row.href)}" data-admin-key="${row.id}"${row.id===selected?' aria-current="page"':''}>${row.label}</a>`).join('');}
 function update(data=currentData){
  currentData=data;const visible=window.M4L_ACADEMY_WORKSPACE?.current()==='ADMIN'&&location.hash!=='#dashboard'&&rows(data).length>0;
  if(!host&&visible){host=document.createElement('section');host.className='academy-admin-tools';host.innerHTML='<nav class="academy-admin-links" aria-label="Admin tools"></nav><nav class="academy-admin-links academy-curriculum-tabs" aria-label="Curriculum areas" hidden></nav><p data-admin-refresh-status role="status" aria-live="polite" hidden></p>';document.querySelector('.academy-banners')?.after(host);}
  const localCurriculum=placeCurriculumTabs(data,visible);
  if(!host)return;host.hidden=!visible;if(visible){host.querySelector('nav').innerHTML=markup(data);const tabs=host.querySelector('.academy-curriculum-tabs');tabs.hidden=active()!=='curriculum'||localCurriculum;tabs.innerHTML=tabs.hidden?'':curriculumLinks(curriculumRows(data));}
 }
 async function refresh(button){
  if(button.disabled)return;const session=token(),status=host?.querySelector('[data-admin-refresh-status]');button.disabled=true;
  if(status){status.hidden=false;status.textContent='Refreshing the public timetable…';}
  try{
   if(!job||job.session!==session){const pending={session};pending.promise=(async()=>{const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);try{const response=await fetch((window.M4L_CONFIG?.API_BASE||'')+'/api/admin/platform/public-timetable/refresh',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+session},body:'{}',signal:controller.signal}),result=await response.json();if(!response.ok||!result.success)throw Error(result.error||'The public timetable could not be refreshed.');return result;}finally{clearTimeout(timer);}})().finally(()=>{if(job===pending)job=null;});job=pending;}
   await job.promise;if(session!==token()||window.M4L_ACADEMY_WORKSPACE?.current()!=='ADMIN')return;
   window.M4L_ACADEMY_READ_CACHE?.invalidate();window.dispatchEvent(new Event('m4l-academy-public-timetable-updated'));
   if(status)status.textContent='Public timetable refreshed. Visitors will see the update within one minute.';
  }catch(error){if(session===token()&&status)status.textContent=error.message;}
  finally{button.disabled=false;}
 }
 document.addEventListener('click',event=>{const button=event.target.closest?.('[data-admin-public-refresh]');if(button){event.preventDefault();void refresh(button);}});
 window.addEventListener('hashchange',()=>update());
 window.addEventListener('m4l-academy-session-ended',()=>{currentData=null;if(host)host.hidden=true;placeCurriculumTabs(null,false);});
 window.addEventListener('storage',event=>{if(event.key==='m4l_account_token'||event.key===null){currentData=null;if(host)host.hidden=true;placeCurriculumTabs(null,false);}});
 window.M4L_ACADEMY_ADMIN_MENU={rows,markup,update};
})();
