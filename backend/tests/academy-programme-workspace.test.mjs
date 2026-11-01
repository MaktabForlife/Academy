import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import {programmePageGroups} from '../src/academy/d1/web-platform/programme-groups.mjs';
const require=createRequire(import.meta.url),{parseHTML}=require('linkedom');
const script=readFileSync(new URL('../../js/m4l-programme-workspace.js',import.meta.url),'utf8');
const row={kind:'PROGRAM',id:'one',name:'Native programme',roles:['STUDENT']},arabic={...row,id:'two'},reboot={...row,id:'reboot'};
const home={signedIn:true,timezone:'Africa/Johannesburg',personalActivities:[row,arabic,reboot],programmePageGroups:[['PROGRAM:one','PROGRAM:two']],calendarEvents:[]};
const lesson=(index=0,extra={})=>({kind:'PROGRAM',activityId:'one',activityName:'Native programme',date:'2026-11-01',status:'SCHEDULED',title:'Lesson '+index,startTime:'10:00',endTime:'11:00',startsAt:1000+index*10000,endsAt:9000+index*10000,joinAvailableAt:1000+index*10000-300000,joinKey:'native-'+index,...extra});
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function ui({summary=async()=>({notes:[],before:null})}={}){
 const {window,document}=parseHTML('<html><body><section id="activity"><div class="learning-workspace"><div id="activity-menu"><button data-programme-calendar>Calendar</button><button data-class-notes-toggle>Notes</button></div><div class="learning-reading"><section id="pa-main"><a id="pa-close">Close</a><h2>Attendance</h2><input value="kept register"></section><section id="activity-planning"><h2>Planner</h2><textarea>kept plan</textarea></section><section id="as-panel"></section><section id="activity-schedule"><div id="activity-sessions"></div></section></div></div></section></body></html>');
 let session='account-a',height=450,mode='LEARN',nextFrame=0;const resize=[],handlers=new Map(),calls=[],observed=[],frames=new Map();
 window.requestAnimationFrame=fn=>{frames.set(++nextFrame,fn);return nextFrame;};window.cancelAnimationFrame=id=>frames.delete(id);
 const runFrames=()=>{const work=[...frames.values()];frames.clear();for(const fn of work)fn();};
 window.M4L_ACADEMY_WORKSPACE={current:()=>mode,classView:()=>null,head:()=>null};window.M4L_CLASS_NOTES={visible:()=>true,buttons:()=>'<button data-cn-open="notes">Notes</button>',summary:async input=>{calls.push(input);return summary(input);},open:input=>{window.lastNote=input;}};
 window.HTMLElement.prototype.getBoundingClientRect=function(){return {height:this.classList.contains('programme-centre')?height:this.classList.contains('programme-note')?100:0};};
 Object.defineProperty(window.HTMLElement.prototype,'offsetHeight',{configurable:true,get(){return this.tagName==='HEADER'?90:this.tagName==='FOOTER'?50:0;}});
 Object.defineProperty(window.HTMLElement.prototype,'clientHeight',{configurable:true,get(){return Number.parseFloat(this.style?.height)||height;}});
 window.HTMLElement.prototype.showModal=function(){this.open=true;};window.HTMLElement.prototype.close=function(){this.open=false;};
 class Observer{constructor(fn){resize.push(fn);}observe(node){observed.push(node.className);}disconnect(){}}
 vm.runInNewContext(script,{window,document,localStorage:{getItem:()=>session},Intl,Date,ResizeObserver:Observer});
 const render=(overrides={})=>window.M4L_PROGRAMME_WORKSPACE.render({row,home,rows:[lesson()],mode:'learn',startDate:'2026-11-01',...overrides});
 const click=selector=>document.querySelector(selector).dispatchEvent(new window.Event('click',{bubbles:true}));
 return {window,document,render,calls,click,handlers,observed,frames,runFrames,model:window.M4L_PROGRAMME_WORKSPACE_MODEL,reset:()=>window.M4L_PROGRAMME_WORKSPACE.reset(),notifyResize(value){height=value;resize.forEach(fn=>fn());},setHeight(value){height=value;resize.forEach(fn=>fn());runFrames();},setSession(value){session=value;},setMode(value){mode=value;}};
}

