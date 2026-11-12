import {readConsumedNativeChildPIN,consumedNativeChildPINPredicate} from './native-child-sensitive-pin.mjs';
import {sqlCommand} from './native-sql-command.mjs';
// Native child authority boundary, route-free. A trusted configured verifier
// checks JWT cryptography; fixed SQL then checks current native identity and
// committed authority. This is NOT a grant directory or native scope bypass.
const issuers={studio:'https://worshipuponbaseera.ummabbadacademy.app',hifz:'https://mahadarwa-hifz.ummabbadacademy.app'};
const proofs=new WeakMap();
const fail=(code='CHILD_SESSION_REQUIRED',status=401)=>{throw Object.assign(Error(code),{code,status});};
const uint=v=>Number.isSafeInteger(v)&&v>=0;
const stable=v=>typeof v==='string'&&/^[-A-Za-z0-9_:]{1,180}$/.test(v);
const tuple=['family_id','account_id','parent_session_id','browser_id','browser_generation','credential_epoch','unlock_generation','original_signed_in_at_s','original_expires_at_s'];
const claimKeys=['sid','sub','psid','bsid','bv','ce','ue','s_iat','s_exp'];
const childRights=(app,c)=>app==='hifz'?!Object.hasOwn(c,'r'):Boolean(c.r&&Object.keys(c.r).length===3&&c.r.v===1&&c.r.app==='studio'&&c.r.mode==='identity');
const joins={
 studio:{native:`JOIN jwt_v110_native_bindings nb USING(family_id)
 JOIN sessions ns ON ns.token_hash=nb.native_session_hash AND ns.account_id=f.account_id
 JOIN accounts n ON n.account_id=f.account_id`,parent:'nb.parent_account_id',sourceCE:'n.epoch',
 fields:'n.account_id native_id,n.display_name native_name,n.active native_active,n.admitted native_admitted,n.epoch native_epoch,n.verified_at native_verified_at,n.global_admin native_global_admin,ns.expires_at native_expires_at,ns.token_hash native_session_hash,ns.source_ref native_source_ref',
 where:`n.active=1 AND n.admitted=1 AND n.epoch=f.credential_epoch AND nb.parent_account_id=n.account_id
 AND ns.epoch=n.epoch AND ns.revoked=0 AND ns.expires_at>?
 AND ns.source_ref IS NOT NULL AND NOT EXISTS(SELECT 1 FROM source_session_revocations sr WHERE sr.source_ref=ns.source_ref)`},
 hifz:{native:`JOIN jwt_v110_native_bindings nb USING(family_id)
 JOIN students n ON n.id=f.account_id AND n.id=nb.native_owner_id
 JOIN academy_profile_links nl ON nl.student_id=n.id AND nl.academy_user_id=nb.parent_account_id`,
 parent:'nb.parent_account_id',sourceCE:'nl.source_credential_epoch',
 fields:'n.id native_id,n.name native_name,n.login_id native_login_id,n.role native_role,n.active native_active,n.credential_epoch native_epoch,n.academy_managed native_managed',
 where:`n.active=1 AND n.academy_managed=1 AND n.credential_epoch=f.credential_epoch
 AND n.role IN('student','teacher','admin') AND nl.source_credential_epoch=nb.source_credential_epoch
 AND af.source_revision=nl.source_revision`}
};
function query(app,idle=true){
 const spec=joins[app];
 return `SELECT f.*,v.permission_version current_permission_version,${spec.fields},af.parent_account_id source_parent_account_id,af.source_credential_epoch source_epoch,af.committed_permission_version source_permission_version,af.source_revision source_revision,af.snapshot_digest source_snapshot_digest
 FROM jwt_v110_families f JOIN jwt_v110_accounts v USING(account_id) JOIN jwt_v110_browser_heads bh USING(browser_id)
 ${spec.native}
 JOIN jwt_v110_authority_floors af ON af.app=? AND af.parent_account_id=${spec.parent} AND af.native_owner_id=n.${app==='hifz'?'id':'account_id'} AND af.native_epoch=f.credential_epoch AND af.source_credential_epoch=${spec.sourceCE}
 LEFT JOIN jwt_v110_source_requirements rq ON rq.app=af.app AND rq.parent_account_id=af.parent_account_id
 WHERE f.family_id=? AND f.revoked=0 AND v.active=1 AND v.credential_epoch=f.credential_epoch AND bh.generation=f.browser_generation
 AND f.original_expires_at_s>? AND f.original_expires_at_s-f.original_signed_in_at_s<=604800
 AND typeof(f.last_fg_refresh_s)='integer' AND f.last_fg_refresh_s>=f.original_signed_in_at_s AND f.last_fg_refresh_s<=? ${idle?'AND ?-f.last_fg_refresh_s<5400':''}
 AND NOT EXISTS(SELECT 1 FROM jwt_v110_parent_tombstones t WHERE t.parent_session_id=f.parent_session_id)
 AND af.active=1 AND af.required_permission_version=af.committed_permission_version
 AND COALESCE(rq.credential_epoch_floor,0)<=af.source_credential_epoch AND COALESCE(rq.permission_version_floor,0)<=af.committed_permission_version
 AND ${spec.where}`;
}
const parameters=(app,id,now,idle=true)=>[app,id,now,now,...(idle?[now]:[]),...(app==='studio'?[now*1000]:[])];
function validateRow(row){
 if(!row||!tuple.slice(0,4).every(k=>stable(row[k]))||!['browser_generation','credential_epoch','unlock_generation','original_signed_in_at_s','original_expires_at_s','last_fg_refresh_s','refresh_generation','rotated_at_s'].every(k=>uint(row[k]))||!stable(row.native_id)||!uint(row.native_epoch)||!uint(row.current_permission_version)||!uint(row.source_epoch)||!uint(row.source_permission_version)||(!uint(row.source_revision)||row.source_revision<1)||typeof row.source_snapshot_digest!=='string'||!/^[a-f0-9]{64}$/.test(row.source_snapshot_digest))fail();
}
function actorFor(app,row){
 const actor=app==='hifz'?{id:row.native_id,login_id:row.native_login_id,name:row.native_name,role:row.native_role,credential_epoch:row.native_epoch}:{account_id:row.native_id,display_name:row.native_name,active:row.native_active,admitted:row.native_admitted,epoch:row.native_epoch,verified_at:row.native_verified_at,global_admin:row.native_global_admin,expires_at:Math.min(row.original_expires_at_s*1000,row.native_expires_at)};
 if(app==='studio'){Object.defineProperty(actor,'token_hash',{value:row.native_session_hash});Object.defineProperty(actor,'source_ref',{value:row.native_source_ref});}
 return Object.freeze(actor);
}
function predicate(p,now){
 const extra=tuple.map(k=>'q.'+k+'=?').join(' AND '),profile=p.app==='studio'?'q.native_global_admin=? AND q.native_session_hash=? AND q.native_source_ref=?':'q.native_role=? AND q.native_login_id=? AND q.native_managed=?';
 return {sql:'EXISTS(SELECT 1 FROM ('+query(p.app)+') q WHERE '+extra+' AND q.current_permission_version=? AND q.source_parent_account_id=? AND q.source_epoch=? AND q.source_permission_version=? AND q.source_revision=? AND q.source_snapshot_digest=? AND q.native_name=? AND '+profile+')',
 args:[...parameters(p.app,p.row.family_id,now),...tuple.map(k=>p.row[k]),p.row.current_permission_version,p.row.source_parent_account_id,p.row.source_epoch,p.row.source_permission_version,p.row.source_revision,p.row.source_snapshot_digest,p.row.native_name,...(p.app==='studio'?[p.row.native_global_admin,p.row.native_session_hash,p.row.native_source_ref]:[p.row.native_role,p.row.native_login_id,p.row.native_managed])]};
}
export async function authenticateNativeChildAccess({store,app,engine,token,clock=Date.now}){
 if(!Object.hasOwn(issuers,app)||typeof store?.first!=='function'||typeof store?.statement!=='function'||typeof store?.batch!=='function'||typeof engine?.verify!=='function'||typeof clock!=='function')fail('CHILD_AUTH_CONFIG',503);
 const at=clock(),now=Math.floor(at/1000);if(!uint(at)||now>253402300799)fail('CHILD_AUTH_CONFIG',503);
 const claims=await engine.verify(token,now);
 if(!claims||!childRights(app,claims)||claims.iss!==issuers[app]||claims.aud!=='urn:ummabbadacademy:'+app+':api'||!uint(claims.exp)||claims.exp<=now||claimKeys.slice(0,4).some(k=>!stable(claims[k]))||claimKeys.slice(4).some(k=>!uint(claims[k])))fail();
 const row=await store.first(query(app),parameters(app,claims.sid,now));validateRow(row);
 if(tuple.some((k,i)=>row[k]!==claims[claimKeys[i]])||row.current_permission_version!==claims.pv)fail('CHILD_TOKEN_UPDATE_REQUIRED');
 const cap=Object.freeze({app,kind:'native-child-authority'});
 proofs.set(cap,{store,app,row,clock,at,claimsExpiresAt:claims.exp,actor:actorFor(app,row)});
 return cap;
}
function currentProof(cap){
 const p=proofs.get(cap);if(!p)fail();const at=p.clock(),now=Math.floor(at/1000);
 if(!uint(at)||at<p.at||at-p.at>60000||now>=p.claimsExpiresAt)fail('CHILD_AUTH_PROOF_EXPIRED');
 return {p,now};
}
export async function readWithNativeChildAuthority(cap,readNative){
 if(typeof readNative!=='function')fail('CHILD_AUTH_CONFIG',503);
 const {p,now}=currentProof(cap),before=predicate(p,now);
 if((await p.store.first('SELECT '+before.sql+' accepted',before.args))?.accepted!==1)fail();
 // Reader retains actual native scope/ownership rules and live Hifz data.
 const value=await readNative(p.actor);
 const checked=currentProof(cap),final=predicate(p,checked.now);
 const row=await p.store.first('SELECT '+final.sql+' accepted',final.args);
 if(row?.accepted!==1)fail();
 return value;
}
export async function writeWithNativeChildAuthority(cap,buildNative){
 if(typeof buildNative!=='function')fail('CHILD_AUTH_CONFIG',503);
 const {p,now:preparedNow}=currentProof(cap),before=predicate(p,preparedNow);
 if((await p.store.first('SELECT '+before.sql+' accepted',before.args))?.accepted!==1)fail();
 // Trusted native planner must keep its OWN material rights/ownership guards.
 // It may not take raw SQL or this callback from a request.
 const changes=await buildNative(p.actor);
 if(!Array.isArray(changes)||!changes.length)fail('CHILD_AUTH_CONFIG',503);
 const {now}=currentProof(cap),guard=predicate(p,now),id=crypto.randomUUID(),table=p.app==='studio'?'guards':'jwt_v110_native_guards';
 const sensitive=p.sensitiveBatch?consumedNativeChildPINPredicate(p.pinEvidence):{sql:'1',args:[]};
 const clock="CAST(strftime('%s','now') AS INTEGER)";
 const realTime="EXISTS(SELECT 1 FROM jwt_v110_families f WHERE f.family_id=? AND f.original_expires_at_s>"+clock+" AND f.last_fg_refresh_s<="+clock+" AND "+clock+"-f.last_fg_refresh_s<5400)";
 const result=await p.store.batch([p.store.statement('INSERT INTO '+table+'(guard_id,accepted) SELECT ?,('+guard.sql+') AND ('+realTime+') AND ('+sensitive.sql+')',[id,...guard.args,p.row.family_id,...sensitive.args]),...changes,p.store.statement('DELETE FROM '+table+' WHERE guard_id=?',[id])]);
 return result.slice(1,-1);
}
// Internal refresh uses this fixed native snapshot and predicate, never SQL
// supplied by a caller or a made-up actor. Kept private to the same module.

