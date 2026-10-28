// Prepare a semantics-preserving trigger upgrade from the reviewed schema.
// No hosted reads/writes. All other publication/session/reference guards remain.
import {readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
export function publicationAdmissionMigration(schema){
 const names=['lesson_media_accepted_pdf_limit_insert','lesson_media_accepted_pdf_limit_update'],out=['-- Reuse each published media JSON projection inside the existing PDF admission check.','-- No data, limits, permissions, attachment links or other triggers change.'];
 for(const name of names){
  const record=schema.find(r=>r.type==='trigger'&&r.name===name),sql=record?.sql||record?.data;
  if(!sql||!new RegExp('^CREATE TRIGGER '+name+'\\b','i').test(sql))throw Error('The reviewed publication PDF admission triggers are required.');
  let projections=0;
  const upgraded=sql.replace(/\b(parents|links|assets) AS(?: MATERIALIZED)?\s*\(/g,(_,name)=>{projections++;return name+' AS MATERIALIZED (';});
  if(projections!==3||!upgraded.includes("RAISE(ABORT,'lesson_media_pdf_limit')"))throw Error('Unexpected publication PDF guard; review before upgrading.');
  out.push('DROP TRIGGER IF EXISTS '+name+';',upgraded.replace(/;?\s*$/,';'));
 }
 return out.join('\n\n')+'\n';
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const [source,destination]=process.argv.slice(2);if(!source||!destination)throw Error('Usage: node tools/academy-publication-admission-migration.mjs local-schema.json migration.sql');
 const input=JSON.parse(await readFile(source,'utf8')),schema=Array.isArray(input)&&input[0]?.results?input.flatMap(r=>r.results):input.results||input;
 await writeFile(destination,publicationAdmissionMigration(schema));console.log('Prepared local publication guard migration: '+destination);
}
