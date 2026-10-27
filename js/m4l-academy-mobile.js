/* Shared account banners and direct role workspaces. */
(() => {
 'use strict';
 const sidebar=document.querySelector('.app > .sidebar, .academy-connected-sidebar');
 if(!sidebar||document.querySelector('.academy-banners'))return;
 const brand=sidebar.querySelector('.brand, .academy-connected-brand');if(!brand)return;
 const banners=document.createElement('div');banners.className='academy-banners';document.body.prepend(banners);banners.append(sidebar);
 const quick=document.getElementById('academy-public-quicklinks')||document.createElement('section');
 if(!quick.id){quick.id='academy-public-quicklinks';quick.className='academy-quicklinks';banners.after(quick);}
 const icons={
  home:'<path d="M3 11 12 3l9 8M5 10v11h5v-7h4v7h5V10"/>',
  timetable:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 10h18m-13 4h2m4 0h2m-8 4h2m4 0h2"/>',
  library:'<path d="M12 6c-3-3-7-3-10-2v15c3-1 7-1 10 2m0-15c3-3 7-3 10-2v15c-3-1-7-1-10 2V6"/>',
  calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 10h18m-9 3v5m-2-3 2-2"/>',
  heart:'<path d="M20.8 5.6a5.4 5.4 0 0 0-7.6 0L12 6.8l-1.2-1.2a5.4 5.4 0 0 0-7.6 7.6L12 22l8.8-8.8a5.4 5.4 0 0 0 0-7.6Z"/>',
  kaaba:'<path d="m3 7 9-4 9 4v13l-9 3-9-3V7Zm0 0 9 4 9-4M12 11v12M3 11l9 4 9-4"/>',
  recorder:'<rect x="8" y="2" width="8" height="13" rx="4"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v4m-4 0h8"/>',
  about:'<circle cx="12" cy="12" r="10"/><path d="M12 10v7m0-11v.1"/>',
  contact:'<rect x="2" y="5" width="20" height="15" rx="2"/><path d="m3 6 9 7 9-7"/>'
 };
 function quickBlocks(nav){
  const heading=document.createElement('h2');heading.textContent='Quick links';quick.prepend(heading);
  for(const item of nav.querySelectorAll('a,button')){
   const label=item.textContent.trim(),href=item.getAttribute('href')||'',kind=item.dataset.nav==='overview'?'home':item.dataset.nav||(/calendar/.test(href)?'calendar':/library/.test(href)?'library':/surahs/.test(href)?'heart':/kaaba/.test(href)?'kaaba':/recorder/.test(href)?'recorder':'about');
   if(document.getElementById('academy-home-card')&&(kind==='home'||kind==='calendar'||kind==='timetable')){item.remove();continue;}
   item.dataset.quickKind=kind;item.replaceChildren();const icon=document.createElement('span');icon.className='quicklink-icon';icon.setAttribute('aria-hidden','true');icon.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'+(icons[kind]||icons.about)+'</svg>';const text=document.createElement('span');text.className='quicklink-label';text.textContent=label;item.append(icon,text);
  }
 }
 quick.hidden=!document.getElementById('academy-home-card');
 const nav=sidebar.querySelector('nav');if(nav){nav.setAttribute('aria-label','Academy quick links');quick.append(nav);quickBlocks(nav);}
 for(const child of [...sidebar.children])if(child!==brand)child.hidden=true;
 if(document.getElementById('academy-home-card')||document.body.classList.contains('pr-body')||document.body.dataset.academyHeaderDates==='true'){const dates=document.createElement('aside');dates.className='academy-date-box';dates.setAttribute('aria-label','Today’s Hijri and Gregorian dates');dates.innerHTML='<div aria-label="Hijri date"><em id="academy-hijri-date" title="Hijri date from Jamiat">Loading Hijri date…</em></div><div aria-label="Gregorian date"><time id="academy-gregorian-date"></time></div>';sidebar.append(dates);}
 // Match Hifz's two-banner layout: identity/date together at the left;
 // page actions join this top banner after the shared account bar is ready.
 const identity=document.createElement('div');identity.className='academy-brand-details';identity.append(brand);
 const dates=sidebar.querySelector('.academy-date-box');if(dates)identity.append(dates);
 sidebar.prepend(identity);
 const strip=document.querySelector('.academy-connected-activities');if(strip)strip.hidden=true;
 document.body.classList.add('academy-mobile-layout','academy-shell');
 let data=window.M4L_ACADEMY_SHELL_DATA||null;
 const pageTitle=document.title||'Umm Abbad Academy',boundary=window.M4L_ACADEMY_WORKSPACE;
 const token=()=>{try{return localStorage.getItem('m4l_account_token')||'';}catch{return '';}};
 const adminRealm=()=>Boolean(boundary?.adminRealm()&&boundary?.adminAccess());
 function canLeave(){return ['M4L_CLASS_NOTES','M4L_ACADEMY_SETTINGS','M4L_PROGRAM_ATTENDANCE','M4L_ACADEMY_PROGRESS','M4L_MEMORISATION_ADMIN','M4L_ACADEMY_ASSESSMENTS','M4L_LESSON_MEDIA','M4L_PLANNING','M4L_ANNOUNCEMENTS','M4L_PDF_READER'].every(key=>window[key]?.canLeave?.()!==false);}
 function openRole(key){const base=key==='admin'||adminRealm()?'/academy/admin/':'/academy/',hash=key==='admin'?'#administration':'#timetable/'+key;if([base,base+'index.html'].includes(location.pathname))location.hash=hash;else if(canLeave())location.href=base+hash;}
 const context=document.createElement('span');context.hidden=true;context.id='academy-workspace-context';context.className='academy-admin-context';context.setAttribute('aria-label','Current Admin workspace');
 const curriculum=document.createElement('dialog');curriculum.className='academy-side-menu';curriculum.id='academy-curriculum-menu';curriculum.setAttribute('aria-label','Curriculum');document.body.append(curriculum);
 const phone=matchMedia('(max-width:767px)'),esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
 let curriculumData=null,curriculumOwner='';
 const curriculumHeading='<div class="side-menu-heading"><h2>Curriculum</h2><button type="button" data-curriculum-close class="academy-close" aria-label="Close Curriculum menu">×</button></div>';
 function renderCurriculum(source=data){
  if(!adminRealm()){if(curriculum.open)curriculum.close();return;}
  const mode=boundary.audience()==='TEACH'?'teach':'learn';
  const rows=(source?.personalActivities||[]).filter(row=>['PROGRAM','COURSE'].includes(row.kind)&&row.id&&(!phone.matches||row.curriculumActive!==false&&row.active!==false&&(![row.stage,row.lifecycle,row.status].filter(Boolean).length||[row.stage,row.lifecycle,row.status].filter(Boolean).every(value=>String(value).toUpperCase()==='ACTIVE'))));
  curriculum.innerHTML=curriculumHeading+[['PROGRAM','Programs'],['COURSE','Courses']].map(([kind,label])=>'<section><h3>'+label+'</h3><nav aria-label="'+label+'">'+rows.filter(row=>row.kind===kind).sort((a,b)=>a.name.localeCompare(b.name,undefined,{sensitivity:'base'})).map(row=>'<a data-workspace-exit href="/academy/admin/#activity/'+kind+'/'+encodeURIComponent(row.id)+'/'+mode+'">'+esc(row.name)+'</a>').join('')+'</nav></section>').join('');
 }
 async function openCurriculum(){
  if(!adminRealm())return;
  const owner=token(),workspace=boundary.current();
  if(curriculumOwner!==owner){curriculumOwner=owner;curriculumData=null;}
  if(Array.isArray(data?.activityPages))curriculumData=data;
  if(curriculumData){renderCurriculum(curriculumData);if(!curriculum.open)curriculum.showModal();return;}
  curriculum.innerHTML=curriculumHeading+'<p role="status">Loading curriculum…</p>';if(!curriculum.open)curriculum.showModal();
  try{
   // Connected tools load only account headers. Fetch the scoped catalogue on demand.
   const response=await fetch((window.M4L_CONFIG?.API_BASE||'')+'/api/academy/entrance',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+owner},body:'{}'}),result=await response.json();
   if(owner!==token()||workspace!==boundary.current()||!adminRealm())return;
   if(!response.ok||!result.success)throw Error(result.error||'Curriculum could not load.');
   curriculumData=result;renderCurriculum(result);
  }catch{if(owner===token()&&adminRealm())curriculum.innerHTML=curriculumHeading+'<p role="status">Curriculum could not load.</p><button type="button" data-curriculum-open>Try again</button>';}
 }
 curriculum.addEventListener('click',event=>{if(event.target===curriculum||event.target.closest('[data-curriculum-close],nav a'))curriculum.close();});
 phone.addEventListener('change',()=>{if(curriculum.open)renderCurriculum(curriculumData||data);});
 function contextBanner(){
  const mode=boundary?.current()||'LEARN',isAdmin=adminRealm();context.hidden=!isAdmin;document.body.dataset.academyWorkspace=isAdmin||!boundary?.adminRealm()?mode:'';document.title=(isAdmin?mode.replace('_','-')+' · ':boundary?.adminRealm()&&!data?.signedIn?'Admin sign-in · ':'')+pageTitle;
  if(!isAdmin){context.replaceChildren();if(curriculum.open)curriculum.close();return;}
  const label=mode.replace('_','-'),description=mode==='ADMIN_LEARN'?'Student class view · read only':mode==='ADMIN_TEACH'?'Teaching within your Admin scope':'Academy management';
  const profile=banners.querySelector('.academy-profile');if(profile&&context.parentElement!==profile)profile.insertBefore(context,profile.querySelector('small'));
  const text='Admin',hint=label+' · '+description;
  context.innerHTML=mode==='ADMIN'?'<span class="academy-admin-badge" title="'+hint+'">'+text+'</span>':'<button type="button" class="academy-admin-badge" data-curriculum-open aria-haspopup="dialog" aria-controls="academy-curriculum-menu" aria-label="'+hint+' · Open Curriculum" title="'+hint+' · Open Curriculum">'+text+' <span aria-hidden="true">⌄</span></button>';
 }
 document.addEventListener('click',event=>{if(event.target.closest?.('[data-workspace-exit],[data-recorder-link]')&&!canLeave())event.preventDefault();});

 function update(next){
  data=next;if(brand.matches?.('a'))brand.href=data?.signedIn?(boundary?.homeUrl?.()||'/academy/#overview'):'/academy/#overview';const signed=Boolean(data?.signedIn),global=Boolean(signed&&data.globalAdmin),roles=signed?[...(data.workspaceRoles||[]),...(data.personalActivities||[]).flatMap(r=>r.roles||[])]:[];
  const staff=r=>r.some(x=>['TEACHER','SENIOR','PROGRAM_ADMIN','ADMIN','GLOBAL_ADMIN'].includes(x)),admin=r=>r.some(x=>['PROGRAM_ADMIN','ADMIN','GLOBAL_ADMIN'].includes(x));
  const pendingAdmin=boundary?.adminRealm()&&!adminRealm(),canAdmin=global||data?.workspaceAccess?.admin||admin(roles),available={learn:signed&&!pendingAdmin&&(canAdmin||data?.workspaceAccess?.learn||roles.length>0),teach:signed&&!pendingAdmin&&(canAdmin||data?.workspaceAccess?.teach||roles.includes('TEACHER')),admin:signed&&!pendingAdmin&&canAdmin};
  const section=location.hash.slice(1).split('/'),path=location.pathname,calendarView=path.startsWith('/academy/calendar/')?(window.M4L_ACADEMY_WORKSPACE?.audience().toLowerCase()||new URLSearchParams(location.search).get('view')):null;
  const management=calendarView!=='learn'&&calendarView!=='teach'&&(['administration','assessment-admin','progress-admin'].includes(section[0])||/^\/(users|programs)(?:\/|$)/.test(path)||/^\/academy\/(subjects|calendar|pdf-tools|courses\/manage|library\/manage|enrolment\/manage)(?:\/|$)/.test(path));
  const home=['/academy/','/academy/index.html'].includes(path)&&(!section[0]||['overview','learning'].includes(section[0]));
  const selected=home?'':boundary?.current()==='ADMIN'?'admin':boundary?.audience()==='TEACH'?'teach':'learn';
  const entrance=['/academy/','/academy/index.html','/academy/admin/','/academy/admin/index.html'].includes(path);
  const reader=/^\/academy\/(?:library|open-library|media|pdf-reader|pdf-compare|calendar|hifz|course-companion)\//.test(path)||path==='/recorder/';
  const learning=signed&&!pendingAdmin&&['LEARN','TEACH'].includes(boundary?.audience())&&!management&&(entrance?/^#(?:timetable|activity|progress|hifz|hifdh|assessments)(?:\/|$)/.test(location.hash):reader);
  document.body.classList.toggle('academy-learning-layout',learning);
  window.M4L_ACADEMY_CONTENTS?.sync();
  for(const button of document.querySelectorAll('[data-shell-role]')){button.hidden=!available[button.dataset.shellRole];const short=button.dataset.shellRole.toUpperCase(),label=(button.dataset.shellRole!=='admin'?(adminRealm()?'ADMIN-':canAdmin?'PERSONAL ':''):'')+short;button.setAttribute('aria-label',label);button.title=label;button.innerHTML='<span class="academy-role-label">'+label+'</span><span class="academy-role-short" aria-hidden="true">'+short+'</span>';button.setAttribute('aria-pressed',String(button.dataset.shellRole===selected));}
  const name=document.getElementById('academy-shell-name'),role=document.getElementById('academy-shell-role');if(name)name.textContent=signed?(data.profile?.name||'Academy member'):'Welcome';if(role)role.textContent=signed&&adminRealm()&&boundary?.current()==='ADMIN_LEARN'?'Admin-Learn · Student view':signed&&adminRealm()&&boundary?.current()==='ADMIN_TEACH'?'Admin-Teach · Teacher':signed&&boundary?.current()==='LEARN'?'Student':signed&&boundary?.current()==='TEACH'?'Teacher':global?'Global Admin':admin(roles)?'Program Admin':staff(roles)?'Teacher':roles.includes('STUDENT')?'Student':signed?'None':'';contextBanner();window.M4L_ACADEMY_ADMIN_MENU?.update(data);
 }
 document.addEventListener('click',event=>{if(event.target.closest('[data-curriculum-open]')){void openCurriculum();return;}const button=event.target.closest('[data-shell-role]');if(button&&!button.hidden){event.preventDefault();openRole(button.dataset.shellRole);}});
 window.addEventListener('m4l-academy-access',()=>update(data));
 if(brand.matches?.('a')){brand.href=token()?boundary?.homeUrl?.()||'/academy/#overview':'/academy/#overview';brand.setAttribute('data-workspace-exit','');brand.removeAttribute('data-nav');}
 window.M4L_ACADEMY_SHELL={update,banners,openRole,canLeave};update(data);
})();
