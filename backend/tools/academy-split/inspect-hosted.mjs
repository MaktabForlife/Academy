import {splitTargets} from './artifact.mjs';
import {jsonRowSQL} from '../../src/academy/d1/json-row.js';
// Read-only recovery export for connections whose D1 export API is unavailable.
// Keep all data and command output outside shipped assets, with private modes.
import {DatabaseSync} from 'node:sqlite';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdir,writeFile,chmod} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve,join} from 'node:path';
const target=splitTargets[process.argv[2]];if(!target)throw Error('Choose core or admin.');const directory=process.argv[3];if(!directory?.startsWith('/private/tmp/academy-'))throw Error('Use a private /private/tmp/academy-… recovery directory.');
await mkdir(directory,{recursive:true,mode:0o700});await chmod(directory,0o700);
const root=fileURLToPath(new URL('../../../',import.meta.url)),cli=join(root,'backend/node_modules/wrangler/bin/wrangler.js'),run=promisify(execFile),config=join(root,'backend/wrangler.split-data.jsonc');
async function query(sql){
 try{const result=await run(process.execPath,[cli,'d1','execute',target.name,'--remote','--config',config,'--command',sql,'--json'],{cwd:join(root,'backend'),maxBuffer:32*1024*1024,env:{...process.env,WRANGLER_LOG_PATH:join(directory,'query.log'),WRANGLER_LOG_SANITIZE:'true',WRANGLER_SEND_METRICS:'false'}});const data=JSON.parse(result.stdout);if(!data.every(r=>r.success))throw Error('query failed');return data.flatMap(r=>r.results);}
 catch(error){await writeFile(join(directory,'failure.log'),String(error.stdout||error.stderr||error.message),{mode:0o600});throw Error('Recovery query failed. See the private failure log.');}
}
const schema=await query("SELECT name,sql,(SELECT json_group_array(name) FROM pragma_table_info(s.name)) columns_json FROM sqlite_schema s WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name");
if(schema.some(t=>!/^\w+$/.test(t.name)||JSON.parse(t.columns_json).some(c=>!/^\w+$/.test(c))))throw Error('Unexpected database identifier.');
const sql="WITH backup_data(name,data) AS (VALUES "+schema.map(t=>`('${t.name}',(SELECT json_group_array(${jsonRowSQL(JSON.parse(t.columns_json))}) FROM "${t.name}"))`).join(',')+") SELECT 'SCHEMA' kind,type,name,sql data FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND sql IS NOT NULL UNION ALL SELECT 'DATA','table',name,data FROM backup_data";
if(Buffer.byteLength(sql)>100000)throw Error('Recovery statement exceeds the D1 SQL limit.');
const records=await query(sql),file=join(directory,'database.json'),json=JSON.stringify({format:'ACADEMY_PRIVATE_RECOVERY_V1',at:new Date().toISOString(),database:target.name,records});
await writeFile(file,json,{mode:0o600});
const db=new DatabaseSync(':memory:');let rows=0;
try{
 db.exec('PRAGMA foreign_keys=OFF');for(const r of records.filter(r=>r.kind==='SCHEMA'&&r.type==='table'))db.exec(r.data);
 for(const r of records.filter(r=>r.kind==='DATA'))for(const row of JSON.parse(r.data)){const columns=Object.keys(row);db.prepare(`INSERT INTO "${r.name}" (${columns.map(c=>'"'+c+'"').join(',')}) VALUES(${columns.map(()=>'?').join(',')})`).run(...Object.values(row));rows++;}
 for(const r of records.filter(r=>r.kind==='SCHEMA'&&r.type!=='table'))db.exec(r.data);
 db.exec('PRAGMA foreign_keys=ON');if(db.prepare('PRAGMA integrity_check').get().integrity_check!=='ok'||db.prepare('PRAGMA foreign_key_check').all().length)throw Error('Recovery verification failed.');
 const report={at:new Date().toISOString(),file,sha256:createHash('sha256').update(json).digest('hex'),bytes:Buffer.byteLength(json),tables:schema.length,rows,integrity:'ok',foreignKeyErrors:0,readOnly:true};
 await writeFile(join(directory,'verification.json'),JSON.stringify(report,null,2),{mode:0o600});console.log(JSON.stringify(report));
}finally{db.close();}
