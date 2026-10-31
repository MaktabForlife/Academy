import {navigationMappings} from './navigation.mjs';
import {fail,sha256} from './protocol.mjs';

// This is an explicit real Global Admin operation, not an automatic timetable
// publication or an identity guessed from a teaching title/display key.
export async function registerMonthlyProgramme(env,auth,input){
 if(env.ACADEMY_WEB_PLATFORM!=='1'||env.ACADEMY_MOU_STUDIO!=='1')throw fail('Monthly programme setup is unavailable.',503,'MOU_STUDIO_DISABLED');
 if(auth.workspace!=='ADMIN'||!auth.state.account.global_admin)throw fail('Current Global Admin authority is required for programme setup.',403,'PROGRAMME_REGISTRATION_FORBIDDEN');
 if(input.programmeKey!=='mothers'||input.accessModel!=='MONTHLY'||input.noMediaMigration!==true)throw fail('Confirm the independent MOU monthly policy and no media migration.');
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.operationId||''))throw fail('This change needs its retry identifier.');
 const nativeId=navigationMappings(env).mothers;if(!nativeId)throw fail('Review the exact native MOU programme mapping before setup.',409,'MOU_MAPPING_REQUIRED');
 const db=env.ACADEMY_DB.withSession('first-primary'),p=(sql,...args)=>db.prepare(sql).bind(...args),actor=auth.user.accountid,activity='PROGRAM:'+nativeId;
 const hash=await sha256(JSON.stringify({programmeKey:'mothers',nativeId,accessModel:'MONTHLY',noMediaMigration:true}));
 const replay=async()=>{const row=await p('SELECT * FROM website_platform_programme_operations WHERE operation_id=?',input.operationId).first();if(!row)return null;if(row.actor_id!==actor||row.payload_hash!==hash)throw fail('This retry belongs to a different setup.',409,'OPERATION_ID_REUSED');return {...JSON.parse(row.result_json),replayed:true};};
 const old=await replay();if(old)return old;
 const existing=await p('SELECT activity_key FROM website_platform_programmes WHERE programme_key=?','mothers').first(),mapping=await p('SELECT offering_id,kind FROM website_platform_timetable_scopes WHERE activity_key=?',activity).first();
 if(existing&&existing.activity_key!==activity||mapping&&(!existing||mapping.offering_id!==nativeId||mapping.kind!=='TAFSEER'))throw fail('This programme already has a different reviewed mapping.',409,'PROGRAMME_MAPPING_CONFLICT');
 const result={programmeKey:'mothers',offeringId:nativeId,activityKey:activity,accessModel:'MONTHLY',mediaImported:false,authority:'ACADEMY',registered:true,alreadyRegistered:Boolean(existing)},guard=crypto.randomUUID(),now=Date.now();
 try{await db.batch([
  p(`INSERT INTO website_platform_guards VALUES(?,EXISTS(SELECT 1 FROM website_platform_account_state a JOIN account_sessions s ON s.account_id=a.account_id COLLATE NOCASE WHERE a.account_id=? COLLATE NOCASE AND a.active=1 AND a.admitted=1 AND a.global_admin=1 AND a.epoch=? AND s.session_id=? AND s.credential_epoch=a.epoch AND s.revoked_at IS NULL AND s.expires_at>?) AND EXISTS(SELECT 1 FROM activities WHERE activity_key=? AND activity_id=? AND kind='PROGRAM') AND (SELECT enabled FROM website_platform_control WHERE singleton=1)=1)`,guard,actor,auth.state.account.credential_epoch,auth.sid,new Date(now).toISOString(),activity,nativeId),
  ...(!existing?[
   p("INSERT INTO website_platform_programmes VALUES(?,'mothers','MONTHLY',1)",activity),
   // TAFSEER is the existing internal monthly gate family. The signed programme
   // discriminator keeps MOU independent of Tafseer and the Course catalogue.
   p("INSERT INTO website_platform_timetable_scopes(activity_key,offering_id,kind) VALUES(?,?,'TAFSEER')",activity,nativeId),
   p('INSERT INTO website_platform_access_scopes(activity_key,enabled) VALUES(?,1)',activity),
   p("INSERT INTO website_platform_access_ownership VALUES(?,'ACADEMY',NULL,NULL,NULL,'',0,?)",activity,now),
   p("INSERT INTO website_platform_access_dirty(activity_key,account_id) VALUES(?,'')",activity)
  ]:[]),
  p('INSERT INTO website_platform_programme_operations VALUES(?,?,?,?,?)',input.operationId,actor,hash,JSON.stringify(result),now),p('DELETE FROM website_platform_guards WHERE guard_id=?',guard)
 ]);}catch(error){const saved=await replay();if(saved)return saved;throw fail('Programme setup changed or your current authority ended. Retry safely.',409,'PROGRAMME_REGISTRATION_CONFLICT');}
 return result;
}
