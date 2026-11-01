import test from 'node:test';
import assert from 'node:assert/strict';
import {permittedRecordingGroups,recordingPlaylistGroups,recordingCollectionHTML} from '../../js/m4l-recording-collections.mjs';

const recording=(id,{surah='native-surah-36',title='Same displayed title',activityKey='PROGRAM:tafseer',...extra}={})=>({
 id,activityKey,title,date:'2026-10-20',teacher:'Teacher',className:'Tafseer 2026',state:'PUBLISHED',canView:true,
 recordingGroup:{key:'native-group-'+id,subjectLabel:'Surah Yaseen',subjectIdentity:surah?['surah',surah]:null,complete:false},
 assets:[{id:'asset-'+id,kind:'YOUTUBE'}],...extra
});

test('one row per actual Surah ID spans dated cards, retains loaded order and opens exact children',()=>{
 const rows=[recording('latest',{date:'2026-10-27'}),recording('as-saffat',{surah:'native-surah-37'}),recording('earlier',{date:'2026-10-20'}),recording('same-label-different-id',{surah:'native-surah-other'})],before=structuredClone(rows);
 const groups=recordingPlaylistGroups(rows);assert.equal(groups.length,3);assert.deepEqual(groups[0].lessons.map(r=>r.id),['latest','earlier']);assert.equal(groups[0].nativeGroupKeys.length,2);
 const html=recordingCollectionHTML(rows);assert.match(html,/<table class="lm-playlist-table">/);assert.equal((html.match(/data-lm="recording-group"/g)||[]).length,3);assert.match(html,/Loaded recordings/);assert.match(html,/Open playlist/);assert.doesNotMatch(html,/lm-subject-grid/);
 const list=recordingCollectionHTML(rows,{group:groups[0].key});assert.match(list,/data-id="latest" data-asset="asset-latest"/);assert.match(list,/data-id="earlier" data-asset="asset-earlier"/);assert.doesNotMatch(list,/data-id="as-saffat"/);
 assert.match(recordingCollectionHTML(rows,{group:'native-group-latest'}),/data-id="earlier" data-asset="asset-earlier"/,'An existing native group reference still opens its permitted playlist');
 const detail=recordingCollectionHTML(rows,{group:groups[0].key,lesson:groups[0].lessons[1].recordingKey});assert.match(detail,/data-id="earlier" data-asset="asset-earlier"/);assert.deepEqual(rows,before);
});

test('explicit native playlist identity takes precedence while separate academic anchors remain separate',()=>{
 const rows=[recording('a',{playlistId:'playlist-native',playlist:{id:'playlist-native',name:'Reviewed playlist'}}),recording('b',{surah:'native-surah-37',playlistId:'playlist-native',playlist:{id:'playlist-native',name:'Reviewed playlist'}}),recording('c',{playlistId:'another',playlist:{id:'another',name:'Reviewed playlist'}})];
 assert.deepEqual(recordingPlaylistGroups(rows).map(g=>g.lessons.length),[2,1]);assert.equal(recordingPlaylistGroups(rows)[0].title,'Reviewed playlist');
 const academic=recording('module-a',{surah:null,activityKey:'PROGRAM:alimiyah',recordingGroup:{key:'class-1-module-teacher-1',subjectIdentity:['module','module-1'],subjectLabel:'Module',complete:true}});
 const other=structuredClone(academic);other.id='module-b';other.assets[0].id='asset-module-b';other.recordingGroup.key='class-2-module-teacher-1';
 const groups=recordingPlaylistGroups([academic,other]);assert.deepEqual(groups.map(g=>g.key),['class-1-module-teacher-1','class-2-module-teacher-1']);assert.equal(permittedRecordingGroups([academic,other]).length,2);
});

test('unidentified legacy recordings remain in Other recordings without title/date guesses',()=>{
 const rows=[recording('unknown-a',{surah:null}),recording('unknown-b',{surah:null,title:'Another title'}),recording('another-programme',{surah:null,activityKey:'PROGRAM:mothers'})],groups=recordingPlaylistGroups(rows);
 assert.equal(groups.length,2);assert.equal(groups[0].title,'Other recordings');assert.equal(groups[0].unassigned,true);assert.deepEqual(groups[0].lessons.map(r=>r.id),['unknown-a','unknown-b']);
 assert.doesNotMatch(recordingCollectionHTML(rows),/mapping|assignment|undefined/);
});

test('table counts and labels include only already-permitted, published and unexpired records',()=>{
 const rows=[recording('allowed'),recording('denied',{canView:false,teacher:'PRIVATE TEACHER'}),recording('draft',{state:'DRAFT',title:'PRIVATE DRAFT'}),recording('expired',{assets:[{id:'expired-mp4',kind:'MP4',expired:true}]}),recording('pdf',{assets:[{id:'notes',kind:'PDF'}]})];
 const groups=recordingPlaylistGroups(rows);assert.equal(groups.length,1);assert.equal(groups[0].lessons.length,1);assert.doesNotMatch(recordingCollectionHTML(rows),/PRIVATE|expired-mp4|data-id="pdf"/);
 assert.deepEqual(recordingPlaylistGroups([rows[1]]),[]);
});