test('shared Programme groups use exact configured native identities and only current selected-view activity rights',()=>{
 const env={WEBSITE_PLATFORM_NAVIGATION:JSON.stringify({alimiyah:'one','arabic-intensive':'two',reboot:'reboot'})};
 assert.deepEqual(programmePageGroups(home,env),[['PROGRAM:one','PROGRAM:two']]);
 assert.deepEqual(programmePageGroups({...home,personalActivities:[row,{...arabic,roles:[]},reboot]},env),[['PROGRAM:one']]);
 assert.deepEqual(programmePageGroups({...home,signedIn:false},env),[]);
 const f=ui();assert.deepEqual([...f.model.programmeKeys(home,row,'learn')],['PROGRAM:one','PROGRAM:two']);assert.deepEqual([...f.model.programmeKeys(home,row,'teach')],['PROGRAM:one']);assert.deepEqual([...f.model.programmeKeys(home,reboot,'learn')],['PROGRAM:reboot']);
});

test('circle includes every session in the selected date scope, preserves overlap/cancellation and exact Join presentation boundaries',()=>{
 const f=ui(),rows=Array.from({length:13},(_,i)=>lesson(i)),before=JSON.stringify(rows);
 assert.equal(f.model.dayRows(rows,'2026-11-01',0).length,13);assert.equal(JSON.stringify(rows),before);
 assert.equal(f.model.dayRows([lesson(0)],'2026-11-01',-299001)[0].canJoin,false);assert.equal(f.model.dayRows([lesson(0)],'2026-11-01',-299000)[0].canJoin,true);assert.equal(f.model.dayRows([lesson(0)],'2026-11-01',9000)[0].canJoin,false);
 assert.equal(f.model.dayRows([lesson(0,{status:'CANCELLED'})],'2026-11-01',1000)[0].canJoin,false);
 assert.equal(f.model.dayRows([lesson(),lesson(1,{startsAt:1000})],'2026-11-01',1001).filter(row=>row.phase==='active').length,2);
 assert.equal(f.model.dayRows(rows,'2026-11-02').length,0);
});

test('programme circle follows the dashboard timezone across midnight while retaining original Join and notes identity',async()=>{
 const f=ui(),raw=lesson(0,{date:'2026-11-01',startTime:'23:30',endTime:'00:30',startsAt:Date.parse('2026-11-01T21:30:00Z'),endsAt:Date.parse('2026-11-01T22:30:00Z'),joinAvailableAt:Date.parse('2026-11-01T21:25:00Z'),mediaSessionKey:'original-notes',timezone:'Africa/Johannesburg'}),before=JSON.stringify(raw);
 const rows=f.model.displayRows([raw],'Asia/Riyadh');
 assert.equal(rows[0].date,'2026-11-02');assert.equal(rows[0].startTime,'00:30');assert.equal(rows[0].endTime,'01:30');assert.equal(rows[0].endDate,'2026-11-02');
 assert.equal(rows[0].sourceDate,'2026-11-01');assert.equal(rows[0].joinKey,raw.joinKey);assert.equal(rows[0].mediaSessionKey,raw.mediaSessionKey);assert.equal(rows[0].startsAt,raw.startsAt);assert.equal(JSON.stringify(raw),before);
 assert.equal(f.model.dayRows(rows,'2026-11-01').length,0);assert.equal(f.model.dayRows(rows,'2026-11-02',raw.joinAvailableAt)[0].canJoin,true);
 const again=f.model.displayRows(rows,'Asia/Riyadh');assert.equal(again[0].sourceDate,'2026-11-01');
 f.render({home:{...home,timezone:'Asia/Riyadh'},rows,startDate:'2026-11-02'});await flush();f.click('[data-programme-day="2026-11-02"]');
 assert.match(f.document.querySelector('.programme-session time').textContent,/00:30–01:30/);assert.match(f.document.querySelector('.programme-circle-caption').textContent,/Asia\/Riyadh/);
});

