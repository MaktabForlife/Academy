import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {federationContext} from '../src/academy/separation/federation.js';
import {sqliteD1} from '../tools/academy-split/sqlite-d1.mjs';

test('publication history can exceed D1’s per-value limit without aggregating it into one database string',async()=>{
 const db=new DatabaseSync(':memory:');
 try{
  db.exec('CREATE TABLE setup_components(component_id TEXT,batch_id TEXT,table_name TEXT,scope_key TEXT,rows_json TEXT,row_count INTEGER,digest TEXT)');
  const payload=JSON.stringify([{document_json:'Synthetic course wording. '.repeat(27000)}]);
  const insert=db.prepare('INSERT INTO setup_components VALUES(?,?,?,?,?,?,?)');
  for(let i=0;i<4;i++)insert.run('component-'+i,'batch-'+i,'program_surah_website_documents','PROGRAM:synthetic',payload,1,'a'.repeat(64));
  assert(Buffer.byteLength(payload)*4>2000000);
  const d1=sqliteD1(db),limited={prepare(sql){const statement=d1.prepare(sql);const wrapped={bind(...values){if(values.some(value=>typeof value==='string'&&Buffer.byteLength(value)>2000000))throw Error('D1_ERROR: bound value too big');statement.bind(...values);return wrapped;},async all(){const result=await statement.all();for(const row of result.results)for(const value of Object.values(row))if(typeof value==='string'&&Buffer.byteLength(value)>2000000)throw Error('D1_ERROR: string or blob too big');return result;}};return wrapped;}};
  const context=federationContext({core:limited,admin:limited});
  const result=await context.capture('core',['setup_components']);
  assert.equal(result.setup_components.length,4);assert(result.setup_components.every(row=>row.rows_json===payload));
  assert.equal((await context.query('SELECT count(*) n FROM setup_components',[],result)).results[0].n,4,'Large captured tables also use bounded read parameters');
  const selected=await context.capture('core',['setup_components'],{ids:['component-2']});
  assert.deepEqual(selected.setup_components.map(row=>row.component_id),['component-2']);
  const empty=await context.capture('core',['setup_components'],{ids:[]});assert.deepEqual(empty.setup_components,[]);
 }finally{db.close();}
});
