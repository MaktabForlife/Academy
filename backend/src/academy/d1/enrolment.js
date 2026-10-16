import {managementStore,managementError as fail,same,rowChanged} from './management-store.js';
import {payloadHash} from '../../programs/timetable-model.js';
import {createAuthRateLimitKey} from '../../lib/auth-primitives.js';
import {d1Profiles} from './profiles.js';

const uuid=value=>/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value||'');
const adminNumber='27828478639'; // Existing public Academy contact; overridable by Global Admin.
const settingKey='EnrolmentWhatsApp';
const available=`a.active=1 AND a.lifecycle IN ('ACTIVE','DRAFT')`;
const catalogueSQL=`SELECT e.*,a.activity_id,a.kind,a.name,a.active AS activity_active,a.lifecycle FROM academy_enrolment_catalogue e JOIN activities a USING(activity_key)`;
const catalogueDTO=r=>({id:r.entry_id,activityKey:r.activity_key,activityId:r.activity_id,kind:r.kind,name:r.name,year:r.enrolment_year,cost:r.cost_text,active:Boolean(r.active),order:r.display_order,revision:r.revision});
const text=(value,max,label)=>{if(typeof value!=='string'||!value.trim()||value.trim().length>max||/[\x00-\x1f\x7f]/.test(value))throw fail('Enter '+label+'.');return value.trim();};
function contact(input){
 const name=text(input.name,160,'the learner’s name'),whatsapp=text(input.whatsapp,32,'a WhatsApp number including country code');
 const digits=whatsapp.replace(/\D/g,'');if(!/^\+?[0-9 ()-]+$/.test(whatsapp)||digits.length<7||digits.length>15)throw fail('Enter a valid WhatsApp number including country code.');
 if(typeof input.paid!=='boolean')throw fail('Indicate whether payment has been made.');
 return {name,whatsapp,paid:input.paid};
}
function entryIds(input){if(!Array.isArray(input)||!input.length||input.length>30||input.some(id=>!uuid(id))||new Set(input).size!==input.length)throw fail('Choose between 1 and 30 different catalogue entries.');return input;}
async function ready(repository){try{await repository.db.prepare('SELECT request_id FROM academy_enrolment_requests WHERE 0').all();}catch(error){if(/no such table/.test(error.message))throw fail('Enrolment requests are being prepared. Please contact the Academy.',503,'ENROLMENT_SCHEMA_REQUIRED');throw error;}}
async function whatsappNumber(repository){const row=await repository.db.prepare('SELECT setting_value FROM academy_settings WHERE setting_key=?').bind(settingKey).first();return row?.setting_value||adminNumber;}
export async function enrolmentCatalogue(repository){
 await ready(repository);
 const [entries,number]=await Promise.all([repository.db.prepare(catalogueSQL+' WHERE e.active=1 AND '+available+' ORDER BY e.display_order,e.enrolment_year,a.name').all(),whatsappNumber(repository)]);
 return {entries:entries.results.map(({entry_id,activity_id,kind,name,enrolment_year,cost_text,revision})=>({id:entry_id,activityId:activity_id,kind,name,year:enrolment_year,cost:cost_text,revision})),whatsappNumber:number};
}
export async function enrolmentProfile(repository,auth){
 const row=await repository.db.prepare('SELECT whatsapp_number FROM account_contact_details WHERE account_id=?').bind(auth.user.accountid).first();
 return {name:auth.state.account.display_name,whatsapp:row?.whatsapp_number||'',uniqueId:auth.state.account.login_link_id};
}
export async function submitEnrolment(repository,auth,input,request,env){
 await ready(repository);
 if(!uuid(input.operationId)||input.website||input.accountId!==undefined)throw fail('Please complete the registration form again.');
 if(!Array.isArray(input.entries)||input.entries.some(e=>!e||typeof e!=='object'))throw fail('Choose catalogue entries.');
 const person=contact(input),ids=entryIds(input.entries.map(e=>e.id));
 if(input.entries.some(e=>!Number.isInteger(e.revision)||e.revision<1))throw fail('Refresh the catalogue before sending your request.');
 const account=auth?.user.accountid||null,hash=await payloadHash({person,account,entries:input.entries.slice().sort((a,b)=>a.id.localeCompare(b.id))});
 const p=(sql,...values)=>repository.db.prepare(sql).bind(...values);
 const replay=async()=>{const old=await p('SELECT request_id,payload_sha256 FROM academy_enrolment_requests WHERE submission_key=?',input.operationId).first();if(!old)return null;if(old.payload_sha256!==hash)throw fail('This submission identifier belongs to another request.',409,'OPERATION_ID_REUSED');return {received:true,id:old.request_id,replayed:true};};
 const existing=await replay();if(existing)return existing;
 if(!env.AUTH_LOGIN_RATE_LIMITER?.limit)throw fail('Please contact the Academy while the request form is unavailable.',503);
 const key=await createAuthRateLimitKey('enrolment-request',request.headers.get('CF-Connecting-IP')||'local',env);
 if(!(await env.AUTH_LOGIN_RATE_LIMITER.limit({key})).success)throw fail('Please wait a minute before sending another request.',429,'ENROLMENT_RATE_LIMITED');
 const rows=(await p(catalogueSQL+' WHERE e.active=1 AND '+available+' AND e.entry_id IN (SELECT value FROM json_each(?))',JSON.stringify(ids)).all()).results;
 if(rows.length!==ids.length||rows.some(r=>input.entries.find(e=>e.id===r.entry_id)?.revision!==r.revision))throw fail('The catalogue changed. Refresh it and review your selections before sending.',409,'CATALOGUE_CHANGED');
 const id=crypto.randomUUID(),guard=crypto.randomUUID(),now=new Date().toISOString();
 const versions=JSON.stringify(rows.map(r=>({id:r.entry_id,revision:r.revision})));
 const checks=[p(`INSERT INTO academy_write_guards(guard_id,accepted) VALUES(?,NOT EXISTS(SELECT 1 FROM json_each(?) j LEFT JOIN academy_enrolment_catalogue e ON e.entry_id=json_extract(j.value,'$.id') LEFT JOIN activities a USING(activity_key) WHERE e.entry_id IS NULL OR e.active<>1 OR e.revision<>json_extract(j.value,'$.revision') OR a.active<>1 OR a.lifecycle NOT IN ('ACTIVE','DRAFT')))`,guard,versions)];
 if(auth)checks.push(p(`INSERT INTO academy_write_guards(guard_id,accepted) VALUES(?,EXISTS(SELECT 1 FROM accounts a JOIN account_credentials c USING(account_id) JOIN account_sessions s USING(account_id) WHERE a.account_id=? AND a.active=1 AND s.session_id=? AND s.revoked_at IS NULL AND s.expires_at>? AND s.credential_epoch=c.credential_epoch AND c.credential_epoch=?))`,guard+'-account',account,auth.sid,now,auth.state.account.credential_epoch));
 try{await repository.db.batch([...checks,p('INSERT INTO academy_enrolment_requests VALUES(?,?,?,?,?,?,?,1,?,?)',id,input.operationId,hash,account,person.name,person.whatsapp,Number(person.paid),now,now),...rows.map(r=>p('INSERT INTO academy_enrolment_request_items VALUES(?,?,?,?,?,?)',id,r.entry_id,r.activity_key,r.name,r.enrolment_year,r.cost_text)),p('DELETE FROM academy_write_guards WHERE guard_id IN (?,?)',guard,guard+'-account')]);}
 catch(error){const saved=await replay();if(saved)return saved;if(/academy_management_stale/.test(error.message))throw fail('The catalogue or your session changed. Refresh and try again.',409,'CATALOGUE_CHANGED');throw error;}
 return {received:true,id};
}

