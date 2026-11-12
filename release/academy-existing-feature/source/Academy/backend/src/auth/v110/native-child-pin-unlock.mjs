// Child-only PIN metadata/consume boundary. No ordinary access capability is
// created from refresh possession. Root actual native PIN proof is mandatory.
// Fixed native snapshot predicates retained from native-child-authority; only
// own idle is omitted for this actual-PIN path. All other native floors remain.
const issuers={studio:'https://worshipuponbaseera.ummabbadacademy.app',hifz:'https://mahadarwa-hifz.ummabbadacademy.app'};
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
 fields:'n.account_id native_id,n.display_name native_name,n.active native_active,n.admitted native_admitted,n.epoch native_epoch,n.verified_at native_verified_at,n.global_admin native_global_admin,ns.token_hash native_session_hash,ns.source_ref native_source_ref',
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
 const actor=app==='hifz'?{id:row.native_id,login_id:row.native_login_id,name:row.native_name,role:row.native_role,credential_epoch:row.native_epoch}:{account_id:row.native_id,display_name:row.native_name,active:row.native_active,admitted:row.native_admitted,epoch:row.native_epoch,verified_at:row.native_verified_at,global_admin:row.native_global_admin};
 if(app==='studio'){Object.defineProperty(actor,'token_hash',{value:row.native_session_hash});Object.defineProperty(actor,'source_ref',{value:row.native_source_ref});}
 return Object.freeze(actor);
}
function predicate(p,now){
 const extra=tuple.map(k=>'q.'+k+'=?').join(' AND '),profile=p.app==='studio'?'q.native_global_admin=? AND q.native_session_hash=? AND q.native_source_ref=?':'q.native_role=? AND q.native_login_id=? AND q.native_managed=?';
 return {sql:'EXISTS(SELECT 1 FROM ('+query(p.app,false)+') q WHERE '+extra+' AND q.current_permission_version=? AND q.source_parent_account_id=? AND q.source_epoch=? AND q.source_permission_version=? AND q.source_revision=? AND q.source_snapshot_digest=? AND q.native_name=? AND '+profile+')',
 args:[...parameters(p.app,p.row.family_id,now,false),...tuple.map(k=>p.row[k]),p.row.current_permission_version,p.row.source_parent_account_id,p.row.source_epoch,p.row.source_permission_version,p.row.source_revision,p.row.source_snapshot_digest,p.row.native_name,...(p.app==='studio'?[p.row.native_global_admin,p.row.native_session_hash,p.row.native_source_ref]:[p.row.native_role,p.row.native_login_id,p.row.native_managed])]};
}
const encoder=new TextEncoder();
const encode=b=>btoa(String.fromCharCode(...b)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
function refreshValue(raw){
 if(typeof raw!=='string'||!/^[-A-Za-z0-9_]{43}$/.test(raw))fail('CHILD_REFRESH_REQUIRED');
 let bytes;try{bytes=Uint8Array.from(atob(raw.replaceAll('-','+').replaceAll('_','/')+'='),x=>x.charCodeAt(0));}catch{fail('CHILD_REFRESH_REQUIRED');}
 if(bytes.length!==32||encode(bytes)!==raw)fail('CHILD_REFRESH_REQUIRED');return raw;
}
const refreshFingerprint=async(app,raw)=>encode(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode('uaa-refresh-v1'+String.fromCharCode(0)+app+String.fromCharCode(0)+refreshValue(raw)))));

