import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeMediaBridgeFixture} from './fixtures/academy-native-media-bridge-fixture.mjs';
import {ok} from './fixtures/academy-content-media-fixture.mjs';
const use=fn=>async()=>{const f=await nativeMediaBridgeFixture();try{await fn(f);}finally{f.close();}};
test('signed Source Teacher choices resolve native labels with scoped Admin and exact offering',use(async f=>{
 const result=ok(await f.signedMediaTeachers({teacherIds:['ACCOUNT-0006']}));assert.equal(result.schema,'NATIVE_MEDIA_TEACHERS_V1');assert.equal(result.activityKey,f.scope);assert.deepEqual(result.selectedTeacherIds,['account-0006']);assert(result.classes.some(c=>c.id==='class-1'&&c.name));assert(result.teachers.some(t=>t.id==='account-0006'&&t.name));assert.equal(result.teacherRequired,true);assert(result.checkedAt>0);assert.equal((await f.signedMediaTeachers({purpose:'LEARN'})).status,403);assert.equal((await f.signedMediaTeachers({},'wrong-secret-'.repeat(4))).status,401);assert.equal((await f.signedMediaTeachers({issuedAt:1})).status,401);assert.equal((await f.signedMediaTeachers({offeringId:'unmapped'})).status,403);
 for(const teacherIds of [[],['invented'],['account-0006','ACCOUNT-0006']])assert([400,409].includes((await f.signedMediaTeachers({teacherIds})).status));
}));
test('Source rejects learner, other Admin, revoked session and frozen mapping without changing authority',use(async f=>{
 for(const token of [await f.source.login('0002'),await f.source.actor('adminB')])assert.equal((await f.signedMediaTeachers({sourceRef:await f.sourceRef(token)})).status,403);
 const sourceRef=await f.sourceRef();f.databases.core.prepare("UPDATE account_sessions SET revoked_at=? WHERE session_id=(SELECT session_id FROM website_platform_sessions WHERE source_ref=?)").run(new Date().toISOString(),sourceRef);assert.equal((await f.signedMediaTeachers({sourceRef})).status,401);
 f.databases.core.prepare("UPDATE website_platform_access_ownership SET state='FROZEN' WHERE activity_key=?").run(f.scope);assert.equal((await f.signedMediaTeachers({sourceRef:await f.sourceRef(f.global)})).status,403);
}));
