import {hosting} from '../src/academy/hosting.mjs';
import {copyPortalAssets} from './portal-assets.mjs';
// feature-admin has a separate Worker; other Git builds retain Development.
import {mkdtempSync,readFileSync,writeFileSync,cpSync,mkdirSync,existsSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {buildAcademyAssets} from './academy-assets.mjs';

export const pagesTarget=branch=>branch==='feature-split-db'?'split':['feature-admin','feature-preview'].includes(branch)?'feature':'development';
export function buildDevelopmentPages(repo,{branch}={}){
  repo=resolve(repo);const output=join(repo,'.academy-pages');
  branch=branch||process.env.CF_PAGES_BRANCH||execFileSync('git',['branch','--show-current'],{cwd:repo,encoding:'utf8'}).trim();
  if(existsSync(output))throw Error('PAGES_BUILD_DIRECTORY_ALREADY_EXISTS');
  const temporary=mkdtempSync(join(tmpdir(),'academy-development-pages-'));
  try{
    const target=pagesTarget(branch);
    if(target==='feature'&&hosting().environment!=='feature')throw Error('FEATURE_HOSTING_VARIANT_REQUIRED');
    const assets=join(temporary,'assets'),report=buildAcademyAssets({repo,directory:assets,target});
    copyPortalAssets(repo,assets);
    const bundle=join(temporary,'bundle'),config=join(temporary,'wrangler.json'),entry=join(temporary,'development-pages-worker.mjs');
    writeFileSync(entry,`import {serveAcademySite} from ${JSON.stringify(join(repo,'backend/tools/academy-site.mjs'))};\nexport default {fetch:(request,env)=>serveAcademySite(request,env,${JSON.stringify({pages:true,branch,syntheticOnly:false})})};\n`);
    writeFileSync(config,JSON.stringify({name:'academy-pages-build',main:entry,compatibility_date:'2026-10-14'}));
    execFileSync(process.execPath,[join(repo,'backend/node_modules/wrangler/bin/wrangler.js'),'deploy','--dry-run','--config',config,'--outdir',bundle],
      {cwd:repo,stdio:'inherit',env:{...process.env,WRANGLER_SEND_METRICS:'false',WRANGLER_LOG_PATH:join(temporary,'wrangler.log')}});
    writeFileSync(join(assets,'_worker.js'),readFileSync(join(bundle,'development-pages-worker.js')));
    if(target==='feature'){
      const commit=process.env.GITHUB_SHA;if(!/^[a-f0-9]{40}$/.test(commit||''))throw Error('FEATURE_SOURCE_COMMIT_REQUIRED');
      writeFileSync(join(assets,'feature-build.json'),JSON.stringify({schema:1,branch:'feature-preview',commit})+'\n');
    }
    mkdirSync(output);cpSync(assets,output,{recursive:true});
    return {directory:output,files:report.fileCount,api:target==='split'?'https://split-db-feature_worker.maktab4life.workers.dev':target==='feature'?'https://feature_worker.maktab4life.workers.dev':'https://devrebootworker.maktab4life.workers.dev',syntheticOnly:false};
  }finally{console.log(JSON.stringify({retainedBuildDirectory:temporary,localFilesDeleted:0}));}
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)
  console.log(JSON.stringify(buildDevelopmentPages(resolve(dirname(fileURLToPath(import.meta.url)),'../..'))));
