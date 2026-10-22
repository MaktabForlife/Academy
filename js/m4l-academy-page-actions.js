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
  const home='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 10 9-7 9 7M5 9v12h5v-7h4v7h5V9"/></svg>',refresh='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 7v5h-5M20 12a8 8 0 1 1-2-6"/></svg>';
  actions.innerHTML=`<a data-page-home href="${academy?'#overview':'/academy/#overview'}" aria-label="Academy home" title="Home"><span class="page-action-icon">${home}</span><span class="page-action-label">Home</span></a><button data-page-refresh type="button" aria-label="Refresh this page" title="Refresh"><span class="page-action-icon">${refresh}</span><span class="page-action-label">Refresh</span></button>`;
  const login=document.getElementById('academy-login')||document.createElement('a');
  if(!login.id){login.id='academy-login';login.href='/academy/#login';login.textContent='Login';}
  signOut.textContent='Sign out';actions.append(login,signOut);host.append(actions);
  if(!academy){
    const updateLogin=()=>{login.hidden=!signOut.hidden;};updateLogin();
    new MutationObserver(updateLogin).observe(signOut,{attributes:true,attributeFilter:['hidden']});
  }
  const path=location.pathname||'',calendarView=window.M4L_ACADEMY_WORKSPACE?.current().toLowerCase()||new URLSearchParams(location.search).get('view');
  const management=/^\/(users|programs)(?:\/|$)/.test(path)||/^\/academy\/(subjects|courses\/manage|library\/manage|enrolment\/manage|pdf-tools)(?:\/|$)/.test(path)||path.startsWith('/academy/calendar/')&&!['learn','teach'].includes(calendarView);
  if(management){
    function ensureClose(){
      const headings=[...document.querySelectorAll('main .pgm-heading,main .pb-heading,main .up-titlebar,main .cm-page-heading,main .al-intro,main .cal-heading,main .pt-heading,main .enrolment-heading')];
      const heading=headings.find(node=>node.getClientRects().length);if(!heading)return;
      const close=document.querySelector('.academy-management-close')||document.createElement('a');
      if(close.parentElement===heading)return;
      close.href='/academy/admin/#administration';close.className='academy-management-close';close.textContent='Close';heading.append(close);
    }
    ensureClose();const main=document.querySelector('main');if(main)new MutationObserver(ensureClose).observe(main,{childList:true,subtree:true});
  }
  actions.querySelector('[data-page-refresh]').addEventListener('click',async()=>{
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
  if(shell&&typeof ResizeObserver!=='undefined')new ResizeObserver(()=>document.documentElement.style.setProperty('--academy-banner-height',shell.banners.offsetHeight+'px')).observe(shell.banners);
})();
