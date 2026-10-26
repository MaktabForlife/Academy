import test from 'node:test';
import assert from 'node:assert/strict';
import {publishedSettings} from '../src/academy/d1/published-settings.js';
import {splitFixture} from './fixtures/academy-split-fixture.mjs';
import {academyD1Repository} from '../src/academy/d1/repository.js';
import {acceptedRepository} from '../src/academy/d1/setup-reader.js';

test('immutable time-zone settings are loaded once per namespace/publication, with no request or permission state cached',async()=>{
 let reads=0;const rows=new Map([['head-one',[{setting_key:'PlatformTimezone',setting_value:'Africa/Johannesburg'},{setting_key:'PersonalMemorisationCards',setting_value:'1'}]],['head-two',[{setting_key:'PlatformTimezone',setting_value:'Asia/Riyadh'},{setting_key:'PersonalMemorisationCards',setting_value:'0'}]]]);
 const db={prepare(sql){return {async all(){reads++;return {results:rows.get(sql.includes("'head-one'")?'head-one':'head-two')};}};}};
 const namespace=crypto.randomUUID(),one=await publishedSettings(db,namespace,'head-one');
 assert.equal(one.setting_value,'Africa/Johannesburg');assert(Object.isFrozen(one));
 await publishedSettings(db,namespace,'head-one');assert.equal(reads,1,'Another request reuses the same fixed publication');
 assert.equal((await publishedSettings(db,namespace,'head-two')).setting_value,'Asia/Riyadh');assert.equal(reads,2,'A newly published setting is read immediately');
 assert.equal((await publishedSettings(db,namespace,'head-one')).setting_value,'Africa/Johannesburg','An explicitly pinned old publication retains its original setting');
 await publishedSettings(db,crypto.randomUUID(),'head-one');assert.equal(reads,3,'Deployment namespaces cannot share configuration accidentally');
 assert.deepEqual(Object.keys(one).sort(),['memorisation_cards','setting_value']);
});

test('warm fixed settings never skip current database readiness, and the immediate memorisation disable stays live',async()=>{
 const f=await splitFixture();try{
  f.databases.core.exec("UPDATE split_deployment_state SET state='READY'");
  const env={...f.source.env,ACADEMY_DB:f.core,ACADEMY_ADMIN_DB:f.admin,ACADEMY_DB_GENERATION:'SPLIT_V1',ACADEMY_D1_RUN_ID:f.prepared.report.sourceDigest,ACADEMY_SPLIT_COORDINATOR:f.namespace,ACADEMY_ACCEPTED_SETUP:'1'};
  const sql=[],prepare=f.databases.core.prepare.bind(f.databases.core);f.databases.core.prepare=query=>{sql.push(query);return prepare(query);};
  const first=academyD1Repository(env);await first.ready();const original=(await first.homeConfiguration()).setting_value;
  sql.length=0;const second=academyD1Repository(env);await second.ready();assert.equal((await second.homeConfiguration()).setting_value,original);
  assert(!sql.some(s=>s.includes('json_each(c.rows_json)')),'Normal requests never reread the fixed time-zone value');
  assert(sql.some(s=>s.includes("state='READY'")),'The verified deployment state is still checked');
  const reader=acceptedRepository(second,f.head);await reader.homeConfiguration();
  f.databases.core.prepare("UPDATE academy_settings SET setting_value='0' WHERE setting_key='PersonalMemorisationCards'").run();
  assert.equal((await reader.homeConfiguration()).memorisationCards,false,'The operational disable is never cached');
  f.databases.core.exec("UPDATE split_deployment_state SET state='PREPARING'");await assert.rejects(academyD1Repository(env).ready(),{code:'SPLIT_PREPARATION_REQUIRED'});
  f.databases.core.exec("UPDATE split_deployment_state SET state='READY'; UPDATE global_role_assignments SET active=0");await assert.rejects(academyD1Repository(env).ready(),{code:'SPLIT_PREPARATION_REQUIRED'});
 }finally{f.close();}
});
