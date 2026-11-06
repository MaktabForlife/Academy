// Produces only a public compile-time contract; never provisions or calls Cloudflare.
import {coreRemainder} from './jwt-feature-core-remainder.mjs';
import {jwtFeatureObjectDefinitionsSQL,jwtFeatureUserTablesSQL} from '../src/academy/jwt-feature-schema.mjs';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {bootstrapInputs,protectedIds,account,batch} from './jwt-feature-transition.mjs';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const sha=x=>createHash('sha256').update(x).digest('hex');
export function setupContract({source,databaseIds,structuredDDL=false}){
 const template=JSON.parse(read('../tests/fixtures/jwt-feature-public-template.json'));
 const inputs=bootstrapInputs(read('../feature-preview-bootstrap/core-schema.sql'),read('../feature-preview-bootstrap/admin-schema.sql'),read('../tests/fixtures/jwt-v110-fresh-pair-auth.sql'));
 const c={schema:1,accountId:account,planId:'JWT_FEATURE_FRESH_'+batch,batch,source,databaseIds,forbiddenIds:[...protectedIds],sourceDigest:template.sourceDigest,objectNamespace:'jwt-feature-v110/'+batch+'/',tables:{},objectHashes:{},templateHashes:{},statements:{}};
 const sql={};
 for(const owner of ['core','admin']){
  const db=new DatabaseSync(':memory:');try{
   db.exec(inputs[owner].toString());
   sql[owner]=db.prepare("SELECT sql FROM sqlite_schema WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY rowid").all().map(x=>x.sql);
   c.tables[owner]=db.prepare(jwtFeatureUserTablesSQL).all().map(x=>x.name);
   const objects=db.prepare(jwtFeatureObjectDefinitionsSQL).all().map(r=>[r.type,r.name,r.tbl_name,r.sql]);
   c.objectHashes[owner]=sha(JSON.stringify(objects));c.templateHashes[owner]=sha(template[owner]);
   c.statements[owner]=template[owner].trimEnd().split('\n');
  }finally{db.close();}
 }
 if(structuredDDL){
  const p=coreRemainder(inputs.core.toString());
  c.ddl={schema:1,inputHashes:{core:sha(inputs.core),admin:sha(inputs.admin)},rawRemainderHash:p.hashes.remainder,firstDefinitionHash:p.hashes.firstDefinition,initialObjectHashes:{core:sha(JSON.stringify([[p.firstDefinition.type,p.firstDefinition.name,p.firstDefinition.tbl_name,p.firstDefinition.sql]])),admin:sha('[]')},statements:{core:p.remainingStatements,admin:sql.admin},statementHashes:{core:sha(p.remainingStatements.join('\n')+'\n'),admin:sha(sql.admin.join('\n')+'\n')}};
 }
 c.manifestHash=sha(JSON.stringify(c));
 return {contract:c,sql};
}
