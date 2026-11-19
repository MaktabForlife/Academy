import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,signing} from './helpers.mjs';
import {AcademyCeremonies,LocalCeremonyConsumer,ceremonySchemaSQL,admissionBarrier,digestState,s256,normalizePlatformAddress} from '../ceremonies.mjs';
import {opaque,canonical,fingerprint,vectorDigest} from '../codec.mjs';
import {ORIGINS,issueToken,verifyToken} from '../tokens.mjs';
const selector=v=>Object.fromEntries('app sub sid psid bsid bv ce ae le sv ue'.split(' ').map(k=>[k,v[k]]));
function request(app='academy',headers={}){
 return new Request(ORIGINS[app]+'/auth/v2/pin',{method:'POST',headers:{Origin:ORIGINS[app],'X-UAA-Request':'2','X-Test-CSRF':'synthetic',...headers}});
}
const callbacks={
 academy:{origin:ORIGINS.academy,returns:[ORIGINS.academy+'/']},
 studio:{origin:ORIGINS.studio,callbacks:[ORIGINS.studio+'/auth/v2/admission/callback',ORIGINS.studio+'/auth/v2/unlock/callback'],returns:[ORIGINS.studio+'/studio/']},
 hifz:{origin:ORIGINS.hifz,callbacks:[ORIGINS.hifz+'/auth/v2/admission/callback',ORIGINS.hifz+'/auth/v2/unlock/callback'],returns:[ORIGINS.hifz+'/']}
};
async function academy(options={}){
 const f=await fixture('academy');f.raw.exec(ceremonySchemaSQL);
 f.raw.exec('CREATE TABLE synthetic_credentials(sub TEXT PRIMARY KEY,ce INTEGER,generation INTEGER,active INTEGER,pin_setup INTEGER,revision INTEGER);');
 f.raw.prepare('INSERT INTO synthetic_credentials VALUES(?,4,1,1,1,1)').run(f.sub);
 let now=f.now,checks=0,verifier=options.verifier||(()=>true);const keys=await signing();
 const snapshot=async sub=>{
  const c=f.raw.prepare('SELECT * FROM synthetic_credentials WHERE sub=?').get(sub);return c&&{sub:c.sub,ce:c.ce,generation:c.generation,active:Boolean(c.active),setupComplete:Boolean(c.pin_setup),revision:String(c.revision)};
 };
 const credentialGuard=c=>({sql:'SELECT 1 FROM synthetic_credentials WHERE sub=? AND ce=? AND generation=? AND active=1 AND pin_setup=? AND revision=?',args:[c.sub,c.ce,c.generation,Number(c.setupComplete),Number(c.revision)]});
 const parentEligibility=async({sub})=>{
  const p=f.raw.prepare("SELECT p.* FROM jwt_v2_parents p JOIN jwt_v2_accounts a ON a.sub=p.sub WHERE p.sub=? AND p.state IN('UNLOCKED','LOCKED') AND a.active=1 AND a.ce=p.ce AND a.ae=p.ae").get(sub);
  return p&&{sub:p.sub,psid:p.psid,bsid:p.bsid,bv:p.bv,ce:p.ce,ae:p.ae,s_iat:p.s_iat,s_exp:p.s_exp,afg:p.foreground_at};
 };
 const service=new AcademyCeremonies({
  store:f.store,config:f.config,callbacks,clock:()=>now,credentialSnapshot:snapshot,credentialGuard,
  verifyPin:async(pin,c)=>{checks++;return verifier(pin,c);},
  setupPlan:async()=>({statements:[f.store.stmt('UPDATE synthetic_credentials SET pin_setup=1,revision=revision+1 WHERE sub=?',f.sub)]}),
  authorisePinRequest:async req=>req.headers.get('X-Test-CSRF')==='synthetic'?{csrfHash:'c'.repeat(64)}:null,
  attestedSource:async()=>({kind:'platform',address:options.address||'2001:0DB8:0:0:0:0:0:1'}),
  authoriseChild:async(req,target)=>req.headers.get('X-Test-Child')===target,parentEligibility,
  parentGuard:p=>({sql:"SELECT 1 FROM jwt_v2_parents p JOIN jwt_v2_accounts a ON a.sub=p.sub WHERE p.psid=? AND p.sub=? AND p.bsid=? AND p.bv=? AND p.ce=? AND p.ae=? AND p.state IN('UNLOCKED','LOCKED') AND p.s_exp>? AND a.active=1 AND a.ce=p.ce AND a.ae=p.ae",args:[p.psid,p.sub,p.bsid,p.bv,p.ce,p.ae,now]}),
  signingKey:keys.privateKey,kid:'academy-handoff'
 });
 async function rootTx(sub=f.sub){const tx=crypto.randomUUID();await service.startRootPin({request:request(),tx,sub,returnTo:ORIGINS.academy+'/'});return tx;}
 async function attempt(tx){return (await service.issueAttempt({request:request(),tx})).attemptId;}
 async function childTx({purpose='admission',expected=null,pinRequired=false}={}){
  const tx=crypto.randomUUID(),state=opaque(),verifier=opaque(),req=request('academy',{'X-Test-Child':'studio'});
  await service.register({request:req,tx,purpose,targetApp:'studio',expected,stateHash:await digestState(state),challenge:await s256(verifier),callback:ORIGINS.studio+'/auth/v2/'+purpose+'/callback',returnTo:ORIGINS.studio+'/studio/'});
  await service.bindParent({request:request(),tx,sub:f.sub,pinRequired});
  return {tx,state,verifier,req};
 }
 return {...f,service,keys,snapshot,rootTx,attempt,childTx,setTime:v=>{now=v;},time:()=>now,checks:()=>checks,setVerifier:v=>{verifier=v;}};
}
test('source addresses normalise equivalent IPv6 without accepting caller headers',()=>{
 assert.equal(normalizePlatformAddress('2001:0DB8:0:0:0:0:0:1'),normalizePlatformAddress('2001:db8::1'));
 assert.throws(()=>normalizePlatformAddress('spoofed-client-header'));
});
test('a server-issued attempt returns its fixed result without rechecking a different PIN',async()=>{
 const f=await academy({verifier:pin=>pin==='1234'}),tx=await f.rootTx(),attemptId=await f.attempt(tx);
 const first=await f.service.verify({request:request(),tx,attemptId,pin:'1234'});assert.equal(first.status,'VERIFIED');
 f.setTime(f.time()+10);const duplicate=await f.service.verify({request:request(),tx,attemptId,pin:'9999'});assert.deepEqual(duplicate,first);assert.equal(f.checks(),1);
 assert(!JSON.stringify(f.raw.prepare('SELECT * FROM jwt_v2_ceremony_attempts').all()).includes('1234'));
});
test('failure ladder persists through waits/app visits; an active pause rejects even a correct PIN',async()=>{
 const f=await academy({verifier:pin=>pin==='1234'});let tx=await f.rootTx(),last;
 for(let n=1;n<=5;n++){last=await f.service.verify({request:request(),tx,attemptId:await f.attempt(tx),pin:'0000'});assert.equal(last.failures,n);}
 assert.equal(last.pausedUntil-f.time(),900);const count=f.checks();
 await assert.rejects(f.service.verify({request:request(),tx,attemptId:await f.attempt(tx),pin:'1234'}),/PIN_PAUSED/);assert.equal(f.checks(),count);
 f.setTime(last.pausedUntil);tx=await f.rootTx();
 last=await f.service.verify({request:request(),tx,attemptId:await f.attempt(tx),pin:'0000'});assert.equal(last.failures,6);assert.equal(last.pausedUntil-f.time(),1800);
 f.setTime(last.pausedUntil);tx=await f.rootTx();
 last=await f.service.verify({request:request(),tx,attemptId:await f.attempt(tx),pin:'0000'});assert.equal(last.failures,7);assert.equal(last.pausedUntil-f.time(),3600);
 f.setTime(last.pausedUntil);tx=await f.rootTx();
 const ok=await f.service.verify({request:request(),tx,attemptId:await f.attempt(tx),pin:'1234'});assert.equal(ok.status,'VERIFIED');
 assert.deepEqual({...f.raw.prepare('SELECT failures,paused_until FROM jwt_v2_pin_gates').get()},{failures:0,paused_until:0});
 assert.equal((await f.store.family(f.sid)).state,'UNLOCKED');
});
test('one per-account reservation serialises actual verification',async()=>{
 let release,entered;const running=new Promise(r=>{entered=r;}),wait=new Promise(r=>{release=r;});
 const f=await academy({verifier:async()=>{entered();await wait;return false;}}),tx=await f.rootTx(),one=await f.attempt(tx),two=await f.attempt(tx);
 const pending=f.service.verify({request:request(),tx,attemptId:one,pin:'0000'});await running;
 await assert.rejects(f.service.verify({request:request(),tx,attemptId:two,pin:'0000'}),/PIN_BUSY/);assert.equal(f.checks(),1);
 release();assert.equal((await pending).failures,1);
});
test('a verifier losing its five-second reservation cannot commit or count failure',async()=>{
 let release,entered;const begun=new Promise(r=>{entered=r;}),wait=new Promise(r=>{release=r;});
 const f=await academy({verifier:async()=>{entered();await wait;return false;}}),tx=await f.rootTx(),one=await f.attempt(tx);
 const pending=f.service.verify({request:request(),tx,attemptId:one,pin:'0000'});await begun;f.setTime(f.time()+6);f.setVerifier(()=>true);
 const winner=await f.service.verify({request:request(),tx,attemptId:await f.attempt(tx),pin:'1234'});assert.equal(winner.status,'VERIFIED');
 release();await assert.rejects(pending,/PIN_RESULT_NOT_COMMITTED/);assert.equal(f.raw.prepare('SELECT failures FROM jwt_v2_pin_gates').get().failures,0);
});
test('verifier/network fault is not a wrong PIN and a busy attempt cannot be replayed with another PIN',async()=>{
 const f=await academy({verifier:()=>{throw Error('synthetic verifier unavailable');}}),tx=await f.rootTx(),attemptId=await f.attempt(tx);
 await assert.rejects(f.service.verify({request:request(),tx,attemptId,pin:'0000'}),/unavailable/);
 const result=await f.service.verify({request:request(),tx,attemptId,pin:'1234'});assert.equal(result.status,'UNAVAILABLE');assert.equal(f.checks(),1);assert.equal(f.raw.prepare('SELECT failures FROM jwt_v2_pin_gates').get().failures,0);
});
test('authoritative ceremony rate bucket rejects excess checks without wrong-PIN increments',async()=>{
 const f=await academy({verifier:()=>true}),tx=await f.rootTx();
 for(let i=0;i<5;i++)await f.service.verify({request:request(),tx,attemptId:await f.attempt(tx),pin:'1234'});
 await assert.rejects(f.service.verify({request:request(),tx,attemptId:await f.attempt(tx),pin:'1234'}),/RATE_LIMITED/);
 assert.equal(f.checks(),5);assert.equal(f.raw.prepare('SELECT failures FROM jwt_v2_pin_gates').get().failures,0);
});
test('initial/admin-reset PIN setup requires eligibility and matching four-digit entries',async()=>{
 const f=await academy(),tx=await f.rootTx();
 await assert.rejects(f.service.verify({request:request(),tx,attemptId:await f.attempt(tx),pin:'1234',confirmation:'1234',setup:true}),/NOT_ELIGIBLE/);
 f.raw.prepare('UPDATE synthetic_credentials SET pin_setup=0').run();
 const setupTx=await f.rootTx(),attemptId=await f.attempt(setupTx);
 await assert.rejects(f.service.verify({request:request(),tx:setupTx,attemptId,pin:'1234',confirmation:'1235',setup:true}),/MISMATCH/);
 assert.equal(f.raw.prepare('SELECT pin_setup FROM synthetic_credentials').get().pin_setup,0);
 const ok=await f.service.verify({request:request(),tx:setupTx,attemptId,pin:'1234',confirmation:'1234',setup:true});assert.equal(ok.status,'VERIFIED');assert.equal(f.raw.prepare('SELECT pin_setup FROM synthetic_credentials').get().pin_setup,1);
});
test('admin reset plan fences old verifiers and cancels old ceremonies/intents at reset time',async()=>{
 let release,entered;const begun=new Promise(r=>{entered=r;}),wait=new Promise(r=>{release=r;});
 const f=await academy({verifier:async()=>{entered();await wait;return true;}}),tx=await f.rootTx(),attemptId=await f.attempt(tx);
 await f.store.intent({sid:f.sid,csrfHash:'digest',now:f.time()});
 const pending=f.service.verify({request:request(),tx,attemptId,pin:'1234'});await begun;
 await f.store.batch([f.store.stmt('UPDATE synthetic_credentials SET ce=5,generation=2,pin_setup=0,revision=2'),f.store.stmt('UPDATE jwt_v2_accounts SET ce=5'),...f.service.resetPlan({sub:f.sub,newGeneration:2,newCe:5,operationId:crypto.randomUUID()})]);
 release();await assert.rejects(pending,/CREDENTIAL_CHANGED/);assert.equal((await f.store.family(f.sid)).state,'REVOKED');
 assert.equal(f.raw.prepare('SELECT status FROM jwt_v2_ceremonies WHERE tx=?').get(tx).status,'CANCELLED');
 assert.equal(f.raw.prepare('SELECT state FROM jwt_v2_intents').get().state,'CANCELLED');assert.equal(f.raw.prepare('SELECT failures,generation FROM jwt_v2_pin_gates').get().generation,2);
});
test('no extra PIN solely for eligible child admission; code and proof grants have fixed expiry and identity',async()=>{
 const f=await academy(),c=await f.childTx(),op=crypto.randomUUID();
 const code=await f.service.issueCode({request:request(),tx:c.tx,state:c.state,operationId:crypto.randomUUID()});assert.equal(code.winner,true);assert.equal(f.checks(),0);
 const again=await f.service.issueCode({request:request(),tx:c.tx,state:c.state,operationId:crypto.randomUUID()});assert.equal(again.winner,false);assert(!again.code);
 const first=await f.service.redeem({request:c.req,tx:c.tx,targetApp:'studio',purpose:'admission',operationId:op,code:code.code,verifier:c.verifier});
 f.setTime(f.time()+1);const second=await f.service.redeem({request:c.req,tx:c.tx,targetApp:'studio',purpose:'admission',operationId:op,code:code.code,verifier:c.verifier});
 assert.equal(first.grantId,second.grantId);assert.equal(first.expiresAt,second.expiresAt);assert.equal(first.expiresAt-f.now,60);
 assert.equal(f.raw.prepare('SELECT foreground_at FROM jwt_v2_parents').get().foreground_at,f.now);
 const dump=JSON.stringify(f.raw.prepare('SELECT * FROM jwt_v2_ceremonies').all());assert(!dump.includes(code.code));assert(!dump.includes(first.proof));assert(!dump.includes(c.verifier));
 await assert.rejects(f.service.redeem({request:c.req,tx:c.tx,targetApp:'studio',purpose:'admission',operationId:crypto.randomUUID(),code:code.code,verifier:c.verifier}),/CONSUMED/);
});
test('handoff rejects wrong callback host, verifier, purpose, expired code and changed parent',async()=>{
 const f=await academy(),c=await f.childTx();
 await assert.rejects(f.service.register({request:c.req,tx:crypto.randomUUID(),purpose:'admission',targetApp:'studio',expected:null,stateHash:await digestState(c.state),challenge:await s256(c.verifier),callback:'https://studio.ummabbadacademy.app/auth/v2/admission/callback',returnTo:ORIGINS.studio+'/studio/'}),/CALLBACK/);
 const issued=await f.service.issueCode({request:request(),tx:c.tx,state:c.state,operationId:crypto.randomUUID()}),args={request:c.req,tx:c.tx,targetApp:'studio',purpose:'admission',operationId:crypto.randomUUID(),code:issued.code,verifier:c.verifier};
 await assert.rejects(f.service.redeem({...args,verifier:opaque()}),/BINDING/);
 await assert.rejects(f.service.redeem({...args,purpose:'unlock'}),/EXPIRED/);
 f.raw.prepare("UPDATE jwt_v2_parents SET state='REVOKED'").run();await assert.rejects(f.service.redeem(args),/PARENT/);
 f.setTime(f.now+60);await assert.rejects(f.service.redeem(args),/EXPIRED/);
});
test('Academy ordinary-app inactivity lock does not require another app unlock or credit Academy activity',async()=>{
 const f=await academy();f.raw.prepare("UPDATE jwt_v2_parents SET state='LOCKED'").run();
 const expected={app:'studio',sub:f.sub,sid:crypto.randomUUID(),psid:f.psid,bsid:f.bsid,bv:1,ce:4,ae:9,le:0,sv:1,ue:0},c=await f.childTx({purpose:'unlock',expected,pinRequired:true});
 await f.service.verify({request:request(),tx:c.tx,attemptId:await f.attempt(c.tx),pin:'1234'});
 const issued=await f.service.issueCode({request:request(),tx:c.tx,state:c.state,operationId:crypto.randomUUID()});
 const proof=await f.service.redeem({request:c.req,tx:c.tx,targetApp:'studio',purpose:'unlock',operationId:crypto.randomUUID(),code:issued.code,verifier:c.verifier});
 assert(proof.proof);assert.equal(f.raw.prepare('SELECT state FROM jwt_v2_parents').get().state,'LOCKED');assert.equal(f.raw.prepare('SELECT foreground_at FROM jwt_v2_parents').get().foreground_at,f.now);
});
test('expired PIN result cannot mint a later unlock proof',async()=>{
 const f=await academy(),expected={app:'studio',sub:f.sub,sid:crypto.randomUUID(),psid:f.psid,bsid:f.bsid,bv:1,ce:4,ae:9,le:0,sv:1,ue:0},c=await f.childTx({purpose:'unlock',expected,pinRequired:true});
 const ok=await f.service.verify({request:request(),tx:c.tx,attemptId:await f.attempt(c.tx),pin:'1234'});f.setTime(ok.expiresAt);
 await assert.rejects(f.service.issueCode({request:request(),tx:c.tx,state:c.state,operationId:crypto.randomUUID()}),/FRESH_PIN/);
});
test('admission never uses visiting time or later Academy activity to extend a child barrier',()=>{
 const first=admissionBarrier({existing:null,afg:100,now:5500,policyMinutes:90,s_exp:604900});assert.equal(first.state,'ADMITTED_LOCKED');assert.equal(first.lastRefresh,100);
 const later=admissionBarrier({existing:{lastRefresh:100,idleUntil:5500,locked:false},afg:5500,now:5500,policyMinutes:200,s_exp:604900});assert.equal(later.state,'ADMITTED_LOCKED');assert.equal(later.lastRefresh,100);
});
async function child(){
 const f=await fixture('studio');f.raw.exec(ceremonySchemaSQL);let now=f.now,installed=true,plans=0;const handoff=await signing(),api=await signing();
 const select=async()=>{
  if(!installed)return null;const row=await f.store.family(f.sid);return row&&{app:'studio',...JSON.parse(row.binding_json),fingerprint:row.fingerprint};
 };
 const consumer=new LocalCeremonyConsumer({store:f.store,config:f.config,keys:new Map([['handoff',handoff.publicKey]]),clock:()=>now,
  authoriseRequest:async req=>req.headers.get('X-Test-CSRF')==='synthetic'?{csrfHash:'d'.repeat(64)}:null,readInstalled:select,
  mappingGuard:c=>({sql:'SELECT 1 FROM jwt_v2_accounts WHERE sub=? AND active=1 AND ce=? AND ae=?',args:[c.sub,c.ce,c.ae]}),
  prepareTransition:async({claims,purpose,barrier,operationId})=>{
   plans++;const old=purpose==='unlock'?await f.store.family(claims.sid):null,sid=old?.sid||crypto.randomUUID(),sv=old?old.sv+1:1,ue=old?old.ue+1:0;
   const binding={...f.binding,sub:claims.sub,sid,psid:claims.psid,bsid:claims.bsid,bv:claims.bv,ce:claims.ce,ae:claims.ae,s_iat:claims.s_iat,s_exp:claims.s_exp,sv,ue,vat:now};
   const projection={...f.projection,binding},capture={...f.capture,vat:now,primaryCheckedAt:now};
    const refresh=opaque(),fp=await fingerprint(refresh,f.config),deadline=Math.min(now+900,barrier.idleUntil,claims.s_exp),statements=[];
   if(old){
    statements.push(f.store.stmt('UPDATE jwt_v2_families SET sv=?,ue=?,cr=cr+1,state=?,vat=?,deadline=?,idle_until=?,last_refresh=?,fingerprint=?,fingerprint_generation=fingerprint_generation+1,binding_json=?,projection_json=? WHERE sid=?',sv,ue,barrier.state,now,deadline,barrier.idleUntil,barrier.lastRefresh,fp,canonical(binding),canonical(projection),sid));
   }else{
    statements.push(f.store.stmt("INSERT INTO jwt_v2_families(sid,sub,psid,bsid,bv,ce,ae,le,sv,ue,cr,state,s_iat,s_exp,vat,deadline,idle_until,last_refresh,policy_minutes,fingerprint,fingerprint_generation,binding_json,projection_json,authority_ready) VALUES(?,?,?,?,?,?,?,?,?,?,1,?,?,?,?,?,?,?,90,?,1,?,?,?)",sid,claims.sub,claims.psid,claims.bsid,claims.bv,claims.ce,claims.ae,0,sv,ue,barrier.state,claims.s_iat,claims.s_exp,now,deadline,barrier.idleUntil,barrier.lastRefresh,fp,canonical(binding),canonical(projection),Number(barrier.state==='UNLOCKED')));
   }
   const access=barrier.locked?null:await issueToken({...binding,iat:now,exp:deadline,jti:crypto.randomUUID()},{config:f.config,key:api.privateKey,kid:'studio-api',now,idleUntil:barrier.idleUntil});
   return {statements,binding,projection,capture,vectorGuards:f.vectorGuards,result:{sid,sv,ue,le:binding.le,s_exp:claims.s_exp,state:barrier.state},credentials:{access,refresh}};
  }});
 async function grant({purpose='unlock',tx,overrides={}}){
  const c={ver:2,env:'production',iss:ORIGINS.academy,aud:'urn:uaa:production:studio:'+purpose+':v2',sub:f.sub,psid:f.psid,bsid:f.bsid,bv:1,ce:4,ae:9,s_iat:f.binding.s_iat,s_exp:f.binding.s_exp,tx,jti:crypto.randomUUID(),iat:now,exp:Math.min(now+60,f.binding.s_exp),...(purpose==='unlock'?{sid:f.sid,le:0,sv:1,ue:0}:{afg:f.now}),...overrides};
  return issueToken(c,{profile:purpose,config:f.config,key:handoff.privateKey,kid:'handoff',now});
 }
 return {...f,consumer,grant,readInstalled:select,setTime:v=>{now=v;},setInstalled:v=>{installed=v;},plans:()=>plans};
}
test('child consumes a bound unlock atomically, rotates once and cancels prior refresh intents',async()=>{
 const f=await child();await f.store.terminate(f.sid,{operationId:crypto.randomUUID(),state:'LOCKED'});
 f.raw.prepare('INSERT INTO jwt_v2_ceremony_barriers VALUES(?,?,?,?,?,?,1,1)').run(f.psid,f.bsid,1,f.sub,f.now,f.idleUntil);
 const refreshIntent=await f.store.intent({sid:f.sid,csrfHash:'d'.repeat(64),now:f.now}),expected=selector(await f.readInstalled()),tx=crypto.randomUUID(),operationId=crypto.randomUUID();
 await f.consumer.registerPending({request:request('studio'),tx,purpose:'unlock',expected,operationId,expiresAt:f.now+300});
 const proof=await f.grant({tx}),args={request:request('studio'),tx,operationId,proof};
 const results=await Promise.all([f.consumer.consume(args),f.consumer.consume(args)]);assert.equal(results.filter(r=>r.winner).length,1);assert.equal(results.filter(r=>r.cookies).length,1);
 const current=await f.store.family(f.sid);assert.equal(current.sv,2);assert.equal(current.ue,1);assert.equal(current.state,'UNLOCKED');assert.equal(current.s_exp,f.binding.s_exp);assert.notEqual(current.fingerprint,f.fp);
 assert.equal(f.raw.prepare('SELECT state FROM jwt_v2_intents WHERE intent_id=?').get(refreshIntent.intent_id).state,'CANCELLED');
 assert.equal(f.raw.prepare('SELECT state FROM jwt_v2_intents WHERE intent_id=?').get(operationId).state,'COMMITTED');
 assert.equal((await f.store.classifyReuse({fingerprint:f.fp,intentId:refreshIntent.intent_id,binding:f.binding,csrfHash:'d'.repeat(64),now:f.now})).incidentEligible,false);
 const raw=JSON.stringify(f.raw.prepare('SELECT * FROM jwt_v2_ceremony_consumed').all());assert(!raw.includes(proof));assert(!raw.includes(results.find(r=>r.winner).credentials.refresh));
});
test('child rejects cross-session proof and terminal context; failed consume never consumes grant',async()=>{
 const f=await child();await f.store.terminate(f.sid,{operationId:crypto.randomUUID(),state:'LOCKED'});f.raw.prepare('INSERT INTO jwt_v2_ceremony_barriers VALUES(?,?,?,?,?,?,1,1)').run(f.psid,f.bsid,1,f.sub,f.now,f.idleUntil);
 const tx=crypto.randomUUID(),operationId=crypto.randomUUID();await f.consumer.registerPending({request:request('studio'),tx,purpose:'unlock',expected:selector(await f.readInstalled()),operationId,expiresAt:f.now+300});
 await assert.rejects(f.consumer.consume({request:request('studio'),tx,operationId,proof:await f.grant({tx,overrides:{sid:crypto.randomUUID()}})}),/CONTEXT/);
 await f.store.terminate(f.sid,{operationId:crypto.randomUUID()});
 await assert.rejects(f.consumer.consume({request:request('studio'),tx,operationId,proof:await f.grant({tx})}),/CONTEXT/);
 assert.equal(f.raw.prepare('SELECT count(*) n FROM jwt_v2_ceremony_consumed').get().n,0);
});
test('first admission with elapsed authenticated foreground reference creates only a locked pending family',async()=>{
 const f=await child();f.raw.prepare('DELETE FROM jwt_v2_family_policy').run();f.raw.prepare('DELETE FROM jwt_v2_families').run();f.setInstalled(false);f.setTime(f.now+5400);
 const tx=crypto.randomUUID(),operationId=crypto.randomUUID();await f.consumer.registerPending({request:request('studio'),tx,purpose:'admission',expected:null,operationId,expiresAt:f.now+5700});
 const proof=await f.grant({purpose:'admission',tx}),r=await f.consumer.consume({request:request('studio'),tx,operationId,proof});
 assert.equal(r.result.state,'ADMITTED_LOCKED');assert.equal(r.credentials.access,null);
 const family=await f.store.family(r.result.sid);assert.equal(family.last_refresh,f.now);assert.equal(family.idle_until,f.now+5400);assert.equal(family.s_exp,f.binding.s_exp);
});
test('missing established child barrier fails closed instead of seeding a fresh period',async()=>{
 const f=await child();await f.store.terminate(f.sid,{operationId:crypto.randomUUID(),state:'LOCKED'});
 const tx=crypto.randomUUID(),operationId=crypto.randomUUID();await f.consumer.registerPending({request:request('studio'),tx,purpose:'unlock',expected:selector(await f.readInstalled()),operationId,expiresAt:f.now+300});
 await assert.rejects(f.consumer.consume({request:request('studio'),tx,operationId,proof:await f.grant({tx})}),/BARRIER_UNAVAILABLE/);
});

