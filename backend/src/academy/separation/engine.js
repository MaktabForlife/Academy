import {v2NativeSessionStatement} from '../v111/native-session-sql.mjs';
import {verifyCoordinatorProof,verifiedCoordinatorContext,coordinatorPrimaryCondition} from '../v111/coordinator-proof.mjs';
import {lessonContextSelection,validateLessonContextCapture} from './lesson-context-read.js';
import {authorizeRecordedRead} from './recorded-context-read.js';
import {compilePlan} from './compile.js';
import {federationContext,rewriteRead} from './federation.js';
import {verifyActor,verifyActorVersion} from './proof.js';
import {payloadHash} from '../../programs/timetable-model.js';
const item=(sql,...params)=>({sql,params}),fail=(message,code='SPLIT_RECOVERY_PENDING',status=503)=>Object.assign(Error(message),{code,status});
const batch=(db,list)=>list.filter(Boolean).length?db.batch(list.filter(Boolean).map(s=>db.prepare(s.sql).bind(...s.params))):Promise.resolve([]);
const guard=(id,phase)=>item("INSERT INTO split_transaction_guards VALUES('phase',EXISTS(SELECT 1 FROM split_commands WHERE command_id=? AND phase=?)) ON CONFLICT(guard_id) DO UPDATE SET accepted=excluded.accepted",id,phase);
const clear=()=>null;
function chunks(value){const text=JSON.stringify(value),out=[];for(let i=0;i<text.length;){let end=Math.min(text.length,i+300000);if(end<text.length&&/[\uD800-\uDBFF]/.test(text[end-1]))end--;out.push(text.slice(i,end));i=end;}return out;}
const save=(id,payload)=>[...chunks(payload).map((part,i)=>item('INSERT INTO split_command_parts VALUES(?,?,?)',id,i,part))];
async function load(db,id){const parts=(await db.prepare('SELECT payload FROM split_command_parts WHERE command_id=? ORDER BY part_index').bind(id).all()).results;return parts.length?JSON.parse(parts.map(p=>p.payload).join('')):null;}
const phase=(db,id)=>db.prepare('SELECT * FROM split_commands WHERE command_id=?').bind(id).first();
const semantic=e=>/academy_management_stale|constraint|split_transaction_state|lesson_media_pdf_limit|foreign key|unique/i.test(e.message)||e.status>=400&&e.status<500;
// One instance coordinates the two stores of one Academy generation. Ordinary
// Core reads/writes stay on D1; its triggers fence them only during this commit.
export function splitEngine({core,admin,alarm=async()=>{},hook=async()=>{},v2Env=null,clock=()=>Math.floor(Date.now()/1000)}){
 let tail=Promise.resolve();
 // Engine-private hints, never caller-supplied versions or cached acceptance.
 // Every reuse still checks the live Core version, session and timed grants.
 // Eviction/restart simply restores a full proof on the next read.
 const verifiedReaders=new Map(),readerKey=proof=>JSON.stringify([proof.accountId,proof.sid,proof.epoch,proof.signature]);
 const rememberReader=(key,version)=>{verifiedReaders.delete(key);verifiedReaders.set(key,version);if(verifiedReaders.size>128)verifiedReaders.delete(verifiedReaders.keys().next().value);};
 const exclusive=fn=>{const run=tail.then(fn,fn);tail=run.catch(()=>{});return run;};
 async function clean(id,state){await batch(core,[item('UPDATE split_commands SET phase=?,proof_json=NULL WHERE command_id=?',state,id),item('DELETE FROM split_command_parts WHERE command_id=?',id),item('DELETE FROM split_write_fence WHERE command_id=?',id)]);}
 async function abort(id){
  await batch(core,[guard(id,'PENDING'),item("UPDATE split_commands SET phase='ABORTING' WHERE command_id=?",id),clear(id)]);
  return rollback(id);
 }
 async function rollback(id){
  const a=await phase(admin,id);
  if(a?.phase==='APPLIED'){
   const payload=await load(admin,id);if(!payload)throw fail('Recovery evidence is missing.');
   await batch(admin,[item('PRAGMA defer_foreign_keys=ON'),guard(id,'APPLIED'),...payload.undo,item("UPDATE split_commands SET phase='ROLLED_BACK' WHERE command_id=?",id),item('DELETE FROM split_command_parts WHERE command_id=?',id),clear(id)]);
  }
  await clean(id,'ABORTED');
 }
 async function finish(id,known){
  const a=known?{phase:'APPLIED'}:await phase(admin,id);
  if(a?.phase==='APPLIED'){
   const payload=known||await load(admin,id);if(!payload)throw fail('Recovery evidence is missing.');
   await batch(admin,[guard(id,'APPLIED'),...payload.finalize,item("UPDATE split_commands SET phase='DONE' WHERE command_id=?",id),item('DELETE FROM split_command_parts WHERE command_id=?',id),clear(id)]);
  }else if(a?.phase!=='DONE')throw fail('The Admin commit needs recovery.');
  await clean(id,'DONE');
 }
 function actorCommitGuard(proof){
  if(verifiedCoordinatorContext(proof)){const g=coordinatorPrimaryCondition(proof,{now:verifiedCoordinatorContext(proof).clock()});return item("INSERT INTO split_transaction_guards VALUES('actor',EXISTS("+g.sql+")) ON CONFLICT(guard_id) DO UPDATE SET accepted=excluded.accepted",...g.args);}
  if(v2Env?.UAA_V2_ENABLED==='1')throw fail('A current V2 coordinator proof is required.','COORDINATOR_PROOF_REQUIRED',401);
  return item("INSERT INTO split_transaction_guards VALUES('actor',EXISTS(SELECT 1 FROM account_sessions s JOIN accounts a USING(account_id) JOIN account_credentials c USING(account_id) WHERE s.session_id=? AND a.account_id=? AND a.active=1 AND s.revoked_at IS NULL AND c.credential_epoch=? AND s.credential_epoch=c.credential_epoch AND c.pin_setup=1 AND length(trim(c.pin_hash))>0 AND s.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now'))) ON CONFLICT(guard_id) DO UPDATE SET accepted=excluded.accepted",proof.sid,proof.accountId,proof.epoch);
 }
 async function receiveProof(proof,command,input){return v2Env?.UAA_V2_ENABLED==='1'?verifyCoordinatorProof(proof,{env:v2Env,command,input,clock}):proof;}
 async function commit(id,plan,proof){
  // Admission checked current scoped authority under the Core fence. No Core
  // permission writer can pass it; the atomic guard below checks expiry again.
  const results=await batch(core,[item('PRAGMA defer_foreign_keys=ON'),guard(id,'PENDING'),
   actorCommitGuard(proof),
   item('UPDATE split_write_fence SET allow_write=1 WHERE command_id=?',id),...plan.core,
   // Invalidate source snapshots even when a successful save changed only
   // Admin-owned definitions and produced no mirrored Core field changes.
   item('UPDATE split_read_state SET version=version+1 WHERE singleton=1'),
   item("UPDATE split_commands SET phase='COMMITTED' WHERE command_id=?",id),item('UPDATE split_write_fence SET allow_write=0 WHERE command_id=?',id),clear(id),clear(id+'-actor')]);
  const out=plan.outcomes.map((value,i)=>plan.indexes[i]>=0?results[4+plan.indexes[i]]:value);
  await hook('core-committed',id);await finish(id,plan);return out;
 }
 async function recover(){
  const held=await core.prepare('SELECT command_id FROM split_write_fence WHERE singleton=1').first();if(!held)return;
  const id=held.command_id,c=await phase(core,id);await alarm();
  if(c.phase==='COMMITTED')return finish(id);
  if(c.phase==='ABORTING')return rollback(id);
  if(['ABORTED','DONE'].includes(c.phase))return clean(id,c.phase);
  // Tombstone before releasing Core prevents a delayed Admin request from
  // applying after recovery has decided to abort an unacknowledged command.
  await batch(admin,[item("INSERT INTO split_commands(command_id,phase,payload_hash,created_at) VALUES(?,'ABORTED',?,?) ON CONFLICT DO NOTHING",id,c.payload_hash,c.created_at)]);
  const a=await phase(admin,id);
  if(a.phase==='APPLIED'&&c.phase==='PENDING'){
   const plan=await load(core,id);if(!plan)throw fail('Recovery evidence is missing.');
   try{const stored=JSON.parse(c.proof_json),proof=v2Env?.UAA_V2_ENABLED==='1'?await verifyCoordinatorProof(stored,{env:v2Env,command:'write',inputDigest:plan.v2InputDigest,clock}):stored;await verifyActor(core,proof);return await commit(id,plan,proof);}catch(e){const current=await phase(core,id);if(current.phase==='COMMITTED')return finish(id);if(semantic(e))return abort(id);throw e;}
  }
  if(a.phase==='ABORTED')return clean(id,'ABORTED');
  throw fail('The interrupted save is still being recovered.');
 }
 async function write(statements,proof){return exclusive(async()=>{
  await recover();proof=await receiveProof(proof,'write',{statements,owner:null});const id=crypto.randomUUID(),hash=await payloadHash(statements),now=new Date().toISOString();
  await alarm();await batch(core,[item("INSERT INTO split_commands(command_id,phase,payload_hash,proof_json,created_at) VALUES(?,'PREPARING',?,?,?)",id,hash,JSON.stringify(verifiedCoordinatorContext(proof)?proof.envelope:proof),now),item('INSERT INTO split_write_fence VALUES(1,?,0)',id)]);
  let plan;
  try{
   await hook('admitted',id);await verifyActor(core,proof);const nativeStatements=verifiedCoordinatorContext(proof)?statements.map(s=>v2NativeSessionStatement(s,proof)):statements;plan=await compilePlan(core,admin,nativeStatements);if(verifiedCoordinatorContext(proof))plan.v2InputDigest=proof.envelope.body.inputDigest;
   await batch(core,plan.preflight);
   await batch(core,[guard(id,'PREPARING'),...save(id,plan),item("UPDATE split_commands SET phase='PENDING' WHERE command_id=?",id),clear(id)]);
   await hook('planned',id);
   // Identifier-only cross-store references never carry credentials or roles.
   const identities=(await core.prepare('SELECT account_id FROM actor_refs').all()).results,files=(await core.prepare('SELECT file_id FROM assessment_files').all()).results;
   await batch(admin,[item('PRAGMA defer_foreign_keys=ON'),item("INSERT INTO split_commands(command_id,phase,payload_hash,created_at) VALUES(?,'PREPARING',?,?) ON CONFLICT DO NOTHING",id,hash,now),guard(id,'PREPARING'),
    item("INSERT INTO identity_refs SELECT json_extract(value,'$.account_id') FROM json_each(?) WHERE 1 ON CONFLICT DO NOTHING",JSON.stringify(identities)),item("INSERT INTO file_refs SELECT json_extract(value,'$.file_id') FROM json_each(?) WHERE 1 ON CONFLICT DO NOTHING",JSON.stringify([...files,...plan.fileRefs])),
    ...plan.admin,...save(id,{undo:plan.undo,finalize:plan.finalize}),item("UPDATE split_commands SET phase='APPLIED' WHERE command_id=?",id),clear(id)]);
   await hook('admin-applied',id);return await commit(id,plan,proof);
  }catch(e){
   const c=await phase(core,id);
   if(c.phase==='COMMITTED'){await finish(id);return plan?.outcomes||[];}
   if(c.phase==='DONE')return plan?.outcomes||[];
   if(semantic(e)){
    if(c.phase==='PENDING')await abort(id);else if(c.phase==='PREPARING')await recover();
   }
   throw e;
  }
 });}
 async function read(statements,proof,owner='admin'){return exclusive(async()=>{
  await recover();proof=await receiveProof(proof,'read',{statements,owner});if(!proof)throw fail('Sign in before opening Admin.','SESSION_ENDED',401);
  const key=readerKey(proof);
  try{
  for(let attempt=0;attempt<3;attempt++){
   const before=await verifyActorVersion(core,proof,verifiedReaders.get(key));authorizeRecordedRead(statements,proof,owner);const lessonRead=lessonContextSelection(statements,proof,owner),context=federationContext({core,admin,owner}),data=await context.snapshot(statements.map(s=>s.sql),[],statements.map(s=>s.acceptedScope),null,statements.map(s=>s.recordedContextScope?{activityKey:s.recordedContextScope,params:s.params}:null),lessonRead);
   validateLessonContextCapture(data,lessonRead);
   const results=await batch(context.sources[owner],statements.map(s=>rewriteRead(s.sql,s.params,data)));await hook('read-captured');
   const after=await verifyActorVersion(core,proof,before);if(before===after){rememberReader(key,after);return results;}
  }
  throw fail('Access changed while loading. Refresh before continuing.','SPLIT_READ_CHANGED',409);
  }catch(error){verifiedReaders.delete(key);throw error;}
 });}
 return {write,read,recover:()=>exclusive(recover)};
}
