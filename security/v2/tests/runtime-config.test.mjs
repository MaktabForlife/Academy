import test from 'node:test';
import assert from 'node:assert/strict';
import registry from '../native-authority.json' with {type:'json'};
import {loadRuntimeConfiguration,selectedV2} from '../runtime-config.mjs';
import {ORIGINS} from '../tokens.mjs';
import {b64u} from '../codec.mjs';
const secret=()=>b64u(crypto.getRandomValues(new Uint8Array(32)));
async function ec(){const pair=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);return {public:await crypto.subtle.exportKey('jwk',pair.publicKey),private:await crypto.subtle.exportKey('jwk',pair.privateKey)};}
async function fixture(){
 const api=await ec(),handoff=await ec(),csrf=secret(),draft=secret(),service=secret();
 const raw={schema:2,app:'academy',env:'production',publicOrigin:ORIGINS.academy,academyOrigin:ORIGINS.academy,activationEnabled:true,AIEnabled:false,snapshotSchema:3,generation:'isolated-test',nativeOwnerEpoch:'test-native-owner',policyMinutes:90,nativeTables:Object.keys(registry.rules),foreignDependencies:[{id:'academy:studio-source-authority',ownerApp:'academy',ownerEpoch:'test-native-owner',scope:'ACCOUNT',recipients:['studio'],actions:['read']}]};
 const env={UAA_V2_ENABLED:'1',UAA_V2_CONFIG:JSON.stringify(raw),UAA_V2_API_KEYS_JSON:JSON.stringify({currentKid:'api',keys:[{kid:'api',jwk:api.public}]}),UAA_V2_API_PRIVATE_JWK:JSON.stringify(api.private),UAA_V2_HANDOFF_KEYS_JSON:JSON.stringify({currentKid:'handoff',keys:[{kid:'handoff',jwk:handoff.public}]}),UAA_V2_HANDOFF_PRIVATE_JWK:JSON.stringify(handoff.private),UAA_V2_CSRF_KEYS_JSON:JSON.stringify({currentKid:'csrf',keys:[{kid:'csrf',key:csrf}]}),UAA_V2_DRAFT_KEYS_JSON:JSON.stringify({currentKid:'draft',keys:[{kid:'draft',key:draft}]}),UAA_V2_SERVICE_KEYS_JSON:JSON.stringify({keys:[{kid:'studio-source',sourceApp:'studio',targetApp:'academy',key:service,paths:['/internal/auth/v2/transactions','/internal/auth/v2/redeem']}]}),ACADEMY_DB:{withSession(){return this;}},AUTH_CACHE:{get(){},put(){}}};
 return {env,raw,api,handoff,csrf,draft,service};
}
test('explicit owner configuration validates real signing pairs, fixed origins and scoped snapshot3',async()=>{
 const f=await fixture(),settings=await loadRuntimeConfiguration(f.env,'academy');
 assert.equal(settings.raw.snapshotSchema,3);assert.equal(settings.dependencies.get('academy:studio-source-authority').scope,'ACCOUNT');
 assert.equal(settings.prefix,'auth-private/v2/production/academy/isolated-test/');
 assert.equal(selectedV2(new Request(ORIGINS.academy+'/'),f.env,'academy'),true);
 assert.equal(selectedV2(new Request('https://academy-alias.example/'),f.env,'academy'),false);
 assert.equal(settings.apiSigningKey.extractable,false);
});
test('ambiguous revision7 snapshot profile, AI activation and wrong owner origin are rejected',async()=>{
 for(const patch of [{snapshotSchema:2},{snapshotSchema:undefined},{AIEnabled:true},{publicOrigin:ORIGINS.studio},{activationEnabled:false}]){
  const f=await fixture();Object.assign(f.raw,patch);f.env.UAA_V2_CONFIG=JSON.stringify(f.raw);await assert.rejects(loadRuntimeConfiguration(f.env,'academy'),/V2_CONFIGURATION_MISMATCH/);
 }
});
test('a configured private signer cannot differ from its current public verifier',async()=>{
 const f=await fixture();f.env.UAA_V2_API_PRIVATE_JWK=JSON.stringify((await ec()).private);await assert.rejects(loadRuntimeConfiguration(f.env,'academy'),/SIGNING_KEY_PAIR_CONFLICT/);
 const g=await fixture();g.env.UAA_V2_HANDOFF_PRIVATE_JWK=JSON.stringify((await ec()).private);await assert.rejects(loadRuntimeConfiguration(g.env,'academy'),/SIGNING_KEY_PAIR_CONFLICT/);
});
test('access and handoff cannot share a signing key even when their kids differ',async()=>{
 const f=await fixture();f.env.UAA_V2_HANDOFF_KEYS_JSON=JSON.stringify({currentKid:'handoff',keys:[{kid:'handoff',jwk:f.api.public}]});f.env.UAA_V2_HANDOFF_PRIVATE_JWK=JSON.stringify(f.api.private);await assert.rejects(loadRuntimeConfiguration(f.env,'academy'),/KEY_PURPOSE_SEPARATION_REQUIRED/);
});
test('service configuration cannot grant child-to-child or unknown path authority',async()=>{
 for(const patch of [{sourceApp:'studio',targetApp:'hifz'},{paths:['/internal/auth/v2/wildcard']},{sourceApp:'academy',targetApp:'studio',paths:['/internal/auth/v2/logout']}]){
  const f=await fixture(),ring=JSON.parse(f.env.UAA_V2_SERVICE_KEYS_JSON);Object.assign(ring.keys[0],patch);f.env.UAA_V2_SERVICE_KEYS_JSON=JSON.stringify(ring);await assert.rejects(loadRuntimeConfiguration(f.env,'academy'),/SERVICE_KEY_REGISTRY_INVALID/);
 }
});
test('CSRF, drafts, service, coordinator, cursor and native RPC key purposes stay separate',async()=>{
 for(const owner of ['draft','service','coordinator','cursor','rpc']){
  const f=await fixture();
  if(owner==='draft')f.env.UAA_V2_DRAFT_KEYS_JSON=JSON.stringify({currentKid:'draft',keys:[{kid:'draft',key:f.csrf}]});
  if(owner==='service'){const r=JSON.parse(f.env.UAA_V2_SERVICE_KEYS_JSON);r.keys[0].key=f.csrf;f.env.UAA_V2_SERVICE_KEYS_JSON=JSON.stringify(r);}
  if(owner==='coordinator')f.env.UAA_V2_COORDINATOR_KEY=f.csrf;
  if(owner==='cursor')f.env.UAA_V2_CURSOR_KEYS_JSON=JSON.stringify({keys:[{kid:'cursor',key:f.draft}]});
  if(owner==='rpc')f.env.UAA_V2_NATIVE_RPC_KEYS_JSON=JSON.stringify({keys:[{kid:'rpc',key:f.service}]});
  await assert.rejects(loadRuntimeConfiguration(f.env,'academy'),/KEY_PURPOSE_SEPARATION_REQUIRED/);
 }
});
test('account dependency scope is mandatory and retained without identity case conversion',async()=>{
 const f=await fixture();delete f.raw.foreignDependencies[0].scope;f.env.UAA_V2_CONFIG=JSON.stringify(f.raw);await assert.rejects(loadRuntimeConfiguration(f.env,'academy'),/DEPENDENCY_REGISTRY_INVALID/);
 const g=await fixture(),settings=await loadRuntimeConfiguration(g.env,'academy');
 const lower=settings.dependenciesFor('account-A'),upper=settings.dependenciesFor('ACCOUNT-A');
 assert(lower.some(r=>r.scope==='ACCOUNT:account-A'));assert(upper.some(r=>r.scope==='ACCOUNT:ACCOUNT-A'));assert.notDeepEqual(lower,upper);
});

