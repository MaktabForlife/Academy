/* Existing saved management links open the unified Program workspace. */
(() => {'use strict';
 const paths={'/programs/timetable.html':'timetable','/programs/timetable':'timetable','/programs/manage.html':'participants','/programs/manage':'participants','/programs/lesson-media.html':'media','/programs/lesson-media':'media'},tab=paths[location.pathname];if(!tab)return;
 const params=new URLSearchParams(location.search),id=params.get('program'),url=new URL('/programs/',location.origin);
 if(id)url.searchParams.set('program',id);url.searchParams.set('tab',id?(params.get('tab')==='classes'?'classes':tab):'list');
 window.M4L_PROGRAM_ADMIN_REDIRECT=true;location.replace(url.href);
})();
