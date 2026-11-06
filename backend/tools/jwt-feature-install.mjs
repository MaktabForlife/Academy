// One-time separately approved setup. No database creation or DDL capability.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,cpSync,readdirSync,lstatSync} from 'node:fs';
import {resolve,join,relative} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {githubClient} from '../../tools/approved-deployment.mjs';
import {setupApproval} from '../../tools/approved-feature-setup.mjs';
import {setupContract} from './jwt-feature-setup-contract.mjs';
import {compileInstallPackage,assertSchemaReceipt,bindPublicSigningKey} from './jwt-feature-install-package.mjs';
import {createInstallOps} from './jwt-feature-install-transport.mjs';
import {createPrivateCapsule} from './jwt-feature-install-secrets.mjs';
import {setupClient} from './jwt-feature-setup-client.mjs';
import {installFreshFeature} from './jwt-feature-install-controller.mjs';
const hash=x=>createHash('sha256').update(x).digest('hex');
async function main(){
 assert.equal(process.env.GITHUB_ACTIONS,'true');assert.equal(process.env.GITHUB_REPOSITORY,'MaktabForlife/Academy');
 assert.equal(process.env.GITHUB_REF,'refs/heads/feature-preview');
 const root=process.cwd(),source=process.env.GITHUB_SHA,read=p=>JSON.parse(readFileSync(resolve(root,p),'utf8'));
 assert.match(source,/^[a-f0-9]{40}$/);
 const api=githubClient(process.env.GITHUB_TOKEN);
 const approved=await setupApproval({api,mergeSha:process.env.APPROVAL_MERGE_SHA,prNumber:process.env.APPROVAL_PR,featureSha:source});
 const schemaReceipt=assertSchemaReceipt(read('config/jwt-feature-schema-receipt.json'));
 assert.equal(hash(readFileSync(resolve(root,'config/jwt-feature-schema-receipt.json'))),approved.plan.schemaReceiptSHA256);
 assert.deepEqual(schemaReceipt.databaseIds,approved.plan.databaseIds);
 const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
 assert.equal(git('rev-parse','HEAD'),source);
 assert.equal(git('status','--porcelain','--untracked-files=no'),'','SOURCE_NOT_CLEAN');
 assert(Number(String(read('version.json').version).split('.')[0])>=110,'FIRST_JWT_MUST_BE_V110');
 const baseline=read('config/feature-initialisation-receipt.json'),baseWorker=read('backend/wrangler.feature.jsonc'),baseCoordinator=read('backend/wrangler.feature-coordinator.jsonc');
 const {contract}=setupContract({source,databaseIds:schemaReceipt.databaseIds});
 const now=Math.floor(Date.now()/1000),owner=process.env.GITHUB_RUN_ID+'-'+process.env.GITHUB_RUN_ATTEMPT;
 const p=compileInstallPackage({baseWorker,baseCoordinator,baseline,schemaReceipt,contract,source,owner,issued:now,expires:now+900});
 const directory=resolve(process.env.RUNNER_TEMP,'jwt-install-private'),publicOut=resolve(process.env.RUNNER_TEMP,'jwt-install-evidence');
 mkdirSync(directory,{recursive:true,mode:0o700});mkdirSync(publicOut,{recursive:true});
 writeFileSync(resolve(publicOut,'public-package.json'),JSON.stringify(p.publicManifest,null,2)+'\n');
 // Public build modifies only this reviewed hosting variant, before private ingress.
 execFileSync(process.execPath,[resolve(root,'backend/tools/jwt-v110-feature-public-build.mjs')],{cwd:root,stdio:'pipe',env:{...process.env,JWT_V110_EVIDENCE:directory}});
 const built=JSON.parse(readFileSync(resolve(directory,'public-build.json'),'utf8')),assetRoot=resolve(root,'.academy-jwt-public');
 assert.equal(built.origin,'https://feature_worker.maktab4life.workers.dev');cpSync(built.directory,assetRoot,{recursive:true});
 const files=[];
 function walk(dir){for(const e of readdirSync(dir,{withFileTypes:true})){const path=join(dir,e.name),stat=lstatSync(path);assert(!stat.isSymbolicLink(),'ASSET_SYMLINK');if(e.isDirectory())walk(path);else{assert(stat.isFile());files.push(relative(assetRoot,path));}}}
 walk(assetRoot);
 for(const p of files)assert(!/(?:^|\/)(?:backend|config|\.git|\.github|node_modules|\.env(?:\.[^/]*)?|\.dev\.vars)(?:\/|$)|\.sql$|private.?key/i.test(p),'NONPUBLIC_ASSET');
 const assets=new Map(files.map(path=>[path,hash(readFileSync(resolve(assetRoot,path)))])),hostingHash=hash(readFileSync(resolve(root,'config/hosting.json')));
 const sourceGuard=async()=>{
  await approved.fresh();assert.equal(git('rev-parse','HEAD'),source);
  const changed=git('diff','--name-only').split('\n').filter(Boolean);assert.deepEqual(changed,['config/hosting.json']);
  assert.equal(hash(readFileSync(resolve(root,'config/hosting.json'))),hostingHash);
  for(const [path,want]of Object.entries(p.publicManifest.sourceHashes))assert.equal(hash(readFileSync(resolve(root,path))),want,'GENERATED_SOURCE_CHANGED');
  const actual=[];function scan(dir){for(const e of readdirSync(dir,{withFileTypes:true})){const path=join(dir,e.name);assert(!lstatSync(path).isSymbolicLink());e.isDirectory()?scan(path):actual.push(relative(assetRoot,path));}}scan(assetRoot);
  assert.deepEqual(actual.sort(),[...assets.keys()].sort(),'ASSET_INVENTORY_CHANGED');for(const [path,want]of assets)assert.equal(hash(readFileSync(resolve(assetRoot,path))),want,'ASSET_CHANGED');
 };
 // Generation/ingress occur only after independent source/effects approval.
 const capsule=await createPrivateCapsule(process.env.FEATURE_TEST_ADMIN_PIN,{kid:'jwt-feature-v110-20261106a-'+owner,setupClientFactory:setupClient});
 try{
  bindPublicSigningKey(p,capsule.publicKey);
  writeFileSync(resolve(publicOut,'public-package.json'),JSON.stringify(p.publicManifest,null,2)+'\n');
  const ops=createInstallOps({root,directory,evidenceDirectory:publicOut,p,baseline,expectedVersions:read('config/jwt-feature-native-version-baseline.json'),schemaReceipt,contract,token:process.env.CLOUDFLARE_API_TOKEN,candidateGuard:sourceGuard});
  const result=await installFreshFeature({ops,packageInfo:p,privateCapsule:capsule});
  console.log(JSON.stringify({state:result.state,cleanupVerified:result.cleanupVerified,activated:false,source,receipt:'verified-paused-receipt.json'}));
 }finally{capsule.destroy();}
}
if(process.argv[1]&&resolve(process.argv[1])===new URL(import.meta.url).pathname){
 try{await main();}catch{console.error('JWT_FEATURE_INSTALLATION_STOPPED_SEE_ALLOWLISTED_RECEIPT');process.exitCode=1;}
}