import {parseChildPINIntent,parseChildPINUnlock,childPINIntentDigest,signChildPINPacket,verifyChildPINPacket,signChildPINReceipt} from './child-pin-unlock-contract.mjs';
const opaque=v=>typeof v==='string'&&/^[-A-Za-z0-9_]{43}$/.test(v);
const sha=async value=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(value)))].map(x=>x.toString(16).padStart(2,'0')).join('');
const familyOf=row=>Object.freeze(Object.fromEntries(tuple.map(k=>[k,row[k]])));
function configured(store,app,clock){
 if(!Object.hasOwn(issuers,app)||typeof store?.first!=='function'||typeof store?.statement!=='function'||typeof store?.batch!=='function'||typeof clock!=='function')fail('CHILD_PIN_CONFIG',503);
 const at=clock(),now=Math.floor(at/1000);if(!uint(at)||now>253401695999)fail('CHILD_PIN_CONFIG',503);return {at,now};
}
function freshCommit(clock,at){
 const end=clock();if(!uint(end)||end<at||end-at>5000)fail('CHILD_PIN_PREPARATION',503);return Math.floor(end/1000);
}
async function ownedRow(store,app,raw,now){
 const fp=await refreshFingerprint(app,raw),selector=await store.first('SELECT family_id FROM jwt_v110_families WHERE refresh_fp=? OR previous_fp=?',[fp,fp]);
 if(!selector)fail('CHILD_PIN_REQUIRED');
 const row=await store.first(query(app,false),parameters(app,selector.family_id,now,false));validateRow(row);return {row,fp};
}
function matchesIntent(row,intent){
 const facts={familyId:row.family_id,nativeOwnerId:row.account_id,nativeEpoch:row.credential_epoch,nativePermissionVersion:row.current_permission_version,nativeRefreshGeneration:row.refresh_generation,childUnlockGeneration:row.unlock_generation,parentAccountId:row.source_parent_account_id,parentId:row.parent_session_id,browserId:row.browser_id,browserGeneration:row.browser_generation,sourceCredentialEpoch:row.source_epoch,sourcePermissionVersion:row.source_permission_version,sourceRevision:row.source_revision,snapshotDigest:row.source_snapshot_digest,originalSignedAtS:row.original_signed_in_at_s,originalExpiresAtS:row.original_expires_at_s};
 if(Object.keys(facts).some(k=>facts[k]!==intent[k]))fail('CHILD_PIN_STATE_CHANGED');
}
function guardFor(store,app,row,now){
 const proof={store,app,row};return predicate(proof,now);
}
const guardTable=app=>app==='studio'?'guards':'jwt_v110_native_guards';
export async function prepareNativeChildPINIntent({store,app,raw,challenge,state,rootRunId,childRunId,secret,authorize,clock=Date.now}){
 const {at,now}=configured(store,app,clock);
 if(!opaque(challenge)||!opaque(state)||!/^[a-f0-9]{64}$/.test(rootRunId||'')||!/^[a-f0-9]{64}$/.test(childRunId||'')||typeof authorize!=='function')fail('CHILD_PIN_CONFIG',503);
 const {row,fp}=await ownedRow(store,app,raw,now);await authorize({family:familyOf(row),now,actor:actorFor(app,row)});
 const intent=parseChildPINIntent({ver:1,purpose:'uaa-child-pin-intent-v1',app,origin:issuers[app],rootRunId,childRunId,intentId:encode(crypto.getRandomValues(new Uint8Array(32))),familyId:row.family_id,nativeOwnerId:row.account_id,nativeEpoch:row.credential_epoch,nativePermissionVersion:row.current_permission_version,nativeRefreshGeneration:row.refresh_generation,childUnlockGeneration:row.unlock_generation,parentAccountId:row.source_parent_account_id,parentId:row.parent_session_id,browserId:row.browser_id,browserGeneration:row.browser_generation,sourceCredentialEpoch:row.source_epoch,sourcePermissionVersion:row.source_permission_version,sourceRevision:row.source_revision,snapshotDigest:row.source_snapshot_digest,originalSignedAtS:row.original_signed_in_at_s,originalExpiresAtS:row.original_expires_at_s,challenge,state,issuedAtS:now,expiresAtS:Math.min(now+60,row.original_expires_at_s)},{app,now});
 const packet=await signChildPINPacket({kind:'intent',value:intent,secret}),digest=await childPINIntentDigest(intent),commitNow=freshCommit(clock,at),guard=guardFor(store,app,row,commitNow),id=crypto.randomUUID(),table=guardTable(app);
 const results=await store.batch([
  store.statement('INSERT INTO '+table+'(guard_id,accepted) SELECT ?,('+guard.sql+') AND EXISTS(SELECT 1 FROM jwt_v110_families WHERE family_id=? AND refresh_generation=? AND (refresh_fp=? OR previous_fp=?)) AND ?<?',[id,...guard.args,row.family_id,row.refresh_generation,fp,fp,commitNow,intent.expiresAtS]),
  store.statement('INSERT INTO jwt_v110_child_pin_intents(intent_id,app,family_id,intent_json,intent_digest,intent_signature,issued_at_s,expires_at_s) VALUES(?,?,?,?,?,?,?,?) RETURNING intent_id',[intent.intentId,app,row.family_id,packet.body,digest,packet.signature,now,intent.expiresAtS]),
  store.statement('DELETE FROM '+table+' WHERE guard_id=?',[id])
 ]);
 if(results?.[1]?.results?.length!==1||results[1].results[0].intent_id!==intent.intentId)fail('CHILD_PIN_PREPARATION',503);
 // The HTTP adapter exposes only opaque ID/expiry, never the private intent.
 return Object.freeze({intentId:intent.intentId,expiresAtS:intent.expiresAtS});
}
// Internal signed Root callback ONLY. This stores a code HASH, never its raw
// browser value. Root actual PIN verification is a separate mandatory producer.
export async function receiveNativeChildPINProof({store,app,body,signature,secret,rootRunId,childRunId,clock=Date.now}){
 const {at,now}=configured(store,app,clock);
 if(!/^[a-f0-9]{64}$/.test(rootRunId||'')||!/^[a-f0-9]{64}$/.test(childRunId||''))fail('CHILD_PIN_CONFIG',503);
 if(typeof body!=='string'||encoder.encode(body).length>6144)fail('CHILD_PIN_PROOF_REJECTED');
 let candidate;try{candidate=JSON.parse(body);}catch{fail('CHILD_PIN_PROOF_REJECTED');}
 const verified=await verifyChildPINPacket({kind:'unlock',body,signature,secret,app,now,rootRunId,childRunId,intent:candidate?.intent});
 const saved=await store.first('SELECT * FROM jwt_v110_child_pin_intents WHERE intent_id=? AND app=?',[verified.intent.intentId,app]);if(!saved)fail('CHILD_PIN_PROOF_REJECTED');
 const intent=await verifyChildPINPacket({kind:'intent',body:saved.intent_json,signature:saved.intent_signature,secret,app,now,rootRunId,childRunId});
 const reply=await parseChildPINUnlock(verified,{app,now,intent}),digest=await sha(body);
 const ack=await signChildPINReceipt({app,intentId:intent.intentId,intentDigest:saved.intent_digest,replyDigest:digest,codeHash:reply.codeHash,secret});
 if(saved.intent_digest!==await childPINIntentDigest(intent))fail('CHILD_PIN_PROOF_REJECTED');
 if(saved.phase>=1&&saved.reply_json===body&&saved.reply_signature===signature&&saved.reply_digest===digest)return ack;
 if(saved.phase!==0)fail('CHILD_PIN_PROOF_REPLAY');
 const row=await store.first(query(app,false),parameters(app,intent.familyId,now,false));validateRow(row);matchesIntent(row,intent);
 const commitNow=freshCommit(clock,at),guard=guardFor(store,app,row,commitNow),id=crypto.randomUUID(),table=guardTable(app);
 const results=await store.batch([
  store.statement('INSERT INTO '+table+'(guard_id,accepted) SELECT ?,('+guard.sql+') AND EXISTS(SELECT 1 FROM jwt_v110_families WHERE family_id=? AND refresh_generation=? AND unlock_generation=?) AND EXISTS(SELECT 1 FROM jwt_v110_child_pin_intents WHERE intent_id=? AND app=? AND phase=0 AND intent_digest=? AND intent_signature=? AND expires_at_s>?) AND ?<?',[id,...guard.args,intent.familyId,intent.nativeRefreshGeneration,intent.childUnlockGeneration,intent.intentId,app,saved.intent_digest,saved.intent_signature,commitNow,commitNow,reply.expiresAtS]),
  store.statement('UPDATE jwt_v110_child_pin_intents SET phase=1,code_hash=?,reply_json=?,reply_signature=?,reply_digest=? WHERE intent_id=? AND app=? AND phase=0 RETURNING intent_id',[reply.codeHash,body,signature,digest,intent.intentId,app]),
  store.statement('DELETE FROM '+table+' WHERE guard_id=?',[id])
 ]);
 if(results?.[1]?.results?.length!==1||results[1].results[0].intent_id!==intent.intentId)fail('CHILD_PIN_PROOF_COMMIT_UNCONFIRMED',503);
 return ack;
}
export async function consumeNativeChildPINUnlock({store,app,engine,raw,code,verifier,state,secret,authorize,prepareClient,rootRunId,childRunId,clock=Date.now}){
 const {at,now}=configured(store,app,clock);
 if(!/^[a-f0-9]{64}$/.test(rootRunId||'')||!/^[a-f0-9]{64}$/.test(childRunId||'')||![code,verifier,state].every(opaque)||typeof authorize!=='function'||typeof prepareClient!=='function'||typeof engine?.issue!=='function'||typeof engine?.accessCookie!=='function'||typeof engine?.refreshCookie!=='function')fail('CHILD_PIN_CONFIG',503);
 const codeHash=await sha(code),saved=await store.first('SELECT * FROM jwt_v110_child_pin_intents WHERE app=? AND code_hash=? AND phase=1',[app,codeHash]);if(!saved)fail('CHILD_PIN_PROOF_REPLAY');
 const intent=await verifyChildPINPacket({kind:'intent',body:saved.intent_json,signature:saved.intent_signature,secret,app,now,rootRunId,childRunId});
 const proof=await verifyChildPINPacket({kind:'unlock',body:saved.reply_json,signature:saved.reply_signature,secret,app,now,rootRunId,childRunId,intent});
 if(now<intent.issuedAtS||saved.intent_digest!==await childPINIntentDigest(intent)||saved.reply_digest!==await sha(saved.reply_json)||proof.codeHash!==codeHash||intent.state!==state||intent.challenge!==encode(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(verifier)))))fail('CHILD_PIN_PROOF_REJECTED');
 const {row,fp}=await ownedRow(store,app,raw,now);
 await authorize({family:familyOf(row),now,actor:actorFor(app,row)});
 matchesIntent(row,intent);
 const pinAt=Math.min(now,proof.pinVerifiedAtS),claims={sub:row.account_id,sid:row.family_id,psid:row.parent_session_id,bsid:row.browser_id,bv:row.browser_generation,ce:row.credential_epoch,pv:row.current_permission_version,ue:proof.childUnlockGeneration,s_iat:row.original_signed_in_at_s,s_exp:row.original_expires_at_s};
 const issued=await engine.issue(claims,now),c=issued?.claims;
 if(!c||!childRights(app,c)||Object.keys(claims).some(k=>claims[k]!==c[k])||c.iss!==issuers[app]||c.aud!=='urn:ummabbadacademy:'+app+':api'||!uint(c.exp)||c.exp<=now||c.exp>Math.min(now+900,row.original_expires_at_s))fail('CHILD_PIN_PREPARATION',503);
 const next=encode(crypto.getRandomValues(new Uint8Array(32))),nextFP=await refreshFingerprint(app,next);
 const cookies=Object.freeze([engine.accessCookie(issued.token,c.exp,now),engine.refreshCookie(next,row.original_expires_at_s,now)]);
 const family=Object.freeze({...familyOf(row),unlock_generation:c.ue});
 const response=await prepareClient({claims:Object.freeze({...c}),family,cookies,actor:actorFor(app,row),lastForegroundRefreshS:pinAt,serverNowS:now,pinVerifiedAtS:pinAt});
 if(!(response instanceof Response))fail('CHILD_PIN_PREPARATION',503);
 const commitNow=freshCommit(clock,at),guard=guardFor(store,app,row,commitNow),id=crypto.randomUUID(),op='pin-unlock:'+intent.intentId,table=guardTable(app);
 const statements=[
  store.statement('INSERT INTO '+table+'(guard_id,accepted) SELECT ?,('+guard.sql+') AND EXISTS(SELECT 1 FROM jwt_v110_families WHERE family_id=? AND refresh_generation=? AND unlock_generation=? AND (refresh_fp=? OR previous_fp=?)) AND EXISTS(SELECT 1 FROM jwt_v110_child_pin_intents WHERE intent_id=? AND app=? AND phase=1 AND code_hash=? AND intent_digest=? AND reply_digest=? AND reply_signature=? AND expires_at_s>?) AND ?<? AND ?<=? AND ?-?<=60 AND NOT EXISTS(SELECT 1 FROM jwt_v110_security_audit WHERE operation_id=?)',[id,...guard.args,row.family_id,intent.nativeRefreshGeneration,intent.childUnlockGeneration,fp,fp,intent.intentId,app,codeHash,saved.intent_digest,saved.reply_digest,saved.reply_signature,commitNow,commitNow,proof.expiresAtS,pinAt,commitNow,commitNow,pinAt,op]),
  store.statement('UPDATE jwt_v110_families SET previous_fp=refresh_fp,refresh_fp=?,refresh_generation=refresh_generation+1,unlock_generation=unlock_generation+1,permission_version=?,last_fg_refresh_s=?,rotated_at_s=?,rotation_operation_id=? WHERE family_id=? AND refresh_generation=? AND unlock_generation=? RETURNING family_id,refresh_generation,unlock_generation',[nextFP,row.current_permission_version,pinAt,commitNow,op,row.family_id,intent.nativeRefreshGeneration,intent.childUnlockGeneration]),
  store.statement('UPDATE jwt_v110_child_pin_intents SET phase=2,consumed_at_s=? WHERE intent_id=? AND app=? AND phase=1 AND code_hash=? RETURNING intent_id',[commitNow,intent.intentId,app,codeHash]),
  store.statement("INSERT INTO jwt_v110_security_audit VALUES(?,?,'child-pin-unlock',?)",[op,row.family_id,pinAt]),
  store.statement('DELETE FROM '+table+' WHERE guard_id=?',[id])
 ];
 let results;try{results=await store.batch(statements);}catch{fail('CHILD_PIN_COMMIT_CONFLICT',409);}
 const familyResult=results?.[1]?.results?.[0],intentResult=results?.[2]?.results?.[0];
 if(results?.[1]?.results?.length!==1||familyResult.family_id!==row.family_id||familyResult.refresh_generation!==row.refresh_generation+1||familyResult.unlock_generation!==row.unlock_generation+1||results?.[2]?.results?.length!==1||intentResult.intent_id!==intent.intentId)fail('CHILD_PIN_COMMIT_UNCONFIRMED',503);
 const value={kind:'unlocked'};Object.defineProperty(value,'clientResponse',{value:response});return Object.freeze(value);
}


