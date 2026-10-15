import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
const html = await readFile(new URL('../../academy/index.html', import.meta.url), 'utf8');
const script = await readFile(new URL('../../js/m4l-academy-entrance.js', import.meta.url), 'utf8');
const css = await readFile(new URL('../../css/m4l-academy-entrance.css', import.meta.url), 'utf8');
const elements = new Map(), handlers = new Map(), documentHandlers = new Map(), storage = new Map();
function element(id = '') {
  const classes = new Set(), listeners = new Map(), attrs = new Map();
  return { id, listeners, attrs, dataset: {}, textContent: '', innerHTML: '', hidden: false, value: '', open: false,
    classList: { add: name => classes.add(name), remove: name => classes.delete(name), contains: name => classes.has(name),
      toggle(name, force) { if (force ?? !classes.has(name)) classes.add(name); else classes.delete(name); } },
    addEventListener: (type, fn) => listeners.set(type, fn), setAttribute(key,value) {attrs.set(key,String(value));}, removeAttribute(key) {attrs.delete(key);},
    replaceChildren() { this.innerHTML = ''; this.textContent = ''; },
    appendChild(child) { elements.set(child.id, child); }, querySelectorAll: () => [], contains: () => false,
    clientWidth:400, scrollBy(options) { this.lastScroll=options; }, scrollTo() {}, scrollIntoView() {}, showModal() { this.open = true; }, close() { this.open = false; } };
}
for (const match of html.matchAll(/id="([^"]+)"/g)) elements.set(match[1], element(match[1]));
elements.get('course-list-stage').value='ALL';elements.get('course-list-scope').value='MINE';
elements.get('film-track').querySelectorAll = () => [{offsetLeft:0}, {offsetLeft:100}];
const views = [...html.matchAll(/<section id="([^"]+)" class="view/g)].map(match => elements.get(match[1]));
const container = element('container');
const document = { getElementById: id => elements.get(id), createElement: () => element(), visibilityState: 'visible',
  querySelector: selector => selector === '.container' ? container : null, querySelectorAll: selector => selector === '.view' ? views : [],
  addEventListener: (type, fn) => documentHandlers.set(type, fn) };
const location = { hash: '#overview' };
const window = { M4L_CONFIG: { API_BASE: 'https://test' }, location,
  addEventListener(type, fn) { handlers.set(type, fn); }, dispatchEvent(event) { handlers.get(event.type)?.(event); } };
const $ = id => elements.get(id), flush = async () => { for (let i=0;i<4;i++) await new Promise(resolve=>setTimeout(resolve,2)); };
const activity = { id:'PRG-46c8576d-9fcf-4000-96b9-856b00a0218a', name:'Reboot', kind:'PROGRAM', roles:['STUDENT'],
  tools:{ library:'/academy/library/', attendance:'' }, curriculum:[{name:'Tafseer',modules:[{name:'Module one'}]}], classes:[{name:'Class one'}],
  timetable:[{kind:'PROGRAM',activityId:'PRG-46c8576d-9fcf-4000-96b9-856b00a0218a',activityName:'Reboot',title:'Lesson <one>',date:'2026-10-05',startTime:'13:00',endTime:'14:00',timezone:'Africa/Johannesburg',involvement:'student',classNames:['Class one'],teacherNames:['Teacher A','Teacher B'],information:['Unwanted level','Unwanted duplicate'],joinUrl:'https://zoom.test/lesson'}] };
