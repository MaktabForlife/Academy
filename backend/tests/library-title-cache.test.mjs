import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const source=readFileSync(new URL('../../js/m4l-library-titles.js',import.meta.url),'utf8');
function load(store,scope='https://development.test'){
 const window={M4L_CONFIG:{API_BASE:scope}};
 runInNewContext(source,{window,location:{origin:'https://site.test'},localStorage:{getItem:key=>store.get(key)||null,setItem:(key,value)=>store.set(key,value)}});
 return window.M4L_LIBRARY_TITLES;
}
test('a successful catalogue title survives a new page when the catalogue is unavailable',()=>{
 const storage=new Map(),id='EXTERNAL:INTERNET_ARCHIVE:class-duas';
 load(storage).remember([{id,title:'Class Duas'}]);
 const nextPage=load(storage);
 assert.equal(nextPage.title({id,title:id},''),'Class Duas');
 assert.equal(nextPage.title({id,title:id},'Academy renamed title'),'Academy renamed title');
 assert.equal(nextPage.title({id,title:'Updated catalogue title'},''),'Updated catalogue title');
 assert.equal(load(storage,'https://other.test').title({id,title:id},''),'Untitled resource');
});
test('existing public Library snapshots seed names; invalid storage and raw IDs never become titles',()=>{
 const id='EXTERNAL:INTERNET_ARCHIVE:duas',storage=new Map([['m4l_library_v1:https://development.test:public',JSON.stringify({data:{books:[{id,title:'Tasheelud Dua'}]}})]]);
 assert.equal(load(storage).title({id}),'Tasheelud Dua');
 storage.clear();storage.set('m4l_library_titles_v1:https://development.test','not json');
 const titles=load(storage);titles.remember([{id,title:id}]);assert.equal(titles.title({id,title:id},id),'Untitled resource');
});
