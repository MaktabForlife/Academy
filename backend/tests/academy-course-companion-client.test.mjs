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
 assert.match(html,/data-dashboard/);assert.match(html,/m4l-academy-read-cache\.js\?v=/);
 assert.ok(html.indexOf('m4l-academy-workspace.js')<html.indexOf('m4l-academy-read-cache.js')&&html.indexOf('m4l-academy-read-cache.js')<html.indexOf('src="portal.js'));
 assert.match(html,/data-course-pdf download/);assert.doesNotMatch(html,/id="print-reading"|#i-print|download or print|Open \/ print/i);
 const materials=html.slice(html.indexOf('id="view-resources"'),html.indexOf('id="view-assessments"'));
 assert.equal((html.match(/data-course-pdf/g)||[]).length,1);assert.match(materials,/data-course-pdf download/);assert.match(materials,/id="download-all-notes"/);
 assert.doesNotMatch(reader,/window\.print\(|getElementById\('(?:print-reading|download-note)'\)/);
 for(const id of [...bridge.matchAll(/\$\('([^']+)'\)/g)].map(m=>m[1]))assert.match(html,new RegExp('id="'+id+'"'));
});
test('a signed-out visitor gets a sign-in message before any course request',async()=>{
 const f=fixture({session:''});f.run();await tick();assert.equal(f.calls.length,0);assert.equal(f.body.classList.contains('course-loading'),true);assert.match(f.elements.get('course-gate-message').textContent,/Sign in/);assert.equal(f.window.KAHF_LESSONS,null);
});
test('four published course sessions and their lesson media render together without week requests',async()=>{
 const data=feed(),dates=['2026-10-18','2026-10-25','2026-11-01','2026-11-08'];
 data.courseCompanion.schedule={sessions:dates.map((date,index)=>({kind:'COURSE',activityId:'kahf-test',date,title:'Surah Al Kahf',startTime:'19:00',endTime:'20:00',status:'SCHEDULED',mediaSessionKey:'session-'+index,endsAt:Date.parse(date+'T18:00:00Z')}))};
 data.sessions=dates.slice(0,2).map((date,index)=>({sessionKey:'session-'+index,date,media:{id:'media-'+index,assets:[{id:'recording-'+index,kind:'YOUTUBE',name:'Session recording'}]}}));
 const f=fixture({fetcher:async()=>Response.json(data)});f.run();await tick();await tick();
 assert.equal(f.calls.length,1);assert.equal((f.elements.get('live-sessions').innerHTML.match(/<article /g)||[]).length,4);assert.doesNotMatch(html,/id="live-timetable"|id="lesson-media-grid-title"/);
 assert.match(f.elements.get('live-sessions').innerHTML,/recording-0/);assert.match(f.elements.get('live-sessions').innerHTML,/recording-1/);assert.match(f.elements.get('live-sessions').innerHTML,/Materials will appear here when published/);assert.doesNotMatch(f.elements.get('live-sessions').innerHTML,/\|\||undefined/);
 assert.doesNotMatch(html,/week-previous|week-next|Previous week|Next week/);
 const cards=f.elements.get('live-sessions').innerHTML.split('</article>');assert.match(cards[0],/2026-10-18/);assert.match(cards[0],/19:00–20:00/);assert.match(cards[0],/recording-0/);assert.doesNotMatch(cards[0],/recording-1/);assert.match(cards[1],/recording-1/);
 const overview=html.slice(html.indexOf('id="view-overview"'),html.indexOf('id="view-reading"'));assert.doesNotMatch(overview,/Four Sundays|7:00 PM SAST|18 Oct – 8 Nov 2026/);
});
test('combined cards keep join and recording actions attached to the right session after sorting older media',async()=>{
 const data=feed(),now=Date.now(),date=new Date(now).toISOString().slice(0,10);
 data.courseCompanion.schedule={sessions:[{date,title:'Current session',startTime:'19:00',status:'SCHEDULED',joinKey:'current-join',joinAvailableAt:now-60000,endsAt:now+60000,mediaSessionKey:'current'}]};
 data.sessions=[{sessionKey:'current',date,media:{id:'current-media',assets:[{id:'current-recording',kind:'YOUTUBE',name:'Current recording'}]}},{sessionKey:'older',date:'2000-01-01',media:{id:'older-media',assets:[{id:'older-recording',kind:'YOUTUBE',name:'Older recording'}]}}];
 const opened=[],attachments=[],f=fixture({fetcher:async url=>Response.json(String(url).endsWith('/join')?{success:true,joinUrl:'https://session.invalid/current'}:data)});
 f.window.open=()=>({opener:null,location:{replace:url=>opened.push(url)},close(){}});
 f.window.M4L_LESSON_MEDIA.openAttachment=options=>attachments.push(options);
 f.run();await tick();await tick();
 const cards=f.elements.get('live-sessions').innerHTML.split('</article>');assert.equal(cards.length-1,2);assert.match(cards[0],/older-recording/);assert.doesNotMatch(cards[0],/data-join-session/);assert.match(cards[1],/data-join-session="1"/);assert.match(cards[1],/current-recording/);
 const button=element();button.dataset.joinSession='1';f.click({closest:selector=>selector==='[data-join-session]'?button:null});await tick();await tick();
 const request=f.calls.find(call=>String(call.url).endsWith('/join'));assert.deepEqual(JSON.parse(request.options.body),{joinKey:'current-join',date});assert.deepEqual(opened,['https://session.invalid/current']);
 f.click({closest:selector=>selector==='[data-attachment]'?{dataset:{lesson:'current-media',attachment:'current-recording'}}:null});assert.equal(attachments.length,1);assert.equal(attachments[0].lesson.id,'current-media');assert.equal(attachments[0].kind,'YOUTUBE');
});
test('an account switch while the course response is delayed never reveals the previous account text',async()=>{
 let finish;const f=fixture({fetcher:()=>new Promise(resolve=>{finish=resolve;})});f.run();await tick();assert.equal(f.calls.length,1);
 f.storage.set('m4l_account_token','actor-two');f.window.dispatchEvent(Object.assign(new Event('storage'),{key:'m4l_account_token'}));finish(Response.json(feed()));await tick();await tick();
 assert.equal(f.body.classList.contains('course-loading'),true);assert.equal(f.window.KAHF_LESSONS,null);assert.equal(f.elements.get('main').innerHTML,'');
});
test('the authorised course opens all lessons and confines reflection storage to its verified owner',async()=>{
 const f=fixture({fetcher:async url=>Response.json(String(url).endsWith('/feed')?feed():{success:true,signedIn:true,startDate:'2026-10-25',activity:{kind:'COURSE',id:'kahf-test'},personalTimetable:[]})});
 f.run();f.reader();await tick();await tick();assert.equal(f.body.classList.contains('course-loading'),false);assert.equal(f.window.KAHF_LESSONS.length,11);assert.equal(f.window.KAHF_APP_STARTED,true);
 assert.equal(f.calls.length,1);assert.equal(JSON.parse(f.calls[0].options.body).includeCourseCompanion,true);assert.equal(JSON.parse(f.calls[0].options.body).includeCourseSessions,true);assert.equal(f.calls[0].options.headers.Authorization,'Bearer actor-one');
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
 for(const workspace of ['LEARN','TEACH','ADMIN','ADMIN_LEARN','ADMIN_TEACH']){window.M4L_ACADEMY_WORKSPACE.current=()=>workspace;const link=new URL(helper.href(course,'course-website'), 'https://academy.invalid');assert.equal(link.searchParams.get('workspace'),workspace==='ADMIN'?'ADMIN_LEARN':workspace);assert.equal(link.hash,'#overview');assert.equal(link.searchParams.get('course'),course.id);}
 assert.equal(helper.href({...course,name:'Another course'},'course-website'),'');
});

function pdfFeed(){const data=feed();data.courseFiles={media:{id:'book',state:'PUBLISHED',assets:[{id:'pdf',kind:'PDF',filename:'surah-kahf.pdf'}]}};return data;}
const pdfLink=()=>{const link=element();link.setAttribute('download','');return {link,target:{closest:selector=>selector==='[data-course-pdf]'?link:null}};};
const timetable=()=>({success:true,signedIn:true,startDate:'2026-10-25',activity:{kind:'COURSE',id:'kahf-test'},personalTimetable:[]});
test('a course PDF download is freshly authorised and its temporary URL is cleared on account change',async()=>{
 const f=fixture({fetcher:async url=>String(url).endsWith('/download')?new Response('%PDF-fixture',{headers:{'Content-Type':'application/pdf'}}):Response.json(String(url).endsWith('/feed')?pdfFeed():timetable())});
 f.run();await tick();await tick();const {target}=pdfLink();f.click(target);await tick();await tick();
 assert.doesNotMatch(f.elements.get('live-course-files').innerHTML,/data-attachment="pdf"/);
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
