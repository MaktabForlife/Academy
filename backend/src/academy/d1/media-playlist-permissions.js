import {actualState,actualRole,hasAdminAuthority,viewedClass} from './workspace-access.js';
import {monthlyEnabled,monthlyAudienceSQL} from './monthly-media-policy.js';
import {baseMediaAudienceSQL} from './lesson-media.js';
import {CONTENT_MEDIA_SCHEMA} from './content-media-context.js';
// The same dated V2/legacy audience as the recording reader. Playlist dates and
// membership never appear in this predicate and never grant bytes or metadata.
export function playlistRecordingPermission(repository,auth,activityKey){
 const actor=auth.user.accountid,klass=viewedClass(auth,activityKey)||'',values=[],classSQL="(?='' OR l.class_id=? COLLATE NOCASE OR EXISTS(SELECT 1 FROM json_each(l.source_lessons_json,'$[0].classIds') WHERE value=? COLLATE NOCASE))";
 const published="l.state='PUBLISHED' AND NOT EXISTS(SELECT 1 FROM lesson_media_visibility visibility WHERE visibility.lesson_id=l.lesson_id AND visibility.visible=0)";
 let access;
 if(hasAdminAuthority(auth,activityKey)){access="(EXISTS(SELECT 1 FROM global_role_assignments g WHERE g.account_id=? AND g.active=1 AND g.review_state='CONFIRMED' AND g.role='GLOBAL_ADMIN') OR EXISTS(SELECT 1 FROM effective_activity_roles r WHERE r.activity_key=l.activity_key AND r.account_id=? AND r.role='PROGRAM_ADMIN'))";values.push(actor,actor);}
 else if(auth.workspace==='TEACH'&&actualRole(auth,activityKey,'TEACHER')){access=`EXISTS(SELECT 1 FROM effective_activity_roles r WHERE r.activity_key=l.activity_key AND r.account_id=? AND r.role='TEACHER') AND (json_extract(l.source_lessons_json,'$[0].schema') IS NOT '${CONTENT_MEDIA_SCHEMA}' OR EXISTS(SELECT 1 FROM class_teacher_assignments t JOIN classes c USING(activity_key,class_id) WHERE t.activity_key=l.activity_key AND t.class_id=l.class_id AND t.account_id=? AND c.active=1))`;values.push(actor,actor);}
 else {const state=actualState(auth),eligible=state.roles.some(r=>r.activity_key.toUpperCase()===activityKey.toUpperCase()&&r.role==='STUDENT')||(state.monthlyMedia||[]).some(r=>r.activity_key.toUpperCase()===activityKey.toUpperCase());if(!eligible)access='0';else {access="(EXISTS(SELECT 1 FROM effective_activity_roles r WHERE r.activity_key=l.activity_key AND r.account_id=? AND r.role='STUDENT')"+(monthlyEnabled(repository)?" OR EXISTS(SELECT 1 FROM program_monthly_subscriptions s WHERE s.activity_key=l.activity_key AND s.account_id=? AND s.active=1)":'')+") AND ("+(monthlyEnabled(repository)?monthlyAudienceSQL(baseMediaAudienceSQL):baseMediaAudienceSQL)+')';values.push(actor,...(monthlyEnabled(repository)?[actor]:[]));values.push(...Array(monthlyEnabled(repository)?4:3).fill(actor));}}
 values.push(klass,klass,klass);return {sql:`(${published}) AND (${access}) AND ${classSQL}`,values};
}
