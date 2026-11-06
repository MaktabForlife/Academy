import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {prepareFeatureSeed,featureSyntheticAccounts} from '../tools/feature-synthetic-seed.mjs';
import {hosting} from '../src/academy/hosting.mjs';
const secrets=Object.fromEntries(['PIN_SECRET','SESSION_SECRET','SHARED_PIN_SECRET','ACADEMY_OPEN_LIBRARY_STORAGE_KEY'].map(k=>[k,'local-budget-only-not-a-hosted-credential-'+k]));
const pin='2468',h=hosting(),quote=s=>'"'+s.replaceAll('"','""')+'"';
test('Five-request native Feature smoke flow measures actual local D1 metadata across both owners and private RPC',async()=>{
 const seed=await prepareFeatureSeed({pin,secrets}),config=JSON.parse(readFileSync(new URL('../wrangler.feature.jsonc',import.meta.url),'utf8'));let runtime;
 try{
  const bundles=await Promise.all(['feature-local-budget-api.mjs','feature-local-budget-coordinator.mjs'].map(name=>build({entryPoints:[new URL(name,import.meta.url).pathname],bundle:true,format:'esm',platform:'browser',write:false,external:['cloudflare:workers']})));
  const d1Databases={ACADEMY_DB:'budget-core',ACADEMY_ADMIN_DB:'budget-admin'},durableObjects={ACADEMY_SPLIT_COORDINATOR:{className:'AcademySplitCoordinator',scriptName:'coordinator',useSQLite:true}},compatibilityDate=config.compatibility_date,compatibilityFlags=config.compatibility_flags;
  runtime=new Miniflare(convertV4MiniflareOptions({workers:[
   {name:'api',modules:true,script:bundles[0].outputFiles[0].text,compatibilityDate,compatibilityFlags,bindings:{...config.vars,...secrets,ACADEMY_D1_MODE:'ACTIVE',ACADEMY_D1_RUN_ID:seed.report.sourceDigest},d1Databases,durableObjects:{...durableObjects,PROGRAM_TIMETABLE_COORDINATOR:{className:'ProgramTimetableCoordinator',useSQLite:true}},r2Buckets:{MEDIA_BUCKET:'budget-public',LESSON_MEDIA_BUCKET:'budget-private',ASSESSMENT_BUCKET:'budget-assessments'}},
   {name:'coordinator',modules:true,script:bundles[1].outputFiles[0].text,compatibilityDate,compatibilityFlags,d1Databases,durableObjects}
  ]}));
  for(const owner of ['core','admin']){
   const db=seed.databases[owner],target=await runtime.getD1Database(owner==='core'?'ACADEMY_DB':'ACADEMY_ADMIN_DB','api'),objects=db.prepare("SELECT type,name,sql FROM sqlite_schema WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY rowid").all();
   const statements=objects.filter(o=>o.type==='table').map(o=>target.prepare(o.sql));
   for(const {name}of objects.filter(o=>o.type==='table'))for(const row of db.prepare('SELECT * FROM '+quote(name)).all()){const columns=Object.keys(row);statements.push(target.prepare('INSERT INTO '+quote(name)+'('+columns.map(quote).join(',')+') VALUES('+columns.map(()=>'?').join(',')+')').bind(...Object.values(row)));}
   statements.push(...objects.filter(o=>o.type!=='table').map(o=>target.prepare(o.sql)));
   for(let i=0;i<statements.length;i+=30)await target.batch(statements.slice(i,i+30));
  }
  const calls=[];
  async function request(path,{body,token,expected=200}={}){
   const r=await runtime.dispatchFetch(h.academyApiOrigin+path,{method:body?'POST':'GET',headers:{Origin:h.academyPortalOrigin,'Content-Type':'application/json','X-Academy-Workspace':'ADMIN',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});
   const value=await r.json();assert.equal(r.status,expected,JSON.stringify({code:value.code,path,status:r.status}));
   const metrics=JSON.parse(r.headers.get('x-feature-local-budget'));assert.equal(metrics.remoteCalls,0);calls.push({path,status:r.status,metrics});return value;
  }
  await request('/api/health');
  const login=await request('/api/account/login',{body:{uniqueid:featureSyntheticAccounts[0].login,pin}});assert.equal(login.account.uniqueid,featureSyntheticAccounts[0].login);
  const token=login.token;assert.equal(typeof token,'string');
  await request('/api/account/session',{body:{},token});
  await request('/api/account/logout',{body:{},token});
  await request('/api/account/session',{body:{},token,expected:401});
  assert.equal(calls.length,5);
  const totals={workerRequests:5,privateCoordinatorCalls:0,d1RoundTrips:0,d1Statements:0,d1RowsRead:0,d1RowsWritten:0,r2Operations:0,remoteCalls:0};
  for(const {metrics:m}of calls){totals.privateCoordinatorCalls+=m.coordinatorCalls;for(const v of Object.values(m.d1)){totals.d1RoundTrips+=v.roundTrips;totals.d1Statements+=v.statements;totals.d1RowsRead+=v.rowsRead;totals.d1RowsWritten+=v.rowsWritten;}totals.r2Operations+=Object.values(m.r2).reduce((a,b)=>a+b,0);totals.remoteCalls+=m.remoteCalls;}
  assert(totals.d1RowsRead>0);assert(totals.d1RowsWritten>0);assert(totals.privateCoordinatorCalls>0,'Actual requested-resource authority reads must cross private native RPC');
  const report={schema:1,kind:'LOCAL_FEATURE_SMOKE_BUDGET',commit:process.env.GITHUB_SHA,compatibilityDate,compatibilityFlags,syntheticAccounts:4,syntheticCourses:2,hostedDatabaseReads:0,hostedWorkerCalls:0,telemetry:'Actual local D1 meta.rows_read/rows_written including native triggers/indexes; instrumentation calls all() to retain metadata for first() reads. Not a hosted billing guarantee or whole-app budget.',calls,totals};
  if(process.env.FEATURE_BUDGET_EVIDENCE){mkdirSync(process.env.FEATURE_BUDGET_EVIDENCE,{recursive:true});writeFileSync(process.env.FEATURE_BUDGET_EVIDENCE+'/local-smoke-budget.json',JSON.stringify(report,null,2)+'\n');}
  console.log(JSON.stringify({totals,hostedDatabaseReads:0,hostedWorkerCalls:0}));
 }finally{await runtime?.dispose();seed.close();}
});
