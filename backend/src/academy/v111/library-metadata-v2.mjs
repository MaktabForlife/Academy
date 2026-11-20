import {canonical,bytes,b64u,unb64u,hmac,equal,digest,requireThat,safeInt,uuid,strictJSON} from '../../../../security/v2/codec.mjs';
import {loadRuntimeConfiguration} from '../../../../security/v2/runtime-config.mjs';
import {PrimaryStore} from '../../../../security/v2/store.mjs';
import {primaryWriteCondition} from '../../../../security/v2/primary-write-guard.mjs';
import {nativeRequestContext} from './native-context.js';
import {federatedDatabase} from '../separation/federation.js';
import {loadOpenLibraryTaxonomy,resolveOpenLibraryTaxonomySelection} from '../d1/library-taxonomy.js';
import {validateOpenLibraryMetadata,isOpenLibraryMetadataId,isAcademyLinkId} from '../../lib/open-library-metadata.js';
const PURPOSE='academy-open-library-metadata-v2',origin='https://ummabbadacademy.app';
export const libraryMetadataSchemaSQL=`
CREATE TABLE IF NOT EXISTS jwt_v2_library_metadata_commits(operation_id TEXT PRIMARY KEY,record_id TEXT NOT NULL,actor_sub TEXT NOT NULL,input_digest TEXT NOT NULL,previous_revision INTEGER NOT NULL,previous_digest TEXT NOT NULL,next_revision INTEGER NOT NULL,record_json TEXT NOT NULL,result_json TEXT NOT NULL,binding_json TEXT NOT NULL,rights_hash TEXT NOT NULL,committed_at INTEGER NOT NULL,UNIQUE(record_id,next_revision));
CREATE TRIGGER IF NOT EXISTS jwt_v2_library_metadata_commit_immutable BEFORE UPDATE ON jwt_v2_library_metadata_commits BEGIN SELECT RAISE(ABORT,'jwt_v2_immutable_library_commit');END;
CREATE TRIGGER IF NOT EXISTS jwt_v2_library_metadata_commit_preserve BEFORE DELETE ON jwt_v2_library_metadata_commits BEGIN SELECT RAISE(ABORT,'jwt_v2_durable_library_commit');END;
CREATE TABLE IF NOT EXISTS jwt_v2_library_metadata_heads(record_id TEXT PRIMARY KEY,operation_id TEXT NOT NULL UNIQUE,revision INTEGER NOT NULL,digest TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS jwt_v2_library_metadata_projection(operation_id TEXT PRIMARY KEY,applied INTEGER NOT NULL DEFAULT 0 CHECK(applied IN(0,1)));
`;
export const libraryMetadataLocalSchemaSQL=`CREATE TABLE IF NOT EXISTS open_library_metadata_operations(operation_id TEXT PRIMARY KEY,input_digest TEXT NOT NULL,record_id TEXT NOT NULL,revision INTEGER NOT NULL,result_json TEXT NOT NULL);`;
const keyFor=env=>{requireThat(env?.UAA_V2_ENABLED==='1','V2_LIBRARY_REQUIRED',503);return unb64u(env.UAA_V2_LIBRARY_METADATA_KEY,32);};
const coverKey=value=>value===''||typeof value==='string'&&/^AcademyOpenLibrary\/Covers\/[0-9a-f-]{36}\.(jpg|png)$/.test(value);
const requestDigest=(input,uploadedCoverKey)=>digest({input,uploadedCoverKey});
export async function buildLibraryMetadataProof(request,input,uploadedCoverKey=''){
 const context=nativeRequestContext(request);requireThat(context&&new URL(request.url).origin===origin&&request.headers.get('X-Academy-Workspace')==='ADMIN','LIBRARY_BRANDED_ADMIN_REQUIRED',403);
 const {runtime,cap}=context,c=runtime.businessCapability(cap),state=c.rights?.nativeState;
 requireThat(runtime.app==='academy'&&c.rights.globalAdmin===true&&state?.account?.account_id===c.binding.sub&&state.account.active===1&&state.account.global_admin===1,'LIBRARY_CAPTURED_GLOBAL_ADMIN_REQUIRED',403);
 requireThat(uuid(input?.operationId)&&typeof input.creating==='boolean'&&coverKey(uploadedCoverKey),'LIBRARY_OPERATION_REQUIRED',400);
 const now=runtime.clock(),body={schema:2,purpose:PURPOSE,env:runtime.config.env,app:'academy',generation:runtime.settings.raw.generation,operationId:input.operationId,inputDigest:await requestDigest(input,uploadedCoverKey),binding:c.binding,kid:c.kid,rightsHash:await digest(c.rights),issuedAt:now,deadline:Math.min(c.deadline,now+60,c.binding.s_exp)};
 requireThat(body.deadline>now,'LIBRARY_PROOF_EXPIRED',401);return {body,signature:b64u(await hmac(keyFor(runtime.env),PURPOSE+'\0'+canonical(body)))};
}
async function settingsFor(env,{requireKey=true}={}){const settings=await loadRuntimeConfiguration(env,'academy');requireThat(env.ACADEMY_DB_GENERATION==='SPLIT_V1'&&env.ACADEMY_ADMIN_DB?.withSession&&env.ACADEMY_SPLIT_COORDINATOR?.getByName,'LIBRARY_OWNING_BINDINGS_REQUIRED',503);if(requireKey)keyFor(env);return settings;}
async function verify(env,proof,input,uploadedCoverKey,now){
 requireThat(proof&&Object.keys(proof).sort().join(',')==='body,signature','LIBRARY_PROOF_REQUIRED',401);const body=proof.body;
 requireThat(body&&Object.keys(body).sort().join(',')==='app,binding,deadline,env,generation,inputDigest,issuedAt,kid,operationId,purpose,rightsHash,schema'&&body.schema===2&&body.purpose===PURPOSE&&body.app==='academy'&&['production','feature'].includes(body.env)&&uuid(body.operationId)&&body.operationId===input?.operationId&&safeInt(body.issuedAt)&&safeInt(body.deadline)&&body.issuedAt<=now+1&&body.deadline>now&&body.deadline<=body.issuedAt+60&&/^[0-9a-f]{64}$/.test(body.rightsHash)&&coverKey(uploadedCoverKey),'LIBRARY_PROOF_INVALID',401);
 requireThat(bytes(canonical(body)).length<=8192&&equal(unb64u(proof.signature,32),await hmac(keyFor(env),PURPOSE+'\0'+canonical(body))),'LIBRARY_PROOF_MAC_INVALID',401);
 const settings=await settingsFor(env),b=body.binding;requireThat(body.env===settings.config.env&&body.generation===settings.raw.generation&&settings.apiKeys.has(body.kid)&&b?.iss===origin&&b.env===body.env&&b.aud==='urn:uaa:'+body.env+':academy:api:v2'&&uuid(b.sid)&&uuid(b.psid)&&uuid(b.bsid)&&safeInt(b.ce,1)&&safeInt(b.ae,1)&&body.deadline<=Math.min(b.vat+900,b.s_exp)&&body.inputDigest===await requestDigest(input,uploadedCoverKey),'LIBRARY_PROOF_BINDING_INVALID',401);
 return {body,settings,store:new PrimaryStore(settings.db,{app:'academy',env:settings.config.env,securityPrefix:settings.prefix})};
}
async function fence(store,settings,sub){
 const refs=settings.dependenciesFor(sub).filter(r=>['activities','subject_catalog','program_subjects','modules'].includes(r.id.split(':').at(-1)));requireThat(refs.length===4,'LIBRARY_TAXONOMY_DEPENDENCIES_REQUIRED',503);
 const state=await store.first('SELECT version,(SELECT head_id FROM setup_head_state WHERE singleton=1) head,(SELECT count(*) FROM split_write_fence) pending FROM split_read_state WHERE singleton=1');
 requireThat(state&&safeInt(state.version)&&typeof state.head==='string'&&state.pending===0,'LIBRARY_SPLIT_UNAVAILABLE',503);
 const rows=await store.all("SELECT d.id,d.scope,d.owner_epoch,d.revision FROM json_each(?) j JOIN jwt_v2_dependencies d ON d.id=json_extract(j.value,'$.id') AND d.scope=json_extract(j.value,'$.scope') AND d.owner_epoch=json_extract(j.value,'$.ownerEpoch') ORDER BY d.id,d.scope",canonical(refs));requireThat(rows.length===refs.length,'LIBRARY_TAXONOMY_DEPENDENCIES_REQUIRED',503);return {state,rows};
}
// This private reader has a closed native query vocabulary, both real owning
// bindings and a before/after fence. It is not a generic RPC/SQL authority.
export async function libraryMetadataTaxonomy(env,{settings=null,store=null,sub=null}={}){
 settings||=await settingsFor(env);store||=new PrimaryStore(settings.db,{app:'academy',env:settings.config.env,securityPrefix:settings.prefix});sub||='library-taxonomy';
 const before=await fence(store,settings,sub),core=env.ACADEMY_DB.withSession('first-primary'),admin=env.ACADEMY_ADMIN_DB.withSession('first-primary'),db=federatedDatabase({core,admin,owner:'admin'}),taxonomy=await loadOpenLibraryTaxonomy(env,{db});
 const after=await fence(store,settings,sub);requireThat(canonical(before)===canonical(after),'LIBRARY_TAXONOMY_CHANGED',409);return {taxonomy,fence:after};
}
const rowOf=(ctx,id)=>ctx.storage.sql.exec('SELECT metadata,revision FROM open_library_metadata WHERE id=?',id).toArray()[0]||null;
const rowDigest=row=>digest({metadata:row?.metadata||null,revision:Number(row?.revision||0)});
const lock=(ctx,fn)=>ctx.blockConcurrencyWhile(fn);
async function project(ctx,store,commit){
 const sql=ctx.storage.sql,already=sql.exec('SELECT input_digest,result_json FROM open_library_metadata_operations WHERE operation_id=?',commit.operation_id).toArray()[0];
 if(already){requireThat(already.input_digest===commit.input_digest&&already.result_json===commit.result_json,'LIBRARY_PROJECTION_CONFLICT',503);await store.stmt('UPDATE jwt_v2_library_metadata_projection SET applied=1 WHERE operation_id=?',commit.operation_id).run();return strictJSON(bytes(already.result_json));}
 const current=rowOf(ctx,commit.record_id);requireThat(Number(current?.revision||0)===commit.previous_revision&&await rowDigest(current)===commit.previous_digest,'LIBRARY_PROJECTION_CONFLICT',503);
 // No await occurs between the actual local CAS and its local exact receipt.
 ctx.storage.transactionSync(()=>{const changed=sql.exec(`INSERT INTO open_library_metadata(id,metadata,revision,updated_at,updated_by) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET metadata=excluded.metadata,revision=excluded.revision,updated_at=excluded.updated_at,updated_by=excluded.updated_by WHERE open_library_metadata.revision=?`,commit.record_id,commit.record_json,commit.next_revision,new Date(commit.committed_at*1000).toISOString(),commit.actor_sub,commit.previous_revision);requireThat(changed.rowsWritten>0,'LIBRARY_PROJECTION_CONFLICT',503);sql.exec('INSERT INTO open_library_metadata_operations VALUES(?,?,?,?,?)',commit.operation_id,commit.input_digest,commit.record_id,commit.next_revision,commit.result_json);});
 await store.stmt('UPDATE jwt_v2_library_metadata_projection SET applied=1 WHERE operation_id=?',commit.operation_id).run();return strictJSON(bytes(commit.result_json));
}
async function pending(ctx,store,id=null){const rows=await store.all(`SELECT c.* FROM jwt_v2_library_metadata_projection p JOIN jwt_v2_library_metadata_commits c USING(operation_id) WHERE p.applied=0${id?' AND c.record_id=?':''} ORDER BY c.committed_at,c.next_revision LIMIT 8`,...id?[id]:[]);for(const row of rows)await project(ctx,store,row);}
export async function reconcileLibraryMetadata(ctx,env,id=null){return lock(ctx,async()=>{const settings=await settingsFor(env,{requireKey:false}),store=new PrimaryStore(settings.db,{app:'academy',env:settings.config.env,securityPrefix:settings.prefix});await pending(ctx,store,id);});}
export async function saveLibraryMetadataV2(ctx,env,input,proof,uploadedCoverKey='',{clock=()=>Math.floor(Date.now()/1000),beforeJournal=null,afterJournal=null}={}){
 return lock(ctx,async()=>{
  const {body,settings,store}=await verify(env,proof,input,uploadedCoverKey,clock());requireThat(isOpenLibraryMetadataId(input?.id)&&typeof input.creating==='boolean'&&safeInt(input.baseRevision),'LIBRARY_RECORD_REQUIRED',400);
  requireThat(!input.creating||input.kind==='LINK'&&isAcademyLinkId(input.id)&&uuid(input.id.slice('EXTERNAL:ACADEMY_LINK:'.length))&&input.baseRevision===0,'LIBRARY_CREATE_REQUIRED',400);
  const previousCommit=await store.first('SELECT * FROM jwt_v2_library_metadata_commits WHERE operation_id=?',body.operationId);
  if(previousCommit){requireThat(previousCommit.input_digest===body.inputDigest&&previousCommit.actor_sub===body.binding.sub&&previousCommit.record_id===input.id,'LIBRARY_OPERATION_REUSED',409);return project(ctx,store,previousCommit);}
  await pending(ctx,store,input.id);const current=rowOf(ctx,input.id),revision=Number(current?.revision||0);
  requireThat(!(input.creating&&current)&&(!isAcademyLinkId(input.id)||input.creating||current)&&revision===input.baseRevision,'LIBRARY_ROW_CHANGED',409);
  const loaded=await libraryMetadataTaxonomy(env,{settings,store,sub:body.binding.sub}),record=validateOpenLibraryMetadata({...input,...resolveOpenLibraryTaxonomySelection(input,loaded.taxonomy)}),previous=current?strictJSON(bytes(current.metadata)):{};
  requireThat(!current||Boolean(previous.kind==='LINK')===Boolean(record.kind==='LINK'),'LIBRARY_RESOURCE_TYPE_CHANGED',409);
  record.coverKey=uploadedCoverKey||(record.coverUrl||input.removeCover===true?'':previous.coverKey||'');
  const result={...record,revision:revision+1,previousCoverKey:previous.coverKey&&previous.coverKey!==record.coverKey?previous.coverKey:''},recordJSON=canonical(record),resultJSON=canonical(result),priorDigest=await rowDigest(current),nextDigest=await digest({metadata:recordJSON,revision:revision+1});requireThat(bytes(resultJSON).length<=60000,'LIBRARY_RECORD_TOO_LARGE',413);
  if(beforeJournal)await beforeJournal();const now=clock(),primary=primaryWriteCondition({binding:body.binding,app:'academy',env:body.env,now,kid:body.kid,rightsHash:body.rightsHash}),native=store.guard(`SELECT 1 FROM accounts a JOIN account_credentials c USING(account_id) JOIN split_read_state s ON s.singleton=1 JOIN setup_head_state h ON h.singleton=1 WHERE a.account_id=? COLLATE BINARY AND a.active=1 AND c.credential_epoch=? AND c.pin_setup=1 AND length(trim(c.pin_hash))>0 AND EXISTS(SELECT 1 FROM global_role_assignments g WHERE g.account_id=a.account_id COLLATE BINARY AND g.active=1 AND g.role='GLOBAL_ADMIN' AND g.review_state='CONFIRMED') AND s.version=? AND h.head_id=? AND NOT EXISTS(SELECT 1 FROM split_write_fence) AND NOT EXISTS(SELECT 1 FROM json_each(?) j WHERE NOT EXISTS(SELECT 1 FROM jwt_v2_dependencies d WHERE d.id=json_extract(j.value,'$.id') AND d.scope=json_extract(j.value,'$.scope') AND d.owner_epoch=json_extract(j.value,'$.owner_epoch') AND d.revision=json_extract(j.value,'$.revision'))) AND ?>? AND ?>unixepoch() AND ?<=?+60`,[body.binding.sub,body.binding.ce,loaded.fence.state.version,loaded.fence.state.head,canonical(loaded.fence.rows),body.deadline,now,body.deadline,body.deadline,body.issuedAt]),auth=store.guard(primary.sql,primary.args),control=store.guard("SELECT 1 FROM jwt_v2_objects app WHERE app.object_key=? AND app.state='ACTIVE' AND app.seed_observed=1 AND EXISTS(SELECT 1 FROM jwt_v2_objects local WHERE local.object_key=? AND local.state IN('SEED','ACTIVE') AND local.seed_observed=1)",[settings.prefix+'control/app',settings.prefix+'security/session/'+body.binding.sid]),head=store.guard('SELECT 1 WHERE NOT EXISTS(SELECT 1 FROM jwt_v2_library_metadata_heads WHERE record_id=?) OR EXISTS(SELECT 1 FROM jwt_v2_library_metadata_heads WHERE record_id=? AND revision=? AND digest=?)',[input.id,input.id,revision,priorDigest]);
  await store.batch([auth[0],native[0],control[0],head[0],store.stmt('INSERT INTO jwt_v2_library_metadata_commits VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',body.operationId,input.id,body.binding.sub,body.inputDigest,revision,priorDigest,revision+1,recordJSON,resultJSON,canonical(body.binding),body.rightsHash,now),store.stmt('INSERT INTO jwt_v2_library_metadata_heads VALUES(?,?,?,?) ON CONFLICT(record_id) DO UPDATE SET operation_id=excluded.operation_id,revision=excluded.revision,digest=excluded.digest',input.id,body.operationId,revision+1,nextDigest),store.stmt('INSERT INTO jwt_v2_library_metadata_projection VALUES(?,0)',body.operationId),head[1],control[1],native[1],auth[1]]);
  const committed=await store.first('SELECT * FROM jwt_v2_library_metadata_commits WHERE operation_id=?',body.operationId);if(afterJournal)await afterJournal();return project(ctx,store,committed);
 });
}
