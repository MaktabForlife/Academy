import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {prepareFeatureSeed,featureSyntheticAccounts} from '../tools/feature-synthetic-seed.mjs';
import {sqliteD1} from '../tools/academy-split/sqlite-d1.mjs';
import {emptyCompatibilityDatabase} from '../src/academy/separation/compatibility.js';
import {emptyShapes} from '../src/academy/separation/empty-shapes.js';
import {splitEngine} from '../src/academy/separation/engine.js';
import {academyD1Repository} from '../src/academy/d1/repository.js';
import worker from '../src/academy-runtime.js';
import {hosting} from '../src/academy/hosting.mjs';
const secrets=Object.fromEntries(['PIN_SECRET','SESSION_SECRET','SHARED_PIN_SECRET','ACADEMY_OPEN_LIBRARY_STORAGE_KEY'].map(k=>[k,'disposable-feature-native-test-'+k+'-not-a-hosted-credential']));
const pin='2468',h=hosting();
const withSeed=fn=>async()=>{
 const seed=await prepareFeatureSeed({pin,secrets,at:'2026-11-06T00:00:00.000Z'});
 const core=emptyCompatibilityDatabase(sqliteD1(seed.databases.core),emptyShapes,{currentGrants:true}),admin=sqliteD1(seed.databases.admin);
 const engine=splitEngine({core,admin}),namespace={getByName(){return Object.fromEntries(['read','write'].map(m=>[m,async(...args)=>({result:await engine[m](...args)})]));}};
 const config=JSON.parse(readFileSync(new URL('../wrangler.feature.jsonc',import.meta.url),'utf8'));
 const env={...config.vars,...secrets,ACADEMY_D1_MODE:'ACTIVE',ACADEMY_D1_RUN_ID:seed.report.sourceDigest,ACADEMY_DB:sqliteD1(seed.databases.core),ACADEMY_ADMIN_DB:admin,ACADEMY_SPLIT_COORDINATOR:namespace,AUTH_LOGIN_RATE_LIMITER:{limit:async()=>({success:true})}};
 const call=async(path,body={},token='',workspace='ADMIN')=>{
  const response=await worker.fetch(new Request(h.academyApiOrigin+path,{method:'POST',headers:{Origin:h.academyPortalOrigin,'Content-Type':'application/json','X-Academy-Workspace':workspace,...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body)}),env);
  return {status:response.status,body:await response.json(),headers:response.headers};
 };
 const login=async(index=0,value=pin)=>call('/api/account/login',{uniqueid:featureSyntheticAccounts[index].login,pin:value});
 try{await fn({seed,env,call,login});}finally{seed.close();}
};
test('Feature admission requires the isolated split environment and keeps other native environments unchanged',()=>{
 let reads=0;const db={withSession(){reads++;throw Error('Unexpected database access');}};
 for(const vars of [{ENVIRONMENT:'production'},{ENVIRONMENT:'feature'},{ENVIRONMENT:'feature',ACADEMY_DEPLOYMENT_KIND:'ISOLATED_PREVIEW'},{ENVIRONMENT:'feature',ACADEMY_DEPLOYMENT_KIND:'ISOLATED_PREVIEW',ACADEMY_DB_GENERATION:'OTHER'}]){
  assert.throws(()=>academyD1Repository({...vars,ACADEMY_DB:db,ACADEMY_D1_MODE:'ACTIVE'}),/rehearsal is not enabled/);
 }
 assert.equal(reads,0);
});
test('New Feature synthetic accounts sign in through the real native PIN handler with current contexts',withSeed(async f=>{
 for(let i=0;i<featureSyntheticAccounts.length;i++){
  const r=await f.login(i);assert.equal(r.status,200,JSON.stringify(r.body));
  assert.equal(r.body.account.uniqueid,featureSyntheticAccounts[i].login);assert.equal(r.body.sessionStore,'D1');assert.match(r.body.token,/^[^.]+\.[^.]+\.[^.]+$/);
  assert.equal(r.body.context.role,i===0?'GLOBAL_ADMIN':featureSyntheticAccounts[i].role);
  assert.equal(r.headers.get('Cache-Control'),'private, no-store');
 }
 assert.equal(f.seed.databases.core.prepare('SELECT count(*) n FROM account_sessions').get().n,4);
}));
test('Native Feature wrong PIN and invalid PIN format create no session',withSeed(async f=>{
 assert.equal((await f.login(0,'1111')).status,401);
 assert.equal((await f.login(0,'123456')).status,400);
 assert.equal(f.seed.databases.core.prepare('SELECT count(*) n FROM account_sessions').get().n,0);
}));
test('Seeded scoped Admin and learner retain actual resource scope checks',withSeed(async f=>{
 const admin=(await f.login(1)).body.token,learner=(await f.login(2)).body.token;
 for(const [token,workspace]of [[admin,'ADMIN'],[learner,'LEARN']]){
  const yes=await f.call('/api/academy/lesson-media/list',{activityKey:'COURSE:FEATURE-SYNTHETIC-A'},token,workspace);
  assert.equal(yes.status,200,JSON.stringify(yes.body));
  const no=await f.call('/api/academy/lesson-media/list',{activityKey:'COURSE:FEATURE-SYNTHETIC-B'},token,workspace);
  assert.equal(no.status,403,JSON.stringify(no.body));
 }
}));
test('Native logout ends the issued Feature session',withSeed(async f=>{
 const token=(await f.login()).body.token;
 assert.equal((await f.call('/api/account/session',{},token)).status,200);
 assert.equal((await f.call('/api/account/logout',{},token)).status,200);
 assert.equal((await f.call('/api/account/session',{},token)).status,401);
}));
test('Current native credential epoch and account state deny an earlier Feature token',withSeed(async f=>{
 const token=(await f.login()).body.token,id=featureSyntheticAccounts[0].id;
 f.seed.databases.core.prepare('UPDATE account_credentials SET credential_epoch=credential_epoch+1 WHERE account_id=?').run(id);
 assert.equal((await f.call('/api/account/session',{},token)).status,401);
 const next=(await f.login()).body.token;
 f.seed.databases.core.prepare('UPDATE accounts SET active=0 WHERE account_id=?').run(id);
 assert.equal((await f.call('/api/account/session',{},next)).status,401);
}));
test('Generated data-only seed replays exactly into the reviewed empty schemas with references intact',withSeed(async f=>{
 const names=db=>db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
 const quote=s=>'"'+s.replaceAll('"','""')+'"';
 for(const owner of ['core','admin']){
  const copy=new DatabaseSync(':memory:');
  try{
   copy.exec(readFileSync(new URL('../feature-preview-bootstrap/'+owner+'-schema.sql',import.meta.url),'utf8'));
   assert(!/\b(?:DROP|ALTER|CREATE|DELETE FROM accounts|UPDATE accounts)\b/i.test(f.seed.sql[owner]),'Only synthetic first-seed DML is exported.');
   copy.exec(f.seed.sql[owner]);
   assert.deepEqual(copy.prepare('PRAGMA foreign_key_check').all(),[]);assert.equal(copy.prepare('PRAGMA quick_check').get().quick_check,'ok');
   for(const {name}of names(copy))assert.deepEqual(copy.prepare('SELECT * FROM '+quote(name)+' ORDER BY rowid').all(),f.seed.databases[owner].prepare('SELECT * FROM '+quote(name)+' ORDER BY rowid').all(),owner+'.'+name);
   assert.throws(()=>copy.exec(f.seed.sql[owner]),/UNIQUE constraint failed/,'A repeated seed must stop rather than overwrite.');
  }finally{copy.close();}
 }
}));
