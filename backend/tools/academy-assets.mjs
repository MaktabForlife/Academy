// Academy publish allowlist. Offline tooling and legacy applications never enter this artifact.
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync,lstatSync,realpathSync,existsSync} from 'node:fs';
import {resolve,join,dirname,extname,posix} from 'node:path';
import {tmpdir} from 'node:os';
const roots=['academy','account','programs','users','pdf-viewer','recorder','activities','icons','images'];
import {academyCirclesPages,academyCirclesFragments,academyRetiredPages} from './academy-circles-routes.mjs';
const retiredRenderers=new Set(['js/m4l-academy-dashboard.js','js/m4l-academy-catalogue.js','css/m4l-academy-home.css']);
export function academyPublishableAsset(file){
 if(retiredRenderers.has(file))throw Error('RETIRED_ACADEMY_RENDERER_DEPENDENCY: '+file);
 if(file.startsWith('academy/dashboard-design/')||academyRetiredPages.has(file))return false;
 if(file.endsWith('.html')&&!academyCirclesPages.has(file))throw Error('UNAPPROVED_ACADEMY_HTML: '+file);
 if(file.endsWith('.fragment')&&!academyCirclesFragments.has(file))throw Error('UNAPPROVED_ACADEMY_FRAGMENT: '+file);
 return true;
}
const nonUIHTML=new Set(['academy/website-platform/connect/index.html','academy/website-studio/connect/index.html','academy/website-studio/session/index.html','academy/hifz/index.html','pdf-viewer/web/viewer.html']);
export function validateCirclesPresentation(file,text){
 if(academyCirclesFragments.has(file)&&/<!doctype|<\/?(?:html|head|body|script)\b/i.test(text))throw Error('ACADEMY_FRAGMENT_IS_A_PAGE: '+file);
 if(file.endsWith('.html')&&!nonUIHTML.has(file)){
  if(!/<html\b[^>]*\bdata-circles-native=["']true["']/i.test(text)||!text.includes('/js/m4l-circles-native.js'))throw Error('ACADEMY_CIRCLES_SHELL_REQUIRED: '+file);
 }
 if(['academy/index.html','academy/admin/index.html'].includes(file)&&/\bid=["'](?:overview|dashboard|about|contact|prospectus|workshops)["']/i.test(text))throw Error('ACADEMY_LEGACY_VIEW_IN_BUNDLE: '+file);
}
export function buildAcademyAssets({repo,directory,isolated=true,target='development'}){
  repo=realpathSync(repo);directory=resolve(directory);
  if(!['development','feature','split'].includes(target))throw Error('ACADEMY_ASSET_TARGET_REQUIRED');
  if(directory===repo||!['/private/tmp/',resolve(tmpdir())+'/'].some(root=>directory.startsWith(root)))throw Error('PRIVATE_BUILD_DIRECTORY_REQUIRED');
  mkdirSync(directory,{recursive:true,mode:0o700});
  const tracked=execFileSync('git',['ls-files','-z','--',...roots],{cwd:repo,encoding:'utf8'}).split('\0').filter(file=>file&&existsSync(join(repo,file))&&!file.split('/').some(p=>p.startsWith('.'))&&academyPublishableAsset(file));
  const pending=[...tracked,'version.json','js/version.json','ummabbadacademy.png','academy.png','logo.png','favicon.ico','js/vendor/pdf-lib-LICENSE.md','js/vendor/pdfjs/LICENSE'],written=new Map();
  while(pending.length){
    const file=pending.shift();if(written.has(file))continue;
    if(!academyPublishableAsset(file))continue;
    if(file.startsWith('../')||file.startsWith('/')||file.split('/').some(p=>p.startsWith('.')))throw Error('INVALID_ASSET_PATH');
    const source=join(repo,file);if(!existsSync(source))throw Error('MISSING_ACADEMY_ASSET: '+file);
    const info=lstatSync(source);if(!info.isFile()||realpathSync(source)!==source||info.size>25*1024*1024)throw Error('INVALID_PUBLIC_ASSET');
    const config=target==='split'?'js/m4l-split-academy-config.js':target==='feature'?'js/m4l-feature-academy-config.js':'js/m4l-development-academy-config.js';
    let bytes=readFileSync(file==='js/m4l-config.js'?join(repo,config):source);
    if(file.endsWith('.html')||file.endsWith('.fragment'))validateCirclesPresentation(file,bytes.toString());
    if(file.endsWith('.html')&&isolated)bytes=Buffer.from(bytes.toString().replace(/<head>/i,'<head>\n<meta name="robots" content="noindex,nofollow">'));
    const destination=join(directory,file);mkdirSync(dirname(destination),{recursive:true});writeFileSync(destination,bytes,{mode:0o600});written.set(file,bytes.length);
    if(!['.html','.fragment','.js','.mjs','.css','.json'].includes(extname(file)))continue;
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
