// Offline, disposable synthetic seed and artifact builder. No hosted calls.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {randomBytes} from 'node:crypto';
import {mobileFirstFixture} from './fixture.mjs';
import {buildAcademyAssets} from '../academy-assets.mjs';
import {createSaltedPinHash} from '../../src/lib/auth-primitives.js';

const repo=resolve(new URL('../../../',import.meta.url).pathname),directory=resolve(process.argv[2]||'');
if(!directory.startsWith('/private/tmp/academy-mobile-first-preview-'))throw Error('Dedicated temporary preview directory required');
mkdirSync(directory,{mode:0o700});
const version=JSON.parse(readFileSync(join(repo,'version.json'))).version;
const name='academy-mobile-first-preview',origin='https://'+name+'.maktab4life.workers.dev';
const secrets={PIN_SECRET:randomBytes(32).toString('hex'),SESSION_SECRET:randomBytes(32).toString('hex'),PREVIEW_PIN:String(randomBytes(4).readUInt32BE()%9000+1000)};
const f=await mobileFirstFixture();
try {
  const hash=await createSaltedPinHash(secrets.PREVIEW_PIN,secrets.PIN_SECRET);
  f.db.prepare('UPDATE account_credentials SET pin_hash=?').run(hash);
  f.db.exec('DELETE FROM account_sessions;');
  const quoted=name=>'"'+name.replaceAll('"','""')+'"';
  const literal=value=>value===null?'NULL':typeof value==='number'||typeof value==='bigint'?String(value):value instanceof Uint8Array?"X'"+Buffer.from(value).toString('hex')+"'":"'"+String(value).replaceAll("'","''")+"'";
  const schema=f.db.prepare("SELECT type,name,sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'index' THEN 1 WHEN 'view' THEN 2 ELSE 3 END,name").all();
  const tables=schema.filter(s=>s.type==='table'),remaining=new Set(tables.map(t=>t.name)),ordered=[];
  while(remaining.size){
    const ready=[...remaining].filter(name=>f.db.prepare('PRAGMA foreign_key_list('+quoted(name)+')').all().every(fk=>fk.table===name||!remaining.has(fk.table))).sort();
    if(!ready.length)throw Error('Cyclic synthetic table dependencies');
    for(const name of ready){ordered.push(tables.find(t=>t.name===name));remaining.delete(name);}
  }
  const sql=['PRAGMA defer_foreign_keys=ON;',...tables.map(table=>table.sql+';')];
  for(const table of ordered) {
    for(const row of f.db.prepare('SELECT * FROM '+quoted(table.name)).all())sql.push('INSERT INTO '+quoted(table.name)+'('+Object.keys(row).map(quoted).join(',')+') VALUES('+Object.values(row).map(literal).join(',')+');');
  }
  sql.push(...schema.filter(s=>s.type!=='table').map(s=>s.sql+';'));
  writeFileSync(join(directory,'synthetic.sql'),sql.join('\n'),{mode:0o600});
  // Small query batches avoid the bulk-import service and remain below argument limits.
  const chunks=[];let chunk='';
  for(const statement of sql.slice(1)){
    if(Buffer.byteLength(chunk+statement)>60000&&chunk){chunks.push('PRAGMA defer_foreign_keys=ON;\n'+chunk);chunk='';}
    chunk+=statement+'\n';
  }
  if(chunk)chunks.push('PRAGMA defer_foreign_keys=ON;\n'+chunk);
  writeFileSync(join(directory,'query-chunks.json'),JSON.stringify(chunks),{mode:0o600});
  writeFileSync(join(directory,'secrets.json'),JSON.stringify(secrets),{mode:0o600});
  const assets=join(directory,'assets'),built=buildAcademyAssets({repo,directory:assets,isolated:true});
  // The entrypoint serves this too, making accidental static-only hosting safe.
  writeFileSync(join(assets,'js/m4l-config.js'),'window.M4L_CONFIG=Object.freeze({API_BASE:location.origin,IS_DEVELOPMENT:true,IS_PRODUCTION:false});\n');
  const config={name,account_id:'c9a3e355b3d7a795880b1d36a1dbe123',main:join(repo,'backend/tools/mobile-first-preview/worker.mjs'),compatibility_date:'2026-10-27',compatibility_flags:['nodejs_compat'],workers_dev:true,preview_urls:false,
    observability:{enabled:true,head_sampling_rate:1},vars:{ENVIRONMENT:'development',ACADEMY_DEPLOYMENT_KIND:'ISOLATED_PREVIEW',ACADEMY_D1_MODE:'REHEARSAL',ACADEMY_LIBRARY_MODE:'PUBLIC_ONLY',ACADEMY_ACCEPTED_SETUP:'1',ACADEMY_LEARNING_OPERATIONS:'3',ACADEMY_MESSAGING:'1',PREVIEW_SYNTHETIC_ONLY:'1',PREVIEW_ORIGIN:origin,PREVIEW_VERSION:version,ALLOWED_ORIGINS:origin},
    assets:{directory:assets,binding:'ASSETS',run_worker_first:true,html_handling:'none',not_found_handling:'none'},
    d1_databases:[{binding:'ACADEMY_DB',database_name:name,database_id:'00000000-0000-4000-8000-000000000087'}],
    r2_buckets:[{binding:'ASSESSMENT_BUCKET',bucket_name:name},{binding:'LESSON_MEDIA_BUCKET',bucket_name:name}],
    ratelimits:[{name:'AUTH_LOGIN_RATE_LIMITER',namespace_id:'108787',simple:{limit:30,period:60}}]};
  writeFileSync(join(directory,'wrangler.json'),JSON.stringify(config,null,2),{mode:0o600});
  const report={version,base:'107.84',branch:'feature/academy-mobile-first',origin,syntheticOnly:true,assetFiles:built.fileCount,seedBytes:Buffer.byteLength(sql.join('\n')),tables:schema.filter(s=>s.type==='table').length,bindings:Object.keys(f.env).filter(key=>!['PIN_SECRET','SESSION_SECRET'].includes(key))};
  writeFileSync(join(directory,'build-report.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report));
}finally{f.close();}
