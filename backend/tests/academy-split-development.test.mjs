import test from 'node:test';
import assert from 'node:assert/strict';
import {splitFixture} from './fixtures/academy-split-fixture.mjs';
import {markRefresh,refreshObject} from '../src/academy/d1/refresh-state.js';
import {recoverCacheRefresh} from '../src/academy/d1/cache-refresh.js';
import {recoveryBucket} from '../src/academy/d1/recovery-storage.js';

async function use(run){
 const f=await splitFixture(),objects=new Map();
 try{
  f.databases.core.exec("UPDATE split_deployment_state SET state='READY'");
  const env={...f.source.env,ACADEMY_DB:f.core,ACADEMY_ADMIN_DB:f.admin,ACADEMY_DB_GENERATION:'SPLIT_V1',ACADEMY_D1_RUN_ID:f.prepared.report.sourceDigest,ACADEMY_ACCEPTED_SETUP:'1',ACADEMY_SPLIT_COORDINATOR:{getByName(){throw Error('Scheduled recovery must not impersonate an Admin.');}},MEDIA_BUCKET:{
   async get(key){const row=objects.get(key);return row?{etag:row.etag,json:async()=>JSON.parse(row.body)}:null;},
   async put(key,body,{onlyIf}={}){const previous=objects.get(key);if(onlyIf?.etagDoesNotMatch==='*'&&previous||onlyIf?.etagMatches!==undefined&&previous?.etag!==onlyIf.etagMatches)return null;const row={body,etag:String(objects.size+1)};objects.set(key,row);return row;}
  }};
  const p=(sql,...values)=>f.core.prepare(sql).bind(...values);
  for(const kind of ['profile-labels','public-timetable'])await markRefresh(p,kind,f.actors.global).run();
  await run({f,env,objects});
  for(const db of Object.values(f.databases))assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
 }finally{f.close();}
}

test('scheduled split recovery publishes pending labels and timetables without an Admin session',()=>use(async({f,env,objects})=>{
 const result=await recoverCacheRefresh(env);assert.deepEqual(result.completed,['profile-labels','public-timetable']);assert.equal(result.pending,false);
 assert(objects.has(refreshObject(env,'profile-labels')));assert([...objects.keys()].some(key=>key.startsWith('academy-public-timetable/')));
 const rows=f.databases.core.prepare("SELECT setting_value FROM academy_settings WHERE setting_key LIKE 'AcademyRefresh:%'").all();
 assert(rows.every(row=>{const value=JSON.parse(row.setting_value);return value.requested===value.published&&value.leaseUntil===0;}));
 assert.equal(f.databases.admin.prepare("SELECT count(*) n FROM academy_settings WHERE setting_key LIKE 'AcademyRefresh:%'").get().n,0);
}));

test('scheduled split recovery respects an outstanding cross-store write fence',()=>use(async({f,env,objects})=>{
 f.databases.core.exec("INSERT INTO split_commands(command_id,phase,payload_hash,created_at) VALUES('recovery-test','PREPARING','synthetic','2026-10-24T00:00:00Z');INSERT INTO split_write_fence VALUES(1,'recovery-test',0)");
 const result=await recoverCacheRefresh(env);assert.equal(result.pending,true);assert.equal(objects.size,0);
 const rows=f.databases.core.prepare("SELECT setting_value FROM academy_settings WHERE setting_key LIKE 'AcademyRefresh:%'").all();assert(rows.every(row=>JSON.parse(row.setting_value).published===0));
}));

test('Development retains original recovery bytes and cleans up current uploads normally',async()=>{
 const removed=[],bucket={async get(key){assert.equal(this,bucket);return key;},async delete(keys){assert.equal(this,bucket);removed.push(keys);}},protectedBucket=recoveryBucket(bucket,'dev-split-v1/');
 assert.equal(await protectedBucket.get('original.pdf'),'original.pdf');await protectedBucket.delete('original.pdf');assert.deepEqual(removed,[]);
 await protectedBucket.delete('dev-split-v1/new.pdf');await protectedBucket.delete(['old.pdf','dev-split-v1/another.pdf']);assert.deepEqual(removed,['dev-split-v1/new.pdf',['dev-split-v1/another.pdf']]);
});
