import {createHash} from 'node:crypto';
import {serviceFetch} from '../http-service.mjs';
import {world} from '../../../backend/tests/fixtures/academy-v111-native-fixture.mjs';
import {canonical} from '../codec.mjs';
import {ORIGINS} from '../tokens.mjs';
import {defaultReturnPaths} from '../return-routes.mjs';
import {dependencyScope} from '../issuance-floors.mjs';
import {createStudioAuthorityExport} from '../../../backend/src/academy/v111/studio-authority-source.mjs';

export async function isolatedWorld({snapshotSchema=3,prepareAcademy,legacySessionMode=false,deferSharedKeySetup=false}={}){
 const key=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
 const kid='shared-child-entry-test',ownerEpoch='fixture-account-stream';
 const publicKey=canonical({issuer:ORIGINS.academy,env:'production',purpose:'academy-shared-access',revision:1,currentKid:kid,keys:[{kid,jwk:await crypto.subtle.exportKey('jwk',key.publicKey)}]});
 const privateKey=canonical(await crypto.subtle.exportKey('jwk',key.privateKey));
 const installKeys=(app,env)=>{
  env.UAA_V2_SHARED_ACADEMY_KEYS_JSON=publicKey;
  if(app==='academy')env.UAA_V2_SHARED_ACADEMY_PRIVATE_JWK=privateKey;
 };
 const fixture=await world({prepareAcademy,owningRuntimes:true,prepareEnvironment:async({app,env,now})=>{
  if(!deferSharedKeySetup)installKeys(app,env);
  const raw={...JSON.parse(env.UAA_V2_CONFIG),snapshotSchema};
  raw.returns.studio=defaultReturnPaths('studio').map(path=>ORIGINS.studio+path);
  env.UAA_V2_CONFIG=canonical({...raw,...(legacySessionMode?{}:app==='academy'?{sharedAcademySessions:true}:{sharedChildEntry:{ownerEpoch,notBefore:now}})});
 }});
 if(deferSharedKeySetup){
  for(const [app,env] of Object.entries(fixture.envs)){
   installKeys(app,env);
   const runtime=fixture.runtimes[app];
   runtime.settings.sharedAcademy={revision:1,kid,keys:new Map([[kid,key.publicKey]]),signingKey:app==='academy'?key.privateKey:null};
  }
 }
 return fixture;
}
export function installSyntheticBaseline(f,app,context){
 const db=f.databases[app],ownerEpoch='fixture-account-stream',receipt=crypto.randomUUID();
 const metadata=canonical({ownerApp:'academy',recipientApp:app,ownerEpoch,stream:'account-security',coveredThrough:0,createdAt:f.now()});
 db.prepare("INSERT INTO jwt_v2_receive_snapshots VALUES(?,?,?,?,'APPLIED')").run(receipt,crypto.randomUUID(),metadata,'synthetic-baseline');
 db.prepare('INSERT INTO jwt_v2_accounts VALUES(?,?,?,?,1,1)').run(context.sub,context.ce,context.ae,0);
 db.prepare('INSERT INTO jwt_v2_shared_account_baselines VALUES(?,?,?,?,?,?)').run(context.sub,context.ce,context.ae,ownerEpoch,0,receipt);
 db.prepare('INSERT INTO jwt_v2_shared_snapshot_heads VALUES(?,?,?,?)').run(ownerEpoch,0,f.now(),receipt);
}
export async function installStudioFixtureProjection(f){
 const {manifest,manifestDigest}=await createStudioAuthorityExport(f.runtimes.academy,{sub:f.sub,ce:f.ce,originalUntil:f.now()+604800});
 const db=f.databases.studio;
 const pages=f.databases.academy.prepare('SELECT * FROM studio_authority_fact_pages WHERE payload_digest=? ORDER BY page_index').all(manifest.payloadDigest);
 for(const page of pages)db.prepare('INSERT INTO studio_source_authority_fact_pages VALUES(?,?,?,?)').run(page.payload_digest,page.page_index,page.data,page.page_digest);
 const receipt=canonical({schema:1,complete:true,ownerEpoch:manifest.ownerEpoch,revision:manifest.revision,payloadDigest:manifest.payloadDigest,manifestDigest});
 db.prepare('INSERT INTO studio_source_authority VALUES(?,?,?,?,?,?,?,?,?,?)').run(f.sub,dependencyScope(f.sub),f.ce,manifest.ownerEpoch,manifest.revision,manifest.payloadDigest,manifest.payloadDigest,canonical(manifest.sourceGuards),manifest.timedUntil,receipt);
}


export function prepareHifzBaselineFixture(academy,_admin,actors){
  const activity='PROGRAM:verified-baseline-hifz';
  academy.prepare("INSERT INTO activities(activity_key,activity_id,kind,name,active,lifecycle,website_visible) VALUES(?,'verified-baseline-hifz','PROGRAM','Synthetic eligible Hifz',1,'ACTIVE',1)").run(activity);
  academy.prepare("INSERT INTO program_settings(activity_key,timezone) VALUES(?,'Africa/Johannesburg')").run(activity);
  academy.prepare("UPDATE academy_settings SET setting_value=? WHERE setting_key='HifzProfileActivityKey'").run(activity);
  academy.prepare("INSERT INTO role_assignments(assignment_id,account_id,activity_key,role,active,review_state) VALUES('hifz-baseline-proof',?,?,'STUDENT',1,'CONFIRMED')").run(actors.studentA,activity);
  academy.prepare('INSERT OR IGNORE INTO hifz_profile_sync(account_id) VALUES(?)').run(actors.studentA);
}

export function digestStreamFactory(){
 const hash=createHash('sha256');let resolve;
 const digest=new Promise(done=>{resolve=done;});
 const stream=new WritableStream({write:chunk=>{hash.update(chunk);},close:()=>{resolve(hash.digest());}});
 Object.defineProperty(stream,'digest',{value:digest});
 return stream;
}

export async function installOwnedBaseline(f,recipient,{afterApplyStep}={}){
 const ownerEpoch='fixture-account-stream',requestId=crypto.randomUUID(),runtime=f.runtimes[recipient];
 runtime.digestStreamFactory=digestStreamFactory;
 f.runtimes.academy.digestStreamFactory=digestStreamFactory;
 const {contiguous_through:contiguousThrough}=await runtime.store.first(
  'SELECT contiguous_through FROM jwt_v2_event_streams WHERE source_app=? AND target_app=? AND stream=? AND owner_epoch=?',
  'academy',recipient,'account-security',ownerEpoch);
 const body={schema:2,env:'production',sourceApp:recipient,targetApp:'academy',requestId,ownerApp:'academy',recipientApp:recipient,stream:'account-security',ownerEpoch,contiguousThrough,missingRanges:[],knownFloorsDigest:null,pageToken:null};
 let page;
 do{
  try{page=await serviceFetch(runtime,{targetApp:'academy',path:'/internal/auth/v2/reconcile',operationId:requestId,body});}catch(error){throw new Error(f.trace.at(-1)?.code||error.code,{cause:error});}
  body.pageToken=page.nextPageToken;
 }while(body.pageToken);
 const {runtimeServices}=await import('../runtime-service.mjs');
 for(let i=0;i<120;i++){
  const services=await runtimeServices(f.runtimes[recipient]);
  const result=await services.advanceReconcileSnapshot(requestId);
  if(result.status==='APPLIED')return page;
  await afterApplyStep?.(result);
 }
 throw Error('Fixture snapshot publication did not complete');
}

