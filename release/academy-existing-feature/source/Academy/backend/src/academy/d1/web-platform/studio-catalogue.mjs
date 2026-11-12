import {fail,id,integer} from './protocol.mjs';

// Presentation metadata only. Per-offering reads and writes retain their own
// current native scope, ownership and final Target authority checks.
export async function studioAccessCatalogue(db,auth,input){
 if(auth.workspace!=='ADMIN')throw fail('Open access management in Admin.',403,'ADMIN_SCOPE_REQUIRED');
 const account=auth.state.account,now=new Date().toISOString();
 const actor=await db.prepare(`SELECT a.account_id,a.global_admin FROM website_platform_account_state a JOIN account_sessions s ON s.account_id=a.account_id COLLATE NOCASE
 WHERE s.session_id=? AND a.account_id=? COLLATE NOCASE AND a.active=1 AND a.admitted=1 AND a.epoch=? AND s.credential_epoch=a.epoch AND s.revoked_at IS NULL AND s.expires_at>?`)
 .bind(auth.sid,account.account_id,account.credential_epoch,now).first();
 if(!actor)throw fail('Your Academy session has ended.',401,'SESSION_ENDED');
 if(!actor.global_admin&&!await db.prepare("SELECT 1 FROM effective_activity_roles WHERE account_id=? COLLATE NOCASE AND role='PROGRAM_ADMIN' LIMIT 1").bind(actor.account_id).first())throw fail('Current Admin authority is required.',403,'ADMIN_SCOPE_REQUIRED');
 const area=input.area||null;if(area&&!['tafseer','mothers','courses'].includes(area))throw fail('Choose a learning area.');
 const after=input.cursor?id(input.cursor):'',limit=input.limit===undefined?50:integer(input.limit,1,50);
 const fields=`c.activity_key,t.offering_id,t.kind,a.name,a.active,a.lifecycle,s.enabled,s.revision,o.state ownership,p.programme_key,p.enabled programme_enabled`;
 const joins=`LEFT JOIN website_platform_access_scopes s ON s.activity_key=c.activity_key COLLATE NOCASE
 LEFT JOIN website_platform_timetable_scopes t ON t.activity_key=c.activity_key COLLATE NOCASE LEFT JOIN activities a ON a.activity_key=c.activity_key COLLATE NOCASE
 LEFT JOIN website_platform_access_ownership o INDEXED BY website_platform_ownership_nocase ON o.activity_key=c.activity_key COLLATE NOCASE LEFT JOIN website_platform_programmes p ON p.activity_key=c.activity_key COLLATE NOCASE`;
 const role=`EXISTS(SELECT 1 FROM effective_activity_roles r WHERE r.account_id=? COLLATE NOCASE AND r.activity_key=c.activity_key COLLATE NOCASE AND r.role='PROGRAM_ADMIN')`;
 let candidates,values=[];
 if(area==='mothers'){
  // programme_key is unique: never walk every Course to find the MOU row.
  candidates=`SELECT activity_key FROM website_platform_programmes WHERE programme_key='mothers' AND activity_key>? COLLATE NOCASE`;values=[after];
 }else{
  const prefix=area==='courses'?'COURSE':area==='tafseer'?'PROGRAM':null,lower=prefix&&after.toUpperCase()<prefix+':'?prefix+':':after,range=prefix?' AND activity_key<? COLLATE NOCASE':'';
  candidates=actor.global_admin?`SELECT activity_key FROM website_platform_access_scopes WHERE activity_key>? COLLATE NOCASE${range} ORDER BY activity_key COLLATE NOCASE LIMIT ?`:
  `SELECT DISTINCT activity_key FROM role_assignments INDEXED BY one_active_scoped_role WHERE account_id=? COLLATE NOCASE AND active=1 AND activity_key>? COLLATE NOCASE${range} ORDER BY activity_key COLLATE NOCASE LIMIT ?`;
  values=[...(actor.global_admin?[]:[actor.account_id]),lower,...(prefix?[prefix+';']:[]),limit+1];
 }
 // Page the indexed candidate keys BEFORE filtering status/type/role. Inactive
 // or other programme kinds cannot cause an unbounded scan to fill a page.
 const sql=`WITH c AS MATERIALIZED (${candidates}) SELECT ${fields},${actor.global_admin?'1':role} permitted FROM c ${joins} ORDER BY c.activity_key COLLATE NOCASE`;
 if(!actor.global_admin)values.push(actor.account_id);
 const rows=(await db.prepare(sql).bind(...values).all()).results,page=rows.slice(0,limit);
 const items=page.filter(row=>row.permitted&&row.active===1&&row.lifecycle==='ACTIVE'&&['COURSE','TAFSEER'].includes(row.kind)&&row.offering_id&&row.revision!==null&&(!area||area===(row.kind==='COURSE'?'courses':row.programme_key==='mothers'?'mothers':'tafseer'))).map(row=>({
  activityKey:row.activity_key,offeringId:row.offering_id,title:row.name,kind:row.kind,
  area:row.kind==='COURSE'?'courses':row.programme_key==='mothers'?'mothers':'tafseer',
  enabled:Boolean(row.enabled)&&row.programme_enabled!==0,ownership:row.ownership||'ACADEMY',revision:row.revision
 }));
 return {success:true,schema:'STUDIO_ACCESS_CATALOGUE_V1',items,more:rows.length>limit,nextCursor:rows.length>limit?page.at(-1).activity_key:null};
}
