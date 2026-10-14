import {readFileSync,readdirSync} from 'node:fs';
import {openLibraryFixture} from './academy-d1-open-library-fixture.mjs';
import {CORE_ACTIVATION_CHECKS} from '../../src/academy/d1/activation-policy.js';
import {buildCoreActivationPlan,applyCoreActivationLocally} from '../../tools/academy-migration/activation.mjs';
const path=new URL('../../src/academy/d1/library-storage.js',import.meta.url);
let source=readFileSync(path,'utf8').replace("import {DurableObject} from 'cloudflare:workers';",'class DurableObject {constructor(ctx,env){this.ctx=ctx;this.env=env;}}');
source=source.replace(/from '([.][^']+)'/g,(_,relative)=>`from '${new URL(relative,path).href}'`);
const {ProgramTimetableCoordinator}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
export async function cleanupFixture(){
  const f=await openLibraryFixture();
  const run=f.db.prepare('SELECT * FROM migration_runs').get();
  applyCoreActivationLocally(f.db,buildCoreActivationPlan(f.db,{reviewId:crypto.randomUUID(),sourceSha256:run.source_snapshot_sha256,codeCommit:'0'.repeat(40),libraryMode:'PUBLIC_ONLY',evidence:Object.fromEntries(CORE_ACTIVATION_CHECKS.map(k=>[k,{status:'PASS',reference:'SYNTHETIC CLEANUP TEST ONLY: '+k}]))}));
  for(const file of readdirSync(new URL('../../migrations/academy/',import.meta.url)).filter(s=>/^\d+.*\.sql$/.test(s)&&Number(s.slice(0,4))>7).sort())f.db.exec(readFileSync(new URL('../../migrations/academy/'+file,import.meta.url),'utf8'));
  Object.assign(f.env,{ACADEMY_D1_MODE:'ACTIVE',ACADEMY_D1_RUN_ID:run.run_id,ACADEMY_LIBRARY_MODE:'PUBLIC_ONLY',ACADEMY_OPEN_LIBRARY_STORAGE_KEY:'synthetic-existing-platform:open-library-metadata'});
  for(const name of ['PLATFORM_SPREADSHEET_ID','GOOGLE_SPREADSHEET_ID','GOOGLE_SERVICE_ACCOUNT_JSON','APPS_SCRIPT_URL','M4L_LIBRARY_BRIDGE_SECRET','M4L_GOOGLE_SERVICE_ACCOUNT_EMAIL','ACADEMY_D1_UPLOAD_BRIDGE'])delete f.env[name];
  const sql={exec:(query,...args)=>{const rows=f.metadata.prepare(query).all(...args);return {toArray:()=>rows,rowsWritten:f.metadata.prepare('SELECT changes() n').get().n};}};
  const coordinator=new ProgramTimetableCoordinator({storage:{sql}},f.env);
  f.env.PROGRAM_TIMETABLE_COORDINATOR={getByName:name=>{f.namespaceNames.push(name);return coordinator;}};
  return {...f,coordinator};
}
