import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';import {createRequire} from 'node:module';
const {parseHTML}=createRequire(import.meta.url)('linkedom'),code=readFileSync(new URL('../../js/m4l-mou-playlists.js',import.meta.url),'utf8');
const settle=async()=>{for(let i=0;i<8;i++)await new Promise(r=>setImmediate(r));};
async function screen(props={},rows=[]){
 const {window,document}=parseHTML('<html><body><main></main></body></html>');const calls=[];let revision=1;
 vm.runInNewContext(code,{window,document,crypto,localStorage:{getItem:()=> 'synthetic-actor'}});
 const transport=async command=>{calls.push(structuredClone(command));if(command.action==='mou-playlists')return {revision,accessModel:props.accessModel||'MONTHLY',playlists:structuredClone(rows)};if(command.action==='mou-playlist-save'){const old=rows.find(r=>r.id===command.playlistId);if(old)Object.assign(old,{name:command.name,closeDate:command.closeDate,revision:old.revision+1});else rows.push({id:command.playlistId,name:command.name,closeDate:command.closeDate,revision:1,websiteRevision:0,enabled:false,recordings:0});revision++;return {saved:true};}throw Error('Unexpected command '+command.action);};
 await window.M4L_RECORDING_PLAYLISTS.mount(document.querySelector('main'),{transport,...props});
 const click=async selector=>{document.querySelector(selector).click();await settle();};const type=async(selector,value)=>{const node=document.querySelector(selector);node.value=value;node.dispatchEvent(new window.Event('input',{bubbles:true}));await settle();};return {window,document,calls,rows,click,type};
}
test('Tafseer creates an open Surah through the shared settings without a date, session or publication',async()=>{
 const f=await screen({label:'Surah playlists',itemLabel:'Surah'});assert(f.document.querySelector('h2').textContent==='Surah playlists');assert.equal(f.window.M4L_RECORDING_PLAYLISTS,f.window.M4L_MOU_PLAYLISTS);
 await f.click('[data-playlist-action=add]');await f.type('[data-playlist-field=name]','Surah Maryam');await f.click('[data-playlist-action=save]');const writes=f.calls.filter(c=>c.action!=='mou-playlists');assert.equal(writes.length,1);assert.equal(writes[0].closeDate,'');assert.equal(writes[0].name,'Surah Maryam');assert(!('sessionId' in writes[0]));assert(!('published' in writes[0]));assert.equal(f.rows[0].enabled,false);
});
test('Course dates stay editorial and do not invoke a monthly entitlement correction',async()=>{
 const f=await screen({label:'Course playlists',accessModel:'COURSE'},[{id:'native-course-playlist',name:'Part 1',closeDate:'2024-01-01',closeMonth:'2024-01',revision:1,websiteRevision:0,enabled:false,recordings:2}]);
 assert.match(f.document.body.textContent,/optional and editorial/);assert(!f.document.body.textContent.includes('current paid month'));await f.type('[data-playlist-field=closeDate]','2024-02-01');await f.click('[data-playlist-action=save]');assert.equal(f.calls.filter(c=>c.action==='mou-playlist-correction').length,0);assert.equal(f.calls.filter(c=>c.action==='mou-playlist-save').length,1);
});
test('historical Surahs remain readonly in the common model and keep their separate checked settings',async()=>{
 const legacy=[];const f=await screen({label:'Surah playlists',onLegacy:async id=>legacy.push(id)},[{id:'exact-legacy-surah',name:'Legacy Surah',closeDate:'',closeMonth:'2024-01',revision:3,enabled:true,legacy:true,recordings:null}]);
 const row=f.document.querySelector('[data-playlist-id]');assert.match(row.textContent,/Historical · existing access/);assert(row.querySelector('[data-playlist-field=name]').disabled);assert(row.querySelector('[data-playlist-field=closeDate]').disabled);assert.equal(row.querySelector('[data-playlist-action=save]'),null);assert.equal(row.querySelector('[data-playlist-action=publication]'),null);await f.click('[data-playlist-id] [data-playlist-action=legacy]');assert.deepEqual(legacy,['exact-legacy-surah']);assert.equal(f.calls.length,1);
});
test('Academy uses native class/subject/Teacher selector hooks and blocks leaving unsaved common settings',async()=>{
 let created=0,edited;const rows=[{id:'native-programme-playlist',name:'Mishkaat',closeDate:'',revision:1,enabled:true,recordings:1}];const f=await screen({label:'Programme playlists',accessModel:'ACADEMY',onCreate:async()=>{created++;return false;},onEditContext:async row=>{edited=row.id;}},rows);
 await f.click('[data-playlist-action=add]');assert.equal(created,1);assert.equal(f.calls.length,1,'Cancelling native creation does not reload');await f.click('[data-playlist-action=context]');assert.equal(edited,'native-programme-playlist');await f.type('[data-playlist-field=name]','Unsaved');await f.click('[data-playlist-action=add]');assert.equal(created,1);assert.match(f.document.body.textContent,/Save, discard or retry/);
});
