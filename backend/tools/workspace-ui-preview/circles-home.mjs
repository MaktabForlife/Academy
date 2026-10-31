// Preview-only adapter. Read the released public design without editing its bundle
// or starting the separately owned Studio identity/content services.
import {readFileSync,realpathSync} from 'node:fs';
import path from 'node:path';

const homepageFiles=new Set([
 'index.html','style.css','circle-mobile.css','academy-brand.css',
 'academy-branches.css','public-circle-hero.css','mothers-library.css',
 'free-learning-art.css','memorisation.css','flyer-gallery.css',
 'app.js','mothers-library.js','mothers-timetable.js',
 'free-learning-catalogue.js','free-learning.js','memorisation-catalogue.js',
 'memorisation.js','prospectus-2027.js','homepage-layout.js'
]);

export function circlesPublicFile(publicRoot,pathname){
 const relative=pathname==='/circles-login.css'?'circles-login.css':
  ['/', '/index.html','/circles/'].includes(pathname)?'index.html':
  pathname.startsWith('/circles/')?pathname.slice(1):'';
 if(!relative)return null;
 const item=relative.slice('circles/'.length);
 const allowed=relative==='index.html'||relative==='circles-login.css'||
  relative.startsWith('circles/')&&(homepageFiles.has(item)||
   /^assets\/[\w./-]+\.(?:png|jpe?g|webp|svg)$/i.test(item));
 if(!allowed||relative.split('/').includes('..'))return null;
 const base=realpathSync(publicRoot),file=realpathSync(path.resolve(base,relative));
 return file.startsWith(base+path.sep)?file:null;
}

export function circlesHomepage(file){
 const source=readFileSync(file,'utf8');
 const original='<script type="module">if(!window.AcademyCirclesRedirecting)await import("/circles-login.mjs");</script>';
 if(!source.includes(original))throw new Error('The released Circles homepage entry changed; review its preview adapter.');
 return source.replace(original,'<script type="module" src="/__preview/circles-login.js"></script><script type="module" src="/__preview/home-editor.js"></script>')
  .replace('</head>','<link rel="stylesheet" href="/academy/course-websites/assets/fonts.css"><link rel="stylesheet" href="/academy/course-websites/assets/arabic-font.css"><link rel="stylesheet" href="/__preview/home-editor.css"></head>');
}

export const previewLogin=String.raw`
// No production sign-in or role grant: these links select disposable local fixtures.
let chooser;
function openPreviewLogin(){
 document.querySelector('#detail[open]')?.close();
 if(!chooser){
  chooser=document.createElement('dialog');
  chooser.className='circles-sign-in';
  chooser.setAttribute('aria-labelledby','preview-sign-in-title');
  chooser.innerHTML='<button type="button" class="circles-sign-in-close" aria-label="Close sample account chooser">×</button><p class="eyebrow">Offline workspace review</p><h2 id="preview-sign-in-title">Choose a sample account</h2><p>Review the dashboard and programme workspaces with sample records.</p><nav aria-label="Sample sign-in"><a class="btn" href="/__signin/studentA">Student account</a><a class="btn outline" href="/__signin/teacherA">Teacher account</a><a class="btn outline" href="/__signin/global">Global Admin account</a></nav>';
  chooser.querySelector('button').addEventListener('click',()=>chooser.close());
  document.body.append(chooser);
 }
 if(!chooser.open)chooser.showModal();
}
document.addEventListener('click',event=>{
 const target=event.target.closest('[data-access-login],[data-circles-login],[data-action="dashboard"],[data-action="academy"],[data-action="collection"],[data-action="course"]');
 if(!target)return;
 event.preventDefault();event.stopImmediatePropagation();openPreviewLogin();
},true);
if(window.AcademyCirclesEntry?.login)openPreviewLogin();
`;

export const previewWebsiteReturn=String.raw`
(()=>{
 const entrance=/^\/academy\/(?:admin\/)?(?:index\.html)?$/.test(location.pathname);
 const returnToWebsite=()=>{
  if(entrance&&(!localStorage.getItem('m4l_account_token')||location.hash==='#website'))location.replace('/');
 };
 returnToWebsite();
 window.addEventListener('m4l-academy-session',returnToWebsite);
 window.addEventListener('hashchange',returnToWebsite);
})();
`;
