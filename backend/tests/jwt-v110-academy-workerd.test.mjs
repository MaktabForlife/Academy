import {createAcademyWorkerdFixture} from './jwt-v110-workerd-fixture.mjs';
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
 const fixture=await createAcademyWorkerdFixture(),{runtime,seed,config}=fixture;
 const compatibilityDate=config.compatibility_date,compatibilityFlags=config.compatibility_flags;
 try{
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
  const report={schema:1,commit:process.env.GITHUB_SHA,runtime:{miniflare:JSON.parse(readFileSync(resolve(process.env.FEATURE_MF_ROOT,'node_modules/miniflare/package.json'),'utf8')).version,workerd:JSON.parse(readFileSync(resolve(process.env.FEATURE_MF_ROOT,'node_modules/workerd/package.json'),'utf8')).version},compatibilityDate,compatibilityFlags,kind:'LOCAL_NATIVE_JWT_COOKIE_FLOW',fixtureDirectOldSentinelQueries:2,hostedDBReads:0,hostedWorkerCalls:0,genuineBrowserDeliveryProved:false,foregroundActivityProved:false,calls,totals,scope:'Thirteen explicitly dispatched own-app requests, including actual Core-only and private owner-coordinator writes, including allowed/denied material, not a matched baseline savings claim or hosted billing. D1 meta includes native triggers/indexes and private RPC; counters observe tested fetch/R2/limiter boundaries only. No raw cookies, JWT, keys, CSRF, PIN or journal content in report.'};
  if(process.env.JWT_V110_EVIDENCE){mkdirSync(process.env.JWT_V110_EVIDENCE,{recursive:true});writeFileSync(process.env.JWT_V110_EVIDENCE+'/workerd-cookie-flow.json',JSON.stringify(report,null,2)+'\n');}
  console.log(JSON.stringify({totals,hostedDBReads:0,hostedWorkerCalls:0}));
 }finally{await fixture.close();}
});