test('source concurrency budget is shared across accounts and instances, and rejection is not a wrong PIN',async()=>{
 let releases=[],entered=0,allEntered;const begun=new Promise(r=>{allEntered=r;});
 const f=await academy({verifier:async()=>{entered++;if(entered===2)allEntered();await new Promise(r=>releases.push(r));return true;}});
 for(const sub of ['synthetic-two','synthetic-three'])f.raw.prepare('INSERT INTO synthetic_credentials VALUES(?,4,1,1,1,1)').run(sub);
 const tx1=await f.rootTx(),tx2=await f.rootTx('synthetic-two'),tx3=await f.rootTx('synthetic-three');
 const a1=await f.attempt(tx1),a2=await f.attempt(tx2),a3=await f.attempt(tx3);
 const first=f.service.verify({request:request(),tx:tx1,attemptId:a1,pin:'1234'}),second=f.service.verify({request:request(),tx:tx2,attemptId:a2,pin:'1234'});await begun;
 await assert.rejects(f.service.verify({request:request(),tx:tx3,attemptId:a3,pin:'1234'}),/RATE_LIMITED/);
 assert.equal(f.checks(),2);assert.equal(f.raw.prepare('SELECT failures FROM jwt_v2_pin_gates WHERE sub=?').get('synthetic-three').failures,0);
 for(const r of releases)r();await Promise.all([first,second]);
});
test('wrong origin and malformed PIN fail before actual verification or wrong-PIN accounting',async()=>{
 const f=await academy(),tx=await f.rootTx(),attemptId=await f.attempt(tx);
 await assert.rejects(f.service.verify({request:request('hifz'),tx,attemptId,pin:'1234'}),/ORIGIN/);
 for(const pin of ['123','12345','abcd',1234])await assert.rejects(f.service.verify({request:request(),tx,attemptId,pin}));
 assert.equal(f.checks(),0);assert.equal(f.raw.prepare('SELECT failures FROM jwt_v2_pin_gates').get().failures,0);
});

