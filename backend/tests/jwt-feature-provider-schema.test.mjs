import assert from 'node:assert/strict';
import test from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {jwtFeatureEmptyObjectPrecountSQL,jwtFeatureObjectDefinitionsSQL,jwtFeatureUserTablesSQL} from '../src/academy/jwt-feature-schema.mjs';
import {bootstrapInputs} from '../tools/jwt-feature-transition.mjs';
import {setupContract} from '../tools/jwt-feature-setup-contract.mjs';
assert.equal(process.env.GITHUB_ACTIONS,'true','Disposable GitHub only');
const providerDDL='CREATE TABLE _cf_KV (key TEXT PRIMARY KEY,value BLOB) WITHOUT ROWID';
test('documented provider-only metadata is excluded without reading its contents',()=>{
 const db=new DatabaseSync(':memory:');try{db.exec(providerDDL);assert.equal(db.prepare(jwtFeatureEmptyObjectPrecountSQL).get().n,0);assert.equal(db.prepare(jwtFeatureObjectDefinitionsSQL).all().length,0);assert.equal(db.prepare(jwtFeatureUserTablesSQL).all().length,0);}finally{db.close();}
});
test('unknown provider-like name remains visible and stops an empty-schema precheck',()=>{
 const db=new DatabaseSync(':memory:');try{db.exec(providerDDL+';CREATE TABLE _cf_unreviewed(value TEXT)');assert.equal(db.prepare(jwtFeatureEmptyObjectPrecountSQL).get().n,1);assert.equal(db.prepare(jwtFeatureObjectDefinitionsSQL).all()[0].name,'_cf_unreviewed');assert.equal(db.prepare(jwtFeatureUserTablesSQL).all()[0].name,'_cf_unreviewed');}finally{db.close();}
});
test('reserved metadata does not change either complete native fingerprint or application table inventory',()=>{
 const read=p=>readFileSync(new URL(p,import.meta.url),'utf8'),input=bootstrapInputs(read('../feature-preview-bootstrap/core-schema.sql'),read('../feature-preview-bootstrap/admin-schema.sql'),read('./fixtures/jwt-v110-fresh-pair-auth.sql'));
 const c=setupContract({source:process.env.GITHUB_SHA,databaseIds:['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222']}).contract;
 for(const owner of ['core','admin']){const db=new DatabaseSync(':memory:');try{db.exec(input[owner].toString());db.exec(providerDDL);const objects=db.prepare(jwtFeatureObjectDefinitionsSQL).all().map(r=>[r.type,r.name,r.tbl_name,r.sql]);assert.equal(createHash('sha256').update(JSON.stringify(objects)).digest('hex'),c.objectHashes[owner]);assert.deepEqual(db.prepare(jwtFeatureUserTablesSQL).all().map(r=>r.name),c.tables[owner]);db.exec('CREATE TABLE _cf_unreviewed(value TEXT)');const changed=db.prepare(jwtFeatureObjectDefinitionsSQL).all().map(r=>[r.type,r.name,r.tbl_name,r.sql]);assert.notEqual(createHash('sha256').update(JSON.stringify(changed)).digest('hex'),c.objectHashes[owner]);}finally{db.close();}}
});
