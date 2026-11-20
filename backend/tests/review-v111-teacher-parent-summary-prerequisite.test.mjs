import test from 'node:test';import assert from 'node:assert/strict';
import {createMemorisationNativeFixture} from './fixtures/academy-v111-memorisation-fixture.mjs';
test('actual Teacher parent fixture installs immutable history-index prerequisite before sign-in and serves a native authorised summary',async()=>{const f=await createMemorisationNativeFixture({actor:'teacher'});try{
 const index=f.databases.academy.prepare("SELECT sql FROM sqlite_master WHERE type='index' AND name='class_notes_programme_history'").get();assert(index);assert.match(index.sql,/class_notes\s*\(activity_key,state,created_at DESC,note_id DESC\)/i);
 const result=await f.nativeRequest('/api/academy/class-notes/summary',{activityKey:f.scope,limit:20},f.login,{headers:{'X-Academy-Workspace':'TEACH'}});assert.equal(result.response.status,200,JSON.stringify({data:result.data,error:result.nativeError?.code}));assert.equal(result.data.success,true);assert(Array.isArray(result.data.notes));assert.equal(f.databases.academy.prepare('SELECT count(*) n FROM account_sessions').get().n,0);
 }finally{await f.cleanup();}});
