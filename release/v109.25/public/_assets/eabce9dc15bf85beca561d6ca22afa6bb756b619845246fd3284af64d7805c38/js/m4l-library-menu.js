/* Use the same Library destinations in a right-hand drawer on phones. */
(() => {
 'use strict';
 const nav=document.querySelector('.al-tabs'),heading=document.querySelector('.library-title-row');
 if(!nav||!heading)return;
 const position=document.createComment('Library views');nav.before(position);
 const button=document.createElement('button');button.type='button';button.className='library-menu-button';button.setAttribute('aria-label','Library menu');button.setAttribute('aria-haspopup','dialog');button.setAttribute('aria-controls','library-view-menu');button.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg>';heading.append(button);
 const drawer=document.createElement('dialog');drawer.id='library-view-menu';drawer.className='academy-side-menu';drawer.setAttribute('aria-label','Library menu');drawer.innerHTML='<div class="side-menu-heading"><h2>Library</h2><button type="button" aria-label="Close Library menu">×</button></div>';document.body.append(drawer);
 const close=()=>{if(drawer.open)drawer.close();};
 button.onclick=()=>drawer.showModal();drawer.querySelector('button').onclick=close;
 drawer.addEventListener('click',event=>{if(event.target===drawer||event.target.closest('nav a,nav button'))close();});
 const phone=matchMedia('(max-width:767px)');
 function layout(){button.hidden=!phone.matches;if(phone.matches)drawer.append(nav);else{close();position.after(nav);}}
 phone.addEventListener('change',layout);layout();window.addEventListener('m4l-academy-session',close);
})();
