// Runner-only public data derivation; no hosted API, SQL execution or retry.
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {jwtFeatureObjectDefinitionsSQL} from '../src/academy/jwt-feature-schema.mjs';
const sha=x=>createHash('sha256').update(x).digest('hex');
export function coreRemainder(full){
 assert.equal(sha(full),'1b2d6c85ee3fd797a7fab9bb297d7b700b30542a4fba1428996da21236afa9ce');
 const boundary=full.indexOf(';')+1;assert.equal(boundary,450);
 const first=full.slice(0,boundary),remainder=full.slice(boundary);
 assert.equal(Buffer.byteLength(first),450);assert.equal(sha(first),'b932f5ae002483ac02c330b47c5c08d94782e69cf225fa813edb5cbd934eb5a0');
 assert.equal(Buffer.byteLength(remainder),379271);assert.equal(sha(remainder),'2e68592a63bee5e652dd1299d67cc1691535911c5976b3352504d61ff0e4123f');
 assert.equal(first+remainder,full);
 const a=new DatabaseSync(':memory:'),b=new DatabaseSync(':memory:');try{
  a.exec(full);b.exec(first);
  const expected=a.prepare(jwtFeatureObjectDefinitionsSQL.replace(' ORDER BY type,name',' ORDER BY rowid')).all();
  const existing=b.prepare(jwtFeatureObjectDefinitionsSQL).all();assert.equal(expected.length,1372);assert.equal(existing.length,1);
  const row=existing[0];assert.equal(row.type,'table');assert.equal(row.name,'academy_announcements');assert.equal(row.tbl_name,row.name);
  assert.equal(Buffer.byteLength(row.sql),449);assert.equal(sha(row.sql),'ba6adc0dad88252e65296438061de7e8d62e238bcfd1aa882817f5e4a536f739');
  assert.deepEqual(row,expected[0]);b.exec(remainder);assert.deepEqual(b.prepare(jwtFeatureObjectDefinitionsSQL.replace(' ORDER BY type,name',' ORDER BY rowid')).all(),expected);
  assert(expected.every(x=>/^CREATE(?: UNIQUE)? (TABLE|INDEX|VIEW|TRIGGER)\b/i.test(x.sql)));
  return {first,remainder,firstDefinition:row,orderedDefinitions:expected,firstStatements:[expected[0].sql],remainingStatements:expected.slice(1).map(x=>x.sql),hashes:{full:sha(full),first:sha(first),firstDefinition:sha(row.sql),remainder:sha(remainder)}};
 }finally{a.close();b.close();}
}
