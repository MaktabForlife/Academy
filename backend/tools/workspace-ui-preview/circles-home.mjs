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
const connectedFiles=new Set(['shared/circles-workspaces.css','shared/assets/fonts.css','shared/assets/arabic-font.css','shared/assets/amiri-regular.ttf',...Array.from({length:5},(_,i)=>'shared/assets/course-font-'+(i+1)+'.ttf'),'circles-login.mjs','circles-dashboard.mjs','api.mjs',
 'shared/pin-entry.mjs','shared/account-history.mjs','shared/header-icons.mjs',
 'shared/header-dates.mjs','shared/remembered-accounts.mjs','shared/model.mjs',
 'shared/circles-block-navigation.mjs','shared/circles-dashboard-view.mjs',
 'shared/circles-course-row.mjs','shared/circles-sign-in.mjs']);

export function circlesPublicFile(publicRoot,pathname){
 const relative=connectedFiles.has(pathname.slice(1))?pathname.slice(1):pathname==='/circles-login.css'?'circles-login.css':
  ['/', '/index.html','/circles/'].includes(pathname)?'index.html':
  pathname.startsWith('/circles/')?pathname.slice(1):'';
 if(!relative)return null;
 const item=relative.slice('circles/'.length);
 const allowed=connectedFiles.has(relative)||relative==='index.html'||relative==='circles-login.css'||
  relative.startsWith('circles/')&&(homepageFiles.has(item)||
   /^assets\/[\w./-]+\.(?:png|jpe?g|webp|svg)$/i.test(item));
 if(!allowed||relative.split('/').includes('..'))return null;
 const base=realpathSync(publicRoot),file=realpathSync(path.resolve(base,relative));
 return file.startsWith(base+path.sep)?file:null;
}

export function circlesHomepage(file,{dashboard=false}={}){
 const source=readFileSync(file,'utf8');
 const original=source.match(/<script type="module">if\(!window\.AcademyCirclesRedirecting\)await import\("\/circles-login\.mjs(?:\?v=[0-9.]+)?"\);<\/script>/)?.[0];
 if(!original)throw new Error('The released Circles homepage entry changed; review its preview adapter.');
 return source.replace('<html lang="en">','<html lang="en" data-workspace-preview-dashboard="'+dashboard+'">').replace(original,'<script type="module" src="/__preview/circles-login.js"></script>'+(dashboard?'':'<script type="module" src="/__preview/home-editor.js"></script>'))
  .replace('</head>','<link rel="stylesheet" href="/academy/course-websites/assets/fonts.css"><link rel="stylesheet" href="/academy/course-websites/assets/arabic-font.css">'+(dashboard?'':'<link rel="stylesheet" href="/__preview/home-editor.css"><link rel="stylesheet" href="/__preview/homepage-review.css">')+'</head>');
}

export const previewLogin=String.raw`
// No production sign-in or role grant: these links select disposable local fixtures.
let chooser;
function unavailableOffline(){
 let notice=document.getElementById('preview-unavailable');
 if(!notice){notice=document.createElement('dialog');notice.id='preview-unavailable';notice.className='circles-sign-in';notice.setAttribute('aria-labelledby','preview-unavailable-title');notice.innerHTML='<button type="button" class="circles-sign-in-close" aria-label="Close offline notice">×</button><h2 id="preview-unavailable-title">Offline review</h2><p>This classroom is unavailable in the offline review.</p>';notice.querySelector('button').onclick=()=>notice.close();document.body.append(notice);}
 if(!notice.open)notice.showModal();
}
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
 const switcher=event.target.closest('[data-circles-switch-user]');
 if(switcher){event.preventDefault();event.stopImmediatePropagation();openPreviewLogin();return;}
 const website=event.target.closest('[data-circles-visit-website]');
 if(website){event.preventDefault();event.stopImmediatePropagation();location.assign('/?public=1');return;}
 const home=event.target.closest('[data-circles-home]');
 if(home){event.preventDefault();event.stopImmediatePropagation();location.assign('/?previewDashboard=1');return;}
 const content=event.target.closest('a[href]'),contentPath=content&&new URL(content.href,location.href).pathname;
 if(content&&/^\/(?:studio\/|circles\/(?:free-learning\.html|prospectus-2027\.html|academy\/))/.test(contentPath)){event.preventDefault();event.stopImmediatePropagation();unavailableOffline();return;}
 const target=event.target.closest('[data-access-login],[data-circles-login],[data-action="dashboard"],[data-action="academy"],[data-action="collection"],[data-action="course"]');
 if(!target)return;
 if(localStorage.getItem('m4l_account_token')){
  if(target.matches('button.public-login'))return;
  event.preventDefault();event.stopImmediatePropagation();location.assign('/?previewDashboard=1');return;
 }
 event.preventDefault();event.stopImmediatePropagation();openPreviewLogin();
},true);
const requestedLogin=window.AcademyCirclesEntry?.login;
if(window.AcademyCirclesEntry)window.AcademyCirclesEntry.login=false;
await import('/circles-login.mjs');
for(const field of document.querySelectorAll('#circles-sign-in-form input,#circles-sign-in-form button'))field.disabled=true;
if(requestedLogin)openPreviewLogin();
`;

export const previewWebsiteReturn=String.raw`
(()=>{
 const entrance=/^\/academy\/(?:admin\/)?(?:index\.html)?$/.test(location.pathname);
 const returnToWebsite=()=>{
  if(entrance&&(!localStorage.getItem('m4l_account_token')||location.hash==='#website'))location.replace('/?public=1');
  else if(entrance&&location.hash==='#dashboard')location.replace('/?previewDashboard=1');
 };
 returnToWebsite();
 window.addEventListener('m4l-academy-session',returnToWebsite);
 window.addEventListener('hashchange',returnToWebsite);
})();
`;
