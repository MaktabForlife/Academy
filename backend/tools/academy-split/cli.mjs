import {readFile} from 'node:fs/promises';
import {writePreparation} from './artifact.mjs';
const [mode,source,output]=process.argv.slice(2);
if(mode!=='prepare'||!source||!output)throw Error('Usage: node tools/academy-split/cli.mjs prepare PRIVATE_RECOVERY_JSON NEW_PRIVATE_OUTPUT_DIRECTORY');
const result=await writePreparation(JSON.parse(await readFile(source,'utf8')),output);
console.log(JSON.stringify({format:result.format,at:result.at,sourceDigest:result.sourceDigest,accounts:result.selection.selectedAccounts,areas:result.selection.selectedAreas,authority:result.authority,targets:Object.fromEntries(Object.entries(result.targets).map(([owner,t])=>[owner,{name:t.name,id:t.id,tables:Object.keys(t.tables).length,rows:t.rows,state:t.state,foreignKeyErrors:t.foreignKeyErrors,integrity:t.integrity}])),activation:result.activation,oldDatabaseChanged:result.oldDatabaseChanged,remainingGates:result.remainingGates}));
