import './preserve-local-files.mjs';
import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {versionPublicAssets} from './version-public-assets.mjs';
const root=resolve(import.meta.dirname,'..'),version=process.argv[2];
assert(/^\d+\.\d+$/.test(version||''),'Choose the reviewed release version');
const target=resolve(root,'release/v'+version+'/public');
try{await readFile(resolve(root,'release/v'+version+'/manifest.json'));throw Error('Release already exists; keep it and use a fresh retained candidate');}catch(e){if(e.code!=='ENOENT')throw e;}
const sourceVersionCommit=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
const {buildDevelopmentPages}=await import('../backend/tools/academy-pages-build.mjs');
const built=buildDevelopmentPages(root,{branch:'studio_dev'});
await mkdir(target,{recursive:true});
async function copy(from,to){for(const e of await readdir(from,{withFileTypes:true})){assert(!e.isSymbolicLink());const source=resolve(from,e.name),dest=resolve(to,e.name);if(e.isDirectory()){await mkdir(dest,{recursive:true});await copy(source,dest);}else await writeFile(dest,await readFile(source));}}
await copy(built.directory,target);
const assets=await versionPublicAssets(target);
const manifest={version,repository:'MaktabForlife/Academy',sourceVersionCommit,publicFiles:assets.files,prefix:assets.prefix,manifest:assets.manifest,verificationSeconds:[43200,43200,60],manualMediaAttachment:true,manualMediaPublication:true};
await writeFile(resolve(root,'release/v'+version+'/manifest.json'),JSON.stringify(manifest,null,2)+'\n');
await writeFile(resolve(root,'release/current.json'),JSON.stringify({version,manifest:'release/v'+version+'/manifest.json'},null,2)+'\n');
console.log(JSON.stringify({version,baseFiles:assets.files-assets.versionedAssets,publicFiles:assets.files,prefix:assets.prefix,localFilesDeleted:0}));
