import {jwtFeatureEmptyObjectPrecountSQL,jwtFeatureObjectDefinitionsSQL} from '../src/academy/jwt-feature-schema.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {ddlVerifierSQL} from '../tools/jwt-feature-ddl-verifier.mjs';
import {setupContract} from '../tools/jwt-feature-setup-contract.mjs';
import {bootstrapInputs,schemaHashes} from '../tools/jwt-feature-transition.mjs';
assert.equal(process.env.GITHUB_ACTIONS,'true','Disposable GitHub only');
const require=createRequire(resolve(process.env.FEATURE_MF_ROOT,'package.json'));
const {Miniflare,convertV4MiniflareOptions}=require('miniflare');
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8'),digest=x=>createHash('sha256').update(x).digest('hex');
test('complete empty native DDL and fixed validation are measured independently of private seed/app smoke',async()=>{
 const physicalIds=['cdbe97bc-f3d9-400e-8806-ed9a0d143d26','ed77f2a7-4439-4841-8691-2b41063d8960'];
 const {contract:c,sql}=setupContract({source:process.env.GITHUB_SHA,databaseIds:physicalIds});
 const input=bootstrapInputs(read('../feature-preview-bootstrap/core-schema.sql'),read('../feature-preview-bootstrap/admin-schema.sql'),read('./fixtures/jwt-v110-fresh-pair-auth.sql'));
 assert.equal(digest(input.core),schemaHashes.core);assert.equal(digest(input.admin),schemaHashes.admin);
 const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:"export default {fetch(){return new Response(null,{status:404});}}",compatibilityDate:'2026-10-23',d1Databases:{CORE:'disposable-ddl-core',ADMIN:'disposable-ddl-admin'}}));
 const report={schema:1,source:process.env.GITHUB_SHA,scope:'Disposable workerd structured prepared-batch DDL plus validation; UI parser delivery remains separate',physicalIdsForNextPlanOnly:physicalIds,hostedExecution:false,hostedCalls:0,credentials:false,seed:false,ddlHashes:{core:schemaHashes.core,admin:schemaHashes.admin},owners:{}};
 try{
  for(const owner of ['core','admin']){
   const db=await mf.getD1Database(owner==='core'?'CORE':'ADMIN'),m={roundTrips:0,statements:0,read:0,written:0};
   const add=r=>{m.read+=r.meta?.rows_read||0;m.written+=r.meta?.rows_written||0;};
   async function all(query){m.roundTrips++;m.statements++;const r=await db.prepare(query).all();add(r);return r.results;}
   async function batch(queries){m.roundTrips++;m.statements+=queries.length;const r=await db.batch(queries.map(s=>db.prepare(s)));r.forEach(add);return r;}
   assert.equal((await all(jwtFeatureEmptyObjectPrecountSQL))[0].n,0);
   const before=structuredClone(m);await batch(sql[owner]);const ddlCost=Object.fromEntries(Object.keys(m).map(k=>[k,m[k]-before[k]]));
   const verifierSQL=ddlVerifierSQL(c.tables[owner]),verified=await all(verifierSQL);
   assert.equal(verified.length,1);assert.deepEqual(verified[0],{user_objects:owner==='core'?1372:83,user_tables:c.tables[owner].length,user_rows:0,foreign_key_errors:0,quick_rows:1,quick_check:'ok'});
   const uiProjection=structuredClone(m);
   const objects=await all(jwtFeatureObjectDefinitionsSQL);
   const objectHash=digest(JSON.stringify(objects.map(r=>[r.type,r.name,r.tbl_name,r.sql])));assert.equal(objectHash,c.objectHashes[owner]);
   report.owners[owner]={objects:objects.length,verifierSQL,uiDeliveryProjection:uiProjection,additionalLocalObjectHashSelects:1,tables:c.tables[owner].length,initialUserObjects:0,allUserRows:0,objectHash,foreignKeyErrors:0,quickCheck:'ok',ddlCost,completeCost:m};
  }
  const dir=resolve(process.env.RUNNER_TEMP,'jwt-ddl-budget-evidence');mkdirSync(dir,{recursive:true});writeFileSync(resolve(dir,'ddl-budget.json'),JSON.stringify(report,null,2)+'\n');
 }finally{await mf.dispose();}
});
