import {fail} from './protocol.mjs';
// Exact native programme identities are operator-reviewed configuration. Names,
// browser roles and membership in another programme never imply access.
export const navigationKeys=['alimiyah','reboot','arabic-intensive','mothers','hifz'];
export function navigationMappings(env){
 let value;try{value=JSON.parse(env.WEBSITE_PLATFORM_NAVIGATION||'{}');}catch{throw fail('Programme navigation is not configured.',503);}
 if(!value||Array.isArray(value)||typeof value!=='object'||Object.keys(value).some(k=>!navigationKeys.includes(k))||Object.values(value).some(v=>typeof v!=='string'||!/^[-A-Za-z0-9_:]{1,160}$/.test(v))||new Set(Object.values(value).map(v=>v.toLowerCase())).size!==Object.values(value).length)throw fail('Programme navigation is not configured.',503);
 return value;
}
// One SQL snapshot, inside the same batch as the ordered account event. The
// predicates mirror native effective roles, reviewed legacy admin mappings and
// programme membership. This is navigation, never a content grant.
export const navigationSQL=`json_object(
 'programmes',json((SELECT json_group_array(m.key) FROM json_each(?) m JOIN activities x ON x.activity_id=m.value COLLATE NOCASE
 WHERE x.kind='PROGRAM' AND x.active=1 AND x.lifecycle='ACTIVE' AND (a.global_admin=1 OR EXISTS(
 SELECT 1 FROM role_assignments r WHERE r.account_id=a.account_id AND r.activity_key=x.activity_key AND r.active=1 AND r.review_state='CONFIRMED' AND r.role IN('PROGRAM_ADMIN','TEACHER','STUDENT') AND (r.grant_source='EXPLICIT' OR r.grant_source='LEGACY_MAPPED' AND r.legacy_source_role IN('ADMIN','SENIOR')))))))`;
export function programmeChoice(state,key,env){
 if(!['alimiyah','reboot','arabic-intensive','hifz'].includes(key))throw fail('Choose an authorised programme.',403);
 const nativeId=navigationMappings(env)[key],activity=state?.activities.find(x=>x.kind==='PROGRAM'&&x.active&&x.lifecycle==='ACTIVE'&&x.activity_id.toLowerCase()===nativeId?.toLowerCase());
 const context=state?.account.global_admin?state.contexts.find(c=>c.role==='GLOBAL_ADMIN'):state?.contexts.find(c=>c.scope==='COURSE'&&c.courseId.toLowerCase()===nativeId?.toLowerCase()&&!c.mediaOnly&&['PROGRAM_ADMIN','TEACHER','STUDENT','ADMIN','SENIOR'].includes(c.role));
 if(!state?.account.active||!activity||!context)throw fail('This programme is not available to your account.',403);
 const admin=['GLOBAL_ADMIN','PROGRAM_ADMIN','ADMIN'].includes(context.role),mode=['TEACHER','SENIOR'].includes(context.role)?'teach':'learn';
 return {context,destination:key==='hifz'?'https://hifz.maktab4life.org/':(admin?'/academy/admin/':'/academy/')+'#activity/PROGRAM/'+encodeURIComponent(activity.activity_id)+(admin?'':'/'+mode)};
}
