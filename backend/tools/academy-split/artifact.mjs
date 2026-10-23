import {DatabaseSync} from 'node:sqlite';
import {mkdir,writeFile,chmod} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {digest,identifier,restoreSnapshot} from './snapshot.mjs';
import {selectActiveSnapshot} from './selection.mjs';
import {addAcceptedSource,prepareTargets} from './prepare.mjs';
import {verifyCurrentAuthority} from './validate.mjs';

export const splitTargets=Object.freeze({
 core:{name:'dev-academy-core',id:'1c8aece3-dc1d-40d1-8a82-01ab4f63336f'},
 admin:{name:'dev-academy-admin',id:'fe85dac1-b1f0-4079-9127-2e36089aa385'}
});
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value;
export function rowDigest(rows){return digest(rows.map(r=>JSON.stringify(canonical(r))).sort());}
export function databaseManifest(db){
 const tables=db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name").all();
 return Object.fromEntries(tables.map(({name})=>{const rows=db.prepare('SELECT * FROM '+identifier(name)).all();return [name,{rows:rows.length,sha256:rowDigest(rows)}];}));
}
export function databaseSnapshot(db,name,at){
 const schema=db.prepare("SELECT type,name,sql FROM sqlite_schema WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY type,name").all();
 return {format:'ACADEMY_PRIVATE_RECOVERY_V1',at,database:name,records:[...schema.map(r=>({kind:'SCHEMA',type:r.type,name:r.name,data:r.sql})),...schema.filter(r=>r.type==='table').map(r=>({kind:'DATA',name:r.name,data:JSON.stringify(db.prepare('SELECT * FROM '+identifier(r.name)).all())}))]};
}
function sqlValue(value){
 if(value===null)return 'NULL';if(typeof value==='number'){if(!Number.isFinite(value))throw Error('Invalid numeric value');return String(value);}
 if(typeof value!=='string')throw Error('Unexpected private export value');
 // Hex UTF-8 avoids command interpolation, SQL quoting, embedded NULs and
 // literal newlines. These files are private and never enter public assets.
 return "CAST(X'"+Buffer.from(value,'utf8').toString('hex')+"' AS TEXT)";
}
export function importSQL(db,schema,{statementsOnly=false}={}){
 // D1 imports can commit between query groups. Prove every row's insertion
 // order with immediate FK enforcement, rather than relying on one large
 // SQLite transaction or the historical order of rebuilt source tables.
 const ordered=[],check=new DatabaseSync(':memory:');let pending=[];
 try{
  check.exec('PRAGMA foreign_keys=ON;'+schema.tableSQL);
  for(const {name}of db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY rowid").all())for(const row of db.prepare('SELECT * FROM '+identifier(name)).all())pending.push({name,row});
  while(pending.length){const deferred=[];for(const entry of pending){const {name,row}=entry,keys=Object.keys(row);try{check.prepare('INSERT INTO '+identifier(name)+'('+keys.map(identifier).join(',')+') VALUES('+keys.map(()=>'?').join(',')+')').run(...Object.values(row));ordered.push(entry);}catch(error){if(!/FOREIGN KEY constraint failed/.test(error.message))throw error;deferred.push(entry);}}if(deferred.length===pending.length)throw Error('The selected records require a separately rehearsed cyclic-reference import.');pending=deferred;}
 }finally{check.close();}
 const statements=['PRAGMA defer_foreign_keys=ON;',schema.tableSQL,'CREATE TABLE _split_import_values(value_key INTEGER PRIMARY KEY,value_text TEXT NOT NULL);'];
 for(const {name,row}of ordered){
  const prefix='INSERT INTO '+identifier(name)+'('+Object.keys(row).map(identifier).join(',')+') VALUES(',values=Object.values(row);let expressions=values.map(sqlValue),sql=prefix+expressions.join(',')+');';
  if(Buffer.byteLength(sql)>95000){
   expressions=values.map((value,index)=>{
    if(typeof value!=='string')return sqlValue(value);
    // Reassemble large frozen components before immutable triggers exist. Byte
    // chunks are BLOBs until the final CAST, so UTF-8 boundaries remain exact.
    const bytes=Buffer.from(value,'utf8'),chunks=[];for(let i=0;i<bytes.length;i+=30000)chunks.push(bytes.subarray(i,i+30000).toString('hex'));if(!chunks.length)chunks.push('');
    statements.push('INSERT INTO _split_import_values VALUES('+index+",X'"+chunks[0]+"');");for(const chunk of chunks.slice(1))statements.push("UPDATE _split_import_values SET value_text=CAST(value_text AS BLOB)||X'"+chunk+"' WHERE value_key="+index+';');
    return '(SELECT CAST(value_text AS TEXT) FROM _split_import_values WHERE value_key='+index+')';
   });sql=prefix+expressions.join(',')+');';
  }
  if(Buffer.byteLength(sql)>100000)throw Error('A private import row exceeds the D1 statement limit.');statements.push(sql,'DELETE FROM _split_import_values;');
 }
 statements.push('DROP TABLE _split_import_values;',schema.afterSQL,'PRAGMA defer_foreign_keys=OFF;');return statementsOnly?statements:statements.join('\n')+'\n';
}
export async function writePreparation(snapshot,directory,{at=new Date().toISOString()}={}){
 directory=resolve(directory);if(!directory.startsWith('/private/tmp/academy-'))throw Error('Private /private/tmp/academy-… output is required.');
 await mkdir(directory,{mode:0o700});await chmod(directory,0o700);
 const selected=addAcceptedSource(selectActiveSnapshot(snapshot,{at}),snapshot),prepared=await prepareTargets(selected);
 try{
  const authority=await verifyCurrentAuthority(snapshot,selected,prepared),targets={};
  for(const [owner,db]of Object.entries(prepared.databases)){
   const sql=importSQL(db,prepared.schemas[owner]),replay=new DatabaseSync(':memory:');
   try{replay.exec('PRAGMA foreign_keys=ON; BEGIN;'+sql+'COMMIT;');if(replay.prepare('PRAGMA foreign_key_check').all().length||replay.prepare('PRAGMA integrity_check').get().integrity_check!=='ok'||JSON.stringify(databaseManifest(replay))!==JSON.stringify(databaseManifest(db)))throw Error('Target SQL round-trip failed: '+owner);}finally{replay.close();}
   const recovery=databaseSnapshot(db,splitTargets[owner].name,at),restored=restoreSnapshot(recovery);restored.close();
   const manifest=databaseManifest(db);targets[owner]={...splitTargets[owner],schemaSha256:digest(prepared.schemas[owner].sql),sqlSha256:digest(sql),tables:manifest,rows:Object.values(manifest).reduce((n,t)=>n+t.rows,0),state:'PREPARING',foreignKeyErrors:0,integrity:'ok'};
   for(const [file,value]of [['import.sql',sql],['database.json',JSON.stringify(recovery)],['schema.sql',prepared.schemas[owner].sql]])await writeFile(join(directory,owner+'-'+file),value,{mode:0o600,flag:'wx'});
  }
  const report={format:'ACADEMY_SPLIT_PREPARATION_V1',at,sourceDigest:selected.manifest.sourceDigest,selection:selected.manifest,authority,targets,activation:'NOT_ENABLED',oldDatabaseChanged:false,r2ObjectsMoved:false,remainingGates:['OWNER_WRITE_ROUTING','CROSS_STORE_FAILURE_AND_RETRY_REHEARSAL','HOSTED_WORKFLOW_AND_QUERY_BUDGET','PHASE_4_REVIEW_BEFORE_CURRENT_ROUTE_CUTOVER']};
  await writeFile(join(directory,'verification.json'),JSON.stringify(report,null,2),{mode:0o600,flag:'wx'});return report;
 }finally{prepared.close();}
}
