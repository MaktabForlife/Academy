// Offline packaging. Deployment uses only the generated, isolated resource IDs.
import {DatabaseSync} from 'node:sqlite';
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync,lstatSync,realpathSync,readdirSync} from 'node:fs';
import {resolve,join,dirname,extname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomBytes,randomInt,randomUUID} from 'node:crypto';
import {flowFixture} from '../tests/fixtures/academy-d1-fixture.mjs';
import {withLearningSource} from '../tests/fixtures/academy-d1-learning-fixture.mjs';
import {fixtureTab} from '../tests/fixtures/academy-migration-fixture.mjs';
import {createSaltedPinHash} from '../src/lib/auth.js';
import {buildOperationalImport,importOperationalPlan} from './academy-migration/operational.mjs';
import {buildLearningImport,importLearningPlan} from './academy-migration/learning.mjs';
import {buildCourseCalendarImport,importCourseCalendarPlan} from './academy-migration/course-calendar.mjs';
import {activationFacts,buildCoreActivationPlan,applyCoreActivationLocally} from './academy-migration/activation.mjs';
import {CORE_ACTIVATION_CHECKS} from '../src/academy/d1/activation-policy.js';

export function validateFeatureTarget({name,databaseId,bucket,accountId}) {
  if(!/^academy-feature-\d{5}$/.test(name)||bucket!==name)throw Error('ISOLATED_FEATURE_RESOURCES_REQUIRED');
  if(!/^[a-f0-9-]{36}$/i.test(databaseId)||databaseId.toLowerCase()==='7e732b79-a72f-4da6-be83-524919c49ba4')throw Error('LIVE_DATABASE_PROHIBITED');
  if(!/^[a-f0-9]{32}$/.test(accountId))throw Error('ACCOUNT_REQUIRED');
}
const literal=v=>v===null?'NULL':typeof v==='number'?String(v):"'"+String(v).replaceAll("'","''")+"'";
function databaseSQL(db) {
  const schema=activationFacts(db).schema,tables=schema.filter(s=>s.type==='table'),pending=new Set(tables.map(t=>t.name)),ordered=[];
  while(pending.size){const next=[...pending].find(name=>db.prepare('PRAGMA foreign_key_list("'+name+'")').all().every(f=>f.table===name||!pending.has(f.table)));if(!next)throw Error('CYCLIC_PREVIEW_DATA');pending.delete(next);ordered.push(next);}
  return [...tables.map(t=>t.sql+';'),...ordered.flatMap(name=>db.prepare('SELECT * FROM "'+name+'"').all().map(row=>`INSERT INTO "${name}" (${Object.keys(row).map(k=>'"'+k+'"').join(',')}) VALUES (${Object.values(row).map(literal).join(',')});`)),...schema.filter(s=>s.type!=='table').map(s=>s.sql+';')].join('\n');
}
export async function prepareFeaturePreview({repo,directory,name,databaseId,bucket,accountId}) {
  validateFeatureTarget({name,databaseId,bucket,accountId});repo=realpathSync(repo);directory=resolve(directory);
  if(!directory.startsWith('/private/tmp/'))throw Error('PRIVATE_PREVIEW_DIRECTORY_REQUIRED');
  mkdirSync(directory,{mode:0o700});const save=(file,bytes)=>writeFileSync(join(directory,file),bytes,{mode:0o600,flag:'wx'});
  const secrets={PIN_SECRET:randomBytes(32).toString('base64url'),SESSION_SECRET:randomBytes(32).toString('base64url')},pin=String(randomInt(1000,10000));
  const {snapshot,policy}=await flowFixture(12);snapshot.environment='development';policy.environment='development';withLearningSource(snapshot);
  const accounts=fixtureTab(snapshot,'UserAccounts'),h=accounts.rows[0],hash=await createSaltedPinHash(pin,secrets.PIN_SECRET);
  accounts.rows.slice(1).filter(r=>r.length).forEach((r,i)=>{r[h.indexOf('PINHash')]=hash;r[h.indexOf('UniqueID')]=i===0?'ReviewAdmin10660':'ReviewLearner'+String(i+1).padStart(2,'0');});
  const base=await buildOperationalImport(snapshot,policy),learning=buildLearningImport(snapshot,base),course=buildCourseCalendarImport(snapshot,base),db=new DatabaseSync(join(directory,'preview.sqlite'));
  try{
    importOperationalPlan(db,base);
    for(const file of readdirSync(join(repo,'backend/migrations/academy')).filter(f=>/^\d+.*\.sql$/.test(f)).sort().slice(3)){
      db.exec(readFileSync(join(repo,'backend/migrations/academy',file),'utf8'));
      if(file.startsWith('0005_'))importLearningPlan(db,learning);
      if(file.startsWith('0006_'))importCourseCalendarPlan(db,course);
      if(file.startsWith('0007_'))applyCoreActivationLocally(db,buildCoreActivationPlan(db,{reviewId:randomUUID(),sourceSha256:base.tables.migration_runs[0].source_snapshot_sha256,codeCommit:'0'.repeat(40),libraryMode:'PUBLIC_ONLY',evidence:Object.fromEntries(CORE_ACTIVATION_CHECKS.map(k=>[k,{status:'PASS',reference:'SYNTHETIC FEATURE PREVIEW ONLY: '+k}]))}));
    }
    const facts=activationFacts(db),sql=databaseSQL(db),roundtrip=new DatabaseSync(':memory:');
    try{roundtrip.exec('PRAGMA foreign_keys=ON');roundtrip.exec(sql);if(activationFacts(roundtrip).fingerprint!==facts.fingerprint)throw Error('PREVIEW_INSTALL_MISMATCH');}finally{roundtrip.close();}
    save('preview-install.sql',sql);save('preview-secrets.json',JSON.stringify(secrets));save('preview-access.json',JSON.stringify({login:'ReviewAdmin10660',pin,syntheticOnly:true},null,2));
    const assets=join(directory,'assets');mkdirSync(assets,{mode:0o700});
    const paths=['academy','account','programs','users','js','css','icons','images','pdf-viewer','recorder','activities','academy.png','ummabbadacademy.png','logo.png','version.json','app.js','styles.css'];
    const files=execFileSync('git',['ls-files','-z','--',...paths],{cwd:repo,encoding:'utf8'}).split('\0').filter(Boolean);
    let assetBytes=0;
    for(const file of files){const source=join(repo,file),info=lstatSync(source);if(!info.isFile()||realpathSync(source)!==source||info.size>25*1024*1024)throw Error('INVALID_PUBLIC_ASSET');if(!extname(file))continue;
      let bytes=readFileSync(source);if(file.endsWith('.html'))bytes=Buffer.from(bytes.toString().replace(/<head>/i,'<head>\n<meta name="robots" content="noindex,nofollow">'));
      const target=join(assets,file);mkdirSync(dirname(target),{recursive:true});writeFileSync(target,bytes,{mode:0o600});assetBytes+=bytes.length;
    }
    const origin=`https://${name}.maktab4life.workers.dev`;
    const config={name,account_id:accountId,main:join(repo,'backend/tools/feature-preview-worker.mjs'),compatibility_date:'2026-10-14',workers_dev:true,
      assets:{directory:assets,binding:'ASSETS',run_worker_first:true,html_handling:'none',not_found_handling:'none'},
      d1_databases:[{binding:'ACADEMY_DB',database_name:name,database_id:databaseId}],
      r2_buckets:['MEDIA_BUCKET','ASSESSMENT_BUCKET','LESSON_MEDIA_BUCKET'].map(binding=>({binding,bucket_name:bucket})),
      durable_objects:{bindings:[{name:'PROGRAM_TIMETABLE_COORDINATOR',class_name:'ProgramTimetableCoordinator'}]},migrations:[{tag:'feature-preview-v1',new_sqlite_classes:['ProgramTimetableCoordinator']}],
      ratelimits:[{name:'AUTH_LOGIN_RATE_LIMITER',namespace_id:'10660001',simple:{limit:5,period:60}}],
      triggers:{crons:['*/15 * * * *']},observability:{enabled:true,head_sampling_rate:1},
      vars:{ENVIRONMENT:'development',ACADEMY_D1_MODE:'ACTIVE',ACADEMY_LIBRARY_MODE:'PUBLIC_ONLY',ACADEMY_D1_RUN_ID:base.runId,API_ORIGIN:origin,ALLOWED_ORIGINS:origin+',https://feature-academy-review-fixes-10660.maktab-development.pages.dev'}};
    save('wrangler.preview.json',JSON.stringify(config,null,2));
    const manifest={syntheticOnly:true,name,databaseId,bucket,origin,accounts:base.tables.accounts.length,seedRows:Object.values(facts.tableCounts).reduce((a,b)=>a+b,0),schemaObjects:facts.schema.length,assetFiles:files.length,assetBytes,sqlBytes:Buffer.byteLength(sql),liveDatabaseChanged:false};save('preview-manifest.json',JSON.stringify(manifest,null,2));return manifest;
  }finally{db.close();}
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){const [directory,databaseId]=process.argv.slice(2);console.log(JSON.stringify(await prepareFeaturePreview({repo:process.cwd(),directory,databaseId,name:'academy-feature-10660',bucket:'academy-feature-10660',accountId:'c9a3e355b3d7a795880b1d36a1dbe123'})));}
