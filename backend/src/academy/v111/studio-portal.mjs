import {scopedVectorId} from '../../../../security/v2/issuance-floors.mjs';
import {nativeAuthContext} from './native-context.js';
import {createStudioAuthorityExport,studioAuthoritySourceFloor} from './studio-authority-source.mjs';
import {portalFetch} from '../../../../security/v2/portal-business.mjs';
import {canonical,strictJSON,requireThat,digest,opaque,unb64u,bytes,sha256,hex,vectorDigest} from '../../../../security/v2/codec.mjs';
import {ORIGINS} from '../../../../security/v2/tokens.mjs';
export const studioPortalSourceSchemaSQL=[
 "CREATE TABLE IF NOT EXISTS jwt_v2_portal_deliveries(sub TEXT PRIMARY KEY,export_id TEXT NOT NULL,manifest_digest TEXT NOT NULL,next_page INTEGER NOT NULL DEFAULT -1,installed INTEGER NOT NULL DEFAULT 0);",
 "CREATE TABLE IF NOT EXISTS jwt_v2_root_delegations(delegation_id TEXT PRIMARY KEY,binding_json TEXT NOT NULL,head_json TEXT NOT NULL,api_kid TEXT NOT NULL,rights_hash TEXT NOT NULL,operation TEXT NOT NULL,offering_id TEXT,native_action TEXT NOT NULL,job_id TEXT,expires_at INTEGER NOT NULL);",
 "CREATE TABLE IF NOT EXISTS jwt_v2_portal_provision_intents(operation_id TEXT PRIMARY KEY,sub TEXT NOT NULL,ce INTEGER NOT NULL,offering_id TEXT NOT NULL,identity_hash TEXT NOT NULL);",
 "CREATE TRIGGER IF NOT EXISTS jwt_v2_root_delegation_immutable BEFORE UPDATE ON jwt_v2_root_delegations BEGIN SELECT RAISE(ABORT,'root_delegation_immutable');END;"
].join('\n');
const headOf=manifest=>({sub:manifest.sub,ce:manifest.ce,ownerEpoch:manifest.ownerEpoch,revision:manifest.revision,payloadDigest:manifest.payloadDigest});
function provisioningIntent(command,binding,offeringId){
 const value=command?.input;requireThat(value&&typeof value.operationId==='string','PORTAL_PROVISION_INTENT_REQUIRED',400);
 const identity={operationId:value.operationId,offeringId,actorId:binding.sub,actorEpoch:binding.ce,...(value.accountId?{accountId:value.accountId}:{displayName:value.displayName,create:true})};
 requireThat(typeof identity.accountId==='string'||typeof identity.displayName==='string'&&identity.displayName.trim().length>0&&identity.displayName.length<=160&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(identity.displayName),'PORTAL_PROVISION_INTENT_INVALID',400);return identity;
}
async function coherentPacket(runtime,binding){
 // A per-account delivery pointer can be advanced by another request. Always
 // load its immutable manifest by that exact export ID; never combine a
 // winning pointer with a manifest created by a losing request.
 for(let attempt=0;attempt<3;attempt++){
  const row=await runtime.store.first('SELECT * FROM jwt_v2_portal_deliveries WHERE sub=?',binding.sub),packet=row&&await runtime.store.first('SELECT manifest_json FROM studio_authority_exports WHERE export_id=?',row.export_id),saved=packet&&strictJSON(packet.manifest_json);let floor=null;
  try{floor=await studioAuthoritySourceFloor(runtime,binding.sub);}catch(error){if(error.code!=='STUDIO_AUTHORITY_HEAD_PENDING')throw error;}
  const valid=saved&&floor&&saved.manifest.exportId===row.export_id&&saved.manifestDigest===row.manifest_digest&&saved.manifest.ce===binding.ce&&saved.manifest.ownerEpoch===floor.target.ownerEpoch&&saved.manifest.revision===floor.target.revision&&saved.manifest.payloadDigest===floor.projectionDigest&&saved.manifest.originalUntil>=binding.s_exp;
  if(valid)return {row,...saved};
  const value=await createStudioAuthorityExport(runtime,{sub:binding.sub,ce:binding.ce,originalUntil:binding.s_exp});
  if(row)await runtime.store.stmt('UPDATE jwt_v2_portal_deliveries SET export_id=?,manifest_digest=?,next_page=-1,installed=0 WHERE sub=? AND export_id=? AND manifest_digest=?',value.manifest.exportId,value.manifestDigest,binding.sub,row.export_id,row.manifest_digest).run();
  else await runtime.store.stmt('INSERT INTO jwt_v2_portal_deliveries VALUES(?,?,?,-1,0) ON CONFLICT(sub) DO NOTHING',binding.sub,value.manifest.exportId,value.manifestDigest).run();
  // The next iteration reloads the actual winner and its matching manifest,
  // including when the guarded replacement deliberately changed no row.
 }
 requireThat(false,'STUDIO_PORTAL_PREPARING',503);
}
export async function academyStudioPortal(env,auth,{operation='summary',input={}}={}){
 const context=nativeAuthContext(auth);requireThat(context&&context.runtime.app==='academy','PORTAL_NATIVE_ACTOR_REQUIRED',403);
 const {runtime,cap}=context,trusted=runtime.businessCapability(cap),b=trusted.binding,now=runtime.clock();
 const fresh=await runtime.nativeCapture(b);requireThat(fresh.pv===b.pv&&canonical(fresh.rights)===canonical(trusted.rights),'AUTHORITY_UPDATE_REQUIRED',409);
 requireThat(!['admin','admin-cover'].includes(operation)||now<b.vat+60,'ADMIN_STATUS_EXPIRED',401);
 const packet=await coherentPacket(runtime,b),head=headOf(packet.manifest),rootGuard=runtime.writeGuard(cap,{sensitive:operation==='admin'||operation==='admin-cover'});
 const packetVector=await Promise.all(packet.manifest.sourceGuards.map(async([id,scope,epoch,revision])=>[await scopedVectorId(id,scope),epoch,revision]));
 requireThat(await vectorDigest(packetVector)===b.pv,'AUTHORITY_UPDATE_REQUIRED',409);
 const family=await runtime.store.family(b.sid),projection=family&&strictJSON(family.projection_json);
 requireThat(family?.binding_json===canonical(b)&&projection?.rightsHash===await digest(trusted.rights),'PORTAL_PARENT_CHANGED',409);
 const delegationId=opaque(),expiresAt=Math.min(now+10,trusted.deadline,b.s_exp,...(['admin','admin-cover'].includes(operation)?[b.vat+60]:[])),offeringId=operation.startsWith('admin')?input.offeringId:null,nativeAction=input.command?.action||operation,jobId=nativeAction==='resume'?input.command.input?.jobId:null,proof={binding:b,head,deadline:trusted.deadline,expiresAt,delegationId};
 const intentPlan=[];
 if(nativeAction==='provision'){
  const intent=provisioningIntent(input.command,b,offeringId),hash=await digest(intent),old=await runtime.store.first('SELECT * FROM jwt_v2_portal_provision_intents WHERE operation_id=?',intent.operationId);
  requireThat(!old||old.sub===b.sub&&old.ce===b.ce&&old.offering_id===offeringId&&old.identity_hash===hash,'PORTAL_PROVISION_INTENT_CONFLICT',409);
  intentPlan.push(runtime.store.stmt('INSERT INTO jwt_v2_portal_provision_intents VALUES(?,?,?,?,?) ON CONFLICT(operation_id) DO NOTHING',intent.operationId,b.sub,b.ce,offeringId,hash));
 }
 await runtime.store.batch([...rootGuard.before,...intentPlan,runtime.store.stmt('INSERT INTO jwt_v2_root_delegations VALUES(?,?,?,?,?,?,?,?,?,?)',delegationId,canonical(b),canonical(head),trusted.kid,projection.rightsHash,operation,offeringId,nativeAction,jobId,expiresAt),...rootGuard.after]);
 // Bounded cold profile progress is safe to repeat for a read. No business
 // mutation is sent until the complete signed source facts are installed.
 let row=packet.row;
 for(let n=0;n<4&&!row.installed;n++){
  let data;if(row.next_page<0)data={manifest:packet.manifest,manifestDigest:packet.manifestDigest};
  else{const page=await runtime.store.first('SELECT data,page_digest FROM studio_authority_fact_pages WHERE payload_digest=? AND page_index=?',head.payloadDigest,row.next_page);requireThat(page&&page.page_digest===packet.manifest.pageDigests[row.next_page],'PORTAL_PROFILE_PAGE_MISSING',503);data={schema:1,env:'production',operation:'page',exportId:packet.manifest.exportId,index:row.next_page,data:page.data,manifestDigest:packet.manifestDigest};}
  const result=await portalFetch(runtime,proof,row.next_page<0?'stage-manifest':'stage-page',data),next=row.next_page+1,done=next>=packet.manifest.pageCount;
  if(result.status==='INSTALLED_PENDING')requireThat(false,'STUDIO_PORTAL_PREPARING',503);
  requireThat(done?result.status==='INSTALLED'||result.status==='COVERED_BY_NEWER':result.status==='STAGED','PORTAL_PROFILE_ACK_INVALID',503);
  // A concurrent read may acknowledge the same packet first. Progress is
  // monotonic and tied to this immutable export, never to the account alone.
  await runtime.store.stmt('UPDATE jwt_v2_portal_deliveries SET next_page=?,installed=? WHERE sub=? AND export_id=? AND manifest_digest=? AND next_page=?',next,Number(done),b.sub,packet.manifest.exportId,packet.manifestDigest,row.next_page).run();
  row=await runtime.store.first('SELECT * FROM jwt_v2_portal_deliveries WHERE sub=? AND export_id=? AND manifest_digest=?',b.sub,packet.manifest.exportId,packet.manifestDigest);
  requireThat(row&&row.next_page>=next,'STUDIO_PORTAL_PREPARING',503);
 }
 requireThat(row.installed===1,'STUDIO_PORTAL_PREPARING',503);
 const before=await studioAuthoritySourceFloor(runtime,b.sub);requireThat(before&&canonical({sub:b.sub,ce:b.ce,ownerEpoch:before.target.ownerEpoch,revision:before.target.revision,payloadDigest:before.projectionDigest})===canonical(head),'AUTHORITY_UPDATE_REQUIRED',409);
 const value=await portalFetch(runtime,proof,operation,input);
 runtime.assertCapability(cap);
 const after=await studioAuthoritySourceFloor(runtime,b.sub);requireThat(after&&after.target.revision===head.revision&&after.projectionDigest===head.payloadDigest,'AUTHORITY_UPDATE_REQUIRED',409);
 return value;
}
export async function resolveRootPortalSource(runtime,body){
 const id=body.authority?.delegationId,row=await runtime.store.first('SELECT * FROM jwt_v2_root_delegations WHERE delegation_id=?',id);
 requireThat(row&&runtime.clock()<row.expires_at&&row.binding_json===canonical(body.binding)&&row.head_json===canonical(body.authority.head),'PORTAL_DELEGATION_UNAVAILABLE',401);
 const head=strictJSON(row.head_json),history=await runtime.store.first('SELECT * FROM studio_authority_history WHERE sub=? AND owner_epoch=? AND revision=? AND digest=?',head.sub,head.ownerEpoch,head.revision,head.payloadDigest);
 requireThat(history&&history.original_until>runtime.clock(),'PORTAL_SOURCE_HISTORY_UNAVAILABLE',503);
 const pages=await runtime.store.all('SELECT page_index,data,page_digest FROM studio_authority_fact_pages WHERE payload_digest=? ORDER BY page_index',head.payloadDigest),parts=pages.map(p=>unb64u(p.data)),size=parts.reduce((n,v)=>n+v.length,0);
 requireThat(pages.length>0&&pages.every((p,i)=>p.page_index===i)&&size<=2*1024*1024,'PORTAL_SOURCE_HISTORY_CORRUPT',503);
 const raw=new Uint8Array(size);let at=0;for(let i=0;i<parts.length;i++){requireThat(hex(await sha256(parts[i]))===pages[i].page_digest,'PORTAL_SOURCE_HISTORY_CORRUPT',503);raw.set(parts[i],at);at+=parts[i].length;}
 const payload=strictJSON(raw,{maxBytes:2*1024*1024});requireThat(await digest(payload)===head.payloadDigest&&payload.sub===head.sub&&payload.ce===head.ce,'PORTAL_SOURCE_HISTORY_CORRUPT',503);return payload;
}
