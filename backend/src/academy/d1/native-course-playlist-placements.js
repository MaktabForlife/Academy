import {managementError as fail} from './management-store.js';

// Placement is checked presentation metadata. It never creates a role, purchase,
// membership or a dated timetable session.
export async function nativeCoursePlaylistPlacements(repository,session,input){
 const db=repository.coreDb,state=await repository.session(session.session_id,session.account_id,session.epoch);
 if(!state)throw fail('Your Academy session has ended.',401,'SESSION_ENDED');
 const owner=await db.prepare("SELECT m.activity_key,o.state FROM website_platform_timetable_scopes m JOIN website_platform_access_ownership o USING(activity_key) JOIN website_platform_access_scopes s USING(activity_key) WHERE m.offering_id=? AND m.kind='COURSE' AND s.enabled=1").bind(input.offeringId).first();
 const permitted=key=>state.account.global_admin||state.roles.some(r=>r.role==='PROGRAM_ADMIN'&&r.activity_key.toUpperCase()===key.toUpperCase());
 if(!owner||owner.state!=='STUDIO'||!permitted(owner.activity_key))throw fail('Use current Course Admin ownership.',403,'MEDIA_FORBIDDEN');
 const after=typeof input.after==='string'?input.after:'',selected=input.selected;
 if(after.length>180||selected!==undefined&&(!Array.isArray(selected)||selected.length<1||selected.length>20||selected.some(x=>typeof x.activityKey!=='string'||x.activityKey.length>180||typeof x.classId!=='string'||x.classId.length>180)))throw fail('Choose one to twenty Course or Program locations.');
 const fields="a.activity_key,a.name,m.offering_id,m.kind,o.state ownership,s.enabled",join="JOIN activities a ON a.activity_key=c.activity_key COLLATE NOCASE JOIN website_platform_timetable_scopes m ON m.activity_key=a.activity_key COLLATE NOCASE JOIN website_platform_access_scopes s ON s.activity_key=a.activity_key COLLATE NOCASE LEFT JOIN website_platform_access_ownership o ON o.activity_key=a.activity_key COLLATE NOCASE";
 const role="EXISTS(SELECT 1 FROM effective_activity_roles r WHERE r.account_id=? COLLATE NOCASE AND r.activity_key=a.activity_key COLLATE NOCASE AND r.role='PROGRAM_ADMIN')";
 const candidates=state.account.global_admin?"SELECT activity_key FROM website_platform_access_scopes WHERE activity_key>? COLLATE NOCASE ORDER BY activity_key COLLATE NOCASE LIMIT 51":"SELECT DISTINCT activity_key FROM role_assignments INDEXED BY one_active_scoped_role WHERE account_id=? COLLATE NOCASE AND active=1 AND activity_key>? COLLATE NOCASE ORDER BY activity_key COLLATE NOCASE LIMIT 51";
 const rows=(await db.prepare(`WITH c AS MATERIALIZED (${candidates}) SELECT ${fields},${state.account.global_admin?'1':role} permitted FROM c ${join} WHERE a.active=1 AND a.lifecycle='ACTIVE' ORDER BY c.activity_key COLLATE NOCASE`).bind(...(state.account.global_admin?[after]:[state.account.account_id,after]),...(state.account.global_admin?[]:[state.account.account_id])).all()).results;
 const locations=rows.slice(0,50).filter(r=>r.permitted&&r.enabled&&r.ownership!=='FROZEN').map(r=>({activityKey:r.activity_key,offeringId:r.offering_id,name:r.name,kind:r.kind}));
 let classes=[];
 if(input.activityKey){const location=await db.prepare(`SELECT ${fields},${state.account.global_admin?'1':role} permitted FROM (SELECT ? activity_key)c ${join} WHERE a.active=1 AND a.lifecycle='ACTIVE'`).bind(...(state.account.global_admin?[]:[state.account.account_id]),input.activityKey).first();
  if(!location?.permitted||!location.enabled||location.ownership==='FROZEN')throw fail('Choose a current permitted location.',403,'MEDIA_FORBIDDEN');
  if(location.activity_key.startsWith('PROGRAM:'))classes=(await db.prepare('SELECT class_id id,name,academic_year year FROM classes WHERE activity_key=? AND active=1 ORDER BY class_id LIMIT 201').bind(location.activity_key).all()).results;
  if(classes.length>200)throw fail('Choose a smaller recurring class scope.',409);
 }
 let placements=[];
 if(selected){
  const found=(await db.prepare(`SELECT json_extract(j.value,'$.activityKey') requested_activity,json_extract(j.value,'$.classId') requested_class,a.activity_key,a.name,m.offering_id,s.enabled,o.state ownership,cl.class_id,cl.name class_name,${state.account.global_admin?'1':role} permitted FROM json_each(?) j JOIN activities a ON a.activity_key=json_extract(j.value,'$.activityKey') COLLATE NOCASE JOIN website_platform_timetable_scopes m ON m.activity_key=a.activity_key COLLATE NOCASE JOIN website_platform_access_scopes s ON s.activity_key=a.activity_key COLLATE NOCASE LEFT JOIN website_platform_access_ownership o ON o.activity_key=a.activity_key COLLATE NOCASE LEFT JOIN classes cl ON cl.activity_key=a.activity_key COLLATE NOCASE AND cl.class_id=json_extract(j.value,'$.classId') COLLATE NOCASE AND cl.active=1 WHERE a.active=1 AND a.lifecycle='ACTIVE'`).bind(...(state.account.global_admin?[]:[state.account.account_id]),JSON.stringify(selected)).all()).results;
  if(found.length!==selected.length||found.some(r=>!r.permitted||!r.enabled||r.ownership==='FROZEN'||r.requested_class&&!r.class_id))throw fail('A selected location or recurring class is no longer available.',409,'PLAYLIST_PLACEMENT_CHANGED');
  placements=found.map(r=>({activityKey:r.activity_key,offeringId:r.offering_id,classId:r.class_id||'',title:r.name,className:r.class_name||''}));
  if(new Set(placements.map(p=>p.activityKey.toUpperCase()+'|'+p.classId.toUpperCase())).size!==placements.length)throw fail('Choose each location once.');
 }
 const current=await repository.session(session.session_id,session.account_id,session.epoch),fresh=await db.prepare('SELECT state FROM website_platform_access_ownership WHERE activity_key=?').bind(owner.activity_key).first();
 if(!current||fresh?.state!=='STUDIO'||!current.account.global_admin&&!current.roles.some(r=>r.role==='PROGRAM_ADMIN'&&r.activity_key.toUpperCase()===owner.activity_key.toUpperCase()))throw fail('Your account or Course ownership changed.',401,'SESSION_ENDED');
 return {schema:'COURSE_PLAYLIST_PLACEMENTS_V1',offeringId:input.offeringId,ownerActivityKey:owner.activity_key,locations,classes,placements,more:rows.length>50,next:rows.length>50?rows[49].activity_key:null,checkedAt:Date.now()};
}
