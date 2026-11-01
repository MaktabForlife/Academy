import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';import {createRequire} from 'node:module';
const {parseHTML}=createRequire(import.meta.url)('linkedom'),code=readFileSync(new URL('../../js/m4l-circles-access.js',import.meta.url),'utf8');
const item=(area,id)=>({area,activityKey:(area==='courses'?'COURSE:':'PROGRAM:')+id,offeringId:id,title:id,kind:area==='courses'?'COURSE':'TAFSEER',ownership:'STUDIO',enabled:true});
function screen(reply){
 const {window,document}=parseHTML('<html><head></head><body><main id="host"></main></body></html>');let owner='account-A',dirty=false;const opened=[],requests=[];
 window.M4L_STUDIO_ACCESS={canLeave:()=>!dirty,reset(){},attach(host,key){opened.push(key);host.textContent='Private '+key;return {data:{kind:key.startsWith('COURSE:')?'COURSE':'TAFSEER'},loading:Promise.resolve()};}};
 window.M4L_PROGRAM_MONTHLY={canLeave:()=>!dirty,unmount(){},async mount(host,key){opened.push('PROGRAM:'+key);host.textContent='Monthly matrix '+key;}};window.M4L_PROGRAM_SURAHS={canLeave:()=>!dirty,unmount(){},async mount(host,key){host.textContent='Surah table '+key;}};
 const fetcher=async(_url,options)=>{const command=JSON.parse(options.body).command;requests.push(command);return Response.json({success:true,schema:'STUDIO_ACCESS_CATALOGUE_V1',more:false,nextCursor:null,...await reply(command)});};
 vm.runInContext(code,vm.createContext({window,document,localStorage:{getItem:()=>owner},fetch:fetcher,Response}));
 return {window,document,opened,requests,host:document.getElementById('host'),dirty(value){dirty=value;},switch(){owner='account-B';window.dispatchEvent(new window.Event('focus'));}};
}
const settle=async()=>{for(let i=0;i<8;i++)await new Promise(done=>setImmediate(done));};
test('production access chooser uses checked catalogue and guards native unsaved changes',async()=>{
 const s=screen(({area})=>({items:[item(area,area+'-one'),...(area==='courses'?[item(area,'course-two')]:[])]}));await s.window.M4L_CIRCLES_ACCESS.open(s.host);assert.deepEqual(s.opened,['PROGRAM:tafseer-one']);
 s.dirty(true);s.host.querySelector('[data-area=courses]').click();await settle();assert.equal(s.requests.length,1);assert.match(s.host.textContent,/Save or discard/);
 s.dirty(false);s.host.querySelector('[data-area=courses]').click();await settle();assert.equal(s.requests.length,2);assert.equal(s.opened.at(-1),'COURSE:courses-one');
 const picker=s.host.querySelector('#access-offering');picker.querySelector('[selected]').removeAttribute('selected');picker.querySelector('[value="COURSE:course-two"]').setAttribute('selected','');await picker.onchange();assert.equal(s.opened.at(-1),'COURSE:course-two');assert.equal(s.requests.length,2,'Selecting a checked choice does not reload the catalogue');
});
test('empty bounded candidate page offers continuation; unavailable ownership cannot open a writable editor',async()=>{
 const s=screen(({area,cursor})=>!cursor?{items:[],more:true,nextCursor:'PROGRAM:checked-candidate'}:{items:[{...item(area,'disabled'),enabled:false,ownership:'FROZEN'}]});await s.window.M4L_CIRCLES_ACCESS.open(s.host);assert.equal(s.host.querySelector('.access-catalogue-pages').hidden,false);assert.match(s.host.textContent,/Continue to the next page/);
 s.host.querySelector('[data-catalogue-page=next]').click();await settle();assert.equal(s.requests[1].cursor,'PROGRAM:checked-candidate');assert.deepEqual(s.opened,[]);assert.match(s.host.textContent,/temporarily unavailable/);
});
test('account change clears catalogue and rejects delayed previous-account results',async()=>{
 let release;const s=screen(()=>new Promise(done=>{release=done;}));const opening=s.window.M4L_CIRCLES_ACCESS.open(s.host);s.switch();release({items:[item('tafseer','old-private-title')]});await opening;
 assert.deepEqual(s.opened,[]);assert(!s.host.textContent.includes('old-private-title'));assert.match(s.host.textContent,/account changed/);assert.equal(s.host.querySelector('#access-offering').children.length,0);assert([...s.host.querySelectorAll('button[data-area]')].every(button=>button.disabled));
});