// Private Root peer metadata ONLY. Never route this to a browser or confer
// access from the returned signed intent; actual Root PIN and child CAS remain.
export async function readNativeChildPINIntentForRoot({store,app,intentId,secret,rootRunId,childRunId,clock=Date.now}){
 const {at,now}=configured(store,app,clock);
 if(!opaque(intentId)||!/^[a-f0-9]{64}$/.test(rootRunId||'')||!/^[a-f0-9]{64}$/.test(childRunId||''))fail('CHILD_PIN_CONFIG',503);
 const saved=await store.first('SELECT * FROM jwt_v110_child_pin_intents WHERE intent_id=? AND app=? AND phase=0 AND expires_at_s>?',[intentId,app,now]);
 if(!saved)fail('CHILD_PIN_INTENT_REQUIRED');
 const intent=await verifyChildPINPacket({kind:'intent',body:saved.intent_json,signature:saved.intent_signature,secret,app,now,rootRunId,childRunId});
 if(saved.intent_digest!==await childPINIntentDigest(intent)||intent.intentId!==intentId)fail('CHILD_PIN_PROOF_REJECTED');
 const row=await store.first(query(app,false),parameters(app,intent.familyId,now,false));validateRow(row);matchesIntent(row,intent);
 const committed=freshCommit(clock,at),current=await store.first(query(app,false),parameters(app,intent.familyId,committed,false));validateRow(current);matchesIntent(current,intent);
 const still=await store.first('SELECT intent_json,intent_signature,intent_digest FROM jwt_v110_child_pin_intents WHERE intent_id=? AND app=? AND phase=0 AND expires_at_s>?',[intentId,app,committed]);
 if(!still||still.intent_json!==saved.intent_json||still.intent_signature!==saved.intent_signature||still.intent_digest!==saved.intent_digest)fail('CHILD_PIN_STATE_CHANGED');
 return Object.freeze({body:saved.intent_json,signature:saved.intent_signature});
}
