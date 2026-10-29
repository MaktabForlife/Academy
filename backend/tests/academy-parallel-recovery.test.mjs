import test from 'node:test';import assert from 'node:assert/strict';import {assertRecoverySQL,apiQuery,recoveryDatabase} from '../tools/academy-parallel-recovery.mjs';
test('operator recovery cannot write master permissions or credentials and preserves explicit bindings',async()=>{
 for(const sql of ['UPDATE accounts SET active=1','INSERT INTO program_surah_grants VALUES(1)','DELETE FROM paid_months','DROP TABLE accounts','WITH x AS(SELECT 1) UPDATE accounts SET active=1'])assert.throws(()=>assertRecoverySQL(sql));
 assert.deepEqual(apiQuery('UPDATE website_platform_outbox SET acknowledged=? WHERE operation_id=?',[1,"example'operation"]),{sql:'UPDATE website_platform_outbox SET acknowledged=CAST(? AS INTEGER) WHERE operation_id=?',params:['1',"example'operation"]});
 assert.deepEqual(apiQuery('INSERT INTO website_platform_guards VALUES(?,?)',['guard',null]),{sql:'INSERT INTO website_platform_guards VALUES(?,NULL)',params:['guard']});
 assert.throws(()=>apiQuery('SELECT ?',[{}]));assert.throws(()=>apiQuery('SELECT ?',[1,2]));
 let calls=0;const db=recoveryDatabase(async q=>{calls++;return q.map(()=>({success:true,results:[{enabled:1}],meta:{rows_read:1}}));});assert.equal(await db.prepare('SELECT enabled FROM website_platform_control').first('enabled'),1);assert.equal(db.withSession('first-primary'),db);await db.batch([db.prepare('UPDATE website_platform_outbox SET acknowledged=?').bind(1)]);assert.equal(calls,2);
});
test('recovery numeric and null bindings retain SQLite guard semantics through string-only management parameters',async()=>{
 const {DatabaseSync}=await import('node:sqlite'),sql=new DatabaseSync(':memory:');sql.exec('CREATE TABLE website_platform_guards(guard_id TEXT PRIMARY KEY,accepted INTEGER NOT NULL CHECK(accepted=1));CREATE TABLE website_platform_outbox(operation_id TEXT PRIMARY KEY,acknowledged INTEGER DEFAULT 0);INSERT INTO website_platform_outbox VALUES(\'operation\',0);');
 const db=recoveryDatabase(async statements=>{sql.exec('BEGIN');try{const results=statements.map(q=>({success:true,results:sql.prepare(q.sql).all(...q.params),meta:{}}));sql.exec('COMMIT');return results;}catch(error){sql.exec('ROLLBACK');throw error;}});
 try{
  assert.equal(await db.prepare('SELECT ?=1 AS matched').bind(1).first('matched'),1);
  assert.equal(await db.prepare('SELECT ? IS NULL AS matched').bind(null).first('matched'),1);
  await assert.rejects(()=>db.batch([db.prepare('INSERT INTO website_platform_guards VALUES(?,?=1)').bind('rejected',0),db.prepare('UPDATE website_platform_outbox SET acknowledged=?').bind(1)]));
  assert.equal(await db.prepare('SELECT acknowledged FROM website_platform_outbox').first('acknowledged'),0);
 }finally{sql.close();}
});
