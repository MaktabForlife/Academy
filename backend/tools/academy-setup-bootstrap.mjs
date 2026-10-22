// Release tool: initialise the accepted reference head in the existing D1.
// No application endpoint, source-row overwrite or physical database split.
import {randomBytes} from 'node:crypto';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {resolve,join} from 'node:path';
if(!process.argv.includes('--remote'))throw Error('Use --remote only after backup and the additive migration have been verified.');
const root=fileURLToPath(new URL('../../',import.meta.url)),config=JSON.parse(await readFile(join(root,'backend/wrangler.feature.jsonc'),'utf8'));
const directory=await mkdtemp('/private/tmp/academy-setup-bootstrap-'),token=randomBytes(32).toString('hex'),expires=Date.now()+300000;
process.env.WRANGLER_LOG_PATH=join(directory,'remote-dev.log');process.env.WRANGLER_SEND_METRICS='false';
const require=createRequire(import.meta.url),{unstable_dev}=require('wrangler');let dev;
try{
 const entry=join(directory,'bootstrap.mjs');
 await writeFile(entry,`import {initialiseAcceptedSetup} from ${JSON.stringify(resolve(root,'backend/src/academy/d1/setup-publication.js'))};
 export default {async fetch(request,env){
  if(request.method!=='POST'||Date.now()>${expires}||request.headers.get('Authorization')!==${JSON.stringify('Bearer '+token)})return new Response(null,{status:404});
  return Response.json(await initialiseAcceptedSetup(env.ACADEMY_DB.withSession('first-primary')),{headers:{'Cache-Control':'no-store'}});
 }};`,{mode:0o600});
 const configPath=join(directory,'wrangler.json');
 await writeFile(configPath,JSON.stringify({name:config.name,account_id:config.account_id,main:entry,compatibility_date:config.compatibility_date,d1_databases:config.d1_databases}),{mode:0o600});
 dev=await unstable_dev(entry,{config:configPath,local:false,port:0,logLevel:'error',experimental:{disableExperimentalWarning:true,disableDevRegistry:true,showInteractiveDevSession:false}});
 const response=await dev.fetch('/',{method:'POST',headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(45000)});
 if(!response.ok)throw Error('Accepted setup bootstrap failed: '+response.status+' '+await response.text());
 const result=await response.json();await dev.stop();dev=undefined;
 console.log(JSON.stringify({...result,temporaryRemoteSessionStopped:true,sourceRowsChanged:false,physicalDatabaseSplit:false}));
}finally{await dev?.stop();await rm(directory,{recursive:true,force:true});}
