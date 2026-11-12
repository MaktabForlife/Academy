import {jwtActorPredicate} from './jwt-actor-guard-root-sensitive-v3.mjs';
import {federatedDatabase,federationContext,rewriteRead} from './federation.js';
import {adminTables,fieldOwner} from './ownership.js';
import {parseMutation,targetTable} from './sql-plan.js';
import {sourceLayout} from './layout.js';
import {actorProof} from './proof-root-sensitive-v3.js';
import {sqlCommand} from './sql-command.js';
const fail=()=>{throw Object.assign(Error('Split-store coordination is not configured.'),{status:503,code:'SPLIT_COORDINATOR_REQUIRED'});};
export function needsOwnerPlan(statements){return statements.some(s=>{
 const table=targetTable(s.sql);if(table==='operation_receipts'&&s.sql.includes("'$._acceptedChange'"))return true;if(['setup_heads','setup_batches','setup_components'].includes(table))return true;
 if(!adminTables.has(table))return false;
 if(table==='academy_settings')return true;
 if(sqlCommand(s.sql)==='UPDATE'){const plan=parseMutation(s.sql,sourceLayout);return plan.sets.some(c=>fieldOwner(table,c.column)==='admin');}
 return true;
});}
export function splitClient(env,core,admin){
 const namespace=env.ACADEMY_SPLIT_COORDINATOR;if(!namespace?.getByName)fail();let proof=null;
 const rpc=async(method,...args)=>{const result=await namespace.getByName('academy:SPLIT_V1:'+env.ACADEMY_D1_RUN_ID)[method](...args);if(result.error)throw Object.assign(Error(result.error.message),result.error);return result.result;};
 async function mutate(statements){
  if(needsOwnerPlan(statements))return rpc('write',statements,proof);
  // Core-only work retains its ordinary D1 transaction. Core triggers reject
  // it while an owner commit is pending; no permission change can slip past it.
  const version=await core.prepare('SELECT version FROM split_read_state WHERE singleton=1').first(),context=federationContext({core,admin,owner:'core'}),data=await context.snapshot(statements.map(s=>s.sql)),id=crypto.randomUUID();
  const jwt=await jwtActorPredicate(proof,{commit:true}),native=jwt.sql?" AND EXISTS(SELECT 1 FROM accounts a JOIN account_credentials c USING(account_id) JOIN account_sessions s USING(account_id) WHERE a.account_id=? AND a.active=1 AND s.session_id=? AND s.revoked_at IS NULL AND c.credential_epoch=? AND s.credential_epoch=c.credential_epoch AND c.pin_setup=1 AND length(trim(c.pin_hash))>0 AND s.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now')"+jwt.sql+")":'';
  const result=await core.batch([core.prepare('INSERT INTO academy_write_guards VALUES(?,EXISTS(SELECT 1 FROM split_read_state WHERE singleton=1 AND version=?'+native+'))').bind(id,version.version,...(jwt.sql?[proof.accountId,proof.sid,proof.epoch,...jwt.values]:[])),...statements.map(s=>{const r=rewriteRead(s.sql,s.params,data);return core.prepare(r.sql).bind(...r.params);}),core.prepare('DELETE FROM academy_write_guards WHERE guard_id=?').bind(id)]);return result.slice(1,-1);
 }
 const read=(statements,owner)=>rpc('read',statements,proof,owner);
 const db=owner=>federatedDatabase({core,admin,owner,mutate,read});
 return {core:db('core'),admin:db('admin'),bindActor(auth){const next=actorProof(auth);if(proof?.jwt&&!next.jwt)throw Object.assign(Error('App binding was lost.'),{status:401,code:'SESSION_ENDED'});if(proof?.rootSensitive&&!next.rootSensitive)throw Object.assign(Error('Sensitive action binding was lost.'),{status:401,code:'SESSION_ENDED'});if(proof?.rootSensitiveRequired&&!next.rootSensitiveRequired)throw Object.assign(Error('Sensitive workspace binding was lost.'),{status:401,code:'SESSION_ENDED'});proof=next;}};
}
