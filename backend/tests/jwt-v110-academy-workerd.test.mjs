import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {build} from 'esbuild';
import {generateKeyPair,exportJWK} from 'jose';
import {prepareFeatureSeed,featureSyntheticAccounts} from '../tools/feature-synthetic-seed.mjs';
import {randomRefresh} from '../src/auth/v110/store.mjs';
const runtimeRequire=createRequire(resolve(process.env.FEATURE_MF_ROOT,'package.json'));
const {Miniflare,convertV4MiniflareOptions}=runtimeRequire('miniflare');
const origin='https://feature_worker.maktab4life.workers.dev',secrets=Object.fromEntries(['PIN_SECRET','SESSION_SECRET','SHARED_PIN_SECRET','ACADEMY_OPEN_LIBRARY_STORAGE_KEY'].map(k=>[k,crypto.randomUUID()+crypto.randomUUID()]));
test('Actual Feature entry in workerd uses native PIN, cookie identity, current material scope, own refresh and logout',async()=>{
 const seed=await prepareFeatureSeed({pin:'2468',secrets}),config=JSON.parse(readFileSync(new URL('../wrangler.feature.jsonc',import.meta.url),'utf8'));let runtime;
 try{
  seed.databases.core.exec(readFileSync(new URL('./fixtures/jwt-v110-auth-only.sql',import.meta.url),'utf8'));
  const keys=await generateKeyPair('ES256',{extractable:true}),publicJWK={...await exportJWK(keys.publicKey),kid:'local-mf-a'},privateJWK={...await exportJWK(keys.privateKey),kid:'local-mf-a'};
  const bundles=await Promise.all(['jwt-v110-academy-workerd-api.mjs','feature-local-budget-coordinator.mjs'].map(name=>build({entryPoints:[new URL(name,import.meta.url).pathname],bundle:true,format:'esm',platform:'browser',write:false,external:['cloudflare:workers']})));
  const d1Databases={ACADEMY_DB:'jwt-core',ACADEMY_ADMIN_DB:'jwt-admin'},durableObjects={ACADEMY_SPLIT_COORDINATOR:{className:'AcademySplitCoordinator',scriptName:'coordinator',useSQLite:true}};
  const compatibilityDate=config.compatibility_date,compatibilityFlags=config.compatibility_flags;
  runtime=new Miniflare(convertV4MiniflareOptions({workers:[
   {name:'api',modules:true,script:bundles[0].outputFiles[0].text,compatibilityDate,compatibilityFlags,bindings:{...config.vars,...secrets,ACADEMY_D1_MODE:'ACTIVE',ACADEMY_D1_RUN_ID:seed.report.sourceDigest,ALLOWED_ORIGINS:origin,JWT_V110_MASTER:'1',JWT_V110_BROWSER:'1',JWT_V110_REFRESH:'1',JWT_V110_NATIVE_COOKIE:'1',JWT_V110_COOKIE_MODE:'HOST_ONLY_PREVIEW',JWT_V110_REQUEST_ORIGIN:origin,JWT_V110_PUBLIC_KEYS_JSON:JSON.stringify([publicJWK]),JWT_V110_PRIVATE_KEY_JSON:JSON.stringify(privateJWK),JWT_V110_SIGNING_KID:'local-mf-a',JWT_V110_CSRF_SECRET:randomRefresh()},d1Databases,durableObjects:{...durableObjects,PROGRAM_TIMETABLE_COORDINATOR:{className:'ProgramTimetableCoordinator',useSQLite:true}},r2Buckets:{MEDIA_BUCKET:'jwt-public',LESSON_MEDIA_BUCKET:'jwt-private',ASSESSMENT_BUCKET:'jwt-assessments'}},
   {name:'coordinator',modules:true,script:bundles[1].outputFiles[0].text,compatibilityDate,compatibilityFlags,d1Databases,durableObjects}
  ]}));
  for(const owner of ['core','admin']){
   const target=await runtime.getD1Database(owner==='core'?'ACADEMY_DB':'ACADEMY_ADMIN_DB','api'),objects=seed.databases[owner].prepare("SELECT sql FROM sqlite_schema WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY rowid").all();
   const statements=objects.map(o=>target.prepare(o.sql));for(let i=0;i<statements.length;i+=30)await target.batch(statements.slice(i,i+30));
   await target.batch(seed.sql[owner].trim().split('\n').map(sql=>target.prepare(sql)));
  }
  const calls=[],jar=new Map();let proof,handle;
  async function request(path,{body={},method='POST',expected=200,credential=true,workspace='LEARN'}={}){
   const r=await runtime.dispatchFetch(origin+path,{method,headers:{Origin:origin,'Sec-Fetch-Site':'same-origin','Content-Type':'application/json',...(credential?{Cookie:[...jar].map(([k,v])=>k+'='+v).join('; '),...(proof?{'X-UAA-CSRF':proof}:{}),...(handle?{Authorization:'Bearer '+handle}:{})}:{}),'X-Academy-Workspace':workspace},...(method==='POST'?{body:JSON.stringify(body)}:{})});
   const value=await r.json(),observed=JSON.parse(r.headers.get('x-feature-local-budget'));assert.equal(r.status,expected,path+' '+value.code+' '+JSON.stringify(observed.localD1Errors));
   const cookies=r.headers.getSetCookie();for(const c of cookies){assert(!c.includes('Domain='),'Only host-only Feature cookies');const pair=c.split(';')[0],i=pair.indexOf('=');jar.set(pair.slice(0,i),pair.slice(i+1));}
   const metrics=JSON.parse(r.headers.get('x-feature-local-budget'));assert.equal(metrics.remoteCalls,0);calls.push({path,status:r.status,metrics});return value;
  }
  const administrator=await request('/auth/v110/login',{body:{uniqueid:featureSyntheticAccounts[0].login,pin:'2468'},credential:false});proof=administrator.csrf;handle=administrator.sessionKey;
  const selected=await request('/api/admin/platform/courses/get',{body:{courseId:'FEATURE-SYNTHETIC-A'},workspace:'ADMIN'});
  await request('/api/admin/platform/courses/public-card-save',{body:{operationId:crypto.randomUUID(),courseId:'FEATURE-SYNTHETIC-A',baseCardRevision:selected.course.publicCardRevision,publicCard:{time:'10:00',title:'Synthetic workerd fixture',description:'Actual private owner RPC'}},workspace:'ADMIN'});
  await request('/api/academy/bookmarks/save',{body:{bookmark:{file:'/pdf-file/'+Buffer.from('https://archive.org/download/synthetic/fixture.pdf').toString('base64url'),title:'Synthetic public PDF',page:1,pageLabel:'1'}},workspace:'ADMIN'});
  await request('/api/account/logout',{workspace:'ADMIN'});
  const login=await request('/auth/v110/login',{body:{uniqueid:featureSyntheticAccounts[2].login,pin:'2468'},credential:false});
  assert.equal(login.cookieSession,true);assert(!Object.hasOwn(login,'token'));proof=login.csrf;handle=login.sessionKey;
  const session=await request('/api/account/session');assert.equal(session.account.accountId,featureSyntheticAccounts[2].id);assert.equal(session.context.role,'STUDENT');
  await request('/api/academy/lesson-media/list',{body:{activityKey:'COURSE:FEATURE-SYNTHETIC-A'}});
  await request('/api/academy/lesson-media/list',{body:{activityKey:'COURSE:FEATURE-SYNTHETIC-B'},expected:403});
  await request('/auth/v110/refresh');
  await request('/api/account/session');
  await request('/api/account/logout');
  await request('/api/account/session',{expected:401});
  const totals={workerRequests:calls.length,privateCoordinatorCalls:0,d1Statements:0,d1RoundTrips:0,d1RowsRead:0,d1RowsWritten:0,r2Operations:0,remoteCalls:0};
  for(const {metrics:m}of calls){totals.privateCoordinatorCalls+=m.coordinatorCalls;for(const v of Object.values(m.d1)){totals.d1RoundTrips+=v.roundTrips;totals.d1Statements+=v.statements;totals.d1RowsRead+=v.rowsRead;totals.d1RowsWritten+=v.rowsWritten;}totals.r2Operations+=Object.values(m.r2).reduce((a,b)=>a+b,0);totals.remoteCalls+=m.remoteCalls;}
  assert.equal(totals.workerRequests,13);assert(totals.d1RowsRead>0);assert.equal(totals.remoteCalls,0);
  const report={schema:1,commit:process.env.GITHUB_SHA,runtime:{miniflare:JSON.parse(readFileSync(resolve(process.env.FEATURE_MF_ROOT,'node_modules/miniflare/package.json'),'utf8')).version,workerd:JSON.parse(readFileSync(resolve(process.env.FEATURE_MF_ROOT,'node_modules/workerd/package.json'),'utf8')).version},compatibilityDate,compatibilityFlags,kind:'LOCAL_NATIVE_JWT_COOKIE_FLOW',hostedDBReads:0,hostedWorkerCalls:0,genuineBrowserDeliveryProved:false,foregroundActivityProved:false,calls,totals,scope:'Thirteen explicitly dispatched own-app requests, including actual Core-only and private owner-coordinator writes, including allowed/denied material, not a matched baseline savings claim or hosted billing. D1 meta includes native triggers/indexes and private RPC; counters observe tested fetch/R2/limiter boundaries only. No raw cookies, JWT, keys, CSRF, PIN or journal content in report.'};
  if(process.env.JWT_V110_EVIDENCE){mkdirSync(process.env.JWT_V110_EVIDENCE,{recursive:true});writeFileSync(process.env.JWT_V110_EVIDENCE+'/workerd-cookie-flow.json',JSON.stringify(report,null,2)+'\n');}
  console.log(JSON.stringify({totals,hostedDBReads:0,hostedWorkerCalls:0}));
 }finally{await runtime?.dispose();seed.close();}
});
