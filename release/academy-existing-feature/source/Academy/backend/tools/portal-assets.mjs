import {readFileSync,writeFileSync,mkdirSync,copyFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {hosting} from '../src/academy/hosting.mjs';
export function copyPortalAssets(repo,directory){
 const release=JSON.parse(readFileSync(resolve(repo,'version.json'),'utf8')).version;
 const files=JSON.parse(readFileSync(resolve(repo,'portal/assets.json'),'utf8'));
 if(!Array.isArray(files)||files.length>350)throw Error('Review portal asset manifest.');
 for(const file of files){if(typeof file!=='string'||file.startsWith('/')||file.split('/').some(p=>!p||p.startsWith('.')))throw Error('Invalid portal asset.');
  const dest=resolve(directory,file);mkdirSync(dirname(dest),{recursive:true});if(file.endsWith('.html'))writeFileSync(dest,readFileSync(resolve(repo,'portal',file),'utf8').replace(/(<meta name="academy-release-version" content=")[^"]+("\s*\/?>)/,(_m,a,b)=>a+release+b));else copyFileSync(resolve(repo,'portal',file),dest);
 }
 const configuration='globalThis.AcademyHosting=Object.freeze('+JSON.stringify(hosting())+');\n';
 writeFileSync(resolve(directory,'hosting-config.js'),configuration);
 mkdirSync(resolve(directory,'portal'),{recursive:true});
 for(const file of ['studio-authorize.mjs','studio-enter.mjs'])copyFileSync(resolve(repo,'portal',file),resolve(directory,'portal',file));
 return files.length;
}
