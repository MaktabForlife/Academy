// Builds the explicit same-origin JWT Feature artifact on a disposable runner.
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
if(process.env.GITHUB_ACTIONS!=='true')throw Error('GitHub runner required');
const repo=resolve(new URL('../..',import.meta.url).pathname),origin='https://feature_worker.maktab4life.workers.dev';
const variant={schema:1,environment:'feature',academyPortalOrigin:origin,academyLegacyOrigins:[],academyApiOrigin:origin,studioOrigin:'https://studio-unavailable.invalid',studioBackendOrigin:'https://studio-unavailable.invalid',hifzOrigin:'https://hifz-unavailable.invalid'};
const source=readFileSync(join(repo,'config/hosting.json'));
writeFileSync(join(repo,'config/hosting.json'),JSON.stringify(variant,null,2)+'\n');
const {buildAcademyAssets}=await import('./academy-assets.mjs');
const {copyPortalAssets}=await import('./portal-assets.mjs');
const directory=mkdtempSync(join(tmpdir(),'academy-jwt-public-')),report=buildAcademyAssets({repo,directory,target:'feature'});
copyPortalAssets(repo,directory);
report.files=[...new Set([...report.files,...JSON.parse(readFileSync(join(repo,'portal/assets.json'),'utf8')),'hosting-config.js','portal/studio-authorize.mjs','portal/studio-enter.mjs'])].sort();
const config={enabled:true,nativeCookie:true,app:'academy',origins:{academy:origin,studio:variant.studioOrigin,hifz:variant.hifzOrigin},apiOrigins:[origin]};
writeFileSync(join(directory,'auth/v110/browser-config.js'),'window.M4L_V110_CONFIG=Object.freeze('+JSON.stringify(config)+');\n');
for(const path of report.files.filter(p=>p.endsWith('.html'))){
 const target=join(directory,path),html=readFileSync(target,'utf8');
 if(html.includes('<script src="/auth/v110/browser-bootstrap.js"></script>')){
  writeFileSync(target,html.replace('<script src="/auth/v110/browser-bootstrap.js"></script>','<script src="/auth/v110/academy-cookie-loader.js"></script><script src="/auth/v110/browser-bootstrap.js"></script>'));
 }
}
if(report.files.some(p=>p.startsWith('backend/')||p.endsWith('_worker.js')||p.includes('private-key')))throw Error('NONPUBLIC_FEATURE_ASSET');
const result={schema:1,commit:process.env.GITHUB_SHA,directory,origin,files:report.files,sourceHostingSHA256:createHash('sha256').update(source).digest('hex'),hostedChanges:0};
const evidence=process.env.JWT_V110_EVIDENCE;if(!evidence)throw Error('Evidence destination required');
mkdirSync(evidence,{recursive:true});writeFileSync(join(evidence,'public-build.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({files:report.fileCount,origin,hostedChanges:0}));
