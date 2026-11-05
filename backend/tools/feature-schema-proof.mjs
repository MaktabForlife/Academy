// GitHub-only synthetic schema construction. No Cloudflare client or credentials.
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync,mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,join} from 'node:path';
import {splitFixture} from '../tests/fixtures/academy-split-fixture.mjs';
import {videoMigration} from './academy-session-video-migration.mjs';
const sha=value=>createHash('sha256').update(value).digest('hex');
const q=value=>'"'+value.replaceAll('"','""')+'"';
const schema=db=>db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'view' THEN 1 WHEN 'index' THEN 2 ELSE 3 END,name").all();
export async function proveFeatureSchemas(output){
 const f=await splitFixture();
 const report={schema:1,commit:process.env.GITHUB_SHA||null,sourceBase:'b1ce8b55e2484630dc3cbce86abb22b4e6d08c82',syntheticOnly:true,cloudflareRequests:0,hostedWrites:0,containsSeedData:false,targets:{}};
 try{
  for(const [owner,db]of Object.entries(f.databases)){
   const before=db.prepare("SELECT type,name,sql FROM sqlite_schema WHERE tbl_name='lesson_media_assets' AND sql IS NOT NULL ORDER BY type,name").all();
   db.exec('BEGIN');db.exec(videoMigration(before));db.exec('COMMIT');
   const directory=new URL('../migrations/academy-'+owner+'/',import.meta.url),migrations=[];
   for(const name of readdirSync(directory).filter(n=>/^\d{4}_.+\.sql$/.test(n)).sort()){
    const sql=readFileSync(new URL(name,directory),'utf8');
    try{db.exec(sql);}catch(error){throw Error(owner+'/'+name+': '+error.message);}
    migrations.push({name,sha256:sha(sql)});
   }
   assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
   const records=schema(db),ddl=records.map(r=>r.sql+';').join('\n\n')+'\n',empty=new DatabaseSync(':memory:');
   try{
    empty.exec('PRAGMA foreign_keys=ON');empty.exec(ddl);
    assert.deepEqual(schema(empty),records,'Lossless tables/views/indexes/triggers');
    assert.deepEqual(empty.prepare('PRAGMA foreign_key_check').all(),[]);
    assert.equal(empty.prepare('PRAGMA quick_check').get().quick_check,'ok');
    for(const {name}of records.filter(r=>r.type==='table'))assert.equal(empty.prepare('SELECT count(*) n FROM '+q(name)).get().n,0,'No fixture data exported: '+name);
    if(owner==='core'){
     for(const name of ['accounts','account_credentials','account_sessions','split_deployment_state'])assert.equal(empty.prepare('SELECT count(*) n FROM '+q(name)).get().n,0);
    }
    report.targets[owner]={ddlSha256:sha(ddl),migrationInputs:migrations,objects:records.map(({type,name,tbl_name})=>({type,name,table:tbl_name})),tableCount:records.filter(r=>r.type==='table').length,foreignKeyErrors:0,quickCheck:'ok',rows:0};
    if(output){mkdirSync(output,{recursive:true});writeFileSync(join(output,owner+'-schema.sql'),ddl);}
   }finally{empty.close();}
  }
  if(output)writeFileSync(join(output,'schema-proof.json'),JSON.stringify(report,null,2)+'\n');
  return report;
 }finally{f.close();}
}
if(process.argv[1]&&resolve(process.argv[1])===new URL(import.meta.url).pathname){
 const report=await proveFeatureSchemas(process.argv[2]);console.log(JSON.stringify(report));
}
