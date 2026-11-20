import test from 'node:test';
import assert from 'node:assert/strict';
import {world,signIn} from './fixtures/academy-v111-native-fixture.mjs';
const file='/pdf-file/'+Buffer.from('https://archive.org/download/collection/Volume2.pdf').toString('base64url'),bookmark={file,title:'Synthetic native bookmark',page:11,pageLabel:'11'};
const call=(f,login,action,input={})=>f.nativeRequest('/api/academy/bookmarks/'+action,input,login);
const ok=result=>{assert.equal(result.response.status,200,JSON.stringify(result.data));return result.data;};
test('actual native bookmark list/save/delete uses cookie actor and exact row CAS without V1 sessions',async()=>{const f=await world();try{
 const before=f.databases.academy.prepare('SELECT count(*) n FROM account_sessions').get().n,login=await signIn(f),initial=ok(await call(f,login,'list'));assert.equal(initial.bookmarks.length,0);assert.match(initial.absentRevision,/^[a-f0-9]{64}$/);
 const saved=ok(await call(f,login,'save',{bookmark,expectedRevision:initial.absentRevision})).bookmark;assert.equal(saved.file,file);assert.match(saved.revision,/^[a-f0-9]{64}$/);
 const stale=await call(f,login,'save',{bookmark:{...bookmark,title:'stale overwrite'},expectedRevision:initial.absentRevision});assert.equal(stale.response.status,409);assert.equal(stale.data.code,'BOOKMARK_CHANGED');
 const listed=ok(await call(f,login,'list')).bookmarks;assert.equal(listed[0].title,bookmark.title);assert.equal(listed[0].revision,saved.revision);
 ok(await call(f,login,'delete',{key:saved.key,expectedRevision:saved.revision}));assert.equal(ok(await call(f,login,'list')).bookmarks.length,0);assert.equal(f.databases.academy.prepare('SELECT count(*) n FROM account_sessions').get().n,before);
 }finally{f.close();}});
test('new native save requires a checked base and a stale delete cannot remove a newer saved bookmark',async()=>{const f=await world();try{
 const login=await signIn(f),initial=ok(await call(f,login,'list'));const missing=await call(f,login,'save',{bookmark});assert.equal(missing.response.status,409);assert.equal(missing.data.code,'BOOKMARK_BASE_REQUIRED');
 const first=ok(await call(f,login,'save',{bookmark,expectedRevision:initial.absentRevision})).bookmark,second=ok(await call(f,login,'save',{bookmark:{...bookmark,title:'new reviewed title'},expectedRevision:first.revision})).bookmark;
 assert.notEqual(first.revision,second.revision);const stale=await call(f,login,'delete',{key:first.key,expectedRevision:first.revision});assert.equal(stale.response.status,409);assert.equal(ok(await call(f,login,'list')).bookmarks[0].title,'new reviewed title');
 }finally{f.close();}});
test('native bookmark writes enforce the actual JWT tuple through the owning coordinator, beyond native CE alone',async()=>{const f=await world();try{
 const login=await signIn(f),initial=ok(await call(f,login,'list'));f.databases.academy.prepare('UPDATE jwt_v2_accounts SET ae=ae+1,revision=revision+1 WHERE sub=?').run(f.sub);
 const denied=await call(f,login,'save',{bookmark,expectedRevision:initial.absentRevision});assert.notEqual(denied.response.status,200);assert.equal(f.databases.academy.prepare('SELECT count(*) n FROM academy_pdf_bookmarks WHERE account_id=?').get(f.sub).n,0);
 }finally{f.close();}});
