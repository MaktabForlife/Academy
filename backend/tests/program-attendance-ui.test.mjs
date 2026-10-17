import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

const markup=await readFile(new URL('../../programs/attendance.html',import.meta.url),'utf8');
const source=await readFile(new URL('../../js/m4l-program-attendance.js',import.meta.url),'utf8');
const academyMarkup=await readFile(new URL('../../academy/index.html',import.meta.url),'utf8');
const ids=new Set([...markup.matchAll(/id="([^"]+)"/g)].map(match=>match[1]));
assert.match(markup,/m4l-program-attendance\.js\?v=107\.2/);
assert.doesNotMatch(markup,/Coming soon/);
const lesson=(anchor,classId,name,accountId,submitted=false,status=null)=>({
  lesson:{anchor,classId,moduleName:name,subjectName:'Arabic',startTime:'09:00',endTime:'10:00'},
  submitted,registerId:submitted?`REG-${anchor}`:'',marks:[{accountId,name:'Learner '+accountId,status}]
});
const views=()=>({
  P1:{program:{id:'P1',name:'Alimiyah'},prepared:true,today:'2026-10-11',date:'2026-10-11',
    classes:[{id:'C1',name:'Class A'},{id:'C2',name:'Class B'}],
    lessons:[lesson('L1','C1','Quduri','S1',true,'ABSENT'),lesson('L2','C1','Arabic','S1'),lesson('L3','C2','Fiqh','S2')],
    scheduledLessons:3,submittedLessons:1,complete:false,learners:[{name:'Learner S1',status:'UNKNOWN'}]},
  P2:{program:{id:'P2',name:'Reboot'},prepared:true,today:'2026-10-11',date:'2026-10-11',
    classes:[{id:'C3',name:'Class C'}],lessons:[lesson('L4','C3','Reading','S3',true,'PRESENT')],
    scheduledLessons:1,submittedLessons:1,complete:true,learners:[{name:'Learner S3',status:'PRESENT'}]}
});
const settle=async()=>{for(let index=0;index<15;index++)await new Promise(resolve=>setTimeout(resolve,1));};
function fixture({storage=new Map(),requested='P1',role='TEACHER',session='first-session',embedded=false}={}){
  const elements=new Map(),handlers=new Map(),requests=[],selected=[],data=views();
  const publicIds=embedded?new Set([...academyMarkup.matchAll(/id="([^"]+)"/g)].map(match=>match[1])):ids;
  let account=session,acceptDiscard=true,submitError=null,getError=null,holdNext='',release,storageBlocked=false;
  function element(id){
    assert(publicIds.has(id),`Missing public attendance element ${id}`);
    if(!elements.has(id))elements.set(id,{dataset:id==='pa-main'&&embedded?{embedded:'true'}:{},hidden:false,disabled:false,href:'',value:'',textContent:'',innerHTML:'',listeners:{},classList:{toggle(){}},addEventListener(type,fn){this.listeners[type]=fn;}});
    return elements.get(id);
  }
  const location={search:requested?`?program=${requested}`:'',pathname:'/programs/attendance'};
  const context={console,crypto,TextEncoder,Event,URLSearchParams,location,
    history:{replaceState(_state,_title,url){location.search=url.slice(url.indexOf('?'));}},
    localStorage:{getItem:()=>account},sessionStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>{if(storageBlocked)throw Error('blocked');storage.set(key,value);},removeItem:key=>storage.delete(key)},
    document:{getElementById:element},window:{M4L_CONFIG:{API_BASE:''},confirm:()=>acceptDiscard,
      M4L_PROGRAM_MANAGEMENT_NAV:{select:id=>selected.push(id)},addEventListener:(event,fn)=>handlers.set(event,fn),dispatchEvent(){}},
    fetch:async(url,options)=>{
      const action=url.split('/').at(-1),body=JSON.parse(options.body);requests.push({action,body});
      let result;
      if(action==='available')result={success:true,store:'D1',accountPath:'/account/personal-id',programs:[{id:'P1',name:'Alimiyah',role},{id:'P2',name:'Reboot',role},{id:'P3',name:'Student-only',role:'STUDENT'}]};
      else if(action==='get')result=getError?{success:false,error:getError}:{success:true,...structuredClone(data[body.id]),...(body.date?{date:body.date}:{})};
      else if(action==='submit')result=submitError?{success:false,error:submitError.message,retryable:submitError.retryable}:{success:true,submittedLessons:1,editedLessons:1};
      else throw Error(`Unexpected attendance action ${action}`);
      const status=action==='submit'&&submitError?submitError.status:action==='get'&&getError?503:200;
      if(holdNext===action){holdNext='';await new Promise(resolve=>{release=resolve;});}
      if(status===0)throw Error('Connection interrupted');
      return {ok:status===200,status,json:async()=>result};
    }};
  vm.runInNewContext(source,context);
  const change=(classId,accountId,value)=>element('pa-classes').listeners.change({target:{matches:s=>s==='[data-mark]',dataset:{class:classId,account:accountId},value}});
  const chooseLesson=(classId,value)=>element('pa-classes').listeners.change({target:{matches:s=>s==='[data-lesson]',dataset:{class:classId},value}});
  const save=classId=>element('pa-classes').listeners.click({target:{closest:()=>({dataset:{submit:classId}})}});
  const choose=id=>element('pa-programs').listeners.click({target:{closest:()=>({dataset:{program:id}})}});
  const date=value=>element('pa-date').listeners.change({target:{value}});
  return {element,requests,storage,handlers,location,selected,data,change,chooseLesson,save,choose,date,controller:context.window.M4L_PROGRAM_ATTENDANCE,
    setDiscard:value=>{acceptDiscard=value;},setSubmitError:value=>{submitError=value;},setGetError:value=>{getError=value;},
    hold:action=>{holdNext=action;},release:()=>release(),blockStorage:()=>{storageBlocked=true;},
    signout:()=>{account='';handlers.get('m4l-academy-session')();}};
}
const app=fixture();await settle();
assert.match(app.element('pa-programs').innerHTML,/Alimiyah.*Reboot/);assert.doesNotMatch(app.element('pa-programs').innerHTML,/Student-only/);
assert.match(app.element('pa-classes').innerHTML,/Class A.*Class B/);assert.match(app.element('pa-classes').innerHTML,/All lessons/);
assert.match(app.element('pa-classes').innerHTML,/Mixed · keep/);assert.match(app.element('pa-classes').innerHTML,/Not submitted · unknown/);
assert.match(app.element('pa-summary').innerHTML,/Unknown/);
assert.match(markup,/id="pa-home" href="\/academy\/#overview"/);
assert.equal(app.element('pa-account').href,'/account/personal-id');
assert.equal(app.element('pa-return').href,'/academy/#activity/PROGRAM/P1');
app.save('C1');await settle();
let saved=app.requests.filter(r=>r.action==='submit').at(-1).body;
assert.deepEqual(saved.exceptions.L1,[{accountId:'S1',status:'ABSENT'}]);assert.deepEqual(saved.exceptions.L2,[],'All lessons preserves differing existing marks until the teacher changes them');
app.change('C1','S1','ABSENT');app.save('C1');await settle();
saved=app.requests.filter(r=>r.action==='submit').at(-1).body;
assert.equal(saved.scope,'day');assert.deepEqual(Object.keys(saved.exceptions),['L1','L2']);assert.equal(saved.baseRegisterIds.L1,'REG-L1');assert.equal(saved.baseRegisterIds.L2,'');
assert.equal(saved.exceptions.L2[0].status,'ABSENT');assert(!Object.hasOwn(saved.exceptions,'L3'));
app.chooseLesson('C1','L2');app.change('C1','S1','EXCUSED');app.save('C1');await settle();
saved=app.requests.filter(r=>r.action==='submit').at(-1).body;
assert.equal(saved.scope,'lesson');assert.equal(saved.anchor,'L2');assert.deepEqual(Object.keys(saved.exceptions),['L2']);
app.choose('P2');await settle();assert.match(app.element('pa-classes').innerHTML,/Class C/);assert.doesNotMatch(app.element('pa-classes').innerHTML,/Class A/);
assert.equal(app.element('pa-return').href,'/academy/#activity/PROGRAM/P2');assert.equal(app.selected.at(-1),'P2');assert.equal(app.location.search,'?program=P2');
const admin=fixture({role:'GLOBAL_ADMIN'});await settle();assert.equal(admin.element('pa-return').href,'/programs/?program=P1');
admin.choose('P2');await settle();assert.equal(admin.element('pa-return').href,'/programs/?program=P2');

const dirty=fixture();await settle();dirty.change('C1','S1','ABSENT');dirty.setDiscard(false);dirty.choose('P2');dirty.date('2026-10-10');
assert.equal(dirty.location.search,'?program=P1');assert.equal(dirty.element('pa-date').value,'2026-10-11');
const unload={preventDefault(){this.prevented=true;}};dirty.handlers.get('beforeunload')(unload);assert.equal(unload.prevented,true);
dirty.setDiscard(true);dirty.date('2026-10-10');await settle();dirty.save('C1');await settle();
saved=dirty.requests.filter(r=>r.action==='submit').at(-1).body;
assert.deepEqual(Object.keys(saved.baseRegisterIds),['L1'],'Earlier dates correct only existing registers');

const lost=fixture();await settle();lost.change('C1','S1','EXCUSED');lost.setSubmitError({status:0});lost.save('C1');lost.save('C1');await settle();
assert.equal(lost.requests.filter(r=>r.action==='submit').length,1);assert.equal(lost.element('pa-pending').hidden,false);assert.equal(lost.element('pa-date').disabled,true);
const original=structuredClone(lost.requests.filter(r=>r.action==='submit')[0].body);lost.choose('P2');lost.date('2026-10-09');assert.equal(lost.location.search,'?program=P1');
const resumed=fixture({storage:lost.storage});await settle();assert.equal(resumed.element('pa-pending').hidden,false);
resumed.element('pa-retry').listeners.click();await settle();assert.deepEqual(resumed.requests.find(r=>r.action==='submit').body,original,'Reload retry preserves operation, revisions and exceptions');assert.equal(resumed.element('pa-pending').hidden,true);
const other=fixture({storage:lost.storage,session:'different-session'});await settle();assert.equal(other.element('pa-pending').hidden,true,'Another session cannot replay the prior account’s pending submission');

const conflict=fixture();await settle();conflict.change('C1','S1','EXCUSED');conflict.setSubmitError({status:409,message:'Register changed'});conflict.save('C1');await settle();
assert.match(conflict.element('pa-message').textContent,/Register changed.*Refresh/);assert.equal(conflict.element('pa-pending').hidden,true);
const count=conflict.requests.length;conflict.save('C1');assert.equal(conflict.requests.length,count);
conflict.setSubmitError(null);conflict.element('pa-refresh').listeners.click();await settle();conflict.save('C1');await settle();assert.equal(conflict.requests.filter(r=>r.action==='submit').length,2);

const parallelDraft=fixture();await settle();parallelDraft.change('C1','S1','ABSENT');parallelDraft.data.P1.lessons[0].registerId='REG-NEWER';parallelDraft.save('C2');await settle();parallelDraft.save('C1');await settle();
assert.equal(parallelDraft.requests.filter(r=>r.action==='submit').at(-1).body.baseRegisterIds.L1,'REG-L1','Refreshing after another class save cannot advance the base underneath a draft');
const blocked=fixture();await settle();blocked.blockStorage();blocked.save('C1');await settle();assert.equal(blocked.requests.filter(r=>r.action==='submit').length,0);assert.match(blocked.element('pa-message').textContent,/session storage/);
const failedRefresh=fixture();await settle();failedRefresh.setGetError('Read failed');failedRefresh.save('C1');await settle();assert.equal(failedRefresh.element('pa-message').textContent,'Read failed');const before=failedRefresh.requests.length;failedRefresh.save('C1');assert.equal(failedRefresh.requests.length,before);
const inaccessible=fixture({requested:'outside-scope'});await settle();assert.equal(inaccessible.requests.filter(r=>r.action==='get').length,0);assert.match(inaccessible.element('pa-message').textContent,/unavailable/);inaccessible.choose('P1');await settle();assert.match(inaccessible.element('pa-classes').innerHTML,/Class A/);
const replacedLesson=fixture();await settle();replacedLesson.chooseLesson('C1','L2');replacedLesson.data.P1.lessons[1].lesson.anchor='REPLACEMENT';replacedLesson.element('pa-refresh').listeners.click();await settle();replacedLesson.save('C1');await settle();assert.deepEqual(Object.keys(replacedLesson.requests.filter(r=>r.action==='submit').at(-1).body.baseRegisterIds),['L1','REPLACEMENT'],'A refreshed publication resets a lesson selection that no longer exists');
for(const action of ['get','submit']){
  const signedout=fixture();await settle();signedout.hold(action);
  if(action==='get')signedout.element('pa-refresh').listeners.click();else signedout.save('C1');
  await settle();signedout.signout();signedout.release();await settle();
  assert.equal(signedout.element('pa-workspace').hidden,true);assert.equal(signedout.element('pa-classes').innerHTML,'');assert.match(signedout.element('pa-message').textContent,/Sign in/);
}
const inline=fixture({embedded:true});await settle();assert.equal(inline.requests.length,0,'Attendance does not load before the inline tool is opened');
const inlineOptions={id:'P1',programs:[{id:'P1',name:'Alimiyah',role:'TEACHER'}]};
inline.controller.open(inlineOptions);await settle();assert.equal(inline.requests.length,1);assert.equal(inline.requests[0].action,'get','Reuse the verified Academy Program list');
assert.equal(inline.location.search,'?program=P1','The embedded editor leaves its host address alone');
inline.change('C1','S1','ABSENT');inline.setDiscard(false);assert.equal(inline.controller.canLeave(),false);inline.setDiscard(true);assert.equal(inline.controller.canLeave(),true);
inline.setSubmitError({status:0,message:'Connection interrupted'});inline.save('C1');await settle();assert.equal(inline.controller.canLeave(),false,'Pending submissions lock inline navigation');
const pendingInline=inline.requests.find(r=>r.action==='submit').body;inline.controller.reset();assert.equal(inline.element('pa-classes').innerHTML,'');
inline.controller.open(inlineOptions);await settle();assert.equal(inline.element('pa-pending').hidden,false);inline.setSubmitError(null);inline.element('pa-retry').listeners.click();await settle();
assert.deepEqual(inline.requests.filter(r=>r.action==='submit').at(-1).body,pendingInline,'Inline reopen retries the exact saved operation');
inline.signout();await settle();assert.equal(inline.element('pa-workspace').hidden,true);assert.equal(inline.element('pa-classes').innerHTML,'');
console.log('Public and inline Attendance: class/lesson saves, lazy scoped loading, navigation guards, mixed marks, historical corrections, exact reload retries, stale revisions, read/storage failures and delayed sign-out responses passed.');