// Own-app prepared refresh. CSRF/origin authorization is a mandatory trusted
// adapter callback bound to this exact native family; it is not request SQL.
// The adapter alone decides qualifying foreground, never another app's clock.
const encoder=new TextEncoder();
const encode=b=>btoa(String.fromCharCode(...b)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
function refreshValue(raw){
 if(typeof raw!=='string'||!/^[-A-Za-z0-9_]{43}$/.test(raw))fail('CHILD_REFRESH_REQUIRED');
 let bytes;try{bytes=Uint8Array.from(atob(raw.replaceAll('-','+').replaceAll('_','/')+'='),x=>x.charCodeAt(0));}catch{fail('CHILD_REFRESH_REQUIRED');}
 if(bytes.length!==32||encode(bytes)!==raw)fail('CHILD_REFRESH_REQUIRED');return raw;
}
const refreshFingerprint=async(app,raw)=>encode(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode('uaa-refresh-v1'+String.fromCharCode(0)+app+String.fromCharCode(0)+refreshValue(raw)))));
export async function refreshNativeChild({store,app,engine,raw,authorizeRotation,prepareClient,foreground=false,foregroundOperation,clock=Date.now}){
 if(!Object.hasOwn(issuers,app)||typeof store?.first!=='function'||typeof store?.statement!=='function'||typeof store?.batch!=='function'||typeof engine?.issue!=='function'||typeof engine?.accessCookie!=='function'||typeof engine?.refreshCookie!=='function'||typeof authorizeRotation!=='function'||typeof prepareClient!=='function'||typeof foreground!=='boolean'||typeof clock!=='function')fail('CHILD_AUTH_CONFIG',503);
 const at=clock(),now=Math.floor(at/1000);if(!uint(at)||now>253402300799)fail('CHILD_AUTH_CONFIG',503);
 if(foregroundOperation!==undefined&&(!foreground||typeof foregroundOperation!=='string'||!/^[-A-Za-z0-9_]{43}$/.test(foregroundOperation)))fail('CHILD_AUTH_CONFIG',503);
 const fp=await refreshFingerprint(app,raw),selected=await store.first('SELECT family_id FROM jwt_v110_families WHERE refresh_fp=? OR previous_fp=?',[fp,fp]);
 if(!selected)fail();
 const row=await store.first(query(app,false),parameters(app,selected.family_id,now,false));validateRow(row);
 const family=Object.freeze(Object.fromEntries(tuple.map(k=>[k,row[k]])));
 await authorizeRotation({family,now,actor:actorFor(app,row)});
 if(now-row.last_fg_refresh_s>=5400)fail('CHILD_PIN_REQUIRED');
 if(row.refresh_fp!==fp)return Object.freeze({kind:now-row.rotated_at_s<=30?'in_progress':'readmit_required'});
 // A user-navigation operation is once per immutable own family tuple.
 // Its receipt joins the same CAS/audit transaction; old operation metadata
 // alone is never treated as proof of a committed foreground update.
 const op=foregroundOperation===undefined?crypto.randomUUID():'fg-nav:'+([...new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(JSON.stringify(['uaa-child-fg-operation-v1',app,...tuple.map(k=>row[k]),foregroundOperation]))))].map(x=>x.toString(16).padStart(2,'0')).join(''));
 const claims={sub:row.account_id,sid:row.family_id,psid:row.parent_session_id,bsid:row.browser_id,bv:row.browser_generation,ce:row.credential_epoch,pv:row.current_permission_version,ue:row.unlock_generation,s_iat:row.original_signed_in_at_s,s_exp:row.original_expires_at_s};
 const issued=await engine.issue(claims,now),c=issued?.claims;
 if(!c||!childRights(app,c)||Object.keys(claims).some(k=>c[k]!==claims[k])||c.iss!==issuers[app]||c.aud!=='urn:ummabbadacademy:'+app+':api'||!uint(c.exp)||c.exp<=now||c.exp>Math.min(now+900,row.original_expires_at_s)||app==='hifz'&&Object.hasOwn(c,'r'))fail('CHILD_REFRESH_PREPARATION',503);
 const next=encode(crypto.getRandomValues(new Uint8Array(32))),nextFP=await refreshFingerprint(app,next);
 const cookies=Object.freeze([engine.accessCookie(issued.token,c.exp,now),engine.refreshCookie(next,row.original_expires_at_s,now)]);
 const response=await prepareClient({claims:Object.freeze({...c}),cookies,actor:actorFor(app,row),lastForegroundRefreshS:foreground?now:row.last_fg_refresh_s,serverNowS:now});
 if(!(response instanceof Response))fail('CHILD_REFRESH_PREPARATION',503);
 // The persisted own-FG time and prepared response use the SAME prepared
 // timestamp; rotated_at records commit time. Preparation remains <=5 seconds.
 const commitAt=clock(),commitNow=Math.floor(commitAt/1000);
 if(!uint(commitAt)||commitAt<at||commitAt-at>5000||c.exp<=commitNow)fail('CHILD_REFRESH_PREPARATION',503);
 const proof={store,app,row},guard=predicate(proof,commitNow),id=crypto.randomUUID(),table=app==='studio'?'guards':'jwt_v110_native_guards';
 const statements=[
  store.statement('INSERT INTO '+table+'(guard_id,accepted) SELECT ?,('+guard.sql+') AND EXISTS(SELECT 1 FROM jwt_v110_families WHERE family_id=? AND refresh_fp=? AND refresh_generation=?)'+(foregroundOperation===undefined?'':' AND NOT EXISTS(SELECT 1 FROM jwt_v110_security_audit WHERE operation_id=?)'),[id,...guard.args,row.family_id,fp,row.refresh_generation,...(foregroundOperation===undefined?[]:[op])]),
  store.statement('UPDATE jwt_v110_families SET previous_fp=refresh_fp,refresh_fp=?,refresh_generation=refresh_generation+1,permission_version=?,last_fg_refresh_s=CASE WHEN ?=1 THEN ? ELSE last_fg_refresh_s END,rotated_at_s=?,rotation_operation_id=? WHERE family_id=? AND refresh_fp=? AND refresh_generation=? RETURNING family_id,refresh_generation',[nextFP,row.current_permission_version,Number(foreground),now,commitNow,op,row.family_id,fp,row.refresh_generation]),
  store.statement('INSERT INTO jwt_v110_security_audit VALUES(?,?,?,?)',[op,row.family_id,foregroundOperation===undefined?'refresh':'foreground-navigation',commitNow]),
  store.statement('DELETE FROM '+table+' WHERE guard_id=?',[id])
 ];
 try{const result=await store.batch(statements),saved=result?.[1]?.results?.[0];if(result?.[1]?.results?.length!==1||saved.family_id!==row.family_id||saved.refresh_generation!==row.refresh_generation+1)fail('CHILD_REFRESH_COMMIT_UNCONFIRMED',503);}
 catch{fail('CHILD_REFRESH_CONFLICT',409);}
 const result={kind:'rotated'};Object.defineProperty(result,'clientResponse',{value:response});return Object.freeze(result);
}

