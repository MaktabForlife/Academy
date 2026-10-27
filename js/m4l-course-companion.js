/* Course destinations are presentation only; every course read is authorised by the API. */
(()=>{'use strict';
 function isKahf(row){if(row?.kind!=='COURSE')return false;const n=String(row.name||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f\u064b-\u065f\u0670]/g,'').replace(/[^a-z\u0621-\u064a]/g,'');return ['surahalkahf','surahkahf','suratalkahf','suratkahf','سورةالكهف'].includes(n);}
 function href(row,tool='timetable',mode='learn'){
  if(!isKahf(row)||!row.id||!['timetable','lesson-media','library','assessment'].includes(tool))return '';
  const boundary=window.M4L_ACADEMY_WORKSPACE,workspace=boundary?.current()||(mode||'learn').toUpperCase();
  if(mode==='teach'||!['LEARN','ADMIN_LEARN'].includes(workspace))return '';
  const query=new URLSearchParams({course:row.id,workspace});
  const selectedClass=boundary?.classView?.();if(workspace==='ADMIN_LEARN'&&selectedClass){query.set('studentProgram',selectedClass.activityKey);query.set('studentClass',selectedClass.classId);}
  const head=boundary?.head();if(head)query.set('setup',head);
  return '/academy/course-companion/surah-kahf/?'+query.toString()+({timetable:'#overview','lesson-media':'#sessions',library:'#resources',assessment:'#assessments'}[tool]);
 }
 window.M4L_COURSE_COMPANION={isKahf,href};
})();
