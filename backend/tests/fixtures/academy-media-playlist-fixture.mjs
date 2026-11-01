import {readFileSync} from 'node:fs';
import {contentMediaFixture,ok} from './academy-content-media-fixture.mjs';
export {ok};
export async function mediaPlaylistFixture(options={}){
 const f=await contentMediaFixture(options);f.databases.core.exec(readFileSync(new URL('../../migrations/academy-core/0023_media_playlists.sql',import.meta.url),'utf8'));
 f.playlists=async(action,input={},token=f.admin,workspace='ADMIN')=>f.request('/api/academy/media-playlists/'+action,{activityKey:f.scope,...input},token,workspace);
 f.playlist=async(extra={})=>{const opts=ok(await f.playlists('options',{classId:'class-1'})),input={activityKey:f.scope,playlistId:crypto.randomUUID(),revision:opts.revision,playlistRevision:0,name:'Native playlist',closeDate:'',classId:'class-1',subjectKey:'MODULE:recorded-subject-module',teacherIds:['account-0006'],optionsRevision:opts.optionsRevision,operationId:crypto.randomUUID(),...extra};return {...ok(await f.playlists('save',input)),input};};
 f.attach=async(playlistId,lessonId,extra={})=>{const view=ok(await f.playlists('get',{playlistId}));const input={playlistId,lessonId,revision:view.revision,playlistRevision:view.playlist.revision,operationId:crypto.randomUUID(),...extra};return {...ok(await f.playlists('attach',input)),input};};
 f.publishPlaylist=async(playlistId,published=true)=>{const view=ok(await f.playlists('get',{playlistId}));return ok(await f.playlists('publish',{playlistId,published,revision:view.revision,playlistRevision:view.playlist.revision,operationId:crypto.randomUUID()}));};return f;
}
