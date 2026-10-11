import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
const script=await readFile(new URL('../../js/m4l-library-cache.js',import.meta.url),'utf8');
let now=Date.parse('2026-10-11T07:00:00Z'),fail=false,defer=false,release,books=[{id:'public-1',title:'First book'}];
const values=new Map(),calls=[],handlers=new Map();
const localStorage={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key),key:index=>[...values.keys()][index],get length(){return values.size;}};
class Clock extends Date{static now(){return now;}}
const window={M4L_CONFIG:{API_BASE:'https://api.test'},addEventListener:(type,fn)=>handlers.set(type,fn)};
vm.runInNewContext(script,{window,localStorage,Date:Clock,crypto:webcrypto,TextEncoder,Uint8Array,fetch:async(url,options)=>{
 calls.push({url,options});if(defer){defer=false;await new Promise(resolve=>release=resolve);}return{ok:!fail,json:async()=>url.includes('/metadata/')?{records:[]}:{books:structuredClone(books)}};
}});
const cache=window.M4L_LIBRARY_CACHE;
let result=await cache.publicList();assert.equal(result.data.books[0].title,'First book');assert.equal(calls.length,2);
now+=6*86400000;await cache.publicList();assert.equal(calls.length,2,'Repeat visits for seven days use browser storage');
now+=86400000;books=[{id:'public-2',title:'Weekly replacement'}];defer=true;
const one=cache.publicList(),two=cache.publicList();release();await Promise.all([one,two]);assert.equal(calls.length,4,'Weekly expiry performs one shared update');
assert.equal(cache.read('public').data.books[0].id,'public-2');
await cache.publicList(true);assert.equal(calls.length,6,'Refresh forces an update while the cache is fresh');assert.equal(calls.at(-1).options.cache,'reload');
now+=7*86400000;fail=true;result=await cache.publicList();assert.equal(result.stale,true);assert.match(result.message,/saved resources/);assert.equal(result.data.books[0].id,'public-2');assert.equal(cache.read('public').stale,true,'A failed update does not renew its expiry');
const a=await cache.owner('account-a'),b=await cache.owner('account-b');assert.notEqual(a,b);cache.write('personal:'+a,{resources:[]});cache.write('personal:'+b,{resources:[]});assert.doesNotMatch(JSON.stringify([...values]),/account-a|account-b/);
handlers.get('storage')({key:'m4l_account_token'});assert.equal([...values.keys()].some(key=>key.includes(':personal:')),false);assert.ok(cache.read('public'),'Account changes keep public resources');
console.log('Library weekly expiry, forced refresh, shared requests, stale recovery and account-scoped cache checks passed.');
