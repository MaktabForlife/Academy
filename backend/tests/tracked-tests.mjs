import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
// Preserved retired files may still exist locally. Only Git-tracked tests are active.
export function trackedTestFiles(){
 const root=fileURLToPath(new URL('../../',import.meta.url));
 return execFileSync('git',['ls-files','-z','--','backend/tests'],{cwd:root,encoding:'utf8'}).split('\0').filter(p=>/^backend\/tests\/[^/]+\.test\.mjs$/.test(p)).map(p=>p.slice('backend/tests/'.length)).sort((a,b)=>a.localeCompare(b));
}
