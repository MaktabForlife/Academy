import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';
import worker from '../src/academy-runtime.js';import {separationFixture} from './fixtures/academy-separation-fixture.mjs';import {initialiseAcceptedSetup} from '../src/academy/d1/setup-publication.js';
const ok=r=>{assert.equal(r.status,200,JSON.stringify(r.body));return r.body;},op=()=>({operationId:crypto.randomUUID()}),link=()=>({id:crypto.randomUUID(),title:'Private provider document',url:'https://drive.google.com/file/d/synthetic/view',description:'My reference'});
async function use(fn){const f=await separationFixture();try{
 for(const name of ['0032_accepted_setup.sql','0033_native_attendance.sql','0034_assessment_operations.sql','0035_media_contributions.sql']){f.db.exec('BEGIN');f.db.exec(readFileSync(new URL('../migrations/academy/'+name,import.meta.url),'utf8'));f.db.exec('COMMIT');}
 await initialiseAcceptedSetup(f.env.ACADEMY_DB);Object.assign(f.env,{ACADEMY_ACCEPTED_SETUP:'1',ACADEMY_LEARNING_OPERATIONS:'3',ACADEMY_MEDIA_SEPARATION:'1'});
 const objects=new Map();f.linkObjects=objects;let revision=0;f.env.LESSON_MEDIA_BUCKET={async get(key){const item=objects.get(key);return item?{...item,size:Buffer.byteLength(item.value),text:async()=>item.value}:null;},async head(key){const item=objects.get(key);return item?{etag:item.etag,customMetadata:item.customMetadata,size:Buffer.byteLength(item.value)}:null;},async put(key,value,options){const previous=objects.get(key);if(options.onlyIf?.etagMatches!==undefined&&previous?.etag!==options.onlyIf.etagMatches||options.onlyIf?.etagDoesNotMatch==='*'&&previous)return null;const item={value,etag:'synthetic-etag-'+(++revision),customMetadata:options.customMetadata};objects.set(key,item);return {etag:item.etag};}};
 const tokens={teacher:await f.actor('teacherA'),admin:await f.actor('global'),student:await f.actor('studentA')};
 f.tokens=tokens;f.req=async(action,input={},who='teacher')=>{const path=action.startsWith('/')?action:'/api/academy/my-links/'+action,response=await worker.fetch(new Request('http://localhost'+path,{method:'POST',headers:{Authorization:'Bearer '+tokens[who],'Content-Type':'application/json','X-Academy-Workspace':'LEARN'},body:JSON.stringify(input)}),f.env);return {status:response.status,body:await response.json()};};
 await fn(f);
 }finally{f.close();}}
test('My links stays in the owner-only private namespace and never enters official records or another Admin view',()=>use(async f=>{
 const version=f.db.prepare('SELECT version FROM academy_write_state').get().version,audit=f.db.prepare('SELECT count(*) n FROM audit_events').get().n;
 assert.equal((await f.req('list',{},'student')).status,403);const entry=link(),initial=ok(await f.req('list'));assert.equal(initial.established,false);
 const saved=ok(await f.req('save',{...op(),revision:initial.revision,links:[entry]}));assert.equal(saved.links[0].url,entry.url);assert.equal(f.linkObjects.size,1);assert([...f.linkObjects.keys()].every(k=>k.startsWith('academy-personal-links/v1/')));
 assert.deepEqual(ok(await f.req('list',{},'admin')).links,[]);assert.equal((await f.req('list',{ownerId:f.actors.teacherA},'admin')).status,403);assert.equal(f.db.prepare('SELECT version FROM academy_write_state').get().version,version);assert.equal(f.db.prepare('SELECT count(*) n FROM audit_events').get().n,audit);
 assert.equal(ok(await f.req('export')).links[0].id,entry.id);
}));
test('an established empty owner retains add/edit/export after every teaching role is removed',()=>use(async f=>{
 let state=ok(await f.req('save',{...op(),revision:null,links:[link()]}));state=ok(await f.req('save',{...op(),revision:state.revision,links:[]}));assert.equal(state.established,true);
 f.db.prepare('UPDATE role_assignments SET active=0 WHERE account_id=?').run(f.actors.teacherA);f.db.exec("UPDATE course_settings SET legacy_access_model='PAID'");
 const login=await f.call('/api/account/login',{uniqueid:'separation-teacherA',pin:'1234'});ok(login);assert.equal(login.body.context.scope,'OWN_LIBRARY');assert.equal(login.body.context.role,'LIBRARY_OWNER');f.tokens.teacher=login.body.token;
 state=ok(await f.req('list'));assert.deepEqual(state.links,[]);state=ok(await f.req('save',{...op(),revision:state.revision,links:[link()]}));assert.equal(state.links.length,1);assert.equal(ok(await f.req('export')).links.length,1);
 const response=await worker.fetch(new Request('http://localhost/api/account/personal-workspace',{method:'POST',headers:{Authorization:'Bearer '+f.tokens.teacher,'Content-Type':'application/json'},body:'{}'}),f.env);assert.equal((await response.json()).workspace.path,'/academy/library/?view=my-links');
 f.db.prepare('UPDATE accounts SET active=0 WHERE account_id=?').run(f.actors.teacherA);assert.equal((await f.req('list')).status,401);
}));
test('conditional saves reject concurrent loss and exact retries retain their original receipt',()=>use(async f=>{
 const input={...op(),revision:null,links:[link()]},first=ok(await f.req('save',input));assert.equal(ok(await f.req('save',input)).replayed,true);
 const changes=[{...op(),revision:first.revision,links:[link()]},{...op(),revision:first.revision,links:[link()]}],results=await Promise.all(changes.map(r=>f.req('save',r)));assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
 assert.equal(ok(await f.req('save',input)).savedRevision,1);assert.equal((await f.req('save',{...input,links:[]})).body.code,'OPERATION_ID_REUSED');
 for(const url of ['javascript:alert(1)','https://user:password@example.com/file','https://example.com/file?access_token=secret'])assert.equal((await f.req('save',{...op(),revision:ok(await f.req('list')).revision,links:[{...link(),url}]})).status,400);
}));
