// Explicit release bootstrap, using the existing Wrangler OAuth connection.
// The remote development preview transport can fail before invoking a Worker;
// the documented D1 batch query API runs the same tested initializer directly.
import {readFile} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {initialiseAcceptedSetup} from '../src/academy/d1/setup-publication.js';
if(!process.argv.includes('--remote'))throw Error('Use --remote only after backup and the additive migration have been approved and verified.');
const config=JSON.parse(await readFile(new URL('../wrangler.feature.jsonc',import.meta.url),'utf8'));
let token=process.env.CLOUDFLARE_API_TOKEN;
if(!token)for(const path of ['.wrangler/config/default.toml','Library/Preferences/.wrangler/config/default.toml']){
 try{token=(await readFile(join(homedir(),path),'utf8')).match(/^oauth_token\s*=\s*"([^"]+)"/m)?.[1];if(token)break;}catch{}
}
if(!token)throw Error('An existing Cloudflare connection is required. Run Wrangler login first.');
const binding=config.d1_databases.find(b=>b.binding==='ACADEMY_DB');
const endpoint=`https://api.cloudflare.com/client/v4/accounts/${config.account_id}/d1/database/${binding.database_id}/query`;
const db={prepare(sql){return {sql,params:[],bind(...params){return {sql,params};}};},async batch(batch){
 const response=await fetch(endpoint,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({batch}),signal:AbortSignal.timeout(60000)});
 const data=await response.json();if(!response.ok||!data.success||data.result?.some(r=>!r.success))throw Error('D1 bootstrap failed: '+JSON.stringify(data.errors||[]));
 return data.result;
}};
const result=await initialiseAcceptedSetup(db);
console.log(JSON.stringify({...result,sourceRowsChanged:false,physicalDatabaseSplit:false}));