// Adapter for existing native handlers: SQL still comes from their own checked
// code, not the request. Each read is checked before/after; each mutation/batch
// joins the private authority guard in the SAME native primary transaction.
export function nativeChildDatabase(cap){
 const {p}=currentProof(cap),descriptions=new WeakMap();
 // Preserve the owning native batch as one transaction. Native handlers and
 // platform limits own cardinality; the adapter never splits/truncates it.
 const execute=async list=>{
  if(!Array.isArray(list)||!list.length)fail('CHILD_NATIVE_STATEMENT_UNSUPPORTED',503);
  const items=list.map(s=>{const item=descriptions.get(s);if(!item)fail('CHILD_NATIVE_STATEMENT_UNSUPPORTED',503);return item;});
  const statements=items.map(s=>p.store.statement(s.sql,s.args));
  return items.every(s=>s.command==='SELECT')?readWithNativeChildAuthority(cap,()=>p.store.batch(statements)):writeWithNativeChildAuthority(cap,()=>statements);
 };
 const statement=(sql,args=[])=>{
  if(typeof sql!=='string'||sql.length>64000)fail('CHILD_NATIVE_STATEMENT_UNSUPPORTED',503);
  const command=sqlCommand(sql);
  if(!['SELECT','INSERT','UPDATE','DELETE'].includes(command))fail('CHILD_NATIVE_STATEMENT_UNSUPPORTED',503);
  const value={
   bind(...values){return statement(sql,values);},
   async all(){return (await execute([value]))[0];},
   async first(column){const row=(await execute([value]))[0]?.results?.[0]||null;return column?row?.[column]??null:row;},
   async run(){return (await execute([value]))[0];}
  };
  descriptions.set(value,{sql,args:[...args],command});return Object.freeze(value);
 };
 const db={prepare:sql=>statement(sql),batch:list=>execute(list),withSession:()=>db};
 const frozen=Object.freeze(db);policyDatabases.set(frozen,cap);return frozen;
}

