import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {coreRemainder} from '../tools/jwt-feature-core-remainder.mjs';
import {bootstrapInputs,schemaHashes} from '../tools/jwt-feature-transition.mjs';
import {setupContract} from '../tools/jwt-feature-setup-contract.mjs';
import {jwtFeatureObjectDefinitionsSQL} from '../src/academy/jwt-feature-schema.mjs';
import {ddlVerifierSQL} from '../tools/jwt-feature-ddl-verifier.mjs';
assert.equal(process.env.GITHUB_ACTIONS,'true','Disposable GitHub only');
const require=createRequire(resolve(process.env.FEATURE_MF_ROOT,'package.json')),{Miniflare,convertV4MiniflareOptions}=require('miniflare');
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
test('exact first CREATE followed by unchanged 1371-statement remainder preserves complete Core definitions and empty integrity',async()=>{
 const input=bootstrapInputs(read('../feature-preview-bootstrap/core-schema.sql'),read('../feature-preview-bootstrap/admin-schema.sql'),read('./fixtures/jwt-v110-fresh-pair-auth.sql'));
 const p=coreRemainder(input.core.toString()),c=setupContract({source:process.env.GITHUB_SHA,databaseIds:['cdbe97bc-f3d9-400e-8806-ed9a0d143d26','ed77f2a7-4439-4841-8691-2b41063d8960']}).contract;
 assert.equal(p.remainingStatements.length,1371);assert.equal(createHash('sha256').update(input.admin).digest('hex'),schemaHashes.admin);
 const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:"export default {fetch(){return new Response(null,{status:404});}}",compatibilityDate:'2026-10-23',d1Databases:{CORE:'local-remainder-core'}}));
 try{
  const db=await mf.getD1Database('CORE'),totals={roundTrips:0,statements:0,read:0,written:0},cost=r=>{totals.read+=r.meta?.rows_read||0;totals.written+=r.meta?.rows_written||0;};
  const diff=before=>Object.fromEntries(Object.keys(totals).map(k=>[k,totals[k]-before[k]]));
  async function batch(sql){totals.roundTrips++;totals.statements+=sql.length;const rows=await db.batch(sql.map(x=>db.prepare(x)));rows.forEach(cost);return rows;}
  async function all(sql){totals.roundTrips++;totals.statements++;const r=await db.prepare(sql).all();cost(r);return r.results;}
  let before=structuredClone(totals);await batch(p.firstStatements);const fixtureFirstDDL=diff(before);
  before=structuredClone(totals);const initial=await all("SELECT (SELECT count(*) FROM sqlite_schema WHERE sql IS NOT NULL AND name NOT GLOB 'sqlite_*' AND name NOT IN ('_cf_METADATA','_cf_KV')) AS user_objects,type,name,tbl_name,sql FROM sqlite_schema WHERE sql IS NOT NULL AND name NOT GLOB 'sqlite_*' AND name NOT IN ('_cf_METADATA','_cf_KV') ORDER BY type,name LIMIT 5;");
  assert.equal(initial.length,1);assert.equal(initial[0].user_objects,1);assert.equal(initial[0].sql,p.firstDefinition.sql);const fixtureDefinitionRead=diff(before);
  before=structuredClone(totals);await batch(p.remainingStatements);const remainderDDL=diff(before);
  before=structuredClone(totals);const rows=await all(ddlVerifierSQL(c.tables.core));assert.deepEqual(rows,[{user_objects:1372,user_tables:172,user_rows:0,foreign_key_errors:0,quick_rows:1,quick_check:'ok'}]);const postVerifier=diff(before);
  before=structuredClone(totals);const definitions=await all(jwtFeatureObjectDefinitionsSQL),actualHash=createHash('sha256').update(JSON.stringify(definitions.map(r=>[r.type,r.name,r.tbl_name,r.sql]))).digest('hex');assert.equal(actualHash,c.objectHashes.core);const additionalLocalFingerprintRead=diff(before);
  const dir=resolve(process.env.RUNNER_TEMP,'jwt-remainder-evidence');mkdirSync(dir,{recursive:true});
  writeFileSync(resolve(dir,'remainder-proof.json'),JSON.stringify({schema:1,source:process.env.GITHUB_SHA,scope:'Disposable local structured D1 batch; actual dashboard transaction delivery remains unproved',hostedCalls:0,physicalCoreLabelOnly:'cdbe97bc-f3d9-400e-8806-ed9a0d143d26',hashes:p.hashes,bytes:{full:input.core.length,first:Buffer.byteLength(p.first),firstDefinition:Buffer.byteLength(p.firstDefinition.sql),remainder:Buffer.byteLength(p.remainder)},statements:{first:1,remainder:1371,complete:1372},firstDefinition:p.firstDefinition,unchangedOrder:true,unchangedRemainingBytes:true,post:rows[0],fullFingerprint:actualHash,adminHashUnchanged:schemaHashes.admin,costs:{fixtureFirstDDL,fixtureDefinitionRead,remainderDDL,postVerifier,additionalLocalFingerprintRead,completeMeasuredTest:totals},noHostedRetrySelected:true},null,2)+'\n');
 }finally{await mf.dispose();}
});