const requests = [], catalogueRequests = [], joins = [], tabStore=new Map(), fetchUrls=[];
let joinFailure=false;const popup={opener:null,location:{replace(url){popup.url=url;}},close(){popup.closed=true;}};window.open=()=>popup;
let failCatalogue=false,deferCatalogue=false,releaseCatalogue;
let fixtureNow='2026-10-05T10:00:00Z';
let nextTimer=0;
const timers=new Map();
const stamp = event => {
  const startsAt=Date.parse(`${event.date}T${event.startTime}:00+02:00`);
  const endsAt=Date.parse(`${event.date}T${event.endTime}:00+02:00`);
  const result={...event,joinKey:event.joinUrl?JSON.stringify([event.kind,event.activityId,event.date,event.startTime]):'',relevant:true,status:event.status||'SCHEDULED',startsAt,endsAt,joinAvailableAt:startsAt-300000};
  if (Date.parse(fixtureNow)<result.joinAvailableAt || Date.parse(fixtureNow)>=endsAt || result.status!=='SCHEDULED') delete result.joinUrl;
  return result;
};
let deferNext=false, release, hasWorkshops=true, globalAdmin=false, programRole='STUDENT', roomFixture=false, rollupBoundaryFixture=false, colourFixture=false, cacheFixture=false, failNext=false, quotaNext=false, warningFixture=false, publicFreeFixture=false;
const publicJoins=[];let remoteLabelsVersion='0',labelChecks=0;
const fetch = async (_url, options) => {
  fetchUrls.push(_url);
  if(_url.endsWith('/api/academy/profile-labels-version')){labelChecks++;return {ok:true,status:200,json:async()=>({success:true,profileLabelsVersion:remoteLabelsVersion})};}
  const signedIn = Boolean(options.headers?.Authorization), body = JSON.parse(options.body||'{}');
  if (_url.endsWith('/api/academy/public-lesson/join')) { assert.equal(signedIn,false); publicJoins.push(body); return {ok:true,status:200,json:async()=>({success:true,joinUrl:'https://zoom.test/free-current-checked'})}; }
  if(!signedIn){assert.ok(_url.endsWith('/api/academy/entrance/public-snapshot'));assert.equal(options.method,'GET');}
  if (_url.endsWith('/api/academy/lesson/join')) { joins.push(body); return {ok:!joinFailure,status:joinFailure?403:200,json:async()=>joinFailure?{success:false,error:'This lesson is no longer available. Refresh the timetable.'}:{success:true,joinUrl:'https://zoom.test/current-checked'}}; }
  if (_url.endsWith('/api/academy/courses/catalogue')) {
    catalogueRequests.push(options.headers.Authorization);
    const snapshot={success:true,canViewAll:globalAdmin,courses:hasWorkshops?[
      {id:'COURSE-BARAKAH',runId:'run-a',name:'Barakah',stage:'ACTIVE',personal:true,canManage:globalAdmin,startDate:'2026-10-01',endDate:'2026-10-31',canOpenActivity:true,mediaMessage:'Course media becomes available after completion.'},
      {id:'COURSE-SALAAH',runId:'run-b',name:'Salaah',stage:'COMPLETE',personal:true,canManage:globalAdmin,startDate:'2026-09-01',endDate:'2026-09-30',canOpenActivity:false,mediaMessage:'Course media is not available yet.'},
      ...(globalAdmin?[{id:'COURSE-DRAFT',name:'Unpublished <draft>',stage:'DRAFT',personal:false,canManage:true,startDate:'',endDate:'',canOpenActivity:false,mediaMessage:'Course media becomes available after completion.'}]:[])
    ]:[]};
    if(deferCatalogue){deferCatalogue=false;await new Promise(resolve=>releaseCatalogue=resolve);}
    if(failCatalogue){failCatalogue=false;return {ok:false,status:503,json:async()=>({success:false,error:'Temporary Course list failure'})};}
    return {ok:true,status:200,json:async()=>snapshot};
  }
  requests.push(body);
  const row = structuredClone(activity);
  if (signedIn) row.roles=globalAdmin?['GLOBAL_ADMIN','PROGRAM_ADMIN']:Array.isArray(programRole)?programRole:programRole?[programRole]:[];
  if (signedIn && (globalAdmin || programRole!=='STUDENT')) {
    row.tools.attendance=`/programs/attendance.html?program=${encodeURIComponent(row.id)}`;
    // A cached older backend may still advertise its wider Program Library editor.
    row.tools.resources=`/programs/library.html?program=${encodeURIComponent(row.id)}`;
  }
  if (globalAdmin && signedIn) Object.assign(row.tools, {
    manage:`/programs/manage.html?program=${encodeURIComponent(row.id)}`,
    timetableBuilder:`/programs/timetable.html?program=${encodeURIComponent(row.id)}`,users:'/users/'
  });
  if (!signedIn) { row.roles=[]; row.classes=[]; row.curriculum=[]; row.timetable.forEach(event=>{delete event.information;delete event.joinUrl;event.involvement='';}); }
  const workshops = [{id:'COURSE-BARAKAH',name:'Barakah',roles:['TEACHER']}, {id:'COURSE-SALAAH',name:'Salaah',roles:['STUDENT']}]
    .map(course=>({...row,...course,kind:'COURSE',roles:!signedIn||!hasWorkshops?[]:globalAdmin?['GLOBAL_ADMIN']:course.roles,
      timetable:row.timetable.map(event=>({...event,kind:'COURSE',activityId:course.id,activityName:course.name}))}));
  const activities=[row,...workshops,{id:'COURSE-TAFSEER',name:'Tafseer & Tadabbur',kind:'COURSE',roles:[]}];
  const base = row.timetable[0];
  const homeTimetable = [base, {...base,title:'Earlier item',date:'2026-10-04'},
    {...base,title:'Ended item',startTime:'10:00',endTime:'11:00'},
    {...base,title:'Later Program item',date:'2026-10-06',...(!signedIn?{startTime:'04:00',endTime:'06:00'}:{})},
    {...base,kind:'COURSE',activityId:'COURSE-TEST',activityName:'Course item',title:'Course item',date:'2026-10-06',...(!signedIn?{startTime:'12:00',endTime:'13:00'}:{})},
    {...base,kind:'COURSE',activityId:'COURSE-TEST',title:'Later Course offering',date:'2026-10-07',...(!signedIn?{startTime:'07:30',endTime:'08:30'}:{})},
    {...base,activityId:'CANCELLED',title:'Cancelled item',status:'CANCELLED'}];
  const result = { success:true,signedIn,globalAdmin:signedIn&&globalAdmin,student:signedIn&&activities.some(item=>item.roles.includes('STUDENT')),startDate:body.startDate||'2026-10-04',endDate:'2026-10-10',warnings:[],
    activities,personalActivities:signedIn?activities.filter(item=>item.roles.length):[],timetable:homeTimetable.map(event=>{const publicEvent={...event};delete publicEvent.joinUrl;return publicEvent;}),activity:body.id?activities.find(item=>item.id===body.id):null };
  if(!signedIn){
    result.snapshotDate='2026-10-05';
    result.timetable=result.timetable.map(event=>event.kind==='PROGRAM'?{...event,publicCard:{time:'4am',title:'Public <Program>',description:'4 yr structured scholarship of **Quran, Sunnah, and Islamic law**'}}:event);
    if(publicFreeFixture)result.timetable=result.timetable.map(event=>{
      if(event.title!=='Lesson <one>')return event;
      const {joinUrl,...free}=stamp({...event,joinUrl:'https://zoom.test/free'});return {...free,publicJoin:true};
    }).reverse();
  }
  result.calendarEvents=[{description:'Holiday <script>',startDate:'2026-10-07',endDate:'2026-10-07',teachingImpact:'NO_TEACHING'}];
  result.personalTimetable=signedIn ? (globalAdmin ? result.timetable.filter(event=>event.status!=='CANCELLED').map(stamp) : body.id ? [
    ...row.timetable.map(stamp),
    ...row.timetable.map(event=>stamp({...event,date:'2026-10-06',title:'Tomorrow Program lesson'})),
    ...workshops.filter(item=>item.roles.length).flatMap(item=>item.timetable.map(event=>stamp({...event,title:`Course ${item.name}`,startTime:'14:30',endTime:'15:30'})))
  ] : result.timetable.filter(event=>event.status!=='CANCELLED').map(stamp)) : [];
  if (body.id) result.personalTimetable=result.personalTimetable.filter(event=>event.status==='SCHEDULED');
  if (roomFixture && signedIn) {
    const roomLesson={...row.timetable[0],subjectName:'Quran',moduleName:'Mishkaat',classNames:['Class one'],teacherNames:['Teacher A'],meetingGroup:'room-a',information:['Duplicate subject','Unwanted level'],joinUrl:'https://zoom.test/shared'};
    result.personalTimetable=[
      roomLesson,
      {...roomLesson,classNames:['Class two'],teacherNames:['Teacher <two>']},
      {...roomLesson,subjectName:'Fiqh',moduleName:'',title:'Fiqh module',classNames:['Class three'],teacherNames:['Teacher B'],startTime:'14:00',endTime:'15:00',involvement:'teacher',information:['Fiqh module','Class three','Teacher B']},
      {...roomLesson,kind:'COURSE',activityId:'COURSE-BARAKAH',activityName:'Barakah',subjectName:'Barakah',moduleName:'',classNames:[],teacherNames:['Teacher C'],startTime:'15:00',endTime:'16:00',information:['Course module','Teacher C']},
      {...roomLesson,meetingGroup:'room-b',information:['Different room'],joinUrl:''},
      {...roomLesson,meetingGroup:'',startTime:'16:00',endTime:'17:00',information:['No room one'],joinUrl:''},
      {...roomLesson,meetingGroup:'',startTime:'16:00',endTime:'17:00',information:['No room two'],joinUrl:''},
      {...roomLesson,date:'2026-10-06',information:['Next day lesson']}
    ].map(stamp);
    result.personalTimetable.push({...stamp(roomLesson),meetingGroup:'overnight',information:['Overnight class'],joinUrl:'',
      startsAt:Date.parse('2026-10-06T00:30:00+03:00'),endsAt:Date.parse('2026-10-06T01:30:00+03:00'),joinAvailableAt:Date.parse('2026-10-06T00:25:00+03:00')});
    if(rollupBoundaryFixture)result.personalTimetable.push(...[
      {...roomLesson,startTime:'17:30',endTime:'18:00',moduleName:'After a gap'},
      {...roomLesson,startTime:'18:00',endTime:'18:30',moduleName:'Contiguous later lesson'},
      {...roomLesson,activityId:'OTHER-PROGRAM',activityName:'Other Program',startTime:'14:00',endTime:'15:00'}
    ].map(stamp));
  }
  if (colourFixture) {
    const alimiya={id:'PRG-ALIMIYA',kind:'PROGRAM',name:'Alimiyah',roles:['TEACHER']};
    const hifz={id:'PRG-HIFZ',kind:'PROGRAM',name:'Hifz',roles:['STUDENT']};
    result.activities.push(alimiya,hifz);
    result.personalActivities.push(alimiya,hifz);
    result.personalTimetable=[
      {...base,activityId:alimiya.id,activityName:alimiya.name,involvement:'student',date:'2026-10-06',subjectName:'Assembly'},
      {...base,activityId:alimiya.id,activityName:alimiya.name,involvement:'teacher',date:'2026-10-07',meetingGroup:'alimiya-room'},
      {...base,activityId:alimiya.id,activityName:alimiya.name,involvement:'teacher',date:'2026-10-07',meetingGroup:'alimiya-room',startTime:'14:00',endTime:'15:00'},
      {...base,activityId:alimiya.id,activityName:alimiya.name,involvement:'teacher',date:'2026-10-08'},
      {...base,activityId:hifz.id,activityName:hifz.name,involvement:'student'},
      ...workshops.flatMap(course=>course.timetable),base
    ].map(stamp).sort((a,b)=>a.startsAt-b.startsAt);
    result.timetable=result.personalTimetable.map(event=>{const publicEvent={...event,involvement:''};delete publicEvent.information;delete publicEvent.joinUrl;return publicEvent;});
    // Registry order must not affect colours when navigating or refreshing.
    if (body.id) result.activities.reverse();
  }
  if (cacheFixture) {
    result.timezone='Africa/Johannesburg';
    result.activityPages=signedIn?activities.filter(item=>item.roles.length).map(({timetable,...page})=>page):[];
    result.personalTimetable=signedIn?[...row.timetable,...workshops.flatMap(course=>course.timetable.map(event=>({...event,startTime:'14:30',endTime:'15:30'})))].map(stamp):[];
    if (warningFixture) result.warnings=['Timetable service temporarily incomplete.'];
  }

  if (deferNext) { deferNext=false; await new Promise(resolve=>{release=resolve;}); }
  if(quotaNext){quotaNext=false;return {ok:false,status:503,json:async()=>({success:false,error:'Academy access has reached today’s service allowance. Try again after 00:00 UTC.',code:'ACADEMY_D1_DAILY_READ_LIMIT'})};}
  if (failNext) { failNext=false; return {ok:false,status:503,json:async()=>({success:false,error:'Temporary timetable failure'})}; }
  if (signedIn) { const strip=rows=>rows?.map(({joinUrl,...row})=>row);result.personalTimetable=strip(result.personalTimetable);result.timetable=strip(result.timetable);if(result.activity)result.activity.timetable=strip(result.activity.timetable); }
  return {ok:true,status:200,json:async()=>result};
};
const RealDate = Date;
class FixtureDate extends RealDate { static now(){return RealDate.parse(fixtureNow);} constructor(...args) { super(...(args.length?args:[fixtureNow])); } }
vm.runInNewContext(script, { window, document, location, history:{replaceState(_state,_title,hash){location.hash=hash;}}, localStorage:{getItem:key=>storage.get(key)||null}, fetch, Event,
  crypto:webcrypto,TextEncoder,Uint8Array,sessionStorage:{getItem:key=>tabStore.get(key)||null,setItem:(key,value)=>tabStore.set(key,value),removeItem:key=>tabStore.delete(key)},Intl, Date:FixtureDate, setInterval() {}, setTimeout(fn,delay) { const id=++nextTimer;timers.set(id,{fn,delay});return id; }, clearTimeout(id) {timers.delete(id);}, matchMedia:()=>({matches:false}) });
