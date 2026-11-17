import * as fs from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {spawn,spawnSync} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';

const OLD_PACKAGE='547622ada94067ea058c2158fcd0378f86c1b85701d2e01af95275f238364d97';
const OLD_COMMON='7dee1dab81cf13f4b9fba5f1d919d200ddd5326534168dac4e5dcae31242f8bc';
const OLD_ENTRY='e564dcd11fcc8e82b7af4ea9cf8267114436a500962873842957b9e5dc8924a5';
const NEW_ENTRY='864c1d88c169b497a4dd124cc868da7a74c6316bb3acf6bae7028bbf69ca3d6e';
const ENTRY='source/Academy/backend/src/academy-existing-feature-entry-v5.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
const fail=c=>{throw Object.assign(Error(c),{safeCode:c});};
const check=(v,c)=>{if(!v)fail(c);};
const report={schema:'ACADEMY_ROUTING_BUILD_SAFE_RESULT_V1',status:'FAIL',AI:'OFF',applicationRequests:0,CloudflareRequests:0,applicationCodeExecuted:false};
let out;
async function json(p){return JSON.parse(await fs.readFile(p,'utf8'));}
async function pin(p,role){
 p=await fs.realpath(p);const b=await fs.readFile(p);
 return {path:p,role,bytes:b.length,sha256:hash(b)};
}
async function walk(root,prefix=''){
 const result=[];
 for(const e of await fs.readdir(join(root,prefix),{withFileTypes:true})){
  check(!e.isSymbolicLink(),'SYMLINK_INPUT');
  const rel=prefix?prefix+'/'+e.name:e.name;
  if(e.isDirectory())result.push(...await walk(root,rel));
  else {check(e.isFile(),'NON_FILE_INPUT');result.push(rel);}
 }return result.sort();
}
function counts(s,key){const m=s.match(new RegExp('^# '+key+' ([0-9]+)$','m'));return m?Number(m[1]):-1;}
async function unit(repo,entry,before){
 const r=spawnSync(process.execPath,['--test','--test-reporter=tap','backend/tests/academy-existing-feature-entry-routing.test.mjs'],{
  cwd:repo,env:{PATH:process.env.PATH,ACADEMY_ROUTING_ENTRY_SOURCE:entry},encoding:'utf8',timeout:30000,maxBuffer:2097152
 });
 const text=r.stdout||'';
 await fs.writeFile(join(out,before?'before.tap':'after.tap'),text,{flag:'wx',mode:0o600});
 check(!r.error&&r.signal===null&&counts(text,'tests')===7,'UNIT_EXECUTION');
 check(before?r.status===1&&counts(text,'pass')===4&&counts(text,'fail')===3&&text.includes('404 !== 200'):r.status===0&&counts(text,'pass')===7&&counts(text,'fail')===0,'UNIT_REGRESSION');
 return {tests:7,pass:counts(text,'pass'),fail:counts(text,'fail')};
}
async function compile(repo,bindingFile){
 const p=spawn(process.execPath,[join(repo,'tools/academy-routing-release/compile-child.mjs'),bindingFile],{
  cwd:repo,detached:true,env:{PATH:process.env.PATH,TMPDIR:process.env.RUNNER_TEMP,LANG:'C.UTF-8'},stdio:['ignore','pipe','pipe']
 });
 let stdout='',stderr='',timedOut=false;
 const limit=120000;
 const timer=setTimeout(()=>{timedOut=true;try{process.kill(-p.pid,'SIGTERM');}catch{}},limit);
 p.stdout.on('data',b=>{stdout+=b.toString();if(stdout.length>1048576){try{process.kill(-p.pid,'SIGTERM');}catch{}}});
 p.stderr.on('data',b=>{stderr+=b.toString();if(stderr.length>1048576){try{process.kill(-p.pid,'SIGTERM');}catch{}}});
 const result=await new Promise((yes,no)=>{p.once('error',no);p.once('close',(code,signal)=>yes({code,signal}));});
 clearTimeout(timer);
 check(!timedOut&&result.code===0&&result.signal===null&&stdout.length<=1048576&&stderr.length<=1048576,'COMPILER_PROCESS_STOP');
 let closed=false;
 for(let i=0;i<20;i++){
  try{process.kill(-p.pid,0);}catch(e){if(e.code==='ESRCH'){closed=true;break;}throw e;}
  await delay(100);
 }
 check(closed,'COMPILER_GROUP_NOT_CLOSED');
 let proof;try{proof=JSON.parse(stdout.trim());}catch{fail('COMPILER_RECEIPT');}
 check(proof.status==='PASS'&&proof.applicationOrDependencyOutputExecuted===false&&proof.SDKNativeHTTPPrivateFixtureAccess===false,'COMPILER_PROOF');
 return {...proof,compilerOwnedGroupClosure:'CLOSED_AND_REAPED_GITHUB_RUNNER'};
}
async function main(){
 check(process.platform==='linux'&&process.version==='v24.22.1','NODE_PIN');
 check(process.env.GITHUB_REPOSITORY==='MaktabForlife/Academy'&&process.env.GITHUB_REF==='refs/heads/feature-preview'&&process.env.GITHUB_EVENT_NAME==='workflow_dispatch','CI_SCOPE');
 check(!process.env.CLOUDFLARE_API_TOKEN&&!process.env.FEATURE_TEST_ADMIN_PIN&&!process.env.NODE_OPTIONS&&!process.env.NODE_PATH,'NO_APPLICATION_CREDENTIALS');
 const event=await json(process.env.GITHUB_EVENT_PATH),inputs=event.inputs||{};
 check(inputs.modern_stage==='routing-build'&&inputs.expected_sha===process.env.GITHUB_SHA&&!['true',true].includes(inputs.credential_preflight),'EXACT_BUILD_SELECTION');
 const repo=await fs.realpath(process.env.GITHUB_WORKSPACE),base=join(repo,'release/academy-existing-feature'),tools=join(repo,'tools/academy-routing-release');
 out=join(await fs.realpath(process.env.RUNNER_TEMP),'academy-routing-build');
 await fs.mkdir(out,{mode:0o700});
 report.sourceSHA=process.env.GITHUB_SHA;report.runId=process.env.GITHUB_RUN_ID;report.stage='input-checks';
 const manifestBytes=await fs.readFile(join(base,'CANDIDATE-MANIFEST.json'));
 check(hash(manifestBytes)===OLD_PACKAGE,'OLD_PACKAGE_PIN');
 const m=JSON.parse(manifestBytes);
 check(m.files.length===1850&&m.publicFileCount===104&&m.commonSHA256===OLD_COMMON&&m.AI==='OFF','OLD_PACKAGE_SHAPE');
 check(JSON.stringify(await walk(base))===JSON.stringify([...m.files.map(r=>r.path),'CANDIDATE-MANIFEST.json'].sort()),'PACKAGE_PATH_SET');
 for(const row of m.files){
  const b=await fs.readFile(join(base,row.path));
  check(row.path===ENTRY?hash(b)===NEW_ENTRY:b.length===row.bytes&&hash(b)===row.sha256,'PACKAGE_INPUT_DRIFT');
 }
 check(hash(await fs.readFile(join(tools,'entry-before.mjs')))===OLD_ENTRY,'ORIGINAL_ENTRY_PIN');
 report.stage='unit-regression';
 report.beforeTests=await unit(repo,join(tools,'entry-before.mjs'),true);
 report.fixedTests=await unit(repo,join(base,ENTRY),false);
 const esbuild=join(repo,'backend/node_modules/esbuild'),platform=join(repo,'backend/node_modules/@esbuild/linux-x64'),jose=join(repo,'backend/node_modules/jose');
 check((await json(join(esbuild,'package.json'))).version==='0.28.1'&&(await json(join(jose,'package.json'))).version==='6.2.15','LOCKED_COMPILER_DEPENDENCIES');
 const publicInputPins=[];
 for(const [role,path]of [
  ['apiModule',join(esbuild,'lib/main.js')],['binWrapper',join(esbuild,'bin/esbuild')],
  ['nativeCompiler',join(platform,'bin/esbuild')],['nodeExecutable',process.execPath],
  ['package',join(esbuild,'package.json')],['platformPackage',join(platform,'package.json')]
 ])publicInputPins.push(await pin(path,role));
 const depPins=[];
 for(const path of await walk(jose)){const b=await fs.readFile(join(jose,path));depPins.push({path,bytes:b.length,sha256:hash(b)});}
 const sm=await fs.readFile(join(tools,'source-manifest.json'));
 const binding={
  schema:'ROOT_REVIEWED_ONE_ACADEMY_EXISTING_FEATURE_BUILD_V1',executionAllowed:true,invocations:1,retries:0,automaticNextStage:false,
  noApplicationImport:true,noSDKNativeHTTPPrivateFixtureAccess:true,freshDedicatedCompilerProcess:true,
  repoRoot:join(base,'source/Academy'),
  manifest:{path:join(tools,'source-manifest.json'),bytes:sm.length,sha256:hash(sm)},
  compiler:{version:'0.28.1',nodeVersion:'24.22.1',apiModule:await fs.realpath(join(esbuild,'lib/main.js')),publicInputPins},
  dependencies:{jose:{version:'6.2.15',root:await fs.realpath(jose),entry:'dist/webapi/index.js',publicInputPins:depPins}},
  outputDirectory:join(out,'common')
 };
 const bindingFile=join(out,'compiler-binding.json');
 await fs.writeFile(bindingFile,JSON.stringify(binding,null,2)+'\n',{flag:'wx',mode:0o600});
 report.stage='one-offline-compile';
 const proof=await compile(repo,bindingFile);
 const common=await fs.readFile(join(out,'common/academy-existing-feature-common.mjs'));
 const oldCommon=await fs.readFile(join(base,'runtime/api/academy-existing-feature-common.mjs'));
 check(hash(oldCommon)===OLD_COMMON&&hash(common)===proof.artifact.sha256,'COMMON_PINS');
 const oldBlock='      if (url.pathname.startsWith("/auth/v110/") && !/\\.(?:m?js|css)$/.test(url.pathname)) return reply5("Not found", 404);';
 const newBlock='      const browserControlPage = url.pathname === "/auth/v110/browser-control.html" && !url.search;\n      if (url.pathname.startsWith("/auth/v110/") && !browserControlPage && !/\\.(?:m?js|css)$/.test(url.pathname)) return reply5("Not found", 404);';
 const oldText=oldCommon.toString('utf8');
 check(oldText.split(oldBlock).length===2&&oldText.replace(oldBlock,newBlock)===common.toString('utf8'),'ONLY_AUTHORIZED_COMPILED_ROUTE_CHANGE');
 const pkg=join(out,'package');
 await fs.cp(base,pkg,{recursive:true,force:false,errorOnExist:true});
 for(const role of ['api','coordinator'])await fs.writeFile(join(pkg,'runtime',role,'academy-existing-feature-common.mjs'),common);
 for(const name of ['academy-existing-feature-common.metafile.json','academy-existing-feature-common.source-identities.json'])await fs.copyFile(join(out,'common',name),join(pkg,'evidence',name));
 await fs.writeFile(join(pkg,'evidence/ACTUAL-BUILD-RESULT.json'),JSON.stringify(proof,null,2)+'\n');
 await fs.copyFile(join(tools,'source-manifest.json'),join(pkg,'evidence/BACKEND-SOURCE-MANIFEST.json'));
 for(const row of m.files){const b=await fs.readFile(join(pkg,row.path));row.bytes=b.length;row.sha256=hash(b);}
 m.commonSHA256=hash(common);m.status='ROUTING_FIX_BUILT_NOT_DEPLOYED';m.sourcePublication=process.env.GITHUB_SHA;
 m.schemaApproval='EXISTING_TEN_APPROVED_OBJECTS_PRESERVED_NO_SCHEMA_CHANGE';
 m.routingFix={controlPage:'/auth/v110/browser-control.html',exactPathWithoutQuery:true,buildSourceSHA:process.env.GITHUB_SHA,compiledChangeIsOnlyAuthorizedRoute:true,unitTests:7};
 const encoded=Buffer.from(JSON.stringify(m,null,2)+'\n');
 await fs.writeFile(join(pkg,'CANDIDATE-MANIFEST.json'),encoded);
 report.stage='complete';report.status='PASS_BUILT_ROUTING_FIX_SOURCE_ONLY';report.commonSHA256=hash(common);report.packageManifestSHA256=hash(encoded);
 report.packageFiles=1850;report.packagePhysicalFiles=1851;report.publicFiles=104;report.onlyAuthorizedCompiledRouteChange=true;
 report.compilerProof=proof;report.AI='OFF';
 await fs.writeFile(join(out,'BUILD-RESULT.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});
 console.log(JSON.stringify(report));
}
try{await main();}
catch(e){
 report.status='FAIL';report.errorCategory=/^[A-Z][A-Z0-9_]{0,95}$/.test(e?.safeCode||'')?e.safeCode:'BUILD_STOP_NO_RETRY';
 if(out)try{await fs.writeFile(join(out,'BUILD-RESULT.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});}catch{}
 console.log(JSON.stringify(report));process.exitCode=1;
}
