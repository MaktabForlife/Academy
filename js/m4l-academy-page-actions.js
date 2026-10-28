/* The same account banner and page actions persist across Academy workspaces. */
(() => {
  'use strict';
  const shell=window.M4L_ACADEMY_SHELL;
  const signOut=document.getElementById('academy-sign-out')||document.getElementById('ac-signout')||document.getElementById('logout-button');if(!signOut)return;
  const academy=Boolean(document.getElementById('academy-home-card')),account=document.querySelector('.account-panel-topline');
  let banner=document.getElementById('academy-home-card');
  if(!banner&&shell){banner=document.createElement('section');banner.className='academy-account-bar';banner.setAttribute('aria-label','Academy account');banner.innerHTML='<div class="academy-account-row"><div class="academy-profile"><span class="academy-welcome">Ahlan wa Sahlan</span><strong id="academy-shell-name">Welcome</strong><small id="academy-shell-role"></small></div></div><div class="academy-role-tabs" aria-label="Academy workspaces"><button data-shell-role="learn" hidden>LEARN</button><button data-shell-role="teach" hidden>TEACH</button><button data-shell-role="admin" hidden>ADMIN</button></div>';}
  if(banner&&shell){banner.hidden=false;shell.banners.append(banner);}
  const host=shell?.banners.querySelector('.sidebar,.academy-connected-sidebar')||banner?.querySelector('.academy-account-row')||account||document.querySelector('main');if(!host)return;
  const actions=document.createElement('div');actions.className='academy-page-actions';actions.setAttribute('role','group');actions.setAttribute('aria-label','Page actions');
  const home='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 10 9-7 9 7M5 9v12h5v-7h4v7h5V9"/></svg>',refresh='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 8.5A9 9 0 1 1 12 3h2M11 1l3 2-2 3"/></svg>';
  actions.innerHTML=`<a data-page-home data-workspace-exit href="${window.M4L_ACADEMY_WORKSPACE?.homeUrl?.()||'/academy/#overview'}" aria-label="Academy home" title="Home"><span class="page-action-icon">${home}</span><span class="page-action-label">Home</span></a><button data-page-refresh type="button" aria-label="Refresh this page" title="Refresh"><span class="page-action-icon">${refresh}</span><span class="page-action-label">Refresh</span></button>`;
  const syncHome=()=>{const anchor=actions.querySelector('[data-page-home]');if(anchor)anchor.href=window.M4L_ACADEMY_WORKSPACE?.homeUrl?.()||'/academy/#overview';};window.addEventListener('hashchange',syncHome);
  const login=document.getElementById('academy-login')||document.createElement('a');
  if(!login.id){login.id='academy-login';login.href='/academy/#login';login.textContent='Login';}
  signOut.innerHTML='<span class="page-signout-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M9 4H4v16h5m5-13 5 5-5 5m-6-5h11"/></svg></span><span class="page-signout-label">Sign out</span>';signOut.setAttribute('aria-label','Sign out');signOut.title='Sign out';actions.append(login,signOut);host.append(actions);
  const profile=banner?.querySelector('.academy-profile');
  if(shell&&profile){const accountRow=document.createElement('div');accountRow.className='academy-header-account';accountRow.append(profile,actions);host.append(accountRow);}
  void import('/js/m4l-academy-accounts.mjs?v=107.117').then(module=>module.installAccounts({actions,signOut})).catch(()=>{ /* Existing Login and Sign out remain available if the optional chooser cannot load. */ });
  if(!academy){
    const updateLogin=()=>{login.hidden=!signOut.hidden;};updateLogin();
    new MutationObserver(updateLogin).observe(signOut,{attributes:true,attributeFilter:['hidden']});
  }
  const path=location.pathname||'',calendarView=window.M4L_ACADEMY_WORKSPACE?.audience().toLowerCase()||new URLSearchParams(location.search).get('view');
  const management=Boolean(window.M4L_ACADEMY_WORKSPACE?.adminRealm())||/^\/(users|programs)(?:\/|$)/.test(path)||/^\/academy\/(subjects|courses\/manage|library\/manage|enrolment\/manage|pdf-tools)(?:\/|$)/.test(path)||path.startsWith('/academy/calendar/')&&!['learn','teach'].includes(calendarView);
  if(management){
    const close=document.createElement('a');close.href='/academy/admin/#administration';close.className='academy-management-close academy-close';close.title='Close';close.textContent='Close';close.setAttribute('data-workspace-exit','');close.setAttribute('aria-label','Close and return to Admin Home');
    function ensureClose(){
      if(path.startsWith('/academy/admin/')&&(!location.hash||location.hash==='#administration')){close.remove();return;}
      const headings=[...document.querySelectorAll('.view.active .page-heading,.view.active .workspace-banner,.view.active .workspace-identity,.view.active .activity-identity,main .pgm-heading,main .pb-heading,main .up-titlebar,main .cm-page-heading,main .al-intro,main .cal-heading,main .pt-heading,main .enrolment-heading')];
      const visible=node=>node.getClientRects().length;
      const heading=headings.find(visible);if(!heading)return;
      for(const link of heading.querySelectorAll(':scope>a'))if(link!==close&&!link.hidden&&/^Close$/i.test(link.textContent.trim()))link.hidden=true;
      if(close.parentElement!==heading)heading.append(close);
    }
    ensureClose();window.addEventListener('hashchange',ensureClose);
    const main=document.querySelector('main');if(main)new MutationObserver(ensureClose).observe(main,{childList:true,subtree:true,attributes:true,attributeFilter:['class','hidden']});
  }
  actions.querySelector('[data-page-refresh]').addEventListener('click',async()=>{
    if(document.getElementById('dashboard')?.classList.contains('active')){await window.M4L_ACADEMY_DASHBOARD?.refresh(true);return;}
    if(await window.M4L_ANNOUNCEMENTS?.refreshPage?.())return;
    if(await window.M4L_PLANNING?.refreshPage?.())return;
    if(await window.M4L_ACADEMY_ASSESSMENTS?.refreshPage?.())return;
    const contentRefresh=[...document.querySelectorAll('main [data-page-content-refresh]')].find(button=>{
      const view=button.closest('.view');
      // The shell hides duplicate refresh buttons with CSS; their visible page still owns the action.
      return button.parentElement?.getClientRects().length>0&&!button.hidden&&!button.parentElement.closest('[hidden]')&&(!view||view.classList.contains('active'));
    });
    // Reuse the page's refresh action, including draft guards, selected dates and cache invalidation.
    if(contentRefresh){contentRefresh.click();return;}
    try{sessionStorage.removeItem('m4l_academy_daily_timetable_10656');}catch{}location.reload();
  });
  shell?.update(window.M4L_ACADEMY_SHELL_DATA||null);
  if(shell&&typeof ResizeObserver!=='undefined'){
    let frame=0;
    const measure=()=>{frame=0;const height=shell.banners.offsetHeight+'px',style=document.documentElement.style;if(style.getPropertyValue('--academy-banner-height')!==height)style.setProperty('--academy-banner-height',height);};
    // Defer layout writes outside ResizeObserver delivery, including Safari's PDF header.
    new ResizeObserver(()=>{if(!frame)frame=requestAnimationFrame(measure);}).observe(shell.banners);measure();
  }
  void import('/js/m4l-academy-history.js?v=107.117').catch(()=>{ /* Existing page links remain available if navigation cannot load. */ });
})();