test('programme layout docks native menu/circle/notes together, handles all slices and restores native hosts on reset',async()=>{
 const f=ui();f.render({rows:Array.from({length:13},(_,i)=>lesson(i))});await flush();
 const top=f.document.querySelector('.programme-top');assert(top);assert.equal(top.children[0].id,'activity-menu');assert(top.children[1].contains(f.document.getElementById('activity-schedule')));assert.equal(top.children[2].className,'programme-notes');
 assert.equal(f.document.querySelectorAll('.programme-session-list .programme-session').length,13);assert.equal(f.document.getElementById('activity-sessions').hidden,true);assert.equal(f.calls.length,2,'One bounded summary per exact programme, never per slice');
 f.render();await flush();assert.equal(f.calls.length,2,'Ordinary rerenders reuse current notes');
 f.reset();assert.equal(f.document.querySelector('.programme-top'),null);assert(f.document.querySelector('.learning-reading').contains(f.document.getElementById('activity-schedule')));assert.equal(f.document.getElementById('activity-menu').parentElement.className,'learning-workspace');assert.equal(f.document.getElementById('activity-sessions').hidden,false);
});

test('notes are latest first, fit available space, open in a popup and page only on deliberate opaque-cursor actions',async()=>{
 const notes=Array.from({length:8},(_,i)=>({id:'note-'+i,body:i===0?'<script>kept as text</script>':'Full readable note '+i,author:'Teacher',createdAt:'2026-11-01T'+String(8+i).padStart(2,'0')+':00:00Z',source:{title:'Native lesson'}}));
 const f=ui({summary:async input=>input.before?{notes:[],before:'opaque-next'}:{notes,before:'opaque-first'}});f.render({home:{...home,personalActivities:[row],programmePageGroups:[]}});await flush();f.setHeight(450);
 const visible=()=>[...f.document.querySelectorAll('.programme-note-list .programme-note')].filter(node=>!node.hidden);
 assert(visible().length>0&&visible().length<8);assert.match(visible()[0].textContent,/readable note 7/);const short=visible().length;f.setHeight(800);assert(visible().length>short);
 f.click('[data-programme-more]');assert.equal(f.document.querySelector('.programme-popup').open,true);assert.equal(f.document.querySelectorAll('.programme-popup .programme-note').length,8);assert.equal(f.document.querySelector('.programme-popup script'),null);
 f.click('[data-programme-earlier]');await flush();assert.equal(f.calls.length,2);assert.equal(f.calls[1].before,'opaque-first');await flush();assert.equal(f.calls.length,2,'An empty sparse page must not automatically exhaust history');
 f.click('.programme-popup [data-programme-note]');assert.equal(f.window.lastNote.activityKey,'PROGRAM:one');assert.equal(f.window.lastNote.noteId,'note-7');
});

test('pending summaries cannot repaint after account/view reset; Admin never mounts a learner programme layout',async()=>{
 let resolve;const f=ui({summary:()=>new Promise(done=>{resolve=done;})});f.render({home:{...home,personalActivities:[row],programmePageGroups:[]}});f.setSession('account-b');f.reset();resolve({notes:[{id:'private',body:'Old account text',createdAt:'2026-11-01T08:00:00Z'}],before:null});await flush();assert(!f.document.body.textContent.includes('Old account text'));
 f.setMode('ADMIN');f.render();assert.equal(f.document.querySelector('.programme-top'),null);
});

test('notes sizing observes only its source column, coalesces resize work and cancels it on reset',async()=>{
 const f=ui();f.render();await flush();assert.deepEqual(f.observed,['programme-centre']);
 f.notifyResize(600);f.notifyResize(600);f.notifyResize(600);assert.equal(f.frames.size,1);
 f.runFrames();const panel=f.document.querySelector('.programme-notes');assert.equal(panel.style.height,'600px');assert.equal(f.frames.size,0);
 let writes=0;const style=panel.style;Object.defineProperty(style,'height',{configurable:true,get:()=> '600px',set(){writes++;}});
 f.notifyResize(600);f.runFrames();assert.equal(writes,0,'The same size is not written again');
 f.notifyResize(700);assert.equal(f.frames.size,1);const late=[...f.frames.values()][0];f.reset();assert.equal(f.frames.size,0);late();assert.equal(f.document.querySelector('.programme-top'),null);
});

