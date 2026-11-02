import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const {parseHTML}=createRequire(import.meta.url)('linkedom');
const menu=readFileSync(new URL('../../js/m4l-academy-admin-menu.js',import.meta.url),'utf8'),catalogue=readFileSync(new URL('../../js/m4l-learning-catalogue.js',import.meta.url),'utf8');
const settle=async()=>{for(let i=0;i<8;i++)await new Promise(r=>setImmediate(r));};
const memory=()=>{const data=new Map();return{getItem:key=>data.get(key)||null,setItem:(key,v)=>data.set(key,v),removeItem:key=>data.delete(key)};};
function fixture(path='/academy/subjects/',search=''){
 const page=path==='/programs/'?'programs/index.html':path.includes('/courses/')?'academy/courses/manage/index.html':'academy/subjects/index.html';
 const {window,document}=parseHTML(readFileSync(new URL('../../'+page,import.meta.url),'utf8'));
 const banner=document.createElement('div');banner.className='academy-banners';document.body.prepend(banner);
 const location={pathname:path,search,hash:'',host:'localhost'},sessionStorage=memory(),calls=[];let mode='ADMIN';
 window.M4L_ACADEMY_WORKSPACE={current:()=>mode};window.history={replaceState(_a,_b,url){const next=new URL(url,'http://localhost');location.pathname=next.pathname;location.search=next.search;}};
 const data={success:true,viewerAccountId:'admin-A',modulesReady:true,emptyRevision:'0',subjects:[{SubjectID:'subject-one',SubjectName:'Sample subject',Active:true,Revision:'1',usedIn:[]}],modules:[{id:'module-one',name:'Sample module',subjectId:'subject-one',subjectName:'Sample subject',active:true,revision:'1',usedIn:[]}]};
 const context=vm.createContext({window,document,location,sessionStorage,localStorage:{getItem:()=> 'synthetic-admin'},URL,URLSearchParams,crypto,Event:window.Event,console,fetch:async(url)=>{calls.push(url);return Response.json(data);},Response});
 vm.runInContext(menu,context);
 return{window,document,location,calls,sessionStorage,menu:window.M4L_ACADEMY_ADMIN_MENU,loadCatalogue(){vm.runInContext(catalogue,context);},mode(value){mode=value;}};
}
const admin={signedIn:true,globalAdmin:true,workspaceAccess:{admin:true},personalActivities:[]};
test('Programs and Courses share the native Subjects/Modules row without replacing its controls',()=>{
 const f=fixture(),button=f.document.getElementById('lc-subjects');let clicked=0;button.onclick=()=>clicked++;
 f.menu.update(admin);f.menu.update(admin);const nav=f.document.querySelector('#lc-workspace .lc-tabs');assert.deepEqual([...nav.children].map(n=>n.textContent),['Subjects','Modules','Programs','Courses']);assert.equal(nav.children[2].getAttribute('href'),'/programs/');assert.equal(nav.children[3].getAttribute('href'),'/academy/courses/manage/');assert(f.document.querySelector('.academy-admin-tools .academy-curriculum-tabs').hidden);assert.equal(f.document.getElementById('lc-subjects'),button);button.click();assert.equal(clicked,1);assert.equal(f.calls.length,0);
});
test('Program and Course pages retain one local Curriculum row with exact existing destinations',()=>{
 for(const [path,current]of [['/programs/','programs'],['/academy/courses/manage/','courses']]){const f=fixture(path);f.menu.update(admin);const nav=f.document.querySelector('main > .academy-curriculum-local');assert(nav);assert.deepEqual([...nav.children].map(n=>n.textContent),['Subjects','Modules','Programs','Courses']);assert.equal(nav.querySelector('[aria-current=page]').dataset.curriculumArea,current);assert.equal(nav.querySelector('[data-curriculum-area=modules]').getAttribute('href'),'/academy/subjects/?section=modules');assert(f.document.querySelector('.academy-admin-tools .academy-curriculum-tabs').hidden);assert.equal(f.calls.length,0);}
});
test('scoped Admin visibility, workspace changes and account reset remove unavailable local links',()=>{
 const f=fixture('/programs/');f.menu.update({signedIn:true,workspaceAccess:{admin:true},personalActivities:[{kind:'PROGRAM',roles:['PROGRAM_ADMIN']},{kind:'COURSE',roles:['STUDENT']}]});assert.deepEqual([...f.document.querySelector('.academy-curriculum-local').children].map(n=>n.textContent),['Programs']);f.mode('LEARN');f.menu.update();assert.equal(f.document.querySelector('.academy-curriculum-local'),null);f.mode('ADMIN');f.menu.update(admin);f.window.dispatchEvent(new f.window.Event('m4l-academy-session-ended'));assert.equal(f.document.querySelector('.academy-curriculum-local'),null);assert(f.document.querySelector('.academy-admin-tools').hidden);assert.equal(f.calls.length,0);
});
test('a direct Modules link opens Modules using the existing single catalogue read',async()=>{
 const f=fixture('/academy/subjects/','?section=modules');f.menu.update(admin);f.loadCatalogue();await settle();assert.equal(f.document.getElementById('lc-modules').getAttribute('aria-pressed'),'true');assert.match(f.document.getElementById('lc-rows').textContent,/Sample module/);assert.equal(f.calls.length,1);f.document.getElementById('lc-subjects').click();assert.equal(f.location.search,'');f.document.getElementById('lc-modules').click();assert.equal(f.location.search,'?section=modules');assert.equal(f.calls.length,1);
});
test('the native unfinished-entry guard still prevents a tab change and preserves its URL',async()=>{
 const f=fixture('/academy/subjects/','?section=modules');f.loadCatalogue();await settle();f.document.getElementById('lc-add').click();f.document.getElementById('lc-subjects').click();assert.match(f.document.getElementById('lc-message').textContent,/Save or discard/);assert.equal(f.document.getElementById('lc-modules').getAttribute('aria-pressed'),'true');assert.equal(f.location.search,'?section=modules');assert.equal(f.calls.length,1);
});
test('a restored unfinished Subject entry takes precedence over a Modules deep link',async()=>{
 const f=fixture('/academy/subjects/','?section=modules');f.sessionStorage.setItem('m4l-learning-catalogue-v2:localhost:admin-A',JSON.stringify({tab:'subjects',edit:{kind:'subject',id:'',name:'Unfinished subject',active:true,baseRevision:''},pending:null}));f.loadCatalogue();await settle();assert.equal(f.document.getElementById('lc-subjects').getAttribute('aria-pressed'),'true');assert.equal(f.document.querySelector('[data-field=name]').value,'Unfinished subject');assert.equal(f.calls.length,1);
});
