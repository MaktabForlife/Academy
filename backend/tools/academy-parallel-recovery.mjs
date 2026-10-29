// Operator-only bounded recovery. This file is never bundled into a Worker.
// Uses the reviewed source projector; writes are restricted to its own outbox,
// stream, guard, checkpoint and dirty-state tables. No user credential is used.
import {readFile,writeFile,mkdir,chmod} from 'node:fs/promises';
import {resolve,join} from 'node:path';import {homedir} from 'node:os';import {pathToFileURL} from 'node:url';
const SOURCE_ACCOUNT='c9a3e355b3d7a795880b1d36a1dbe123',CORE='1c8aece3-dc1d-40d1-8a82-01ab4f63336f',TARGET='https://academy-studio-parallel.naidu-hajira.workers.dev';
export function assertRecoverySQL(sql){
 if(/^\s*SELECT\b/i.test(sql))return;
 const match=sql.match(/^\s*(?:INSERT(?: OR (?:IGNORE|REPLACE))? INTO|UPDATE|DELETE FROM)\s+(website_platform_[a-z_]+)\b/i);
 if(!match)throw Error('RECOVERY_SQL_OUTSIDE_OPERATIONAL_TABLES');
}
export function apiQuery(sql,args=[]){
 assertRecoverySQL(sql);let i=0;const params=[],query=sql.replace(/\?/g,()=>{const value=args[i++];if(value===null)return 'NULL';if(!['string','number'].includes(typeof value)||typeof value==='number'&&!Number.isFinite(value))throw Error('INVALID_RECOVERY_PARAMETER');params.push(String(value));return '?';});
 if(i!==args.length)throw Error('RECOVERY_PARAMETER_MISMATCH');return {sql:query,params};
}
export function recoveryDatabase(execute){
 class Statement{constructor(sql,args=[]){this.sql=sql;this.args=args;}bind(...args){return new Statement(this.sql,args);}async all(){return (await execute([apiQuery(this.sql,this.args)]))[0];}run(){return this.all();}async first(column){const rows=(await this.all()).results||[];return column?(rows[0]?.[column]??null):(rows[0]??null);}}
 const db={prepare:sql=>new Statement(sql),batch:statements=>execute(statements.map(s=>apiQuery(s.sql,s.args))),withSession:()=>db};return db;
}
async function operatorToken(){
 for(const file of [join(homedir(),'.wrangler/config/default.toml'),join(homedir(),'Library/Preferences/.wrangler/config/default.toml')]){try{const text=await readFile(file,'utf8'),token=text.match(/^oauth_token\s*=\s*"([^"\n]+)"/m)?.[1];if(token)return token;}catch(error){if(error.code!=='ENOENT')throw error;}}
 throw Error('ACADEMY_OPERATOR_AUTH_UNAVAILABLE');
}
export async function runRecovery(output,{maxSteps=120,maxRowsRead=250000,maxRowsWritten=50000}={}){
 output=resolve(output);const resources=JSON.parse(await readFile(join(output,'resources.json'),'utf8'));
 if(resources.accountId!=='2b01ca929611669e032703ff19f7098f'||resources.database.id!=='c261eb73-7145-4f73-940c-5816db287612'||resources.websiteOrigin!==TARGET)throw Error('WRONG_PARALLEL_TARGET');
 const secrets=JSON.parse(await readFile(join(output,'connection-secrets.json'),'utf8')),token=await operatorToken(),metrics={apiRequests:0,queries:0,rowsRead:0,rowsWritten:0,deliveries:0,deliveryErrors:0};
 const db=recoveryDatabase(async batch=>{
  if(metrics.rowsRead>maxRowsRead||metrics.rowsWritten>maxRowsWritten)throw Error('RECOVERY_USAGE_BUDGET_REACHED');
  const response=await fetch(`https://api.cloudflare.com/client/v4/accounts/${SOURCE_ACCOUNT}/d1/database/${CORE}/query`,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({batch}),signal:AbortSignal.timeout(30000),redirect:'error'});metrics.apiRequests++;
  const reply=await response.json();if(!response.ok||!reply.success||!Array.isArray(reply.result)||reply.result.some(r=>!r.success))throw Error('ACADEMY_RECOVERY_QUERY_FAILED_'+response.status);
  for(const r of reply.result){metrics.queries++;metrics.rowsRead+=r.meta?.rows_read||0;metrics.rowsWritten+=r.meta?.rows_written||0;}return reply.result;
 });
 const {recoverWebsite}=await import('../src/academy/d1/web-platform/bridge.mjs');
 const env={ACADEMY_DB:db,ACADEMY_WEB_PLATFORM:'1',WEBSITE_PLATFORM_ORIGIN:TARGET,...secrets};
 const fetcher=async(url,options)=>{if(String(url)!==TARGET+'/internal/academy/events')throw Error('WRONG_DELIVERY_DESTINATION');const r=await fetch(url,options);metrics.deliveries++;if(!r.ok)metrics.deliveryErrors++;return r;};
 const status=()=>db.prepare(`SELECT (SELECT count(*) FROM website_platform_access_scopes WHERE enabled=1 AND activity_key NOT IN(SELECT activity_key FROM website_platform_access_imports))+(SELECT count(*) FROM website_platform_access_imports WHERE done=0) AS importPhases,(SELECT count(*) FROM website_platform_access_dirty WHERE next_attempt<9007199254740991) AS dirty,(SELECT count(*) FROM website_platform_outbox WHERE acknowledged=0) AS pending`).first();
 let current,steps=0;await mkdir(output,{recursive:true});
 try{
  const control=await db.prepare('SELECT enabled FROM website_platform_control WHERE singleton=1').first('enabled');if(control!==1)throw Error('ACADEMY_CONNECTOR_NOT_ACTIVATED');
  for(;steps<Math.min(200,maxSteps);steps++){
   await recoverWebsite(env,{fetcher,limit:20});
   if((steps+1)%5===0){current=await status();console.log(JSON.stringify({steps:steps+1,...current,...metrics}));if(!current.importPhases&&!current.dirty&&!current.pending)break;if(metrics.deliveryErrors)throw Error('RECOVERY_DELIVERY_FAILED_KEEP_BROWSER_ACCESS_CLOSED');}
  }
  current=await status();const report={completed:!current.importPhases&&!current.dirty&&!current.pending,steps:steps+1,...current,...metrics};await writeFile(join(output,'recovery-report.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600});return report;
 }catch(error){await writeFile(join(output,'recovery-report.json'),JSON.stringify({completed:false,steps,current,...metrics,error:error.message},null,2)+'\n',{mode:0o600});throw error;}
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){const out=process.argv[2];if(!out)throw Error('Choose the private release output directory.');console.log(JSON.stringify(await runRecovery(out)));}
