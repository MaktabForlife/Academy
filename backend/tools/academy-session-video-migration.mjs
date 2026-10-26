// Prepare a store-specific migration from its exported schema. No hosted writes.
import {readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';

export function videoMigration(schema){
 const table=schema.find(r=>r.type==='table'&&r.name==='lesson_media_assets');
 if(!table)throw Error('The lesson_media_assets schema is required.');
 const original=table.sql||table.data;
 if(/kind\s+IN\s*\([^)]*'MP4'/i.test(original))return '-- MP4 attachments are already supported.\n';
 let extended=original.replace(/kind\s+IN\s*\(\s*'YOUTUBE'\s*,\s*'PDF'\s*\)/i,"kind IN('YOUTUBE','PDF','MP4')").replace(/kind\s*=\s*'PDF'/i,"kind IN('PDF','MP4')");
 if(extended===original||!extended.includes("'MP4'"))throw Error('Unexpected attachment constraints; review the schema before migrating.');
 if(!/\bkind\s+TEXT\s+NOT NULL/i.test(original))extended=extended.replace(/CHECK\(\(kind\s*=/i,'CHECK(kind IS NULL OR (kind=');
 const create=extended.replace(/^(CREATE TABLE\s+)(?:"lesson_media_assets"|lesson_media_assets)(?=\s*\()/i,'$1lesson_media_assets_next');
 if(create===extended)throw Error('Unexpected table definition.');
 // Positional copying preserves each store's actual column order, nullability,
 // identity references, local indexes, fences and revision triggers.
 const objects=schema.filter(r=>['trigger','index'].includes(r.type)&&(r.sql||r.data)).map(r=>(r.sql||r.data)+';');
 return ['PRAGMA defer_foreign_keys = ON;',create+';','INSERT INTO lesson_media_assets_next SELECT * FROM lesson_media_assets;','DROP TABLE lesson_media_assets;','ALTER TABLE lesson_media_assets_next RENAME TO lesson_media_assets;',...objects,'PRAGMA defer_foreign_keys = OFF;',''].join('\n');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const [source,destination]=process.argv.slice(2);if(!source||!destination)throw Error('Usage: node tools/academy-session-video-migration.mjs schema.json migration.sql');
 const input=JSON.parse(await readFile(source,'utf8'));
 const schema=Array.isArray(input)&&input[0]?.results?input.flatMap(r=>r.results):input.results||input;
 await writeFile(destination,videoMigration(schema));console.log('Prepared attachment migration: '+destination);
}
