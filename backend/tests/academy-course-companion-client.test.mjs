import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync,existsSync} from 'node:fs';
import {SURAH_KAHF_LESSONS} from '../src/academy/course-books/surah-kahf.js';
const root=new URL('../../academy/course-companion/surah-kahf/',import.meta.url),html=readFileSync(new URL('index.html',root),'utf8'),bridge=readFileSync(new URL('portal.js',root),'utf8'),reader=readFileSync(new URL('app.js',root),'utf8');
class CustomEvent extends Event{constructor(type,options){super(type);this.detail=options?.detail;}}
function element(id=''){
 const listeners=new Map(),attrs=new Map(),classes=new Set();
 return {id,textContent:'',innerHTML:'',value:'',dataset:{},hidden:false,disabled:false,open:false,style:{setProperty(){}},listeners,attrs,
 classList:{add:x=>classes.add(x),remove:x=>classes.delete(x),contains:x=>classes.has(x),toggle(x,on){if(on)classes.add(x);else classes.delete(x);}},
 addEventListener(type,fn){const list=listeners.get(type)||[];list.push(fn);listeners.set(type,list);},
 setAttribute:(k,v)=>attrs.set(k,String(v)),getAttribute:k=>attrs.get(k),removeAttribute:k=>attrs.delete(k),hasAttribute:k=>attrs.has(k),
 querySelector:()=>element(),querySelectorAll:()=>[],replaceChildren(){this.textContent='';this.innerHTML='';},focus(){},close(){this.open=false;},showModal(){this.open=true;},contains:()=>false,closest:()=>null,after(){},append(){},click(){},remove(){}};
}
function fixture({session='actor-one',fetcher=async()=>Response.json({success:false,error:'Unavailable'},{status:503})}={}){
 const elements=new Map([...html.matchAll(/id="([^"]+)"/g)].map(m=>[m[1],element(m[1])])),storage=new Map([['m4l_account_token',session]]),handlers=new Map(),documentHandlers=new Map(),calls=[];
 const body=element('body');body.classList.add('course-loading');
 const location=new URL('https://academy.invalid/academy/course-companion/surah-kahf/?course=kahf-test&workspace=LEARN#overview');location.reload=()=>{};
 const document={body,documentElement:element(),visibilityState:'visible',getElementById:id=>elements.get(id),querySelector:s=>s==='main'?elements.get('main'):element(),querySelectorAll:()=>[],createElement:()=>element(),addEventListener:(type,fn)=>{const list=documentHandlers.get(type)||[];list.push(fn);documentHandlers.set(type,list);}};
 const window={location,M4L_CONFIG:{API_BASE:'https://api.invalid'},M4L_ACADEMY_WORKSPACE:{readyPublication:async()=>{},homeUrl:()=>'/academy/#timetable/learn',audience:()=>'LEARN'},M4L_LESSON_MEDIA:{reset(){},canLeave:()=>true,openAttachment(){}},addEventListener(type,fn){const list=handlers.get(type)||[];list.push(fn);handlers.set(type,list);},dispatchEvent(event){for(const fn of handlers.get(event.type)||[])fn(event);},scrollTo(){}};
 const objectUrls=[],downloads=[];
 class TestURL extends URL{static createObjectURL(blob){const url='blob:fixture-'+objectUrls.length;objectUrls.push({url,blob,revoked:false});return url;}static revokeObjectURL(url){const entry=objectUrls.find(e=>e.url===url);if(entry)entry.revoked=true;}}
 document.createElement=()=>({...element(),click(){downloads.push({href:this.href,name:this.download});}});
 const context=vm.createContext({window,document,location,history:{replaceState(_,__,hash){location.hash=hash;}},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,String(v))},CustomEvent,Event,DOMException,AbortController,URL:TestURL,URLSearchParams,Blob,Response,requestAnimationFrame:fn=>fn(),setTimeout:()=>1,fetch:async(url,options)=>{calls.push({url,options});return fetcher(url,options);}});
 return {elements,storage,window,body,location,context,calls,objectUrls,downloads,click(target){for(const fn of documentHandlers.get('click')||[])fn({target,preventDefault(){}});},run:()=>vm.runInContext(bridge,context),reader:()=>vm.runInContext(reader,context)};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const feed=()=>({success:true,activityName:'Surah Al Kahf',lessons:[],sessions:[],courseFiles:null,courseCompanion:{lessons:SURAH_KAHF_LESSONS,readerKey:'verified-course-owner',pdf:{lessonId:'book',assetId:'pdf'}}});
