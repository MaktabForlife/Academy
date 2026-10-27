/* Program Contents opens beside the title; Course navigation keeps its layout. */
(() => {
 'use strict';
 const wide=matchMedia('(min-width:70rem)'),active=()=>document.body.classList.contains('academy-learning-layout');
 const host=document.getElementById('activity-menu');
 let destination='',drawer,drawerMenu,nav,slot;
 const program=menu=>active()&&menu?.dataset.learningKind==='PROGRAM'&&Boolean(document.querySelector('#activity.active'));
 function close(returnFocus=true){
  if(!drawer)return;const menu=drawerMenu,dialog=drawer;
  if(menu?.isConnected&&nav)menu.append(nav);
  drawer=null;drawerMenu=null;nav=null;menu.open=false;
  menu.querySelector('summary')?.setAttribute('aria-expanded','false');
  if(dialog.open)dialog.close();dialog.remove();document.body.classList.remove('activity-contents-open');
  if(returnFocus&&menu.isConnected)menu.querySelector('summary')?.focus({preventScroll:true});
 }
 function open(menu){
  if(drawer){close();return;}if(!program(menu))return;
  nav=menu.querySelector('.workspace-tabs');if(!nav)return;drawerMenu=menu;
  drawer=document.createElement('dialog');drawer.id='activity-contents-drawer';drawer.className='academy-drawer';drawer.setAttribute('aria-labelledby','activity-contents-title');
  drawer.innerHTML='<header class="academy-drawer-heading academy-close-heading"><h2 id="activity-contents-title">Menu</h2><button type="button" class="academy-close" data-activity-contents-close aria-label="Close Menu" title="Close Menu" autofocus>Close Menu</button></header>';
  drawer.append(nav);document.body.append(drawer);menu.open=true;menu.querySelector('summary').setAttribute('aria-expanded','true');document.body.classList.add('activity-contents-open');
  drawer.addEventListener('cancel',event=>{event.preventDefault();close();});
  drawer.addEventListener('close',()=>{if(drawer)close();});
  drawer.addEventListener('click',event=>{const r=drawer.getBoundingClientRect();if(event.target.closest('[data-activity-contents-close]')||event.target===drawer&&(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom))close();});
  drawer.addEventListener('keydown',event=>{if(event.key!=='Tab')return;const items=[...drawer.querySelectorAll('a[href],button:not(:disabled)')].filter(el=>el.getClientRects().length),first=items[0],last=items.at(-1);if(document.activeElement===(event.shiftKey?first:last)){event.preventDefault();(event.shiftKey?last:first)?.focus();}});
  drawer.showModal();
 }
 function sync(){
  if(drawer&&(!drawerMenu.isConnected||!program(drawerMenu)))close(false);
  const menus=[...document.querySelectorAll('.workspace-contents')],isProgram=menus.some(program);
  document.body.classList.toggle('academy-program-contents',isProgram);
  if(host){
   if(!slot){slot=document.createComment('Program navigation position');host.before(slot);}
   const target=isProgram?document.querySelector('#activity .academy-title-row'):null;
   if(target&&host.parentElement!==target)target.append(host);else if(!target&&host.parentElement!==slot.parentElement)slot.before(host);
  }
  for(const menu of menus){
   const selected=(menu===drawerMenu?nav:menu)?.querySelector('[aria-current=page]'),href=selected?.getAttribute('href')||'';
   if(program(menu)){
    const summary=menu.querySelector('summary');summary.setAttribute('aria-haspopup','dialog');summary.setAttribute('aria-controls','activity-contents-drawer');summary.setAttribute('aria-expanded',String(drawerMenu===menu));menu.open=drawerMenu===menu;
   }else if(wide.matches||!active())menu.open=true;else if(menu.dataset.selection!==href)menu.open=false;
   menu.dataset.selection=href;
   if(destination&&destination===href&&destination===location.hash){destination='';const heading=document.getElementById('activity-title');if(heading){heading.setAttribute('tabindex','-1');heading.focus({preventScroll:true});}}
  }
 }
 function resize(){
  for(const menu of document.querySelectorAll('.workspace-contents')){if(program(menu))continue;const inside=menu.contains(document.activeElement);menu.open=wide.matches||!active();if(inside&&!menu.open)menu.querySelector('summary').focus();}
 }
 if(host)new MutationObserver(sync).observe(host,{childList:true});
 document.addEventListener('click',event=>{
  if(!active()||event.defaultPrevented||event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
  const summary=event.target.closest('.workspace-contents>summary'),menu=summary?.parentElement||event.target.closest('.workspace-contents')||drawerMenu;
  if(summary&&program(menu)){event.preventDefault();open(menu);return;}
  const link=event.target.closest('[data-workspace-link]'),noteToggle=event.target.closest('[data-class-notes-toggle]');
  if(link){const href=link.getAttribute('href');if(href?.startsWith('#'))destination=href;if(drawer)close();if(href===location.hash){if(!wide.matches||program(menu))menu.open=false;menu?.querySelector('summary')?.focus();destination='';}}
  if(noteToggle){if(drawer)close();else if(menu&&!wide.matches){menu.open=false;menu.querySelector('summary').focus();}}
  if(!wide.matches&&!drawer)for(const contents of document.querySelectorAll('.workspace-contents[open]'))if(!program(contents)&&!contents.contains(event.target))contents.open=false;
 });
 document.addEventListener('keydown',event=>{if(event.key!=='Escape'||!active())return;if(drawer){event.preventDefault();close();return;}if(wide.matches)return;const menu=event.target.closest('.workspace-contents[open]');if(menu){event.preventDefault();menu.open=false;menu.querySelector('summary').focus();}});
 wide.addEventListener('change',resize);
 window.addEventListener('hashchange',()=>{if(destination&&destination!==location.hash)destination='';if(drawer)close(false);sync();});
 window.addEventListener('m4l-academy-session-ended',()=>{destination='';close(false);sync();});
 window.M4L_ACADEMY_CONTENTS={sync};window.M4L_ACADEMY_SHELL?.update(window.M4L_ACADEMY_SHELL_DATA||null);sync();
})();
