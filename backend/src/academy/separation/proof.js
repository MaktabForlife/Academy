import {localActorProof,localProofContext,verifiedCoordinatorContext,coordinatorPrimaryCondition} from '../v111/coordinator-proof.mjs';
import {surahRightsSQL} from '../d1/surah-grants.js';
import {monthlyRightsSQL} from '../d1/monthly-media-policy.js';
import {actualState} from '../d1/workspace-access.js';
import {permissionSignature} from './permission-signature.js';
export {permissionSignature} from './permission-signature.js';
export function actorProof(auth){
 const state=actualState(auth),plain={accountId:auth.user.accountid,sid:auth.sid,epoch:state.account.credential_epoch,monthlyMedia:state.monthlyMediaEnabled===true,surahGrants:state.surahGrantsEnabled===true,signature:permissionSignature({globalAdmin:state.account.global_admin,roles:state.roles,subscriptions:state.subscriptions,grants:JSON.parse(state.account.substitute_grants||'[]'),...(state.monthlyMediaEnabled?{monthlyMedia:state.monthlyMedia}:{} ),...(state.surahGrantsEnabled?{surahGrants:state.surahGrants}:{} )})};return localActorProof(auth,plain)||plain;
}
const roles=`SELECT r.activity_key,r.role FROM effective_activity_roles r JOIN activities x USING(activity_key) WHERE r.account_id=a.account_id AND x.active=1 AND x.lifecycle='ACTIVE'
 UNION SELECT e.activity_key,m.target_role FROM legacy_access_evidence e JOIN activities x USING(activity_key) JOIN role_import_reviews v ON v.account_id=e.account_id AND v.activity_key=e.activity_key AND v.source_value=e.source_role JOIN role_mapping_decisions m ON m.source_role=e.source_role WHERE e.account_id=a.account_id AND e.source_role IN('ADMIN','SENIOR') AND e.source_effective=1 AND v.status='REQUIRED' AND x.active=1 AND x.lifecycle='ACTIVE'`;
const sql=`SELECT (SELECT version FROM split_read_state WHERE singleton=1) version,
 EXISTS(SELECT 1 FROM global_role_assignments g WHERE g.account_id=a.account_id AND g.active=1 AND g.role='GLOBAL_ADMIN' AND g.review_state='CONFIRMED') global_admin,
 (SELECT json_group_array(json_object('activity_key',activity_key,'role',role)) FROM (${roles})) roles_json,
 (SELECT json_group_array(json_object('activity_key',activity_key)) FROM effective_course_subscriptions WHERE account_id=a.account_id) subscriptions_json,
 (SELECT json_group_array(json_object('id',g.assignment_id,'activityKey',g.activity_key)) FROM attendance_substitutes g JOIN activities x USING(activity_key) WHERE g.account_id=a.account_id AND x.active=1 AND x.lifecycle='ACTIVE' AND g.revoked_at IS NULL AND g.starts_at<=strftime('%Y-%m-%dT%H:%M:%fZ','now') AND max(g.correction_until,coalesce(g.correction_reopen_until,''))>strftime('%Y-%m-%dT%H:%M:%fZ','now')) grants_json
 FROM accounts a JOIN account_credentials c USING(account_id) JOIN account_sessions s USING(account_id)
 WHERE a.account_id=?1 AND a.active=1 AND c.credential_epoch=?3 AND c.pin_setup=1 AND length(trim(c.pin_hash))>0
 AND s.session_id=?2 AND s.revoked_at IS NULL AND s.credential_epoch=c.credential_epoch AND s.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now')`;
