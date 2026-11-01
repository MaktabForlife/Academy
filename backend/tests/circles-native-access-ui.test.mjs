import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';import {createRequire} from 'node:module';
const {parseHTML}=createRequire(import.meta.url)('linkedom'),code=readFileSync(new URL('../../js/m4l-circles-access.js',import.meta.url),'utf8');
const item=(area,id)=>({area,activityKey:(area==='courses'?'COURSE:':'PROGRAM:')+id,offeringId:id,title:id,kind:area==='courses'?'COURSE':'TAFSEER',ownership:'STUDIO',enabled:true});
function screen(reply){
 const {window,document}=parseHTML('<html><head></head><body><main id="host"></main></body></html>');let owner='account-A',dirty=false;const opened=[],requests=[],playlistMounts=[],requestBodies=[];
 window.M4L_STUDIO_ACCESS={canLeave:()=>!dirty,reset(){},attach(host,key){opened.push(key);host.textContent='Private '+key;return {data:{kind:key.startsWith('COURSE:')?'COURSE':'TAFSEER'},loading:Promise.resolve()};}};
 window.M4L_PROGRAM_MONTHLY={canLeave:()=>!dirty,unmount(){},async mount(host,key){opened.push('PROGRAM:'+key);host.textContent='Monthly matrix '+key;}};window.M4L_PROGRAM_SURAHS={canLeave:()=>!dirty,unmount(){},async mount(host,key){host.textContent='Surah table '+key;}};
 window.M4L_RECORDING_PLAYLISTS=window.M4L_MOU_PLAYLISTS={canLeave:()=>!dirty,unmount(){},async mount(host,options){playlistMounts.push(options);host.textContent=options.label;}};
 const fetcher=async(_url,options)=>{const body=JSON.parse(options.body),command=body.command;requestBodies.push(body);requests.push(command);return Response.json({success:true,schema:'STUDIO_ACCESS_CATALOGUE_V1',more:false,nextCursor:null,...await reply(command)});};
 vm.runInContext(code,vm.createContext({window,document,localStorage:{getItem:()=>owner},fetch:fetcher,Response}));
 return {window,document,opened,requests,playlistMounts,requestBodies,host:document.getElementById('host'),dirty(value){dirty=value;},switch(){owner='account-B';window.dispatchEvent(new window.Event('focus'));}};
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

test('Tafseer, MOU and Course all mount the same checked playlist settings with their own access policy',async()=>{
 const s=screen(({area})=>({items:[item(area,area+'-native')]}));await s.window.M4L_CIRCLES_ACCESS.open(s.host);
 await s.host.querySelector('[data-access-view=playlists]').onclick();assert.equal(s.playlistMounts.at(-1).label,'Surah playlists');assert.equal(s.playlistMounts.at(-1).accessModel,'MONTHLY');assert.equal(typeof s.playlistMounts.at(-1).onLegacy,'function');assert.equal(s.requests.length,1);
 s.host.querySelector('[data-area=mothers]').click();await settle();await s.host.querySelector('[data-access-view=playlists]').onclick();assert.equal(s.playlistMounts.at(-1).label,'MOU playlists');assert.equal(s.playlistMounts.at(-1).accessModel,'MONTHLY');
 s.host.querySelector('[data-area=courses]').click();await settle();assert.equal(s.opened.at(-1),'COURSE:courses-native','Course access records remain the default view');await s.host.querySelector('[data-access-view=playlists]').onclick();assert.equal(s.playlistMounts.at(-1).label,'Course playlists');assert.equal(s.playlistMounts.at(-1).accessModel,'COURSE');assert.equal(s.playlistMounts.at(-1).onLegacy,undefined);assert.equal(s.requests.length,3,'Changing table tabs does not reload the catalogue');
});
test('unpublished access ownership and unsaved changes cannot enter a new playlist management route',async()=>{
 const s=screen(({area})=>({items:[{...item(area,area+'-native'),ownership:'ACADEMY'}]}));await s.window.M4L_CIRCLES_ACCESS.open(s.host);assert.equal(s.host.querySelector('[data-access-view=playlists]'),null);assert(s.host.querySelector('[data-access-view=surahs]'));assert.equal(s.playlistMounts.length,0);
 const t=screen(({area})=>({items:[item(area,area+'-native')]}));await t.window.M4L_CIRCLES_ACCESS.open(t.host);t.dirty(true);await t.host.querySelector('[data-access-view=playlists]').onclick();assert.equal(t.playlistMounts.length,0);assert.equal(t.requests.length,1);
});
