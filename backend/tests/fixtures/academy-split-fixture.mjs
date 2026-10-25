import {readFileSync} from 'node:fs';
import {separationFixture} from './academy-separation-fixture.mjs';
import {initialiseAcceptedSetup} from '../../src/academy/d1/setup-publication.js';
import {selectActiveSnapshot} from '../../tools/academy-split/selection.mjs';
import {addAcceptedSource,prepareTargets} from '../../tools/academy-split/prepare.mjs';
import {databaseSnapshot} from '../../tools/academy-split/artifact.mjs';
import {sqliteD1} from '../../tools/academy-split/sqlite-d1.mjs';
import {emptyCompatibilityDatabase} from '../../src/academy/separation/compatibility.js';
import {emptyShapes} from '../../src/academy/separation/empty-shapes.js';
import {splitEngine} from '../../src/academy/separation/engine.js';
export async function splitFixture(seed){
 const source=await separationFixture();let prepared;
 try{
  for(const name of ['0032_accepted_setup.sql','0033_native_attendance.sql','0034_assessment_operations.sql','0035_media_contributions.sql','0036_class_notes.sql']){source.db.exec('BEGIN');source.db.exec(readFileSync(new URL('../../migrations/academy/'+name,import.meta.url),'utf8'));source.db.exec('COMMIT');}
  if(seed)await seed(source);
  await initialiseAcceptedSetup(source.env.ACADEMY_DB);const snapshot=databaseSnapshot(source.db,'synthetic',new Date().toISOString()),selection=addAcceptedSource(selectActiveSnapshot(snapshot),snapshot);prepared=await prepareTargets(selection);
  const core=emptyCompatibilityDatabase(sqliteD1(prepared.databases.core),emptyShapes,{currentGrants:true}),admin=sqliteD1(prepared.databases.admin);
  let queryCount=0;const costs=[];
  const counted=db=>({prepare(sql){const st=db.prepare(sql);let params=[];const value={sql:st.sql,get params(){return params;},bind(...v){params=v;st.bind(...v);return value;},async all(){queryCount++;return st.all();},async first(...args){queryCount++;return st.first(...args);},async run(){queryCount++;return st.run();}};return value;},batch(statements){queryCount+=statements.length;return db.batch(statements);}});
  const engine=splitEngine({core:counted(core),admin:counted(admin)}),invoke=async(method,args)=>{queryCount=0;try{return {result:await engine[method](...args)};}catch(e){console.error('Synthetic split '+method+':',e);throw e;}finally{costs.push({method,queries:queryCount});}},namespace={getByName(){return {write:(...args)=>invoke('write',args),read:(...args)=>invoke('read',args)};}};
  const result={source,selection,prepared,core,admin,namespace,costs,databases:prepared.databases,head:prepared.report.head,scopes:source.scopes,actors:source.actors,close(){prepared.close();source.close();}};return result;
 }catch(error){prepared?.close();source.close();throw error;}
}
export const runStatements=(db,statements)=>db.batch(statements.map(s=>db.prepare(s.sql).bind(...s.params)));