await flush();
const countPills=id=>($(id).innerHTML.match(/<li class="preview-pill timetable-pill /g)||[]).length;
const clickInfo=(id,index)=>documentHandlers.get('click')({target:{closest:selector=>selector==='[data-information]'?{dataset:{information:`${id}:${index}`}}:null}});
const firstInfo=id=>/data-information="[^:]+:(\d+)"/.exec($(id).innerHTML)[1];
const navigate=async hash=>{location.hash=hash;handlers.get('hashchange')();await flush();};
const refresh=async()=>{tabStore.clear();window.dispatchEvent(new Event('m4l-academy-session'));await flush();if(storage.size){$('timetable-refresh').listeners.get('click')();await flush();}};
assert.equal($('academy-role-panel').hidden,true);
assert.equal(catalogueRequests.length,0);
assert.equal(($('academy-preview-sessions').innerHTML.match(/<li class="preview-pill"/g)||[]).length,4);
assert.match($('academy-preview-sessions').innerHTML,/>4am<|Public &lt;Program&gt;/);assert.match($('academy-preview-sessions').innerHTML,/<strong>Quran, Sunnah, and Islamic law<\/strong>/);
assert.doesNotMatch($('academy-preview-sessions').innerHTML,/aria-label="13:00"/,'Public Program card time is entered independently from lesson time');
for(const time of ['12:00','07:30'])assert.ok($('academy-preview-sessions').innerHTML.includes(`aria-label="${time}"`));
assert.doesNotMatch($('academy-preview-sessions').innerHTML,/data-information|Join lesson|zoom\.test|Teacher A/);
assert.match($('public-snapshot-note').textContent,/Schedule preview/);
assert.equal($('public-snapshot-note').hidden,false);
assert.equal(($('academy-public-sessions').innerHTML.match(/<li class="preview-pill"/g)||[]).length,5,'Homepage public Program summaries appear once per Program/day; separate Course sessions stay visible');
assert.doesNotMatch($('academy-public-sessions').innerHTML,/data-information|Teacher A|zoom\.test|Cancelled item/);
assert.equal(timers.size,0);
let count=requests.length;
documentHandlers.get('visibilitychange')();await flush();
assert.equal(requests.length,count,'Returning to the public homepage never refreshes its daily snapshot');
assert.match(html,/id="activity-sessions"/);assert.doesNotMatch(html,/id="(?:activity-classes|activity-curriculum|activity-coming)"/,'Landing pages show tools and their scoped timetable only');
assert.ok(html.indexOf('aria-label="Bismillah"')<html.indexOf('id="overview-title"'));
assert.match(html, /id="academy-login-dialog"[\s\S]*One account · Every program/);
await navigate('#workshops');assert.match($('workshops-message').textContent,/Sign in/);assert.equal(catalogueRequests.length,0);

storage.set('m4l_account_token','QA');await refresh();
assert.equal($('academy-role-panel').hidden,true,'Chooser stays on Academy home');assert.equal($('public-snapshot-note').hidden,true);
assert.equal(($('academy-public-sessions').innerHTML.match(/<li class="preview-pill"/g)||[]).length,5,'Signing in keeps the homepage public timetable independent of the personal schedule');
assert.equal(catalogueRequests.length,1);
assert.match($('workshop-pills').innerHTML,/Barakah|Complete|Media · coming soon/);
assert.doesNotMatch($('workshop-pills').innerHTML,/Program Admin|Teacher|User|COURSE-DRAFT|<small>Student/);
assert.equal($('course-list-scope-wrap').hidden,true);assert.match($('workshop-tools').innerHTML,/aria-label="Teach tools"/);
assert.equal(timers.size,0,'Courses have no background timetable timer');
$('course-list-stage').value='COMPLETE';$('course-list-stage').listeners.get('input')();
assert.match($('workshop-pills').innerHTML,/Salaah/);assert.doesNotMatch($('workshop-pills').innerHTML,/Barakah/);
$('course-list-stage').value='ALL';$('course-list-search').value='bar';$('course-list-search').listeners.get('input')();
assert.match($('workshop-pills').innerHTML,/Barakah/);assert.doesNotMatch($('workshop-pills').innerHTML,/Salaah/);
$('course-list-search').value='';$('course-list-search').listeners.get('input')();
await navigate('#overview');await navigate('#workshops');assert.equal(catalogueRequests.length,1);
await navigate('#activity/PROGRAM/'+activity.id);
assert.equal($('activity-title').textContent,'Reboot');assert.doesNotMatch($('activity-menu').innerHTML,/aria-label="Admin tools"/);
assert.doesNotMatch($('activity-menu').innerHTML,/Explore|Attendance|Lesson prep|Teach tools/);
assert.match($('activity-menu').innerHTML,/Learn tools/);for(const label of ['Timetable','Assessment','Library'])assert.ok($('activity-menu').innerHTML.includes(`>${label}<`));
assert.match($('activity-support').innerHTML,/Messages|Academy calendar|Surahs and Duas tracker/);
assert.doesNotMatch($('activity-support').innerHTML,/href="#(?:progress|hifz|hifdh)"/,'The public Hifz page is opened only through the website Menu');
for(const hash of ['#hifz','#hifdh','#progress']){await navigate(hash);assert.equal($('current-view').textContent,'Academy home');}
const learnHash='#activity/PROGRAM/'+activity.id+'/learn';
await navigate(learnHash+'/library');assert.equal($('activity-library').hidden,false);assert.equal($('activity-schedule').hidden,true);assert.match($('activity-library').innerHTML,/For me|Browse/);
await navigate(learnHash+'/assessment');assert.equal($('as-panel').hidden,false);assert.equal($('activity-library').hidden,true);
await navigate('#activity/PROGRAM/'+activity.id);
assert.doesNotMatch($('activity-sessions').innerHTML,/Course item|Barakah|Salaah/);assert.match($('activity-sessions').innerHTML,/Reboot/);
assert.equal(timers.size,1,'Scoped timetable has a local lesson-boundary timer, without polling');
count=requests.length;documentHandlers.get('visibilitychange')();await flush();assert.equal(requests.length,count);
const programOrigin='#activity/PROGRAM/'+activity.id;const navigationReads=requests.length;
await navigate('#timetable');assert.equal(requests.length,navigationReads,'Opening the complete timetable adds no read');assert.equal($('timetable-close').href,programOrigin);assert.equal(tabStore.get('m4l_academy_timetable_return'),programOrigin);
window.dispatchEvent(new Event('m4l-academy-session'));await flush();assert.equal($('timetable-close').href,programOrigin,'Restoring the same account session preserves the return destination');
await navigate($('timetable-close').href);assert.equal($('activity-title').textContent,'Reboot');
assert.match($('activity-back-link').innerHTML,/<svg/);assert.doesNotMatch($('activity-back-link').innerHTML,/My Academy/);
await navigate('#activity/COURSE/COURSE-SALAAH');assert.equal(timers.size,1);assert.doesNotMatch($('activity-sessions').innerHTML,/Reboot|Barakah/);

await navigate('#timetable');assert.equal($('timetable-close').href,'#activity/COURSE/COURSE-SALAAH');
await navigate($('timetable-close').href);assert.equal($('activity-title').textContent,'Salaah');
await navigate('#overview');await navigate('#timetable');assert.equal($('timetable-close').href,'#overview');
tabStore.set('m4l_academy_timetable_return','https://outside.invalid');await navigate('#timetable');assert.equal($('timetable-close').href,'#overview','Stored navigation accepts local Academy views only');
hasWorkshops=false;programRole='TEACHER';location.hash='#activity/PROGRAM/'+activity.id;await refresh();
assert.match($('activity-menu').innerHTML,/Teach tools/);assert.doesNotMatch($('activity-menu').innerHTML,/Admin tools/);assert.doesNotMatch($('activity-menu').innerHTML,/Learn tools/);for(const label of ['Timetable','Attendance','Assessment','Planning','Library'])assert.ok($('activity-menu').innerHTML.includes(`>${label}<`));
assert.doesNotMatch($('activity-switcher').innerHTML,/<span>Courses<\/span>/,'No Course access means no Courses pill');
assert.equal($('academy-tab-teach').hidden,false);assert.equal($('academy-tab-learn').hidden,false);assert.equal($('academy-tab-admin').hidden,true);
await navigate('#overview/learn');assert.match($('academy-role-panel').innerHTML,/No learning Programs or Courses/);
await navigate('#overview/teach');assert.match($('academy-role-panel').innerHTML,/\/teach/);
await navigate('#workshops');assert.equal($('workshop-pills').innerHTML,'');assert.match($('course-list-message').textContent,/No Courses/);
hasWorkshops=true;globalAdmin=true;location.hash='#activity/PROGRAM/'+activity.id;await refresh();
assert.doesNotMatch($('activity-menu').innerHTML,/Admin tools/);assert.match($('activity-menu').innerHTML,/Teach tools/);
await navigate('#administration');assert.match($('administration').innerHTML,/Academy-wide management|Manage user profiles|Update timetable/);assert.doesNotMatch($('administration').innerHTML,/id="admin-teach"/);assert.match($('administration').innerHTML,/id="admin-timetable-home"/);
for(const label of ['Users','Attendance','Planning','Assessments','Library','Curriculum','Programs','Courses'])assert.ok($('administration').innerHTML.includes(`>${label}<`));
assert.match($('administration').innerHTML,/id="admin-tab-attendance" href="#administration\/attendance"/);
await navigate('#administration/attendance');assert.match($('administration').innerHTML,/<h1>Manage Attendance<\/h1>/);assert.doesNotMatch($('administration').innerHTML,/\/programs\/attendance\.html/);assert.equal($('academy-tab-admin').attrs.get('aria-pressed'),'true');
await navigate('#assessment-admin');assert.equal($('academy-tab-admin').attrs.get('aria-pressed'),'true');assert.equal($('academy-tab-learn').attrs.get('aria-pressed'),'false');
await navigate('#progress-admin');assert.equal($('academy-tab-admin').attrs.get('aria-pressed'),'true');
await navigate('#administration/curriculum');assert.match($('administration').innerHTML,/Subjects and Modules/);
await navigate('#activity/PROGRAM/'+activity.id);
documentHandlers.get('click')({target:{closest:selector=>selector==='[data-workspace-tool]'?{dataset:{workspaceTool:'academy'}}:null}});assert.match($('workspace-tool-body').innerHTML,/Subjects &amp; Modules/);$('workspace-tool-close').listeners.get('click')();
await navigate('#workshops');assert.equal($('course-list-scope-wrap').hidden,false);assert.equal($('course-list-title').textContent,'All Courses');
assert.match($('workshop-pills').innerHTML,/Unpublished &lt;draft&gt;/);assert.doesNotMatch($('workshop-pills').innerHTML,/<draft>/);
$('course-list-scope').value='MINE';$('course-list-scope').listeners.get('input')();assert.doesNotMatch($('workshop-pills').innerHTML,/Unpublished/);

// The complete permitted timetable and timed joining remain on the homepage.
roomFixture=true;fixtureNow='2026-10-05T10:55:00Z';globalAdmin=false;programRole='STUDENT';location.hash='#overview';await refresh();
assert.equal(countPills('academy-preview-sessions'),7,'Students see one card for contiguous Program lessons in the same room');
assert.equal(($('academy-preview-sessions').innerHTML.match(/class="upcoming-day"/g)||[]).length,7);
assert.match($('academy-preview-sessions').innerHTML,/aria-label="23:30"/);
assert.equal(($('academy-preview-sessions').innerHTML.match(/>Join lesson<\/button>/g)||[]).length,1);
assert.match($('academy-preview-sessions').innerHTML,/3 lessons, 13:00–15:00/);
clickInfo('academy-preview-sessions',firstInfo('academy-preview-sessions'));
assert.match($('lesson-information-body').innerHTML,/Mishkaat|Class one|13:00–14:00/);
assert.doesNotMatch($('lesson-information-body').innerHTML,/Duplicate subject|Unwanted level|Joining opens/);
globalAdmin=true;await refresh();assert.equal(countPills('academy-preview-sessions'),7);
clickInfo('academy-preview-sessions',firstInfo('academy-preview-sessions'));
assert.equal(($('lesson-information-body').innerHTML.match(/class="combined-lesson"/g)||[]).length,3);
for(const detail of ['Mishkaat','Class two','Teacher &lt;two&gt;','<h3>Fiqh</h3>','14:00–15:00'])assert.ok($('lesson-information-body').innerHTML.includes(detail));
assert.doesNotMatch($('lesson-information-body').innerHTML,/Barakah/,'A Course sharing the link stays separate from the Program');
assert.equal(($('lesson-information-body').innerHTML.match(/lesson-info-class/g)||[]).length,3);
globalAdmin=false;programRole='PROGRAM_ADMIN';await refresh();assert.equal(countPills('academy-preview-sessions'),7);
assert.match($('academy-preview-sessions').innerHTML,/>3 lessons<\/small>/);
assert.doesNotMatch($('academy-preview-sessions').innerHTML,/style=|hsl\(|linear-gradient/);
assert.match(css,/\.timetable-pill\.join-open\{background:var\(--rose-dark\)/);
rollupBoundaryFixture=true;
for(const role of ['STUDENT','TEACHER','PROGRAM_ADMIN']){
 programRole=role;await refresh();assert.equal(countPills('academy-preview-sessions'),9,role+' keeps gaps and other Programs separate');
 assert.match($('academy-preview-sessions').innerHTML,/2 lessons, 17:30–18:30/);
}
globalAdmin=true;await refresh();assert.equal(countPills('academy-preview-sessions'),9,'Global Admin uses the same Program boundaries');
globalAdmin=false;rollupBoundaryFixture=false;

roomFixture=false;programRole='STUDENT';cacheFixture=true;fixtureNow='2026-10-05T10:54:30Z';await refresh();
await navigate('#activity/PROGRAM/'+activity.id);const cachedNavigationReads=requests.length;await navigate('#timetable');await navigate($('timetable-close').href);assert.equal(requests.length,cachedNavigationReads,'Returning from My Timetable retains the daily activity cache');await navigate('#timetable/learn');
assert.equal([...timers.values()][0].delay,30000,'Browser wakes at the five-minute joining boundary');count=requests.length;
fixtureNow='2026-10-05T10:55:00Z';let timer=[...timers.values()][0];timers.clear();timer.fn();await flush();
assert.match($('academy-sessions').innerHTML,/join-open|Join lesson/);
assert.equal(requests.length,count,'Opening a lesson locally causes no server fetch');
assert.equal([...timers.values()][0].delay,5*60000,'Next browser-only transition is lesson start');
assert.doesNotMatch(JSON.stringify([...tabStore.values()]),/zoom\.test|joinUrl|Bearer|"QA"/);
const joinControl={dataset:{join:/data-join="([^"]+)"/.exec($('academy-sessions').innerHTML)[1]},textContent:'Join lesson',disabled:false};
documentHandlers.get('click')({target:{closest:selector=>selector==='[data-join]'?joinControl:null}});await flush();assert.equal(joins.length,1);assert.equal(popup.url,'https://zoom.test/current-checked');
joinFailure=true;documentHandlers.get('click')({target:{closest:selector=>selector==='[data-join]'?joinControl:null}});await flush();assert.equal(popup.closed,true);assert.match($('schedule-message').textContent,/no longer available/);joinFailure=false;
count=requests.length;documentHandlers.get('visibilitychange')();await flush();assert.equal(requests.length,count,'Returning to the tab uses the daily snapshot');
window.dispatchEvent(new Event('m4l-academy-session'));await flush();assert.equal(requests.length,count,'Restoring the same signed-in session reuses the daily snapshot');
$('upcoming-next').listeners.get('click')();assert.equal($('academy-preview-sessions').lastScroll.left,400);
count=requests.length;await navigate('#activity/COURSE/COURSE-BARAKAH');await navigate('#activity/PROGRAM/'+activity.id);
assert.equal(requests.length,count,'Program and Course navigation reuse account-scoped page metadata');assert.equal(timers.size,1);assert.match($('activity-sessions').innerHTML,/Reboot/);assert.doesNotMatch($('activity-sessions').innerHTML,/Barakah|Salaah/);
count=requests.length;await navigate('#timetable');assert.match($('academy-sessions').innerHTML,/Barakah|Salaah/);assert.equal(requests.length,count);await navigate('#activity/PROGRAM/'+activity.id);
fixtureNow='2026-10-05T10:56:01Z';handlers.get('hashchange')();await flush();assert.equal(requests.length,count,'Lesson boundaries do not refresh pages without a timetable');
fixtureNow='2026-10-05T11:01:01Z';handlers.get('hashchange')();await flush();assert.equal(requests.length,count,'Daily page metadata is reused after lesson starts');
await navigate('#overview');quotaNext=true;$('timetable-refresh').listeners.get('click')();await flush();
assert.match($('academy-sessions').textContent,/service allowance/);assert.match($('academy-sessions').textContent,/00:00 UTC/);
assert.equal(timers.size,0,'Quota failure clears protected timetable links and stops retries');
$('entrance-retry').listeners.get('click')();await flush();assert.ok(countPills('academy-sessions'));
fixtureNow='2026-10-05T11:03:03Z';failCatalogue=true;await navigate('#workshops');
assert.equal($('workshop-pills').innerHTML,'');assert.equal($('course-list-retry').hidden,false);
$('course-list-retry').listeners.get('click')();await flush();assert.match($('workshop-pills').innerHTML,/Barakah/);
fixtureNow='2026-10-05T11:04:04Z';deferCatalogue=true;handlers.get('hashchange')();await flush();
storage.clear();window.dispatchEvent(new Event('m4l-academy-session'));releaseCatalogue();await flush();
assert.equal($('workshop-pills').innerHTML,'','A late Course response cannot restore the previous account');
assert.equal($('activity-menu').innerHTML,'');assert.equal($('workshop-tools').innerHTML,'');assert.equal($('academy-role-panel').innerHTML,'','Late responses cannot restore Academy tools');assert.equal($('academy-role-panel').hidden,true);
assert.doesNotMatch($('academy-sessions').innerHTML,/Join lesson|data-information|Teacher A/);
assert.equal($('lesson-information').open,false);assert.equal(timers.size,0);
fixtureNow='2026-10-06T10:00:00Z';storage.set('m4l_account_token','NEW-SESSION');location.hash='#overview';await refresh();count=requests.length;
fixtureNow='2026-10-07T10:00:00Z';documentHandlers.get('visibilitychange')();await flush();assert.equal(requests.length,count+2,'Next Academy day loads one account timetable and the shared public snapshot');
assert.equal($('timetable-refresh').hidden,false);storage.clear();window.dispatchEvent(new Event('m4l-academy-session'));await flush();assert.equal(tabStore.size,0,'Signing out removes the protected daily snapshot');
// Free public joining wakes the local clock and checks the server only on click.
publicFreeFixture=true;cacheFixture=false;location.hash='#timetable';fixtureNow='2026-10-05T10:54:30Z';await refresh();
assert.match($('academy-sessions').innerHTML,/data-public-join[^>]+disabled/);
assert.doesNotMatch($('academy-sessions').innerHTML,/zoom\.test|Teacher A/);
assert.equal([...timers.values()][0].delay,30000);count=requests.length;
fixtureNow='2026-10-05T10:55:00Z';timer=[...timers.values()][0];timers.clear();timer.fn();await flush();
assert.match($('academy-sessions').innerHTML,/class="preview-pill is-open"/);
assert.doesNotMatch($('academy-sessions').innerHTML,/data-public-join[^>]+disabled/);
assert.equal(requests.length,count,'Public joining opens without refreshing the snapshot');
const publicControl={dataset:{publicJoin:/data-public-join="([^"]+)"/.exec($('academy-sessions').innerHTML)[1]},textContent:'Join',disabled:false};
documentHandlers.get('click')({target:{closest:selector=>selector==='[data-public-join]'?publicControl:null}});await flush();
assert.equal(publicJoins.length,1);assert.equal(popup.url,'https://zoom.test/free-current-checked');assert.equal(requests.length,count);
fixtureNow='2026-10-05T12:00:00Z';timer=[...timers.values()][0];timers.clear();timer.fn();await flush();
assert.doesNotMatch($('academy-sessions').innerHTML,/data-public-join|is-open/,'Expired Free lessons cannot be joined');
documentHandlers.get('visibilitychange')();await flush();assert.equal(requests.length,count,'Returning to a Free public timetable does not poll');
// HifzHelper is an ordinary personal link, scoped by stable Program identity.
window.M4L_CONFIG.HIFZ_PROGRAM_ID='PRG-3d6b7972-644c-4f81-b95c-8d6c7ffb8227';
window.M4L_CONFIG.HIFZHELPER_URL='https://maktab.hifz-helper.app/';
let personalLoginId='F1CJW7';
window.M4L_ACADEMY_LOGIN={currentId:()=>personalLoginId};
activity.id=window.M4L_CONFIG.HIFZ_PROGRAM_ID;activity.name='Hifz';
publicFreeFixture=false;cacheFixture=true;globalAdmin=false;storage.set('m4l_account_token','HIFZ-SESSION');location.hash='#activity/PROGRAM/'+activity.id;
const assertHifzPill = (target, id, current = false) => {
  const markup=$(target).innerHTML;
  assert.ok(markup.includes(`href="https://maktab.hifz-helper.app/${id}" target="_blank" rel="noopener noreferrer"`),'The pill opens this account’s HifzHelper in a new tab');
  assert.ok(markup.includes(`href="#activity/PROGRAM/${activity.id}"${current ? ' aria-current="page"' : ''}`),'The Hifz Academy page remains accessible');
  assert.equal((markup.match(/>HifzHelper ↗<\/a>/g)||[]).length,1);
  assert.doesNotMatch(markup,/HIFZ-SESSION|\?token=|\?pin=/);
  let open=false;
  for (const tag of markup.matchAll(/<\/?a\b[^>]*>/g)) {
    const closing=tag[0].startsWith('</');
    assert.equal(open,closing,'Links must be siblings, never nested or left open');
    open=!closing;
  }
  assert.equal(open,false);
};
for(const role of ['STUDENT','TEACHER','PROGRAM_ADMIN']) {
  programRole=role;await refresh();
  const markup=$('activity-menu').innerHTML;
  assert.match(markup,/href="https:\/\/maktab\.hifz-helper\.app\/F1CJW7" target="_blank" rel="noopener noreferrer"/);
  assert.equal((markup.match(/>HifzHelper ↗<\/a>/g)||[]).length,1);
  assert.doesNotMatch(markup,/HIFZ-SESSION|\?token=|\?pin=/);
  assertHifzPill('activity-switcher','F1CJW7',true);
}
globalAdmin=true;personalLoginId='ABCDEFG';await refresh();
assert.match($('activity-menu').innerHTML,/hifz-helper\.app\/ABCDEFG/,'Global Admin inherits Hifz access');
assertHifzPill('activity-switcher','ABCDEFG',true);
assert.doesNotMatch($('activity-switcher').innerHTML,/hifz-helper\.app\/F1CJW7/,'The shortcut follows the current identity');
await navigate('#activity/COURSE/COURSE-BARAKAH');assert.doesNotMatch($('activity-menu').innerHTML,/HifzHelper/,'Courses do not inherit the Hifz destination');
assertHifzPill('activity-switcher','ABCDEFG');
location.hash='#activity/PROGRAM/'+activity.id;globalAdmin=false;
for(const role of ['', 'GLOBAL_TEACHER']) {
  programRole=role;await refresh();assert.doesNotMatch($('activity-menu').innerHTML,/HifzHelper/,'No Hifz assignment means no Hifz button');
  assert.doesNotMatch($('activity-switcher').innerHTML,/HifzHelper/,'No assignment means no personal shortcut');
}
programRole='STUDENT';
for(const id of ['', 'bad/id', 'bad?token=value']) {
  personalLoginId=id;await refresh();assert.doesNotMatch($('activity-menu').innerHTML,/HifzHelper/,'A missing or invalid personal ID cannot create a destination');
  assert.doesNotMatch($('activity-switcher').innerHTML,/HifzHelper/,'Invalid identity cannot create a pill shortcut');
}
personalLoginId='F1CJW7';activity.id='UNRELATED-PROGRAM';location.hash='#activity/PROGRAM/'+activity.id;await refresh();
assert.doesNotMatch($('activity-menu').innerHTML,/HifzHelper/,'A matching display name does not grant Hifz access');
assert.doesNotMatch($('activity-switcher').innerHTML,/HifzHelper/,'Only the registered Hifz Program receives a shortcut');
activity.id=window.M4L_CONFIG.HIFZ_PROGRAM_ID;location.hash='#activity/PROGRAM/'+activity.id;await refresh();
assert.match($('activity-menu').innerHTML,/hifz-helper\.app\/F1CJW7/);
await navigate('#workshops');await navigate('#activity/PROGRAM/'+activity.id);
count=fetchUrls.length;await navigate('#workshops');await navigate('#activity/PROGRAM/'+activity.id);
await navigate('#overview');assertHifzPill('activity-switcher','F1CJW7');
await navigate('#activity/PROGRAM/'+activity.id);assertHifzPill('activity-switcher','F1CJW7',true);
assert.equal(fetchUrls.length,count,'The link adds no connection checks or account lookups');
assert.ok(fetchUrls.every(url=>url.startsWith('https://test/')),'No Hifz requests occur until the user follows the link');
storage.clear();window.dispatchEvent(new Event('m4l-academy-session'));await flush();assert.doesNotMatch($('activity-menu').innerHTML,/HifzHelper/,'Sign-out removes the personal link');
assert.doesNotMatch($('activity-switcher').innerHTML,/HifzHelper/,'Sign-out removes the personal pill shortcut');
storage.set('m4l_account_token','inline-account');cacheFixture=true;globalAdmin=false;programRole='TEACHER';await refresh();
const inlineCalls=[];let allowLeave=true;
window.M4L_PROGRAM_ATTENDANCE={open:options=>inlineCalls.push(options),reset(){},canLeave:()=>allowLeave};
const programHash='#activity/PROGRAM/'+activity.id;
await navigate(programHash);assert.equal($('pa-main').hidden,true);assert.match($('activity-menu').innerHTML,/\/attendance" aria-controls="pa-main" aria-selected="false"/);
await navigate(programHash+'/attendance');assert.equal($('pa-main').hidden,false);assert.equal(inlineCalls.at(-1).id,activity.id);assert.equal($('pa-close').href,programHash);
assert.equal($('workspace-tool').open,false,'Attendance stays on the Program page');assert.doesNotMatch($('activity-menu').innerHTML,/\/programs\/attendance/);
assert.match($('activity-switcher').innerHTML,/\/attendance"/,'Program pills keep the Attendance view selected');
allowLeave=false;await navigate('#overview');assert.equal(location.hash,programHash+'/attendance');assert.equal($('pa-main').hidden,false,'Rejected navigation retains the open register');
allowLeave=true;await navigate('#overview');assert.equal($('pa-main').hidden,true);
for(const [roles,label] of [[['STUDENT','TEACHER'],'Teacher'],[['TEACHER','STUDENT','PROGRAM_ADMIN'],'Program Admin']]) {
  programRole=roles;await refresh();assert.match($('activity-switcher').innerHTML,new RegExp('<small>'+label+'</small>'));assert.doesNotMatch($('activity-switcher').innerHTML,/<small>[^<]* · /);
}
globalAdmin=true;await refresh();assert.match($('activity-switcher').innerHTML,/<small>Global Admin<\/small>/);assert.doesNotMatch($('activity-switcher').innerHTML,/<small>[^<]* · /);
globalAdmin=false;programRole='PROGRAM_ADMIN';await refresh();await navigate('#administration');assert.match($('administration').innerHTML,/Manage Academy/);assert.doesNotMatch($('administration').innerHTML,/id="admin-teach"/);assert.match($('administration').innerHTML,/id="admin-timetable-home"/);assert.doesNotMatch($('administration').innerHTML,/href="\/users\/"|Update public timetable/);
await navigate('#administration/assessments');assert.equal(location.hash,'#assessment-admin/PROGRAM/'+encodeURIComponent(activity.id));assert.equal($('assessment-admin').classList.contains('active'),true);
globalAdmin=false;programRole='STUDENT';await refresh();await navigate(programHash+'/attendance');assert.equal($('pa-main').hidden,true,'Students cannot open the staff register');
hasWorkshops=false;programRole='';await refresh();assert.equal($('academy-account-role').textContent,'None');assert.equal($('academy-access-empty').hidden,false);assert.equal($('academy-role-panel').hidden,true);assert.equal($('academy-role-panel').innerHTML,'');for(const key of ['learn','teach','admin'])assert.equal($('academy-tab-'+key).hidden,true);
console.log('Academy timetable, inline Attendance routing and draft guards, highest pill access, scoped tools, cache, joining, sign-out and personal HifzHelper links passed.');