test('near-expiry admission caps pending code and proof at the unchanged original parent deadline',async()=>{
 const f=await academy();f.setTime(f.binding.s_exp-10);const c=await f.childTx(),code=await f.service.issueCode({request:request(),tx:c.tx,state:c.state,operationId:crypto.randomUUID()});
 assert.equal(code.expiresAt,f.binding.s_exp);
 const result=await f.service.redeem({request:c.req,tx:c.tx,targetApp:'studio',purpose:'admission',operationId:crypto.randomUUID(),code:code.code,verifier:c.verifier});assert.equal(result.expiresAt,f.binding.s_exp);
});
test('short-lived abuse cleanup never clears the persistent wrong-PIN count',async()=>{
 const f=await academy({verifier:()=>false}),tx=await f.rootTx();
 await f.service.verify({request:request(),tx,attemptId:await f.attempt(tx),pin:'0000'});
 f.setTime(f.time()+121);await f.service.pruneAbuseMetadata();
 assert.equal(f.raw.prepare('SELECT count(*) n FROM jwt_v2_ceremony_budgets').get().n,0);assert.equal(f.raw.prepare('SELECT failures FROM jwt_v2_pin_gates').get().failures,1);
});

test('concurrent code issuance returns only one opaque code, and stale losers receive no credential',async()=>{
 const f=await academy(),c=await f.childTx();
 const results=await Promise.all([1,2,3].map(()=>f.service.issueCode({request:request(),tx:c.tx,state:c.state,operationId:crypto.randomUUID()})));
 assert.equal(results.filter(r=>r.winner).length,1);assert.equal(results.filter(r=>r.code).length,1);assert(results.filter(r=>!r.winner).every(r=>r.cookies===false));
});
test('native credential change prevents code issuance even before projection/parent state catches up',async()=>{
 const f=await academy(),c=await f.childTx();f.raw.prepare('UPDATE synthetic_credentials SET ce=5,generation=2,revision=2').run();
 await assert.rejects(f.service.issueCode({request:request(),tx:c.tx,state:c.state,operationId:crypto.randomUUID()}),/CREDENTIAL_CHANGED/);
 assert.equal(f.raw.prepare('SELECT code_hash FROM jwt_v2_ceremonies WHERE tx=?').get(c.tx).code_hash,null);
});

