import {assessmentRolesSQL,validDate} from './assessment-store.js';
import {managementError as fail,same} from './management-store.js';
import {publishedSessions} from './published-sessions.js';
import {academyDate,appTimezone} from './academy-clock.js';

const role=(name,account='u.account_id',area='a.activity_key')=>`EXISTS(SELECT 1 FROM (${assessmentRolesSQL}) r WHERE r.account_id=${account} COLLATE NOCASE AND r.activity_key=${area} COLLATE NOCASE AND r.role='${name}')`;
const global=account=>`EXISTS(SELECT 1 FROM global_role_assignments g WHERE g.account_id=${account} COLLATE NOCASE AND g.active=1 AND g.review_state='CONFIRMED' AND g.role='GLOBAL_ADMIN')`;
const courseAccess=`(${role('STUDENT')} OR EXISTS(SELECT 1 FROM effective_course_subscriptions s WHERE s.account_id=u.account_id AND s.activity_key=a.activity_key) OR EXISTS(SELECT 1 FROM course_settings cs WHERE cs.activity_key=a.activity_key AND cs.legacy_access_model='FREE' AND cs.policy_review_state='CONFIRMED'))`;
const teacherAttachment=`(EXISTS(SELECT 1 FROM class_teacher_assignments t WHERE t.activity_key=a.activity_key AND t.class_id=c.class_id AND t.account_id=u.account_id) OR EXISTS(SELECT 1 FROM program_publication_state ps JOIN published_lesson_classes lc ON lc.activity_key=ps.activity_key AND lc.publication_id=ps.latest_publication_id JOIN published_lesson_teachers lt ON lt.activity_key=lc.activity_key AND lt.publication_id=lc.publication_id AND lt.lesson_anchor=lc.lesson_anchor WHERE lc.activity_key=a.activity_key AND lc.class_id=c.class_id AND lt.account_id=u.account_id) OR EXISTS(SELECT 1 FROM course_run_state rs JOIN published_lesson_teachers lt ON lt.activity_key=rs.activity_key AND lt.publication_id=rs.current_publication_id WHERE rs.activity_key=a.activity_key AND rs.run_id=c.class_id AND coalesce(rs.stage,'') NOT IN('CANCELLED','ARCHIVED') AND lt.account_id=u.account_id))`;
const classesSQL=`SELECT c.activity_key,c.class_id,c.name FROM classes c JOIN activities a USING(activity_key) WHERE c.active=1 AND a.kind='PROGRAM' UNION SELECT cr.activity_key,cr.run_id class_id,cr.name FROM course_runs cr JOIN course_run_state rs USING(activity_key,run_id) JOIN activities a USING(activity_key) WHERE cr.active=1 AND a.kind='COURSE' AND coalesce(rs.stage,'') NOT IN('CANCELLED','ARCHIVED') AND rs.current_publication_id IS NOT NULL`;
export const messagingSessionKey=lesson=>JSON.stringify([lesson.date,lesson.stableKey]);

