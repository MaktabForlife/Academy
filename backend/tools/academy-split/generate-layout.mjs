import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {cleanSchemas} from './schema.mjs';
import {DatabaseSync} from 'node:sqlite';
const source=JSON.parse(readFileSync(process.argv[2],'utf8')),schema=cleanSchemas(source.records.filter(r=>r.kind==='SCHEMA')),stores={};
for(const owner of ['core','admin']){const db=new DatabaseSync(':memory:');try{db.exec(schema[owner].tableSQL);db.exec(schema[owner].afterSQL);stores[owner]=Object.fromEntries(db.prepare("SELECT name FROM sqlite_schema WHERE type='table'").all().map(r=>[r.name,db.prepare('PRAGMA table_info('+r.name+')').all().map(c=>c.name)]));}finally{db.close();}}
const runtime=fileURLToPath(new URL('../../src/academy/separation/',import.meta.url));
writeFileSync(runtime+'layout.js','// Generated schema identifiers only; no record values or source connection.\nexport const sourceLayout={\n'+Object.entries(schema.layout).map(([name,info])=>' '+JSON.stringify(name)+':'+JSON.stringify(info)).join(',\n')+'\n};\n');
writeFileSync(runtime+'columns.js','// Physical target columns; Core facts are projected into Admin reads, not copied into its master rows.\nexport const storeColumns={\n'+Object.entries(stores).map(([owner,tables])=>' '+JSON.stringify(owner)+':{\n'+Object.entries(tables).map(([name,cols])=>'  '+JSON.stringify(name)+':'+JSON.stringify(cols)).join(',\n')+'\n }').join(',\n')+'\n};\n');
console.log(JSON.stringify({generatedSchemaIdentifiers:true,coreTables:Object.keys(stores.core).length,adminTables:Object.keys(stores.admin).length}));
