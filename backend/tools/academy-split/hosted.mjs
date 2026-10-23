// Offline preparation of the two explicitly authorised, inactive targets.
// No source database writes, Worker deployment, routing or activation path.
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {splitTargets,databaseManifest} from './artifact.mjs';
import {digest,restoreSnapshot} from './snapshot.mjs';
import {jsonRowSQL} from '../../src/academy/d1/json-row.js';

const run=promisify(execFile),root=fileURLToPath(new URL('../../../',import.meta.url)),cli=join(root,'backend/node_modules/wrangler/bin/wrangler.js'),config=join(root,'backend/wrangler.split-data.jsonc');
export async function prepareHosted(owner,directory){
 if(!Object.hasOwn(splitTargets,owner))throw Error('Choose the explicitly authorised Core or Admin target.');
 directory=resolve(directory);if(!directory.startsWith('/private/tmp/academy-'))throw Error('Private preparation directory required.');
 const target=splitTargets[owner],cfg=JSON.parse(await readFile(config,'utf8'));
 if(cfg.account_id!=='c9a3e355b3d7a795880b1d36a1dbe123'||cfg.d1_databases.length!==2||cfg.d1_databases.some(d=>!Object.values(splitTargets).some(t=>t.name===d.database_name&&t.id===d.database_id)))throw Error('Target binding safety check failed.');
 const evidence=JSON.parse(await readFile(join(directory,'verification.json'),'utf8')),expected=evidence.targets[owner];
 if(expected.name!==target.name||expected.id!==target.id||expected.state!=='PREPARING'||evidence.activation!=='NOT_ENABLED')throw Error('Use a verified inactive target artifact.');
 const sql=await readFile(join(directory,owner+'-import.sql'),'utf8');if(digest(sql)!==expected.sqlSha256)throw Error('Private import artifact changed.');
 const out=join(directory,'hosted-'+owner);await mkdir(out,{mode:0o700,recursive:true});
 async function command(args){
  try{const r=await run(process.execPath,[cli,'d1','execute',target.name,'--remote','--config',config,...args,'--json'],{cwd:join(root,'backend'),maxBuffer:32*1024*1024,env:{...process.env,WRANGLER_LOG_PATH:join(out,'wrangler.log'),WRANGLER_LOG_SANITIZE:'true',WRANGLER_SEND_METRICS:'false'}});if(args.includes('--file'))return [];const parsed=JSON.parse(r.stdout);if(!parsed.every(r=>r.success))throw Error('D1 returned failure');return parsed.flatMap(r=>r.results||[]);}
  catch(error){await writeFile(join(out,'failure.log'),String(error.stdout||error.stderr||error.message),{mode:0o600});throw Error('Hosted preparation needs inspection of the private failure log. No automatic overwrite or activation.');}
 }
 const schemaSQL="SELECT type,name,sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND sql IS NOT NULL ORDER BY type,name",before=await command(['--command',schemaSQL]);
 if(!before.length)await command(['--file',join(directory,owner+'-import.sql'),'--yes']);
 // An unknown import acknowledgement is recovered by exact readback. A
 // nonempty target is never overwritten, truncated or blindly re-imported.
 const schema=await command(['--command',schemaSQL]),tables=schema.filter(r=>r.type==='table');
 if(tables.some(t=>!Object.hasOwn(expected.tables,t.name))||tables.length!==Object.keys(expected.tables).length)throw Error('Target schema differs; preserve it for inspection.');
 const columns=await command(['--command',"SELECT s.name,(SELECT json_group_array(name) FROM pragma_table_info(s.name)) columns_json FROM sqlite_schema s WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name"]);
 const capture="WITH copied_data(name,data) AS(VALUES "+columns.map(t=>{if(!/^[a-z_][a-z_0-9]*$/i.test(t.name)||JSON.parse(t.columns_json).some(c=>!/^[a-z_][a-z_0-9]*$/i.test(c)))throw Error('Invalid target identifier');return "('"+t.name+"',(SELECT json_group_array("+jsonRowSQL(JSON.parse(t.columns_json))+") FROM "+t.name+'))';}).join(',')+") SELECT name,data FROM copied_data";
 if(Buffer.byteLength(capture)>100000)throw Error('Split readback exceeds the D1 statement budget.');
 const rows=await command(['--command',capture]),snapshot={format:'ACADEMY_PRIVATE_RECOVERY_V1',at:new Date().toISOString(),database:target.name,records:[...schema.map(r=>({kind:'SCHEMA',type:r.type,name:r.name,data:r.sql})),...rows.map(r=>({kind:'DATA',name:r.name,data:r.data}))]};
 const db=restoreSnapshot(snapshot);let manifest;
 try{manifest=databaseManifest(db);if(JSON.stringify(manifest)!==JSON.stringify(expected.tables))throw Error('Hosted counts or exact row hashes differ; preserve the inactive target.');if(owner==='core'&&db.prepare('SELECT state FROM split_deployment_state WHERE singleton=1').get()?.state!=='PREPARING')throw Error('Target activation state changed.');}
 finally{db.close();}
 const fk=await command(['--command','PRAGMA foreign_key_check']);if(fk.length)throw Error('Hosted foreign key check failed.');
 const recovery=JSON.stringify(snapshot),report={at:snapshot.at,target:target.name,databaseId:target.id,rows:expected.rows,tables:tables.length,exactTableHashesMatch:true,foreignKeyErrors:0,restoredIntegrity:'ok',snapshotSha256:digest(recovery),activation:'NOT_ENABLED',oldDatabaseChanged:false,workerDeployed:false};
 await writeFile(join(out,'database.json'),recovery,{mode:0o600,flag:'wx'});await writeFile(join(out,'verification.json'),JSON.stringify(report,null,2),{mode:0o600,flag:'wx'});return report;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [owner,directory]=process.argv.slice(2);console.log(JSON.stringify(await prepareHosted(owner,directory)));
}
