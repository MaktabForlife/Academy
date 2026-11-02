// Static presentation routes only. These never supply identity or permissions.
export const circlesOrigin='https://maktab4life.org';
export const academyCirclesPages=new Set([
 'academy/index.html','academy/admin/index.html','academy/calendar/index.html',
 'academy/course-companion/surah-kahf/index.html','academy/course-websites/index.html',
 'academy/course-websites/public/index.html','academy/course-websites/view/index.html',
 'academy/courses/manage/index.html','academy/enrolment/index.html','academy/enrolment/manage/index.html',
 'academy/hifz/index.html','academy/library/index.html','academy/library/manage/index.html',
 'academy/media/index.html','academy/monthly-media/index.html',
 'academy/pdf-compare/index.html','academy/pdf-reader/index.html','academy/pdf-tools/index.html',
 'academy/subjects/index.html','academy/website-platform/connect/index.html',
 'academy/website-studio/connect/index.html','academy/website-studio/session/index.html',
 'account/index.html','activities/kaaba-puzzle/index.html','activities/surahs-in-my-heart/index.html',
 'pdf-viewer/web/viewer.html','programs/attendance.html','programs/index.html','recorder/index.html','users/index.html'
]);
export const academyCirclesFragments=new Set([
 'programs/fragments/timetable.fragment','programs/fragments/participants.fragment','programs/fragments/lesson-media.fragment'
]);
export const academyRetiredPages=new Set([
 'academy/pdf-icon-samples/index.html','academy/website-platform/handover/index.html','academy/teaching/index.html','academy/open-library/index.html',
 'programs/timetable.html','programs/manage.html','programs/lesson-media.html',
 'programs/library-view.html','programs/library.html','programs/media.html'
]);
const programAliases=new Map([['/programs/timetable.html','timetable'],['/programs/manage.html','participants'],['/programs/lesson-media.html','media']]);
const timetableTabs=new Set(['curriculum','classes','public-card','timetable','review']);
export function academyCirclesAlias(url,path){
 if(url.pathname==='/'||url.pathname==='/index.html')return circlesOrigin+'/';
 if(/^\/(?:admin|student)(?:\/|$)/.test(url.pathname)){
  const next=new URL(url.pathname.startsWith('/admin')?'/academy/admin/':'/academy/',url.origin);
  next.search=url.search;return next.href;
 }
 if(programAliases.has(path)){
  const next=new URL('/programs/',url.origin);next.search=url.search;
  const tab=programAliases.get(path);if(tab!=='timetable'||!timetableTabs.has(next.searchParams.get('tab')))next.searchParams.set('tab',tab);
  return next.href;
 }
 if(path==='/academy/open-library/index.html'){const next=new URL('/academy/library/',url.origin);next.search=url.search;next.searchParams.set('view','public');return next.href;}
 const fixed=new Map([
  ['/academy/teaching/index.html','/academy/calendar/'],
  ['/programs/library-view.html','/academy/library/'],['/programs/library.html','/academy/library/'],['/programs/media.html','/academy/media/']
 ]);
 if(fixed.has(path)){const next=new URL(fixed.get(path),url.origin);next.search=url.search;return next.href;}
 return null;
}
export function circlesPageUnavailable(method='GET'){
 const html='<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Page unavailable · Umm Abbad Academy</title><style>body{margin:0;background:#faf7f2;color:#554653;font:1rem system-ui,sans-serif}main{max-width:42rem;margin:12vh auto;padding:2rem}h1{font:2.3rem Georgia,serif}a{display:inline-block;padding:.8rem 1.2rem;border:1px solid #bdacb8;border-radius:1rem;color:inherit}</style></head><body><main><p>Umm Abbad Academy</p><h1>This page is no longer available</h1><p>Open your dashboard to continue with your current account.</p><a href="https://maktab4life.org/">Open Academy</a></main></body></html>';
 return new Response(method==='HEAD'?null:html,{status:404,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'"}});
}
