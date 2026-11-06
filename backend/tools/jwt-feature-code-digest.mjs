// Public source graph provenance only. No secrets, database or network access.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve,relative} from 'node:path';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
const hash=x=>createHash('sha256').update(x).digest('hex');
export async function coordinatorSourceDigest(root){
 const out=await build({absWorkingDir:root,entryPoints:['backend/src/academy-split-coordinator.js'],bundle:true,format:'esm',platform:'browser',write:false,metafile:true,external:['cloudflare:workers','node:*']});
 const inputs=Object.keys(out.metafile.inputs).sort().map(path=>{
  const absolute=resolve(root,path),name=relative(root,absolute);assert(!name.startsWith('../')&&!name.startsWith('backend/tests/'),'COORDINATOR_GRAPH_SCOPE');
  return [name,hash(readFileSync(absolute))];
 });
 inputs.push(['backend/package-lock.json',hash(readFileSync(resolve(root,'backend/package-lock.json')))]);
 return hash(JSON.stringify(inputs));
}