// Protected native dispatch receives its actor and DB ONLY through this private
// proof. Mutation responses retain native operation/receipt semantics; every
// actual DB write is already guarded atomically by nativeChildDatabase.
// Read responses get a final authority check before their data is released.
export async function invokeNativeChildHandler(cap,handleNative,{mutating=false}={}){
 if(typeof handleNative!=='function'||typeof mutating!=='boolean')fail('CHILD_AUTH_CONFIG',503);
 if(!mutating)return readWithNativeChildAuthority(cap,actor=>handleNative(actor,nativeChildDatabase(cap)));
 const {p,now}=currentProof(cap),guard=predicate(p,now);
 if((await p.store.first('SELECT '+guard.sql+' accepted',guard.args))?.accepted!==1)fail();
 return handleNative(p.actor,nativeChildDatabase(cap));
}

// Display data is released only through the same current native proof. It is
// account/session correlation, never material rights or a native owner alias.
export async function nativeChildDisplayContext(cap){
 const {p}=currentProof(cap);
 return readWithNativeChildAuthority(cap,actor=>{
  const {now}=currentProof(cap),r=p.row;
  return {session:{app:p.app,accountId:r.account_id,sessionId:r.family_id,parentId:r.parent_session_id,browserId:r.browser_id,browserGeneration:r.browser_generation,credentialEpoch:r.credential_epoch,securityVersion:r.current_permission_version,unlockGeneration:r.unlock_generation,originalSignedAtMs:r.original_signed_in_at_s*1000,originalExpiresAtMs:r.original_expires_at_s*1000,lastForegroundRefreshMs:r.last_fg_refresh_s*1000,serverNowMs:now*1000},actor,initialViews:[],accessExpiresAtMs:p.claimsExpiresAt*1000};
 });
}
// Refresh possession is NOT active authority. This narrow path permits only
// own-family CSRF checks/cancellation, including after idle or native revocation.
async function ownRefreshFamily(store,app,raw){
 if(!Object.hasOwn(issuers,app)||typeof store?.first!=='function')fail('CHILD_AUTH_CONFIG',503);
 const fp=await refreshFingerprint(app,raw);
 const row=await store.first('SELECT * FROM jwt_v110_families WHERE refresh_fp=? OR previous_fp=?',[fp,fp]);
 if(!row||!tuple.slice(0,4).every(k=>stable(row[k]))||!tuple.slice(4).every(k=>uint(row[k])))fail();
 return {row,fp,family:Object.freeze(Object.fromEntries(tuple.map(k=>[k,row[k]])))};
}
export async function nativeChildOwnRefreshFamily({store,app,raw,authorize}){
 if(typeof authorize!=='function')fail('CHILD_AUTH_CONFIG',503);
 const {family}=await ownRefreshFamily(store,app,raw);
 await authorize(family);return family;
}
export async function cancelNativeChildFamily({store,app,raw,authorize,clock=Date.now}){
 if(typeof authorize!=='function'||typeof store?.statement!=='function'||typeof store?.batch!=='function')fail('CHILD_AUTH_CONFIG',503);
 const {row,fp,family}=await ownRefreshFamily(store,app,raw);
 await authorize(family);
 const at=clock(),now=Math.floor(at/1000);if(!uint(at)||now>253402300799)fail('CHILD_AUTH_CONFIG',503);
 const where=tuple.map(k=>k+'=?').join(' AND ')+' AND (refresh_fp=? OR previous_fp=?)',args=[...tuple.map(k=>row[k]),fp,fp];
 const op=crypto.randomUUID();
 const results=await store.batch([
  store.statement('UPDATE jwt_v110_families SET revoked=1 WHERE '+where+' RETURNING family_id',args),
  store.statement("INSERT INTO jwt_v110_security_audit(operation_id,family_id,event_type,occurred_at_s) SELECT ?,family_id,'child-logout',? FROM jwt_v110_families WHERE "+where,[op,now,...args])
 ]);
 if(results?.[0]?.results?.length!==1||results[0].results[0].family_id!==row.family_id)fail('CHILD_CANCEL_UNCONFIRMED',503);
 return Object.freeze({cancelled:true});
}

