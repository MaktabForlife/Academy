// Versions describe shared resources, not unrelated Academy writes. Existing
// academy_settings stores these small counters, so no live schema upgrade is needed.
export const writeVersionKey=key=>'AcademyWrite:'+String(key).toUpperCase();
export const writeVersionSQL=`COALESCE((SELECT CAST(setting_value AS INTEGER) FROM academy_settings WHERE setting_key=?),0)`;
export const versionRecordsSQL=`COALESCE((SELECT json_group_object(setting_key,CAST(setting_value AS INTEGER)) FROM academy_settings WHERE setting_key>='AcademyWrite:' AND setting_key<'AcademyWrite;'),'{}')`;

export function changeScopes(dataset,scope,action,input,authorityScopes=[]) {
  const read=new Set(),write=new Set(),area=String(scope).toUpperCase();
  const areas=[area,...authorityScopes.map(s=>String(s).toUpperCase())].filter(s=>/^(PROGRAM|COURSE):/.test(s));
  for(const a of areas){read.add('AREA:'+a);write.add('AREA:'+a);if(a.startsWith('COURSE:'))write.add('COURSES');}
  if(dataset==='USER_PROFILES'||action==='course-roles') {
    const entries=input.mode==='batch'?input.entries:[input];
    for(const e of entries||[])if(e.mode==='matrix-roles') {
      const a=(e.scopeType==='PROGRAM'?'PROGRAM:':'COURSE:')+String(e.scopeId).toUpperCase();
      read.add('AREA:'+a);write.add('AREA:'+a);if(a.startsWith('COURSE:'))write.add('COURSES');
    }
    write.add('TEACHERS');
  }else if(dataset==='COURSE_MANAGEMENT'||dataset==='COURSE_SUBSCRIPTIONS') {
    if(!/^(PROGRAM|COURSE):/.test(area))read.add('COURSES');
    write.add('COURSES');
  }else if(dataset==='PROGRAM_REGISTRY') {read.add('PROGRAMS');write.add('PROGRAMS');}
  else if(dataset==='ACADEMY_CALENDAR') {read.add('CALENDAR');write.add('CALENDAR');write.add('COURSES');}
  else if(dataset==='TEACHER_AVAILABILITY') {const teacher=String(input.accountId||'SELF').toUpperCase();read.add('AVAILABILITY:'+teacher);write.add('AVAILABILITY:'+teacher);write.add('TEACHERS');}
  else if(['ACADEMY_MODULES','ACADEMY_SUBJECTS'].includes(dataset)) {read.add('CATALOGUE');write.add('CATALOGUE');}
  else if(!areas.length){read.add(dataset);write.add(dataset);}
  if(['PROGRAM_TIMETABLE','COURSE_MANAGEMENT'].includes(dataset)&&/validate|accept|publish/.test(action)||dataset==='COURSE_MANAGEMENT'&&!area.startsWith('COURSE:'))
    for(const key of ['CALENDAR','TEACHERS','TEACHING','CATALOGUE'])read.add(key);
  if(['PROGRAM_TIMETABLE','COURSE_MANAGEMENT'].includes(dataset)&&/publish|status/.test(action))write.add('TEACHING');
  return {read:[...read],write:[...write]};
}
