import test from 'node:test';
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {createNativeHTTPFixture} from './http-native-fixture.mjs';
import {signIn} from '../../../backend/tests/fixtures/academy-v111-native-fixture.mjs';
import {childJourney} from '../../../backend/tests/fixtures/academy-v111-journey-fixture.mjs';
import {ORIGINS} from '../tokens.mjs';
import {bytes,canonical} from '../codec.mjs';
const delta=(a,b)=>Object.fromEntries(Object.keys(a).map(k=>[k,b[k]-a[k]]));
const snapshot=(f,app)=>({sqlStatements:f.metrics[app].queries,sqlBatches:f.metrics[app].batches,r2Reads:f.buckets[app].gets,r2WriteAttempts:f.buckets[app].puts});
const report={schema:1,measurement:'LOCAL_SYNTHETIC_NODE_SQLITE_MAP_R2',providerCpuMs:null,providerElapsedMs:null,billedD1Rows:null,apps:{},qualification:'Counts reflect local adapter calls. Node host wall/CPU timings are not Cloudflare Worker CPU, network latency, or billed D1 scans/index writes. No real accounts, hosted database or provider requests.'};
test('all three native apps keep ordinary warm authentication independent of SQL and permission size in cookies',async()=>{
 const f=await createNativeHTTPFixture();try{
  const sessions={academy:await signIn(f)};for(const app of ['studio','hifz'])sessions[app]=await childJourney(f,app,{academyContext:sessions.academy.context});
  for(const app of ['academy','studio','hifz']){
   const runtime=f.runtimes[app],request=()=>new Request(ORIGINS[app]+'/api/representative-protected-read',{headers:{Cookie:f.jar.header(ORIGINS[app])}});
   runtime.rightsMemo.clear();const coldBefore=snapshot(f,app);await runtime.authorise(request());const cold=delta(coldBefore,snapshot(f,app));
   const before=snapshot(f,app),samples=[],cpu=process.cpuUsage();
   for(let n=0;n<40;n++){const start=performance.now();await runtime.authorise(request());samples.push(performance.now()-start);}
   const hostCpu=process.cpuUsage(cpu),warm=delta(before,snapshot(f,app));samples.sort((a,b)=>a-b);
   const controls=[...f.buckets[app].objects].filter(([key])=>key.includes('/security/session/')||key.endsWith('/control/app')).map(([,value])=>bytes(value.body).length);
   const rights=[...f.buckets[app].objects].filter(([key])=>key.includes('/rights/')).map(([,value])=>bytes(value.body).length);
   const header=f.jar.header(ORIGINS[app]),pairs=header.split('; ');
   assert.equal(pairs.length,2);assert(pairs.every(v=>v.startsWith('__Host-')));assert(!header.includes('Domain='));
   assert.equal(cold.sqlStatements,0,app+' cold-isolate cache payload read must not query auth SQL');
   assert.equal(warm.sqlStatements,0,app+' warm ordinary authentication must not query SQL');
   assert.equal(warm.r2WriteAttempts,0);assert(controls.every(n=>n<=16384));
   const at=pairs.find(v=>v.split('=')[0].endsWith('_a'))||pairs.find(v=>v.split('=')[1].split('.').length===3);
   assert(at);const token=at.slice(at.indexOf('=')+1);assert(bytes(token).length<=2048);
   const configuredVariableBytes=Object.fromEntries(Object.entries(f.envs[app]).filter(([key,value])=>key.startsWith('UAA_V2_')&&typeof value==='string').map(([key,value])=>[key,bytes(value).length]));
   report.apps[app]={configuredVariableBytes,providerVariableLimitBytes:5120,oversizedConfiguredVariables:Object.entries(configuredVariableBytes).filter(([,size])=>size>5120).map(([key])=>key),cookieCount:pairs.length,cookieHeaderBytes:bytes(header).length,accessTokenBytes:bytes(token).length,controlBytes:{max:Math.max(...controls),objects:controls.length},rightsPayloadBytes:{max:Math.max(...rights),objects:rights.length},ownerDependencies:f.captures[app].included.length,coldCache:cold,warm:{samples:40,...warm,r2ReadsPerRequest:warm.r2Reads/40,hostWallP95Ms:samples[Math.ceil(samples.length*.95)-1],hostProcessCpuTotalMicros:hostCpu.user+hostCpu.system}};
  }
  if(process.env.V111_RESOURCE_REPORT)writeFileSync(process.env.V111_RESOURCE_REPORT,JSON.stringify(report,null,2)+'\n');
 }finally{f.close();}
});
