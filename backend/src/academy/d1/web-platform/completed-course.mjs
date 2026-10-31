import {id,fail} from './protocol.mjs';

// Called only inside native Course management's current Global Admin guarded
// transaction. This is separate from the first-timetable-publication capability.
export async function planCompletedCourse(store,env,course,input,{timezone}){
 if(env.ACADEMY_WEB_PLATFORM!=='1'||env.ACADEMY_COURSE_STUDIO_PUBLICATION!=='1')throw fail('Completed Course setup is unavailable.',503);
 if(input.confirmCompleted!==true||!['FREE','PAID'].includes(input.accessModel)||typeof input.name!=='string'||!input.name.trim()||input.name.trim().length>160||!/^[a-f0-9]{64}$/.test(input.packageSha256||''))throw fail('Confirm the completed Course, its name, access setting and exact website edition.');
 try{new Intl.DateTimeFormat('en',{timeZone:timezone});}catch{throw fail('Review the Course time zone.');}
 const websiteId=id(input.websiteId),db=env.ACADEMY_DB.withSession('first-primary'),p=store.p;
 const existing=await db.prepare('SELECT * FROM website_platform_completed_courses WHERE activity_key=?').bind(course.activityKey).first();
 if(existing){
  if(existing.website_id!==websiteId||existing.package_sha256!==input.packageSha256)throw fail('This completed Course already has a different reviewed website registration.',409,'COMPLETED_COURSE_CONFLICT');
  return {statements:[],existing:true,result:{registered:true,alreadyRegistered:true,courseId:course.courseId,activityKey:course.activityKey,websiteId,registrationId:existing.registration_id,liveEnabled:false}};
 }
 const mapped=await db.prepare('SELECT 1 FROM website_platform_timetable_scopes WHERE activity_key=? UNION ALL SELECT 1 FROM website_platform_access_ownership WHERE activity_key=? LIMIT 1').bind(course.activityKey,course.activityKey).first();
 if(mapped)throw fail('This Course already has a Studio mapping. Preserve its current ownership.',409,'COMPLETED_COURSE_CONFLICT');
 const guard=crypto.randomUUID();
 return {existing:false,result:{registered:true,courseId:course.courseId,activityKey:course.activityKey,websiteId,registrationId:input.operationId,liveEnabled:false},statements:[
  p(`INSERT INTO website_platform_guards VALUES(?,NOT EXISTS(SELECT 1 FROM website_platform_completed_courses WHERE activity_key=?) AND NOT EXISTS(SELECT 1 FROM website_platform_timetable_scopes WHERE activity_key=?) AND NOT EXISTS(SELECT 1 FROM website_platform_access_ownership WHERE activity_key=?))`,guard,course.activityKey,course.activityKey,course.activityKey),
  p('INSERT INTO website_platform_completed_courses VALUES(?,?,?,?,?,?,?)',course.activityKey,input.operationId,websiteId,input.packageSha256,input.name.trim(),timezone,Date.now()),
  p("INSERT INTO website_platform_timetable_scopes(activity_key,offering_id,kind) VALUES(?,?,'COURSE')",course.activityKey,course.courseId),
  p("INSERT INTO website_platform_access_scopes(activity_key,enabled,purchase_model) VALUES(?,1,'CONFIRMED_SUBSCRIPTION')",course.activityKey),
  p("INSERT INTO website_platform_access_ownership VALUES(?,'ACADEMY',NULL,NULL,NULL,'',0,?)",course.activityKey,Date.now()),
  p("INSERT INTO website_platform_access_dirty(activity_key,account_id) VALUES(?,'')",course.activityKey),
  p('DELETE FROM website_platform_guards WHERE guard_id=?',guard)
 ]};
}