test('Teach stacks the existing Attendance and Planner hosts above Notes, keeps their drafts and restores hosts on exit',async()=>{
 const f=ui(),attendance=f.document.getElementById('pa-main'),planner=f.document.getElementById('activity-planning');f.setMode('TEACH');
 f.render({mode:'teach',row:{...row,roles:['TEACHER']}});await flush();
 const panel=f.document.querySelector('.programme-teach-panel');assert(panel);assert.equal(panel.children[0],attendance);assert.equal(panel.children[1],planner);assert.equal(panel.children[2].className,'programme-teach-notes');
 assert.equal(attendance.querySelector('input').value,'kept register');assert.equal(planner.querySelector('textarea').value,'kept plan');
 f.render({mode:'teach',row:{...row,roles:['TEACHER']}});await flush();assert.equal(panel.children[0],attendance);assert.equal(panel.children[1],planner);
 assert.equal(f.document.getElementById('as-panel').parentElement.className,'learning-reading','Assessments remain below the circle');
 f.document.getElementById('pa-close').hidden=true;f.reset();assert.equal(f.document.getElementById('pa-close').hidden,false);assert.equal(attendance.parentElement.className,'learning-reading');assert.equal(planner.parentElement.className,'learning-reading');assert.equal(planner.querySelector('textarea').value,'kept plan');
});

test('Teach day selection respects the current register guard and passes the selected date only after approval',async()=>{
 const f=ui();let allowed=false,selected='';f.setMode('TEACH');f.render({mode:'teach',canChangeDay:()=>allowed,onDayChange:value=>selected=value});await flush();
 f.click('[data-programme-day="2026-11-02"]');assert.equal(selected,'');assert.equal(f.window.M4L_PROGRAMME_WORKSPACE.day(),'2026-11-01');
 allowed=true;f.click('[data-programme-day="2026-11-02"]');assert.equal(selected,'2026-11-02');assert.equal(f.window.M4L_PROGRAMME_WORKSPACE.day(),'2026-11-02');
});

test('a denied grouped programme retains only independently permitted notes',async()=>{
 const f=ui({summary:async input=>{if(input.activityKey==='PROGRAM:two')throw Object.assign(Error('Outside current class'),{status:403});return {notes:[{id:'permitted',body:'Permitted programme note',createdAt:'2026-11-01T08:00:00Z'}],before:null};}});
 f.render();await flush();assert.equal(f.calls.length,2);assert.equal(f.document.querySelectorAll('.programme-note').length,1);assert.match(f.document.body.textContent,/Permitted programme note/);assert(f.document.querySelector('[data-programme-retry]'));
});

test('a later summary denial clears previously displayed notes from both sidebar and popup',async()=>{
 for(const status of [401,403,404]){
  let denied=false;const f=ui({summary:async()=>{if(denied)throw Object.assign(Error('Current access unavailable'),{status});return {notes:[{id:'earlier',body:'Previously permitted body',createdAt:'2026-11-01T08:00:00Z'}],before:'opaque-history'};}});
  f.render({home:{...home,personalActivities:[row],programmePageGroups:[]}});await flush();f.click('[data-programme-more]');assert.match(f.document.body.textContent,/Previously permitted body/);
  denied=true;f.click('[data-programme-earlier]');await flush();assert(!f.document.body.textContent.includes('Previously permitted body'));assert.equal(f.document.querySelectorAll('.programme-note').length,0);assert(f.document.querySelector('[data-programme-retry]'));assert.equal(f.calls.length,2);
 }
});

test('programme Calendar is a viewing popup with current authorised events and no editing controls',async()=>{
 const f=ui();f.render({home:{...home,calendarEvents:[{description:'Native term event',startDate:'2026-11-01',endDate:'2026-11-03'}]}});await flush();f.click('[data-programme-calendar]');const popup=f.document.querySelector('.programme-popup');assert.equal(popup.open,true);assert.match(popup.textContent,/Native term event/);assert.match(popup.textContent,/2026-11-03/);assert.equal(popup.querySelectorAll('input,textarea,a').length,0);
});
