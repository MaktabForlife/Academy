import {managementError as fail,same} from './management-store.js';
import {isAdminWorkspace,administers,readerPreview} from './workspace-access.js';
import {mayReadSurah} from './surah-websites-access.js';
import {monthlyEnabled} from './monthly-media-policy.js';
const scopeKey=input=>{if(typeof input.activityKey!=='string'||!/^COURSE:[^:]{1,160}$/.test(input.activityKey))throw fail('Choose a Course.');return input.activityKey;};
const uuid=value=>/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value||'');
export async function websiteActivity(repository,auth,input,write=false){
 const p=(sql,...values)=>repository.db.prepare(sql).bind(...values);
 let target;
  let key,row;
  if(input.surahId!==undefined){
   if(!uuid(input.surahId)||typeof input.activityKey!=='string'||!/^PROGRAM:[^:]{1,160}$/.test(input.activityKey))throw fail('Choose a Tafseer surah website.');
   if(!monthlyEnabled(repository))throw fail('Surah websites need the monthly access upgrade.',503);
   key=input.activityKey;target={documents:'program_surah_website_documents',assets:'program_surah_website_assets',column:'surah_id',id:input.surahId,surahId:input.surahId};
   const core=repository.coreDb||repository.db;
   row=await core.prepare("SELECT a.*,s.name surah_name,s.card_key,s.completion_date,s.active surah_active,p.enabled monthly_enabled FROM activities a JOIN program_surahs s USING(activity_key) JOIN program_monthly_media_policies p USING(activity_key) WHERE a.activity_key=? AND a.kind='PROGRAM' AND a.active=1 AND a.lifecycle='ACTIVE' AND s.surah_id=?").bind(key,input.surahId).first();
   if(row){row={...row,programName:row.name,name:row.surah_name,surahId:input.surahId};if(!write&&!row.surah_active)throw fail('This surah website is unavailable.',403,'COURSE_WEBSITE_FORBIDDEN');}
  }else{key=scopeKey(input);target={documents:'course_website_documents',assets:'course_website_assets',column:'activity_key',id:key,surahId:null};row=await p("SELECT * FROM activities WHERE activity_key=? AND kind='COURSE' AND active=1 AND lifecycle='ACTIVE'",key).first();}
  if(!row)throw fail('This Course is unavailable.',403,'COURSE_WEBSITE_FORBIDDEN');
  if(write){if(!auth||!isAdminWorkspace(auth)||!administers(auth,row.activity_key))throw fail('Open Admin with authority for this Course.',403,'COURSE_WEBSITE_FORBIDDEN');}
  else if(!(target.surahId&&row.card_key==='foundations')){
   if(!auth)throw fail('Contact Admin to receive access.',403,'COURSE_WEBSITE_FORBIDDEN');
   const roles=auth.state.roles.filter(r=>same(r.activity_key,row.activity_key)).map(r=>r.role);
   const free=!target.surahId&&auth.workspace==='LEARN'&&await p("SELECT 1 ok FROM course_settings WHERE activity_key=? AND legacy_access_model='FREE' AND policy_review_state='CONFIRMED'",row.activity_key).first();
   const subscribed=target.surahId?mayReadSurah(auth,row):roles.includes('STUDENT')||auth.state.subscriptions.some(r=>same(r.activity_key,row.activity_key));
   if(!(auth.state.account.global_admin||roles.some(r=>['PROGRAM_ADMIN','TEACHER'].includes(r))||readerPreview(auth,row.activity_key)||subscribed||free))throw fail('This Course is outside your access.',403,'COURSE_WEBSITE_FORBIDDEN');
   if(auth.adminView&&!administers(auth,row.activity_key))throw fail('This Course is outside your Admin view.',403,'COURSE_WEBSITE_FORBIDDEN');
  }
  return {area:row,target};
 }
