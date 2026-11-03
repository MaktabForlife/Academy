import test from 'node:test';
import assert from 'node:assert/strict';
import {studentJournalFixture} from './fixtures/academy-student-journal-fixture.mjs';
import {journalDraft,journalAPI} from '../../academy/journal/client.mjs';
const pause=()=>new Promise(resolve=>setImmediate(resolve));
const memoryDevice=()=>{const rows=new Map();return {rows,get:async key=>structuredClone(rows.get(key)||null),list:async prefix=>[...rows].filter(([key])=>key.startsWith(prefix)).map(([,value])=>structuredClone(value)),put:async values=>{for(const [key,value] of values)rows.set(key,structuredClone(value));},remove:async keys=>{for(const key of keys)rows.delete(key);},removePrefix:async prefix=>{for(const key of rows.keys())if(key.startsWith(prefix))rows.delete(key);}};};
test('typing and device draft persistence never save to the server; manual Save acknowledges only its snapshot',async()=>{
 const calls=[],local=[];let finish;const draft=journalDraft({fields:{reflection:''},save:body=>{calls.push(body);return new Promise(resolve=>finish=resolve);},persist:async value=>local.push(value)});
 draft.set({reflection:'First'});await draft.flushDevice();await pause();assert.equal(calls.length,0);assert.equal(local.at(-1).fields.reflection,'First');
 const saving=draft.save();await pause();draft.set({reflection:'Later local thought'});finish({entry:{id:calls[0].id,revision:1,documentVersion:'new',reflection:'First'}});await saving;await draft.flushDevice();assert.equal(calls.length,1);assert.equal(draft.fields.reflection,'Later local thought');assert(draft.dirty);draft.stop();
});
test('reloading a device draft restores its base version and exact uncertain retry without autosave',async()=>{
 let persisted,first;const a=journalDraft({fields:{reflection:''},documentVersion:'version-one',persist:async value=>persisted=structuredClone(value),save:async body=>{first=body;throw Error('Lost response');}});a.set({reflection:'Keep me'});await assert.rejects(a.save());await a.flushDevice();a.stop();
 let sent;const b=journalDraft({restore:persisted,prepareVersion:()=> 'newer-confirmed-copy',persist:async()=>{},save:async body=>{sent=body;return {entry:{id:body.id,revision:1,documentVersion:'version-two',reflection:'Keep me'}};}});await pause();assert.equal(sent,undefined);await b.save();assert.deepEqual(sent,first);assert(!b.dirty);b.stop();
});
test('confirmed Save updates the device copy without another fetch; list, get and export use that copy',async()=>{
 const oldWindow=globalThis.window,oldStorage=globalThis.localStorage,device=memoryDevice(),requests=[];globalThis.window={M4L_CONFIG:{API_BASE:''}};globalThis.localStorage={getItem:()=> 'student-token'};
 const ownerKey='a'.repeat(64),entry={id:crypto.randomUUID(),revision:1,sourceKey:null,course:'',surah:'',lesson:'',ayah:'',question:'',reflection:'Confirmed',entryDate:'',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
 const api=journalAPI({device,fetcher:async(path,options)=>{requests.push(path);return Response.json({success:true,ownerKey,version:requests.length===1?null:'etag-two',revision:requests.length===1?0:1,entries:requests.length===1?[]:[entry],entry});}});
 try{await api.request('list');await api.request('save',{id:entry.id,revision:0,version:null,operationId:crypto.randomUUID(),fields:{reflection:'Confirmed'}});assert.equal(requests.length,2);assert.equal([...device.rows.values()].find(value=>Array.isArray(value.entries)).entries[0].reflection,'Confirmed');assert.equal((await api.request('get',{id:entry.id})).entry.reflection,'Confirmed');assert.equal((await api.request('list',{query:'Confirmed'})).entries.length,1);assert.equal(requests.length,2);}finally{api.stop();globalThis.window=oldWindow;globalThis.localStorage=oldStorage;}
});
test('conflicts retain the draft and stop retries until the student explicitly reviews it',async()=>{
 let calls=0;const draft=journalDraft({entry:{id:crypto.randomUUID(),revision:1,documentVersion:'old'},fields:{reflection:'Original'},save:async()=>{calls++;throw Object.assign(Error('Changed elsewhere'),{status:409});}});draft.set({reflection:'Device draft'});await assert.rejects(draft.save());draft.set({reflection:'Still mine'});await assert.rejects(draft.save());assert.equal(calls,1);assert.equal(draft.fields.reflection,'Still mine');draft.stop();
});
test('stopping after account change ignores late save responses',async()=>{
 let finish;const states=[];const draft=journalDraft({fields:{reflection:'Private'},save:()=>new Promise(resolve=>finish=resolve),onState:state=>states.push(state)});draft.set({reflection:'Private edit'});const saving=draft.save();await pause();draft.stop();finish({entry:{id:crypto.randomUUID(),revision:1}});await saving;assert(!states.includes('saved'));
});
test('an explicit Save can preserve the draft when device storage is unavailable',async()=>{
 let sent;const states=[];const draft=journalDraft({fields:{reflection:''},persist:async()=>{throw Error('Device full');},clear:async()=>{},save:async body=>{sent=body;return {entry:{id:body.id,revision:1,documentVersion:'saved',reflection:body.fields.reflection}};},onState:state=>states.push(state)});
 draft.set({reflection:'Preserve on the server'});await draft.save();assert.equal(sent.fields.reflection,'Preserve on the server');assert(states.includes('saved'));assert(!draft.dirty);draft.stop();
});
test('device copies are separated by API environment as well as verified account',async()=>{
 const previousWindow=globalThis.window,previousStorage=globalThis.localStorage,device=memoryDevice();globalThis.localStorage={getItem:()=> 'verified-token'};
 try{for(const base of ['https://api-one.invalid','https://api-two.invalid']){globalThis.window={M4L_CONFIG:{API_BASE:base}};const api=journalAPI({device,fetcher:async()=>Response.json({success:true,ownerKey:'b'.repeat(64),version:'version',revision:1,entries:[{id:crypto.randomUUID(),reflection:base}]})});await api.refresh();api.stop();}
  const copies=[...device.rows.entries()].filter(([key])=>key.startsWith('copy:'));assert.equal(copies.length,2);assert.notEqual(copies[0][0],copies[1][0]);
 }finally{globalThis.window=previousWindow;globalThis.localStorage=previousStorage;}
});

test('sequential and restored drafts use the confirmed file version only when their own entry is unchanged',async()=>{
 const previousWindow=globalThis.window,previousStorage=globalThis.localStorage,device=memoryDevice(),f=await studentJournalFixture();
 globalThis.window={M4L_CONFIG:{API_BASE:''}};globalThis.localStorage={getItem:()=> 'verified-token'};
 const bodies=[];let api;
 try{
  api=journalAPI({device,fetcher:async(path,options)=>{const body=JSON.parse(options.body);if(path.endsWith('/save'))bodies.push(body);const result=await f.journal(path.split('/').at(-1),body);return Response.json(result.body,{status:result.status});}});
  await api.refresh();const make=options=>journalDraft({documentVersion:api.version,fields:{reflection:''},save:body=>api.request('save',body),prepareVersion:record=>api.versionFor(record),persist:value=>api.saveDraft(value),clear:id=>api.clearDraft(id),...options});
  const a=make({sourceKey:'reflection:a'}),b=make({sourceKey:'reflection:b'});a.set({reflection:'A'});b.set({reflection:'B'});await b.flushDevice();const restored=await api.draft(b.entry.id);b.stop();await a.save();
  const reopened=make({restore:restored});await reopened.save();assert.equal((await api.request('list')).entries.length,2);assert.equal(bodies[1].version,a.entry.documentVersion);assert.notEqual(bodies[0].version,bodies[1].version);
  const c=make({entry:a.entry,fields:{reflection:'A'}}),d=make({entry:reopened.entry,fields:{reflection:'B'}});c.set({reflection:'A2'});d.set({reflection:'B2'});await c.save();await d.save();assert.equal((await api.request('get',{id:d.entry.id})).entry.reflection,'B2');
  const stale=make({entry:c.entry,fields:{reflection:'A2'}});stale.set({reflection:'Local stale edit'});
  const copy=(await f.journal('sync')).body,external=await f.journal('save',{id:c.entry.id,revision:c.entry.revision,version:copy.version,operationId:crypto.randomUUID(),fields:{reflection:'Other device'}});assert.equal(external.status,200);
  await api.refresh();await assert.rejects(stale.save(),error=>error.status===409);assert.equal((await f.journal('sync')).body.entries.find(row=>row.id===c.entry.id).reflection,'Other device');assert.equal(stale.fields.reflection,'Local stale edit');
  for(const draft of [a,reopened,c,d,stale])draft.stop();
 }finally{api?.stop();f.close();globalThis.window=previousWindow;globalThis.localStorage=previousStorage;}
});