// All audience facts come from accepted teaching data and current Core grants.
// This service is request owned. Neither caller roles nor recipient IDs are used.
export function messagingAudience(repository,auth,now=()=>new Date()){
 const db=repository.db,p=(sql,...v)=>db.prepare(sql).bind(...v),actor=auth.user.accountid;
 let timezone,today;
 const ready=async()=>{timezone??=await appTimezone(repository);today=academyDate(now(),timezone);};
 const learner=(date='?')=>`CASE WHEN a.kind='PROGRAM' THEN (${role('STUDENT')} AND EXISTS(SELECT 1 FROM class_memberships m WHERE m.activity_key=a.activity_key AND m.class_id=c.class_id AND m.account_id=u.account_id AND m.active=1 AND (m.start_date IS NULL OR m.start_date<=min(?,${date})) AND (m.end_date IS NULL OR m.end_date>=max(?,${date})))) ELSE (${courseAccess} AND EXISTS(SELECT 1 FROM attendance_delivery_members m WHERE m.activity_key=a.activity_key AND m.run_id=c.class_id AND m.account_id=u.account_id AND m.state='VALID' AND m.join_date<=min(?,${date}) AND (m.leave_date IS NULL OR m.leave_date>=max(?,${date})))) END`;
 const learnerParams=date=>[today,date,today,date,today,date,today,date];
 const teacher=`(${role('TEACHER')} AND ${teacherAttachment})`;
 const admin=`(${global('u.account_id')} OR ${role('PROGRAM_ADMIN')})`;
 function surface(){
  if(auth.adminView&&auth.workspace==='LEARN')return {sql:'0',values:[]};
  if(auth.workspace==='ADMIN'||auth.adminView&&auth.workspace==='TEACH')return {sql:admin,values:[]};
  if(auth.workspace==='TEACH')return {sql:teacher,values:[]};
  return {sql:learner(),values:learnerParams(today)};
 }
 async function options(){
  await ready();const s=surface();
  const areas=(await p(`SELECT a.activity_key activityKey,a.name,a.kind,CASE WHEN ${admin} THEN 1 ELSE 0 END canAll FROM activities a JOIN accounts u ON u.account_id=? WHERE u.active=1 AND a.active=1 AND a.lifecycle='ACTIVE' AND (${admin} OR EXISTS(SELECT 1 FROM (${classesSQL}) c WHERE c.activity_key=a.activity_key AND ${s.sql})) ORDER BY a.name`,actor,...s.values).all()).results;
  // Admin authority in personal Learn/Teach never widens a personal sender.
  const allowed=(await p(`SELECT c.activity_key activityKey,c.class_id classId,c.name FROM (${classesSQL}) c JOIN activities a USING(activity_key) JOIN accounts u ON u.account_id=? WHERE u.active=1 AND a.active=1 AND a.lifecycle='ACTIVE' AND ${s.sql} ORDER BY a.name,c.name`,actor,...s.values).all()).results;
  const adminSurface=auth.workspace==='ADMIN'||auth.adminView&&auth.workspace==='TEACH';
  return {areas:areas.filter(a=>adminSurface||allowed.some(c=>same(c.activityKey,a.activityKey))).map(a=>({...a,canAll:Boolean(adminSurface&&a.canAll)})),classes:allowed,canAllAcademy:Boolean(adminSurface&&await p(`SELECT 1 FROM accounts u WHERE u.account_id=? AND u.active=1 AND ${global('u.account_id')}`,actor).first()),canAudit:Boolean(adminSurface&&areas.some(a=>a.canAll)),canSend:!(auth.adminView&&auth.workspace==='LEARN')&&(allowed.length>0||areas.some(a=>adminSurface&&a.canAll)),student:!adminSurface&&auth.workspace==='LEARN',timezone,today};
 }
 async function sessionOptions(input){
  await ready();if(!validDate(input.date))throw fail('Choose a valid session date.');
  const opts=await options(),a=opts.areas.find(a=>same(a.activityKey,input.activityKey));if(!a)throw fail('Choose an authorised learning area.',403,'MESSAGING_FORBIDDEN');
  const area=await p('SELECT * FROM activities WHERE activity_key=?',a.activityKey).first();
  const {lessons}=await publishedSessions(repository,area,input.date);
  return {sessions:lessons.filter(l=>opts.classes.some(c=>same(c.activityKey,a.activityKey)&&same(c.classId,l.classId))&&(a.canAll||auth.workspace!=='TEACH'||l.teacherIds.some(id=>same(id,actor))||false)).map(l=>({activityKey:a.activityKey,classId:l.classId,date:l.date,sessionKey:messagingSessionKey(l),name:[l.className,l.moduleName||l.subjectName,l.startTime].filter(Boolean).join(' · '),source:{activityKey:a.activityKey,date:l.date,classId:l.classId,sessionKey:JSON.stringify(area.kind==='PROGRAM'?['PROGRAM',l.date,l.sourceAnchor||l.anchor]:['COURSE',l.runId,l.sourceSessionId])}}))};
 }
 async function resolve(input){
  await ready();const opts=await options();
  if(!opts.canSend)throw fail('Sending is unavailable in this workspace.',403,'MESSAGING_FORBIDDEN');
  if(input?.allAcademy===true){
   if(!opts.canAllAcademy)throw fail('Only Global Admin can send to all Academy.',403,'MESSAGING_FORBIDDEN');
   const recipients=(await p('SELECT account_id accountId,display_name name FROM accounts WHERE active=1 ORDER BY account_id COLLATE NOCASE').all()).results;
   return {targets:{allAcademy:true,scopes:[]},audience:[{name:'All Academy'}],recipients,timezone};
  }
  if(!Array.isArray(input?.scopes)||!input.scopes.length||input.scopes.length>500)throw fail('Select at least one class, session or learning area.');
  if(opts.student&&input.scopes.length!==1)throw fail('Choose one of your own classes for this notice.',403,'MESSAGING_FORBIDDEN');
  const scopes=[],contexts=[];
  for(const target of input.scopes){
   if(!target||!['ALL','CLASS','SESSION'].includes(target.mode))throw fail('Choose a valid audience.');
   const a=opts.areas.find(a=>same(a.activityKey,target.activityKey));
   if(!a)throw fail('This audience is outside your current access.',403,'MESSAGING_FORBIDDEN');
   if(target.mode==='ALL'){
    if(!a.canAll)throw fail('Whole-area notices require Admin authority.',403,'MESSAGING_FORBIDDEN');
    scopes.push({activityKey:a.activityKey,mode:'ALL'});contexts.push({activityKey:a.activityKey,name:'Everyone in '+a.name,mode:'ALL'});continue;
   }
   const c=opts.classes.find(c=>same(c.activityKey,a.activityKey)&&same(c.classId,target.classId));
   if(!c)throw fail('This class is outside your current access.',403,'MESSAGING_FORBIDDEN');
   if(opts.student&&target.mode!=='CLASS')throw fail('Students send to their class.',403,'MESSAGING_FORBIDDEN');
   let lesson=null;
   if(target.mode==='SESSION'){
    if(!validDate(target.date)||typeof target.sessionKey!=='string'||target.sessionKey.length>1500)throw fail('Choose an accepted session.');
    const area=await p('SELECT * FROM activities WHERE activity_key=?',a.activityKey).first();
    lesson=(await publishedSessions(repository,area,target.date)).lessons.find(l=>same(l.classId,c.classId)&&messagingSessionKey(l)===target.sessionKey);
    if(!lesson||!a.canAll&&auth.workspace==='TEACH'&&!lesson.teacherIds.some(id=>same(id,actor)))throw fail('This session is outside your current teaching assignment.',403,'MESSAGING_FORBIDDEN');
   }
   scopes.push({activityKey:a.activityKey,mode:target.mode,classId:c.classId,...(lesson?{date:lesson.date,sessionKey:messagingSessionKey(lesson)}:{})});
   contexts.push({activityKey:a.activityKey,classId:c.classId,mode:target.mode,date:lesson?.date||today,teacherIds:lesson?.teacherIds||[],name:a.name+' · '+(lesson?[c.name,lesson.moduleName||lesson.subjectName,lesson.date,lesson.startTime].filter(Boolean).join(' · '):c.name)});
  }
  const recipients=(await p(`SELECT DISTINCT u.account_id accountId,u.display_name name FROM accounts u JOIN json_each(?) j JOIN activities a ON a.activity_key=json_extract(j.value,'$.activityKey') LEFT JOIN (${classesSQL}) c ON c.activity_key=a.activity_key AND c.class_id=json_extract(j.value,'$.classId') WHERE u.active=1 AND a.active=1 AND a.lifecycle='ACTIVE' AND CASE WHEN json_extract(j.value,'$.mode')='ALL' THEN (${role('PROGRAM_ADMIN')} OR ${role('TEACHER')} OR (a.kind='PROGRAM' AND ${role('STUDENT')}) OR (a.kind='COURSE' AND ${courseAccess} AND EXISTS(SELECT 1 FROM attendance_delivery_members m JOIN course_run_state rs USING(activity_key,run_id) JOIN course_runs cr USING(activity_key,run_id) WHERE m.account_id=u.account_id AND m.activity_key=a.activity_key AND m.state='VALID' AND cr.active=1 AND coalesce(rs.stage,'') NOT IN('CANCELLED','ARCHIVED') AND m.join_date<=? AND (m.leave_date IS NULL OR m.leave_date>=?)))) ELSE (${learner("json_extract(j.value,'$.date')")} OR (${role('TEACHER')} AND (EXISTS(SELECT 1 FROM class_teacher_assignments t WHERE t.activity_key=a.activity_key AND t.class_id=c.class_id AND t.account_id=u.account_id) OR (json_extract(j.value,'$.mode')='CLASS' AND ${teacherAttachment}) OR EXISTS(SELECT 1 FROM json_each(j.value,'$.teacherIds') t WHERE t.value=u.account_id COLLATE NOCASE)))) END ORDER BY u.account_id COLLATE NOCASE`,JSON.stringify(contexts),today,today,today,today,today,today).all()).results;
  if(!recipients.length)throw fail('There are no current recipients in this audience.',409,'MESSAGING_EMPTY_AUDIENCE');
  return {targets:{allAcademy:false,scopes},audience:contexts.map(({name,activityKey,classId,mode,date})=>({name,activityKey,...(classId?{classId}:{}),mode,...(mode==='SESSION'?{date}:{})})),recipients,timezone};
 }
 return {options,sessionOptions,resolve};
}
