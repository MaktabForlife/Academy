// Academy publish allowlist. Offline tooling and legacy applications never enter this artifact.
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync,lstatSync,realpathSync,existsSync} from 'node:fs';
import {resolve,join,dirname,extname,posix} from 'node:path';
const roots=['academy','account','programs','users','pdf-viewer','recorder','activities','icons','images'];
const retired=new Set(['programs/library.html','programs/library-view.html']);
const retirement='<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Academy Library</title></head><body><main><h1>Academy Library</h1><p>Private Library media is not available yet.</p><p><a href="/academy/open-library/">Browse the public Library</a></p><p><a href="/academy/">Academy home</a></p></main></body></html>';
export function buildAcademyAssets({repo,directory,isolated=true}){
  repo=realpathSync(repo);directory=resolve(directory);
  if(directory===repo||!directory.startsWith('/private/tmp/'))throw Error('PRIVATE_BUILD_DIRECTORY_REQUIRED');
  mkdirSync(directory,{recursive:true,mode:0o700});
  const tracked=execFileSync('git',['ls-files','-z','--',...roots],{cwd:repo,encoding:'utf8'}).split('\0').filter(file=>file&&!file.split('/').some(p=>p.startsWith('.')));
  const pending=[...tracked,'version.json','js/version.json','ummabbadacademy.png','academy.png','logo.png','favicon.ico'],written=new Map();
  while(pending.length){
    const file=pending.shift();if(written.has(file))continue;
    if(file.startsWith('../')||file.startsWith('/')||file.split('/').some(p=>p.startsWith('.')))throw Error('INVALID_ASSET_PATH');
    const source=join(repo,file);if(!existsSync(source))throw Error('MISSING_ACADEMY_ASSET: '+file);
    const info=lstatSync(source);if(!info.isFile()||realpathSync(source)!==source||info.size>25*1024*1024)throw Error('INVALID_PUBLIC_ASSET');
    let bytes=retired.has(file)?Buffer.from(retirement):readFileSync(file==='js/m4l-config.js'?join(repo,'js/m4l-academy-config.js'):source);
    if(file.endsWith('.html')&&isolated)bytes=Buffer.from(bytes.toString().replace(/<head>/i,'<head>\n<meta name="robots" content="noindex,nofollow">'));
    const target=join(directory,file);mkdirSync(dirname(target),{recursive:true});writeFileSync(target,bytes,{mode:0o600});written.set(file,bytes.length);
    if(!['.html','.js','.mjs','.css','.json'].includes(extname(file)))continue;
    const text=bytes.toString();
    // Follow actual local resources, module imports and fixed dynamic asset paths.
    const candidates=[...text.matchAll(/(?:src|href)\s*=\s*["']([^"']+)["']/g),...text.matchAll(/["'`]((?:\.?\.?\/|\/)[^"'`\s${}<>]+\.(?:js|mjs|css|json|png|jpg|jpeg|svg|webp|ico|ttf|woff2?|pdf)(?:\?[^"'`\s]*)?)["'`]/g)].map(m=>m[1]);
    for(const value of candidates){
      if(value.startsWith('//')||/^[a-z]+:/i.test(value))continue;
      const raw=value.split(/[?#]/)[0];if(!raw)continue;
      const resource=posix.normalize(raw.startsWith('/')?raw.slice(1):posix.join(posix.dirname(file),raw));
      if(!/\.[a-z0-9]+$/i.test(resource))continue;
      if(existsSync(join(repo,resource))&&lstatSync(join(repo,resource)).isFile()){
        if(resource.startsWith('backend/')||resource.startsWith('apps-script/')||resource.startsWith('docs/')||['app.js'].includes(resource))throw Error('LEGACY_ASSET_DEPENDENCY: '+resource);
        pending.push(resource);
      }
    }
  }
  return {files:[...written.keys()].sort(),fileCount:written.size,bytes:[...written.values()].reduce((a,b)=>a+b,0)};
}
