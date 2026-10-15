// Keep every regression file assigned to one group; the all-tests command remains available.
import {readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const directory=path.dirname(fileURLToPath(import.meta.url)),group=process.argv[2];
const groupFor=name=>/migration|preflight|d1-main-preparation|d1-transition-recovery/.test(name)?'offline':'academy';
if(!['academy','offline'].includes(group))throw Error('TEST_GROUP_REQUIRED');
let count=0;const failed=[];
for(const file of readdirSync(directory).filter(s=>s.endsWith('.test.mjs')&&groupFor(s)===group).sort()){
  const result=spawnSync(process.execPath,[path.join(directory,file)],{cwd:path.dirname(directory),stdio:'inherit',env:process.env});count++;
  if(result.status!==0)failed.push(file);
}
console.log(JSON.stringify({group,files:count,failed}));if(failed.length)process.exitCode=1;
