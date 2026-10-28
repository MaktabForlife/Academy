import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {sqliteD1} from '../tools/academy-split/sqlite-d1.mjs';
import {insertComponents} from '../src/academy/d1/setup-publication.js';

test('a safe course component can publish without a second JSON escape expansion',async()=>{
 const db=new DatabaseSync(':memory:');
 try{
  db.exec('CREATE TABLE setup_components(component_id TEXT PRIMARY KEY,batch_id TEXT,table_name TEXT,scope_key TEXT,rows_json TEXT,row_count INTEGER,digest TEXT)');
  const rows_json=JSON.stringify(Array.from({length:8},(_,i)=>({surah_id:'synthetic-'+i,document_json:JSON.stringify({text:'Original course wording ﷺ. '.repeat(3200),blocks:Array.from({length:1100},(_,n)=>({id:'item-'+n,text:'',arabic:'',attribution:''}))})})));
  const c={table_name:'program_surah_website_documents',scope_key:'PROGRAM:synthetic',rows_json,row_count:8,digest:'a'.repeat(64)};
  assert(Buffer.byteLength(rows_json)<1500000);assert(Buffer.byteLength(JSON.stringify(c))>1500000,'Reproduce the rejected envelope');
  const small={table_name:'activities',scope_key:'GLOBAL',rows_json:'[]',row_count:0,digest:'b'.repeat(64)};
  const statements=insertComponents(sqliteD1(db),'synthetic-batch',[small,c,{...small,scope_key:'OTHER'}]);
  await sqliteD1(db).batch(statements);
  const actual=db.prepare('SELECT * FROM setup_components ORDER BY rowid').all();assert.equal(actual.length,3);
  assert.deepEqual(actual.map(x=>x.scope_key),['GLOBAL','PROGRAM:synthetic','OTHER']);
  for(const [i,input] of [small,c,{...small,scope_key:'OTHER'}].entries())for(const key of Object.keys(input))assert.equal(actual[i][key],input[key]);
  assert(actual.every(x=>x.batch_id==='synthetic-batch'&&/^[\da-f-]{36}$/.test(x.component_id)));
 }finally{db.close();}
});
test('an actually oversized component still fails before any statements are submitted',()=>{
 const c={table_name:'program_surah_website_documents',scope_key:'PROGRAM:synthetic',rows_json:JSON.stringify([{text:'ح'.repeat(760000)}]),row_count:1,digest:'c'.repeat(64)};
 assert.throws(()=>insertComponents({prepare(){throw Error('No SQL should run');}},'synthetic',[c]),error=>error.code==='SETUP_TOO_LARGE'&&error.status===413);
});
