import {readFileSync} from 'node:fs';
import {resolve,dirname,relative} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
export function academyDependencyGraph(root=resolve(dirname(fileURLToPath(import.meta.url)),'../src')){
  const pending=[resolve(root,'academy-worker-runtime.js')],visited=new Set();
  const forbidden=/(?:^|\/)(?:google-sheets|google-drive|apps-script|platform-sheet|system-config|library-upload-bridge|auth|sheets-repository|compatibility-worker|router)\.js$/;
  while(pending.length){const file=pending.pop();if(visited.has(file))continue;visited.add(file);
    const name=relative(root,file);if(forbidden.test(name)||name.startsWith('routes/'))throw Error('ACADEMY_DEPENDENCY_FORBIDDEN: '+name);
    for(const match of readFileSync(file,'utf8').matchAll(/(?:from\s*|import\s*(?:\(\s*)?)['"]([^'"]+)['"]/g))if(match[1].startsWith('.'))pending.push(resolve(dirname(file),match[1]));
  }
  return [...visited].map(f=>relative(root,f)).sort();
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){await assertAcademySourceBoundary();console.log(JSON.stringify({success:true,modules:academyDependencyGraph().length,googleBackendClients:0,sourceTreeClean:true}));}

// Scan the entire source tree too: unreachable legacy clients must not be carried
// into the next Academy workstream merely because bundling currently excludes them.
export async function assertAcademySourceBoundary(root=resolve(dirname(fileURLToPath(import.meta.url)),'../src')){
  const {readdirSync}=await import('node:fs');
  const visit=directory=>{for(const entry of readdirSync(directory,{withFileTypes:true})){
    const file=resolve(directory,entry.name);if(entry.isDirectory()){visit(file);continue;}if(!entry.name.endsWith('.js'))continue;
    const name=relative(root,file),source=readFileSync(file,'utf8');
    if(name.startsWith('routes/')||/(?:^|\/)(?:google-sheets|google-drive|apps-script|platform-sheet|library-upload-bridge|compatibility-worker|worker-runtime)\.js$/.test(name))throw Error('RETIRED_ACADEMY_SOURCE: '+name);
    if(/GOOGLE_SERVICE_ACCOUNT_JSON|PLATFORM_SPREADSHEET_ID|APPS_SCRIPT_URL|batchUpdateGoogleSheetValues|readPlatformSheet|getPlatformSpreadsheetId|oauth2\.googleapis\.com|sheets\.googleapis\.com/.test(source))throw Error('RETIRED_ACADEMY_DEPENDENCY: '+name);
  }};visit(root);return true;
}
