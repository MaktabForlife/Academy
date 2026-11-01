import test from 'node:test';import assert from 'node:assert/strict';import {resolve} from 'node:path';import {pathToFileURL} from 'node:url';
import {nativePlaylistReader,recordingViewMarker} from '../../js/m4l-native-playlist-view.mjs';
import {nativePlaylistTableHTML,nativePlaylistContentsHTML} from '../../js/m4l-recording-collections.mjs';
const context={schema:'PLAYLIST_MODEL_V1',activityKey:'PROGRAM:native',revision:3},deferred=()=>{let resolve;const promise=new Promise(yes=>resolve=yes);return {promise,resolve};};
test('native read adapter coalesces reads and never renders a delayed playlist after another selection or account reset',async()=>{
 const pending=new Map(),changes=[];let calls=0;const model=nativePlaylistReader({request:(_action,input)=>{calls++;const d=deferred();pending.set(input.playlistId,d);return d.promise;},onChange:value=>changes.push(value)});
 const a=model.open({activityKey:context.activityKey,playlistId:'a'}),b=model.open({activityKey:context.activityKey,playlistId:'b'});await new Promise(r=>setImmediate(r));pending.get('b').resolve({...context,playlist:{id:'b'},recordings:[],before:null});await b;pending.get('a').resolve({...context,playlist:{id:'a'},recordings:[],before:null});await a;assert.equal(model.state().selected.playlist.id,'b');
 const next=model.open({activityKey:context.activityKey,playlistId:'c'});await new Promise(r=>setImmediate(r));model.clear();pending.get('c').resolve({...context,playlist:{id:'c'},recordings:[],before:null});await next;assert.equal(model.state().selected,null);assert.equal(calls,3);
});
test('sparse native pages retain positive saved positions and stale revision pages never append',async()=>{
 let response={...context,playlist:{id:'a'},recordings:[{id:'later',position:4},{id:'first',position:1}],before:'opaque'};
 const model=nativePlaylistReader({request:async()=>response});await model.open({activityKey:context.activityKey,playlistId:'a'});assert.deepEqual(model.state().selected.recordings.map(row=>row.id),['first','later']);response={...response,revision:4,recordings:[{id:'wrong',position:5}]};await model.open({activityKey:context.activityKey,playlistId:'a',before:'opaque'},{more:true});assert.match(model.state().error,/changed/);assert.deepEqual(model.state().selected.recordings.map(row=>row.id),['first','later']);
});
test('actual paired native playlist DTO opens published rows in saved order without a timetable identity',{skip:!process.env.NATIVE_PLAYLIST_BACKEND},async()=>{
 const backend=resolve(process.env.NATIVE_PLAYLIST_BACKEND),{mediaPlaylistFixture,ok}=await import(pathToFileURL(resolve(backend,'tests/fixtures/academy-media-playlist-fixture.mjs'))),f=await mediaPlaylistFixture();
 try{const made=await f.playlist(),a=await f.binding({recordingDate:'2026-10-29'}),b=await f.binding({recordingDate:'2026-10-01'});await f.publish(a.lessonId);await f.publish(b.lessonId);await f.attach(made.playlistId,a.lessonId);await f.attach(made.playlistId,b.lessonId);await f.publishPlaylist(made.playlistId);const student=await f.source.login('0002'),model=nativePlaylistReader({request:async(action,input)=>ok(await f.playlists(action,{...input,view:'learner'},student,'LEARN'))});
 await model.loadList({activityKey:f.scope,limit:50});assert.match(nativePlaylistTableHTML(model.state().catalogue),/Open playlist/);await model.open({activityKey:f.scope,playlistId:made.playlistId,limit:30});const selected=model.state().selected;assert.deepEqual(selected.recordings.map(row=>row.id),[a.lessonId,b.lessonId]);assert.deepEqual(selected.recordings.map(row=>row.position),[1,2]);const html=nativePlaylistContentsHTML(selected);assert.match(html,/Native playlist/);assert.match(html,/Recording not yet available/);assert.doesNotMatch(html,/data-lm="recording-play"/);assert.equal(selected.recordings[0].playlistId,made.playlistId);
 }finally{f.close();}
});


test('recording history accepts only the current mounted context and native row identities, without credentials',()=>{
 const marker={nonce:'current-mount',activityKey:'PROGRAM:native',view:{group:'native-group',lesson:'["lesson","asset"]',tab:'read'},playlistId:'native-playlist'},context={nonce:'current-mount',activityKey:'PROGRAM:native'};
 assert.deepEqual(recordingViewMarker(marker,context),{view:marker.view,playlistId:'native-playlist'});assert.equal(recordingViewMarker(marker,{...context,nonce:'previous-account'}),null);assert.equal(recordingViewMarker(marker,{...context,activityKey:'PROGRAM:other'}),null);assert.equal(recordingViewMarker({...marker,view:{lesson:'bad-json'}},context),null);assert.equal(recordingViewMarker({...marker,view:{tab:'admin'}},context),null);assert(!JSON.stringify(marker).includes('token'));
});
