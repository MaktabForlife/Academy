/* Course destinations are presentation only; every course read is authorised by the API. */
(()=>{'use strict';
 function isKahf(row){if(row?.kind!=='COURSE')return false;const n=String(row.name||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f\u064b-\u065f\u0670]/g,'').replace(/[^a-z\u0621-\u064a]/g,'');return ['surahalkahf','surahkahf','suratalkahf','suratkahf','سورةالكهف'].includes(n);}
 function href(row,tool='timetable',mode='learn'){
  if(!(isKahf(row)||row?.courseWebsite)||!row.id||!['course-website','timetable','lesson-media','library','assessment'].includes(tool))return '';
  if(!isKahf(row)&&tool!=='course-website')return '';
  const boundary=window.M4L_ACADEMY_WORKSPACE;
  let workspace=boundary?.current()||(mode||'learn').toUpperCase();
  if(tool==='course-website'){if(workspace==='ADMIN')workspace='ADMIN_LEARN';}
  else if(mode==='teach'||!['LEARN','ADMIN_LEARN'].includes(workspace))return '';
  if(!['LEARN','TEACH','ADMIN_LEARN','ADMIN_TEACH'].includes(workspace))return '';
  const query=new URLSearchParams({course:row.id,workspace});
  const selectedClass=boundary?.classView?.();if(workspace==='ADMIN_LEARN'&&selectedClass){query.set('studentProgram',selectedClass.activityKey);query.set('studentClass',selectedClass.classId);}
  const head=boundary?.head();if(head)query.set('setup',head);
  return (isKahf(row)?'/academy/course-companion/surah-kahf/?':'/academy/course-websites/view/?')+query.toString()+({'course-website':'#overview',timetable:'#overview','lesson-media':'#sessions',library:'#resources',assessment:'#assessments'}[tool]);
 }
 window.M4L_COURSE_COMPANION={isKahf,href};
})();
