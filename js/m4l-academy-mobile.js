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
   const label=item.textContent.trim(),href=item.getAttribute('href')||'',kind=item.dataset.nav==='overview'?'home':item.dataset.nav||(/calendar/.test(href)?'calendar':/library/.test(href)?'library':/surahs/.test(href)?'heart':/kaaba/.test(href)?'kaaba':'about');
   if(kind==='home'||kind==='calendar'||kind==='timetable'){item.remove();continue;}
   item.dataset.quickKind=kind;item.replaceChildren();const icon=document.createElement('span');icon.className='quicklink-icon';icon.setAttribute('aria-hidden','true');icon.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'+(icons[kind]||icons.about)+'</svg>';const text=document.createElement('span');text.className='quicklink-label';text.textContent=label;item.append(icon,text);
  }
 }
 quick.hidden=!document.getElementById('academy-home-card');
 const nav=sidebar.querySelector('nav');if(nav){nav.setAttribute('aria-label','Academy quick links');quick.append(nav);quickBlocks(nav);}
 for(const child of [...sidebar.children])if(child!==brand)child.hidden=true;
 if(document.getElementById('academy-home-card')){const dates=document.createElement('aside');dates.className='academy-date-box';dates.setAttribute('aria-label','Today’s Hijri and Gregorian dates');dates.innerHTML='<div aria-label="Hijri date"><em id="academy-hijri-date" title="Hijri date from Jamiat">Loading Hijri date…</em></div><div aria-label="Gregorian date"><time id="academy-gregorian-date"></time></div>';sidebar.append(dates);}
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
  const home=['/academy/','/academy/index.html'].includes(path)&&(!section[0]||['overview','learning'].includes(section[0]));
  const selected=home?'':section[0]==='timetable'&&section[1]==='teach'||calendarView==='teach'||path.startsWith('/academy/teaching/')?'teach':management?'admin':'learn';
  for(const button of document.querySelectorAll('[data-shell-role]')){button.hidden=!available[button.dataset.shellRole];button.setAttribute('aria-pressed',String(button.dataset.shellRole===selected));}
  const name=document.getElementById('academy-shell-name'),role=document.getElementById('academy-shell-role');if(name)name.textContent=signed?(data.profile?.name||'Academy member'):'Welcome';if(role)role.textContent=global?'Global Admin':admin(roles)?'Program Admin':staff(roles)?'Teacher':roles.includes('STUDENT')?'Student':signed?'None':'';
 }
 document.addEventListener('click',event=>{const button=event.target.closest('[data-shell-role]');if(button&&!button.hidden){event.preventDefault();openRole(button.dataset.shellRole);}});
 window.M4L_ACADEMY_SHELL={update,banners,openRole};update(data);
})();