test('actual runtime rejects raw native, global and wrong-recipient child floors before activation',async()=>{
 for(const change of [
  r=>r.id='academy:native:role_assignments',
  r=>r.scope='GLOBAL',
  r=>r.recipients=['hifz'],
  r=>r.recipients=['studio','hifz']
 ]){
  const f=await fixture();change(f.raw.foreignDependencies[0]);f.env.UAA_V2_CONFIG=JSON.stringify(f.raw);
  await assert.rejects(loadRuntimeConfiguration(f.env,'academy'),/DEPENDENCY_REGISTRY_INVALID/);
 }
 const f=await fixture();f.raw.serviceDependencies=[{...f.raw.foreignDependencies[0],id:'academy:native:accounts',scope:'GLOBAL'}];f.env.UAA_V2_CONFIG=JSON.stringify(f.raw);
 await assert.rejects(loadRuntimeConfiguration(f.env,'academy'),/DEPENDENCY_REGISTRY_INVALID/);
 const g=await fixture();g.raw.serviceDependencies=[g.raw.foreignDependencies[0],g.raw.foreignDependencies[0]];g.env.UAA_V2_CONFIG=JSON.stringify(g.raw);
 await assert.rejects(loadRuntimeConfiguration(g.env,'academy'),/DEPENDENCY_REGISTRY_INVALID/);
});

test('shared Academy keys use an exact production registry and dedicated signer',async()=>{
 const f=await fixture(),shared=await ec();
 const registry={issuer:ORIGINS.academy,env:'production',purpose:'academy-shared-access',revision:1,currentKid:'academy-shared',keys:[{kid:'academy-shared',jwk:shared.public}]};
 f.env.UAA_V2_SHARED_ACADEMY_KEYS_JSON=JSON.stringify(registry);
 f.env.UAA_V2_SHARED_ACADEMY_PRIVATE_JWK=JSON.stringify(shared.private);
 const settings=await loadRuntimeConfiguration(f.env,'academy');
 assert.equal(settings.sharedAcademy.kid,'academy-shared');
 assert.equal(settings.sharedAcademy.revision,1);
 assert.equal(settings.sharedAcademy.signingKey.extractable,false);
 assert.equal(settings.sharedAcademy.keys.get('academy-shared').type,'public');
 for(const patch of [{issuer:ORIGINS.studio},{env:'feature'},{purpose:'academy-handoff'},{revision:0}]){
  f.env.UAA_V2_SHARED_ACADEMY_KEYS_JSON=JSON.stringify({...registry,...patch});
  await assert.rejects(loadRuntimeConfiguration(f.env,'academy'),/SHARED_KEY_REGISTRY_INVALID/);
 }
 f.env.UAA_V2_SHARED_ACADEMY_KEYS_JSON=JSON.stringify({...registry,keys:[{kid:'academy-shared',jwk:f.api.public}]});
 await assert.rejects(loadRuntimeConfiguration(f.env,'academy'),/KEY_PURPOSE_SEPARATION_REQUIRED/);
 f.env.UAA_V2_SHARED_ACADEMY_KEYS_JSON=JSON.stringify(registry);
 f.env.UAA_V2_SHARED_ACADEMY_PRIVATE_JWK=JSON.stringify(f.handoff.private);
 await assert.rejects(loadRuntimeConfiguration(f.env,'academy'),/SIGNING_KEY_PAIR_CONFLICT/);
});
