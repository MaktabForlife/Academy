import {academyD1Repository} from '../../backend/src/academy/d1/repository.js';
import {verifyPin as verifyStoredPin,createSaltedPinHash} from '../../backend/src/lib/auth-primitives.js';
import {isSharedPinHash,verifySharedPin,createSharedPinHash} from '../../backend/src/lib/shared-pin-credential.js';
import {canonical,requireThat,reject,safeInt,ascii,bytes,b64u,sha256,vectorDigest} from './codec.mjs';

const pick=(row,keys)=>Object.fromEntries(keys.filter(k=>Object.hasOwn(row,k)).map(k=>[k,row[k]]));
const ids=value=>requireThat(typeof value==='string'&&bytes(value).length>0&&bytes(value).length<=180&&!/[\u0000-\u0020\u007f]/.test(value),'INVALID_NATIVE_ID',400);
const ms=seconds=>new Date(seconds*1000).toISOString();
function refs(input){
 requireThat(Array.isArray(input)&&input.length>0&&input.length<=256,'NATIVE_DEPENDENCIES_REQUIRED',503);
 const out=input.map(r=>{requireThat(r&&ascii(r.id)&&ascii(r.ownerEpoch)&&typeof r.scope==='string'&&bytes(r.scope).length>0&&bytes(r.scope).length<=512,'INVALID_NATIVE_DEPENDENCY',503);return {id:r.id,scope:r.scope,ownerEpoch:r.ownerEpoch};});
 out.sort((a,b)=>a.id===b.id?(a.scope<b.scope?-1:a.scope>b.scope?1:0):a.id<b.id?-1:1);
 requireThat(out.every((r,i)=>i===0||r.id!==out[i-1].id||r.scope!==out[i-1].scope),'DUPLICATE_NATIVE_DEPENDENCY',503);return out;
}
async function readVector(db,references){
 const rows=(await db.prepare("SELECT json_extract(j.value,'$.id') id,json_extract(j.value,'$.scope') scope,d.owner_epoch,d.revision FROM json_each(?) j LEFT JOIN jwt_v2_dependencies d ON d.id=json_extract(j.value,'$.id') AND d.scope=json_extract(j.value,'$.scope') ORDER BY id,scope").bind(JSON.stringify(references)).all()).results;
 requireThat(rows.length===references.length&&rows.every(r=>ascii(r.owner_epoch)&&safeInt(r.revision,1)),'NATIVE_DEPENDENCY_UNAVAILABLE',503);
 requireThat(rows.every(r=>references.some(ref=>ref.id===r.id&&ref.scope===r.scope&&ref.ownerEpoch===r.owner_epoch)),'NATIVE_OWNER_EPOCH_RECONCILIATION_REQUIRED',503);
 const ownerVector=[];
 for(const row of rows)ownerVector.push([row.id+':'+b64u(await sha256(bytes(row.scope))).slice(0,22),row.owner_epoch,row.revision]);
 return {rows,ownerVector,vectorGuards:rows.map(r=>[r.id,r.scope,r.owner_epoch,r.revision]),pv:await vectorDigest(ownerVector)};
}
const bounded=result=>{requireThat(bytes(canonical(result)).length<=2*1024*1024,'NATIVE_RIGHTS_TOO_LARGE',503);return result;};
const sequence=(rows,limit=6000)=>{requireThat(rows.length<=limit,'NATIVE_SCOPE_TOO_LARGE',503);return rows;};

