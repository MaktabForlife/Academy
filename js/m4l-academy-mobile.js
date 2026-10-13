/* Shared banners and accessible edge drawers at every viewport size. */
(() => {
  'use strict';
  const sidebar=document.querySelector('.app > .sidebar, .academy-connected-sidebar');
  if(!sidebar||sidebar.querySelector('.academy-menu-toggle'))return;
  const brand=sidebar.querySelector('.brand, .academy-connected-brand');if(!brand)return;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const panel=document.createElement('div');panel.id='academy-menu-panel';panel.className='academy-menu-content';
  for(const child of [...sidebar.children])if(child!==brand)panel.append(child);
  const banners=document.createElement('div');banners.className='academy-banners';document.body.prepend(banners);banners.append(sidebar);
  const toggle=document.createElement('button');toggle.type='button';toggle.className='academy-menu-toggle';toggle.setAttribute('aria-controls','academy-menu-drawer');toggle.setAttribute('aria-expanded','false');toggle.innerHTML='<span aria-hidden="true">☰</span> Menu';sidebar.append(toggle);
  document.body.classList.add('academy-mobile-layout','academy-shell');
  let active=null,trigger=null,data=window.M4L_ACADEMY_SHELL_DATA||null;
  const drawers={};
  for(const [key,title,side] of [['website','Menu','right'],['learn','Learn','left'],['teach','Teach','right']]){
    const dialog=document.createElement('dialog');dialog.id=key==='website'?'academy-menu-drawer':'academy-'+key+'-drawer';dialog.className='academy-drawer';dialog.dataset.side=side;dialog.setAttribute('aria-labelledby',dialog.id+'-title');
    dialog.innerHTML=`<div class="academy-drawer-heading"><h2 id="${dialog.id}-title">${title}</h2><button type="button" aria-label="Close ${title} menu">×</button></div><div class="academy-drawer-list"></div>`;
    document.body.append(dialog);drawers[key]=dialog;
    dialog.querySelector('button').addEventListener('click',()=>close(true));
    dialog.addEventListener('cancel',event=>{event.preventDefault();close(true);});
    dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)close(true);}else if(event.target.closest('a,button[data-nav]'))close(false);});
    dialog.addEventListener('close',()=>{if(!active)document.body.classList.remove('academy-drawer-open');});
  }
  drawers.website.querySelector('.academy-drawer-list').append(panel);
  const legacy=document.getElementById('academy-role-panel');if(legacy){legacy.hidden=true;drawers.learn.append(legacy);}
  const strip=document.querySelector('.academy-connected-activities');if(strip)strip.hidden=true;
  function close(restore){if(active){active.close();active=null;}document.body.classList.remove('academy-drawer-open');for(const b of document.querySelectorAll('.academy-menu-toggle,[data-academy-tab],[data-shell-role]'))b.setAttribute('aria-expanded','false');if(restore)trigger?.focus({preventScroll:true});}
  function open(key,source,side){if(active===drawers[key]){close(true);return;}close(false);trigger=source||toggle;active=drawers[key];active.dataset.side=side||(key==='learn'?'left':'right');active.showModal();document.body.classList.add('academy-drawer-open');trigger.setAttribute('aria-expanded','true');}
  toggle.addEventListener('click',()=>open('website',toggle));
  function update(next){
    data=next;const signed=Boolean(data?.signedIn),global=Boolean(signed&&data.globalAdmin),activities=signed?data.personalActivities||[]:[],roles=activities.flatMap(r=>r.roles||[]);
    const staff=r=>r.some(x=>['TEACHER','SENIOR','PROGRAM_ADMIN','ADMIN','GLOBAL_ADMIN'].includes(x)),admin=r=>r.some(x=>['PROGRAM_ADMIN','ADMIN','GLOBAL_ADMIN'].includes(x));
    const available={learn:global||roles.some(r=>['STUDENT','TEACHER','SENIOR','PROGRAM_ADMIN','ADMIN','GLOBAL_ADMIN'].includes(r)),teach:global||staff(roles),admin:global||admin(roles)};
    const section=location.hash.slice(1).split('/')[0],path=location.pathname;
    const management=['administration','assessment-admin','progress-admin'].includes(section)||/^\/(users|programs)(?:\/|$)/.test(path)||/^\/academy\/(subjects|calendar|courses\/manage|library\/manage)(?:\/|$)/.test(path);
    const selected=management&&available.admin?'admin':(path.startsWith('/academy/teaching/')||path.startsWith('/academy/calendar/'))&&available.teach?'teach':'learn';
    for(const button of document.querySelectorAll('[data-shell-role]')){button.hidden=!available[button.dataset.shellRole];button.setAttribute('aria-pressed',String(button.dataset.shellRole===selected));}
    const name=document.getElementById('academy-shell-name'),role=document.getElementById('academy-shell-role');
    if(name)name.textContent=signed?(data.profile?.name||'Academy member'):'Welcome';
    if(role)role.textContent=global?'Global Admin':admin(roles)?'Program Admin':staff(roles)?'Teacher':roles.includes('STUDENT')?'Student':signed?'None':'';
    for(const mode of ['learn','teach']){
      const rows=activities.filter(r=>r.menuAvailable!==false&&![r.stage,r.lifecycle,r.status].some(value=>['CANCELLED','ARCHIVED'].includes(String(value||'').toUpperCase()))&&(global||(mode==='teach'?staff(r.roles||[]):admin(r.roles||[])||r.roles?.includes('STUDENT'))));
      const id=window.M4L_ACADEMY_LOGIN?.currentId()||data?.profile?.uniqueid||'',base=window.M4L_CONFIG?.HIFZHELPER_URL;
      drawers[mode].querySelector('.academy-drawer-list').innerHTML=rows.map(r=>{
        if(r.kind==='PROGRAM'&&r.id===window.M4L_CONFIG?.HIFZ_PROGRAM_ID)return /^[A-Za-z0-9]+$/.test(id)&&/^https:\/\//.test(base||'')?`<div class="academy-drawer-choice"><a class="academy-hifz-shortcut" href="${esc(base.replace(/\/$/,'')+'/'+encodeURIComponent(id))}" target="_blank" rel="noopener noreferrer" aria-label="HifzHelper (opens in a new tab)">HifzHelper ↗</a></div>`:'';
        return `<div class="academy-drawer-choice"><a href="/academy/#activity/${r.kind}/${encodeURIComponent(r.id)}/${mode}">${esc(r.name)}</a></div>`;
      }).join('')||`<p class="muted">No ${mode==='learn'?'learning':'teaching'} Programs or Courses are assigned to this account.</p>`;
    }
    if(!signed&&active&&active!==drawers.website)close(false);
  }
  document.addEventListener('click',event=>{
    const adminTeach=event.target.closest('[data-academy-teach-menu]');if(adminTeach){event.preventDefault();open('teach',adminTeach,'left');return;}
    const button=event.target.closest('[data-shell-role]');if(!button)return;
    if(button.dataset.shellRole==='admin')location.href='/academy/#administration';else open(button.dataset.shellRole,button);
  });
  window.addEventListener('hashchange',()=>close(false));
  window.M4L_ACADEMY_SHELL={update,banners,openRole:(key,side)=>open(key,document.getElementById('academy-tab-'+key),side)};
  update(data);
})();
