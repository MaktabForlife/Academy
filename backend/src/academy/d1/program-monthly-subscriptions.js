import {managementError as fail,same} from './management-store.js';
import {actualState,hasAdminAuthority,isAdminWorkspace} from './workspace-access.js';
import {assessmentRolesSQL,validDate,cleanText} from './assessment-store.js';
import {payloadHash} from '../../programs/timetable-model.js';
import {monthlyEnabled} from './monthly-media-policy.js';

export const validMonth=value=>typeof value==='string'&&/^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(value);
export function programMonthlySubscriptions(repository,auth){
 const db=repository.coreDb||repository.db,p=(sql,...values)=>db.prepare(sql).bind(...values),actor=auth.user.accountid;
 let area,policy;
 async function prepare(input){
  if(!monthlyEnabled(repository))throw fail('Monthly subscriptions need their database upgrade and feature configuration.',503,'MONTHLY_SCHEMA_REQUIRED');
  if(typeof input.activityKey!=='string'||input.activityKey.length>200)throw fail('Choose a Program.');
  if(!isAdminWorkspace(auth)||!hasAdminAuthority(auth,input.activityKey))throw fail('Open Admin for a Program you administer.',403,'FORBIDDEN');
  area=await p("SELECT activity_key,activity_id,name FROM activities WHERE activity_key=? COLLATE NOCASE AND kind='PROGRAM' AND active=1 AND lifecycle='ACTIVE'",input.activityKey).first();
  if(!area)throw fail('Program not found.',404);
  policy=await p('SELECT * FROM program_monthly_media_policies WHERE activity_key=?',area.activity_key).first();
 }
 async function receipt(input,hash){
  const r=await p("SELECT * FROM operation_receipts WHERE dataset_key='PROGRAM_MONTHLY_SUBSCRIPTIONS' AND scope_key=? AND operation_id=?",area.activity_key,input.operationId).first();
  if(!r)return null;
  if(!same(r.actor_account_id,actor)||r.payload_sha256!==hash)throw fail('This retry identifier belongs to another change.',409,'OPERATION_ID_REUSED');
  return {...JSON.parse(r.result_json),replayed:true};
 }
 async function change(action,input,build){
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.operationId||''))throw fail('This change needs its retry identifier.');
  const hash=await payloadHash({action,input}),saved=await receipt(input,hash);if(saved)return saved;
  if(Number(input.policyRevision)!==(policy?.revision||0))throw fail('The register changed. Your draft is kept; refresh and review it.',409,'ROW_CHANGED');
  const version=await p('SELECT version FROM academy_write_state WHERE singleton=1').first();
  const {statements,details,result}=await build(),guard=crypto.randomUUID(),now=new Date().toISOString();
  try{
   await db.batch([
    p(`INSERT INTO academy_write_guards(guard_id,accepted) VALUES(?,EXISTS(SELECT 1 FROM academy_write_state WHERE singleton=1 AND version=?)
     AND coalesce((SELECT revision FROM program_monthly_media_policies WHERE activity_key=?),0)=?
     AND EXISTS(SELECT 1 FROM activities WHERE activity_key=? AND active=1 AND lifecycle='ACTIVE')
     AND EXISTS(SELECT 1 FROM accounts a JOIN account_credentials c USING(account_id) JOIN account_sessions s USING(account_id)
      WHERE a.account_id=? AND a.active=1 AND c.pin_setup=1 AND length(trim(c.pin_hash))>0 AND c.credential_epoch=?
      AND s.session_id=? AND s.revoked_at IS NULL AND s.credential_epoch=c.credential_epoch AND s.expires_at>?
      AND (EXISTS(SELECT 1 FROM global_role_assignments g WHERE g.account_id=a.account_id AND g.active=1 AND g.role='GLOBAL_ADMIN' AND g.review_state='CONFIRMED')
       OR (?=0 AND EXISTS(SELECT 1 FROM (${assessmentRolesSQL}) r WHERE r.account_id=a.account_id AND r.activity_key=? AND r.role='PROGRAM_ADMIN')))))`,guard,version.version,area.activity_key,policy?.revision||0,area.activity_key,actor,actualState(auth).account.credential_epoch,auth.sid,now,Number(!['save','grid-save'].includes(action)),area.activity_key),
    ...statements,
    p('INSERT INTO audit_events(event_id,occurred_at,actor_account_id,authority,scope_key,action,record_kind,record_id,changed_fields_json) VALUES(?,?,?,?,?,?,?,?,?)',crypto.randomUUID(),now,actor,actualState(auth).account.global_admin?'GLOBAL_ADMIN':'PROGRAM_ADMIN',area.activity_key,action,'PROGRAM_MONTHLY_SUBSCRIPTIONS',input.operationId,JSON.stringify(details)),
    p("INSERT INTO operation_receipts(dataset_key,scope_key,operation_id,payload_sha256,result_json,actor_account_id,completed_at) VALUES('PROGRAM_MONTHLY_SUBSCRIPTIONS',?,?,?,?,?,?)",area.activity_key,input.operationId,hash,JSON.stringify(result),actor,now),
    p('UPDATE academy_write_state SET version=version+1 WHERE singleton=1'),p('DELETE FROM academy_write_guards WHERE guard_id=?',guard)
   ]);
   return result;
  }catch(error){const recovered=await receipt(input,hash);if(recovered)return recovered;if(/academy_management_stale|CHECK constraint failed/.test(error.message))throw fail('The register or your authority changed. Your draft is kept; refresh before saving.',409,'ROW_CHANGED');throw error;}
 }
 async function get(input){
  const available=Boolean(policy||area.name.trim().toLowerCase()==='tafseer');
  if(!available)return {available:false};
  const timezone=(await p('SELECT timezone FROM program_settings WHERE activity_key=?',area.activity_key).first())?.timezone||'Africa/Johannesburg';
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit'}).formatToParts(new Date()).map(p=>[p.type,p.value]));
  const currentMonth=parts.year+'-'+parts.month;if(input.month===undefined||input.month==='')input={...input,month:currentMonth};
  const classes=(await p('SELECT class_id,name,active FROM classes WHERE activity_key=? ORDER BY name',area.activity_key).all()).results;
  if(!policy)return {available:true,prepared:false,canConfigure:Boolean(actualState(auth).account.global_admin),currentMonth,month:input.month,classes};
  if(!validMonth(input.month))throw fail('Choose a month including its year.');
  const search=cleanText(input.search||'',100,'a student search',true),after=cleanText(input.after||'',200,'a page',true);
  const rows=(await p(`SELECT a.account_id,a.display_name,a.active,coalesce(s.active,0) subscribed,coalesce(s.revision,0) revision,
   coalesce(s.class_ids_json,'[]') class_ids_json,coalesce(s.payment_date,'') payment_date,coalesce(s.payment_reference,'') payment_reference,coalesce(s.note,'') note,s.updated_at,s.updated_by_account_id,
   (SELECT json_group_array(DISTINCT c.class_id) FROM class_memberships c WHERE c.activity_key=? AND c.account_id=a.account_id AND (c.start_date IS NULL OR c.start_date<=date(?||'-01','+1 month','-1 day')) AND (c.end_date IS NULL OR c.end_date>=?||'-01') AND (c.active=1 OR c.start_date IS NOT NULL AND c.end_date IS NOT NULL)) suggested_classes
   FROM accounts a LEFT JOIN program_monthly_subscriptions s ON s.account_id=a.account_id AND s.activity_key=? AND s.lesson_month=?
   WHERE a.account_id>? AND (?='' OR instr(lower(a.display_name||' '||a.account_id),lower(?))>0)
   AND (s.account_id IS NOT NULL OR EXISTS(SELECT 1 FROM effective_activity_roles r WHERE r.account_id=a.account_id AND r.activity_key=? AND r.role='STUDENT') OR length(?)>=2)
   ORDER BY a.account_id LIMIT 51`,area.activity_key,input.month,input.month,area.activity_key,input.month,after,search,search,area.activity_key,search).all()).results;
  return {available:true,prepared:true,policy:{enabled:Boolean(policy.enabled),retainRecordings:true,revision:policy.revision},canConfigure:Boolean(actualState(auth).account.global_admin),currentMonth,month:input.month,classes,students:rows.slice(0,50).map(r=>({accountId:r.account_id,name:r.display_name,active:Boolean(r.active),subscribed:Boolean(r.subscribed),revision:r.revision,classIds:JSON.parse(r.class_ids_json),suggestedClassIds:JSON.parse(r.suggested_classes),paymentDate:r.payment_date,paymentReference:r.payment_reference,note:r.note,updatedAt:r.updated_at,updatedBy:r.updated_by_account_id})),after:rows.length>50?rows[49].account_id:null};
 }
 async function configure(input){
  if(!actualState(auth).account.global_admin)throw fail('Only Global Admin can prepare or activate monthly protection.',403,'FORBIDDEN');
  if(!policy&&area.name.trim().toLowerCase()!=='tafseer')throw fail('Select the existing Tafseer Program before preparing its register.',400);
  if(!['prepare','activate'].includes(input.mode))throw fail('Choose prepare or activate.');
  return change('configure',input,async()=>{
   const now=new Date().toISOString();
   if(input.mode==='activate'){
    if(!policy||input.reviewed!==true||!await p('SELECT 1 ok FROM program_monthly_subscriptions WHERE activity_key=? AND active=1 LIMIT 1',area.activity_key).first())throw fail('Prepare and review the historical paid-month register before activation.',409,'MONTHLY_REVIEW_REQUIRED');
    return {statements:[p('UPDATE program_monthly_media_policies SET enabled=1,revision=revision+1,updated_at=?,updated_by_account_id=? WHERE activity_key=?',now,actor,area.activity_key)],details:{enabled:true},result:{enabled:true,revision:policy.revision+1}};
   }
   if(policy)throw fail('The register is already prepared.',409);
   return {statements:[p('INSERT INTO program_monthly_media_policies(activity_key,updated_at,updated_by_account_id) VALUES(?,?,?)',area.activity_key,now,actor)],details:{prepared:true,retainedRecordings:true},result:{prepared:true,revision:1}};
  });
 }
 function suggestedClasses(month,memberships,classes,existing=[]){
  if(existing.length)return existing;
  const start=month+'-01',end=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),0)).toISOString().slice(0,10);
  const ids=[...new Set(memberships.filter(c=>(c.active||c.start_date&&c.end_date)&&(!c.start_date||c.start_date<=end)&&(!c.end_date||c.end_date>=start)).map(c=>c.class_id))];
  return ids.length?ids:classes.length===1?[classes[0].class_id]:[];
 }
 async function grid(input){
  const available=Boolean(policy||area.name.trim().toLowerCase()==='tafseer');if(!available)return {available:false};
  const years=input.years??[2024,2025,2026];
  if(!Array.isArray(years)||!years.length||years.length>5||years.some(y=>!Number.isInteger(y)||y<1000||y>9999)||new Set(years).size!==years.length)throw fail('Choose up to five different calendar years.');
  const months=years.slice().sort().flatMap(y=>Array.from({length:12},(_,m)=>y+'-'+String(m+1).padStart(2,'0')));
  const timezone=(await p('SELECT timezone FROM program_settings WHERE activity_key=?',area.activity_key).first())?.timezone||'Africa/Johannesburg';
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit'}).formatToParts(new Date()).map(p=>[p.type,p.value]));
  const classes=(await p('SELECT class_id,name,active FROM classes WHERE activity_key=? ORDER BY name',area.activity_key).all()).results;
  const base={available:true,prepared:Boolean(policy),canConfigure:Boolean(actualState(auth).account.global_admin),currentMonth:parts.year+'-'+parts.month,years:years.slice().sort(),classes,...(policy?{policy:{enabled:Boolean(policy.enabled),retainRecordings:true,revision:policy.revision}}:{})};
  if(!policy)return base;
  const search=cleanText(input.search||'',100,'a student search',true);let name='',id='';
  if(input.after){try{const cursor=JSON.parse(input.after);if(!Array.isArray(cursor)||cursor.length!==2)throw Error();[name,id]=cursor;}catch{throw fail('Choose a valid student page.');}if(typeof name!=='string'||name.length>200||typeof id!=='string'||id.length>200)throw fail('Choose a valid student page.');}
  const page=(await p(`SELECT a.account_id,a.display_name,a.active,lower(a.display_name) sort_name FROM accounts a
   WHERE (lower(a.display_name)>? OR (lower(a.display_name)=? AND a.account_id>?)) AND (?='' OR instr(lower(a.display_name||' '||a.account_id),lower(?))>0)
   AND (EXISTS(SELECT 1 FROM effective_activity_roles r WHERE r.account_id=a.account_id AND r.activity_key=? AND r.role='STUDENT')
    OR EXISTS(SELECT 1 FROM program_monthly_subscriptions s WHERE s.account_id=a.account_id AND s.activity_key=?)
    OR EXISTS(SELECT 1 FROM class_memberships c WHERE c.account_id=a.account_id AND c.activity_key=?))
   ORDER BY lower(a.display_name),a.account_id LIMIT 51`,name,name,id,search,search,area.activity_key,area.activity_key,area.activity_key).all()).results;
  const rows=page.slice(0,50),ids=JSON.stringify(rows.map(r=>r.account_id));
  const [subscriptions,memberships]=(await db.batch([
   p('SELECT account_id,lesson_month,active,revision,class_ids_json FROM program_monthly_subscriptions WHERE activity_key=? AND account_id IN(SELECT value FROM json_each(?)) AND lesson_month IN(SELECT value FROM json_each(?))',area.activity_key,ids,JSON.stringify(months)),
   p('SELECT account_id,class_id,start_date,end_date,active FROM class_memberships WHERE activity_key=? AND account_id IN(SELECT value FROM json_each(?))',area.activity_key,ids)
  ])).map(r=>r.results);
  return {...base,students:rows.map(r=>{
   const saved=subscriptions.filter(s=>same(s.account_id,r.account_id)),history=memberships.filter(m=>same(m.account_id,r.account_id));
   return {accountId:r.account_id,name:r.display_name,active:Boolean(r.active),months:Object.fromEntries(saved.map(s=>[s.lesson_month,{subscribed:Boolean(s.active),revision:s.revision,classIds:JSON.parse(s.class_ids_json)}])),suggestedClassIds:Object.fromEntries(months.map(m=>[m,suggestedClasses(m,history,classes)]))};
  }),after:page.length>50?JSON.stringify([rows.at(-1).sort_name,rows.at(-1).account_id]):null};
 }
 async function save(input,asGrid=false){
  if(!policy)throw fail('Prepare the monthly register first.',409);
  const entries=Array.isArray(input.entries)?input.entries.map(e=>({...e,month:asGrid?e?.month:input.month})):[];
  if(!entries.length||entries.length>(asGrid?500:100)||entries.some(e=>typeof e.accountId!=='string'||!validMonth(e.month))||new Set(entries.map(e=>JSON.stringify([e.accountId.toUpperCase(),e.month]))).size!==entries.length)throw fail(asGrid?'Save up to 500 different student/month changes together.':'Choose a valid month and up to 100 different student changes.');
  return change(asGrid?'grid-save':'save',input,async()=>{
   const statements=[],details=[],rows=[],now=new Date().toISOString(),ids=JSON.stringify([...new Set(entries.map(e=>e.accountId))]),cells=JSON.stringify(entries.map(e=>({accountId:e.accountId,month:e.month})));
   const [accounts,existing,classes,memberships]=(await db.batch([
    p('SELECT account_id,active FROM accounts WHERE account_id IN(SELECT value FROM json_each(?))',ids),
    p("SELECT s.* FROM program_monthly_subscriptions s JOIN json_each(?) e ON s.account_id=json_extract(e.value,'$.accountId') COLLATE NOCASE AND s.lesson_month=json_extract(e.value,'$.month') WHERE s.activity_key=?",cells,area.activity_key),
    p('SELECT class_id FROM classes WHERE activity_key=?',area.activity_key),
    p('SELECT account_id,class_id,start_date,end_date,active FROM class_memberships WHERE activity_key=? AND account_id IN(SELECT value FROM json_each(?))',area.activity_key,ids)
   ])).map(r=>r.results);
   const removalReason=asGrid?cleanText(input.removalReason||'',500,'a reason for removing access',true):'';
   for(const e of entries){
    if(typeof e.subscribed!=='boolean'||!Number.isInteger(e.revision))throw fail('Review each changed student and month.');
    const a=accounts.find(a=>same(a.account_id,e.accountId));if(!a||e.subscribed&&!a.active)throw fail('Choose an existing active account before granting access.');
    const old=existing.find(r=>same(r.account_id,a.account_id)&&r.lesson_month===e.month);
    if((old?.revision||0)!==e.revision)throw fail('A student entry changed. Your draft is kept; review the saved entry.',409,'ROW_CHANGED');
    const ids=e.classIds??(asGrid?suggestedClasses(e.month,memberships.filter(m=>same(m.account_id,a.account_id)),classes,JSON.parse(old?.class_ids_json||'[]')):null);
    if(!Array.isArray(ids)||ids.length>50||ids.some(v=>typeof v!=='string'||!v||v.length>160)||new Set(ids).size!==ids.length)throw fail('Review each changed student and covered class.');
    const known=classes.filter(c=>ids.includes(c.class_id));if(e.subscribed&&(!ids.length||known.length!==ids.length))throw fail('Select the Tafseer classes covered by this paid month.');
    const removing=Boolean(old?.active&&!e.subscribed);
    const note=asGrid?(removing?removalReason:old?.note||''):cleanText(e.note||'',500,'a note',true),reference=asGrid?old?.payment_reference||'':cleanText(e.paymentReference||'',100,'a payment reference',true),paymentDate=asGrid?old?.payment_date||'':e.paymentDate||'';
    if(paymentDate&&!validDate(paymentDate))throw fail('Choose a valid payment date.');if(removing&&!note.trim())throw fail('Enter a reason when removing month access.');
    rows.push({activity_key:area.activity_key,account_id:a.account_id,lesson_month:e.month,active:Number(e.subscribed),class_ids_json:JSON.stringify(ids),payment_date:paymentDate,payment_reference:reference,note,updated_at:now,updated_by_account_id:actor});
    details.push({accountId:a.account_id,month:e.month,before:old||null,after:{subscribed:e.subscribed,classIds:ids,paymentDate,paymentReference:reference,note}});
   }
   const columns=['activity_key','account_id','lesson_month','active','class_ids_json','payment_date','payment_reference','note','updated_at','updated_by_account_id'];
   statements.push(p(`INSERT INTO program_monthly_subscriptions(${columns.join(',')}) SELECT ${columns.map(c=>"json_extract(value,'$."+c+"')").join(',')} FROM json_each(?) WHERE 1 ON CONFLICT(activity_key,account_id,lesson_month) DO UPDATE SET active=excluded.active,class_ids_json=excluded.class_ids_json,payment_date=excluded.payment_date,payment_reference=excluded.payment_reference,note=excluded.note,revision=program_monthly_subscriptions.revision+1,updated_at=excluded.updated_at,updated_by_account_id=excluded.updated_by_account_id`,JSON.stringify(rows)));
   statements.push(p('UPDATE program_monthly_media_policies SET revision=revision+1,updated_at=?,updated_by_account_id=? WHERE activity_key=?',now,actor,area.activity_key));
   return {statements,details,result:{saved:entries.length,revision:policy.revision+1}};
  });
 }

 return {async run(action,input){await prepare(input);if(action==='get')return get(input);if(action==='grid')return grid(input);if(action==='grid-save')return save(input,true);if(action==='configure')return configure(input);if(action==='save')return save(input);throw fail('Unknown monthly subscription action.',404);}};
}
