/* Program management uses one document; existing tools mount only when opened. */
(() => {'use strict';
 const $=id=>document.getElementById(id),host=$('program-workspace');if(!$('pg-tabs'))return;
 const sections=[['list','List of programs'],['details','Details'],['curriculum','Curriculum'],['classes','Classes'],['participants','Participants'],['public-card','Public card'],['timetable','Timetable'],['review','Review & publish'],['media','Lesson media'],['enrolment','Enrolment requests']];
 const group=tab=>['curriculum','classes','public-card','timetable','review'].includes(tab)?'timetable':tab==='participants'?'people':tab==='media'?'media':'';
 const definitions={timetable:{page:'/programs/timetable.html',root:'timetable',scripts:['/js/vendor/pdf-lib-1.17.1.min.js','/js/m4l-time.js?v=106.9','/js/m4l-timetable-presentation.js?v=106.82','/js/m4l-timetable-blocks.js?v=106.82','/js/m4l-timetable-sync.js?v=105.3.4.4','/js/m4l-timetable-periods.js?v=107.11','/js/m4l-timetable-planner.js?v=107.11','/js/m4l-tafseer-cards.js?v=107.116','/js/m4l-website-card-table.js?v=107.116','/js/m4l-program-workspace.js?v=107.116','/js/m4l-program-timetable.js?v=107.16']},people:{page:'/programs/manage.html',root:'pm-main',scripts:['/js/m4l-program-overview.js?v=105.3.3.4','/js/m4l-time.js?v=106.9','/js/m4l-teacher-availability-dialog.js?v=106.82','/js/m4l-program-management.js?v=107.116']},media:{page:'/programs/lesson-media.html',root:'program-lesson-media-main',scripts:['/js/m4l-lesson-media-cache.js?v=107.69','/js/m4l-library-cache.js?v=107.116','/js/m4l-lesson-pdf-library.js?v=107.116','/js/m4l-lesson-media.js?v=107.116','/js/m4l-program-surahs.js?v=107.116','/js/m4l-program-lesson-media.js?v=107.116']}};
 const pending=new Map(),loaded=new Set(),scripts=new Map();let selected=null,available=false,current=new URLSearchParams(location.search).get('tab')||'list',revision='',owner=localStorage.getItem('m4l_account_token')||'',generation=0;
 if(!sections.some(([id])=>id===current))current='list';
 $('pg-tabs').innerHTML=sections.map(([id,label])=>`<button type="button" id="pg-tab-${id}" role="tab" data-pg-tab="${id}" aria-controls="${id==='list'?'pg-list':id==='details'?'program-detail':id==='enrolment'?'pg-enrolment-tool':'pg-'+group(id)+'-tool'}" aria-selected="false" tabindex="-1" ${id==='list'?'':'disabled'}>${label}</button>`).join('');
 function view(){
  host.dataset.tab=current;
  for(const [id]of sections){const button=$('pg-tab-'+id);button.disabled=id!=='list'&&(!selected||id!=='details'&&!available);button.setAttribute('aria-selected',String(id===current));button.tabIndex=id===current?0:-1;}
  $('pg-list').hidden=current!=='list';$('program-detail').hidden=current!=='details'||!selected;
  $('pg-context').hidden=current==='list'||!selected;$('pg-empty').hidden=current!=='list'||Boolean(selected);
  $('pg-enrolment-tool').hidden=current!=='enrolment'||!selected||!available;
  $('program-refresh').hidden=!['list','details'].includes(current);
  for(const id of Object.keys(definitions))$('pg-'+id+'-tool').hidden=group(current)!==id;
  $('pg-timetable-tool').setAttribute('aria-labelledby','pg-tab-'+current);
  if($('pw-card-editor'))$('pw-card-editor').open=true;revealTab();
 }
 function revealTab(){const strip=$('pg-tabs'),active=$('pg-tab-'+current);if(active?.offsetLeft<strip.scrollLeft)strip.scrollLeft=active.offsetLeft;else if(active?.offsetLeft+active?.offsetWidth>strip.scrollLeft+strip.clientWidth)strip.scrollLeft=active.offsetLeft+active.offsetWidth-strip.clientWidth;}
 window.addEventListener('resize',revealTab);
 async function script(src){
  const key=src.split('?')[0];if([...document.scripts].some(node=>node.src&&new URL(node.src).pathname===key))return;
  if(!scripts.has(key))scripts.set(key,new Promise((resolve,reject)=>{const node=document.createElement('script');node.src=src;node.onload=resolve;node.onerror=()=>{scripts.delete(key);node.remove();reject(Error('This Program tool could not load. Try again.'));};document.body.append(node);}));
  await scripts.get(key);
 }
 async function mount(name){
  if(loaded.has(name))return;if(pending.has(name))return pending.get(name);
  const version=generation,account=owner,definition=definitions[name];
  const promise=(async()=>{
   const response=await fetch(definition.page,{cache:'no-cache'});if(!response.ok)throw Error('This Program tool is unavailable. Try again.');
   const doc=new DOMParser().parseFromString(await response.text(),'text/html'),source=doc.getElementById(definition.root);if(!source)throw Error('This Program tool is unavailable.');
   if(version!==generation||account!==localStorage.getItem('m4l_account_token'))return;
   for(const link of doc.querySelectorAll('link[rel=stylesheet]')){const path=new URL(link.getAttribute('href'),location.origin).pathname;if(!/^\/css\/m4l-(?:program-(?:timetable|workspace|management|monthly-subscriptions)|timetable-blocks|teacher-availability-dialog|lesson-media|program-zoom-help)\.css$/.test(path))continue;if(![...document.querySelectorAll('link[rel=stylesheet]')].some(node=>new URL(node.href).pathname===path))document.head.append(link.cloneNode());}
   const panel=$('pg-'+name+'-tool');if(!panel.firstElementChild){const root=document.createElement('section');root.id=source.id;root.className=source.className;root.innerHTML=source.innerHTML;panel.append(root);}
   for(const aside of doc.body.querySelectorAll(':scope > aside[id]'))if(!$(aside.id))document.body.append(aside.cloneNode(true));
   if(name==='timetable'){$('pw-card-editor').open=true;$('tt-select-program').hidden=true;}
   for(const src of definition.scripts){if(version!==generation||account!==localStorage.getItem('m4l_account_token'))return;await script(src);}
   loaded.add(name);
  })().finally(()=>pending.delete(name));pending.set(name,promise);await promise;
 }
 async function show(tab,{historyMode='replace'}={}){
  if(window.M4L_PROGRAM_MONTHLY?.canLeave()===false||window.M4L_PROGRAM_SURAHS?.canLeave()===false)return;
  if(!sections.some(([id])=>id===tab)||tab!=='list'&&(!selected||tab!=='details'&&!available))return;
  if(!window.M4L_ENROLMENT_WORKSPACE.canLeave($('pg-enrolment-tool'))){$('pg-tool-message').textContent='Finish or retry the enrolment request change before leaving this tab.';$('pg-tool-message').hidden=false;return;}
  if(current==='media'&&tab!=='media'&&window.M4L_LESSON_MEDIA?.canLeave?.()===false)return;
  current=tab;view();$('pg-tool-message').hidden=true;$('pg-tool-retry').hidden=true;
  const url=new URL(location.href);url.searchParams.set('tab',tab);if(selected){url.searchParams.set('program',selected.id);if(selected.revision)url.searchParams.delete('new');}history[historyMode==='push'?'pushState':'replaceState']({},'',url);
  if(tab==='details')window.M4L_PROGRAM_BUILDER_NAV?.showDetails();
  if(tab==='enrolment'){try{await window.M4L_ENROLMENT_WORKSPACE.open($('pg-enrolment-tool'),'PROGRAM:'+selected.id);}catch(error){if(current===tab){$('pg-tool-message').textContent=error.message;$('pg-tool-message').hidden=false;$('pg-tool-retry').hidden=false;}}return;}
  const name=group(tab);if(!name)return;
  $('pg-tool-message').textContent='Loading '+sections.find(([id])=>id===tab)[1]+'…';$('pg-tool-message').hidden=false;
  try{await mount(name);if(name==='media')window.M4L_PROGRAM_LESSON_MEDIA?.select(selected.id);if(name==='people')await window.M4L_PROGRAM_MONTHLY?.select(selected.id);if(current===tab){$('pg-tool-message').hidden=true;view();}}
  catch(error){if(current===tab){$('pg-tool-message').textContent=error.message;$('pg-tool-retry').hidden=false;}}
 }
 function setSelection(selection){
  if(!selection?.ready)return;
  if(selected?.id!==selection.program?.id&&(window.M4L_PROGRAM_MONTHLY?.canLeave()===false||window.M4L_PROGRAM_SURAHS?.canLeave()===false))return;
  const previous=selected?.id;selected=selection.program;available=selection.available;
  if(selected){$('pg-program-name').textContent=selected.name||'New Program';$('pg-program-status').textContent=selected.status+(available?' · Saved':' · Save details before opening other sections');
   if(!selected.revision&&previous!==selected.id)current='details';
   if(selected.revision&&new URLSearchParams(location.search).has('new')){const url=new URL(location.href);url.searchParams.delete('new');url.searchParams.set('program',selected.id);history.replaceState({},'',url);}
   if(selected.revision&&selected.revision!==revision){revision=selected.revision;window.M4L_PROGRAM_TIMETABLE?.updateProgram?.(selected);}
  }else current='list';view();if(selected&&loaded.has('people'))void window.M4L_PROGRAM_MONTHLY?.select(selected.id);
  if(selected&&available&&current==='enrolment')void show(current);
  if(selected&&available&&group(current)&&!loaded.has(group(current)))void show(current);
 }
 $('pg-tabs').onclick=event=>{const tab=event.target.closest('[data-pg-tab]');if(tab&&!tab.disabled)void show(tab.dataset.pgTab,{historyMode:'push'});};
 $('pg-tabs').onkeydown=event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;const tabs=[...$('pg-tabs').querySelectorAll('button:not(:disabled)')],index=tabs.indexOf(event.target);if(index<0)return;event.preventDefault();tabs[event.key==='Home'?0:event.key==='End'?tabs.length-1:(index+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length].focus();};
 $('pg-tool-retry').onclick=()=>void show(current);
 window.addEventListener('popstate',()=>void show(new URLSearchParams(location.search).get('tab')||'list'));
 const sessionChanged=()=>{const next=localStorage.getItem('m4l_account_token')||'';if(next===owner)return;generation++;host.hidden=true;location.reload();};
 window.addEventListener('storage',event=>{if(event.key==='m4l_account_token'||event.key===null)sessionChanged();});window.addEventListener('m4l-academy-session',sessionChanged);window.addEventListener('m4l-academy-session-ended',sessionChanged);
 window.M4L_PROGRAM_ADMIN={tab:()=>current,openTab:tab=>show(tab),hasMounted:()=>loaded.size>0||pending.size>0};
 window.M4L_PROGRAM_MANAGEMENT_NAV={setSelection,update:program=>window.M4L_PROGRAM_BUILDER_NAV?.update(program)};
 view();
})();
