// Source-only temporary setup primitive. Never imported by the final app entry.
// The caller must compile a reviewed public contract and remove this surface
// before activation. Existing classes/contexts are composed outside this module.
import {assertSchemaPhase,schemaVerification,schemaClaimSlot,withSchemaPhase} from './jwt-feature-schema-phase.mjs';
import {createAcademyPinHash} from '../lib/academy-pin.js';
import {jwtFeatureDatabaseEnv} from './jwt-feature-storage.mjs';
import {jwtFeatureObjectDefinitionsSQL} from './jwt-feature-schema.mjs';
const ownOrigin='https://feature_worker.maktab4life.workers.dev',account='c9a3e355b3d7a795880b1d36a1dbe123';
const protectedIds=['0eaf6d46-bbaa-46e3-8287-b6113ef8f2a8','18ad0efb-cd34-42a4-b510-7051f0303200','1c8aece3-dc1d-40d1-8a82-01ab4f63336f','fe85dac1-b1f0-4079-9127-2e36089aa385','c261eb73-7145-4f73-940c-5816db287612'];
const marker='__PRIVATE_FEATURE_PIN_HASH__',hashPattern=/^v3\$pbkdf2-sha256\$100000\$[-_A-Za-z0-9]{22}\$[0-9a-f]{64}$/;
const fields=['JWT_V110_MASTER','JWT_V110_REFRESH','JWT_V110_BROWSER','JWT_V110_NATIVE_COOKIE'];
const fail=()=>{throw Error('SETUP_UNAVAILABLE');};
const b64=bytes=>btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
function bytes(value){if(typeof value!=='string'||!/^[-_A-Za-z0-9]{43}$/.test(value))fail();const out=Uint8Array.from(atob(value.replaceAll('-','+').replaceAll('_','/')+'='),c=>c.charCodeAt(0));if(out.length!==32||b64(out)!==value)fail();return out;}
const sha=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('');
const reply=(value,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'private, no-store','Pragma':'no-cache','X-Content-Type-Options':'nosniff'}});
function contract(input){
 const c=JSON.parse(JSON.stringify(input));
 if(c.schema!==1||c.accountId!==account||c.planId!=='JWT_FEATURE_FRESH_20261106a'||!/^[-a-z0-9]{1,64}$/.test(c.batch)||!/^[a-f0-9]{40}$/.test(c.source)||!/^[a-f0-9]{64}$/.test(c.manifestHash)||!/^[a-f0-9]{64}$/.test(c.sourceDigest))fail();
 if(c.databaseIds?.length!==2||new Set(c.databaseIds).size!==2||!c.databaseIds.every(x=>/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(x)))fail();
 if(!Array.isArray(c.forbiddenIds)||c.databaseIds.some(x=>protectedIds.includes(x)||c.forbiddenIds.includes(x)))fail();
 for(const owner of ['core','admin']){
  if(!Array.isArray(c.tables?.[owner])||!c.tables[owner].length||!c.tables[owner].every(x=>/^[a-z_][a-z0-9_]*$/.test(x))||new Set(c.tables[owner]).size!==c.tables[owner].length||!/^[a-f0-9]{64}$/.test(c.objectHashes?.[owner])||!/^[a-f0-9]{64}$/.test(c.templateHashes?.[owner]))fail();
  if(!Array.isArray(c.statements?.[owner])||c.statements[owner].length!==(owner==='core'?35:8)||c.statements[owner].some(x=>typeof x!=='string'||x.length>50000||x.includes('v3$pbkdf2-sha256$')))fail();
 }
 if(c.statements.core.filter(sql=>sql.includes(marker)).some(sql=>!/^[ ]*INSERT INTO "account_credentials"/.test(sql)||sql.split(marker).length!==2||!sql.includes("'"+marker+"'")))fail();
 if(c.statements.core.join('\n').split(marker).length-1!==4||c.statements.admin.join('\n').includes(marker)||!c.objectNamespace.startsWith('jwt-feature-v110/')||!c.objectNamespace.endsWith('/'))fail();
 assertSchemaPhase(c);
 return Object.freeze(c);
}
function profile(env,c,{main=false}={}){
 if(env.ENVIRONMENT!=='feature'||env.ACADEMY_DEPLOYMENT_KIND!=='ISOLATED_PREVIEW'||env.JWT_FEATURE_SETUP_MODE!=='BOOTSTRAP_ONLY'||env.ACADEMY_D1_MODE!=='PAUSED'||env.JWT_FEATURE_SETUP_SOURCE!==c.source||env.JWT_FEATURE_SETUP_MANIFEST!==c.manifestHash||env.JWT_V110_NATIVE_RUN_ID!==c.sourceDigest||env.JWT_V110_OBJECT_NAMESPACE!==c.objectNamespace)fail();
 if(main&&fields.some(k=>env[k]!=='0'))fail();
}
function executionWindow(env){
 const now=Math.floor(Date.now()/1000),issued=Number(env.JWT_FEATURE_SETUP_ISSUED_AT),expiry=Number(env.JWT_FEATURE_SETUP_EXPIRES_AT);
 if(!Number.isSafeInteger(issued)||!Number.isSafeInteger(expiry)||issued>now+30||expiry<=now||expiry-issued<1||expiry-issued>900)fail();
}
const packet=(c,method,path,issued,expiry,stamp,nonce)=>JSON.stringify(['jwt-feature-private-setup-v1',c.planId,c.source,c.manifestHash,account,method,path,issued,expiry,stamp,nonce]);
export function createJWTFeatureSetupAPI(input){
 const c=contract(input);
 return {async fetch(request,env){
  const url=new URL(request.url),action=url.pathname==='/internal/feature-jwt-setup/execute'?'execute':url.pathname==='/internal/feature-jwt-setup/status'?'status':c.ddl&&url.pathname==='/internal/feature-jwt-setup/schema-execute'?'schema-execute':c.ddl&&url.pathname==='/internal/feature-jwt-setup/schema-status'?'schema-status':null;
  const schemaAction=action?.startsWith('schema-'),executeAction=action==='execute'||action==='schema-execute',statusAction=action==='status'||action==='schema-status';
  if(!action)return reply({code:'FEATURE_SETUP_PAUSED'},503);
  if(request.method!==(executeAction?'POST':'GET'))return reply({code:'METHOD_NOT_ALLOWED'},405);
  let authenticated=false;
  try{
   profile(env,c,{main:true});if(url.origin!==ownOrigin||url.search)fail();
   const now=Math.floor(Date.now()/1000),issued=Number(env.JWT_FEATURE_SETUP_ISSUED_AT),expiry=Number(env.JWT_FEATURE_SETUP_EXPIRES_AT),stampText=request.headers.get('X-JWT-Setup-Time'),nonce=request.headers.get('X-JWT-Setup-Nonce'),source=request.headers.get('X-JWT-Setup-Source'),manifest=request.headers.get('X-JWT-Setup-Manifest');
   if(!Number.isSafeInteger(issued)||!Number.isSafeInteger(expiry)||issued>now+30||executeAction&&expiry<=now||expiry-issued<1||expiry-issued>900||!/^\d{10}$/.test(stampText||'')||Math.abs(Number(stampText)-now)>30||source!==c.source||manifest!==c.manifestHash)fail();
   const secret=bytes(env.JWT_FEATURE_SETUP_AUTH),proof=bytes(request.headers.get('X-JWT-Setup-Proof'));bytes(nonce);
   const key=await crypto.subtle.importKey('raw',secret,{name:'HMAC',hash:'SHA-256'},false,['verify']);
   if(!await crypto.subtle.verify('HMAC',key,proof,new TextEncoder().encode(packet(c,request.method,url.pathname,issued,expiry,Number(stampText),nonce))))fail();
   // No body-selected targets, SQL, rows or credentials. A valid signature
   // never makes a supplied body a privileged command.
   if(request.body){const reader=request.body.getReader();try{const part=await reader.read();if(!part.done){await reader.cancel();fail();}}finally{reader.releaseLock();}}
   authenticated=true;
   if(!env.JWT_V110_SPLIT_COORDINATOR?.getByName)fail();
   if(executeAction){
    executionWindow(env);
    const statements=schemaAction?c.ddl.statements:c.statements,hashes=schemaAction?c.ddl.statementHashes:c.templateHashes;
    for(const owner of ['core','admin'])if(await sha(statements[owner].join('\n')+'\n')!==hashes[owner])fail();
    executionWindow(env);jwtFeatureDatabaseEnv(env);
    if(!schemaAction&&(typeof env.SHARED_PIN_SECRET!=='string'||env.SHARED_PIN_SECRET.length<32||!/^\d{4}$/.test(env.JWT_FEATURE_SETUP_PIN||'')))fail();
   }
   const stub=env.JWT_V110_SPLIT_COORDINATOR.getByName('jwt-feature-bootstrap:'+c.planId+':'+c.sourceDigest);
   const binding={source:c.source,manifestHash:c.manifestHash};
   let result;
   if(action==='schema-status')result=await stub.setupSchemaStatus(binding);
   else if(action==='schema-execute'){const nonceDigest=await sha(nonce);executionWindow(env);result=await stub.setupSchemaExecute({...binding,nonceDigest});}
   else if(action==='status')result=await stub.setupStatus(binding);
   else{
    const pinHash=await createAcademyPinHash(env.JWT_FEATURE_SETUP_PIN,env);if(!hashPattern.test(pinHash))fail();
    const nonceDigest=await sha(nonce);executionWindow(env);
    result=await stub.setupExecute({...binding,nonceDigest,pinHash});
   }
   // Only the controller's explicitly public receipt escapes the private RPC.
   if(!result||!['UNCLAIMED','PREPARING','VERIFIED','UNKNOWN'].includes(result.state)||result.source!==c.source||result.manifestHash!==c.manifestHash)fail();
   const safe={schema:1,state:result.state,source:c.source,manifestHash:c.manifestHash,planId:c.planId,databaseIds:c.databaseIds};
   if(schemaAction)safe.stage='SCHEMA_ONLY';
   if(Number.isSafeInteger(result.startedAt))safe.startedAt=result.startedAt;
   if(Number.isSafeInteger(result.finishedAt))safe.finishedAt=result.finishedAt;
   if(['claimed','interrupted','complete','staged-outcome'].includes(result.phase))safe.phase=result.phase;
   if(result.alreadyClaimed===true)safe.alreadyClaimed=true;
   if(result.state==='VERIFIED'){
    if(result.sourceDigest!==c.sourceDigest)fail();
    safe.sourceDigest=c.sourceDigest;safe.verification=schemaAction?schemaVerification(c):{accounts:4,credentials:4,courses:2,sessions:0,families:0,foreignKeyErrors:0,quickCheck:'ok'};
   }
   return reply(safe,statusAction||result.state==='VERIFIED'&&!result.alreadyClaimed?200:409);
  }catch{return reply({code:authenticated?'FEATURE_SETUP_UNAVAILABLE':'FEATURE_SETUP_AUTH_REQUIRED'},authenticated?503:403);}
 },scheduled(){}};
}
export function withJWTFeatureSetup(Base,input){
 const c=contract(input),slot='jwt-feature-bootstrap-v1';
 const publicState=state=>({schema:1,state:state?.state||'UNCLAIMED',source:state?.source||c.source,manifestHash:state?.manifestHash||c.manifestHash,planId:state?.planId||c.planId,...(state?{startedAt:state.startedAt,finishedAt:state.finishedAt||null,phase:state.phase}:{}),...(state?.state==='VERIFIED'?{verification:{accounts:4,credentials:4,courses:2,sessions:0,families:0,foreignKeyErrors:0,quickCheck:'ok'},sourceDigest:state.sourceDigest}: {})});
 const SeedSetup=class JWTFeatureSetup extends Base{
  #setupEnv;
  constructor(ctx,env){super(ctx,env);this.#setupEnv=env;ctx.blockConcurrencyWhile(async()=>{
   const old=await ctx.storage.get(slot);if(old?.state==='PREPARING')await ctx.storage.put(slot,{...old,state:'UNKNOWN',phase:'interrupted',finishedAt:Math.floor(Date.now()/1000)});
  });}
  setupBinding(value){profile(this.#setupEnv,c);if(!value||value.source!==c.source||value.manifestHash!==c.manifestHash)fail();}
  async setupStatus(value){try{this.setupBinding(value);return publicState(await this.ctx.storage.get(slot));}catch{return {state:'UNKNOWN',source:c.source,manifestHash:c.manifestHash,code:'FEATURE_SETUP_UNAVAILABLE'};}}
  async setupExecute(value){
   let owns=false;
   try{
    this.setupBinding(value);
    if(Object.keys(value).sort().join(',')!=='manifestHash,nonceDigest,pinHash,source'||!/^[a-f0-9]{64}$/.test(value.nonceDigest)||!hashPattern.test(value.pinHash))fail();
    const claim=await this.ctx.storage.transaction(async storage=>{
     const existing=await storage.get(slot);if(existing)return {existing};
     if(c.ddl){const schema=await storage.get(schemaClaimSlot);if(schema?.state!=='VERIFIED'||schema.source!==c.source||schema.manifestHash!==c.manifestHash)fail();}
     executionWindow(this.#setupEnv);
     const state={state:'PREPARING',source:c.source,manifestHash:c.manifestHash,nonceDigest:value.nonceDigest,planId:c.planId,sourceDigest:c.sourceDigest,databaseIds:c.databaseIds,startedAt:Math.floor(Date.now()/1000),phase:'claimed'};
     await storage.put(slot,state);return {state};
    });
    if(claim.existing)return {...publicState(claim.existing),alreadyClaimed:true};owns=true;executionWindow(this.#setupEnv);
    const selected=jwtFeatureDatabaseEnv(this.#setupEnv),db={core:selected.ACADEMY_DB.withSession('first-primary'),admin:selected.ACADEMY_ADMIN_DB.withSession('first-primary')};
    for(const owner of ['core','admin']){
     executionWindow(this.#setupEnv);
     const objects=(await db[owner].prepare(jwtFeatureObjectDefinitionsSQL).all()).results.map(r=>[r.type,r.name,r.tbl_name,r.sql]);
     if(await sha(JSON.stringify(objects))!==c.objectHashes[owner])fail();
     const queries=[];
     for(let offset=0;offset<c.tables[owner].length;offset+=5){
      const names=c.tables[owner].slice(offset,offset+5);
      queries.push(db[owner].prepare(names.map(name=>"SELECT '"+name+"' name,count(*) n FROM \""+name+"\"").join(' UNION ALL ')));
     }
     executionWindow(this.#setupEnv);
     const counts=(await db[owner].batch(queries)).flatMap(result=>result.results);
     if(counts.length!==c.tables[owner].length||counts.some(r=>r.n!==0))fail();
    }
    // Staged owner transactions: Core then Admin. No cross-D1 atomicity.
    const core=c.statements.core.map(sql=>sql.includes(marker)?db.core.prepare(sql.replace("'"+marker+"'",'?')).bind(value.pinHash):db.core.prepare(sql));
    executionWindow(this.#setupEnv);await db.core.batch(core);
    executionWindow(this.#setupEnv);await db.admin.batch(c.statements.admin.map(sql=>db.admin.prepare(sql)));
    for(const owner of ['core','admin']){
     executionWindow(this.#setupEnv);
     if((await db[owner].prepare('PRAGMA foreign_key_check').all()).results.length)fail();
     executionWindow(this.#setupEnv);const quick=(await db[owner].prepare('PRAGMA quick_check').all()).results;if(quick.length!==1||Object.values(quick[0])[0]!=='ok')fail();
    }
    executionWindow(this.#setupEnv);const rows=(await db.core.prepare('SELECT account_id,pin_hash,pin_setup,credential_epoch FROM account_credentials ORDER BY account_id').all()).results;
    if(rows.length!==4||rows.some(r=>r.pin_hash!==value.pinHash||r.pin_setup!==1||r.credential_epoch!==1))fail();
    executionWindow(this.#setupEnv);const state=(await db.core.prepare("SELECT (SELECT count(*) FROM accounts) accounts,(SELECT count(*) FROM activities WHERE kind='COURSE') courses,(SELECT count(*) FROM account_sessions) sessions,(SELECT count(*) FROM jwt_v110_families) families,source_digest FROM split_deployment_state WHERE singleton=1 AND state='READY'").all()).results[0];
    if(!state||state.accounts!==4||state.courses!==2||state.sessions!==0||state.families!==0||state.source_digest!==c.sourceDigest)fail();
    await this.ctx.storage.transaction(async storage=>{const old=await storage.get(slot);if(old?.state!=='PREPARING'||old.nonceDigest!==value.nonceDigest)fail();await storage.put(slot,{...old,state:'VERIFIED',phase:'complete',finishedAt:Math.floor(Date.now()/1000)});});
    return publicState(await this.ctx.storage.get(slot));
   }catch{
    if(owns)try{await this.ctx.storage.transaction(async storage=>{const old=await storage.get(slot);if(old?.state==='PREPARING')await storage.put(slot,{...old,state:'UNKNOWN',phase:'staged-outcome',finishedAt:Math.floor(Date.now()/1000)});});}catch{}
    try{return publicState(await this.ctx.storage.get(slot));}catch{return {state:'UNKNOWN',source:c.source,manifestHash:c.manifestHash,code:'FEATURE_SETUP_UNAVAILABLE'};}
   }
  }
 };
 return c.ddl?withSchemaPhase(SeedSetup,c,{window:executionWindow,sha}):SeedSetup;
}
