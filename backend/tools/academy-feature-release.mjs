// Update an existing isolated feature preview without reseeding D1 or rotating account secrets.
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {validateFeatureTarget} from './academy-feature-preview.mjs';
import {buildAcademyAssets} from './academy-assets.mjs';
import {academyDependencyGraph} from './academy-boundary.mjs';
export function prepareFeatureRelease({repo,configFile,directory}){
  repo=resolve(repo);directory=resolve(directory);if(!directory.startsWith('/private/tmp/')||existsSync(directory))throw Error('NEW_PRIVATE_RELEASE_DIRECTORY_REQUIRED');
  const config=JSON.parse(readFileSync(configFile,'utf8')),database=config.d1_databases?.find(x=>x.binding==='ACADEMY_DB');
  validateFeatureTarget({name:config.name,databaseId:database?.database_id,bucket:config.r2_buckets?.[0]?.bucket_name,accountId:config.account_id});
  if(config.name!=='academy-feature-10660'||config.d1_databases?.length!==1||config.r2_buckets.some(b=>b.bucket_name!==config.name)||config.routes?.length||config.route||config.services||config.env||config.durable_objects?.bindings?.some(b=>b.script_name||b.class_name!=='ProgramTimetableCoordinator'||b.name!=='PROGRAM_TIMETABLE_COORDINATOR'))throw Error('FEATURE_TARGET_MISMATCH');
  if(config.vars?.ACADEMY_D1_MODE!=='ACTIVE'||config.vars?.ACADEMY_LIBRARY_MODE!=='PUBLIC_ONLY')throw Error('FEATURE_STORAGE_MODE_REQUIRED');
  const graph=academyDependencyGraph();mkdirSync(directory,{mode:0o700});
  const assets=buildAcademyAssets({repo,directory:join(directory,'assets')});
  config.secrets={required:['PIN_SECRET','SESSION_SECRET']};
  config.main=join(repo,'backend/tools/feature-preview-worker.mjs');config.assets.directory=join(directory,'assets');
  // Preserve an existing key verbatim. Older previews with no namespace setting had no accessible metadata.
  config.vars.ACADEMY_OPEN_LIBRARY_STORAGE_KEY=config.vars.ACADEMY_OPEN_LIBRARY_STORAGE_KEY||
    (config.vars.PLATFORM_SPREADSHEET_ID?`${String(config.vars.PLATFORM_SPREADSHEET_ID).trim()}:open-library-metadata`:`${config.name}:open-library-metadata`);
  config.vars.ACADEMY_DEPLOYMENT_KIND='ISOLATED_PREVIEW';
  for(const name of ['PLATFORM_SPREADSHEET_ID','GOOGLE_SPREADSHEET_ID','GOOGLE_SERVICE_ACCOUNT_JSON','APPS_SCRIPT_URL','M4L_LIBRARY_BRIDGE_SECRET','M4L_GOOGLE_SERVICE_ACCOUNT_EMAIL','ACADEMY_D1_UPLOAD_BRIDGE'])delete config.vars[name];
  const version=JSON.parse(readFileSync(join(repo,'version.json'),'utf8')).version;
  const manifest={version,branch:'feature/academy-review-fixes-10660',worker:config.name,syntheticOnly:true,databaseId:database.database_id,reseeded:false,googleBackendClients:0,dependencyModules:graph.length,assets};
  writeFileSync(join(directory,'wrangler.preview.json'),JSON.stringify(config,null,2),{mode:0o600,flag:'wx'});
  writeFileSync(join(directory,'release-manifest.json'),JSON.stringify(manifest,null,2),{mode:0o600,flag:'wx'});
  return {version,worker:config.name,files:assets.fileCount,bytes:assets.bytes,googleBackendClients:0,reseeded:false};
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){const [configFile,directory]=process.argv.slice(2);console.log(JSON.stringify(prepareFeatureRelease({repo:resolve(dirname(fileURLToPath(import.meta.url)),'../..'),configFile,directory})));}
