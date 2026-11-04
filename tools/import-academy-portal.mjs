// Transfer the reviewed public homepage source on a disposable GitHub runner.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,readdir,copyFile} from 'node:fs/promises';
import {resolve,dirname,relative} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
assert.equal(process.env.GITHUB_ACTIONS,'true');
const root=process.cwd(),source=resolve(process.env.PORTAL_STUDIO_SOURCE),sha=process.env.PORTAL_STUDIO_SHA;
assert(/^[a-f0-9]{40}$/.test(sha));assert.equal(execFileSync('git',['rev-parse','HEAD'],{cwd:source,encoding:'utf8'}).trim(),sha);
const top=new Set(['index.html','api.mjs','circles-home-entry.mjs','circles-entry.js','circles-login.mjs','circles-login.css','circles-dashboard.mjs','academy-logo.png']);
const allowed=p=>top.has(p)||p.startsWith('shared/')&&!/\.(pdf|json)$/i.test(p)||p.startsWith('circles/assets/')&&/\.(?:png|jpe?g|webp|svg|gif|ico|woff2?|ttf)$/i.test(p)||/^circles\/[^/]+\.(?:js|mjs|css)$/.test(p)&&!/(?:podcast|source|free-learning-view|mothers-subject)/.test(p);
const manifest={};let count=0;
async function walk(dir){for(const entry of await readdir(dir,{withFileTypes:true})){
 assert(!entry.isSymbolicLink());const from=resolve(dir,entry.name);if(entry.isDirectory()){await walk(from);continue;}
 const name=relative(resolve(source,'public'),from);if(!allowed(name))continue;
 const dest=resolve(root,'portal',name);await mkdir(dirname(dest),{recursive:true});await copyFile(from,dest);count++;
}}
await walk(resolve(source,'public'));
const awaitPrefix=await readFile(resolve(root,'portal-adapter/api-prefix.mjs'),'utf8');
const patch=async(path,fn)=>{const file=resolve(root,'portal',path),c=await readFile(file,'utf8');await writeFile(file,fn(c));};
await patch('index.html',c=>c.replace('<head>','<head><script src="/hosting-config.js"></script>'));
await patch('api.mjs',c=>{assert(c.includes('await fetch(path,{method,credentials:'));return (awaitPrefix)+'\n'+c.replace('await fetch(path,{method,credentials:','await portalFetch(path,{method,credentials:');});
await copyFile(resolve(root,'portal-adapter/circles-sign-in.mjs'),resolve(root,'portal/shared/circles-sign-in.mjs'));
for(const name of ['studio-authorize.mjs','studio-authorize.html','studio-enter.mjs','studio-enter.html'])await copyFile(resolve(root,'portal-adapter',name),resolve(root,'portal',name));
async function index(dir){for(const entry of await readdir(dir,{withFileTypes:true})){const file=resolve(dir,entry.name);if(entry.isDirectory())await index(file);else{const name=relative(resolve(root,'portal'),file);manifest[name]=createHash('sha256').update(await readFile(file)).digest('hex');}}}
await index(resolve(root,'portal'));
await writeFile(resolve(root,'portal/assets.json'),JSON.stringify(Object.keys(manifest).sort(),null,2)+'\n');
await writeFile(resolve(root,'portal/provenance.json'),JSON.stringify({upstream:'MaktabForlife/AcademyStudio',commit:sha,transferredSourceFiles:count,owner:'MaktabForlife/Academy',privateMediaCopied:false,manifest},null,2)+'\n');