export function enrolmentManagement(repository,auth){
 const store=managementStore(repository,auth),p=store.p,global=Boolean(auth.state.account.global_admin);
 const own=[...new Set(auth.state.roles.filter(r=>r.role==='PROGRAM_ADMIN').map(r=>r.activity_key))];
 function scopes(input={}){if(!global&&!own.length)throw fail('Only an authorised administrator can open enrolment requests.',403,'FORBIDDEN');if(input.activityKey&&!global&&!own.some(k=>same(k,input.activityKey)))throw fail('Choose a learning area you administer.',403,'FORBIDDEN');return input.activityKey?[input.activityKey]:global?null:own;}
 const within=(key,allowed)=>!allowed||allowed.some(k=>same(k,key));
 const scopeWhere=allowed=>allowed?' AND i.activity_key IN (SELECT value FROM json_each(?))':'';
 async function requestRow(id,allowed){const r=await p('SELECT * FROM academy_enrolment_requests WHERE request_id=?',id).first();if(!r)throw fail('This request has already been deleted.',404,'NOT_FOUND');const items=(await p('SELECT * FROM academy_enrolment_request_items WHERE request_id=?',id).all()).results;if(!items.some(i=>within(i.activity_key,allowed)))throw fail('This request is outside your learning areas.',403,'FORBIDDEN');return {r,items};}
 async function loadData(){return store.load();}
 async function get(input){
  const allowed=scopes(input),filter=[];const values=[];
  if(input.paid==='yes'||input.paid==='no'){filter.push('r.paid=?');values.push(input.paid==='yes'?1:0);}
  if(input.search){const q='%'+text(input.search,160,'a search value')+'%';filter.push('(r.display_name LIKE ? OR r.whatsapp_number LIKE ? OR a.login_link_id LIKE ?)');values.push(q,q,q);}
  if(input.cursor){if(typeof input.cursor.date!=='string'||!uuid(input.cursor.id))throw fail('Choose a valid inbox page.');filter.push('(r.created_at<? OR (r.created_at=? AND r.request_id<?))');values.push(input.cursor.date,input.cursor.date,input.cursor.id);}
  const found=(await p(`SELECT r.*,a.login_link_id FROM academy_enrolment_requests r LEFT JOIN accounts a USING(account_id) WHERE EXISTS(SELECT 1 FROM academy_enrolment_request_items i WHERE i.request_id=r.request_id${scopeWhere(allowed)})${filter.length?' AND '+filter.join(' AND '):''} ORDER BY r.created_at DESC,r.request_id DESC LIMIT 51`,...(allowed?[JSON.stringify(allowed)]:[]),...values).all()).results;
  const page=found.slice(0,50),ids=page.map(r=>r.request_id);
  const items=(await p('SELECT i.*,a.kind,a.activity_id FROM academy_enrolment_request_items i JOIN activities a USING(activity_key) WHERE i.request_id IN (SELECT value FROM json_each(?))'+scopeWhere(allowed),JSON.stringify(ids),...(allowed?[JSON.stringify(allowed)]:[])).all()).results;
  const [entries,activities,number]=await Promise.all([p(catalogueSQL+' WHERE 1=1'+(allowed?' AND e.activity_key IN (SELECT value FROM json_each(?))':'')+' ORDER BY e.enrolment_year DESC,a.name',...(allowed?[JSON.stringify(allowed)]:[])).all(),p("SELECT activity_key,activity_id,kind,name,lifecycle FROM activities WHERE active=1 AND lifecycle IN ('ACTIVE','DRAFT')"+(allowed?' AND activity_key IN (SELECT value FROM json_each(?))':''),...(allowed?[JSON.stringify(allowed)]:[])).all(),whatsappNumber(repository)]);
  return {globalAdmin:global,accountId:auth.user.accountid,whatsappNumber:number,entries:entries.results.map(catalogueDTO),activities:activities.results.map(a=>({key:a.activity_key,id:a.activity_id,kind:a.kind,name:a.name})),requests:page.map(r=>({id:r.request_id,name:r.display_name,whatsapp:r.whatsapp_number,paid:Boolean(r.paid),accountId:r.account_id||'',uniqueId:r.login_link_id||'',revision:r.revision,createdAt:r.created_at,items:items.filter(i=>i.request_id===r.request_id).map(i=>({entryId:i.entry_id,activityKey:i.activity_key,activityId:i.activity_id,kind:i.kind,name:i.activity_name,year:i.enrolment_year,cost:i.cost_text}))})),nextCursor:found.length>50?{date:page.at(-1).created_at,id:page.at(-1).request_id}:null};
 }
 async function saveEntry(input){
  const allowed=scopes(input),activity=text(input.activityKey,160,'a learning area');if(!within(activity,allowed))throw fail('Choose a learning area you administer.',403,'FORBIDDEN');
  if(!uuid(input.id)||!Number.isInteger(input.year)||input.year<1900||input.year>2200||typeof input.active!=='boolean'||!Number.isInteger(input.order)||input.order<0||input.order>10000)throw fail('Enter a valid catalogue year, visibility and order.');
  const cost=text(input.cost,500,'the cost description');
  return store.change('ENROLMENT',activity,'catalogue-save',input,async()=>{
   const data=await loadData(),a=data.activities.find(a=>same(a.activity_key,activity)&&a.active&&['ACTIVE','DRAFT'].includes(a.lifecycle));if(!a)throw fail('Choose an available Program or Course.');
   const current=await p('SELECT * FROM academy_enrolment_catalogue WHERE entry_id=?',input.id).first();
   if(current&&(!same(current.activity_key,activity)||input.baseRevision!==current.revision)||!current&&input.baseRevision!==0)throw rowChanged(current,current?.revision||0);
   const duplicate=await p('SELECT entry_id FROM academy_enrolment_catalogue WHERE activity_key=? AND enrolment_year=? AND entry_id<>?',activity,input.year,input.id).first();if(duplicate)throw fail('This learning area already has a catalogue entry for that year.',409,'CATALOGUE_DUPLICATE');
   const now=new Date().toISOString(),revision=(current?.revision||0)+1;
   return {data,statements:[p('INSERT INTO academy_enrolment_catalogue VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(entry_id) DO UPDATE SET enrolment_year=excluded.enrolment_year,cost_text=excluded.cost_text,active=excluded.active,display_order=excluded.display_order,revision=excluded.revision,updated_at=excluded.updated_at,updated_by_account_id=excluded.updated_by_account_id',input.id,activity,input.year,cost,Number(input.active),input.order,revision,current?.created_at||now,now,auth.user.accountid)],authorityScopes:[activity],result:{id:input.id,revision},fields:['EnrolmentCatalogue']};
  });
 }
 async function saveRequest(input,remove=false){
  const allowed=scopes(input),{r,items}=await requestRow(input.id,allowed),permitted=items.filter(i=>within(i.activity_key,allowed));
  if(!Number.isInteger(input.baseRevision)||input.baseRevision!==r.revision)throw rowChanged(null,r.revision);
  const person=remove?null:contact(input);
  if(!global&&input.accountId!==undefined&&input.accountId!==(r.account_id||''))throw fail('Only Global Admin can link a user.',403,'FORBIDDEN');
  const account=input.accountId===undefined?r.account_id:input.accountId||null;
  const selected=remove?[]:entryIds(input.entries);
  return store.change('ENROLMENT',permitted[0].activity_key,remove?'request-delete':'request-save',input,async()=>{
   const data=await loadData(),fresh=await requestRow(input.id,allowed);if(fresh.r.revision!==input.baseRevision)throw rowChanged(null,fresh.r.revision);
   if(!remove&&account&&!data.accounts.some(a=>same(a.account_id,account)&&(a.active||same(r.account_id,account))))throw fail('Choose an active existing user.');
   const choices=remove?[]:(await p(catalogueSQL+' WHERE e.entry_id IN (SELECT value FROM json_each(?))',JSON.stringify(selected)).all()).results;
   if(!remove&&(choices.length!==selected.length||choices.some(e=>!within(e.activity_key,allowed))))throw fail('Choose catalogue entries within your learning areas.',403,'FORBIDDEN');
   const outside=fresh.items.filter(i=>!within(i.activity_key,allowed)),now=new Date().toISOString(),guard=crypto.randomUUID(),statements=[p('INSERT INTO academy_write_guards(guard_id,accepted) VALUES(?,EXISTS(SELECT 1 FROM academy_enrolment_requests WHERE request_id=? AND revision=?))',guard,input.id,input.baseRevision)];
   if(remove&&(!outside.length||global))statements.push(p('DELETE FROM academy_enrolment_requests WHERE request_id=?',input.id));
   else{
    statements.push(p('UPDATE academy_enrolment_requests SET display_name=?,whatsapp_number=?,paid=?,account_id=?,revision=revision+1,updated_at=? WHERE request_id=?',person?.name||r.display_name,person?.whatsapp||r.whatsapp_number,person?Number(person.paid):r.paid,account,now,input.id));
    statements.push(p('DELETE FROM academy_enrolment_request_items WHERE request_id=?'+(allowed?' AND activity_key IN (SELECT value FROM json_each(?))':''),input.id,...(allowed?[JSON.stringify(allowed)]:[])));
    for(const e of choices){const old=fresh.items.find(i=>i.entry_id===e.entry_id);statements.push(p('INSERT INTO academy_enrolment_request_items VALUES(?,?,?,?,?,?)',input.id,e.entry_id,e.activity_key,old?.activity_name||e.name,old?.enrolment_year||e.enrolment_year,old?.cost_text||e.cost_text));}
   }
   statements.push(p('DELETE FROM academy_write_guards WHERE guard_id=?',guard));
   return {data,statements,authorityScopes:[...new Set([...permitted.map(i=>i.activity_key),...choices.map(e=>e.activity_key)])],result:{id:input.id,deleted:remove,revision:r.revision+1},fields:['EnrolmentRequest']};
  });
 }
 return {async run(action,input={}){
  await ready(repository);scopes(input);
  if(['request-save','request-delete'].includes(action)&&uuid(input.operationId)){
   const receipt=await p("SELECT scope_key FROM operation_receipts WHERE dataset_key='ENROLMENT' AND operation_id=? AND actor_account_id=?",input.operationId,auth.user.accountid).first();
   if(receipt){if(!within(receipt.scope_key,scopes(input)))throw fail('This request is outside your learning areas.',403,'FORBIDDEN');return store.receipt('ENROLMENT',receipt.scope_key,input.operationId,await payloadHash({action,input}));}
  }
  if(action==='get')return get(input);
  if(action==='catalogue-save')return saveEntry(input);
  if(action==='request-save'||action==='request-delete')return saveRequest(input,action==='request-delete');
  if(action==='accounts'){
   if(!global)throw fail('Only Global Admin can link users.',403,'FORBIDDEN');
   const q='%'+text(input.search,160,'a name, WhatsApp number or Login ID')+'%';
   const rows=(await p('SELECT a.account_id,a.display_name,a.login_link_id,c.whatsapp_number FROM accounts a LEFT JOIN account_contact_details c USING(account_id) WHERE a.active=1 AND (a.display_name LIKE ? OR a.login_link_id LIKE ? OR c.whatsapp_number LIKE ?) ORDER BY a.display_name LIMIT 20',q,q,q).all()).results;
   return {accounts:rows.map(a=>({id:a.account_id,name:a.display_name,uniqueId:a.login_link_id,whatsapp:a.whatsapp_number||''}))};
  }
  if(action==='register'){
   if(!global)throw fail('Only Global Admin can register a user here.',403,'FORBIDDEN');
   const {r}=await requestRow(input.id,null),person=contact(input);
   if(r.account_id&&!same(r.account_id,input.accountId))throw fail('This request is already linked to an existing user.',409,'REQUEST_LINKED');
   if(!uuid(input.accountId))throw fail('The new user needs an identifier.');
   return d1Profiles(repository,auth).run('save',{mode:'profile',creating:true,accountId:input.accountId,displayName:person.name,whatsappNumber:person.whatsapp,uniqueId:'',active:true,baseRevision:await payloadHash(null),operationId:input.operationId,enrolmentRequestId:input.id,enrolmentRequestRevision:input.baseRevision});
  }
  if(action==='settings-save'){
   if(!global)throw fail('Only Global Admin can change the Academy WhatsApp contact.',403,'FORBIDDEN');
   const number=text(input.whatsappNumber,15,'an international WhatsApp number using digits only');if(!/^[1-9][0-9]{6,14}$/.test(number))throw fail('Use the country code and digits only.');
   return store.change('ENROLMENT','ACADEMY','settings-save',input,async()=>({data:await loadData(),statements:[p('INSERT INTO academy_settings(setting_key,setting_value,updated_at,updated_by_account_id) VALUES(?,?,?,?) ON CONFLICT(setting_key) DO UPDATE SET setting_value=excluded.setting_value,updated_at=excluded.updated_at,updated_by_account_id=excluded.updated_by_account_id',settingKey,number,new Date().toISOString(),auth.user.accountid)],result:{whatsappNumber:number},fields:['EnrolmentWhatsApp']}));
  }
  throw fail('Unknown enrolment action.',404);
 }};
}