export class AcademyNativeAdapter {
 #credentials=new WeakMap();
 constructor({env,dependencies,clock=()=>Math.floor(Date.now()/1000)}){
  requireThat(env?.ACADEMY_DB?.withSession&&env.ACADEMY_DB_GENERATION==='SPLIT_V1'&&env.ACADEMY_ADMIN_DB?.withSession,'NATIVE_SPLIT_BINDINGS_REQUIRED',503);
  requireThat(typeof clock==='function','NATIVE_CLOCK_REQUIRED',503);
  this.env=env;this.db=env.ACADEMY_DB.withSession('first-primary');this.repository=academyD1Repository(env);this.dependencies=refs(dependencies);this.clock=clock;
 }
 async fence(){
  const row=await this.db.prepare('SELECT version,(SELECT count(*) FROM split_write_fence) pending,(SELECT head_id FROM setup_head_state WHERE singleton=1) accepted_head FROM split_read_state WHERE singleton=1').first();
  requireThat(row&&safeInt(row.version)&&typeof row.accepted_head==='string','NATIVE_SPLIT_STATE_UNAVAILABLE',503);
  requireThat(row.pending===0,'SPLIT_RECOVERY_PENDING',503);return {version:row.version,acceptedHead:row.accepted_head};
 }
 async selection(loginId){
  ids(loginId);const row=await this.db.prepare('SELECT account_id FROM accounts WHERE login_link_id=? COLLATE NOCASE').bind(loginId).first();
  requireThat(row,'NATIVE_ACCOUNT_UNAVAILABLE',401);return this.credentialSnapshot(row.account_id);
 }
 async credentialSnapshot(sub){
  ids(sub);await this.fence();
  const row=await this.db.prepare('SELECT a.account_id,a.login_link_id,a.active,a.revision,c.credential_epoch,c.pin_setup,c.pin_hash FROM accounts a JOIN account_credentials c USING(account_id) WHERE a.account_id=? COLLATE NOCASE').bind(sub).first();
  requireThat(row&&safeInt(row.credential_epoch,1)&&[0,1].includes(row.pin_setup)&&[0,1].includes(row.active),'NATIVE_CREDENTIAL_UNAVAILABLE',503);
  const result=Object.freeze({sub:row.account_id,ce:row.credential_epoch,generation:row.credential_epoch,revision:String(row.revision)+':'+row.credential_epoch+':'+row.pin_setup,active:row.active===1,setupComplete:row.pin_setup===1});
  this.#credentials.set(result,row);return result;
 }
 credentialGuard(snapshot){
  const row=this.#credentials.get(snapshot);requireThat(row,'NATIVE_CREDENTIAL_RECEIPT_REQUIRED',503);
  return {sql:'SELECT 1 FROM accounts a JOIN account_credentials c USING(account_id) WHERE a.account_id=? AND a.active=? AND a.revision=? AND c.credential_epoch=? AND c.pin_setup=? AND c.pin_hash IS ? AND NOT EXISTS(SELECT 1 FROM split_write_fence)',
   args:[row.account_id,row.active,row.revision,row.credential_epoch,row.pin_setup,row.pin_hash]};
 }
 async verifyPin(pin,snapshot){
  requireThat(typeof pin==='string'&&/^[0-9]{4}$/.test(pin),'INVALID_PIN_FORMAT',400);
  const row=this.#credentials.get(snapshot);requireThat(row&&snapshot.active&&snapshot.setupComplete,'NATIVE_CREDENTIAL_RECEIPT_REQUIRED',503);
  const fresh=await this.credentialSnapshot(snapshot.sub);
  requireThat(canonical(fresh)===canonical(snapshot),'CREDENTIAL_CHANGED',409);
  const current=this.#credentials.get(fresh);
  requireThat(current.pin_hash===row.pin_hash,'CREDENTIAL_CHANGED',409);
  if(isSharedPinHash(row.pin_hash)){
   requireThat(typeof this.env.SHARED_PIN_SECRET==='string'&&this.env.SHARED_PIN_SECRET.length>=32,'NATIVE_PIN_VERIFIER_UNAVAILABLE',503);
   return verifySharedPin(pin,row.pin_hash,this.env.SHARED_PIN_SECRET);
  }
  requireThat(typeof this.env.PIN_SECRET==='string'&&this.env.PIN_SECRET.length>0,'NATIVE_PIN_VERIFIER_UNAVAILABLE',503);
  // Native legacy verifier may compute an upgrade, but this adapter does not apply a credential change.
  return (await verifyStoredPin(pin,row.pin_hash,this.env.PIN_SECRET)).valid===true;
 }
 async setupCredentialPlan({credential,pin,now=this.clock()}){
  requireThat(safeInt(now)&&typeof pin==='string'&&/^[0-9]{4}$/.test(pin),'INVALID_PIN_FORMAT',400);
  const row=this.#credentials.get(credential);requireThat(row&&credential.active&&!credential.setupComplete&&!String(row.pin_hash||'').trim(),'PIN_SETUP_NOT_ELIGIBLE',409);
  requireThat(safeInt(row.credential_epoch+1,1),'CREDENTIAL_EPOCH_EXHAUSTED',503);
  const before=await this.fence(),nativeState=await this.repository.byId(row.account_id),after=await this.fence();
  requireThat(canonical(before)===canonical(after)&&nativeState?.account?.active===1&&nativeState.account.credential_epoch===row.credential_epoch,'CREDENTIAL_CHANGED',409);
  requireThat(nativeState.contexts.length>0,'NO_CONTEXT',403);
  const setupGuardId=crypto.randomUUID();
  const shared=typeof this.env.SHARED_PIN_SECRET==='string'&&this.env.SHARED_PIN_SECRET.length>=32;
  requireThat(shared||typeof this.env.PIN_SECRET==='string'&&this.env.PIN_SECRET.length>0,'NATIVE_PIN_VERIFIER_UNAVAILABLE',503);
  const hash=shared?await createSharedPinHash(pin,this.env.SHARED_PIN_SECRET):await createSaltedPinHash(pin,this.env.PIN_SECRET);
  return {
   guard:this.credentialGuard(credential),
   statements:[this.db.prepare('INSERT INTO jwt_v2_guards(id,accepted) SELECT ?,EXISTS(SELECT 1 FROM split_read_state WHERE singleton=1 AND version=?) AND NOT EXISTS(SELECT 1 FROM split_write_fence)').bind(setupGuardId,after.version),this.db.prepare('UPDATE account_credentials SET pin_hash=?,pin_setup=1,credential_epoch=credential_epoch+1,updated_at=? WHERE account_id=? AND credential_epoch=? AND pin_setup=0 AND pin_hash IS ? AND EXISTS(SELECT 1 FROM accounts WHERE account_id=? AND active=1)').bind(hash,ms(now),row.account_id,row.credential_epoch,row.pin_hash,row.account_id),this.db.prepare("INSERT INTO audit_events(event_id,occurred_at,actor_account_id,authority,scope_key,action,record_kind,record_id,changed_fields_json) SELECT ?,?,?,?,?,?,?,?,? WHERE changes()=1").bind(crypto.randomUUID(),ms(now),row.account_id,this.env.ACADEMY_D1_MODE==='ACTIVE'?'D1_ACCOUNT':'D1_REHEARSAL','ACADEMY','ACCOUNT_PIN_SETUP_SELF','USER_ACCOUNT',row.account_id,JSON.stringify(['AuthenticationCredential'])),this.db.prepare('DELETE FROM jwt_v2_guards WHERE id=?').bind(setupGuardId)],
   postSetupCe:row.credential_epoch+1,
   requiresFreshPostSetupParent:true
  };
 }
 async capture({sub,credentialEpoch}){
  ids(sub);requireThat(safeInt(credentialEpoch,1),'NATIVE_CREDENTIAL_EPOCH_REQUIRED',503);
  const vat=this.clock();requireThat(safeInt(vat),'NATIVE_CLOCK_REQUIRED',503);
  for(let attempt=0;attempt<2;attempt++){
   const before=await this.fence(),vectorBefore=await readVector(this.db,this.dependencies),state=await this.repository.byId(sub);
   requireThat(state?.account?.active===1&&state.account.pin_setup===1,'NATIVE_ACCOUNT_INACTIVE',401);
   requireThat(state.account.credential_epoch===credentialEpoch,'CREDENTIAL_CHANGED',401);
   const canonicalSub=state.account.account_id;
   const memberships=sequence((await this.db.prepare('SELECT enrollment_id,account_id,activity_key,class_id,active,start_date,end_date FROM class_memberships WHERE account_id=? COLLATE NOCASE LIMIT 6001').bind(canonicalSub).all()).results);
   const teachers=sequence((await this.db.prepare('SELECT account_id,activity_key,class_id FROM class_teacher_assignments WHERE account_id=? COLLATE NOCASE LIMIT 6001').bind(canonicalSub).all()).results);
   const personalSetting=await this.db.prepare('SELECT active FROM memorisation_account_settings WHERE account_id=? COLLATE NOCASE').bind(canonicalSub).first(),disabledProgress=sequence((await this.db.prepare('SELECT activity_key FROM memorisation_activity_settings WHERE active=0 ORDER BY activity_key LIMIT 6001').all()).results);
   const publishedTeacherClasses=sequence((await this.db.prepare('SELECT DISTINCT lc.activity_key,lc.class_id FROM published_lesson_teachers lt JOIN program_publication_state ps ON ps.activity_key=lt.activity_key AND ps.latest_publication_id=lt.publication_id JOIN published_lesson_classes lc ON lc.activity_key=lt.activity_key AND lc.publication_id=lt.publication_id AND lc.lesson_anchor=lt.lesson_anchor WHERE lt.account_id=? COLLATE NOCASE ORDER BY lc.activity_key,lc.class_id LIMIT 6001').bind(canonicalSub).all()).results);
   const timed=this.env.ACADEMY_LEARNING_OPERATIONS==='3'?sequence((await this.db.prepare("SELECT g.assignment_id,g.activity_key,g.attendance_date,g.stable_key,g.starts_at,g.first_until,g.correction_until,g.correction_reopen_until FROM attendance_substitutes g JOIN activities a USING(activity_key) WHERE g.account_id=? COLLATE NOCASE AND a.active=1 AND a.lifecycle='ACTIVE' AND g.revoked_at IS NULL AND g.starts_at<=strftime('%Y-%m-%dT%H:%M:%fZ','now') AND max(g.correction_until,coalesce(g.correction_reopen_until,''))>strftime('%Y-%m-%dT%H:%M:%fZ','now') LIMIT 6001").bind(canonicalSub).all()).results):[];
   const rights=bounded({
    globalAdmin:state.account.global_admin===1,
    nativeState:{memorisation:{personalActive:!personalSetting||personalSetting.active===1,disabledActivityKeys:disabledProgress.map(x=>x.activity_key)},publishedTeacherClasses:publishedTeacherClasses.map(r=>pick(r,['activity_key','class_id'])),acceptedHead:before.acceptedHead,account:pick(state.account,['account_id','login_link_id','display_name','active','global_admin','substitute_grants']),activities:state.activities.map(r=>pick(r,['activity_key','activity_id','kind','name','active','lifecycle','website_visible','legacy_access_model','policy_review_state'])),roles:state.roles.map(r=>pick(r,['activity_key','role'])),subscriptions:state.subscriptions.map(r=>pick(r,['activity_key'])),contexts:state.contexts.map(r=>pick(r,['scope','courseId','courseName','role','programLibrary','activityKind','activityKey','mediaOnly'])),myLinksAvailable:state.myLinksAvailable===true,monthlyMedia:state.monthlyMedia.map(r=>pick(r,['activity_key','lesson_month','revision','class_ids_json'])),monthlyMediaEnabled:state.monthlyMediaEnabled===true,surahGrants:state.surahGrants.map(r=>pick(r,['activity_key','surah_id','revision'])),surahGrantsEnabled:state.surahGrantsEnabled===true},
    activities:state.activities.map(r=>pick(r,['activity_key','activity_id','kind','name','active','lifecycle','website_visible','legacy_access_model','policy_review_state'])),
    roles:state.roles.map(r=>pick(r,['activity_key','role'])),
    subscriptions:state.subscriptions.map(r=>pick(r,['activity_key'])),
    contexts:state.contexts.map(r=>pick(r,['scope','courseId','courseName','role','programLibrary','activityKind','activityKey','mediaOnly'])),
    myLinksAvailable:state.myLinksAvailable===true,
    monthlyMedia:state.monthlyMedia.map(r=>pick(r,['activity_key','lesson_month','revision','class_ids_json'])),
    monthlyMediaEnabled:state.monthlyMediaEnabled===true,
    surahGrants:state.surahGrants.map(r=>pick(r,['activity_key','surah_id','revision'])),
    surahGrantsEnabled:state.surahGrantsEnabled===true,
    classMemberships:memberships.map(r=>pick(r,['enrollment_id','activity_key','class_id','active','start_date','end_date'])),
    classTeacherAssignments:teachers.map(r=>pick(r,['activity_key','class_id'])),
    substituteGrants:timed
   });
   const vectorAfter=await readVector(this.db,this.dependencies),after=await this.fence();
   if(canonical(before)!==canonical(after)||canonical(vectorBefore.rows)!==canonical(vectorAfter.rows))continue;
   const ends=timed.map(g=>Math.max(Date.parse(g.correction_until),g.correction_reopen_until?Date.parse(g.correction_reopen_until):-Infinity)).map(n=>Math.floor(n/1000));
   requireThat(ends.every(n=>safeInt(n)),'NATIVE_TIMED_AUTHORITY_INVALID',503);
   const checkedAt=this.clock();requireThat(safeInt(checkedAt)&&checkedAt>=vat&&checkedAt<vat+900,'NATIVE_VALIDATION_EXPIRED',503);
   return {app:'academy',sub:canonicalSub,credentialEpoch,globalAdmin:rights.globalAdmin,nativeIdentity:{sub:canonicalSub,ce:credentialEpoch,displayName:state.account.display_name,uniqueid:state.account.login_link_id,globalAdmin:rights.globalAdmin},rights,ownerVector:vectorAfter.ownerVector,vectorGuards:vectorAfter.vectorGuards,pv:vectorAfter.pv,vat,primaryCheckedAt:checkedAt,fence:after,timedUntil:ends.length?Math.min(...ends):Number.MAX_SAFE_INTEGER};
  }
  reject('NATIVE_AUTHORITY_CHANGED_DURING_CAPTURE',503);
 }
}

export const academyNativeAdapterBoundary=Object.freeze({setup:'Native setup advances credential_epoch. A caller must atomically establish/rebind the fresh post-setup parent/context using postSetupCe, then issue proof from that new committed state. setupCredentialPlan is not a drop-in old-parent ceremony adapter.',permissions:'Reuses native byId and adds original class/date/substitute input rows. Per-resource publication/audience interpretation and V2 HTTP handler integration remain explicit milestone3 work.',credentials:'Server-only credential hashes are WeakMap-held and used only by native verifier/CAS statements; no hash, contact field, PIN, session token or journal data is returned in rights.'});
