/* One native Contents menu; the wider layout opens the same navigation. */
(() => {
  'use strict';
  const wide=matchMedia('(min-width:70rem)');
  const active=()=>document.body.classList.contains('academy-learning-layout');
  let destination='';
  function closeDashboard(focus=false){
    const sidebar=document.querySelector('#dashboard .ad-sidebar'),toggle=sidebar?.querySelector('.ad-menu-toggle');
    if(!sidebar||!toggle)return;
    sidebar.dataset.navOpen='false';toggle.setAttribute('aria-expanded','false');
    if(focus)toggle.focus();
  }
  function sync(){
    for(const menu of document.querySelectorAll('.workspace-contents')){
      const selected=menu.querySelector('[aria-current=page]'),href=selected?.getAttribute('href')||'';
      if(wide.matches||!active())menu.open=true;
      else if(menu.dataset.selection!==href)menu.open=false;
      menu.dataset.selection=href;
      if(destination&&destination===href&&destination===location.hash){
        destination='';
        const heading=document.getElementById('activity-title');
        if(heading){heading.setAttribute('tabindex','-1');heading.focus({preventScroll:true});}
      }
    }
  }
  function resize(){
    for(const menu of document.querySelectorAll('.workspace-contents')){
      const inside=menu.contains(document.activeElement);
      menu.open=wide.matches||!active();
      if(inside&&!menu.open)menu.querySelector('summary').focus();
    }
    if(active()&&!wide.matches)closeDashboard();
  }
  const host=document.getElementById('activity-menu');
  if(host)new MutationObserver(sync).observe(host,{childList:true});
  document.addEventListener('click',event=>{
    if(!active()||event.defaultPrevented||event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
    const menu=event.target.closest('.workspace-contents'),link=event.target.closest('[data-workspace-link]');
    if(link){
      const href=link.getAttribute('href');
      if(href?.startsWith('#'))destination=href;
      if(href===location.hash){if(!wide.matches)menu.open=false;menu.querySelector('summary').focus();destination='';}
    }
    if(menu&&event.target.closest('[data-class-notes-toggle]')&&!wide.matches){menu.open=false;menu.querySelector('summary').focus();}
    if(!wide.matches){
      for(const contents of document.querySelectorAll('.workspace-contents[open]'))if(!contents.contains(event.target))contents.open=false;
      if(event.target.closest('#ad-navigation :is(a,button)'))closeDashboard();
    }
  });
  document.addEventListener('keydown',event=>{
    if(event.key!=='Escape'||!active()||wide.matches)return;
    const menu=event.target.closest('.workspace-contents[open]');
    if(menu){event.preventDefault();menu.open=false;menu.querySelector('summary').focus();}
    else if(event.target.closest('.ad-sidebar[data-nav-open=true]')){event.preventDefault();closeDashboard(true);}
  });
  wide.addEventListener('change',resize);
  window.addEventListener('hashchange',()=>{if(destination&&destination!==location.hash)destination='';sync();});
  window.addEventListener('m4l-academy-session-ended',()=>{destination='';});
  window.M4L_ACADEMY_CONTENTS={sync};
  window.M4L_ACADEMY_SHELL?.update(window.M4L_ACADEMY_SHELL_DATA||null);
  sync();
})();
