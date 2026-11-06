// GitHub-only public bundle/config proof; never calls Cloudflare.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,cpSync} from 'node:fs';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {packageFixture,bw,bc,baseline} from '../tests/fixtures/jwt-feature-install-fixture.mjs';
import {completeInstallPackage,assertNoTemporarySurface,bindPublicSigningKey} from './jwt-feature-install-package.mjs';
assert.equal(process.env.GITHUB_ACTIONS,'true');
const root=process.cwd(),{p,receipt,contract}=packageFixture(),out=resolve(process.env.RUNNER_TEMP,'jwt-install-package-evidence'),cfg=resolve(process.env.RUNNER_TEMP,'jwt-package-dry-configs');
mkdirSync(out,{recursive:true});mkdirSync(cfg,{recursive:true});
for(const [path,data]of Object.entries(p.sources)){mkdirSync(resolve(root,path,'..'),{recursive:true});writeFileSync(resolve(root,path),data);}
execFileSync(process.execPath,[resolve(root,'backend/tools/jwt-v110-feature-public-build.mjs')],{cwd:root,stdio:'pipe',env:{...process.env,JWT_V110_EVIDENCE:cfg}});
const pub=JSON.parse(readFileSync(resolve(cfg,'public-build.json'),'utf8'));cpSync(pub.directory,resolve(root,'.academy-jwt-public'),{recursive:true});
const publicKey={kty:'EC',crv:'P-256',kid:'jwt-feature-v110-20261106a-dry-only',x:'A'.repeat(43),y:'B'.repeat(43)};
bindPublicSigningKey(p,publicKey);
const final=completeInstallPackage(p,baseline,receipt,contract,{timetableNamespaceId:'c'.repeat(32),splitNamespaceId:'d'.repeat(32),publicKid:publicKey.kid,publicKeys:[publicKey],verifiedAt:new Date().toISOString()});assertNoTemporarySurface(final);
const quarantine={...structuredClone(bw),main:'src/__jwt_feature_unavailable.js',vars:{...bw.vars,ACADEMY_D1_MODE:'PAUSED',JWT_V110_MASTER:'0',JWT_V110_REFRESH:'0',JWT_V110_BROWSER:'0',JWT_V110_NATIVE_COOKIE:'0'}};
const rows=[];
for(const [label,c]of [['quarantine',quarantine],['temporary-worker',p.worker],['temporary-coordinator',p.coordinator],['final-paused-worker',final.worker],['final-coordinator',final.coordinator]]){
 const value={...c,main:resolve(root,'backend',c.main),...(c.assets?{assets:{...c.assets,directory:resolve(root,'backend',c.assets.directory)}}:{})};delete value.$schema;
 const file=resolve(cfg,label+'.json');writeFileSync(file,JSON.stringify(value));
 try{
  execFileSync(process.execPath,[resolve(root,'backend/node_modules/wrangler/bin/wrangler.js'),'deploy','--dry-run','--config',file,'--outdir',resolve(cfg,label+'-bundle')],{cwd:root,stdio:'pipe',env:{...process.env,WRANGLER_SEND_METRICS:'false',WRANGLER_LOG_PATH:resolve(cfg,label+'.log')}});
 }catch{throw Error('LOCAL_DRY_BUNDLE_FAILED_'+label);}
 rows.push({label,configSHA256:createHash('sha256').update(JSON.stringify(value)).digest('hex'),hostedCalls:0});
}
writeFileSync(resolve(out,'dry-bundles.json'),JSON.stringify({source:process.env.GITHUB_SHA,scope:'LOCAL_DRY_RUN_ONLY',bundles:rows,publicAssetFiles:pub.files.length,installed:false,hostedCalls:0,keys:'invalid-public-test-values-only'},null,2)+'\n');
console.log(JSON.stringify({dryBundles:rows.length,hostedCalls:0,installed:false}));
