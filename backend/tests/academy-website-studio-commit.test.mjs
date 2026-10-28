import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {splitFixture} from './fixtures/academy-split-fixture.mjs';import worker from '../src/academy-runtime.js';
import {websiteStudioBridge} from '../src/academy/d1/website-studio-bridge.js';import {versionKey} from '../../website-studio/src/protocol.mjs';
test('Studio metadata commit rechecks actual scoped authority inside the transaction after planning',async()=>{
 const f=await splitFixture();try{
 f.databases.core.exec(readFileSync(new URL('../migrations/academy-core/0010_website_studio.sql',import.meta.url),'utf8'));f.databases.core.exec("UPDATE split_deployment_state SET state='READY'");
 const env={...f.source.env,ACADEMY_DB:f.core,ACADEMY_ADMIN_DB:f.admin,ACADEMY_DB_GENERATION:'SPLIT_V1',ACADEMY_D1_RUN_ID:f.prepared.report.sourceDigest,ACADEMY_SPLIT_COORDINATOR:f.namespace,ACADEMY_ACCEPTED_SETUP:'1',ACADEMY_LEARNING_OPERATIONS:'3',ACADEMY_WEBSITE_STUDIO:'1',ENVIRONMENT:'local'};
 const login=await worker.fetch(new Request('https://academy.test/api/account/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({uniqueid:'separation-global',pin:'1234'})}),env),body=await login.json();assert.equal(login.status,200,JSON.stringify(body));const token=body.token;
 let revoked=false;const guarded={...f.core,withSession(){return guarded;},async batch(statements){if(statements.some(s=>s.sql.startsWith('INSERT INTO website_studio_state'))){f.databases.core.prepare('UPDATE global_role_assignments SET active=0 WHERE account_id=?').run(f.actors.global);revoked=true;}return f.core.batch(statements);}};
 const sourceVersion=await f.core.prepare('SELECT version FROM split_read_state').first('version'),hash='a'.repeat(64),selection={activityKey:f.scopes.courseA},draft={websiteId:selection.activityKey,key:versionKey(selection.activityKey,hash),sha256:hash,bytes:100};
 const response=await websiteStudioBridge(new Request('https://private/commit',{method:'POST',headers:{Authorization:'Bearer '+token,'X-Academy-Workspace':'ADMIN'},body:JSON.stringify({...selection,action:'migrate',operationId:crypto.randomUUID(),requestSha256:'b'.repeat(64),revision:0,draft,sourceVersion})}),{...env,ACADEMY_DB:guarded});
 assert(revoked);assert.equal(response.status,409);assert.equal(f.databases.core.prepare('SELECT count(*) n FROM website_studio_state').get().n,0);assert.equal(f.databases.core.prepare('SELECT count(*) n FROM website_studio_operations').get().n,0);
 }finally{f.close();}
});