test('the static Academy package holds a shell without the protected readings or PDF',()=>{
 for(const name of ['course-content.js','verses.js','assets/surah-al-kahf-course.pdf','assets/verses.json'])assert.equal(existsSync(new URL(name,root)),false);
 assert.doesNotMatch(html,/Whoever memorises ten|booklet p\.|view the original|#page=/i);
 assert.match(html,/data-course-pdf download/);assert.match(html,/id="print-reading"/);
 for(const id of [...bridge.matchAll(/\$\('([^']+)'\)/g)].map(m=>m[1]))assert.match(html,new RegExp('id="'+id+'"'));
});
test('a signed-out visitor gets a sign-in message before any course request',async()=>{
 const f=fixture({session:''});f.run();await tick();assert.equal(f.calls.length,0);assert.equal(f.body.classList.contains('course-loading'),true);assert.match(f.elements.get('course-gate-message').textContent,/Sign in/);assert.equal(f.window.KAHF_LESSONS,null);
});
test('an account switch while the course response is delayed never reveals the previous account text',async()=>{
 let finish;const f=fixture({fetcher:()=>new Promise(resolve=>{finish=resolve;})});f.run();await tick();assert.equal(f.calls.length,1);
 f.storage.set('m4l_account_token','actor-two');f.window.dispatchEvent(Object.assign(new Event('storage'),{key:'m4l_account_token'}));finish(Response.json(feed()));await tick();await tick();
 assert.equal(f.body.classList.contains('course-loading'),true);assert.equal(f.window.KAHF_LESSONS,null);assert.equal(f.elements.get('main').innerHTML,'');
});
test('the authorised course opens all lessons and confines reflection storage to its verified owner',async()=>{
 const f=fixture({fetcher:async url=>Response.json(String(url).endsWith('/feed')?feed():{success:true,signedIn:true,startDate:'2026-10-25',activity:{kind:'COURSE',id:'kahf-test'},personalTimetable:[]})});
 f.run();f.reader();await tick();await tick();assert.equal(f.body.classList.contains('course-loading'),false);assert.equal(f.window.KAHF_LESSONS.length,11);assert.equal(f.window.KAHF_APP_STARTED,true);
 assert.equal(f.calls.length,2);assert.equal(JSON.parse(f.calls[0].options.body).includeCourseCompanion,true);assert.equal(f.calls[0].options.headers.Authorization,'Bearer actor-one');
 f.location.hash='#lesson/praise-guidance';f.window.dispatchEvent(new Event('hashchange'));
 assert.match(f.elements.get('lesson-content').innerHTML,/قَيِّم/);assert.doesNotMatch(f.elements.get('lesson-content').innerHTML,/booklet|\bPDF\b|#page=/i);
 const note=f.elements.get('reflection');note.value='My reflection';for(const fn of note.listeners.get('input'))fn();
 assert.equal(f.storage.get('kahf-course-verified-course-owner-note-praise-guidance-general'),'My reflection');assert.equal(f.storage.get('kahf-course-note-praise-guidance-general'),undefined);
 f.window.dispatchEvent(new Event('m4l-academy-session-ended'));assert.equal(f.elements.get('main').innerHTML,'');assert.equal(f.window.KAHF_LESSONS,null);
});
test('dashboard links preserve the workspace and leave Admin management destinations alone',()=>{
 const source=readFileSync(new URL('../../js/m4l-course-companion.js',import.meta.url),'utf8'),window={M4L_ACADEMY_WORKSPACE:{current:()=>'LEARN',head:()=>'accepted-head'}};vm.runInNewContext(source,{window,URLSearchParams});
 const course={kind:'COURSE',id:'real-course-id',name:'Surah Al Kahf'},helper=window.M4L_COURSE_COMPANION;
 assert.equal(helper.href(course),'/academy/course-companion/surah-kahf/?course=real-course-id&workspace=LEARN&setup=accepted-head#overview');assert.match(helper.href(course,'assessment'),/#assessments$/);
 assert.equal(helper.href(course,'lesson-media','teach'),'');for(const workspace of ['TEACH','ADMIN_TEACH']){window.M4L_ACADEMY_WORKSPACE.current=()=>workspace;assert.equal(helper.href(course,'lesson-media'),'');}
 window.M4L_ACADEMY_WORKSPACE.current=()=>'ADMIN';assert.equal(helper.href(course),'');window.M4L_ACADEMY_WORKSPACE.current=()=>'ADMIN_LEARN';assert.match(helper.href(course),/workspace=ADMIN_LEARN/);window.M4L_ACADEMY_WORKSPACE.classView=()=>({activityKey:'COURSE:real-course-id',classId:'selected-class'});assert.match(helper.href(course),/studentClass=selected-class/);
 assert.equal(helper.href({...course,name:'Another course'}),'');assert.equal(helper.href(course,'attendance'),'');
});

function pdfFeed(){const data=feed();data.courseFiles={media:{id:'book',state:'PUBLISHED',assets:[{id:'pdf',kind:'PDF',filename:'surah-kahf.pdf'}]}};return data;}
const pdfLink=()=>{const link=element();link.setAttribute('download','');return {link,target:{closest:selector=>selector==='[data-course-pdf]'?link:null}};};
const timetable=()=>({success:true,signedIn:true,startDate:'2026-10-25',activity:{kind:'COURSE',id:'kahf-test'},personalTimetable:[]});
test('a course PDF download is freshly authorised and its temporary URL is cleared on account change',async()=>{
 const f=fixture({fetcher:async url=>String(url).endsWith('/download')?new Response('%PDF-fixture',{headers:{'Content-Type':'application/pdf'}}):Response.json(String(url).endsWith('/feed')?pdfFeed():timetable())});
 f.run();await tick();await tick();const {target}=pdfLink();f.click(target);await tick();await tick();
 const request=f.calls.find(c=>String(c.url).endsWith('/download'));assert.ok(request);assert.equal(request.options.headers.Authorization,'Bearer actor-one');assert.deepEqual(JSON.parse(request.options.body),{activityKey:'COURSE:kahf-test',lessonId:'book',assetId:'pdf'});
 assert.equal(f.downloads.length,1);assert.equal(f.downloads[0].name,'surah-kahf.pdf');assert.equal(f.objectUrls[0].blob.type,'application/pdf');
 f.storage.set('m4l_account_token','actor-two');f.window.dispatchEvent(Object.assign(new Event('storage'),{key:'m4l_account_token'}));assert.equal(f.objectUrls[0].revoked,true);
});
test('a delayed PDF is discarded when the Academy account changes before delivery',async()=>{
 let deliver;const f=fixture({fetcher:async url=>String(url).endsWith('/download')?new Promise(resolve=>{deliver=resolve;}):Response.json(String(url).endsWith('/feed')?pdfFeed():timetable())});
 f.run();await tick();await tick();f.click(pdfLink().target);await tick();assert.equal(typeof deliver,'function');
 f.storage.set('m4l_account_token','actor-two');f.window.dispatchEvent(Object.assign(new Event('storage'),{key:'m4l_account_token'}));deliver(new Response('%PDF-fixture',{headers:{'Content-Type':'application/pdf'}}));await tick();await tick();
 assert.equal(f.downloads.length,0);assert.equal(f.objectUrls.length,0);assert.equal(f.body.classList.contains('course-loading'),true);
});
test('a fresh access denial removes already mounted readings',async()=>{
 let denied=false;const f=fixture({fetcher:async url=>String(url).endsWith('/feed')?Response.json(denied?{success:false,error:'Course access has ended.'}:pdfFeed(),{status:denied?403:200}):Response.json(timetable())});
 f.run();f.reader();await tick();await tick();assert.equal(f.body.classList.contains('course-loading'),false);denied=true;for(const fn of f.elements.get('refresh-materials').listeners.get('click'))fn();await tick();await tick();
 assert.equal(f.body.classList.contains('course-loading'),true);assert.equal(f.window.KAHF_LESSONS,null);assert.equal(f.elements.get('main').innerHTML,'');assert.match(f.elements.get('course-gate-message').textContent,/access has ended/);
});