const currentVersion=async core=>{const row=await core.prepare('SELECT version FROM split_read_state WHERE singleton=1').first();if(!row)throw Object.assign(Error('Native split state is unavailable.'),{status:503,code:'SPLIT_READ_CHANGED'});return row.version;};
async function verifyV2Actor(core,proof){
 const context=verifiedCoordinatorContext(proof);if(!context)throw Object.assign(Error('Current coordinator proof is required.'),{status:401,code:'SESSION_ENDED'});
 const guard=coordinatorPrimaryCondition(proof,{now:context.clock()}),state=proof.nativeState;
 const select=sql.slice(0,sql.indexOf('FROM accounts'));
 let authority=select+(state.monthlyMediaEnabled?`,(SELECT json_group_array(json_object('activity_key',activity_key,'lesson_month',lesson_month,'revision',revision,'class_ids_json',class_ids_json)) FROM (${monthlyRightsSQL('a.account_id')})) monthly_json`:'' )+(state.surahGrantsEnabled?`,(SELECT json_group_array(json_object('activity_key',activity_key,'surah_id',surah_id,'revision',revision)) FROM (${surahRightsSQL('a.account_id')})) surah_json`:'' )+
  ` FROM accounts a JOIN account_credentials c USING(account_id) WHERE a.account_id=? AND a.active=1 AND c.credential_epoch=? AND c.pin_setup=1 AND length(trim(c.pin_hash))>0 AND EXISTS(${guard.sql})`;
 const row=await core.prepare(authority).bind(proof.accountId,proof.epoch,...guard.args).first();
 if(!row||permissionSignature({globalAdmin:row.global_admin,roles:JSON.parse(row.roles_json),subscriptions:JSON.parse(row.subscriptions_json),grants:JSON.parse(row.grants_json),...(state.monthlyMediaEnabled?{monthlyMedia:JSON.parse(row.monthly_json)}:{}),...(state.surahGrantsEnabled?{surahGrants:JSON.parse(row.surah_json)}:{})})!==proof.signature)throw Object.assign(Error(row?'Native permissions changed.':'Native family or account is unavailable.'),{status:401,code:'SESSION_ENDED'});return row.version;
}
export async function verifyActor(core,proof){
 if(localProofContext(proof))return currentVersion(core);if(verifiedCoordinatorContext(proof))return verifyV2Actor(core,proof);
 if(!proof||typeof proof.accountId!=='string'||typeof proof.sid!=='string'||!Number.isInteger(proof.epoch)||typeof proof.signature!=='string')throw Object.assign(Error('Sign in again before saving.'),{status:401,code:'SESSION_ENDED'});
 let authoritySQL=proof.monthlyMedia?sql.replace(' grants_json\n',` grants_json, (SELECT json_group_array(json_object('activity_key',activity_key,'lesson_month',lesson_month,'revision',revision,'class_ids_json',class_ids_json)) FROM (${monthlyRightsSQL('a.account_id')})) monthly_json\n`):sql;
 if(proof.surahGrants)authoritySQL=authoritySQL.replace(' grants_json',` grants_json, (SELECT json_group_array(json_object('activity_key',activity_key,'surah_id',surah_id,'revision',revision)) FROM (${surahRightsSQL('a.account_id')})) surah_json`);
 const row=await core.prepare(authoritySQL).bind(proof.accountId,proof.sid,proof.epoch).first();if(!row||permissionSignature({globalAdmin:row.global_admin,roles:JSON.parse(row.roles_json),subscriptions:JSON.parse(row.subscriptions_json),grants:JSON.parse(row.grants_json),...(proof.monthlyMedia?{monthlyMedia:JSON.parse(row.monthly_json)}:{}),...(proof.surahGrants?{surahGrants:JSON.parse(row.surah_json)}:{})})!==proof.signature)throw Object.assign(Error('Your session or permissions changed. Refresh before continuing.'),{status:401,code:'SESSION_ENDED'});return row.version;
}
// Only reuse a verification performed by trusted server code for this exact
// actor proof (request/read batch or engine-private cache). Never accept a
// caller-supplied version as verification. Every Core
// table mutation increments split_read_state, so a changed epoch requires the
// full authority comparison. Expiry and timed substitute grants are checked
// even when no database write occurred in the meantime.
export async function verifyActorVersion(core,proof,verifiedVersion){
 const local=localProofContext(proof),remote=verifiedCoordinatorContext(proof);if(local)return currentVersion(core);if(remote){if(remote.service){const g=coordinatorPrimaryCondition(proof,{now:remote.clock()});if(!await core.prepare(g.sql).bind(...g.args).first())throw Object.assign(Error('Business source authority ended.'),{status:401,code:'SESSION_ENDED'});}if(remote.body.deadline<=remote.clock())throw Object.assign(Error('Coordinator proof expired.'),{status:401,code:'SESSION_ENDED'});return currentVersion(core);}
 if(!Number.isInteger(verifiedVersion))return verifyActor(core,proof);
 const row=await core.prepare(`SELECT v.version,
  (SELECT json_group_array(json_object('id',g.assignment_id,'activityKey',g.activity_key)) FROM attendance_substitutes g JOIN activities x USING(activity_key) WHERE g.account_id=a.account_id AND x.active=1 AND x.lifecycle='ACTIVE' AND g.revoked_at IS NULL AND g.starts_at<=strftime('%Y-%m-%dT%H:%M:%fZ','now') AND max(g.correction_until,coalesce(g.correction_reopen_until,''))>strftime('%Y-%m-%dT%H:%M:%fZ','now')) grants_json
  FROM split_read_state v JOIN accounts a ON a.account_id=?1 JOIN account_credentials c USING(account_id) JOIN account_sessions s USING(account_id)
  WHERE v.singleton=1 AND v.version=?4 AND a.active=1 AND c.credential_epoch=?3 AND c.pin_setup=1 AND length(trim(c.pin_hash))>0
  AND s.session_id=?2 AND s.revoked_at IS NULL AND s.credential_epoch=c.credential_epoch AND s.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now')`).bind(proof.accountId,proof.sid,proof.epoch,verifiedVersion).first();
 if(row&&permissionSignature({grants:JSON.parse(row.grants_json)})===JSON.stringify([false,[],[],JSON.parse(proof.signature)[3]]))return row.version;
 return verifyActor(core,proof);
}
