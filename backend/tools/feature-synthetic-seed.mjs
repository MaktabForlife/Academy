// First setup of the two new empty Feature stores only. Never reads a live source.
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {createAcademyPinHash} from '../src/lib/academy-pin.js';
import {initialiseAcceptedSetup} from '../src/academy/d1/setup-publication.js';
import {emptyCompatibilityDatabase} from '../src/academy/separation/compatibility.js';
import {emptyShapes} from '../src/academy/separation/empty-shapes.js';
import {sqliteD1} from './academy-split/sqlite-d1.mjs';
export const featureSyntheticAccounts=Object.freeze([
 {id:'feature-synthetic-global',login:'feature-test-admin',name:'Feature synthetic Global Admin',global:true},
 {id:'feature-synthetic-admin-a',login:'feature-test-scoped-admin',name:'Feature synthetic scoped Admin',role:'PROGRAM_ADMIN',scope:'COURSE:FEATURE-SYNTHETIC-A'},
 {id:'feature-synthetic-learner-a',login:'feature-test-learner',name:'Feature synthetic learner',role:'STUDENT',scope:'COURSE:FEATURE-SYNTHETIC-A'},
 {id:'feature-synthetic-outsider',login:'feature-test-outsider',name:'Feature synthetic outsider',role:'STUDENT',scope:'COURSE:FEATURE-SYNTHETIC-B'}
]);
const expected={core:'d7eb88199269195a20b44dad26b1663792e493631fa26690bc915af416772464',admin:'0cebae64a69e62a235b3828eb39d1001e3d23b992ffeb391920239096018a830'};
const sha=s=>createHash('sha256').update(s).digest('hex');
const quote=s=>'"'+s.replaceAll('"','""')+'"';
const literal=v=>v===null?'NULL':typeof v==='number'&&Number.isFinite(v)?String(v):typeof v==='string'?"'"+v.replaceAll("'","''")+"'":(()=>{throw Error('Unsupported seed value');})();
const rendered=(sql,params)=>{let i=0;const result=sql.replace(/\?/g,()=>literal(params[i++]));assert.equal(i,params.length);return result.replace(/;\s*$/,'')+';';};
export async function prepareFeatureSeed({pin,secrets,at=new Date().toISOString()}){
 assert.match(pin,/^\d{4}$/,'The approved synthetic PIN must have four digits.');
 for(const key of ['PIN_SECRET','SESSION_SECRET','SHARED_PIN_SECRET','ACADEMY_OPEN_LIBRARY_STORAGE_KEY'])assert(typeof secrets[key]==='string'&&secrets[key].length>=32,'Feature secret configuration is incomplete: '+key);
 const databases={},sql={core:[],admin:[]},schemas={};
 try{
  for(const owner of ['core','admin']){
   schemas[owner]=readFileSync(new URL('../feature-preview-bootstrap/'+owner+'-schema.sql',import.meta.url),'utf8');
   assert.equal(sha(schemas[owner]),expected[owner],'Reviewed empty schema changed: '+owner);
   const db=databases[owner]=new DatabaseSync(':memory:');db.exec(schemas[owner]);
   const tables=db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
   for(const {name}of tables)assert.equal(db.prepare('SELECT count(*) n FROM '+quote(name)).get().n,0);
  }
  const insert=(owner,table,row)=>{const columns=Object.keys(row),statement='INSERT INTO '+quote(table)+'('+columns.map(quote).join(',')+') VALUES('+columns.map(()=>'?').join(',')+')',values=Object.values(row);databases[owner].prepare(statement).run(...values);sql[owner].push(rendered(statement,values));};
  insert('core','academy_write_state',{singleton:1,version:0});
  insert('core','split_read_state',{singleton:1,version:0});
  const pinHash=await createAcademyPinHash(pin,secrets);
  for(const a of featureSyntheticAccounts){
   insert('core','actor_refs',{account_id:a.id});insert('admin','identity_refs',{account_id:a.id});
   insert('core','accounts',{account_id:a.id,display_name:a.name,login_link_id:a.login,active:1,created_at:at});
   insert('core','account_credentials',{account_id:a.id,pin_hash:pinHash,pin_setup:1,credential_epoch:1,updated_at:at});
   if(a.global)insert('core','global_role_assignments',{assignment_id:'feature-synthetic-global-role',account_id:a.id,role:'GLOBAL_ADMIN',active:1,review_state:'CONFIRMED'});
  }
  for(const side of ['A','B']){
   const key='COURSE:FEATURE-SYNTHETIC-'+side,name='Feature synthetic Course '+side;
   insert('core','activities',{activity_key:key,activity_id:key.slice(7),kind:'COURSE',name,active:1,lifecycle:'ACTIVE',website_visible:0});
   insert('admin','activities',{activity_key:key,name});
   insert('core','course_settings',{activity_key:key,legacy_access_model:'PAID',policy_review_state:'CONFIRMED'});
  }
  for(const a of featureSyntheticAccounts.filter(a=>a.role))insert('core','role_assignments',{assignment_id:a.id+'-role',account_id:a.id,activity_key:a.scope,role:a.role,active:1,review_state:'CONFIRMED'});
  for(const [key,value]of [['PlatformTimezone','Africa/Johannesburg'],['ProgramWorkspace','1'],['PersonalMemorisationCards','0']]){
   const row={setting_key:key,setting_value:value,updated_at:at,updated_by_account_id:featureSyntheticAccounts[0].id};
   insert('core','academy_settings',row);insert('admin','academy_settings',row);
  }
  const binding=sqliteD1(databases.core),recorded={...binding,async batch(statements){
   const result=await binding.batch(statements);
   for(const s of statements)if(!/^\s*(SELECT|WITH|PRAGMA)\b/i.test(s.sql))sql.core.push(rendered(s.sql,s.params));
   return result;
  }};
  const native=emptyCompatibilityDatabase(recorded,emptyShapes,{currentGrants:true});
  const accepted=await initialiseAcceptedSetup(native,'FEATURE_SYNTHETIC_BOOTSTRAP');
  const sourceDigest=sha(JSON.stringify({schema:1,kind:'FEATURE_SYNTHETIC_ONLY',schemaHashes:expected,accounts:featureSyntheticAccounts,at,head:accepted.head}));
  insert('core','split_deployment_state',{singleton:1,generation:'SPLIT_V1',state:'READY',source_digest:sourceDigest,selection_digest:sourceDigest,prepared_at:at});
  const report={schema:1,kind:'FEATURE_SYNTHETIC_ONLY',schemaHashes:expected,at,sourceDigest,head:accepted.head,accounts:featureSyntheticAccounts.map(({id,login,global,role,scope})=>({id,login,global:!!global,role,scope})),targets:{}};
  for(const [owner,db]of Object.entries(databases)){
   assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
   assert.equal(db.prepare('PRAGMA quick_check').get().quick_check,'ok');
   report.targets[owner]={statements:sql[owner].length,bytes:Buffer.byteLength(sql[owner].join('\n')+'\n'),foreignKeyErrors:0,quickCheck:'ok'};
  }
  return {databases,sql:Object.fromEntries(Object.entries(sql).map(([k,v])=>[k,v.join('\n')+'\n'])),report,close(){for(const db of Object.values(databases))db.close();}};
 }catch(e){for(const db of Object.values(databases))db.close();throw e;}
}
if(process.argv[1]&&resolve(process.argv[1])===new URL(import.meta.url).pathname){
 assert.equal(process.env.GITHUB_ACTIONS,'true');assert.equal(process.env.GITHUB_REPOSITORY,'MaktabForlife/Academy');assert.equal(process.env.GITHUB_REF,'refs/heads/feature-preview');
 const secrets=Object.fromEntries(['PIN_SECRET','SESSION_SECRET','SHARED_PIN_SECRET','ACADEMY_OPEN_LIBRARY_STORAGE_KEY'].map(k=>[k,process.env[k]]));
 const seed=await prepareFeatureSeed({pin:process.env.FEATURE_TEST_ADMIN_PIN,secrets});
 try{
  const output=process.argv[2];assert(output,'An explicit private runner output directory is required.');mkdirSync(output,{recursive:true});
  for(const owner of ['core','admin'])writeFileSync(resolve(output,owner+'-synthetic-seed.sql'),seed.sql[owner],{mode:0o600});
  writeFileSync(resolve(output,'synthetic-seed-receipt.json'),JSON.stringify(seed.report,null,2)+'\n',{mode:0o600});
  console.log(JSON.stringify({kind:seed.report.kind,accounts:seed.report.accounts.length,targets:seed.report.targets,credentialsLogged:false}));
 }finally{seed.close();}
}
