// Merge a reviewed snapshot of existing rules locally; never replace them with
// the single-rule fragment and never contact Cloudflare from this helper.
import {readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
export function mergeVideoLifecycle(existing,rule){
 if(!Array.isArray(existing?.rules)||!rule?.id||!rule.conditions?.prefix?.endsWith('/session-recordings/')||rule.deleteObjectsTransition?.condition?.type!=='Age'||rule.deleteObjectsTransition.condition.maxAge!==14*86400)throw Error('Choose the recording prefix and fourteen-day expiry rule.');
 if(existing.rules.some(r=>r.id===rule.id&&r.conditions?.prefix!==rule.conditions.prefix))throw Error('This rule name is already used for another prefix.');
 return {...existing,rules:[...existing.rules.filter(r=>r.id!==rule.id),rule]};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const [source,destination]=process.argv.slice(2);if(!source||!destination)throw Error('Usage: node tools/academy-session-video-lifecycle.mjs existing-rules.json merged-rules.json');
 const existing=JSON.parse(await readFile(source,'utf8')),fragment=JSON.parse(await readFile(new URL('../config/session-recordings-lifecycle.json',import.meta.url),'utf8'));
 await writeFile(destination,JSON.stringify(mergeVideoLifecycle(existing,fragment.rules[0]),null,2)+'\n');console.log('Prepared merged lifecycle rules: '+destination);
}
