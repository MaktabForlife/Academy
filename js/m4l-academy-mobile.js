/* Shared account banners and direct role workspaces. */
(() => {
 'use strict';
 const sidebar=document.querySelector('.app > .sidebar, .academy-connected-sidebar');
 if(!sidebar||document.querySelector('.academy-banners'))return;
 const brand=sidebar.querySelector('.brand, .academy-connected-brand');if(!brand)return;
 const banners=document.createElement('div');banners.className='academy-banners';document.body.prepend(banners);banners.append(sidebar);
 const quick=document.getElementById('academy-public-quicklinks')||document.createElement('section');
 if(!quick.id){quick.id='academy-public-quicklinks';quick.className='academy-quicklinks';banners.after(quick);}
 const nav=sidebar.querySelector('nav');if(nav){nav.setAttribute('aria-label','Academy quick links');quick.append(nav);}
 for(const child of [...sidebar.children])if(child!==brand)child.hidden=true;
 if(document.getElementById('academy-home-card')){const dates=document.createElement('aside');dates.className='academy-date-box';dates.setAttribute('aria-label','Today at the Academy');dates.innerHTML='<div><span>Hijri</span><a id="academy-hijri-date" href="https://jamiat.org.za/" target="_blank" rel="noopener noreferrer">View on Jamiat ↗</a></div><div><span>Gregorian</span><time id="academy-gregorian-date"></time></div>';sidebar.append(dates);}
 const strip=document.querySelector('.academy-connected-activities');if(strip)strip.hidden=true;
 document.body.classList.add('academy-mobile-layout','academy-shell');
 let data=window.M4L_ACADEMY_SHELL_DATA||null;
 function openRole(key){const hash=key==='admin'?'#administration':'#timetable/'+key;if(location.pathname==='/academy/'||location.pathname==='/academy/index.html')location.hash=hash;else location.href='/academy/'+hash;}
 function update(next){
  data=next;const signed=Boolean(data?.signedIn),global=Boolean(signed&&data.globalAdmin),roles=(signed?data.personalActivities||[]:[]).flatMap(r=>r.roles||[]);
  const staff=r=>r.some(x=>['TEACHER','SENIOR','PROGRAM_ADMIN','ADMIN','GLOBAL_ADMIN'].includes(x)),admin=r=>r.some(x=>['PROGRAM_ADMIN','ADMIN','GLOBAL_ADMIN'].includes(x));
  const available={learn:signed&&(global||roles.length>0),teach:signed&&(global||staff(roles)),admin:signed&&(global||admin(roles))};
  const section=location.hash.slice(1).split('/'),path=location.pathname,calendarView=path.startsWith('/academy/calendar/')?new URLSearchParams(location.search).get('view'):null;
  const management=calendarView!=='learn'&&calendarView!=='teach'&&(['administration','assessment-admin','progress-admin'].includes(section[0])||/^\/(users|programs)(?:\/|$)/.test(path)||/^\/academy\/(subjects|calendar|pdf-tools|courses\/manage|library\/manage)(?:\/|$)/.test(path));
  const selected=section[0]==='timetable'&&section[1]==='teach'||calendarView==='teach'||path.startsWith('/academy/teaching/')?'teach':management?'admin':'learn';
  for(const button of document.querySelectorAll('[data-shell-role]')){button.hidden=!available[button.dataset.shellRole];button.setAttribute('aria-pressed',String(button.dataset.shellRole===selected));}
  const name=document.getElementById('academy-shell-name'),role=document.getElementById('academy-shell-role');if(name)name.textContent=signed?(data.profile?.name||'Academy member'):'Welcome';if(role)role.textContent=global?'Global Admin':admin(roles)?'Program Admin':staff(roles)?'Teacher':roles.includes('STUDENT')?'Student':signed?'None':'';
 }
 document.addEventListener('click',event=>{const button=event.target.closest('[data-shell-role]');if(button&&!button.hidden){event.preventDefault();openRole(button.dataset.shellRole);}});
 window.M4L_ACADEMY_SHELL={update,banners,openRole};update(data);
})();