test('source token bucket has burst ten and sixty-per-minute refill across separate ceremonies',async()=>{
 const f=await academy({verifier:()=>true});
 for(let i=0;i<10;i++){const tx=await f.rootTx();await f.service.verify({request:request(),tx,attemptId:await f.attempt(tx),pin:'1234'});}
 const tx=await f.rootTx(),attemptId=await f.attempt(tx);await assert.rejects(f.service.verify({request:request(),tx,attemptId,pin:'1234'}),/RATE_LIMITED/);
 assert.equal(f.checks(),10);assert.equal(f.raw.prepare('SELECT failures FROM jwt_v2_pin_gates').get().failures,0);
 f.setTime(f.time()+1);const result=await f.service.verify({request:request(),tx,attemptId,pin:'1234'});assert.equal(result.status,'VERIFIED');assert.equal(f.checks(),11);
});

test('known handoff-key withdrawal arriving during consume cancels issuance atomically',async()=>{
 const f=await child();await f.store.terminate(f.sid,{operationId:crypto.randomUUID(),state:'LOCKED'});
 f.raw.prepare('INSERT INTO jwt_v2_ceremony_barriers VALUES(?,?,?,?,?,?,1,1)').run(f.psid,f.bsid,1,f.sub,f.now,f.idleUntil);
 const tx=crypto.randomUUID(),operationId=crypto.randomUUID();await f.consumer.registerPending({request:request('studio'),tx,purpose:'unlock',expected:selector(await f.readInstalled()),operationId,expiresAt:f.now+300});
 const prepare=f.consumer.prepareTransition;
 f.consumer.prepareTransition=async options=>{
  const plan=await prepare(options);
  f.raw.prepare('INSERT INTO jwt_v2_restrictions(restriction_id,target_json,scope_sub,digest,created_at) VALUES(?,?,NULL,NULL,?)').run(crypto.randomUUID(),canonical({type:'key',purpose:'academy-handoff',kid:'handoff',registryRevision:2}),f.now);
  return plan;
 };
 await assert.rejects(f.consumer.consume({request:request('studio'),tx,operationId,proof:await f.grant({tx})}));
 const current=await f.store.family(f.sid);assert.equal(current.state,'LOCKED');assert.equal(current.fingerprint,f.fp);
 assert.equal(f.raw.prepare('SELECT count(*) n FROM jwt_v2_ceremony_consumed').get().n,0);
});