// SOURCE ONLY native request policy. Actor timestamps are never changed.
const policyEnvironments=new WeakMap(),policyDatabases=new WeakMap();
function nativePolicyProof(env,actor){
 const item=policyEnvironments.get(env);if(!item)return null;
 const {p,now}=currentProof(item.cap);
 const keys=p.app==='studio'?['account_id','epoch','global_admin','token_hash','source_ref']:['id','credential_epoch','role','login_id'];
 if(!actor||keys.some(k=>actor[k]!==p.actor[k]))fail('CHILD_POLICY_ACTOR_CHANGED');
 return {p,now};
}
export async function prepareNativeChildPINPolicy(cap,env){
 const {p,now}=currentProof(cap);
 if(env.JWT_V110_CHILD_PIN!=='NATIVE_ROOT_V1')fail('CHILD_PIN_POLICY_UNAVAILABLE',503);
 p.pinEvidence=await readConsumedNativeChildPIN({store:p.store,app:p.app,row:p.row,secret:env.JWT_V110_CHILD_PIN_SECRET,rootRunId:env.JWT_LOCAL_ROOT_RUN_ID,childRunId:env.JWT_LOCAL_NATIVE_RUN_ID,now});
 currentProof(cap);
}
export function nativeChildHandlerEnvironment(cap,env,actor,DB){
 const {p}=currentProof(cap);
 if(actor!==p.actor||policyDatabases.get(DB)!==cap)fail('CHILD_POLICY_ENVIRONMENT',503);
 const selected=Object.freeze({...env,DB});policyEnvironments.set(selected,{cap});return selected;
}
export function nativeChildPolicySelected(env,actor){return Boolean(nativePolicyProof(env,actor));}
export function nativeChildVerificationCutoff(env,actor,sensitive=false,legacyCutoff=Date.now()){
 const proof=nativePolicyProof(env,actor);if(!proof)return legacyCutoff;
 if(sensitive&&(!proof.p.pinEvidence||proof.now<proof.p.pinEvidence.pinAtS||proof.now-proof.p.pinEvidence.pinAtS>=60))return Infinity;
 // Zero only removes legacy projection AGE; native family/CE/PV/floor/rights
 // and own foreground gates remain mandatory on every guarded read/write.
 return 0;
}
export function requireNativeChildSensitiveBatch(env,actor){
 const proof=nativePolicyProof(env,actor);if(!proof)return false;
 if(nativeChildVerificationCutoff(env,actor,true)!==0)fail('CHILD_PIN_REQUIRED');
 proof.p.sensitiveBatch=true;return true;
}
export function nativeChildVerificationDeadline(env,actor,sensitive=false,legacyDeadline=0){
 const proof=nativePolicyProof(env,actor);if(!proof)return legacyDeadline;
 if(sensitive&&nativeChildVerificationCutoff(env,actor,true)!==0)return 0;
 return Math.min(proof.p.claimsExpiresAt,proof.p.row.original_expires_at_s,proof.p.row.last_fg_refresh_s+5400,...(sensitive?[proof.p.pinEvidence.pinAtS+60]:[]))*1000;
}
